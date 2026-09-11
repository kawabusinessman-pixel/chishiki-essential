import { system, world, ActionFormData } from "../../core.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { Lang } from "../../lib/Lang.js";
import { fadeCamera, requestTeleport } from "../../function/teleportManager.js";
import { sendAnnounce } from "../../function/announceTitle.js";

/**
 * Nama biome di lokasi, diformat jadi label title. Null kalau API gagal.
 *
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {import("@minecraft/server").Vector3} location
 * @returns {string|null}
 */
function getBiomeLabel(dimension, location) {
  try {
    if (typeof dimension.getBiome !== "function") return null;
    const biome = dimension.getBiome(location);
    const id = String(biome?.id || "").replace("minecraft:", "");
    if (!id) return null;
    return id
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  } catch {
    return null;
  }
}

/**
 * Hapus tickingarea loader RTP dengan aman (best effort).
 *
 * @param {Object} data - Entry antrian pencarian RTP.
 * @returns {void}
 */
function removeRtpArea(data) {
  try {
    if (data?.areaName) {
      getDimensionInstance(data.dimKey || "overworld")?.runCommand(`tickingarea remove ${data.areaName}`);
    }
  } catch { }
  try {
    if (data) data.areaName = undefined;
  } catch { }
}

/**
 * Pasang tickingarea di chunk kandidat biar chunk ter-load tanpa pindah player.
 * Batas Y mengikuti range dimensi (nether 0-127, overworld -64-320) supaya
 * command tidak ditolak.
 *
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {string} playerId
 * @param {number} x
 * @param {number} z
 * @param {Object} meta - Dimension metadata.
 * @returns {string|null} Nama tickingarea, atau null kalau gagal.
 */
function addRtpArea(dimension, playerId, x, z, meta) {
  try {
    const chunkX = Math.floor(x / 16) * 16;
    const chunkZ = Math.floor(z / 16) * 16;
    const areaName = `kiw_rtp_${playerId}`;
    const yMin = Math.max(-64, Math.floor(meta?.minY ?? -64));
    const yMax = Math.min(320, Math.ceil(meta?.maxY ?? 320));
    try {
      dimension.runCommand(`tickingarea remove ${areaName}`);
    } catch { }
    const result = dimension.runCommand(`tickingarea add ${chunkX} ${yMin} ${chunkZ} ${chunkX + 15} ${yMax} ${chunkZ + 15} ${areaName}`);
    if (result && typeof result === "object" && "successCount" in result && result.successCount === 0) return null;
    return areaName;
  } catch {
    return null;
  }
}

/**
 * Dimension metadata definition for random teleportation boundaries and staging altitudes.
 * @readonly
 */
const DIMENSION_METADATA = {
  overworld: {
    key: "overworld",
    dimensionId: "minecraft:overworld",
    allowKey: "allowOverworld",
    stagingY: 318,
    minY: -64,
    maxY: 319,
    label: "Overworld",
  },
  nether: {
    key: "nether",
    dimensionId: "minecraft:nether",
    allowKey: "allowNether",
    stagingY: 72,
    minY: 5,
    maxY: 120,
    label: "Nether",
  },
  the_end: {
    key: "the_end",
    dimensionId: "minecraft:the_end",
    allowKey: "allowTheEnd",
    stagingY: 64,
    minY: 1,
    maxY: 80,
    label: "The End",
  },
};

/**
 * Default RTP settings fallback.
 * @readonly
 */
const DEFAULT_RTP_CONFIG = {
  maxUses: 3,
  cooldownTime: 300,
  teleportDelay: 3,
  maxDistance: 1945,
  allowOverworld: true,
  allowNether: true,
  allowTheEnd: false,
};

const MAX_SEARCH_DISTANCE = 29999984;
const MAX_TELEPORT_DELAY = 60;
const MAX_COOLDOWN_SECONDS = 2592000;
const MAX_USES_LIMIT = 1000;
const MAX_SEARCH_ATTEMPTS = 8;
const MAX_NETHER_SEARCH_ATTEMPTS = 16;
const QUEUE_TICK_INTERVAL = 4;
const MAX_QUEUE_PROCESS_PER_TICK = 2;

/**
 * In-memory state maps
 */
