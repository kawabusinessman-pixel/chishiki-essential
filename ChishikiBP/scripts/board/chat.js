import { world, system, ModalFormData } from "../core.js";
import { getPlaceholder } from "../function/getPlaceholder";
import { ChatDB, RankDB } from "./data.js";
import { getRank } from "../function/getRank.js";
import { getClan } from "../function/getClan.js";
import { rankDefault } from "../plugins/ranks/rank_default.js";
import { isRankRepairSkill, runRankRepairSkill, isRankKitSkill } from "../plugins/ranks/rank_skill_presets.js";
import { showStarterKitMenu } from "../plugins/npc-system/starter-kit/starter.js";
import { currencyDB } from "../function/getCurrency.js";
import { formatChatMessage, DEFAULT_FORMAT } from "./custom_chat.js";
import { isRankColorChatEnabled, getRankColorForChat } from "../plugins/ranks/rank_color_chat.js";
import { GlobalConfig } from "../function/GlobalConfig.js";
import { executeChatCommand } from "../plugins/custom-commands/custom.command.js";
import {
 getFormattedMoney,
 getFullMoney,
 formatMoneyValue,
} from "../function/moneySystem.js";
import { metricNumbers } from "../lib/game.js";
const chatCooldowns = new Map();
const GLOBAL_CHAT_STATUS_KEY = "ChatDBGlobal-status";
const DEFAULT_SETTINGS = {
 bannedWords: ["badwords"],
 chatLength: 256,
 chatStatus: true,
 chatCooldown: 3,
};
function showChatSettingsMenu(player) {
 try {
 const settings = {
 bannedWords: ChatDB.get("bannedWords") || DEFAULT_SETTINGS.bannedWords,
 chatLength:
 Number(ChatDB.get("chatLength")) || DEFAULT_SETTINGS.chatLength,
 chatStatus:
 ChatDB.get(GLOBAL_CHAT_STATUS_KEY) ?? DEFAULT_SETTINGS.chatStatus,
 chatCooldown:
 Number(ChatDB.get("chatCooldown")) || DEFAULT_SETTINGS.chatCooldown,
 };
 new ModalFormData()
 .title("chat settings")
 .textField(
 "enter words to ban (comma separated)",
 "e.g., badword1, badword2",
 {
 defaultValue: Array.isArray(settings.bannedWords)
 ? settings.bannedWords.join(", ")
 : "",
 placeholder: "badword1, badword2, badword3",
 tooltip: "words that will be filtered from chat",
 },
 )
 .slider("set maximum chat length", 1, 512, {
 defaultValue: settings.chatLength,
 valueStep: 1,
 tooltip: "maximum number of characters allowed in a message",
 })
 .slider("set chat cooldown (seconds)", 0, 60, {
 defaultValue: settings.chatCooldown,
 valueStep: 1,
 tooltip: "time players must wait between messages",
 })
 .toggle("enable chat", {
 defaultValue: settings.chatStatus,
 tooltip: "turn chat system on/off",
 })
 .show(player)
 .then((response) => handleSettingsResponse(player, response))
 .catch((error) => {
 console.warn("Error showing chat settings menu:", error);
 player.sendMessage("§cFailed to open chat settings menu.");
 });
 } catch (error) {
 console.warn("Error in showChatSettingsMenu:", error);
 player.sendMessage("§cFailed to load chat settings.");
 }
}
function handleSettingsResponse(player, response) {
 if (response.canceled || !response.formValues) {
 player.sendMessage("§cInvalid settings input.");
 return;
 }
 try {
 const [newBannedWords, newChatLength, newChatCooldown, newChatStatus] =
 response.formValues;
 if (newBannedWords.trim()) {
 const bannedWordsList = newBannedWords
 .split(",")
 .map((word) => word.trim())
 .filter((word) => word.length > 0);
 ChatDB.set("bannedWords", bannedWordsList);
 }
 if (typeof newChatLength === "number" && newChatLength > 0) {
 ChatDB.set("chatLength", newChatLength);
 }
 if (typeof newChatCooldown === "number" && newChatCooldown >= 0) {
 ChatDB.set("chatCooldown", newChatCooldown);
 }
 ChatDB.set(GLOBAL_CHAT_STATUS_KEY, Boolean(newChatStatus));
 const savedSettings = {
 bannedWords: ChatDB.get("bannedWords"),
 chatLength: ChatDB.get("chatLength"),
 chatCooldown: ChatDB.get("chatCooldown"),
 chatStatus: ChatDB.get(GLOBAL_CHAT_STATUS_KEY),
 };
 player.sendMessage("§aChat settings updated successfully.");
 player.playSound("random.pop");
 } catch (error) {
 console.warn("Error saving chat settings:", error);
 player.sendMessage("§cFailed to save chat settings.");
 }
}
world.beforeEvents.chatSend.subscribe((data) => {
 const { sender: player, message } = data;
 data.cancel = true;
 const chatEnabled = ChatDB.get(GLOBAL_CHAT_STATUS_KEY);
 const isMuted = player.getDynamicProperty("isMuted");
 if (isMuted) {
 player.sendMessage("§cYou are currently muted.");
 return;
 }
 if (chatEnabled === false) {
 player.sendMessage("§cChat is currently disabled by admin.");
 return;
 }
 	if (message.startsWith("/") || message.startsWith("!")) {
		const handled = executeChatCommand(player, message);
		if (handled) return;
		if (message.startsWith("/")) {
			const cleanMsg = message.slice(1).trim();
			system.run(() => {
				try {
					player.runCommand(cleanMsg);
				} catch {
					const firstToken = cleanMsg.split(/\s+/)[0];
					player.sendMessage(`§cUnknown command: /${firstToken}. Type §f/helps§c for available commands.`);
				}
			});
			return;
		}
	}
	if (message.startsWith("+")) {
 const playerRank = getPlayerRank(player);
 if (!playerRank) {
 player.sendMessage("§cYou don't have any rank permissions.");
 return;
 }
 if (message.toLowerCase() === "+help") {
 showRankHelp(player, playerRank);
 return;
 }
 if (playerRank.commands && playerRank.commands[message.toLowerCase()]) {
 const skillKey = message.toLowerCase();
 const skill = playerRank.commands[skillKey];
 const originalCommand = skill.cmd;
 const successMessage = skill.msg;
 const playerName = player.name.includes(" ")
 ? `"${player.name}"`
 : player.name;
 const finalCommand = String(originalCommand || "").replace(/@s/g, playerName);
 system.run(() => {
 try {
  if (isRankKitSkill(skillKey, skill)) {
   showStarterKitMenu(player).catch(() => {});
   return;
  }
  if (isRankRepairSkill(skillKey, skill)) {
   runRankRepairSkill(player, successMessage);
   return;
  }
 player.dimension.runCommand(finalCommand);
 player.sendMessage(successMessage);
 } catch (error) {
 if (String(error).includes('Unexpected "ability"')) {
 player.sendMessage("§c[System] Failed: You must enable 'Education Edition' in World Settings to use this ability!")
 player.playSound("random.break")
 return
 }
 console.warn(
 `Script Error trying to run command "${finalCommand}" for player ${player.name}:`,
 error,
 );
 let errorMsg = `§cScript error trying to execute command: ${finalCommand}`;
 if (error instanceof Error) {
 console.warn(`Error details: ${error.message}`);
 }
 player.sendMessage(errorMsg);
 }
 });
 return;
 }
 }
 const chatLength = ChatDB.get("chatLength") ?? DEFAULT_SETTINGS.chatLength;
 if (message.length > chatLength) {
 player.sendMessage(`§cMessage too long (max ${chatLength} characters).`);
 return;
 }
 if (
 ChatDB.get("bannedWords")?.some((word) =>
 message.toLowerCase().includes(word.toLowerCase()),
 )
 ) {
 player.sendMessage("§cInappropriate language detected.");
 return;
 }
 const cooldownInfo = chatCooldowns.get(player.name);
 const chatCooldown =
 ChatDB.get("chatCooldown") ?? DEFAULT_SETTINGS.chatCooldown;
 if (cooldownInfo) {
 const remainingTime =
 chatCooldown - (Date.now() - cooldownInfo.time) / 1000;
 if (remainingTime > 0) {
 player.sendMessage(
 `§cPlease wait §e${remainingTime.toFixed(1)}s §cbefore sending another message.`,
 );
 return;
 }
 }
 chatCooldowns.set(player.name, { time: Date.now() });
 ensurePlayerHasRank(player);
 const formattedMessage = formatChatMessage(player, message);
 if (formattedMessage) {
  world.sendMessage(formattedMessage);
 } else if (isRankColorChatEnabled()) {
  const rankColor = getRankColorForChat(player) || "§f";
  world.sendMessage(`§7${player.name}: ${rankColor}${message}`);
 } else {
  world.sendMessage(`§7${player.name}: §f${message}`);
 }
});
function ensurePlayerHasRank(player) {
 try {
 const prefix = RankDB.get("RankDBConfig-prefix") ?? "rank:";
 const rankTags = player.getTags().filter((tag) => tag.startsWith(prefix));
 if (rankTags.length === 0) {
 const defaultRank = RankDB.get("RankDBConfig-default") || "";
 if (defaultRank) {
 player.addTag(`${prefix}${defaultRank}`);
 console.warn(`Added default rank '${defaultRank}' to ${player.name}`);
 }
 }
 } catch (error) {
 console.warn(`Error ensuring rank for player ${player.name}:`, error);
 try {
 const defaultPrefix = "rank:";
 const rankTags = player
 .getTags()
 .filter((tag) => tag.startsWith(defaultPrefix));
 if (rankTags.length === 0) {
 const defaultRank = RankDB.get("RankDBConfig-default") || "";
 if (defaultRank) {
 player.addTag(`${defaultPrefix}${defaultRank}`);
 console.warn(
 `Added fallback default rank '${defaultRank}' to ${player.name}`,
 );
 }
 }
 } catch (fallbackError) {
 console.warn(
 `Critical error adding default rank to ${player.name}:`,
 fallbackError,
 );
 }
 }
}
function getDefaultClan() {
 return ClanDB.get("ClanDBConfig-default") || "None";
}
function getAvailableRanks() {
 try {
 const customRanksRaw = GlobalConfig.get("customRanks");
 let customRanks = {};
 if (customRanksRaw) {
 customRanks = typeof customRanksRaw === "string" ? JSON.parse(customRanksRaw) : customRanksRaw;
 }
 return { ...rankDefault.ranks, ...customRanks };
 } catch (error) {
 console.warn(
 "Error loading custom ranks, falling back to defaults:",
 error,
 );
 }
 return rankDefault.ranks;
}
function getPlayerRank(player) {
 const availableRanks = getAvailableRanks();
 const rankTags = player.getTags().filter((tag) => tag.startsWith("rank:"));
 if (rankTags.length > 0) {
 const rankTag = rankTags[0];
 if (availableRanks[rankTag]) {
 return availableRanks[rankTag];
 }
 if (availableRanks[rankTag.toLowerCase()]) {
 return availableRanks[rankTag.toLowerCase()];
 }
 for (const [rankId, rankData] of Object.entries(availableRanks)) {
 if (rankTag === rankId) {
 return rankData;
 }
 }
 }
 return availableRanks["rank:"] || null;
}
function showRankHelp(player, rank) {
 if (!rank || !rank.commands) {
 player.sendMessage("§cNo commands available for this rank.");
 return;
 }
 const rankName = rank.name || "Rank";
 const rankColor = rank.color || "§f";
 let helpMsg = `${rankColor}§l⚡ ${rankName} Commands§r\n`;
 let allCommands = Object.keys(rank.commands || {});
 let helpExists = false;
 const otherCommands = allCommands
 .filter((cmd) => {
 if (cmd.toLowerCase() === "+help") {
 helpExists = true;
 return false;
 }
 return true;
 })
 .sort();
 const finalCommandList = [...otherCommands];
 if (helpExists) {
 finalCommandList.push("+help");
 }
 if (finalCommandList.length === 0) {
 helpMsg += "§7No commands available.";
 } else {
 for (let i = 0; i < finalCommandList.length; i++) {
 const cmd = finalCommandList[i];
 helpMsg += `§8• ${rankColor}${cmd}§r\n`;
 }
 }
 helpMsg = helpMsg.trimEnd();
 player.sendMessage(helpMsg);
 const playerName = player.name.includes(" ")
 ? `"${player.name}"`
 : player.name;
 system.run(() => {
 player.dimension.runCommand(
 `playsound random.levelup ${playerName} ~~~ 1 1`,
 );
 });
}
function toggleChat(enable) {
 try {
 const newStatus = Boolean(enable);
 ChatDB.set(GLOBAL_CHAT_STATUS_KEY, newStatus);
 const savedStatus = ChatDB.get(GLOBAL_CHAT_STATUS_KEY);
 if (savedStatus === newStatus) {
 world.sendMessage(
 enable ? "§aChat has been enabled." : "§cChat has been disabled.",
 );
 return true;
 }
 return false;
 } catch (error) {
 console.warn("Error toggling chat:", error);
 return false;
 }
}
function resetChatStatus() {
 try {
 ChatDB.set(GLOBAL_CHAT_STATUS_KEY, DEFAULT_SETTINGS.chatStatus);
 ChatDB.set("chatLength", DEFAULT_SETTINGS.chatLength);
 ChatDB.set("chatCooldown", DEFAULT_SETTINGS.chatCooldown);
 ChatDB.set("bannedWords", DEFAULT_SETTINGS.bannedWords);
 if (!ChatDB.get("ChatDBDisplay-chat")) {
 ChatDB.set("ChatDBDisplay-chat", DEFAULT_FORMAT);
 }
 return ChatDB.get(GLOBAL_CHAT_STATUS_KEY) === DEFAULT_SETTINGS.chatStatus;
 } catch (error) {
 console.warn("Error resetting chat status:", error);
 return false;
 }
}
system.runTimeout(() => {
 try {
 initializeChatSettings();
 } catch (error) {
 console.warn("Error initializing chat settings on startup:", error);
 }
}, 20);
function initializeChatSettings() {
 const chatStatus = ChatDB.get(GLOBAL_CHAT_STATUS_KEY);
 const chatLength = ChatDB.get("chatLength");
 const chatCooldown = ChatDB.get("chatCooldown");
 const bannedWords = ChatDB.get("bannedWords");
 const chatFormat = ChatDB.get("ChatDBDisplay-chat");
 if (chatStatus === undefined || chatStatus === null) {
 ChatDB.set(GLOBAL_CHAT_STATUS_KEY, DEFAULT_SETTINGS.chatStatus);
 }
 if (!chatLength) {
 ChatDB.set("chatLength", DEFAULT_SETTINGS.chatLength);
 }
 if (!chatCooldown && chatCooldown !== 0) {
 ChatDB.set("chatCooldown", DEFAULT_SETTINGS.chatCooldown);
 }
 if (!bannedWords || !Array.isArray(bannedWords)) {
 ChatDB.set("bannedWords", DEFAULT_SETTINGS.bannedWords);
 }
 if (!chatFormat) {
 ChatDB.set("ChatDBDisplay-chat", DEFAULT_FORMAT);
 }
}
system.runInterval(() => {
 try {
 const chatStatus = ChatDB.get(GLOBAL_CHAT_STATUS_KEY);
 const chatLength = ChatDB.get("chatLength");
 const chatCooldown = ChatDB.get("chatCooldown");
 const bannedWords = ChatDB.get("bannedWords");
 if (
 chatStatus === null ||
 chatStatus === undefined ||
 chatLength === null ||
 chatLength === undefined ||
 chatCooldown === null ||
 chatCooldown === undefined ||
 !bannedWords
 ) {
 resetChatStatus();
 console.warn("Chat settings were missing and have been reset");
 }
 } catch (error) {
 console.warn("Error checking chat settings:", error);
 }
}, 1200);
const checkMutes = () => {
 const players = world.getPlayers();
 if (!players.length) return;
 const currentTime = Date.now();
 for (const player of players) {
 const mutedUntil = player.getDynamicProperty("mutedUntil") || 0;
 if (mutedUntil > 0 && mutedUntil <= currentTime) {
 player.setDynamicProperty("mutedUntil", 0);
 player.nameTag = player.name;
 player.sendMessage("§aMute expired.");
 }
 }
};
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
 system.runTimeout(() => {
 try {
 ensurePlayerHasRank(player);
 const oldNameTag = player.nameTag;
 player.nameTag = player.name;
 system.runTimeout(() => {
 if (player.getDynamicProperty("isMuted")) {
 player.nameTag = `§c[Muted] §r${player.name}`;
 } else if (oldNameTag !== player.name) {
 player.nameTag = oldNameTag;
 }
 }, 5);
 } catch (error) {
 console.warn(`Error in playerSpawn event for ${player.name}:`, error);
 }
 }, 10);
 if (player.getDynamicProperty("isMuted")) {
 player.nameTag = `§c[Muted] §r${player.name}`;
 }
});
system.runInterval(checkMutes, 1200);
system.runInterval(() => {
 const players = world.getPlayers();
 if (!players.length) return;
 for (const player of players) {
 ensurePlayerHasRank(player);
 }
}, 1200);
export { ChatDB, showChatSettingsMenu, toggleChat };
