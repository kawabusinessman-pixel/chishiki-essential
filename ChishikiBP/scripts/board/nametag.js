import {
 system,
 world,
 ActionFormData,
 ModalFormData,
 MessageFormData,
} from "../core.js";
import { ForceOpen } from "../function/ForceOpen.js";
import { getClan } from "../function/getClan.js";
import { getPlaceholder } from "../function/getPlaceholder";
import { getRank } from "../function/getRank.js";
import {
 getFormattedMoney,
 getFullMoney,
 useDecimalMode,
 formatMoneyValue,
} from "../function/moneySystem.js";
import { currencyDB } from "../function/getCurrency.js";
import { ClanDB } from "./data.js";
import { metricNumbers, getPlayerPing } from "../lib/game.js";
import { GlobalConfig } from "../function/GlobalConfig.js";
import { getPlayerGender } from "../function/playerGender.js";
import { sharedPlayerPlaceholders } from "./scoreboard.js";
import { forgetRenderedValue, shouldApplyRenderedValue } from "./render-cache.js";
const DEVICE_ICONS = {
 Mobile: "§e[MOBILE]§r",
 Console: "§b[CONSOLE]§r",
 Desktop: "§a[DESKTOP]§r",
};
const DEFAULT_FORMAT = "§8[§r@RANK§8] §f@DEVICE @NAME §7@PINGms@NL§r§8[§r@GENDER§8] §8[§r@CLAN§8]";
const DEFAULT_CONFIG = {
 format: DEFAULT_FORMAT,
 enabled: false,
 multiLine: true,
 lastUpdate: Date.now(),
};
function getNametagSettings() {
 try {
 const settings = GlobalConfig.get("nametag_settings");
 if (!settings) {
 GlobalConfig.set(
 "nametag_settings",
 DEFAULT_CONFIG,
 );
 return DEFAULT_CONFIG;
 }
 return typeof settings === "string" ? JSON.parse(settings) : settings;
 } catch (error) {
 console.warn("Error getting nametag settings:", error);
 return DEFAULT_CONFIG;
 }
}
function saveNametagSettings(settings) {
 try {
 const updatedSettings = {
 ...settings,
 lastUpdate: Date.now(),
 };
 GlobalConfig.set(
 "nametag_settings",
 updatedSettings,
 );
 cachedSettings = updatedSettings;
 cacheTime = Date.now();
 renderedNametags.clear();
 return true;
 } catch (error) {
 console.warn("Error saving nametag settings:", error);
 return false;
 }
}
async function handleNametagConfig(player) {
 const settings = getNametagSettings();
 const UI = new ActionFormData()
 .title("Nametag Configuration")
 .body(
 "§fCurrent Status:\n" +
 `§f• Custom Nametag: ${settings.enabled ? "§aEnabled" : "§cDisabled"}\n` +
 `§f• Multi-line Format: ${settings.multiLine ? "§aEnabled" : "§cDisabled"}\n\n` +
 "§fCurrent Format:\n" +
 "§7▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n" +
 `${settings.format || DEFAULT_FORMAT}\n` +
 "§7▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n" +
 "§fFormat Examples:\n" +
 "§7▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n" +
 "§8[§r@RANK§8] §f@DEVICE @NAME §7@PINGms@NL§r§8[§r@GENDER§8] §8[§r@CLAN§8]\n" +
 "§8[§r@RANK§8] §f@NAME§7(§c@HEALTH❤§7)@NL§r§8[§r@CLAN§8]\n" +
 "§8[§r@RANK§8] §f@NAME@NL§8[§f@X§7, §f@Y§7, §f@Z§7]\n" +
 "§7▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n" +
 "§fAvailable Placeholders:\n" +
 "§7▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n" +
 "§f@NAME - Player name\n" +
 "§f@DEVICE - Player device type\n" +
 "§f@RANK - Player rank\n" +
 "§f@CLAN - Player clan\n" +
 "§f@GENDER - Player gender\n" +
 "§f@PING - Player ping (ms)\n" +
 "§f@NL - New line\n" +
 "§f@HEALTH - Player health\n" +
 "§f@LEVEL - Player level\n" +
 "§f@XP - Total experience\n" +
 "§f@KILL - Kill count\n" +
 "§f@DEATH - Death count\n" +
 "§f@DIMENSION - Player dimension\n" +
 "§f@X - Player X position\n" +
 "§f@Y - Player Y position\n" +
 "§f@Z - Player Z position\n" +
 "§f@MONEY - Player money\n" +
 "§f@CURRENCY - Currency symbol\n" +
 "§7▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬",
 )
 .button(
 "Configure Settings\n§8Edit nametag options",
 "textures/ui/button_custom/settings",
 )
 .button(
 "Edit Format\n§8Customize nametag format",
 "textures/ui/button_custom/Object-7ce37",
 )
 .button(
 "Reset to Default\n§8Restore default settings",
 "textures/ui/refresh",
 )
 .button("Cancel", "textures/ui/cancel");
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 switch (result.selection) {
 case 0:
 await handleToggleSettings(player);
 break;
 case 1:
 await handleEditFormat(player);
 break;
 case 2:
 await handleResetNametag(player);
 break;
 }
}
async function handleToggleSettings(player) {
 const settings = getNametagSettings();
 const UI = new ModalFormData()
 .title("Nametag Settings")
 .toggle("§fEnable Custom Nametag\n§8Use custom nametag format", {
 defaultValue: Boolean(settings.enabled),
 })
 .toggle("§fMulti-line Format\n§8Use multiple lines", {
 defaultValue: Boolean(settings.multiLine ?? true),
 })
 .toggle("§fApply Immediately\n§8Update nametags now", {
 defaultValue: true,
 });
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 const [enabled, multiLine, applyImmediately] = result.formValues;
 const updatedSettings = {
 ...settings,
 enabled,
 multiLine,
 };
 if (saveNametagSettings(updatedSettings)) {
 if (applyImmediately) {
 player.sendMessage("§a Nametag settings updated successfully!");
 } else {
 player.sendMessage("§a Settings will be applied after reload");
 }
 player.playSound("random.levelup");
 } else {
 player.sendMessage("§c Failed to update settings!");
 player.playSound("note.bass");
 }
}
async function handleEditFormat(player) {
 const settings = getNametagSettings();
 const currentFormat = settings.format || DEFAULT_FORMAT;
 const editUI = new ModalFormData()
 .title("Edit Nametag Format")
 .textField("§fFormat", currentFormat, {
 defaultValue: currentFormat,
 placeholder: DEFAULT_FORMAT,
 })
 .toggle("§fApply Immediately\n§8Update nametags now", {
 defaultValue: true,
 });
 const result = await ForceOpen(player, editUI);
 if (result.canceled) return;
 const [format, applyImmediately] = result.formValues;
 if (!format?.trim()) {
 player.sendMessage("§c Format cannot be empty!");
 player.playSound("note.bass");
 return;
 }
 const updatedSettings = {
 ...settings,
 format: format.trim(),
 };
 if (saveNametagSettings(updatedSettings)) {
 if (applyImmediately) {
 player.sendMessage("§a Nametag format updated successfully!");
 const health = Math.round(
 player.getComponent("minecraft:health")?.currentValue || 20,
 );
 const totalXp = player.getTotalXp ? player.getTotalXp() : 0;
 const finalPreview = getPlaceholder(format.trim(), [
 {
 NAME: player.name,
 FULL_NAME: player.name,
 DEVICE: DEVICE_ICONS[player.clientSystemInfo?.platformType] || "",
 RANK: getRank(player),
 CLAN: getClan(player) || getDefaultClan(),
 GENDER: getPlayerGender(player) || "None",
 PING: getPlayerPing(player) ?? 0,
 NL: "\n",
 HEALTH: health,
 LEVEL: player.getTotalXp
 ? Math.floor(Math.sqrt(player.getTotalXp() / 100)) + 1
 : 0,
 XP: totalXp,
 MONEY: formatMoneyValue(getFullMoney(player) || 0n),
 CURRENCY: currencyDB.get("CurrencyDBConfig-default") || "$",
 KILL: (() => {
 try {
 const objective = world.scoreboard.getObjective("kill");
 if (objective) {
 const participants = objective.getParticipants();
 const participant = participants.find(
 (p) => p.displayName === player.name,
 );
 return participant ? objective.getScore(participant) || 0 : 0;
 }
 return 0;
 } catch {
 return 0;
 }
 })(),
 DEATH: (() => {
 try {
 const objective = world.scoreboard.getObjective("death");
 if (objective) {
 const participants = objective.getParticipants();
 const participant = participants.find(
 (p) => p.displayName === player.name,
 );
 return participant ? objective.getScore(participant) || 0 : 0;
 }
 return 0;
 } catch {
 return 0;
 }
 })(),
 DIMENSION: player.dimension.id.replace("minecraft:", ""),
 X: Math.floor(player.location.x),
 Y: Math.floor(player.location.y),
 Z: Math.floor(player.location.z),
 },
 ]);
 player.sendMessage(
 "§7▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n" + finalPreview + "\n§7▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬",
 );
 } else {
 player.sendMessage("§a Format will be applied after reload");
 }
 player.playSound("random.levelup");
 } else {
 player.sendMessage("§c Failed to update format!");
 player.playSound("note.bass");
 }
}
async function handleResetNametag(player) {
 try {
 const UI = new MessageFormData()
 .title("Reset Nametag")
 .body(
 "§fAre you sure you want to reset all nametag settings to default?\n\n§7This will:\n§7• Disable custom nametag\n§7• Reset format to default\n§7• Clear all custom settings",
 )
 .button1("§aReset")
 .button2("§cCancel");
 const result = await ForceOpen(player, UI);
 if (result.canceled || result.selection === 1) return;
 const resetSuccess = saveNametagSettings({
 ...DEFAULT_CONFIG,
 lastUpdate: Date.now(),
 });
	if (resetSuccess) {
	for (const p of world.getPlayers()) {
	resetPlayerNametag(p);
 }
 player.sendMessage("§a Nametag settings have been reset to default!");
 player.playSound("random.levelup");
 } else {
 player.sendMessage("§c Failed to reset settings!");
 player.playSound("note.bass");
 }
 } catch (error) {
 console.warn("Error in handleResetNametag:", error);
 player.sendMessage("§c An error occurred while resetting nametag!");
 player.playSound("note.bass");
 }
}
function getDefaultClan() {
 return ClanDB.get("ClanDBConfig-default") || "None";
}
let cachedSettings = null;
let cacheTime = 0;
const CACHE_DURATION = 200;
function getCachedSettings() {
 const now = Date.now();
 if (!cachedSettings || now - cacheTime > CACHE_DURATION * 50) {
 cachedSettings = getNametagSettings();
 cacheTime = now;
 }
 return cachedSettings;
}
function getPlayerScore(player, objectiveName) {
 try {
 const obj = world.scoreboard.getObjective(objectiveName);
 return obj?.getScore(player) ?? 0;
 } catch { return 0; }
}
let wasNametagEnabled = true;
const renderedNametags = new Map();