const cooldownTimestamps = new Map();
const pendingTeleports = new Set();
const terrainSearchQueue = new Map();
const lastActionBarMessages = new Map();

let queueRunnerId = null;
let queueCursor = 0;

/**
 * Validates integer value within specified range.
 *
 * @param {*} value - Raw value to inspect.
 * @param {number} fallback - Default fallback if invalid.
 * @param {number} min - Minimum allowed integer.
 * @param {number} [max=1e9] - Maximum allowed integer.
 * @returns {number} Sanitized integer.
 */
function sanitizeInteger(value, fallback, min, max = 1e9) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isSafeInteger(Math.floor(num)) || Math.floor(num) < min) {
    return fallback;
  }
  return Math.min(Math.floor(num), max);
}

/**
 * Normalizes raw configuration object into a validated RTP configuration structure.
 *
 * @param {Object} rawConfig - Configuration to normalize.
 * @returns {typeof DEFAULT_RTP_CONFIG} Sanitized configuration.
 */
function normalizeRtpConfig(rawConfig = {}) {
  let parsed = rawConfig;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  if (typeof parsed !== "object" || !parsed) {
    parsed = {};
  }
  return {
    maxUses: sanitizeInteger(parsed.maxUses, DEFAULT_RTP_CONFIG.maxUses, 1, MAX_USES_LIMIT),
    cooldownTime: sanitizeInteger(parsed.cooldownTime, DEFAULT_RTP_CONFIG.cooldownTime, 0, MAX_COOLDOWN_SECONDS),
    maxDistance: sanitizeInteger(parsed.maxDistance, DEFAULT_RTP_CONFIG.maxDistance, 1, MAX_SEARCH_DISTANCE),
    teleportDelay: sanitizeInteger(parsed.teleportDelay, DEFAULT_RTP_CONFIG.teleportDelay, 0, MAX_TELEPORT_DELAY),
    allowOverworld: typeof parsed.allowOverworld === "boolean" ? parsed.allowOverworld : DEFAULT_RTP_CONFIG.allowOverworld,
    allowNether: typeof parsed.allowNether === "boolean" ? parsed.allowNether : DEFAULT_RTP_CONFIG.allowNether,
    allowTheEnd: typeof parsed.allowTheEnd === "boolean" ? parsed.allowTheEnd : DEFAULT_RTP_CONFIG.allowTheEnd,
  };
}

/**
 * Retrieves active RTP configuration from server storage with fallback.
 *
 * @returns {typeof DEFAULT_RTP_CONFIG} Active RTP settings.
 */
export function getRTPConfig() {
  try {
    const config = GlobalConfig.get("rtpConfig");
    if (config) return normalizeRtpConfig(config);
  } catch {}
  return { ...DEFAULT_RTP_CONFIG };
}

/**
 * Parses user input string into a recognized dimension key.
 *
 * @param {string} rawInput - Dimension name string.
 * @returns {"overworld"|"nether"|"the_end"|null} Dimension key or null if invalid.
 */
export function parseRtpDimension(rawInput) {
  if (rawInput == null || rawInput === "") return "overworld";
  const cleaned = String(rawInput).trim().toLowerCase().replace(/^minecraft:/, "");
  if (cleaned === "overworld" || cleaned === "ow" || cleaned === "world") return "overworld";
  if (cleaned === "nether" || cleaned === "hell") return "nether";
  if (cleaned === "the_end" || cleaned === "end" || cleaned === "theend") return "the_end";
  return null;
}

/**
 * Helper to get dimension metadata by key.
 *
 * @param {string} dimensionKey - Key identifier.
 * @returns {typeof DIMENSION_METADATA.overworld} Dimension metadata.
 */
function getDimensionMetadata(dimensionKey) {
  return DIMENSION_METADATA[dimensionKey] || DIMENSION_METADATA.overworld;
}

/**
 * Determines whether a player entity is valid and ready for interaction.
 *
 * @param {import("@minecraft/server").Player} player - Player entity.
 * @returns {boolean} True if player is valid.
 */
function isPlayerValid(player) {
  if (!player) return false;
  try {
    if (typeof player.isValid === "function") return player.isValid();
    if (typeof player.isValid === "boolean") return player.isValid;
    return !!player.location;
  } catch {
    return false;
  }
}

