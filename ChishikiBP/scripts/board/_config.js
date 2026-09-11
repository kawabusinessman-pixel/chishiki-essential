import { ScoreboardDB, ScoreboardLines } from "./data.js";
import { system } from "../core.js";
import { globalCache } from "../lib/cache.js";
import { GlobalConfig } from "../function/GlobalConfig.js";

const DEFAULT_MAX_ONLINE = "10";

function getMaxOnlineSlots() {
 const configured = ScoreboardDB.get("ScoreboardDBConfig-max-online");
 if (configured !== undefined && configured !== null && String(configured).trim() !== "") {
 return String(configured).trim();
 }
 const legacy = GlobalConfig.get("scoreboard:maxOnline");
 if (legacy !== undefined && legacy !== null && String(legacy).trim() !== "") {
 return String(legacy).trim();
 }
 return DEFAULT_MAX_ONLINE;
}

function setMaxOnlineSlots(value) {
 const slots = String(value ?? "").trim() || DEFAULT_MAX_ONLINE;
 ScoreboardDB.set("ScoreboardDBConfig-max-online", slots);
 GlobalConfig.set("scoreboard:maxOnline", slots);
 globalCache.set("lastUpdate", Date.now());
 return slots;
}
const CACHE_CONFIG = {
 maxAge: 300000,
 updateInterval: 10,
};
const configListeners = new Set();
function subscribeToConfig(listener) {
 configListeners.add(listener);
 return () => configListeners.delete(listener);
}
function notifyConfigChange() {
 const now = Date.now();
 globalCache.set("lastUpdate", now);
 globalCache.delete("lines");
 globalCache.delete("title");
 const listeners = Array.from(configListeners);
 for (const element of listeners) {
 element();
 }
}
const DEFAULT_LINES = [
 "§b§lPROFILES§r",
 "§9| §r§7NAME : §f@NAME",
 "§9| §r§7MONEY : §f@CURRENCY@MONEY",
 "§9| §r§7CLAN : §f@CLAN",
 "§9| §r§7RANK : §f@RANK",
 "@BLANK",
 "§b§lSERVERS§r",
 "§9| §r§7ONLINE : §f@ONLINE/@MAXON",
 "§9| §r§7KD : §f@KILL:@DEATH",
 "§9| §r§7PLAY : §f@PLAYTIME",
 "§9| §r§7CLEAR : §f@CLEARLAG",
 "§9| §r§7DIM : §f@DIMENSION",
 "@BLANK",
];


