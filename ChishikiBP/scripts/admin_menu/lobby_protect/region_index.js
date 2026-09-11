export const getRegionBounds = (region) => ({
 minX: Math.min(region.pos1.x, region.pos2.x),
 maxX: Math.max(region.pos1.x, region.pos2.x),
 minY: Math.min(region.pos1.y, region.pos2.y),
 maxY: Math.max(region.pos1.y, region.pos2.y),
 minZ: Math.min(region.pos1.z, region.pos2.z),
 maxZ: Math.max(region.pos1.z, region.pos2.z),
});

export const normalizeRegionDimensionId = (dimensionId) => {
 if (!dimensionId) return null;
 const value = String(dimensionId);
 return value.split(":")[1] || value;
};

const hasValidBounds = (bounds) =>
 Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX) &&
 Number.isFinite(bounds.minY) && Number.isFinite(bounds.maxY) &&
 Number.isFinite(bounds.minZ) && Number.isFinite(bounds.maxZ);

const contains = (bounds, position) =>
 position.x >= bounds.minX && position.x <= bounds.maxX &&
 position.y >= bounds.minY && position.y <= bounds.maxY &&
 position.z >= bounds.minZ && position.z <= bounds.maxZ;

const cellKey = (dimensionId, x, z) => `${dimensionId}:${x}:${z}`;

const append = (map, key, descriptor) => {
 let values = map.get(key);
 if (!values) {
  values = [];
  map.set(key, values);
 }
 values.push(descriptor);
};

export function buildRegionIndex(regions, options = {}) {
 const cellSize = Number.isFinite(options.cellSize) && options.cellSize > 0 ? Math.max(1, Math.floor(options.cellSize)) : 32;
 const maxCellsPerRegion = Number.isFinite(options.maxCellsPerRegion) && options.maxCellsPerRegion > 0
  ? Math.floor(options.maxCellsPerRegion)
  : 4096;
 const index = { cellSize, cells: new Map(), oversized: new Map(), all: [] };
 if (!Array.isArray(regions)) return index;

 for (let order = 0; order < regions.length; order++) {
  const region = regions[order];
  if (!region?.pos1 || !region?.pos2) continue;
  const bounds = region.bounds || getRegionBounds(region);
  const descriptor = {
   region,
   bounds,
   dimensions: Array.isArray(region.dims) ? region.dims : [],
   order,
  };
  index.all.push(descriptor);
  if (!hasValidBounds(bounds)) continue;

  const minCellX = Math.floor(bounds.minX / cellSize);
  const maxCellX = Math.floor(bounds.maxX / cellSize);
  const minCellZ = Math.floor(bounds.minZ / cellSize);
  const maxCellZ = Math.floor(bounds.maxZ / cellSize);
  const cellsWide = maxCellX - minCellX + 1;
  const cellsDeep = maxCellZ - minCellZ + 1;
  const indexedCellCount = cellsWide * cellsDeep;
  const dimensions = new Set(descriptor.dimensions);

  for (const dimensionId of dimensions) {
   if (indexedCellCount > maxCellsPerRegion) {
    append(index.oversized, dimensionId, descriptor);
    continue;
   }
   for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
     append(index.cells, cellKey(dimensionId, cellX, cellZ), descriptor);
    }
   }
  }
 }
 return index;
}

export function findIndexedRegion(index, position, dimensionId = null) {
 if (!index || !position) return null;
 const dimension = normalizeRegionDimensionId(dimensionId);
 if (!dimension) {
  for (let i = 0; i < index.all.length; i++) {
   const descriptor = index.all[i];
   if (contains(descriptor.bounds, position)) return descriptor.region;
  }
  return null;
 }

 const cellX = Math.floor(position.x / index.cellSize);
 const cellZ = Math.floor(position.z / index.cellSize);
 const cellCandidates = index.cells.get(cellKey(dimension, cellX, cellZ)) || [];
 const oversizedCandidates = index.oversized.get(dimension) || [];
 let cellCursor = 0;
 let oversizedCursor = 0;

 while (cellCursor < cellCandidates.length || oversizedCursor < oversizedCandidates.length) {
  const cellCandidate = cellCandidates[cellCursor];
  const oversizedCandidate = oversizedCandidates[oversizedCursor];
  let descriptor;
  if (!oversizedCandidate || (cellCandidate && cellCandidate.order < oversizedCandidate.order)) {
   descriptor = cellCandidate;
   cellCursor++;
  } else {
   descriptor = oversizedCandidate;
   oversizedCursor++;
  }
  if (contains(descriptor.bounds, position)) return descriptor.region;
 }
 return null;
}