/**
 * Retrieves valid unexpired cooldown timestamps for a player.
 *
 * @param {string} playerId - Target player identifier.
 * @param {typeof DEFAULT_RTP_CONFIG} config - Active RTP configuration.
 * @param {number} [now=Date.now()] - Current epoch timestamp.
 * @returns {number[]} Array of active cooldown timestamps.
 */
function filterPlayerCooldowns(playerId, config, now = Date.now()) {
  const windowMs = config.cooldownTime * 1000;
  const timestamps = (cooldownTimestamps.get(playerId) || []).filter((timestamp) => now - timestamp < windowMs);
  if (timestamps.length === 0) {
    cooldownTimestamps.delete(playerId);
    return [];
  }
  cooldownTimestamps.set(playerId, timestamps);
  return timestamps;
}

/**
 * Sends a localized chat message or title to player safely.
 *
 * @param {import("@minecraft/server").Player} player - Target player.
 * @param {string} langKey - Language translation key.
 * @param {...*} args - Format arguments.
 * @returns {void}
 */
function sendTranslatedMessage(player, langKey, ...args) {
  try {
    const text = Lang.t(player, langKey, ...args);
    player.onScreenDisplay.setActionBar(text);
  } catch {}
}

/**
 * Sends an action bar message avoiding duplicate consecutive frames.
 *
 * @param {import("@minecraft/server").Player} player - Target player.
 * @param {string} message - Text message.
 * @returns {void}
 */
function sendThrottledActionBar(player, message) {
  const playerId = player?.id;
  if (playerId && lastActionBarMessages.get(playerId) === message) return;
  try {
    player.onScreenDisplay.setActionBar(message);
    if (playerId) lastActionBarMessages.set(playerId, message);
  } catch {}
}

/**
 * Retrieves native Dimension instance by dimension key.
 *
 * @param {string} dimensionKey - Key identifier.
 * @returns {import("@minecraft/server").Dimension|null} Dimension object.
 */
function getDimensionInstance(dimensionKey) {
  const meta = getDimensionMetadata(dimensionKey);
  try {
    return world.getDimension(meta.dimensionId.replace("minecraft:", ""));
  } catch {
    try {
      return world.getDimension(meta.dimensionId);
    } catch {
      return null;
    }
  }
}

/**
 * Applies protective temporary status effects upon teleportation landing.
 *
 * @param {import("@minecraft/server").Player} player - Target player entity.
 * @returns {void}
 */
function applyLandingProtection(player) {
  try {
    player.addEffect("slow_falling", 60, { amplifier: 0, showParticles: false });
    player.addEffect("resistance", 60, { amplifier: 4, showParticles: false });
    player.addEffect("fire_resistance", 100, { amplifier: 0, showParticles: false });
  } catch {}
}

/**
 * Clamps coordinate Y altitude within dimension bounds.
 *
 * @param {number} y - Coordinate Y.
 * @param {typeof DIMENSION_METADATA.overworld} meta - Dimension metadata.
 * @returns {number} Clamped altitude.
 */
function clampY(y, meta) {
  const rounded = Math.floor(Number(y));
  if (!Number.isFinite(rounded)) return meta.maxY;
  return Math.max(meta.minY, Math.min(meta.maxY, rounded));
}

/**
 * Generates random target X/Z coordinates within maximum configured radius.
 *
 * @param {typeof DEFAULT_RTP_CONFIG} config - Active RTP configuration.
 * @param {string} dimensionKey - Target dimension key.
 * @returns {{x: number, z: number}} Random coordinates.
 */
function generateRandomCoordinates(config, dimensionKey) {
  let distance = config.maxDistance;
  if (dimensionKey === "nether") distance = Math.max(64, Math.floor(distance / 8));
  if (dimensionKey === "the_end") distance = Math.min(distance, 12000);
  return {
    x: Math.floor(Math.random() * (2 * distance + 1)) - distance,
    z: Math.floor(Math.random() * (2 * distance + 1)) - distance,
  };
}

/**
 * Evaluates whether a block is permeable air or non-solid space.
 *
 * @param {import("@minecraft/server").Block} block - Block instance.
 * @returns {boolean} True if permeable.
 */
function isAirBlock(block) {
  if (!block) return false;
  if (block.isAir) return true;
  const typeId = block.typeId || "";
  return typeId === "minecraft:cave_air" || typeId === "minecraft:void_air" || typeId === "minecraft:light_block";
}

