import { world } from "../../core.js";
import { getClanLeaderboardData } from "../clan/clan.js";
import { getScore, metricNumbers } from "../../lib/game.js";
import { getFullMoney, formatMoneyValue, useDecimalMode } from "../../function/moneySystem.js";
import { getBank } from "../bank/bank.js";
export const MONEY_DISPLAY_OPTIONS = { FULL: "full", TRUNCATED: "truncated", STARS: "stars" };
let moneyDisplayMode = MONEY_DISPLAY_OPTIONS.TRUNCATED;
export function getMoneyDisplayMode() {
 return world.getDynamicProperty("sft:moneyDisplayMode") || moneyDisplayMode;
}
export function setMoneyDisplayMode(mode) {
 if (Object.values(MONEY_DISPLAY_OPTIONS).includes(mode)) {
 world.setDynamicProperty("sft:moneyDisplayMode", mode);
 moneyDisplayMode = mode;
 }
}
export function formatMoneyDisplay(value) {
 if (value === undefined || value === null) return "0";
 if (useDecimalMode()) {
 try { return formatMoneyValue(BigInt(value)); } catch { return "0"; }
 }
 const mode = getMoneyDisplayMode();
 switch (mode) {
 case MONEY_DISPLAY_OPTIONS.FULL: return value.toString();
 case MONEY_DISPLAY_OPTIONS.STARS: return "****";
 default: return metricNumbers(value.toString());
 }
}
function formatPlaytime(score, unitIndex) {
 switch (unitIndex) {
 case 0: return `${score} Seconds`;
 case 1: return `${Math.floor(score / 60)} Minute`;
 case 2: return `${(score / 3600).toFixed(2)} Hours`;
 case 3: return `${(score / 86400).toFixed(2)} Days`;
 default: return `${score} Seconds`;
 }
}
function getPlaytimeNumericValue(score, unitIndex) {
 switch (unitIndex) {
 case 0: return score;
 case 1: return score / 60;
 case 2: return score / 3600;
 case 3: return score / 86400;
 default: return score;
 }
}
let playerScoreCache = new Map();
let cacheTime = 0;
const CACHE_DURATION = 5000;
/**
 * Creates one cache shared by every record rendered during a scheduler pass.
 * @returns {{players: object[] | null, playerScores: Map<string, object>, clanData: object[] | null, clanRankings: Map<string, object[]>}}
 */
