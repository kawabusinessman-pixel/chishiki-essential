import { world } from "../../core.js";
import { rankDefault } from "../../plugins/ranks/rank_default.js";
import { buildRegionIndex, findIndexedRegion } from "./region_index.js";
const KEYS = {
 CONFIG: "lobby_protection_config",
 REGIONS: "lobby_protected_regions",
 REGION_PREFIX: "lobby_region_"
};

const stripLegacyProtectionKeys = (config) => {
 if (!config || Array.isArray(config)) return config;
 const { liquidProtection, fluidFlowProtection, ...cleanConfig } = config;
 return cleanConfig;
};

const BASE_PROTECTION = {
 regionMode: "lobby",
 blockBreakProtection: true,
 blockPlaceProtection: true,
 interactionProtection: true,
 interactiveBlocksProtection: true,
	farmlandProtection: true,
 itemUseProtection: true,
 antiBowProtection: true,
 pvpProtection: true,
 damageProtection: true,
 mobSpawnProtection: true,
 explosionProtection: true,
 visualizeOnEnter: true,
 notifyOnEnter: true,
 playSounds: true,
 showParticles: true,
 fireProtection: true,
 adventureModeEnabled: false,
 antiFly: false,
 antiSpamEnabled: true,
 antiSpamCooldown: 2,
 adminBypassEnabled: true,
 adminTag: "admin",
 allowedRanks: [],
 protectedDimensions: ["overworld", "nether"],
 excludedEntities: [
 "minecraft:player", "minecraft:npc", "minecraft:egg", "minecraft:item",
 "minecraft:arrow", "minecraft:experience_bottle", "minecraft:enderman",
 "minecraft:ender_dragon", "minecraft:end_crystal",
 "xp_orb", "minecraft:painting", "add:floating_text", "add:*", "sr:*"
 ],
 excludedBlocks: [],
 maxPlayersPerBatch: 20,
 regionCacheDuration: 2000,
 effectBatchSize: 20,
 particleBatchSize: 15,
 teleportBatchSize: 10,
 cleanupInterval: 500,
 messageBatchSize: 25,
 entitySpawnBatchSize: 30
};
const DEFAULTS = {
 main: Object.freeze({
 enabled: true,
 fireSpreadProtection: true,
 itemDropProtection: true,
 lobbyInventoryEnabled: false,
 maxPlayersPerBatch: 20,
 regionCacheDuration: 2000,
 effectBatchSize: 20,
 particleBatchSize: 15,
 teleportBatchSize: 10,
 cleanupInterval: 500,
 messageBatchSize: 25,
 entitySpawnBatchSize: 30,
 performanceMonitoring: true,
 highPlayerThreshold: 50,
 ...BASE_PROTECTION
 }),
 region: Object.freeze({
 ...BASE_PROTECTION,
 maxParticlesPerVisualization: 50,
 particleStep: 8,
 batchProcessingEnabled: true,
 maxPlayersPerBatch: 20,
 regionCacheDuration: 2000,
 effectBatchSize: 20,
 particleBatchSize: 15,
 teleportBatchSize: 10,
 cleanupInterval: 500,
 messageBatchSize: 25,
 entitySpawnBatchSize: 30,
 lobbyInventoryEnabled: false
 })
};
const parseJSON = (str, fallback) => {
 try { return JSON.parse(str) || fallback; }
 catch { return fallback; }
};
const CONFIG_CACHE_TTL = 10000;
const configCache = new Map();
let regionsDataCache = null;
let regionsDataCacheTime = 0;
let protectedRegionRevision = 0;
const saveConfig = (key, config) => {
 try {
  world.setDynamicProperty(key, JSON.stringify(stripLegacyProtectionKeys(config)));
  configCache.delete(key);
  cachedRegions = null;
  cachedRegionIndex = null;
  protectedRegionRevision++;
  return true;
 } catch { return false; }
};
const loadConfig = (key, defaults) => {
 const now = Date.now();
 const cached = configCache.get(key);
 if (cached && now - cached.time < CONFIG_CACHE_TTL) return cached.value;
 const saved = world.getDynamicProperty(key);
 const value = saved ? { ...defaults, ...stripLegacyProtectionKeys(parseJSON(saved, {})) } : { ...defaults };
 configCache.set(key, { value, time: now });
 return value;
};
export const getLobbyConfig = () => loadConfig(KEYS.CONFIG, DEFAULTS.main);
export const saveLobbyConfig = (config) => saveConfig(KEYS.CONFIG, config);
export const getProtectedRegions = () => {
 const now = Date.now();
 if (regionsDataCache && now - regionsDataCacheTime < CONFIG_CACHE_TTL) return regionsDataCache;
 const parsed = parseJSON(world.getDynamicProperty(KEYS.REGIONS), []);
 regionsDataCache = Array.isArray(parsed) ? parsed : [];
 regionsDataCacheTime = now;
 return regionsDataCache;
};
export const saveProtectedRegions = (regions) => {
 	cachedRegions = null;
	cachedRegionIndex = null;
 	regionsDataCache = null;
	regionsDataCacheTime = 0;
	return saveConfig(KEYS.REGIONS, regions);
};
export const isLobbyProtectionEnabled = () => getLobbyConfig().enabled === true;
export const getProtectedRegionRevision = () => protectedRegionRevision;
export const getRegionConfig = (regionId) => {
	const key = `${KEYS.REGION_PREFIX}${regionId}_config`;
	const config = loadConfig(key, DEFAULTS.region);
	if (typeof config.entityInteractionProtection === "boolean") config.interactionProtection = config.entityInteractionProtection;
	if (typeof config.restrictedItemsProtection === "boolean") config.itemUseProtection = config.restrictedItemsProtection;
	if (!config.regionMode) config.regionMode = config.pvpMode === "pvp" ? "pvp" : "lobby";
	if (config.regionMode === "pvp") {
		if (config.pvpProtection !== false) config.pvpProtection = false;
		if (config.damageProtection !== false) config.damageProtection = false;
	}
	return config;
};
export const getRegionMode = (regionId) => getRegionConfig(regionId).regionMode || "lobby";
export const isPvpRegion = (regionId) => getRegionMode(regionId) === "pvp";
export const getPvpRegions = () => getProtectedRegions().filter(r => isPvpRegion(r.id));
export const getLobbyRegions = () => getProtectedRegions().filter(r => !isPvpRegion(r.id));
export const saveRegionConfig = (regionId, config) => {
 const key = `${KEYS.REGION_PREFIX}${regionId}_config`;
 return saveConfig(key, config);
};
const RANK_PREFIX = "rank:";
const stripColorCodes = (value) => String(value || "").replace(/§./g, "");
export const normalizeAllowedRanks = (ranks) => {
 if (!Array.isArray(ranks)) return [];
 const result = [];
 const seen = new Set();
 for (const rawRank of ranks) {
 const rank = String(rawRank || "").startsWith(RANK_PREFIX)
 ? String(rawRank).slice(RANK_PREFIX.length)
 : String(rawRank || "");
 if (!rank) continue;
 const key = rank.toLowerCase();
 if (seen.has(key)) continue;
 seen.add(key);
 result.push(rank);
 }
 return result;
};
const parseDynamicArray = (propertyId) => {
 try {
 const raw = world.getDynamicProperty(propertyId);
 const parsed = raw ? JSON.parse(raw) : [];
 return Array.isArray(parsed) ? parsed : [];
 } catch {
 return [];
 }
};
const parseDynamicObject = (propertyId) => {
 try {
 const raw = world.getDynamicProperty(propertyId);
 const parsed = raw ? JSON.parse(raw) : {};
 return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
 } catch {
 return {};
 }
};
const getFallbackLobbyRank = () => {
 const rankKeys = Object.keys(rankDefault.ranks || {});
 const memberRank = rankKeys.find((key) => rankDefault.ranks[key]?.name === "Member");
 return normalizeAllowedRanks([memberRank || rankKeys[0]])[0] || "";
};
export const getAvailableLobbyRanks = () => {
 const ranks = [];
 const pushRank = (rank) => {
 const normalized = normalizeAllowedRanks([rank])[0];
 if (!normalized) return;
 if (ranks.some((entry) => entry.rank.toLowerCase() === normalized.toLowerCase())) return;
 ranks.push({ rank: normalized, label: getLobbyRankLabel(normalized) });
 };
 Object.keys(rankDefault.ranks || {}).forEach(pushRank);
 parseDynamicArray("customRankList").forEach(pushRank);
 Object.keys(parseDynamicObject("customRanks")).forEach(pushRank);
 return ranks;
};
export const getLobbyRankLabel = (rank) => {
 const normalized = normalizeAllowedRanks([rank])[0] || "";
 const key = `${RANK_PREFIX}${normalized}`;
 const customRanks = parseDynamicObject("customRanks");
 const info =
 rankDefault.ranks?.[key] ||
 rankDefault.ranks?.[key.toLowerCase()] ||
 customRanks[key] ||
 customRanks[key.toLowerCase()];
 const name = stripColorCodes(info?.name || normalized);
 return name && name !== normalized ? `${name} (${normalized})` : normalized;
};
export const getPlayerLobbyRank = (player) => {
 const rankTag = player?.getTags?.().find((tag) => tag.startsWith(RANK_PREFIX));
 if (rankTag) return rankTag.slice(RANK_PREFIX.length);
 try {
 return world.getDynamicProperty("defaultRank") || getFallbackLobbyRank();
 } catch {
 return getFallbackLobbyRank();
 }
};
export const isPlayerRankAllowed = (player, config) => {
 const allowedRanks = normalizeAllowedRanks(config?.allowedRanks);
 if (!allowedRanks.length) return true;
 const playerRank = String(getPlayerLobbyRank(player) || "").toLowerCase();
 return allowedRanks.some((rank) => rank.toLowerCase() === playerRank);
};
let cachedRegions = null;
let cachedRegionIndex = null;
let cachedRegionsTime = 0;
const REGION_CACHE_DURATION = 5000;
const computeBounds = (r) => ({
	minX: Math.min(r.pos1.x, r.pos2.x),
	maxX: Math.max(r.pos1.x, r.pos2.x),
	minY: Math.min(r.pos1.y, r.pos2.y),
	maxY: Math.max(r.pos1.y, r.pos2.y),
	minZ: Math.min(r.pos1.z, r.pos2.z),
	maxZ: Math.max(r.pos1.z, r.pos2.z),
});
export const isInProtectedRegion = (position, dimensionId = null) => {
	const now = Date.now();
	if (!cachedRegions || !cachedRegionIndex || now - cachedRegionsTime > REGION_CACHE_DURATION) {
		cachedRegions = getProtectedRegions().map(r => {
			const regConf = getRegionConfig(r.id);
			return {
				...r,
				bounds: computeBounds(r),
				dims: regConf.protectedDimensions || ["overworld", "nether"]
			};
		});
		cachedRegionIndex = buildRegionIndex(cachedRegions);
		cachedRegionsTime = now;
	}
	return findIndexedRegion(cachedRegionIndex, position, dimensionId);
};
const regexCache = new Map();
const PROTECTED_PROJECTILE_ENTITY_IDS = new Set(["minecraft:thrown_trident", "minecraft:trident"]);
const matchesExcludedType = (typeId, list) => {
	if (PROTECTED_PROJECTILE_ENTITY_IDS.has(typeId)) return true;
	if (!list?.length) return false;
	if (list.includes(typeId)) return true;
	return list.some((excludedType) => {
		if (excludedType.includes("*")) {
			let regex = regexCache.get(excludedType);
			if (!regex) {
				regex = new RegExp(excludedType.replace(/\*/g, ".*"));
				regexCache.set(excludedType, regex);
			}
			return regex.test(typeId);
		}
		return (
			typeId.includes(excludedType) ||
			typeId.split(":")[1]?.includes(excludedType.split(":")[1] || excludedType)
		);
	});
};
const matchesExcludedBlock = (typeId, list) => {
	if (!list?.length || !typeId) return false;
	const id = String(typeId).toLowerCase();
	return list.some((raw) => {
		const excluded = String(raw || "").trim().toLowerCase();
		if (!excluded || excluded === "*") return false;
		if (excluded.includes("*")) {
			let regex = regexCache.get(`block:${excluded}`);
			if (!regex) {
				regex = new RegExp(`^${excluded.replace(/\*/g, ".*")}$`);
				regexCache.set(`block:${excluded}`, regex);
			}
			return regex.test(id);
		}
		return id === excluded;
	});
};
{
	const sample = ["minecraft:chest", "crates:*"];
	if (
		!matchesExcludedBlock("minecraft:chest", sample) ||
		!matchesExcludedBlock("crates:xyz", sample) ||
		matchesExcludedBlock("minecraft:stone", sample) ||
		matchesExcludedBlock("minecraft:chest", ["*"])
	) {
		console.warn("[lobby_protect] excludedBlocks matcher self-check failed");
	}
}
export const isEntityExcluded = (entityTypeId, regionId = null) => {
	const config = regionId ? getRegionConfig(regionId) : getLobbyConfig();
	return matchesExcludedType(entityTypeId, config.excludedEntities);
};
export const isBlockExcluded = (blockTypeId, regionId = null) => {
	const config = regionId ? getRegionConfig(regionId) : getLobbyConfig();
	return matchesExcludedBlock(blockTypeId, config.excludedBlocks);
};
export const isValidEntityTypeId = (entityTypeId) =>
 typeof entityTypeId === 'string' && /^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$|^[a-zA-Z0-9_]+$/.test(entityTypeId);