/**
 * Evaluates whether a block is solid obstacle.
 *
 * @param {import("@minecraft/server").Block} block - Block instance.
 * @returns {boolean} True if obstacle block.
 */
function isObstacleBlock(block) {
  if (!block) return false;
  return !isAirBlock(block) && !(block.isLiquid && !isLavaBlock(block));
}

/**
 * Evaluates whether a block is lava.
 *
 * @param {import("@minecraft/server").Block} block - Block instance.
 * @returns {boolean} True if lava.
 */
function isLavaBlock(block) {
  const typeId = block?.typeId || "";
  return typeId === "minecraft:lava" || typeId === "minecraft:flowing_lava";
}

/**
 * Evaluates whether a block is hazardous to stand on.
 *
 * @param {import("@minecraft/server").Block} block - Block instance.
 * @returns {boolean} True if hazardous.
 */
function isHazardousBlock(block) {
  if (!block) return true;
  const typeId = block.typeId || "";
  return (
    isLavaBlock(block) ||
    typeId === "minecraft:magma_block" ||
    typeId === "minecraft:cactus" ||
    typeId === "minecraft:fire" ||
    typeId === "minecraft:soul_fire" ||
    typeId === "minecraft:wither_rose"
  );
}

/**
 * Evaluates whether a block provides a safe solid footing.
 *
 * @param {import("@minecraft/server").Block} block - Block instance.
 * @returns {boolean} True if safe ground block.
 */
function isSafeGroundBlock(block) {
  if (!block) return false;
  if (isAirBlock(block) || block.isLiquid || isLavaBlock(block) || isHazardousBlock(block)) return false;
  return true;
}

/**
 * Scans downward for the top surface ground in Overworld.
 *
 * @param {import("@minecraft/server").Dimension} dimension - Dimension instance.
 * @param {number} x - Coordinate X.
 * @param {number} z - Coordinate Z.
 * @param {number} startY - Search origin Y.
 * @param {number} [minY=-64] - Minimum Y.
 * @param {number} [maxY=319] - Maximum Y.
 * @returns {number|null} Safe Y altitude or null if invalid.
 */
function findSurfaceFloor(dimension, x, z, startY, minY = -64, maxY = 319) {
  let y = Math.min(Math.floor(startY), maxY);
  if (!Number.isFinite(y)) y = maxY;

  let groundBlock = null;
  while (y >= minY) {
    const block = dimension.getBlock({ x, y, z });
    if (!block) return null;
    if (isObstacleBlock(block)) {
      groundBlock = block;
      break;
    }
    y--;
  }

  if (!groundBlock || y < minY || !isSafeGroundBlock(groundBlock)) return null;

  const floorY = y + 1;
  if (floorY > maxY || floorY < minY) return null;

  const feetBlock = dimension.getBlock({ x, y: floorY, z });
  const headBlock = dimension.getBlock({ x, y: floorY + 1, z });
  if (!feetBlock || !headBlock) return null;

  if (isObstacleBlock(feetBlock) || isObstacleBlock(headBlock) || isLavaBlock(feetBlock) || isLavaBlock(headBlock)) {
    return null;
  }
  return floorY;
}

/**
 * Scans for cave floor pocket (Nether / End).
 *
 * @param {import("@minecraft/server").Dimension} dimension - Dimension instance.
 * @param {number} x - Coordinate X.
 * @param {number} z - Coordinate Z.
 * @param {number} maxY - Search upper bound.
 * @param {number} minY - Search lower bound.
 * @returns {number|null} Safe Y altitude or null.
 */
function findCaveFloor(dimension, x, z, maxY, minY) {
  let isAreaLoaded = false;
  for (let testY = maxY; testY >= minY; testY -= 16) {
    if (dimension.getBlock({ x, y: testY, z })) {
      isAreaLoaded = true;
      break;
    }
  }
  if (!isAreaLoaded && !dimension.getBlock({ x, y: minY + 2, z })) return null;

  for (let y = maxY; y >= minY + 1; y--) {
    const belowBlock = dimension.getBlock({ x, y: y - 1, z });
    const feetBlock = dimension.getBlock({ x, y, z });
    const headBlock = dimension.getBlock({ x, y: y + 1, z });

    if (!belowBlock || !feetBlock || !headBlock) continue;
    if (!isAirBlock(feetBlock) || !isAirBlock(headBlock) || isLavaBlock(feetBlock) || isLavaBlock(headBlock)) continue;
    if (!isSafeGroundBlock(belowBlock)) continue;
    return y;
  }
  return null;
}

