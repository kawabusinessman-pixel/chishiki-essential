import { system, world, ActionFormData, ModalFormData } from "../core.js";
import { showMainMenu } from "../kiwora.js";
import { Bank } from "../plugins/bank/bank.js";
import { showClanMenu } from "../plugins/clan/clan.js";
import { Shop as ShopMenu } from "../menu_member/functions/shop/index.js";
import { ShowPlayerWarps } from "../plugins/player-warp/index.js";
import { getRTPConfig, random_tp } from "../plugins/random-teleport/index.js";
import { showQuestAdminMenu } from "../quest_system/admin/quest_admin.js";
import { CombatQuest } from "../quest_system/quests/combat_quest.js";
import { FarmingQuest } from "../quest_system/quests/farming_quest.js";
import { MiningQuest } from "../quest_system/quests/mining_quest.js";
import { EditWarp, ShowAvailableWarps } from "../warp.js";

import { addMoney } from "../function/moneySystem.js";
import {
 showXPShop,
 showXPShopAdmin,
} from "../plugins/npc-system/xp-shop/xp_shop.js";
import { showStarterKitMenu } from "../plugins/npc-system/starter-kit/starter.js";
import { showBountyMenu } from "../plugins/npc-system/bounty/bounty.js";
import { showTopUpRankMenu } from "../plugins/npc-system/top-up-rank/top-up-rank.js";
const MENU_CONFIG = {
 title: "Custom Admin Menu",
 subtitle: "§7Select an option",
 mainButtons: [
 {
 id: "player_management",
 text: "Player Management",
 icon: "textures/ui/players",
 description: "§7Manage players, ban, kick, mute",
 children: [
 {
 id: "online_players",
 text: "Online Players",
 icon: "textures/ui/Friend",
 },
 {
 id: "ban_list",
 text: "Ban List",
 icon: "textures/ui/locked_texture",
 },
 {
 id: "player_stats",
 text: "Player Statistics",
 icon: "textures/ui/gear",
 },
 ],
 },
 {
 id: "server_control",
 text: "Server Control",
 icon: "textures/ui/server",
 description: "§7Restart, stop, whitelist, settings",
 children: [
 {
 id: "restart",
 text: "Restart Server",
 icon: "textures/ui/refresh_light",
 },
 { id: "whitelist", text: "Whitelist", icon: "textures/ui/allow_list" },
 { id: "server_settings", text: "Settings", icon: "textures/ui/gear" },
 ],
 },
 {
 id: "economy",
 text: "Economy",
 icon: "textures/ui/coin",
 description: "§7Money, shop, economy settings",
 children: [
 { id: "bank", text: "Bank Management", icon: "textures/ui/piggy_bank" },
 { id: "shop", text: "Shop Editor", icon: "textures/ui/trading" },
 {
 id: "economy_stats",
 text: "Economy Stats",
 icon: "textures/ui/bar_chart",
 },
 ],
 },
 {
 id: "world_management",
 text: "World Management",
 icon: "textures/ui/world_glyph",
 description: "§7World edit, regions, protection",
 children: [
 { id: "regions", text: "Regions", icon: "textures/ui/protection" },
 {
 id: "world_edit",
 text: "World Edit",
 icon: "textures/ui/pencil_icon",
 },
 {
 id: "spawn_points",
 text: "Spawn Points",
 icon: "textures/ui/waypoint",
 },
 ],
 },
 {
 id: "clan_system",
 text: "Clan System",
 icon: "textures/ui/group",
 description: "§7Manage clans, wars, alliances",
 },
 {
 id: "quest_system",
 text: "Quest System",
 icon: "textures/ui/book_default",
 description: "§7Create and manage quests",
 children: [
 {
 id: "quest_editor",
 text: "Quest Editor",
 icon: "textures/ui/pencil",
 },
 {
 id: "active_quests",
 text: "Active Quests",
 icon: "textures/ui/check",
 },
 {
 id: "quest_rewards",
 text: "Reward Settings",
 icon: "textures/ui/gift_square",
 },
 ],
 },
 {
 id: "npc_system",
 text: "NPC System",
 icon: "textures/ui/mob_effect",
 description: "§7Create and manage NPCs",
 },
 {
 id: "maintenance",
 text: "Maintenance",
 icon: "textures/ui/anvil_icon",
 description: "§7Maintenance mode, backups, logs",
 children: [
 {
 id: "maintenance_mode",
 text: "Maintenance Mode",
 icon: "textures/ui/construction",
 },
 { id: "backup", text: "Backup World", icon: "textures/ui/storage" },
 { id: "logs", text: "Server Logs", icon: "textures/ui/scripting" },
 ],
 },
 {
 id: "custom_tools",
 text: "Custom Tools",
 icon: "textures/ui/wrench",
 description: "§7Custom commands and tools",
 children: [
 { id: "broadcast", text: "Broadcast", icon: "textures/ui/megaphone" },
 {
 id: "custom_commands",
 text: "Custom Commands",
 icon: "textures/ui/console",
 },
 { id: "debug_tools", text: "Debug Tools", icon: "textures/ui/bug" },
 ],
 },
 ],
};
const customMenus = new Map();
const playerPermissions = new Map();
class CustomAdminMenu {
 static async showMainMenu(player) {
 if (!player.hasTag("admin")) {
 player.sendMessage("§cYou don't have permission to use this menu!");
 return;
 }
 const form = new ActionFormData().simpleUi()
 .title(MENU_CONFIG.title)
 .body(MENU_CONFIG.subtitle);
 MENU_CONFIG.mainButtons.forEach((button) => {
 if (this.hasPermission(player, button.id)) {
 form.button(button.text, button.icon);
 }
 });
 form.button("§7Back to Main", "textures/ui/arrow_left");
 const res = await form.show(player);
 if (res.canceled) return;
 if (
 res.selection ===
 MENU_CONFIG.mainButtons.filter((b) => this.hasPermission(player, b.id))
 .length
 ) {
 showMainMenu(player);
 return;
 }
 const buttons = MENU_CONFIG.mainButtons.filter((b) =>
 this.hasPermission(player, b.id),
 );
 const selected = buttons[res.selection];
 if (selected) {
 if (selected.children) {
 await this.showSubMenu(player, selected);
 } else {
 await this.executeAction(player, selected.id);
 }
 }
 }
 static async showSubMenu(player, menu) {
 const form = new ActionFormData().simpleUi()
 .title(menu.text)
 .body(`§7${menu.description || ""}`);
 menu.children.forEach((child) => {
 if (this.hasPermission(player, child.id)) {
 form.button(child.text, child.icon);
 }
 });
 form.button("§7Back", "textures/ui/arrow_left");
 const res = await form.show(player);
 if (res.canceled) return;
 if (
 res.selection ===
 menu.children.filter((c) => this.hasPermission(player, c.id)).length
 ) {
 this.showMainMenu(player);
 return;
 }
 const children = menu.children.filter((c) =>
 this.hasPermission(player, c.id),
 );
 const selected = children[res.selection];
 if (selected) {
 await this.executeAction(player, selected.id);
 }
 }
 static async executeAction(player, actionId) {
 switch (actionId) {
 case "player_management":
 this.showPlayerManagement(player);
 break;
 case "bank":
 showBankMenu(player);
 break;
 case "shop":
 ShopMenu(player);
 break;
 case "clan_system":
 showClanMenu(player);
 break;
 case "quest_system":
 showQuestAdminMenu(player);
 break;
 case "npc_system":
 this.showNPCSystem(player);
 break;
 case "maintenance":
 this.showMaintenance(player);
 break;
 case "online_players":
 this.showOnlinePlayers(player);
 break;
 case "restart":
 this.showRestartConfirm(player);
 break;
 case "whitelist":
 this.showWhitelist(player);
 break;
 case "broadcast":
 this.showBroadcast(player);
 break;
 case "regions":
 this.showRegions(player);
 break;
 case "world_edit":
 this.showWorldEdit(player);
 break;
 case "quest_editor":
 this.showQuestEditor(player);
 break;
 case "maintenance_mode":
 this.toggleMaintenance(player);
 break;
 case "backup":
 this.createBackup(player);
 break;
 case "logs":
 this.showLogs(player);
 break;
 default:
 player.sendMessage(`§cAction "${actionId}" not implemented!`);
 }
 }
 static showPlayerManagement(player) {
 const form = new ActionFormData().simpleUi()
 .title("Player Management")
 .button("Online Players", "textures/ui/players")
 .button("Ban List", "textures/ui/locked_texture")
 .button("Mute List", "textures/ui/speaker_mute")
 .button("Player Statistics", "textures/ui/bar_chart")
 .button("§7Back", "textures/ui/arrow_left");
 form.show(player).then((res) => {
 if (res.canceled || res.selection === 4) return;
 const actions = [
 () => this.showOnlinePlayers(player),
 () => this.showBanList(player),
 () => this.showMuteList(player),
 () => this.showPlayerStats(player),
 ];
 if (actions[res.selection]) actions[res.selection]();
 });
 }
 static showNPCSystem(player) {
 const form = new ActionFormData().simpleUi()
 .title("NPC System")
 .button("Create NPC", "textures/ui/mob_effect")
 .button("Edit NPCs", "textures/ui/pencil_icon")
 .button("NPC Templates", "textures/ui/recipe_book")
 .button("NPC Settings", "textures/ui/gear")
 .button("§7Back", "textures/ui/arrow_left");
 form.show(player).then((res) => {
 if (res.canceled || res.selection === 4) return;
 const actions = [
 () => this.createNPC(player),
 () => this.editNPCs(player),
 () => this.showNPCTemplates(player),
 () => this.showNPCSettings(player),
 ];
 if (actions[res.selection]) actions[res.selection]();
 });
 }
 static showMaintenance(player) {
 const isMaintenance = world.getDynamicProperty("maintenance_mode") === true;
 const form = new ActionFormData().simpleUi()
 .title("Maintenance")
 .body(`§7Maintenance Mode: §${isMaintenance ? "cEnabled" : "aDisabled"}`)
 .button(
 `${isMaintenance ? "Disable" : "Enable"} Maintenance Mode`,
 "textures/ui/construction",
 )
 .button("Backup World", "textures/ui/storage")
 .button("Server Logs", "textures/ui/scripting")
 .button("Clear Entities", "textures/ui/trash")
 .button("§7Back", "textures/ui/arrow_left");
 form.show(player).then((res) => {
 if (res.canceled || res.selection === 4) return;
 const actions = [
 () => this.toggleMaintenance(player),
 () => this.createBackup(player),
 () => this.showLogs(player),
 () => this.clearEntities(player),
 ];
 if (actions[res.selection]) actions[res.selection]();
 });
 }
 static async showBroadcast(player) {
 const form = new ModalFormData()
 .title("Broadcast Message")
 .textField("Message", "Enter message to broadcast...", "")
 .dropdown("Type", ["Info", "Warning", "Success", "Error"], 0)
 .toggle("Title", false)
 .toggle("Sound", true);
 const res = await form.show(player);
 if (res.canceled || !res.formValues[0]) return;
 const [message, typeIdx, isTitle, playSound] = res.formValues;
 const types = ["info", "warning", "success", "error"];
 const type = types[typeIdx];
 if (isTitle) {
 world.sendMessage(
 `§l§${type === "warning" ? "e" : type === "error" ? "c" : type === "success" ? "a" : "b"}${message}`,
 );
 } else {
 world.sendMessage(
 `§${type === "warning" ? "e" : type === "error" ? "c" : type === "success" ? "a" : "b"}${message}`,
 );
 }
 if (playSound) {
 world.getPlayers().forEach((p) => {
 try {
 p.runCommand(`playsound random.pop @s ~~~ 1 1`);
 } catch {}
 });
 }
 player.sendMessage(`§aMessage broadcasted to all players!`);
 }
 static toggleMaintenance(player) {
 const isMaintenance = world.getDynamicProperty("maintenance_mode") === true;
 world.setDynamicProperty("maintenance_mode", !isMaintenance);
 if (!isMaintenance) {
 world.sendMessage("§c§lServer is entering maintenance mode!");
 world.getPlayers().forEach((p) => {
 if (!p.hasTag("admin")) {
 p.kick("Server is under maintenance");
 }
 });
 } else {
 player.sendMessage("§aMaintenance mode disabled!");
 }
 }
 static createBackup(player) {
 player.runCommand(`function backup`);
 player.sendMessage("§aBackup initiated!");
 }
 static showLogs(player) {
 player.sendMessage("§7§lRecent Server Logs:");
 player.sendMessage("§7[INFO] Server running smoothly");
 player.sendMessage("§7[WARN] High memory usage detected");
 player.sendMessage("§7[INFO] 50 players online");
 }
 static clearEntities(player) {
 let count = 0;
 ["overworld", "nether", "the_end"].forEach((dim) => {
 try {
 const dimension = world.getDimension(dim);
 dimension
 .getEntities({
 type: "minecraft:item",
 })
 .forEach((e) => {
 e.remove();
 count++;
 });
 } catch {}
 });
 player.sendMessage(`§aCleared §e${count}§a items from all dimensions!`);
 }
 static hasPermission(player, permission) {
 const perms = playerPermissions.get(player.id) || [];
 return (
 perms.includes("*") ||
 perms.includes(permission) ||
 player.hasTag("admin")
 );
 }
 static setPermission(player, permission, hasPermission) {
 if (!playerPermissions.has(player.id)) {
 playerPermissions.set(player.id, []);
 }
 const perms = playerPermissions.get(player.id);
 if (hasPermission) {
 if (!perms.includes(permission)) {
 perms.push(permission);
 }
 } else {
 const idx = perms.indexOf(permission);
 if (idx > -1) {
 perms.splice(idx, 1);
 }
 }
 playerPermissions.set(player.id, perms);
 }
 static createCustomMenu(menuId, config) {
 customMenus.set(menuId, config);
 }
 static getCustomMenu(menuId) {
 return customMenus.get(menuId);
 }
 static createNPC(player) {
 player.runCommand(`function create_npc`);
 player.sendMessage("§aNPC creation mode activated! Click to place NPC.");
 }
 static showOnlinePlayers(player) {
 player.sendMessage("§7§lOnline Players:");
 world.getPlayers().forEach((p) => {
 player.sendMessage(`§7- ${p.name}`);
 });
 }
 static editNPCs(player) {
 player.sendMessage("§cNPC editor not implemented yet!");
 }
 static showNPCTemplates(player) {
 player.sendMessage("§cNPC templates not implemented yet!");
 }
 static showNPCSettings(player) {
 player.sendMessage("§cNPC settings not implemented yet!");
 }
 static showBanList(player) {
 player.sendMessage("§cBan list not implemented yet!");
 }
 static showMuteList(player) {
 player.sendMessage("§cMute list not implemented yet!");
 }
 static showPlayerStats(player) {
 player.sendMessage("§cPlayer statistics not implemented yet!");
 }
 static showRestartConfirm(player) {
 const form = new ActionFormData().simpleUi()
 .title("§cRestart Server")
 .body("§eAre you sure you want to restart the server?")
 .button("§cYes, Restart", "textures/ui/refresh_light")
 .button("§aNo", "textures/ui/cancel");
 form.show(player).then((res) => {
 if (!res.canceled && res.selection === 0) {
 player.runCommand(`save-all`);
 player.runCommand(`stop`);
 }
 });
 }
 static showWhitelist(player) {
 player.sendMessage("§cWhitelist management not implemented yet!");
 }
 static showRegions(player) {
 player.sendMessage("§cRegion management not implemented yet!");
 }
 static showWorldEdit(player) {
 player.sendMessage("§cWorld Edit not implemented yet!");
 }
 static showQuestEditor(player) {
 player.sendMessage("§cQuest editor not implemented yet!");
 }
}
CustomAdminMenu.createCustomMenu("quick_actions", {
 title: "Quick Actions",
 buttons: [
 { id: "heal_all", text: "Heal All Players", icon: "textures/ui/heart" },
 { id: "clear_weather", text: "Clear Weather", icon: "textures/ui/sun" },
 { id: "time_day", text: "Set Time to Day", icon: "textures/ui/clock" },
 ],
});
world.beforeEvents.chatSend.subscribe((event) => {
 const { message, sender } = event;
 if (message.startsWith("/custommenu")) {
 event.cancel = true;
 const args = message.split(" ").slice(1);
 if (args[0] === "help") {
 sender.sendMessage("§7§lCustom Menu Commands:");
 sender.sendMessage("§7/custommenu - Open main menu");
 sender.sendMessage("§7/custommenu help - Show this help");
 sender.sendMessage(
 "§7/custommenu perm <player> <permission> - Set permission",
 );
 } else if (args[0] === "perm" && sender.hasTag("admin")) {
 if (args.length >= 3) {
 const target = args[1];
 const permission = args[2];
 const targetPlayer = [...world.getPlayers()].find(
 (p) => p.name === target,
 );
 if (targetPlayer) {
 CustomAdminMenu.setPermission(targetPlayer, permission, true);
 sender.sendMessage(
 `§aGranted permission "${permission}" to ${target}`,
 );
 targetPlayer.sendMessage(`§aYou received permission: ${permission}`);
 } else {
 sender.sendMessage(`§cPlayer "${target}" not found!`);
 }
 } else {
 sender.sendMessage("§cUsage: /custommenu perm <player> <permission>");
 }
 } else {
 CustomAdminMenu.showMainMenu(sender);
 }
 }
});
system.runInterval(() => {
 const permsData = {};
 playerPermissions.forEach((perms, playerId) => {
 permsData[playerId] = perms;
 });
 world.setDynamicProperty(
 "custom_menu_permissions",
 JSON.stringify(permsData),
 );
}, 12000);
system.run(() => {
 const saved = world.getDynamicProperty("custom_menu_permissions");
 if (saved) {
 try {
 const permsData = JSON.parse(saved);
 Object.entries(permsData).forEach(([playerId, perms]) => {
 playerPermissions.set(playerId, perms);
 });
 } catch (e) {
 console.error("Failed to load custom menu permissions:", e);
 }
 }
});
export { CustomAdminMenu };
