import {
 ModalFormData,
 MessageFormData,
 ActionFormData,
 system,
 world,
} from "../core.js";
import { getPlaceholder } from "../function/getPlaceholder.js";
import {
 getFullMoney,
 formatMoneyValue,
} from "../function/moneySystem.js";
import { ForceOpen } from "../function/ForceOpen.js";
import { notifyConfigChange } from "./_config.js";
import { getRank } from "../function/getRank.js";
import { getClan, clanDB } from "../function/getClan.js";
import { currencyDB } from "../function/getCurrency.js";
import { ChatDB, RankDB } from "./data.js";
import { metricNumbers, getPlayerPing } from "../lib/game.js";
import { GlobalConfig } from "../function/GlobalConfig.js";
import { isRankColorChatEnabled, getRankColorForChat } from "../plugins/ranks/rank_color_chat.js";
import { getPlayerGender } from "../function/playerGender.js";
const DEVICE_ICONS = {
 Mobile: "§e[MOBILE]§r",
 Console: "§b[CONSOLE]§r",
 Desktop: "§a[DESKTOP]§r",
};
export const DEFAULT_FORMAT = "§8[§r@RANK§8] §8[§r@CLAN§8] §f@DEVICE §7@NAME >>§r @MSG";
const CUSTOM_CHAT_STATUS_KEY = "ChatDBDisplay-custom-status";
const DEFAULT_CONFIG = {
 format: DEFAULT_FORMAT,
 enabled: true,
 multiLine: false,
 showTime: false,
 lastUpdate: Date.now(),
};
const CACHE = {
 settings: { ...DEFAULT_CONFIG },
 currency: "$",
 defaultRank: "",
 defaultClan: "None",
 initialized: false
};
function getTimeData() {
 const timezone = GlobalConfig.get("time:timezone") ?? "UTC+7";
 const offset = parseInt(timezone.replace("UTC", "")) || 0;
 const now = Date.now();
 const date = new Date(now + (offset * 3600000));
 return {
 hour: date.getUTCHours().toString().padStart(2, "0"),
 minute: date.getUTCMinutes().toString().padStart(2, "0")
 };
}
function updateCache() {
 let settings = null;
 try {
 const raw = GlobalConfig.get("chat_settings");
 if (raw) settings = typeof raw === "string" ? JSON.parse(raw) : raw;
 } catch { }
 if (!settings) {
 try {
 settings = {
 format: ChatDB.get("ChatDBDisplay-chat") || DEFAULT_FORMAT,
 enabled: ChatDB.get(CUSTOM_CHAT_STATUS_KEY) !== false,
 multiLine: ChatDB.get("ChatDBDisplay-multiLine") || false,
 showTime: Boolean(ChatDB.get("ChatDBDisplay-showTime")),
 lastUpdate: Date.now()
 };
 } catch {
 settings = { ...DEFAULT_CONFIG };
 }
 }
 CACHE.settings = settings;
 try {
 CACHE.currency = currencyDB.get("CurrencyDBConfig-default") || "$";
 CACHE.defaultRank = RankDB.get("RankDBConfig-default") || "";
 CACHE.defaultClan = clanDB.get("ClanDBConfig-default") || "None";
 } catch { }
 CACHE.initialized = true;
}
function saveChatSettings(settings) {
 try {
 ChatDB.set("ChatDBDisplay-chat", settings.format);
 ChatDB.set(CUSTOM_CHAT_STATUS_KEY, settings.enabled);
 ChatDB.set("ChatDBDisplay-multiLine", settings.multiLine);
 ChatDB.set("ChatDBDisplay-showTime", settings.showTime);
 GlobalConfig.set("chat_settings", settings);
 CACHE.settings = settings;
 return true;
 } catch (error) {
 return false;
 }
}
export function formatChatMessage(player, message) {
 if (!CACHE.initialized) updateCache();
 if (!CACHE.settings.enabled) return null;
 try {
 let format = CACHE.settings.format;
 const showTime = CACHE.settings.showTime;
 const timeData = getTimeData();
 let timeValue = "";
 if (showTime) {
 timeValue = `${timeData.hour}:${timeData.minute}`;
 if (!format.includes("@TIME")) {
 format = `§7[${timeValue}]§r ` + format;
 }
 } else {
 if (format.includes("@TIME")) {
 format = format.replace(/@TIME/g, "");
 format = format
 .replace(/\s*\[\]\s*/g, " ")
 .replace(/\s*:\s*:/g, ":")
 .replace(/\s{2,}/g, " ")
 .trim();
 }
 }
 if (!CACHE.settings.multiLine) {
 message = message.replace(/\n/g, " ");
 }
 const placeholders = {
 MSG: message,
 NAME: player.name,
 NL: "\n",
 DEVICE: DEVICE_ICONS[player.clientSystemInfo?.platformType] || "",
 CURRENCY: CACHE.currency,
 TIME: timeValue,
 HOUR: timeData.hour,
 MINUTE: timeData.minute,
 };
 if (isRankColorChatEnabled()) {
  const rankColor = getRankColorForChat(player);
  if (rankColor) {
   placeholders.MSG = `${rankColor}${message}`;
  }
 }
  if (format.includes("@RANK")) {
  const r = getRank(player);
  placeholders.RANK = r || CACHE.defaultRank;
  }
  if (format.includes("@CLAN")) {
  const c = getClan(player);
  placeholders.CLAN = (c && c !== "§fNone") ? c : CACHE.defaultClan;
  }
  if (format.includes("@GENDER")) {
  placeholders.GENDER = getPlayerGender(player) || "None";
  }
  if (format.includes("@PING")) {
  placeholders.PING = getPlayerPing(player) ?? 0;
  }
  if (format.includes("@MONEY")) {
  placeholders.MONEY = formatMoneyValue(getFullMoney(player) || 0n);
  }
  if (format.includes("@HEALTH")) {
  const h = player.getComponent("minecraft:health");
  placeholders.HEALTH = h ? Math.round(h.currentValue) : 20;
  }
  if (format.includes("@LEVEL")) {
  placeholders.LEVEL = player.level;
  }
  if (format.includes("@DIMENSION")) {
  placeholders.DIMENSION = player.dimension.id.replace("minecraft:", "");
  }
  return getPlaceholder(format, [placeholders]);
 } catch (error) {
 return `§7${player.name}: §f${message}`;
 }
}
export async function handleChatDisplay(player) {
 if (!CACHE.initialized) updateCache();
 const settings = CACHE.settings;
 const UI = new ActionFormData()
 .title("Chat Configuration")
 .body(
 "§fCurrent Status:\n" +
 `§f• Custom Chat: ${settings.enabled ? "§aEnabled" : "§cDisabled"}\n` +
 `§f• Multi-line Format: ${settings.multiLine ? "§aEnabled" : "§cDisabled"}\n` +
 `§f• Show Time: ${settings.showTime ? "§aEnabled" : "§cDisabled"}\n\n` +
 "§fCurrent Format:\n" +
 "§7▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n" +
 `${settings.format || DEFAULT_FORMAT}\n` +
 "§7▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬"
 )
 .button("Configure Settings\n§8Edit chat options", "textures/ui/button_custom/settings")
 .button("Edit Format\n§8Customize chat format", "textures/ui/button_custom/Object-7ce37")
 .button("Reset to Default\n§8Restore default settings", "textures/ui/refresh")
 .button("Cancel", "textures/ui/cancel");
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 switch (result.selection) {
 case 0: await handleToggleSettings(player); break;
 case 1: await handleEditFormat(player); break;
 case 2: await handleResetChat(player); break;
 }
}
async function handleToggleSettings(player) {
 const settings = CACHE.settings;
 const UI = new ModalFormData()
 .title("Chat Settings")
 .toggle("§fEnable Custom Chat", { defaultValue: settings.enabled })
 .toggle("§fMulti-line Format", { defaultValue: settings.multiLine })
 .toggle("§fShow Time", { defaultValue: settings.showTime })
 .toggle("§fApply Immediately", { defaultValue: true });
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 const [newEnabled, multiLine, showTime, applyImmediately] = result.formValues;
 const updatedSettings = { ...settings, enabled: newEnabled, multiLine, showTime };
 if (saveChatSettings(updatedSettings)) {
 if (applyImmediately) notifyConfigChange();
 player.sendMessage("§a Chat settings updated successfully!");
 player.playSound("random.levelup");
 } else {
 player.sendMessage("§c Failed to update settings!");
 }
}
async function handleEditFormat(player) {
 const settings = CACHE.settings;
 const currentFormat = settings.format || DEFAULT_FORMAT;
 const editUI = new ModalFormData()
 .title("Edit Chat Format")
 .textField("§fFormat", currentFormat, { defaultValue: currentFormat })
 .toggle("§fApply Immediately", { defaultValue: true });
 const result = await ForceOpen(player, editUI);
 if (result.canceled) return;
 const [format, applyImmediately] = result.formValues;
 if (!format?.trim()) {
 player.sendMessage("§c Format cannot be empty!");
 return;
 }
 const updatedSettings = { ...settings, format: format.trim() };
 if (saveChatSettings(updatedSettings)) {
 if (applyImmediately) {
 notifyConfigChange();
 player.sendMessage("§a Chat format updated!");
 const preview = formatChatMessage(player, "Hello World");
 if (preview) player.sendMessage(preview);
 } else {
 player.sendMessage("§a Format will be applied after reload");
 }
 player.playSound("random.levelup");
 }
}
async function handleResetChat(player) {
 const UI = new MessageFormData()
 .title("Reset Chat Format")
 .body("§fAre you sure you want to reset all chat settings to default?")
 .button1("§aReset")
 .button2("§cCancel");
 const result = await ForceOpen(player, UI);
 if (result.selection === 1) return;
 if (saveChatSettings(DEFAULT_CONFIG)) {
 notifyConfigChange();
 player.sendMessage("§a Chat settings reset!");
 player.playSound("random.levelup");
 }
}
system.run(() => {
 updateCache();
 if (!GlobalConfig.get("chat_settings")) {
 saveChatSettings(CACHE.settings);
 }
});