/**
 * Finds appropriate standing floor depending on dimension type.
 *
 * @param {import("@minecraft/server").Dimension} dimension - Dimension instance.
 * @param {string} dimensionKey - Dimension key.
 * @param {number} x - Coordinate X.
 * @param {number} z - Coordinate Z.
 * @param {number} stagingY - Altitude reference.
 * @param {typeof DIMENSION_METADATA.overworld} meta - Metadata.
 * @returns {number|null} Found Y or null.
 */
function findSafeFloor(dimension, dimensionKey, x, z, stagingY, meta) {
  if (dimensionKey === "nether" || dimensionKey === "the_end") {
    return findCaveFloor(dimension, x, z, meta.maxY, meta.minY);
  }
  return findSurfaceFloor(dimension, x, z, clampY(stagingY ?? meta.stagingY, meta), meta.minY, meta.maxY);
}

/**
 * Finds an open air pocket for initial chunk staging.
 *
 * @param {import("@minecraft/server").Dimension} dimension - Dimension instance.
 * @param {number} x - Coordinate X.
 * @param {number} z - Coordinate Z.
 * @param {typeof DIMENSION_METADATA.overworld} meta - Metadata.
 * @param {string} dimensionKey - Dimension key.
 * @returns {number} Staging Y.
 */
function findStagingAirPocket(dimension, x, z, meta, dimensionKey) {
  if (dimensionKey === "overworld") return meta.stagingY;
  for (let y = meta.maxY; y >= meta.minY + 2; y -= 2) {
    const feet = dimension.getBlock({ x, y, z });
    const head = dimension.getBlock({ x, y: y + 1, z });
    if (feet && head && isAirBlock(feet) && isAirBlock(head)) return y;
  }
  return meta.stagingY;
}

/**
 * Checks whether chunk terrain is loaded and accessible at given coordinates.
 *
 * @param {import("@minecraft/server").Dimension} dimension - Dimension instance.
 * @param {number} x - Coordinate X.
 * @param {number} z - Coordinate Z.
 * @param {typeof DIMENSION_METADATA.overworld} meta - Metadata.
 * @returns {boolean} True if chunk is loaded.
 */
function isChunkLoaded(dimension, x, z, meta) {
  const altitudes = [clampY(meta.stagingY, meta), clampY(meta.maxY, meta), 64, 128];
  for (const y of altitudes) {
    try {
      if (dimension.getBlock({ x, y, z })) return true;
    } catch {}
  }
  return false;
}

/**
 * Starts the terrain search queue interval runner.
 * @returns {void}
 */
function startQueueRunner() {
  if (queueRunnerId !== null) return;
  queueRunnerId = system.runInterval(() => {
    if (terrainSearchQueue.size === 0) {
      stopQueueRunner();
      return;
    }

    const entries = [...terrainSearchQueue.entries()];
    const total = entries.length;
    const batchSize = Math.min(MAX_QUEUE_PROCESS_PER_TICK, total);

    for (let i = 0; i < batchSize; i++) {
      const index = (queueCursor + i) % total;
      const [playerId, taskData] = entries[index];
      if (!terrainSearchQueue.has(playerId)) continue;
      try {
        processQueueEntry(playerId, taskData);
      } catch {
        removeRtpArea(taskData);
        terrainSearchQueue.delete(playerId);
      }
    }

    if (terrainSearchQueue.size === 0) {
      stopQueueRunner();
      return;
    }
    queueCursor = (queueCursor + batchSize) % Math.max(1, terrainSearchQueue.size);
  }, QUEUE_TICK_INTERVAL);
}

/**
 * Stops the terrain search queue interval runner.
 * @returns {void}
 */
function stopQueueRunner() {
  if (queueRunnerId !== null) {
    try {
      system.clearRun(queueRunnerId);
    } catch {}
    queueRunnerId = null;
  }
}

