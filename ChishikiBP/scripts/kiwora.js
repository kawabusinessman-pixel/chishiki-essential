import { world, ModalFormData } from "./core.js";
import { showBanManagementMenu } from "./admin_menu/banSystem.js";
import { showChatGamesMenu } from "./admin_menu/chatGames.js";
import { clearlag } from "./plugins/clear-lag/clearlag.js";
import { customitem } from "./admin_menu/customitem.js";
import { showFakeJoinMenu } from "./admin_menu/fake_join";
import { fakechat } from "./admin_menu/fakechat";
import { showGamemodeMenu } from "./admin_menu/gamemode";
import { showKickPlayerMenu } from "./admin_menu/kickPlayer";
import { showKillMenu } from "./admin_menu/kill_menu";
import { lobbyProtectMenu } from "./admin_menu/lobby_protect/lobby_p.js";
import { npc_system } from "./admin_menu/npc_system.js";
import { showScoreboardMenu } from "./admin_menu/scoreboard.js";
import { showSpawnMenu } from "./plugins/back-to-lobby/setSpawn.js";
import { showSpecialItemsMenu } from "./admin_menu/spesial_block";
import { showTimeWeatherMenu } from "./admin_menu/time";
import { showVanishMenu } from "./plugins/vanish/vanish.js";
import { showChatSettingsMenu } from "./board/chat";
import { FuncBoardConfig } from "./board/main";
import { broadcast } from "./broadcast";
import { showOptMenu } from "./Eks opt/opt.js";
import { floatingTextMenu } from "./plugins/floating-text/floating_text.js";
import { kiwora, playerForm } from "./forms";
import { gamerule } from "./plugins/gamerule/gamerule.js";
import { showChangelog } from "./info/infoUpdate";
import { showMoneyMenu } from "./viewmoney.js";
import { showMemberMenu } from "./member";
import { control_member } from "./menu_member/control_member/control";
import { showAfkConfig } from "./plugins/afk-system/afk.js";
import { openAdminPanel } from "./plugins/ranks/rank.js";
import { showViewReportMenu } from "./viewreport";
import { EditWarp } from "./warp";
import { showButtonMenu } from "./admin_menu/custom_button/custom_main.js";
import { ore_generator } from "./admin_menu/ore_generator/main_ore.js";
import { showXrayMenu } from "./plugins/xray_log/xray.js";
import { openBanItemMenu } from "./plugins/ban-item/ban-item.js";
import { showPlayerLogMenu } from "./plugins/check-player-on/index.js";
import { showWhitelistMenu } from "./plugins/whitelist/index.js";
import { showAfkZoneMenu } from "./plugins/afk-system/afk_zone.js";
import { AdminDashboardUI } from "./plugins/login/login.js";
import { showLanguageMenu } from "./admin_menu/language.js";
import { showCustomCommandsMenu } from "./plugins/custom-commands/custom_cmd_menu.js";
import { showAllStackerAdminMenu } from "./plugins/all-stacker/index.js";
export {
 broadcast,
 gamerule,
 getOnlinePlayers,
 hasPermission,
 showChatGamesMenu,
 showMainMenu,
 showMemberMenu,
};
function hasPermission(source, role) {
 const isAuthorized =
 (role === "admin" && source.hasTag("admin")) || role === "member";
 if (isAuthorized) {
 return true;
 }
 return false;
}
function getOnlinePlayers(asNumber = false) {
 if (asNumber) return world.getPlayers().length;
 const players = [...world.getPlayers()];
 return players;
}
const MENU_SOUNDS = {
 success: "random.orb",
 error: "note.bass",
 warning: "random.break",
 action: "ui.loom.select_pattern",
};
const soundCooldowns = new Map();
function playSound(source, category, cooldownMs = 200) {
 const now = Date.now();
 const lastPlayed = soundCooldowns.get(source.id) || 0;
 if (now - lastPlayed >= cooldownMs) {
 const sound = MENU_SOUNDS[category] || category;
 const vol = category === "action" ? 0.6 : 0.7;
 const pitch = category === "action" ? 1.2 : 1;
 source.runCommand(`playsound ${sound} @s ~~~ ${vol} ${pitch}`);
 soundCooldowns.set(source.id, now);
 }
}
export { playSound };
function showBoardMenu(source) {
 FuncBoardConfig(source);
}
async function showPlayerMenu(source) {
 try {
 const playerResponse = await playerForm(source).show(source);
 if (playerResponse.isCanceled) return;
 const actions = [
 () => showChangelog(source),
 () => showTeleportMenu(source),
 () => showBanManagementMenu(source),
 () => showMutePlayerMenu(source),
 () => showKickPlayerMenu(source),
 () => showItemAndBlockMenu(source),
 () => ViewInventory(source),
 () => showMoneyMenu(source),
 () => showCustomCommandsMenu(source),
 () => showMainMenu(source),
 ];
 const action = actions[playerResponse.selection];
 if (action) action();
 } catch (error) {
 console.error("Error showing player menu:", error);
 }
}
async function showItemAndBlockMenu(source) {
 try {
 const players = [...world.getPlayers()];
 const playerNames = players.map((player) => player.name);
 playerNames.push("@a");
 const betterGUI = new ModalFormData()
 .title("give")
 .dropdown("select player", playerNames, {
 defaultValueIndex: 0,
 })
 .textField(
 "item/block id (e.g., minecraft:grass)",
 "enter item/block id",
 {
 defaultValue: "",
 placeholder: "minecraft:diamond",
 },
 )
 .slider("amount", 1, 128, {
 defaultValue: 1,
 valueStep: 1,
 });
 const response = await betterGUI.show(source);
 if (response.isCanceled) return;
 const [playerIndex, itemID, amount] = response.formValues;
 const targetPlayerName = playerNames[playerIndex];
 source.runCommand("gamerule sendcommandfeedback false");
 if (targetPlayerName === "@a") {
 source.runCommand(`give @a ${itemID} ${amount}`);
 } else {
 const targetPlayer = players.find(
 (player) => player.name === targetPlayerName,
 );
 if (targetPlayer) {
 source.runCommand(`give ${targetPlayerName} ${itemID} ${amount}`);
 } else {
 source.runCommand(
 `tellraw @s {"rawtext":[{"text":"§cError: Player '${targetPlayerName}' not found."}]}`,
 );
 }
 }
 source.runCommand("gamerule sendcommandfeedback true");
 } catch (error) {
 console.error("Error showing item and block menu:", error);
 }
}
function showRankMenu(source) {
 openAdminPanel(source);
}
async function showMutePlayerMenu(source) {
 try {
 const players = world.getPlayers().map((player) => player.name);
 if (players.length === 0) {
 source.runCommand(
 `tellraw @s {"rawtext":[{"text":"§cNo players online to mute/unmute."}]}`,
 );
 playSound(source, "error");
 return;
 }
 const mutePlayerForm = new ModalFormData()
 .title("mute/unmute player")
 .dropdown("select player", players, {
 defaultValueIndex: 0,
 })
 .dropdown("action", ["mute", "unmute"], {
 defaultValueIndex: 0,
 });
 const muteResponse = await mutePlayerForm.show(source);
 if (muteResponse.isCanceled) return;
 const selectedPlayerName = players[muteResponse.formValues[0]];
 const action = muteResponse.formValues[1] === 0 ? "muted" : "unmuted";
 const selectedPlayer = world
 .getPlayers()
 .find((player) => player.name === selectedPlayerName);
 if (selectedPlayer) {
 const isMuted = action === "muted";
 selectedPlayer.setDynamicProperty("isMuted", isMuted);
 const message = isMuted
 ? "§eWarning: You have been muted."
 : "§aYou have been unmuted.";
 const soundCategory = isMuted ? "warning" : "success";
 await selectedPlayer.runCommandAsync(
 `tellraw @s {"rawtext":[{"text":"${message}"}]}`,
 );
 playSound(selectedPlayer, soundCategory);
 updatePlayerNameTag(selectedPlayer);
 source.runCommandAsync(
 `tellraw @s {"rawtext":[{"text":"Player ${selectedPlayerName} has been ${action}."}]}`,
 );
 playSound(source, "action");
 } else {
 source.runCommandAsync(
 `tellraw @s {"rawtext":[{"text":"Player ${selectedPlayerName} is not online."}]}`,
 );
 playSound(source, "error");
 }
 } catch (error) {
 console.error("Error displaying mute/unmute player form:", error);
 }
}
function updatePlayerNameTag(player) {
 const isMuted = player.getDynamicProperty("isMuted") || false;
 player.nameTag = isMuted ? `${player.name} §c[Mute]` : player.name;
}
function ViewInventory(source) {
 source.runCommand("/give @s r4isen1920_invsee:inventory");
 playSound(source, "success");
 source.runCommand(
 `tellraw @s {"rawtext":[{"text":"§aInventory viewer added to your items."}]}`,
 );
}
import { Lang } from "./lib/Lang.js";
async function showTeleportMenu(source) {
 try {
 const players = world.getPlayers().map((player) => player.name);
 if (players.length === 0) {
 source.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(source, "tp.err.no_player")}"}]}`,
 );
 playSound(source, "error");
 return;
 }
 const teleportForm = new ModalFormData()
 .title(Lang.t(source, "tp.menu.title"))
 .dropdown(Lang.t(source, "tp.select.player"), players, {
 defaultValueIndex: 0,
 })
 .dropdown(
 Lang.t(source, "tp.select.mode"),
 [Lang.t(source, "tp.mode.to"), Lang.t(source, "tp.mode.here")],
 {
 defaultValueIndex: 0,
 },
 );
 const teleportResponse = await teleportForm.show(source);
 if (teleportResponse.canceled || !teleportResponse.formValues) return;
 const selectedPlayerName = players[teleportResponse.formValues[0]];
 const teleportMode = teleportResponse.formValues[1];
 if (teleportMode === 0) {
 source.runCommand(`tp @s "${selectedPlayerName}"`);
 } else {
 source.runCommand(`tp "${selectedPlayerName}" @s`);
 }
 playSound(source, "action");
 } catch (error) {
 console.error("Error during teleport form display:", error);
 playSound(source, "error");
 }
}
const MENU_ACTIONS = {
 0: showSpecialItemsMenu,
 1: showTimeWeatherMenu,
 2: showVanishMenu,
 3: showScoreboardMenu,
 4: showKillMenu,
 5: showFakeJoinMenu,
 6: showSpawnMenu,
 7: showPlayerMenu,
 8: showRankMenu,
 9: showGamemodeMenu,
 10: showMemberMenu,
 11: broadcast,
 12: gamerule,
 13: fakechat,
 14: EditWarp,
 15: showBoardMenu,
 16: showViewReportMenu,
 17: floatingTextMenu,
 18: showChatSettingsMenu,
 19: control_member,
 20: showChatGamesMenu,
 21: npc_system,
 22: clearlag,
 23: customitem,
 24: showOptMenu,
 25: showAfkConfig,
 26: lobbyProtectMenu,
 27: showButtonMenu,
 28: ore_generator,
 29: showXrayMenu,
 30: openBanItemMenu,
 31: showPlayerLogMenu,
 32: showWhitelistMenu,
 33: AdminDashboardUI,
 34: showAfkZoneMenu,
 35: (p) => showLanguageMenu(p, () => showMainMenu(p)),
 36: showCustomCommandsMenu,
 37: (p) => showAllStackerAdminMenu(p, () => showMainMenu(p)),
};
async function showMainMenu(source) {
 if (!source.hasTag("admin")) {
 playSound(source, "error");
 source.onScreenDisplay.setActionBar("§c✖ §7Admin permissions required §c✖");
 source.sendMessage(
 [
 `§8§l[§r§c§laccess denied§r§8§l]§r`,
 `§7this menu requires administrative privileges.`,
 ``,
 `§frequired: §cadmin tag`,
 `§7contact a server administrator for access.`,
 ].join("\n"),
 );
 return;
 }
 try {
 Lang.load(source);
 const response = await kiwora(source).show(source);
 if (response.canceled) return;
 if (MENU_ACTIONS[response.selection]) {
 playSound(source, "action");
 MENU_ACTIONS[response.selection](source);
 }
 } catch (error) {
 console.warn("Menu error:", error);
 playSound(source, "error");
 }
}
export function handleSidebarSwitch(selection, source) {
 const actions = {
 0: showSpecialItemsMenu,
 1: showTimeWeatherMenu,
 2: showVanishMenu,
 3: showScoreboardMenu,
 4: showKillMenu,
 5: showPlayerMenu,
 6: showMainMenu,
 };
 if (actions[selection]) {
 actions[selection](source);
 return true;
 }
 return false;
}
