import { ActionFormData, ModalFormData, world, system } from "../../core.js";
import { addLog, getOreConfig, cleanOldLogs, getAllLogs, getPlayerLogs, addTargetOre, removeTargetOre, getTargetOres, getSystemState, setSystemState, getDatabaseStats } from "./xraydb.js";
import { autoMigrate } from "./migration.js";
import { rateLimiter, TimeFormatter } from "./utils.js";
import { getOreIcon } from "./config.js";
const CONSTANTS = {
 TAGS: {
 VIEWER: "xray.viewer",
 ADMIN: "xray.admin"
 },
 CONFIG: {
 MAX_LOGS: 500,
 CLEAN_INTERVAL: 216000,
 DEFAULT_CLEAN_AGE: 12,
 SYSTEM_TAG: "admin"
 },
 ICONS: {
 MENU: "textures/ui/icon_recipe_nature",
 LOG: "textures/ui/icon_book_writable",
 CONFIG: "textures/ui/icon_setting",
 PLAYER: "textures/ui/icon_multiplayer",
 ADD: "textures/ui/button_custom/Object-7ce37",
 REMOVE: "textures/ui/icon_trash",
 BACK: "textures/ui/arrow_left",
 TAG: "textures/ui/permissions_member_star",
 STATS: "textures/ui/feedIcon",
 TIME: "textures/ui/timer",
 DIAMOND: "textures/items/diamond",
 EMERALD: "textures/items/emerald",
 GOLD: "textures/items/gold_ingot",
 IRON: "textures/items/iron_ingot",
 ENABLE: "textures/ui/toggle_on",
 DISABLE: "textures/ui/toggle_off",
 TELEPORT: "textures/ui/glyph_realms"
 }
};
let targetOres = {};
system.run(async () => {
 try {
 await autoMigrate();
 targetOres = await getOreConfig();
 isSystemEnabled = getSystemState();
 console.log("[XRay] System initialized successfully");
 } catch (error) {
 console.warn("[XRay] Initialization error:", error);
 }
});
const playerMiningData = new Map();
const icons = {
 menu: "textures/ui/icon_recipe_nature",
 log: "textures/ui/icon_book_writable",
 config: "textures/ui/icon_setting",
 player: "textures/ui/icon_multiplayer",
 add: "textures/ui/icon_add",
 remove: "textures/ui/icon_trash",
 back: "textures/ui/arrow_left",
 tag: "textures/ui/permissions_member_star",
 stats: "textures/ui/icon_chart_rows",
 time: "textures/ui/timer",
 diamond: "textures/items/diamond",
 emerald: "textures/items/emerald",
 gold: "textures/items/gold_ingot",
 iron: "textures/items/iron_ingot"
};
let isSystemEnabled = false;
function hasXrayAccess(player) {
 return player.getTags().some(tag => tag.startsWith(CONSTANTS.CONFIG.SYSTEM_TAG));
}
function teleportToLoggedPlayer(player, targetName) {
 const target = world.getAllPlayers().find(candidate => candidate.name === targetName);
 if (!target) {
 player.sendMessage(`§c${targetName} is offline and cannot be teleported to.`);
 return false;
 }
 try {
 player.teleport(target.location, { dimension: target.dimension, rotation: target.getRotation() });
 player.sendMessage(`§aTeleported to §f${target.name}§a.`);
 return true;
 } catch (error) {
 console.warn("[XRay] Teleport error:", error);
 player.sendMessage("§cUnable to teleport to that player.");
 return false;
 }
}
function showXrayMenu(player) {
 if (!hasXrayAccess(player)) {
 player.sendMessage("§cYou don't have access to the XRay logging system!");
 return;
 }
 const currentState = getSystemState();
 const stats = getDatabaseStats();
 const menu = new ActionFormData().simpleUi()
 .title("XRay Logging System")
 .body(`§eSystem Status: ${currentState ? "§aEnabled" : "§cDisabled"}§r\n§7Database: §f${stats.totalLogs}§7 logs in §f${stats.chunkCount}§7 chunks\n§7Select an option to manage mining activity logs:`);
 menu.button("View All Logs\n§8Check mining activities", CONSTANTS.ICONS.LOG);
 menu.button("Player Logs\n§8Search by player", CONSTANTS.ICONS.PLAYER);
 if (player.hasTag(CONSTANTS.TAGS.ADMIN) || player.hasTag("admin")) {
 menu.button("Database Stats\n§8View storage information", CONSTANTS.ICONS.STATS);
 menu.button("Ore Configuration\n§8Manage detected ores", CONSTANTS.ICONS.CONFIG);
 menu.button("Tag Management\n§8Manage player access", CONSTANTS.ICONS.TAG);
 }
 menu.show(player).then(response => {
 if (response.canceled) return;
 switch (response.selection) {
 case 0:
 showAllLogs(player);
 break;
 case 1:
 showPlayerList(player);
 break;
 case 2:
 if (player.hasTag(CONSTANTS.TAGS.ADMIN) || player.hasTag("admin")) {
 showDatabaseStats(player);
 }
 break;
 case 3:
 if (player.hasTag(CONSTANTS.TAGS.ADMIN) || player.hasTag("admin")) {
 showOreConfig(player);
 }
 break;
 case 4:
 if (player.hasTag(CONSTANTS.TAGS.ADMIN) || player.hasTag("admin")) {
 showTagManagement(player);
 }
 break;
 }
 }).catch(error => {
 console.warn("[XRay] Menu error:", error);
 player.sendMessage("§cAn error occurred while opening the menu.");
 });
}
function showPlayerList(player) {
 system.run(async () => {
 try {
 const logs = await getAllLogs();
 const players = new Set(logs.map(log => log.player));
 const playerArray = Array.from(players);
 if (playerArray.length === 0) {
 player.sendMessage("§eNo player logs found!");
 showXrayMenu(player);
 return;
 }
 const menu = new ActionFormData().simpleUi()
 .title("Player Logs")
 .body(`§eSelect a player to view their mining logs:`);
 playerArray.forEach(playerName => {
 menu.button(`${playerName}\n§8View mining activity`, CONSTANTS.ICONS.PLAYER);
 });
 menu.button("Back to Main Menu", CONSTANTS.ICONS.BACK);
 const response = await menu.show(player);
 if (response.canceled) {
 showXrayMenu(player);
 return;
 }
 if (response.selection < playerArray.length) {
 const selectedPlayer = playerArray[response.selection];
 const playerLogs = await getPlayerLogs(selectedPlayer);
 await showPlayerMiningDetails(player, selectedPlayer, playerLogs);
 } else {
 showXrayMenu(player);
 }
 } catch (error) {
 console.warn("[XRay] Error showing player list:", error);
 player.sendMessage("§cTerjadi kesalahan saat memuat daftar pemain.");
 showXrayMenu(player);
 }
 });
}
function showAllLogs(player) {
 system.run(async () => {
 try {
 const logs = await getAllLogs();
 if (!logs || logs.length === 0) {
 player.sendMessage("§eNo mining logs recorded yet!");
 showXrayMenu(player);
 return;
 }
 const playerLogs = new Map();
 const logsLength = logs.length;
 for (let i = 0; i < logsLength; i++) {
 const log = logs[i];
 if (!playerLogs.has(log.player)) {
 playerLogs.set(log.player, {
 logs: [],
 lastMining: new Date(log.timestamp),
 oreCount: 0
 });
 }
 const playerData = playerLogs.get(log.player);
 playerData.logs.push(log);
 playerData.oreCount++;
 const logDate = new Date(log.timestamp);
 if (logDate > playerData.lastMining) {
 playerData.lastMining = logDate;
 }
 }
 const menu = new ActionFormData().simpleUi()
 .title("XRay Logs")
 .body(`§eThere are §f${logs.length}§e logs from §f${playerLogs.size}§e players:\n`);
 const sortedPlayers = Array.from(playerLogs.entries())
 .sort((a, b) => b[1].lastMining - a[1].lastMining);
 const sortedPlayersLength = sortedPlayers.length;
 for (let i = 0; i < sortedPlayersLength; i++) {
 const [playerName, data] = sortedPlayers[i];
 const timeAgo = getTimeAgo(data.lastMining);
 menu.button(
 `§l${playerName}§r\n§8${data.oreCount} ores • Last active: ${timeAgo}`,
 CONSTANTS.ICONS.PLAYER
 );
 }
 menu.button("Back to Main Menu\n§8Return to XRay menu", CONSTANTS.ICONS.BACK);
 const response = await menu.show(player);
 if (response.canceled) {
 showXrayMenu(player);
 return;
 }
 if (response.selection < sortedPlayers.length) {
 const selectedPlayer = sortedPlayers[response.selection][0];
 const playerData = sortedPlayers[response.selection][1];
 await showPlayerMiningDetails(player, selectedPlayer, playerData.logs);
 } else {
 showXrayMenu(player);
 }
 } catch (error) {
 console.warn("[XRay] Error showing logs:", error);
 player.sendMessage("§cTerjadi kesalahan saat memuat log.");
 showXrayMenu(player);
 }
 });
}
async function showPlayerMiningDetails(player, targetPlayer, logs) {
 try {
 const oreStats = {};
 const logsLength = logs.length;
 for (let i = 0; i < logsLength; i++) {
 const log = logs[i];
 if (!oreStats[log.ore]) {
 oreStats[log.ore] = {
 count: 0,
 locations: [],
 lastMined: null
 };
 }
 oreStats[log.ore].count++;
 oreStats[log.ore].locations.push(log);
 const miningTime = new Date(log.timestamp);
 if (!oreStats[log.ore].lastMined || miningTime > oreStats[log.ore].lastMined) {
 oreStats[log.ore].lastMined = miningTime;
 }
 }
 const menu = new ActionFormData().simpleUi()
 .title(`Player: ${targetPlayer}`)
 .body(`§eMining Activity Summary:\n§7Total Ores: §f${logs.length}\n§7Last Active: §f${getTimeAgo(new Date(logs[0]?.timestamp || Date.now()))}\n`);
 const sortedOres = Object.entries(oreStats)
 .sort((a, b) => b[1].lastMined - a[1].lastMined);
 const sortedOresLength = sortedOres.length;
 for (let i = 0; i < sortedOresLength; i++) {
 const [ore, stats] = sortedOres[i];
 menu.button(
 `${formatOreName(ore)}\n§8${stats.count} mined • Last: ${getTimeAgo(stats.lastMined)}`,
 getOreIcon(ore)
 );
 }
 const targetIsOnline = world.getAllPlayers().some(candidate => candidate.name === targetPlayer);
 menu.button(
 targetIsOnline ? `Teleport to ${targetPlayer}\n§8Go to this player` : `Player Offline\n§8${targetPlayer} is not online`,
 CONSTANTS.ICONS.TELEPORT
 );
 menu.button("Back to Log List\n§8Return to player selection", CONSTANTS.ICONS.BACK);
 const response = await menu.show(player);
 if (response.canceled) {
 showAllLogs(player);
 return;
 }
 if (response.selection < sortedOres.length) {
 const selectedOre = sortedOres[response.selection][0];
 const selectedStats = sortedOres[response.selection][1];
 await showOreDetails(player, targetPlayer, selectedOre, selectedStats.locations);
 } else if (response.selection === sortedOres.length) {
 teleportToLoggedPlayer(player, targetPlayer);
 await showPlayerMiningDetails(player, targetPlayer, logs);
 } else {
 showAllLogs(player);
 }
 } catch (error) {
 player.sendMessage("§cTerjadi kesalahan saat memuat detail pemain.");
 showAllLogs(player);
 }
}
async function showOreDetails(player, targetPlayer, ore, locations) {
 try {
 const menu = new ActionFormData().simpleUi()
 .title(`${formatOreName(ore)}`)
 .body(`§e${targetPlayer}'s mining locations:\n§7Total: §f${locations.length} blocks\n`);
 locations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
 const maxLocations = Math.min(25, locations.length);
 for (let i = 0; i < maxLocations; i++) {
 const log = locations[i];
 const timeAgo = getTimeAgo(new Date(log.timestamp));
 menu.button(
 `§l[${log.location.x}, ${log.location.y}, ${log.location.z}]§r\n§8${timeAgo}`,
 getOreIcon(ore)
 );
 }
 menu.button("Back to Player Summary\n§8Return to ore list", CONSTANTS.ICONS.BACK);
 const response = await menu.show(player);
 if (response.canceled || response.selection === locations.length) {
 const allPlayerLogs = await getPlayerLogs(targetPlayer);
 await showPlayerMiningDetails(player, targetPlayer, allPlayerLogs);
 }
 } catch (error) {
 console.warn("[XRay] Error showing ore details:", error);
 player.sendMessage("§cTerjadi kesalahan saat memuat detail ore.");
 const allPlayerLogs = await getPlayerLogs(targetPlayer);
 await showPlayerMiningDetails(player, targetPlayer, allPlayerLogs);
 }
}
function formatPlayerStats(playerName, stats) {
 let oreList = '';
 const ores = Object.entries(stats.ores);
 const oresLength = ores.length;
 for (let i = 0; i < oresLength; i++) {
 const [ore, count] = ores[i];
 oreList += `§7• ${formatOreName(ore)}: §f${count}\n`;
 }
 return `§e${playerName}'s Mining Statistics§r\n` +
 `§7Total Ores Mined: §f${stats.totalOres}\n` +
 `§7Last Activity: §f${getTimeAgo(stats.lastMining)}\n\n` +
 `§eOre Breakdown:§r\n${oreList}\n\n` +
 `§8Select an ore type to view mining locations`;
}
function formatOreName(ore) {
 return ore
 .replace("minecraft:", "")
 .split("_")
 .map(word => word.charAt(0).toUpperCase() + word.slice(1))
 .join(" ");
}
function getTimeAgo(date) {
 return TimeFormatter.getTimeAgo(date);
}
async function showOreConfig(player) {
 if (!player.hasTag(CONSTANTS.TAGS.ADMIN) && !player.hasTag("admin")) {
 player.sendMessage("§cYou don't have permission to access this menu!");
 return;
 }
 const menu = new ActionFormData().simpleUi()
 .title("Ore Configuration")
 .body("§eManage which ores are monitored:")
 .button("Add Ore\n§8Add new ore to monitor", CONSTANTS.ICONS.ADD)
 .button("Remove Ore\n§8Stop monitoring an ore", CONSTANTS.ICONS.REMOVE)
 .button("View List\n§8See monitored ores", CONSTANTS.ICONS.LOG)
 .button("Back\n§8Return to main menu", CONSTANTS.ICONS.BACK);
 menu.show(player).then(response => {
 if (!response || response.canceled) {
 showXrayMenu(player);
 return;
 }
 switch (response.selection) {
 case 0:
 showAddOre(player);
 break;
 case 1:
 showRemoveOre(player);
 break;
 case 2:
 showOreList(player);
 break;
 case 3:
 showXrayMenu(player);
 break;
 }
 });
}
async function showAddOre(player) {
 const form = new ModalFormData()
 .title("Add Ore")
 .textField("§eEnter ore ID:\n§7Example: minecraft:diamond_ore", "Ore ID");
 form.show(player).then(async response => {
 if (!response || response.canceled) {
 showOreConfig(player);
 return;
 }
 const oreName = response.formValues[0];
 if (!oreName) {
 player.sendMessage("§cPlease enter a valid ore ID!");
 showOreConfig(player);
 return;
 }
 await addTargetOre(oreName);
 targetOres = await getOreConfig();
 player.sendMessage(`§aAdded §f${oreName}§a to monitoring list!`);
 showOreConfig(player);
 });
}
async function showRemoveOre(player) {
 const ores = await getTargetOres();
 if (ores.length === 0) {
 player.sendMessage("§cNo ores are currently being monitored!");
 showOreConfig(player);
 return;
 }
 const form = new ModalFormData()
 .title("Remove Ore")
 .dropdown("§eSelect ore to remove:", ores);
 form.show(player).then(async response => {
 if (!response || response.canceled) {
 showOreConfig(player);
 return;
 }
 const selectedOre = ores[response.formValues[0]];
 await removeTargetOre(selectedOre);
 targetOres = await getOreConfig();
 player.sendMessage(`§aRemoved §f${selectedOre}§a from monitoring list!`);
 showOreConfig(player);
 });
}
async function showOreList(player) {
 const ores = await getTargetOres();
 const menu = new ActionFormData().simpleUi()
 .title("Monitored Ores")
 .body(`§eThere are §f${ores.length}§e ores being monitored:\n\n§7${ores.join("\n§7")}`)
 .button("Back", CONSTANTS.ICONS.BACK);
 menu.show(player).then(() => {
 showOreConfig(player);
 });
}
function showDatabaseStats(player) {
 if (!player.hasTag(CONSTANTS.TAGS.ADMIN) && !player.hasTag("admin")) {
 player.sendMessage("§cYou don't have permission to access this menu!");
 return;
 }
 const stats = getDatabaseStats();
 const timeAgo = stats.lastClean ? getTimeAgo(stats.lastClean) : "Never";
 const oldestLog = stats.oldestLog ? getTimeAgo(stats.oldestLog) : "None";
 const newestLog = stats.newestLog ? getTimeAgo(stats.newestLog) : "None";
 const menu = new ActionFormData().simpleUi()
 .title("Database Statistics")
 .body([
 "§eXRay Database Information:§r",
 "",
 `§7Total Logs: §f${stats.totalLogs}`,
 `§7Storage Chunks: §f${stats.chunkCount}`,
 `§7Last Cleanup: §f${timeAgo}`,
 `§7Oldest Log: §f${oldestLog}`,
 `§7Newest Log: §f${newestLog}`,
 "",
 "§6Database is automatically optimized to prevent overflow"
 ].join("\n"))
 .button("Clean Old Logs\n§8Remove logs older than 12 hours", CONSTANTS.ICONS.TIME)
 .button("Back\n§8Return to main menu", CONSTANTS.ICONS.BACK);
 menu.show(player).then(response => {
 if (!response || response.canceled) {
 showXrayMenu(player);
 return;
 }
 switch (response.selection) {
 case 0:
 system.run(async () => {
 const remaining = await cleanOldLogs(CONSTANTS.CONFIG.DEFAULT_CLEAN_AGE);
 player.sendMessage(`§aDatabase cleaned! §f${remaining}§a logs remaining.`);
 showDatabaseStats(player);
 });
 break;
 case 1:
 showXrayMenu(player);
 break;
 }
 });
}
function showTagManagement(player) {
 if (!player.hasTag(CONSTANTS.TAGS.ADMIN) && !player.hasTag("admin")) {
 player.sendMessage("§cYou don't have permission to access this menu!");
 return;
 }
 const currentState = getSystemState();
 const menu = new ActionFormData().simpleUi()
 .title("Tag Management")
 .body(`§eManage player access to XRay logs:\n§7System Status: ${currentState ? "§aEnabled" : "§cDisabled"}§r`)
 .button(`${currentState ? "Disable" : "Enable"} XRay System\n§8Toggle system status`, currentState ? CONSTANTS.ICONS.DISABLE : CONSTANTS.ICONS.ENABLE)
 .button("Add Admin\n§8Grant admin access", CONSTANTS.ICONS.ADD)
 .button("Remove Admin\n§8Revoke admin access", CONSTANTS.ICONS.REMOVE)
 .button("View Access List\n§8Check player permissions", CONSTANTS.ICONS.LOG)
 .button("Back\n§8Return to main menu", CONSTANTS.ICONS.BACK);
 menu.show(player).then(response => {
 if (!response || response.canceled) {
 showXrayMenu(player);
 return;
 }
 switch (response.selection) {
 case 0:
 toggleSystem(player);
 break;
 case 1:
 showAddTag(player);
 break;
 case 2:
 showRemoveTag(player);
 break;
 case 3:
 showAccessList(player);
 break;
 case 4:
 showXrayMenu(player);
 break;
 }
 });
}
function toggleSystem(player) {
 isSystemEnabled = !isSystemEnabled;
 setSystemState(isSystemEnabled);
 const status = isSystemEnabled ? "§aenabled" : "§cdisabled";
 player.sendMessage(`§eXRay logging system has been ${status}§e!`);
 showTagManagement(player);
}
function showAddTag(player) {
 const form = new ModalFormData()
 .title("Add Admin Access")
 .textField("§eEnter player name:", "Player name");
 form.show(player).then(response => {
 if (!response || response.canceled) {
 showTagManagement(player);
 return;
 }
 const targetPlayer = response.formValues[0];
 if (!targetPlayer) {
 player.sendMessage("§cPlease enter a player name!");
 showTagManagement(player);
 return;
 }
 const players = world.getAllPlayers();
 const target = players.find(p => p.name === targetPlayer);
 if (!target) {
 player.sendMessage(`§cPlayer §f${targetPlayer}§c not found!`);
 showTagManagement(player);
 return;
 }
 try {
 target.runCommand(`tag @s add ${CONSTANTS.CONFIG.SYSTEM_TAG}`);
 player.sendMessage(`§aGranted admin access to §f${targetPlayer}§a!`);
 target.sendMessage(`§aYou have been granted admin access to XRay logs by §f${player.name}§a!`);
 } catch (error) {
 player.sendMessage("§cFailed to add admin tag!");
 }
 showTagManagement(player);
 });
}
function showRemoveTag(player) {
 const form = new ModalFormData()
 .title("Remove Admin Access")
 .textField("§eEnter player name:", "Player name");
 form.show(player).then(response => {
 if (!response || response.canceled) {
 showTagManagement(player);
 return;
 }
 const targetPlayer = response.formValues[0];
 if (!targetPlayer) {
 player.sendMessage("§cPlease enter a player name!");
 showTagManagement(player);
 return;
 }
 const players = world.getAllPlayers();
 const target = players.find(p => p.name === targetPlayer);
 if (!target) {
 player.sendMessage(`§cPlayer §f${targetPlayer}§c not found!`);
 showTagManagement(player);
 return;
 }
 try {
 target.runCommand(`tag @s remove ${CONSTANTS.CONFIG.SYSTEM_TAG}`);
 player.sendMessage(`§aRemoved admin access from §f${targetPlayer}§a!`);
 target.sendMessage(`§cYour admin access to XRay logs has been revoked by §f${player.name}§c!`);
 } catch (error) {
 player.sendMessage("§cFailed to remove admin tag!");
 }
 showTagManagement(player);
 });
}
function showAccessList(player) {
 const players = world.getAllPlayers();
 const accessList = new Map();
 const playersArray = Array.from(players);
 const playersLength = playersArray.length;
 for (let i = 0; i < playersLength; i++) {
 const p = playersArray[i];
 if (p.hasTag(CONSTANTS.CONFIG.SYSTEM_TAG)) {
 accessList.set(p.name, ["admin"]);
 }
 }
 const currentState = getSystemState();
 let bodyText = [
 `§eSystem Status: ${currentState ? "§aEnabled" : "§cDisabled"}§r`,
 "",
 "§ePlayers with XRay Log Access:§r",
 "§7(Players with admin tag will receive mining notifications)§r",
 ""
 ];
 if (accessList.size === 0) {
 bodyText.push("§7No players with access");
 } else {
 for (const [playerName, tags] of accessList) {
 bodyText.push(`§f${playerName}§7: ${tags.join(", ")}`);
 }
 }
 const menu = new ActionFormData().simpleUi()
 .title("Access List")
 .body(bodyText.join("\n"))
 .button("Back", CONSTANTS.ICONS.BACK);
 menu.show(player).then(() => {
 showTagManagement(player);
 });
}
function getPlayerHeldItem(player) {
 try {
 const inventory = player.getComponent("inventory");
 if (!inventory) return null;
 if (inventory.selectedSlotIndex !== undefined) {
 const container = inventory.container;
 if (container) {
 const item = container.getItem(inventory.selectedSlotIndex);
 if (item) return item;
 }
 }
 const container = inventory.container;
 if (container) {
 for (let i = 0; i < 9; i++) {
 const item = container.getItem(i);
 if (item) {
 const typeId = item.typeId.toLowerCase();
 if (typeId.includes("pickaxe") || 
 typeId.includes("shovel") || 
 typeId.includes("axe") ||
 typeId.includes("hoe")) {
 return item;
 }
 }
 }
 }
 return null;
 } catch (error) {
 console.warn("[XRay] Error getting player held item:", error);
 return null;
 }
}
function hasSilkTouch(item) {
 if (!item) return false;
 try {
 const enchantComp = item.getComponent("enchantable");
 if (!enchantComp) return false;
 const enchantments = enchantComp.getEnchantments();
 if (!enchantments || !Array.isArray(enchantments)) return false;
 for (const enchant of enchantments) {
 if (enchant && enchant.type) {
 let enchantId = "";
 if (typeof enchant.type === "string") {
 enchantId = enchant.type.toLowerCase();
 } else if (enchant.type.id) {
 enchantId = enchant.type.id.toLowerCase();
 } else if (enchant.typeId) {
 enchantId = enchant.typeId.toLowerCase();
 }
 if (enchantId) {
 if (enchantId.includes("silk_touch") || 
 enchantId.includes("silktouch") ||
 enchantId === "minecraft:silk_touch" ||
 enchantId === "silk_touch") {
 return true;
 }
 }
 }
 }
 } catch (error) {
 console.warn("[XRay] Error checking silk touch:", error);
 }
 return false;
}
world.beforeEvents.playerBreakBlock.subscribe((event) => {
 if (!getSystemState()) return;
 const player = event.player;
 if (!player) return;
 const block = event.block;
 if (!block) return;
 const blockId = block.typeId;
 if (!blockId) return;
 if (!targetOres[blockId]) return;
 let heldItem = null;
 let usingSilkTouch = false;
 try {
 heldItem = getPlayerHeldItem(player);
 if (heldItem) {
 usingSilkTouch = hasSilkTouch(heldItem);
 }
 } catch (error) {
 console.warn("[XRay] Error getting player item:", error);
 }
 const location = block.location;
 if (!location) return;
 const timestamp = new Date().toISOString();
 const logEntry = {
 player: player.name,
 ore: blockId,
 location: {
 x: Math.floor(location.x),
 y: Math.floor(location.y),
 z: Math.floor(location.z)
 },
 dimension: player.dimension.id,
 timestamp: timestamp,
 silkTouch: usingSilkTouch 
 };
 system.run(async () => {
 try {
 await addLog(logEntry);
 const adminPlayers = world.getAllPlayers().filter(p => hasXrayAccess(p));
 if (adminPlayers.length === 0) return;
 const silkTouchText = usingSilkTouch ? " §6[Silk Touch]" : "";
 const logMessage = `§c[XRay] §e${player.name} §7mined §f${formatOreName(blockId)}${silkTouchText} §7at §a[${logEntry.location.x}, ${logEntry.location.y}, ${logEntry.location.z}]`;
 for (const adminPlayer of adminPlayers) {
 if (rateLimiter.canNotify(adminPlayer.name)) {
 adminPlayer.sendMessage(logMessage);
 try {
 adminPlayer.runCommand(`playsound note.pling @s ~ ~ ~ 0.5 1.2`);
 } catch (error) {
 }
 }
 }
 } catch (error) {
 }
 });
});
system.runInterval(() => {
 system.run(async () => {
 await cleanOldLogs(CONSTANTS.CONFIG.DEFAULT_CLEAN_AGE);
 });
}, CONSTANTS.CONFIG.CLEAN_INTERVAL);
function getPlayerMiningLog(playerName) {
 return playerMiningData.get(playerName) || [];
}
function checkMiningRatio(playerName) {
 const logs = getPlayerMiningLog(playerName);
 const oreCount = {};
 logs.forEach(log => {
 oreCount[log.ore] = (oreCount[log.ore] || 0) + 1;
 });
 return oreCount;
}
export {
 getPlayerMiningLog,
 checkMiningRatio,
 showXrayMenu
};