function resetPlayerNametag(player) {
 forgetRenderedValue(renderedNametags, player.id);
 try { player.nameTag = player.name; } catch { }
}

function applyPlayerNametag(player, text) {
 if (!shouldApplyRenderedValue(renderedNametags, player.id, text)) {
  try {
   if (player.nameTag === text) return true;
  } catch { }
 }
 try {
  player.nameTag = text;
  return true;
 } catch {
  forgetRenderedValue(renderedNametags, player.id);
  return false;
 }
}

system.runInterval(() => {
	try {
		const settings = getCachedSettings();
		if (!settings?.enabled) {
			if (wasNametagEnabled) {
				wasNametagEnabled = false;
				for (const p of world.getPlayers()) resetPlayerNametag(p);
			}
			return;
		}
		wasNametagEnabled = true;
		const players = world.getPlayers();
		if (!players.length) return;

		const defaultClan = getDefaultClan();
		const currency = currencyDB.get("CurrencyDBConfig-default") || "$";
		let format = settings.format || DEFAULT_FORMAT;
		if (!settings.multiLine) format = format.replace(/@NL/g, " ");
		const now = Date.now();
		for (const player of players) {
			try {
				const cached = sharedPlayerPlaceholders.get(player.id);
				const isCachedValid = cached && (now - cached._time) < 6000;
				const health = (isCachedValid && cached?.HEALTH !== undefined)
					? cached.HEALTH
					: Math.round(player.getComponent("minecraft:health")?.currentValue ?? 20);
				const totalXp = (isCachedValid && cached?.XP !== undefined)
					? cached.XP
					: (player.getTotalXp?.() ?? 0);
				const rank = (isCachedValid && cached?.RANK) ? cached.RANK : getRank(player);
				const clan = (isCachedValid && cached?.CLAN) ? cached.CLAN : (getClan(player) || defaultClan);
				const gender = (isCachedValid && cached?.GENDER) ? cached.GENDER : (getPlayerGender(player) || "None");
				const ping = (isCachedValid && cached?.PING !== undefined) ? cached.PING : getPlayerPing(player);
				const money = (isCachedValid && cached?.MONEY !== undefined) ? cached.MONEY : formatMoneyValue(getFullMoney(player) || 0n);
				const curr = (isCachedValid && cached?.CURRENCY !== undefined) ? cached.CURRENCY : currency;
				const kill = (isCachedValid && cached?.KILL !== undefined) ? cached.KILL : getPlayerScore(player, "kill");
				const death = (isCachedValid && cached?.DEATH !== undefined) ? cached.DEATH : getPlayerScore(player, "death");
				const dimension = (isCachedValid && cached?.DIMENSION) ? cached.DIMENSION : player.dimension.id.replace("minecraft:", "");
				const x = (isCachedValid && cached?.X !== undefined) ? cached.X : Math.floor(player.location.x);
				const y = (isCachedValid && cached?.Y !== undefined) ? cached.Y : Math.floor(player.location.y);
				const z = (isCachedValid && cached?.Z !== undefined) ? cached.Z : Math.floor(player.location.z);

				const placeholders = {
					...(isCachedValid ? cached : {}),
					NAME: player.name,
					FULL_NAME: player.name,
					DEVICE: DEVICE_ICONS[player.clientSystemInfo?.platformType] || "",
					RANK: rank,
					CLAN: clan,
					GENDER: gender,
					PING: ping,
					NL: "\n",
					HEALTH: health,
					LEVEL: Math.floor(Math.sqrt(totalXp / 100)) + 1,
					XP: totalXp,
					MONEY: money,
					CURRENCY: curr,
					KILL: kill,
					DEATH: death,
					DIMENSION: dimension,
					X: x,
					Y: y,
					Z: z,
				};

				const text = getPlaceholder(format, [placeholders]);
				if (!applyPlayerNametag(player, text)) resetPlayerNametag(player);
			} catch { resetPlayerNametag(player); }
		}
	} catch { }
}, 60);
world.afterEvents.playerLeave?.subscribe?.(({ playerId }) => {
 forgetRenderedValue(renderedNametags, playerId);
});
export function invalidateNametagCache() {
 cachedSettings = null;
 renderedNametags.clear();
}
export { handleNametagConfig };