/**
 * Processes a single player's terrain scan task within the queue.
 *
 * @param {string} playerId - Target player ID.
 * @param {Object} data - Search state payload.
 * @returns {void}
 */
function processQueueEntry(playerId, data) {
  const player = isPlayerValid(data.player) ? data.player : [...world.getPlayers()].find((p) => p.id === playerId);
  data.player = player;

  if (!isPlayerValid(player)) {
    removeRtpArea(data);
    terrainSearchQueue.delete(playerId);
    return;
  }

  const dimensionKey = data.dimKey || "overworld";
  const meta = data.meta || getDimensionMetadata(dimensionKey);
  const dimension = getDimensionInstance(dimensionKey);

  if (!dimension) {
    removeRtpArea(data);
    terrainSearchQueue.delete(playerId);
    sendTranslatedMessage(player, "rtp.error");
    return;
  }

  const stagingY = clampY(meta.stagingY, meta);
  const blockX = Math.floor(data.loc.x);
  const blockZ = Math.floor(data.loc.z);

  if (!isChunkLoaded(dimension, blockX, blockZ, meta)) {
    data.loadWait = (data.loadWait || 0) + 1;
    if (data.loadWait > 75) {
      removeRtpArea(data);
      terrainSearchQueue.delete(playerId);
      sendTranslatedMessage(player, "rtp.error");
      return;
    }
    sendThrottledActionBar(player, "§7Loading terrain...");
    return;
  }

  const searchY = dimensionKey === "overworld" ? stagingY : clampY(data.loc.y, meta);
  const safeFloorY = findSafeFloor(dimension, dimensionKey, blockX, blockZ, searchY, meta);

  if (safeFloorY === null) {
    data.attempts = (data.attempts || 0) + 1;
    if (data.attempts >= (data.maxAttempts || MAX_SEARCH_ATTEMPTS)) {
      removeRtpArea(data);
      terrainSearchQueue.delete(playerId);
      sendTranslatedMessage(player, "rtp.error");
      return;
    }
    const currentConfig = data.cfg || getRTPConfig();
    const nextCoords = generateRandomCoordinates(currentConfig, dimensionKey);
    let nextY = stagingY;
    if (dimensionKey !== "overworld") {
      try {
        const airY = findStagingAirPocket(dimension, nextCoords.x, nextCoords.z, meta, dimensionKey);
        if (airY != null) nextY = airY;
      } catch {}
    }
    removeRtpArea(data);
    data.areaName = addRtpArea(dimension, playerId, nextCoords.x, nextCoords.z, meta);
    data.loadWait = 0;
    data.loc = { x: nextCoords.x, y: nextY, z: nextCoords.z };
    sendThrottledActionBar(player, "§7Finding safe ground...");
    return;
  }

  try {
    const feetBlock = dimension.getBlock({ x: blockX, y: safeFloorY, z: blockZ });
    const headBlock = dimension.getBlock({ x: blockX, y: safeFloorY + 1, z: blockZ });
    const floorBlock = dimension.getBlock({ x: blockX, y: safeFloorY - 1, z: blockZ });
    const isPassable =
      dimensionKey === "overworld"
        ? !isObstacleBlock(feetBlock) && !isObstacleBlock(headBlock) && !isLavaBlock(feetBlock) && !isLavaBlock(headBlock)
        : isAirBlock(feetBlock) && isAirBlock(headBlock);

    if (!isPassable || !isSafeGroundBlock(floorBlock)) {
      data.attempts = (data.attempts || 0) + 1;
      if (data.attempts >= (data.maxAttempts || MAX_SEARCH_ATTEMPTS)) {
        removeRtpArea(data);
        terrainSearchQueue.delete(playerId);
        sendTranslatedMessage(player, "rtp.error");
      } else {
        sendThrottledActionBar(player, "§7Finding safe ground...");
      }
      return;
    }

    try {
      fadeCamera(player, { fadeIn: 0.25, hold: 0.2, fadeOut: 0.35 });
    } catch {}
    player.teleport({ x: blockX + 0.5, y: safeFloorY, z: blockZ + 0.5 }, { dimension });
    removeRtpArea(data);
    applyLandingProtection(player);
    const biomeLabel = getBiomeLabel(dimension, { x: Math.floor(blockX), y: safeFloorY, z: Math.floor(blockZ) });
    if (biomeLabel) sendAnnounce(player, biomeLabel, "RANDOM TP");
    else sendAnnounce(player, "RANDOM TP");
    sendThrottledActionBar(player, Lang.t(player, "rtp.success", Math.round(blockX + 0.5), safeFloorY, Math.round(blockZ + 0.5)));
    try {
      player.playSound("mob.endermen.portal", { volume: 1, pitch: 1 });
    } catch {
      try {
        player.runCommand("playsound mob.endermen.portal @s ~ ~ ~ 1 1 1");
      } catch {}
    }
    terrainSearchQueue.delete(playerId);
  } catch {
    sendTranslatedMessage(player, "rtp.error");
    removeRtpArea(data);
    terrainSearchQueue.delete(playerId);
  }
}