export const isValidBlockTypeId = (blockTypeId) =>
 typeof blockTypeId === "string" && /^[a-z0-9_]+:[a-z0-9_]+$/.test(blockTypeId);
export const isValidBlockExcludePattern = (value) => {
 const v = String(value || "").trim().toLowerCase();
 if (!v || v === "*" || v === "minecraft:") return false;
 if (v.includes("*")) return /^[a-z0-9_]+:[a-z0-9_*]+$/.test(v);
 return isValidBlockTypeId(v);
};
export const getSuggestedEntityExclusions = () => [
 'minecraft:player', 'minecraft:npc', 'minecraft:villager', 'minecraft:item',
 'minecraft:experience_orb', 'minecraft:arrow', 'minecraft:wind_charge_projectile', 'minecraft:breeze_wind_charge_projectile', 'minecraft:egg', 'minecraft:enderman',
 'minecraft:ender_dragon', 'minecraft:end_crystal',
 'minecraft:painting', 'minecraft:*projectile*', 'minecraft:*particle*', 'custom:*', 'addon:*',
 '*item*', '*projectile*', '*particle*', 'minecraft:boat', 'minecraft:minecart',
 'minecraft:armor_stand', 'minecraft:item_frame', 'minecraft:glow_item_frame',
 'add:floating_text', 'add:*', 'sr:*'
];
export const defaultLobbyConfig = DEFAULTS.main;
export const getPerformanceStats = () => {
 const players = world.getPlayers();
 const regions = getProtectedRegions();
 const playerCount = players.length;
 return {
 playerCount,
 regionCount: regions.length,
 isHighLoad: playerCount > 50,
 recommendedBatchSize: playerCount > 100 ? 25 : playerCount > 50 ? 20 : 15,
 recommendedCacheDuration: playerCount > 100 ? 3000 : 2000,
 performanceLevel: playerCount > 100 ? 'HIGH' : playerCount > 50 ? 'MEDIUM' : 'LOW',
 estimatedCapacity: playerCount > 100 ? '100-200 players' : playerCount > 50 ? '50-100 players' : '20-50 players'
 };
};