const SCOREBOARD_PRESETS = [
 {
 id: "classic",
  name: "§bClassic Default",
  label: "§bClassic Default",
  desc: "Balanced player and server overview",
 icon: "textures/board/presets/classic",
 lines: DEFAULT_LINES,
 },
 {
 id: "minimal",
  name: "§7Minimal Clean",
  label: "§7Minimal Clean",
  desc: "Name, money, and online count",
 icon: "textures/board/presets/minimal",
 lines: [
 "§f@NAME",
 "§7@CURRENCY@MONEY",
 "§8@ONLINE/@MAXON",
 ],
 },
 {
 id: "economy",
  name: "§eEconomy Wallet",
  label: "§eEconomy Wallet",
  desc: "Money, bank, and coin focus",
 icon: "textures/board/presets/economy",
 lines: [
 "§e§lWALLET§r",
 "§6» §f@NAME",
 "§6» §7Cash §e@CURRENCY@MONEY",
 "§6» §7Bank §a@CURRENCY@BANK",
 "§6» §7Coin §6@COIN",
 "@BLANK",
 "§8@ONLINE online",
 ],
 },
 {
 id: "combat",
  name: "§4Combat PvP",
  label: "§4Combat PvP",
  desc: "K/D, health, and ping",
 icon: "textures/board/presets/combat",
 lines: [
 "§4§lCOMBAT§r",
 "§c⚔ §f@NAME",
 "§c» §7Rank §d@RANK",
 "§c» §7HP §c@HEALTH",
 "§c» §7K/D §f@KILL§8/§f@DEATH",
 "§c» §7Ping §a@PINGms",
 "@BLANK",
 "§8@ONLINE/@MAXON",
 ],
 },
 {
 id: "sky",
  name: "§bSky Coordinates",
  label: "§bSky Coordinates",
  desc: "Location, dimension, and coordinates",
 icon: "textures/board/presets/sky",
 lines: [
 "§b§lLOCATION§r",
 "§3◆ §f@NAME",
 "§3◆ §7@DIMENSION",
 "§3◆ §f@X §8| §f@Y §8| §f@Z",
 "@BLANK",
 "§7TPS §a@TPS §8· §7@HOUR:@MINUTE",
 ],
 },
 {
 id: "clan",
  name: "§dClan Social",
  label: "§dClan Social",
  desc: "Clan, rank, homes, and lands",
 icon: "textures/board/presets/clan",
 lines: [
 "§d§lSOCIAL§r",
 "§5› §f@NAME",
 "§5› §7Rank §d@RANK",
 "§5› §7Clan §b@CLAN",
 "@BLANK",
 "§7Homes §f@HOMESMAX",
 "§7Lands §f@LANDSMAX",
 "§8@ONLINE online",
 ],
 },
 {
 id: "kawaii",
  name: "§dKawaii Pastel",
  label: "§dKawaii Pastel",
  desc: "Pastel separators and social stats",
 icon: "textures/board/presets/kawaii",
 lines: [
 "§d──── ୨୧ ────§r",
 "§f@NAME",
 "§d─── ⋆⋅☆⋅⋆ ───§r",
 "§f» §d@RANK",
 "§f» §b@CLAN",
 "§f» §e@CURRENCY@MONEY",
 "§d─── ⋆⋅☆⋅⋆ ───§r",
 "§7@ONLINE/@MAXON · @TPS tps",
 "§d──── ୨୧ ────§r",
 ],
 },
 {
 id: "neon",
  name: "§aNeon Status",
  label: "§aNeon Status",
  desc: "Full player and server status",
 icon: "textures/board/presets/neon",
 lines: [
 "§a§lSERVER§r",
 "§a| §f@NAME",
 "§a| §7@RANK §8· §b@CLAN",
 "§a| §e@CURRENCY@MONEY",
 "§a| §7HP §c@HEALTH §8· §7Lv §f@LEVEL",
 "@BLANK",
 "§a| §7@ONLINE/@MAXON",
 "§a| §7TPS §a@TPS §8· §7@PINGms",
 "§a| §7@DIMENSION",
 ],
 },
 {
 id: "compact",
  name: "§8Compact Lite",
  label: "§8Compact Lite",
  desc: "Short one-line status summary",
 icon: "textures/board/presets/compact",
 lines: [
 "§f@NAME §8| §d@RANK",
 "§e@CURRENCY@MONEY §8| §6@COIN",
 "§c@KILL§8/§7@DEATH §8| §a@PINGms",
 "§b@ONLINE§8/§7@MAXON §8| §a@TPS",
 ],
 },
 {
 id: "admin",
  name: "§6Staff Monitor",
  label: "§6Staff Monitor",
  desc: "TPS, ping, and coordinates",
 icon: "textures/board/presets/admin",
 lines: [
 "§6§lSTAFF§r",
 "§e• §f@NAME",
 "§e• §7TPS §a@TPS",
 "§e• §7Ping §a@PINGms",
 "§e• §7@DIMENSION",
 "§e• §f@X §7@Y §f@Z",
 "§e• §7@ONLINE/@MAXON",
 "§e• §7@HOUR:@MINUTE §8@DAY/@MONTH/@YEAR",
 ],
 },
];

const board = {
 get Line() {
 const isEnabled = ScoreboardDB.get("ScoreboardDBConfig-enabled") ?? true;
 if (!isEnabled) return [];
 const cachedLines = globalCache.get("lines");
 if (cachedLines) {
 return cachedLines;
 }
 let customLines = ScoreboardLines.get("lines");
 if (!customLines) {
 customLines = ScoreboardDB.get("ScoreboardDBConfig-lines");
 }
 const lines = customLines || DEFAULT_LINES;
 globalCache.set("lines", lines);
 globalCache.set("lastUpdate", Date.now());
 return lines;
 },
};
system.runInterval(() => {
 globalCache.cleanup();
}, 6000);
export {
 board,
 subscribeToConfig,
 notifyConfigChange,
 DEFAULT_LINES,
 SCOREBOARD_PRESETS,
 DEFAULT_MAX_ONLINE,
 getMaxOnlineSlots,
 setMaxOnlineSlots,
};