/**
 * RTP instant: tickingarea me-load chunk kandidat, player tetap di tanah
 * sampai di-teleport sekali ke titik aman.
 *
 * @param {import("@minecraft/server").Player} player - Target player.
 * @param {Object} state - State verification payload.
 * @returns {Promise<void>}
 */
async function dispatchRandomTeleport(player, state) {
  const config = state.cfg;
  const playerId = state.key;
  const dimensionKey = state.dimKey || "overworld";
  const meta = state.meta || getDimensionMetadata(dimensionKey);
  const coords = generateRandomCoordinates(config, dimensionKey);
  const stagingY = clampY(meta.stagingY, meta);

  pendingTeleports.delete(playerId);
  const dimension = getDimensionInstance(dimensionKey);
  if (!dimension) {
    sendTranslatedMessage(player, "rtp.error");
    return;
  }

  try {
    let locY = stagingY;
    if (dimensionKey !== "overworld") {
      try {
        const airPocketY = findStagingAirPocket(dimension, coords.x, coords.z, meta, dimensionKey);
        if (airPocketY != null) locY = airPocketY;
      } catch { }
    }

    const areaName = addRtpArea(dimension, playerId, coords.x, coords.z, meta);
    terrainSearchQueue.set(playerId, {
      loc: { x: coords.x, y: locY, z: coords.z },
      cfg: config,
      attempts: 0,
      player,
      dimKey: dimensionKey,
      meta,
      maxAttempts: dimensionKey === "overworld" ? MAX_SEARCH_ATTEMPTS : MAX_NETHER_SEARCH_ATTEMPTS,
      areaName,
    });
    startQueueRunner();
    sendTranslatedMessage(player, "rtp.wait");
    cooldownTimestamps.set(playerId, [...state.timestamps, state.now]);
  } catch {
    terrainSearchQueue.delete(playerId);
    sendTranslatedMessage(player, "rtp.error");
  }
}

/**
 * Validasi cooldown, jalankan countdown (tanpa cancel gerak), lalu pencarian
 * tickingarea dan teleport instan ke titik aman.
 *
 * @param {import("@minecraft/server").Player} player - Target player.
 * @param {string} [dimensionKey="overworld"] - Dimension identifier.
 * @returns {void}
 */
function startRtpCountdown(player, dimensionKey = "overworld") {
  const config = getRTPConfig();
  const playerId = player?.id;
  const meta = getDimensionMetadata(dimensionKey);

  if (!isPlayerValid(player) || !playerId) {
    sendTranslatedMessage(player, "rtp.error");
    return;
  }
  if (!DIMENSION_METADATA[dimensionKey]) {
    sendTranslatedMessage(player, "rtp.dim_invalid");
    return;
  }
  if (!config[meta.allowKey]) {
    sendTranslatedMessage(player, "rtp.dim_disabled", meta.label);
    return;
  }
  if (pendingTeleports.has(playerId) || terrainSearchQueue.has(playerId)) {
    sendTranslatedMessage(player, "rtp.under");
    return;
  }

  const now = Date.now();
  const timestamps = filterPlayerCooldowns(playerId, config, now);
  if (timestamps.length >= config.maxUses) {
    const remainingSeconds = Math.ceil((config.cooldownTime * 1000 - (now - timestamps[0])) / 1000);
    sendTranslatedMessage(player, "rtp.cd", Math.max(0, remainingSeconds));
    return;
  }

  const state = {
    cfg: config,
    key: playerId,
    timestamps,
    now,
    remainingUses: config.maxUses - timestamps.length,
    dimKey: dimensionKey,
    meta,
  };

  pendingTeleports.add(playerId);
  requestTeleport(player, {
    type: "rtp",
    duration: typeof config.teleportDelay === "number" ? config.teleportDelay : undefined,
    announce: false,
    onComplete: () => {
      dispatchRandomTeleport(player, state).catch(() => {
        pendingTeleports.delete(playerId);
        sendTranslatedMessage(player, "rtp.error");
      });
    },
    onCancel: () => {
      pendingTeleports.delete(playerId);
      sendTranslatedMessage(player, "rtp.move");
    },
  });
}

