export const CLAIMS_PREFIX = "land_claims_";
export const SAFE_PREFIX = "land_claims_safe_";
export const CORRUPT_PREFIX = "land_claims_corrupt_";
export const CACHE_BUST_KEY = "land_claims_revision";
export const OLD_CLAIMS_KEY = "land_claims";
export const DEFAULT_CELL_SIZE = 16;
export const DEFAULT_MAX_CELLS_PER_CLAIM = 1024;

const toPositiveInteger = (value, fallback) =>
  Number.isInteger(value) && value > 0 ? value : fallback;

const normalizeDimension = (dimension) => dimension || "overworld";

const getCellKey = (x, z) => `${x}:${z}`;

const getClaimBounds = (claim) => {
  const pos1 = claim?.pos1;
  const pos2 = claim?.pos2;
  if (!pos1 || !pos2) return null;

  const minX = Number(claim._minX ?? Math.min(pos1.x, pos2.x));
  const maxX = Number(claim._maxX ?? Math.max(pos1.x, pos2.x));
  const minZ = Number(claim._minZ ?? Math.min(pos1.z, pos2.z));
  const maxZ = Number(claim._maxZ ?? Math.max(pos1.z, pos2.z));
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;

  const dimensions = [];
  if (claim._dim != null) dimensions.push(claim._dim);
  if (pos1.dimension != null && pos1.dimension !== claim._dim) {
    dimensions.push(pos1.dimension);
  }
  if (!dimensions.length) return null;

  return { minX, maxX, minZ, maxZ, dimensions };
};

const addRecord = (map, key, record) => {
  const records = map.get(key);
  if (records) records.push(record);
  else map.set(key, [record]);
};

const isWithinBounds = (record, x, z) => {
  const bounds = record.bounds;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
};

export function isActiveClaimPropertyKey(propId) {
  if (!propId || typeof propId !== "string") return false;
  if (!propId.startsWith(CLAIMS_PREFIX)) return false;
  if (propId === CACHE_BUST_KEY) return false;
  if (propId.startsWith(SAFE_PREFIX)) return false;
  if (propId.startsWith(CORRUPT_PREFIX)) return false;
  if (propId === OLD_CLAIMS_KEY) return false;
  if (propId.startsWith(`${OLD_CLAIMS_KEY}_backup_`)) return false;
  return true;
}

export function buildClaimSpatialIndex(claims, options = {}) {
  const cellSize = toPositiveInteger(options.cellSize, DEFAULT_CELL_SIZE);
  const maxCellsPerClaim = toPositiveInteger(
    options.maxCellsPerClaim,
    DEFAULT_MAX_CELLS_PER_CLAIM,
  );
  const cellsByDimension = new Map();
  const overflowByDimension = new Map();
  const sourceClaims = Array.isArray(claims) ? claims : [];

  for (let order = 0; order < sourceClaims.length; order++) {
    const claim = sourceClaims[order];
    const bounds = getClaimBounds(claim);
    if (!bounds) continue;

    const minCellX = Math.floor(bounds.minX / cellSize);
    const maxCellX = Math.floor(bounds.maxX / cellSize);
    const minCellZ = Math.floor(bounds.minZ / cellSize);
    const maxCellZ = Math.floor(bounds.maxZ / cellSize);
    const cellWidth = maxCellX - minCellX + 1;
    const cellDepth = maxCellZ - minCellZ + 1;
    const record = { claim, bounds, order };
    const canIndex =
      Number.isSafeInteger(cellWidth) &&
      Number.isSafeInteger(cellDepth) &&
      cellWidth > 0 &&
      cellDepth > 0 &&
      cellWidth <= maxCellsPerClaim &&
      cellDepth <= Math.floor(maxCellsPerClaim / cellWidth);

    for (const dimension of bounds.dimensions) {
      if (!canIndex) {
        addRecord(overflowByDimension, dimension, record);
        continue;
      }

      let dimensionCells = cellsByDimension.get(dimension);
      if (!dimensionCells) {
        dimensionCells = new Map();
        cellsByDimension.set(dimension, dimensionCells);
      }
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
          addRecord(dimensionCells, getCellKey(cellX, cellZ), record);
        }
      }
    }
  }

  return {
    revision: options.revision ?? "",
    cellSize,
    cellsByDimension,
    overflowByDimension,
  };
}

export function getRevisionAwareClaimIndex(currentIndex, claims, revision, options = {}) {
  const normalizedRevision = revision ?? "";
  if (currentIndex?.revision === normalizedRevision) return currentIndex;
  return buildClaimSpatialIndex(claims, { ...options, revision: normalizedRevision });
}

export function findIndexedClaim(index, location, dimension) {
  if (!index || !location || typeof location.x !== "number") return null;

  const x = Math.floor(location.x);
  const z = Math.floor(location.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

  const targetDimension = normalizeDimension(dimension);
  const cellX = Math.floor(x / index.cellSize);
  const cellZ = Math.floor(z / index.cellSize);
  const indexed = index.cellsByDimension.get(targetDimension)?.get(getCellKey(cellX, cellZ)) ?? [];
  const overflow = index.overflowByDimension.get(targetDimension) ?? [];
  let indexedPosition = 0;
  let overflowPosition = 0;

  while (indexedPosition < indexed.length || overflowPosition < overflow.length) {
    let record;
    if (overflowPosition >= overflow.length) {
      record = indexed[indexedPosition++];
    } else if (indexedPosition >= indexed.length) {
      record = overflow[overflowPosition++];
    } else if (indexed[indexedPosition].order < overflow[overflowPosition].order) {
      record = indexed[indexedPosition++];
    } else {
      record = overflow[overflowPosition++];
    }

    if (isWithinBounds(record, x, z)) return record.claim;
  }

  return null;
}