export function createLeaderboardRenderContext() {
 return {
 players: null,
 playerScores: new Map(),
 clanData: null,
 clanRankings: new Map(),
 };
}
function buildPlayerScores(objectiveId, unitIndex, players) {
 const scores = {};
 const numericScores = {};
 for (const player of players) {
 const name = player.name;
 if (objectiveId === "money") {
 const moneyAmount = getFullMoney(player) || 0;
 scores[name] = moneyAmount.toString();
 numericScores[name] = parseInt(moneyAmount.toString());
 } else if (objectiveId === "bank") {
 const bankAmount = getBank(player) || 0n;
 scores[name] = bankAmount.toString();
 numericScores[name] = parseInt(bankAmount.toString());
 } else if (objectiveId === "coin") {
 const coinAmount = getScore(player, "coin") || 0;
 scores[name] = coinAmount;
 numericScores[name] = coinAmount;
 } else if (objectiveId === "playtime" || objectiveId === "online_time") {
 const score = getScore(player, "playtime") || 0;
 numericScores[name] = getPlaytimeNumericValue(score, unitIndex ?? 2);
 scores[name] = formatPlaytime(score, unitIndex ?? 2);
 } else {
 const score = getScore(player, objectiveId) || 0;
 scores[name] = score;
 numericScores[name] = score;
 }
 }
 return { scores, numericScores, playerCount: players.length };
}
function getCachedPlayerScores(objectiveId, unitIndex, context = null) {
 const cacheKey = `${objectiveId}_${unitIndex}`;
 if (context) {
 if (context.playerScores.has(cacheKey)) return context.playerScores.get(cacheKey);
 if (context.players === null) context.players = world.getPlayers();
 const result = buildPlayerScores(objectiveId, unitIndex, context.players);
 context.playerScores.set(cacheKey, result);
 return result;
 }
 const now = Date.now();
 if (now - cacheTime > CACHE_DURATION) {
 playerScoreCache.clear();
 cacheTime = now;
 }
 if (playerScoreCache.has(cacheKey)) {
 return playerScoreCache.get(cacheKey);
 }
 const result = buildPlayerScores(objectiveId, unitIndex, world.getPlayers());
 playerScoreCache.set(cacheKey, result);
 return result;
}
function getLeaderboardLimit(data, fallback = 10) {
  const raw = Number(data?.[7]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(15, Math.floor(raw)));
}
function getCachedClanLeaderboardData(context) {
 if (context && context.clanData !== null) return context.clanData;
 const clanData = getClanLeaderboardData();
 if (context) context.clanData = clanData;
 return clanData;
}
function getCachedClanRanking(context, field) {
 const clanData = getCachedClanLeaderboardData(context);
 if (!context) return clanData.slice().sort((a, b) => b[field] - a[field]);
 if (context.clanRankings.has(field)) return context.clanRankings.get(field);
 const ranking = clanData.slice().sort((a, b) => b[field] - a[field]);
 context.clanRankings.set(field, ranking);
 return ranking;
}
function clanEntries(data, clanLimit, clanData, fallback) {
  const entries = clanData.slice(0, clanLimit).map((clan, i) => fallback(clan, i));
  const sep = "§8" + "=".repeat(28);
  return [`§l§d${data[0] || "CLAN LEADERBOARD"}§r`, sep, ...entries, sep].join("\n");
}
export function renderLeaderboardRecord(record, context = null) {
  const data = record.data;
  if (!Array.isArray(data)) return null;
  const clanLimit = getLeaderboardLimit(data, 10);
  const sep = "§8" + "=".repeat(28);
  if (data[1] !== "online_time" && !data[1].startsWith("clan_") && !world.scoreboard.getObjective(data[1])) {
    try {
      world.getDimension("overworld").runCommand(`scoreboard objectives add ${data[1]} dummy`);
    } catch {}
    if (!world.scoreboard.getObjective(data[1])) {
      return { text: `§l${data[0] || "LEADERBOARD"}§r\n§8` + "=".repeat(28) + `\n§cScoreboard '${data[1]}' not found!`, cacheChanged: false };
    }
  }
  if (data[1] === "clan_leaderboard") {
  return { text: clanEntries(data, clanLimit, getCachedClanLeaderboardData(context), (clan, i) =>
  `§7#${i + 1} §8${clan.tag} §r${clan.name}§r\n§7Level: §a${clan.level} §8| §e${clan.memberCount} members §8| §a${clan.onlineCount} online`), cacheChanged: false };
  }
  if (data[1] === "clan_member_count") {
  return { text: clanEntries(data, clanLimit, getCachedClanRanking(context, "memberCount"), (clan, i) =>
  `§7#${i + 1} §8${clan.tag} §r${clan.name}§r\n§7Members: §e${clan.memberCount} §8| §a${clan.onlineCount} online`), cacheChanged: false };
  }
  if (data[1] === "clan_level") {
  return { text: clanEntries(data, clanLimit, getCachedClanRanking(context, "level"), (clan, i) =>
  `§7#${i + 1} §r${clan.name}§r\n§7Level: §a${clan.level} §8| §e${clan.memberCount} members`), cacheChanged: false };
  }
 const unitIndex = data[9] ?? 2;
 const cached = getCachedPlayerScores(data[1], unitIndex, context);
 const { scores, numericScores, playerCount } = cached;
 const cachedScores = data[8] || {};
 const cachedNumericScores = data[10] || {};
 const beforeCount = Object.keys(cachedScores).length;
 Object.assign(cachedScores, scores);
 Object.assign(cachedNumericScores, numericScores);
 if (data[1] === "online_time") {
 for (const name in cachedScores) {
 if (!scores[name]) { delete cachedScores[name]; delete cachedNumericScores[name]; }
 }
 }
 const cacheChanged = Object.keys(cachedScores).length !== beforeCount;
 const sorted = Object.entries(cachedNumericScores)
 .map(([name, num]) => ({ name, numericScore: num || 0, displayScore: cachedScores[name] || 0 }))
 .sort((a, b) => data[2] ? b.numericScore - a.numericScore : a.numericScore - b.numericScore)
 .slice(0, getLeaderboardLimit(data, data[7] ?? 10));
 const colors = [data[4] || "§6", "§b", "§a"];
 const entries = sorted.map(({ name, displayScore }, i) => {
 const c = colors[i] || "§f";
 const dn = name.length > 16 ? name.substring(0, 14) + ".." : name.padEnd(16, " ");
 let fs = displayScore;
 if (data[1] === "money" || data[1] === "bank" || data[1] === "coin") fs = formatMoneyDisplay(displayScore);
 const rank = data[3] ? `${c}#${(i + 1).toString().padStart(2, " ")} §r` : "";
 return `${rank}${data[5]}${dn}§r §8| ${data[6]}${fs}§r`;
 });
 data[8] = cachedScores;
 data[10] = cachedNumericScores;
 const title = data[1] === "online_time" ? `${data[0] || "ONLINE PLAYERS"}§r\n§8(Current online: ${playerCount})` : `${data[0] || "LEADERBOARD"}§r`;
 return { text: [`§l${title}`, sep, ...entries, sep].join("\n"), cacheChanged };
}
export function getSortedObjectives() {
 const allowedObjectives = {
 money: "Money Leaderboard", bank: "Top Bank", coin: "Coin Leaderboard",
 kill: "Kill Leaderboard", death: "Death Leaderboard", clan_leaderboard: "Top Clan (Overall)",
 clan_level: "Clan Level Ranking", clan_member_count: "Clan Member Count", mining: "Top Mining",
 };
 const priority = ["money", "bank", "coin", "kill", "death", "clan_leaderboard", "clan_level", "clan_member_count", "mining"];
 const existingObjectives = world.scoreboard.getObjectives();
 const allObjectives = existingObjectives.map(obj => ({ id: obj.id, displayName: allowedObjectives[obj.id] ?? obj.displayName }));
 for (const id of priority) {
 if (!allObjectives.find(obj => obj.id === id)) allObjectives.push({ id, displayName: allowedObjectives[id] ?? id });
 }
 allObjectives.sort((a, b) => {
 const aIndex = priority.indexOf(a.id), bIndex = priority.indexOf(b.id);
 if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
 if (aIndex !== -1) return -1;
 if (bIndex !== -1) return 1;
 return a.displayName.localeCompare(b.displayName);
 });
 return allObjectives;
}
