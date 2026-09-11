import { world, ActionFormData, ModalFormData } from "../../core";
import { showMainMenu } from "../../kiwora";
const GAMERULES = [
 { key: "commandBlockOutput", def: true, label: "Command Block Output", type: "toggle" },
 { key: "commandBlocks", def: true, label: "Command Blocks", type: "toggle" },
 { key: "pvp", def: true, label: "PvP", type: "toggle" },
 { key: "showCoordinates", def: true, label: "Show Coordinates", type: "toggle" },
 { key: "naturalRegeneration", def: true, label: "Natural Regeneration", type: "toggle" },
 { key: "tntExplodes", def: true, label: "TNT Explodes", type: "toggle" },
 { key: "sendCommandFeedback", def: true, label: "Command Feedback", type: "toggle" },
 { key: "keepInventory", def: false, label: "Keep Inventory", type: "toggle" },
 { key: "doMobSpawning", def: true, label: "Mob Spawning", type: "toggle" },
 { key: "doMobLoot", def: true, label: "Mob Loot", type: "toggle" },
 { key: "doTileDrops", def: true, label: "Block Drops", type: "toggle" },
 { key: "doDaylightCycle", def: true, label: "Day/Night Cycle", type: "toggle" },
 { key: "doWeatherCycle", def: true, label: "Weather Cycle", type: "toggle" },
 { key: "doImmediateRespawn", def: false, label: "Immediate Respawn", type: "toggle" },
 { key: "showDeathMessages", def: true, label: "Death Messages", type: "toggle" },
 { key: "playersSleepingPercentage", def: 100, label: "Players Sleeping Percentage", type: "slider", min: 0, max: 100 },
 { key: "doFireTick", def: true, label: "Fire Tick", type: "toggle" },
 { key: "freezeDamage", def: true, label: "Freeze Damage", type: "toggle" },
 { key: "drowningDamage", def: true, label: "Drowning Damage", type: "toggle" },
 { key: "fallDamage", def: true, label: "Fall Damage", type: "toggle" },
 { key: "fireDamage", def: true, label: "Fire Damage", type: "toggle" },
 { key: "doInsomnia", def: true, label: "Insomnia", type: "toggle" },
 { key: "showTags", def: true, label: "Show Tags", type: "toggle" },
 { key: "functionCommandLimit", def: 10000, label: "Function Command Limit", type: "slider", min: 1, max: 10000 },
 { key: "maxCommandChainLength", def: 65536, label: "Command Chain Length", type: "slider", min: 1, max: 65536 },
 { key: "randomTickSpeed", def: 1, label: "Random Tick Speed", type: "slider", min: 0, max: 10 },
 { key: "spawnRadius", def: 5, label: "Spawn Radius", type: "slider", min: 0, max: 10 },
 { key: "showBorderEffect", def: true, label: "Show Border Effect", type: "toggle" },
];
const DEFAULT_CONFIG = Object.fromEntries(GAMERULES.map(g => [g.key, g.def]));
function getConfig() {
 try {
 const config = {};
 for (const g of GAMERULES) {
 if (g.key === "commandBlocks") {
 config[g.key] = world.gameRules.commandBlocksEnabled;
 } else {
 config[g.key] = world.gameRules[g.key];
 }
 }
 return config;
 } catch (error) {
 console.warn("Error loading gamerule configuration:", error);
 return { ...DEFAULT_CONFIG };
 }
}
function updateGamerule(source, config) {
 try {
 for (const g of GAMERULES) {
 if (g.key === "commandBlocks") {
 world.gameRules.commandBlocksEnabled = config[g.key];
 } else {
 world.gameRules[g.key] = config[g.key];
 }
 }
 source.sendMessage("§a✔ Gamerule settings updated successfully!");
 return true;
 } catch (error) {
 console.warn("Error updating gamerules:", error);
 source.sendMessage("§c✘ Failed to update gamerule settings!");
 return false;
 }
}
export function gamerule(source) {
 const config = getConfig();
 const summary = [
 "commandBlockOutput",
 "commandBlocks",
 "pvp",
 "showCoordinates",
 "naturalRegeneration",
 "tntExplodes",
 "keepInventory",
 "doMobSpawning"
 ].map(k => `§f• ${GAMERULES.find(g => g.key === k).label}: ${config[k] ? "§aEnabled" : "§cDisabled"}`).join("\n");
 const menu = new ActionFormData()
 .title("§fGamerule Settings")
 .body(
 "§fCurrent Status:\n" + summary +
 "\n§fAnd more...\n\n§fSelect an option:"
 )
 .button("§fConfigure Gamerules\n§fModify world settings", "textures/ui/icon_recipe_nature")
 .button("Back", "textures/ui/arrow_left");
 menu.show(source).then(response => {
 if (!response.canceled) {
 if (response.selection === 0) {
 showGameruleSettings(source);
 } else {
 showMainMenu(source);
 }
 }
 });
}
function showGameruleSettings(source) {
 const config = getConfig();
 let form = new ModalFormData().title("§fGamerule Settings");
 for (const g of GAMERULES) {
 if (g.type === "toggle") {
 form = form.toggle(`§f${g.label}`, { defaultValue: config[g.key] });
 } else if (g.type === "slider") {
 form = form.slider(`§f${g.label}`, g.min, g.max, { defaultValue: config[g.key], valueStep: 1 });
 }
 }
 form.show(source).then(response => {
 if (!response.canceled) {
 const newConfig = {};
 let idx = 0;
 for (const g of GAMERULES) {
 newConfig[g.key] = response.formValues[idx++];
 }
 updateGamerule(source, newConfig);
 }
 });
}