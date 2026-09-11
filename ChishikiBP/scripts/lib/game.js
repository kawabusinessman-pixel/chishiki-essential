import { system, world } from "../core";
import { GlobalConfig } from "../function/GlobalConfig.js";
const RANK_PREFIX = "rank:";
const DEFAULT_RANK = "";
const SAFE_LIMIT = 2e9;
const MIN_LIMIT = 0;
const METRICS_CONFIG_PROPERTY = "customMetrics:config";
let cachedMetrics;
function loadMetrics() {
 if (!cachedMetrics) {
 try {
 const data = GlobalConfig.get(METRICS_CONFIG_PROPERTY);
 cachedMetrics = data ? (typeof data === "string" ? JSON.parse(data).metrics : data.metrics) : null;
 } catch {
 cachedMetrics = null;
 }
 if (!Array.isArray(cachedMetrics)) {
 cachedMetrics = [
 { value: 1e24, symbol: "Y" },
 { value: 1e21, symbol: "Z" },
 { value: 1e18, symbol: "E" },
 { value: 1e15, symbol: "P" },
 { value: 1e12, symbol: "T" },
 { value: 1e9, symbol: "G" },
 { value: 1e6, symbol: "M" },
 { value: 1e3, symbol: "K" },
 ];
 }
 }
 return cachedMetrics;
}
export function setCustomMetrics(metrics) {
 try {
 GlobalConfig.set(
 METRICS_CONFIG_PROPERTY,
 { metrics, lastUpdated: Date.now(), version: "1.0.0" },
 );
 cachedMetrics = null;
 return true;
 } catch {
 return false;
 }
}
export function getCustomMetrics() {
 return loadMetrics();
}
export function resetMetricsToDefault() {
 try {
 GlobalConfig.set(METRICS_CONFIG_PROPERTY, null);
 cachedMetrics = null;
 return true;
 } catch {
 return false;
 }
}
export function sleep(tick) {
 return new Promise((res) => system.runTimeout(res, tick));
}
function safeScore(obj, id) {
 try {
 return Math.min(SAFE_LIMIT, Math.max(MIN_LIMIT, obj.getScore(id) || 0));
 } catch {
 return MIN_LIMIT;
 }
}
export function getScore(entity, objective) {
 const obj = world.scoreboard.getObjective(objective);
 return safeScore(obj, entity.scoreboardIdentity);
}
export function setScore(entity, objective, value) {
 try {
 world.scoreboard
 .getObjective(objective)
 .setScore(entity.scoreboardIdentity, value);
 return true;
 } catch {
 if (typeof entity.runCommand === "function") {
 system.run(() =>
 entity.runCommand(`scoreboard players set @s ${objective} ${value}`),
 );
 return true;
 }
 return false;
 }
}
export function addScore(entity, objective, delta) {
 const current = getScore(entity, objective);
 return setScore(entity, objective, current + delta);
}
export function removeScore(entity, objective, delta) {
 const current = getScore(entity, objective) - delta;
 return current >= MIN_LIMIT && setScore(entity, objective, current);
}
export async function ForceOpen(player, form, maxAttempts = 10) {
 for (let i = 0; i < maxAttempts; i++) {
  try {
   if (player?.isValid === false) return { canceled: true, cancelationReason: "UserBusy" };
   const res = await form.show(player);
   if (res?.cancelationReason !== "UserBusy") return res;
   await sleep(2);
  } catch {
   return { canceled: true };
  }
 }
 return { canceled: true, cancelationReason: "UserBusy" };
}
export function metricNumbers(input, decimals = 1) {
 if (typeof input === "bigint") input = Number(input);
 let num = typeof input === "string" ? parseFloat(input) : input;
 if (isNaN(num)) return input?.toString().slice(0, 4) + "...";
 const isNeg = num < 0;
 const abs = Math.abs(num);
 const metrics = loadMetrics();
 const fmt = (n) => {
 if (n < 1 && n > 0) return n.toFixed(3);
 const s = n.toFixed(decimals);
 return s.endsWith(".0") ? s.slice(0, -2) : s;
 };
 for (const { value, symbol } of metrics) {
 if (abs >= value) {
 return `${isNeg ? "-" : ""}${fmt(abs / value)}${symbol}`;
 }
 }
 return `${isNeg ? "-" : ""}${fmt(abs)}`;
}
export function getRank(player) {
 for (const tag of player.getTags()) {
 if (tag.startsWith(RANK_PREFIX)) {
 return tag.slice(RANK_PREFIX.length);
 }
 }
 return DEFAULT_RANK;
}
function normalizePingValue(raw) {
  const ping = Number(raw);
  if (!Number.isFinite(ping) || ping < 0) return null;
  return String(Math.max(0, Math.floor(ping)));
}

export function getPlayerPing(player) {
  if (!player) return "0";
  try {
    if (typeof player.getPing === "function") {
      const value = normalizePingValue(player.getPing());
      if (value !== null) return value;
    }
  } catch { }
  try {
    if (player.ping !== undefined) {
      const value = normalizePingValue(player.ping);
      if (value !== null) return value;
    }
  } catch { }
  try {
    const score = world.scoreboard.getObjective("ping")?.getScore(player);
    const value = normalizePingValue(score);
    if (value !== null) return value;
  } catch { }
  return "0";
}