/**
 * Displays the interactive Random Teleportation modal form.
 *
 * @param {import("@minecraft/server").Player} player - Target player entity.
 * @returns {void}
 */
export function random_tp(player) {
  const config = getRTPConfig();
  const playerId = player?.id;

  if (!isPlayerValid(player) || !playerId) {
    sendTranslatedMessage(player, "rtp.error");
    return;
  }
  if (pendingTeleports.has(playerId) || terrainSearchQueue.has(playerId)) {
    sendTranslatedMessage(player, "rtp.under");
    return;
  }

  const now = Date.now();
  const timestamps = filterPlayerCooldowns(playerId, config, now);
  if (timestamps.length >= config.maxUses) {
    const remaining = Math.ceil((config.cooldownTime * 1000 - (now - timestamps[0])) / 1000);
    sendTranslatedMessage(player, "rtp.cd", Math.max(0, remaining));
    return;
  }

  const dimensionButtons = [
    { key: "overworld", labelKey: "rtp.btn.overworld", icon: "textures/ui/world_glyph_color" },
    { key: "nether", labelKey: "rtp.btn.nether", icon: "textures/blocks/netherrack" },
    { key: "the_end", labelKey: "rtp.btn.end", icon: "textures/blocks/end_stone" },
  ];

  const remainingUses = config.maxUses - timestamps.length;
  const statusBadges = [
    config.allowOverworld ? "§aOW§7:ON" : "§7OW:OFF",
    config.allowNether ? "§cN§7:ON" : "§7N:OFF",
    config.allowTheEnd ? "§dEnd§7:ON" : "§7End:OFF",
  ].join(" §8· ");

  const form = new ActionFormData()
    .title(Lang.t(player, "rtp.title"))
    .body(Lang.t(player, "rtp.body", remainingUses, config.maxUses, config.maxDistance, config.teleportDelay || 3, statusBadges));

  for (const btn of dimensionButtons) {
    form.button(Lang.t(player, btn.labelKey), btn.icon);
  }
  form.divider();
  form.button(Lang.t(player, "rtp.btn.cancel"), "textures/ui/cancel");

  form
    .show(player)
    .then((response) => {
      if (response?.canceled) return;
      const selection = response.selection;
      if (selection == null || selection < 0 || selection >= dimensionButtons.length) return;
      const chosen = dimensionButtons[selection];
      if (chosen) startRtpCountdown(player, chosen.key);
    })
    .catch(() => sendTranslatedMessage(player, "rtp.error"));
}

/**
 * Initiates an immediate command-based RTP without opening the dialog menu.
 *
 * @param {import("@minecraft/server").Player} player - Target player.
 * @param {string} [dimension="overworld"] - Target dimension input.
 * @returns {void}
 */
export function random_tp_instant(player, dimension = "overworld") {
  const dimensionKey = parseRtpDimension(dimension);
  if (!dimensionKey) {
    system.run(() => sendTranslatedMessage(player, "rtp.dim_invalid"));
    return;
  }
  system.run(() => startRtpCountdown(player, dimensionKey));
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  const leftover = terrainSearchQueue.get(playerId);
  if (leftover) {
    removeRtpArea(leftover);
  }
  try {
    for (const key of Object.keys(DIMENSION_METADATA)) {
      getDimensionInstance(key)?.runCommand(`tickingarea remove kiw_rtp_${playerId}`);
    }
  } catch { }
  pendingTeleports.delete(playerId);
  terrainSearchQueue.delete(playerId);
  lastActionBarMessages.delete(playerId);
  cooldownTimestamps.delete(playerId);
  if (terrainSearchQueue.size === 0) stopQueueRunner();
});
