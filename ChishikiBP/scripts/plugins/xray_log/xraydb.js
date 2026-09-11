import { world } from "../../core";
const DB_KEYS = {
 LOGS_META: "xray_logs_meta",
 LOGS_CHUNK: "xray_logs_chunk_",
 ORE_CONFIG: "xray_ore_config",
 SYSTEM_STATE: "xray_system_state"
};
const CONFIG = {
 MAX_CHUNK_SIZE: 30000, 
 MAX_LOGS_PER_CHUNK: 100,
 MAX_TOTAL_LOGS: 500, 
 AUTO_CLEAN_HOURS: 12 
};
const DEFAULT_ORE_CONFIG = {
 "minecraft:diamond_ore": true,
 "minecraft:deepslate_diamond_ore": true,
 "minecraft:ancient_debris": true,
 "minecraft:emerald_ore": true,
 "minecraft:deepslate_emerald_ore": true,
 "minecraft:gold_ore": true,
 "minecraft:deepslate_gold_ore": true,
 "minecraft:iron_ore": true,
 "minecraft:deepslate_iron_ore": true
};
function getSystemState() {
 try {
 const state = world.getDynamicProperty(DB_KEYS.SYSTEM_STATE);
 return state === "1";
 } catch (error) {
 console.warn("[XRayDB] Error getting system state:", error);
 return false;
 }
}
function setSystemState(enabled) {
 try {
 world.setDynamicProperty(DB_KEYS.SYSTEM_STATE, enabled ? "1" : "0");
 } catch (error) {
 console.warn("[XRayDB] Error setting system state:", error);
 }
}
function getLogsMeta() {
 try {
 const meta = world.getDynamicProperty(DB_KEYS.LOGS_META);
 if (!meta) {
 const defaultMeta = { chunkCount: 0, totalLogs: 0, lastClean: Date.now() };
 world.setDynamicProperty(DB_KEYS.LOGS_META, JSON.stringify(defaultMeta));
 return defaultMeta;
 }
 return JSON.parse(meta);
 } catch (error) {
 console.warn("[XRayDB] Error getting logs meta:", error);
 return { chunkCount: 0, totalLogs: 0, lastClean: Date.now() };
 }
}
function saveLogsMeta(meta) {
 try {
 world.setDynamicProperty(DB_KEYS.LOGS_META, JSON.stringify(meta));
 } catch (error) {
 console.warn("[XRayDB] Error saving logs meta:", error);
 }
}
function getAllLogs() {
 try {
 const meta = getLogsMeta();
 const allLogs = [];
 for (let i = 0; i < meta.chunkCount; i++) {
 const chunkKey = DB_KEYS.LOGS_CHUNK + i;
 const chunkData = world.getDynamicProperty(chunkKey);
 if (chunkData) {
 const chunk = JSON.parse(chunkData);
 allLogs.push(...chunk);
 }
 }
 return allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
 } catch (error) {
 console.warn("[XRayDB] Error getting logs:", error);
 return [];
 }
}
function saveAllLogs(logs) {
 try {
 const oldMeta = getLogsMeta();
 for (let i = 0; i < oldMeta.chunkCount; i++) {
 const chunkKey = DB_KEYS.LOGS_CHUNK + i;
 world.setDynamicProperty(chunkKey, undefined);
 }
 const chunks = [];
 for (let i = 0; i < logs.length; i += CONFIG.MAX_LOGS_PER_CHUNK) {
 chunks.push(logs.slice(i, i + CONFIG.MAX_LOGS_PER_CHUNK));
 }
 for (let i = 0; i < chunks.length; i++) {
 const chunkKey = DB_KEYS.LOGS_CHUNK + i;
 const chunkData = JSON.stringify(chunks[i]);
 if (chunkData.length > CONFIG.MAX_CHUNK_SIZE) {
 console.warn(`[XRayDB] Chunk ${i} too large, truncating`);
 const truncatedChunk = chunks[i].slice(0, Math.floor(chunks[i].length / 2));
 world.setDynamicProperty(chunkKey, JSON.stringify(truncatedChunk));
 } else {
 world.setDynamicProperty(chunkKey, chunkData);
 }
 }
 const newMeta = {
 chunkCount: chunks.length,
 totalLogs: logs.length,
 lastClean: oldMeta.lastClean || Date.now()
 };
 saveLogsMeta(newMeta);
 } catch (error) {
 console.warn("[XRayDB] Error saving logs:", error);
 }
}
function getOreConfig() {
 try {
 const config = world.getDynamicProperty(DB_KEYS.ORE_CONFIG);
 if (!config) {
 world.setDynamicProperty(DB_KEYS.ORE_CONFIG, JSON.stringify(DEFAULT_ORE_CONFIG));
 return DEFAULT_ORE_CONFIG;
 }
 return JSON.parse(config);
 } catch (error) {
 console.warn("[XRayDB] Error getting ore config:", error);
 return DEFAULT_ORE_CONFIG;
 }
}
function saveOreConfig(config) {
 try {
 world.setDynamicProperty(DB_KEYS.ORE_CONFIG, JSON.stringify(config));
 } catch (error) {
 console.warn("[XRayDB] Error saving ore config:", error);
 }
}
function addLog(logEntry) {
 try {
 const logs = getAllLogs();
 const compressedLog = {
 p: logEntry.player,
 o: logEntry.ore.replace("minecraft:", ""), 
 l: [logEntry.location.x, logEntry.location.y, logEntry.location.z], 
 d: logEntry.dimension.replace("minecraft:", ""), 
 t: logEntry.timestamp,
 id: Date.now().toString()
 };
 logs.unshift(compressedLog); 
 if (logs.length > CONFIG.MAX_TOTAL_LOGS) {
 logs.splice(CONFIG.MAX_TOTAL_LOGS); 
 }
 const meta = getLogsMeta();
 const hoursSinceClean = (Date.now() - meta.lastClean) / (1000 * 60 * 60);
 if (hoursSinceClean >= CONFIG.AUTO_CLEAN_HOURS) {
 cleanOldLogs(CONFIG.AUTO_CLEAN_HOURS);
 } else {
 saveAllLogs(logs);
 }
 } catch (error) {
 console.warn("[XRayDB] Error adding log:", error);
 }
}
function getPlayerLogs(playerName) {
 const logs = getAllLogs();
 return logs
 .filter(log => (log.player || log.p) === playerName)
 .map(decompressLog);
}
function decompressLog(log) {
 if (log.player) return log; 
 return {
 player: log.p,
 ore: log.o.includes(":") ? log.o : "minecraft:" + log.o,
 location: {
 x: log.l[0],
 y: log.l[1],
 z: log.l[2]
 },
 dimension: log.d.includes(":") ? log.d : "minecraft:" + log.d,
 timestamp: log.t,
 id: log.id
 };
}
function addTargetOre(oreName) {
 const config = getOreConfig();
 config[oreName] = true;
 saveOreConfig(config);
}
function removeTargetOre(oreName) {
 const config = getOreConfig();
 delete config[oreName];
 saveOreConfig(config);
}
function getTargetOres() {
 return Object.keys(getOreConfig());
}
function cleanOldLogs(maxAgeInHours = CONFIG.AUTO_CLEAN_HOURS) {
 try {
 const logs = getAllLogs();
 const now = Date.now();
 const maxAge = maxAgeInHours * 60 * 60 * 1000;
 const filteredLogs = logs.filter(log => {
 const logTime = new Date(log.timestamp || log.t).getTime();
 return (now - logTime) < maxAge;
 });
 const meta = getLogsMeta();
 meta.lastClean = now;
 saveLogsMeta(meta);
 saveAllLogs(filteredLogs);
 const removedCount = logs.length - filteredLogs.length;
 if (removedCount > 0) {
 console.log(`[XRayDB] Cleaned ${removedCount} old logs, ${filteredLogs.length} remaining`);
 }
 return filteredLogs.length;
 } catch (error) {
 console.warn("[XRayDB] Error cleaning logs:", error);
 return 0;
 }
}
function getDatabaseStats() {
 try {
 const meta = getLogsMeta();
 const logs = getAllLogs();
 return {
 totalLogs: logs.length,
 chunkCount: meta.chunkCount,
 lastClean: new Date(meta.lastClean),
 oldestLog: logs.length > 0 ? new Date(logs[logs.length - 1].timestamp || logs[logs.length - 1].t) : null,
 newestLog: logs.length > 0 ? new Date(logs[0].timestamp || logs[0].t) : null
 };
 } catch (error) {
 console.warn("[XRayDB] Error getting stats:", error);
 return { totalLogs: 0, chunkCount: 0, lastClean: new Date(), oldestLog: null, newestLog: null };
 }
}
function getAllLogsDecompressed() {
 try {
 const meta = getLogsMeta();
 const allLogs = [];
 for (let i = 0; i < meta.chunkCount; i++) {
 const chunkKey = DB_KEYS.LOGS_CHUNK + i;
 const chunkData = world.getDynamicProperty(chunkKey);
 if (chunkData) {
 const chunk = JSON.parse(chunkData);
 allLogs.push(...chunk);
 }
 }
 return allLogs
 .sort((a, b) => new Date(b.timestamp || b.t) - new Date(a.timestamp || a.t))
 .map(decompressLog);
 } catch (error) {
 console.warn("[XRayDB] Error getting decompressed logs:", error);
 return [];
 }
}
export {
 getAllLogsDecompressed as getAllLogs,
 addLog,
 getPlayerLogs,
 addTargetOre,
 removeTargetOre,
 getTargetOres,
 getOreConfig,
 cleanOldLogs,
 getSystemState,
 setSystemState,
 getDatabaseStats
};
