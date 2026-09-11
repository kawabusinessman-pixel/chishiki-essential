export const XRAY_CONFIG = {
 DATABASE: {
 MAX_CHUNK_SIZE: 30000, 
 MAX_LOGS_PER_CHUNK: 100, 
 MAX_TOTAL_LOGS: 500, 
 AUTO_CLEAN_HOURS: 12, 
 CLEAN_INTERVAL_TICKS: 216000 
 },
 PERFORMANCE: {
 ENABLE_SOUND_NOTIFICATIONS: true, 
 SOUND_VOLUME: 0.5, 
 SOUND_PITCH: 1.2, 
 MAX_NOTIFICATION_RATE: 5, 
 BATCH_PROCESS_SIZE: 50 
 },
 UI: {
 MAX_LOCATIONS_DISPLAY: 25, 
 ITEMS_PER_PAGE: 10, 
 ENABLE_ICONS: true, 
 COMPACT_MODE: false 
 },
 SECURITY: {
 ADMIN_TAG: "admin", 
 VIEWER_TAG: "xray.viewer", 
 LOG_ADMIN_ACTIONS: true, 
 REQUIRE_OP_FOR_CONFIG: true 
 },
 DEFAULT_ORES: {
 "minecraft:diamond_ore": {
 enabled: true,
 priority: "high",
 icon: "textures/items/diamond"
 },
 "minecraft:deepslate_diamond_ore": {
 enabled: true,
 priority: "high",
 icon: "textures/items/diamond"
 },
 "minecraft:ancient_debris": {
 enabled: true,
 priority: "critical",
 icon: "textures/items/netherite_ingot"
 },
 "minecraft:emerald_ore": {
 enabled: true,
 priority: "high",
 icon: "textures/items/emerald"
 },
 "minecraft:deepslate_emerald_ore": {
 enabled: true,
 priority: "high",
 icon: "textures/items/emerald"
 },
 "minecraft:gold_ore": {
 enabled: true,
 priority: "medium",
 icon: "textures/items/gold_ingot"
 },
 "minecraft:deepslate_gold_ore": {
 enabled: true,
 priority: "medium",
 icon: "textures/items/gold_ingot"
 },
 "minecraft:iron_ore": {
 enabled: false,
 priority: "low",
 icon: "textures/items/iron_ingot"
 },
 "minecraft:deepslate_iron_ore": {
 enabled: false,
 priority: "low",
 icon: "textures/items/iron_ingot"
 }
 }
};
export function getOrePriorityColor(priority) {
 switch (priority) {
 case "critical": return "§c";
 case "high": return "§6";
 case "medium": return "§e";
 case "low": return "§7";
 default: return "§f";
 }
}
export function getFormattedOreName(oreId) {
 const oreConfig = XRAY_CONFIG.DEFAULT_ORES[oreId];
 const baseName = oreId
 .replace("minecraft:", "")
 .split("_")
 .map(word => word.charAt(0).toUpperCase() + word.slice(1))
 .join(" ");
 if (oreConfig) {
 const color = getOrePriorityColor(oreConfig.priority);
 return `${color}${baseName}§r`;
 }
 return baseName;
}
export function shouldMonitorOre(oreId) {
 const oreConfig = XRAY_CONFIG.DEFAULT_ORES[oreId];
 return oreConfig ? oreConfig.enabled : false;
}
export function getOreIcon(oreId) {
 const oreConfig = XRAY_CONFIG.DEFAULT_ORES[oreId];
 if (oreConfig && oreConfig.icon) {
 return oreConfig.icon;
 }
 if (oreId.includes("diamond")) return "textures/items/diamond";
 if (oreId.includes("emerald")) return "textures/items/emerald";
 if (oreId.includes("gold")) return "textures/items/gold_ingot";
 if (oreId.includes("iron")) return "textures/items/iron_ingot";
 if (oreId.includes("ancient_debris")) return "textures/items/netherite_ingot";
 return "textures/ui/icon_book_writable";
}
export function validateConfig() {
 try {
 if (!XRAY_CONFIG.DATABASE || !XRAY_CONFIG.PERFORMANCE) {
 return false;
 }
 if (XRAY_CONFIG.DATABASE.MAX_TOTAL_LOGS <= 0) {
 return false;
 }
 if (XRAY_CONFIG.DATABASE.AUTO_CLEAN_HOURS <= 0) {
 return false;
 }
 return true;
 } catch (error) {
 console.warn("[XRayConfig] Configuration validation failed:", error);
 return false;
 }
}
