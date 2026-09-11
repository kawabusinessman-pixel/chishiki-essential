import { system, world, ActionFormData, ModalFormData } from "../core.js";
import { Lang } from "../lib/Lang.js";
let bannedPlayersCache = null;
let storedPlayersCache = null;
let lastBanCacheUpdate = 0;
let lastPlayerCacheUpdate = 0;
const CACHE_DURATION = 5000;
const MAX_STORED_PLAYERS = 1000;
const SEARCHABLE_TITLE_SUFFIX = " searchable";
const BACK_ICON = "textures/ui/arrow_left";
const PLAYER_ICON = "textures/ui/icon_steve";
const LOCKED_ICON = "textures/ui/button_custom/Lock-Locked-e98de";
const UNLOCKED_ICON = "textures/ui/button_custom/Lock-Unlocked-4fd1c";
function getFormattedDateTime(timestamp) {
 try {
 const timezone = world.getDynamicProperty("time:timezone") ?? "UTC+7";
 const offset = parseInt(timezone.replace("UTC", "")) * 3600000;
 const date = new Date(timestamp + offset);
 const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
 const pad = (n) => String(n).padStart(2, "0");
 return `${pad(date.getDate())} ${months[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
 } catch (e) {
 return new Date(timestamp).toLocaleString();
 }
}
function normalizePlayerName(name) {
 return name.includes(" ") ? `"${name}"` : name;
}
function getOriginalPlayerName(name) {
 return (name.startsWith('"') && name.endsWith('"')) ? name.slice(1, -1) : name;
}
function findPlayerByName(name) {
 const original = getOriginalPlayerName(name);
 return world.getAllPlayers().find((p) => p.name === original);
}
function formatDuration(ms) {
 const sec = Math.floor(ms / 1000);
 const min = Math.floor(sec / 60);
 const hrs = Math.floor(min / 60);
 const days = Math.floor(hrs / 24);
 const parts = [];
 if (days > 0) parts.push(`${days}d`);
 if (hrs % 24 > 0) parts.push(`${hrs % 24}h`);
 if (min % 60 > 0) parts.push(`${min % 60}m`);
 return parts.length > 0 ? parts.join(" ") : "less than 1m";
}
function getDynamicData(key, cacheVar, lastUpdateVar, defaultVal) {
 const now = Date.now();
 if (cacheVar && now - lastUpdateVar < CACHE_DURATION) return cacheVar;
 try {
 const data = world.getDynamicProperty(key);
 const parsed = data ? JSON.parse(data) : defaultVal;
 if (key === "bannedPlayers") { bannedPlayersCache = parsed; lastBanCacheUpdate = now; }
 else { storedPlayersCache = parsed; lastPlayerCacheUpdate = now; }
 return parsed;
 } catch (e) {
 console.warn(`Error getting ${key}:`, e);
 return defaultVal;
 }
}
function getBannedPlayers() {
 return getDynamicData("bannedPlayers", bannedPlayersCache, lastBanCacheUpdate, {});
}
function getStoredPlayers() {
 const data = getDynamicData("allPlayers", storedPlayersCache, lastPlayerCacheUpdate, []);
 if (Array.isArray(data)) return data.filter((name) => typeof name === "string");
 return data && typeof data === "object" ? Object.keys(data) : [];
}
function saveBannedPlayers(data) {
 try {
 world.setDynamicProperty("bannedPlayers", JSON.stringify(data));
 bannedPlayersCache = data;
 lastBanCacheUpdate = Date.now();
 return true;
 } catch (e) {
 console.warn("Error saving bans:", e);
 return false;
 }
}
function addStoredPlayer(name) {
 try {
 const raw = world.getDynamicProperty("allPlayers");
 const parsed = raw ? JSON.parse(raw) : [];
 // Legacy data used an object with timestamps. Names are all the ban picker needs.
 const players = Array.isArray(parsed)
 ? parsed.filter((playerName) => typeof playerName === "string")
 : parsed && typeof parsed === "object" ? Object.keys(parsed) : [];
 const existingIndex = players.indexOf(name);
 if (existingIndex !== -1) players.splice(existingIndex, 1);
 players.push(name);
 if (players.length > MAX_STORED_PLAYERS) {
 players.splice(0, players.length - MAX_STORED_PLAYERS);
 }
 world.setDynamicProperty("allPlayers", JSON.stringify(players));
 storedPlayersCache = players;
 lastPlayerCacheUpdate = Date.now();
 } catch (e) {
 console.warn("Error storing player:", e);
 }
}
function clearCache() {
 bannedPlayersCache = null;
 storedPlayersCache = null;
 lastBanCacheUpdate = 0;
 lastPlayerCacheUpdate = 0;
}
function cleanupExpiredBans() {
 const bans = getBannedPlayers();
 const now = Date.now();
 let changed = false;
 for (const [name, info] of Object.entries(bans)) {
 if (!info.isPermanent && info.bannedUntil <= now) {
 delete bans[name];
 changed = true;
 }
 }
 if (changed) {
 saveBannedPlayers(bans);
 console.log("Cleaned up expired bans");
 }
}
function formatBanMessage(name, info, isKickMsg = false) {
 const now = Date.now();
 const duration = info.isPermanent ? "PERMANENT" : formatDuration(info.bannedUntil - now);
 const date = getFormattedDateTime(info.bannedAt);
 const lines = [
 isKickMsg ? (info.customTitle || "YOU ARE BANNED!") : `Player: ${name}`,
 isKickMsg ? "" : `Reason: ${info.reason}`,
 isKickMsg ? `Player: ${name}` : `Duration: ${duration}`,
 isKickMsg ? `Reason: ${info.reason}` : `Banned by: ${info.bannedBy}`,
 isKickMsg ? `Duration: ${duration}` : `Date: ${date}`,
 isKickMsg ? `Banned by: ${info.bannedBy}` : (info.customMessage ? `\nMessage: ${info.customMessage}` : ""),
 isKickMsg ? `Date: ${date}` : "",
 isKickMsg && info.customMessage ? `Message: ${info.customMessage}` : "",
 "",
 info.appealInfo || "Contact admin in game for appeal"
 ];
 return lines.filter(l => l !== "").join(isKickMsg ? " | " : "\n");
}
async function kickPlayer(player, info) {
 try {
 const kickMsg = formatBanMessage(player.name, info, true);
 const dialogMsg = formatBanMessage(player.name, info, false);
 const form = new ActionFormData()
 .title(info.customTitle || Lang.t(player, "admin.ban.title"))
 .body(dialogMsg)
 .button(Lang.t(player, "common.close"));
 await form.show(player);
 system.runTimeout(() => {
 try {
 const safeMsg = kickMsg.replace(/"/g, "'").substring(0, 500);
 player.dimension.runCommand(`kick "${player.name}" ${safeMsg}`);
 } catch {
 try {
 world.getDimension("overworld").runCommand(`kick "${player.name}"`);
 } catch { }
 }
 }, 20);
 } catch (e) {
 console.warn("Error kicking player:", e);
 }
}
async function applyBanEffects(player) {
 try {
 player.nameTag = `[Banned] ${player.name}`;
 player.runCommand("gamemode survival @s");
 player.runCommand("camera @s fade time 0.3 13 0.5 color 0 0 0");
 player.setDynamicProperty("isMuted", true);
 return true;
 } catch { return false; }
}
function unbanPlayer(player) {
 try {
 player.removeTag("permanent_ban");
 player.getTags().filter(t => t.startsWith("banned:") || t.startsWith("reason:")).forEach(t => player.removeTag(t));
 player.runCommand("gamemode survival @s");
 player.runCommand("tag @s add member");
 player.nameTag = player.name;
 player.setDynamicProperty("isMuted", false);
 player.setDynamicProperty("mutedUntil", 0);
 player.runCommand("playsound random.levelup @s ~~~ 1 1");
 player.sendMessage(`[UNBAN SYSTEM]\n${player.name} has been unbanned by ${system.name}`);
 return true;
 } catch { return false; }
}
function handleBannedPlayers() {
 const bans = getBannedPlayers();
 const now = Date.now();
 for (const p of world.getAllPlayers()) {
 const name = p.name;
 const normName = normalizePlayerName(name);
 const info = bans[name] || bans[normName];
 const key = bans[name] ? name : normName;
 if (info) {
 if (!info.isPermanent && info.bannedUntil <= now) {
 if (unbanPlayer(p)) {
 delete bans[key];
 saveBannedPlayers(bans);
 world.sendMessage(`[BAN SYSTEM]\n${p.name}'s ban has expired.`);
 }
 } else {
 applyBanEffects(p);
 }
 } else if (p.hasTag("permanent_ban")) {
 unbanPlayer(p);
 }
 }
}
async function showBannedPlayersList(src) {
 const bans = getBannedPlayers();
 const now = Date.now();
 const active = Object.entries(bans)
 .filter(([_, i]) => i.isPermanent || i.bannedUntil > now)
 .map(([n, i]) => ({
 name: n,
 time: i.isPermanent ? "PERMANENT" : formatDuration(i.bannedUntil - now),
 reason: i.reason,
 by: i.bannedBy,
 at: i.bannedAt ? getFormattedDateTime(i.bannedAt) : "",
 off: i.isOffline
 }));
 const form = new ActionFormData().simpleUi().title(`${Lang.t(src, "admin.ban.banned_list.title")}${SEARCHABLE_TITLE_SUFFIX}`);
 form.body(active.length ? `${active.length} banned player(s). Search by name, reason, or admin.` : Lang.t(src, "admin.ban.banned_list.empty"));
 for (const b of active) {
 form.button(`${b.name} ${b.off ? "[OFF]" : "[ON]"}\n${b.time} | ${b.reason} | by ${b.by}`, LOCKED_ICON);
 }
 form.button(Lang.t(src, "admin.ban.banned_list.btn.back"), BACK_ICON);
 const res = await form.show(src);
 if (!res.canceled && res.selection < active.length) {
 const b = active[res.selection];
 await new ActionFormData().simpleUi()
 .title(`Ban Details: ${b.name}`)
 .body(`Player: ${b.name} ${b.off ? "(Offline)" : ""}\nTime Left: ${b.time}\nReason: ${b.reason}\nBy: ${b.by}\nAt: ${b.at}`)
 .button(Lang.t(src, "admin.ban.banned_list.btn.back"), BACK_ICON)
 .show(src);
 }
 showBanManagementMenu(src);
}
async function showUnbanPlayerMenu(src) {
 const bans = getBannedPlayers();
 const now = Date.now();
 const active = Object.entries(bans)
 .filter(([_, i]) => i.isPermanent || i.bannedUntil > now)
 .sort((a, b) => a[0].localeCompare(b[0]));
 if (!active.length) return src.sendMessage("§cNo banned players found.") || showBanManagementMenu(src);
 const form = new ActionFormData().simpleUi()
 .title(`${Lang.t(src, "admin.ban.unban_player.title")}${SEARCHABLE_TITLE_SUFFIX}`)
 .body(`${active.length} banned player(s). Search, then select one to unban.`);
 for (const [n, i] of active) {
 form.button(`${n}\n${i.isPermanent ? "PERM" : formatDuration(i.bannedUntil - now)} | ${i.reason} | by ${i.bannedBy}`, UNLOCKED_ICON);
 }
 form.button(Lang.t(src, "admin.ban.btn.back"), BACK_ICON);
 const res = await form.show(src);
 if (res.canceled) return showBanManagementMenu(src);
 if (res.selection === active.length) return showBanManagementMenu(src);
 const [name] = active[res.selection];
 delete bans[name];
 delete bans[normalizePlayerName(name)];
 saveBannedPlayers(bans);
 const p = findPlayerByName(name);
 if (p) unbanPlayer(p);
 world.sendMessage(`[UNBAN SYSTEM]\n${name} has been unbanned by ${src.name}`);
 src.sendMessage(`§aSuccessfully unbanned ${name}`);
 showBanManagementMenu(src);
}
async function showBanPlayerMenu(src) {
 const online = [...world.getAllPlayers()].map(p => p.name);
 const onlineNames = new Set(online);
 const stored = getStoredPlayers();
 const all = [...new Set([...online, ...stored])].map(n => ({
 name: n,
 display: `${n} ${online.includes(n) ? "§a[ON]" : "§c[OFF]"}`
 })).filter(p => p.name !== src.name).sort((a, b) => a.name.localeCompare(b.name));
 if (!all.length) return src.sendMessage("§cNo players found.") || showBanManagementMenu(src);
 const selectForm = new ActionFormData().simpleUi()
 .title(`${Lang.t(src, "admin.ban.ban_player.title")}${SEARCHABLE_TITLE_SUFFIX}`)
 .body(`${all.length} stored player(s). Search name/status, then select target.`);
 for (const target of all) {
 selectForm.button(`${target.name} ${onlineNames.has(target.name) ? "[ON]" : "[OFF]"}`, onlineNames.has(target.name) ? PLAYER_ICON : LOCKED_ICON);
 }
 selectForm.button(Lang.t(src, "admin.ban.btn.back"), BACK_ICON);
 const pick = await selectForm.show(src);
 if (pick.canceled || pick.selection === all.length) return showBanManagementMenu(src);
 const target = all[pick.selection];
 if (!target) return showBanManagementMenu(src);
 const res = await new ModalFormData().title(`${Lang.t(src, "admin.ban.ban_player.title")}: ${target.name}`)
 .toggle("Permanent", { defaultValue: false })
 .slider("Days", 0, 30, { valueStep: 1, defaultValue: 0 })
 .slider("Hours", 0, 23, { valueStep: 1, defaultValue: 0 })
 .slider("Minutes", 0, 59, { valueStep: 1, defaultValue: 0 })
 .textField("Reason", "Required", { defaultValue: "" })
 .textField("Custom Title", "Optional", { defaultValue: "" })
 .textField("Custom Message", "Optional", { defaultValue: "" })
 .textField("Appeal Info", "Optional", { defaultValue: "" })
 .toggle("Announce", { defaultValue: true })
 .show(src);
 if (res.canceled) return showBanManagementMenu(src);
 const [perm, d, h, m, reason, title, msg, appeal, announce] = res.formValues;
 if (!reason.trim()) return src.sendMessage("§cReason required!") || showBanPlayerMenu(src);
 const now = Date.now();
 const duration = perm ? Number.MAX_SAFE_INTEGER : now + (d * 86400000) + (h * 3600000) + (m * 60000);
 const info = {
 bannedUntil: duration, reason: reason.trim(), bannedBy: src.name, isPermanent: perm,
 bannedAt: now, customTitle: title?.trim(), customMessage: msg?.trim(), appealInfo: appeal?.trim(),
 isOffline: !onlineNames.has(target.name)
 };
 const bans = getBannedPlayers();
 bans[normalizePlayerName(target.name)] = info;
 if (saveBannedPlayers(bans)) {
 const p = findPlayerByName(target.name);
 if (p) {
 info.isOffline = false;
 applyBanEffects(p);
 p.addTag(`banned:${duration}`);
 p.addTag(`reason:${reason}`);
 if (perm) p.addTag("permanent_ban");
 p.setDynamicProperty("isMuted", true);
 p.setDynamicProperty("mutedUntil", duration);
 p.runCommand("playsound mob.enderdragon.growl @s ~~~ 1 1");
 p.runCommand("tag @s remove member");
 kickPlayer(p, info);
 }
 if (announce) world.sendMessage(`[BAN SYSTEM]\nPlayer: ${target.name}\nBy: ${src.name}\nReason: ${reason}\nDuration: ${perm ? "PERMANENT" : formatDuration(duration - now)}`);
 src.sendMessage(`§aBanned ${target.name}`);
 } else {
 src.sendMessage("§cFailed to save ban.");
 }
 showBanManagementMenu(src);
}
export async function showBanManagementMenu(src) {
 const res = await new ActionFormData().simpleUi().title(Lang.t(src, "admin.ban.title"))
 .body(Lang.t(src, "admin.ban.body"))
 .button(Lang.t(src, "admin.ban.btn.ban"), "textures/ui/button_custom/Lock-Locked-e98de")
 .button(Lang.t(src, "admin.ban.btn.unban"), "textures/ui/button_custom/Lock-Unlocked-4fd1c")
 .button(Lang.t(src, "admin.ban.btn.list"), "textures/ui/copy.png")
 .button(Lang.t(src, "admin.ban.btn.back"), "textures/ui/arrow_dark_left_stretch.png")
 .show(src);
 if (!res.canceled) {
 [
 () => showBanPlayerMenu(src),
 () => showUnbanPlayerMenu(src),
 () => showBannedPlayersList(src)
 ][res.selection]?.();
 }
}
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
 if (initialSpawn) addStoredPlayer(player.name);
 const bans = getBannedPlayers();
 const name = player.name;
 const norm = normalizePlayerName(name);
 const info = bans[name] || bans[norm];
 if (info) {
 if (!info.isPermanent && info.bannedUntil <= Date.now()) {
 if (unbanPlayer(player)) {
 delete bans[name]; delete bans[norm];
 saveBannedPlayers(bans);
 world.sendMessage(`[BAN SYSTEM]\n${name}'s ban expired.`);
 }
 } else {
 info.isOffline = false;
 saveBannedPlayers(bans);
 applyBanEffects(player);
 kickPlayer(player, info);
 }
 }
});
system.runInterval(handleBannedPlayers, 300);
system.runInterval(cleanupExpiredBans, 6000);
system.runInterval(clearCache, 12000);
export {
 getBannedPlayers, handleBannedPlayers, showBannedPlayersList,
 showBanPlayerMenu, showUnbanPlayerMenu, normalizePlayerName, getOriginalPlayerName,
 findPlayerByName, getStoredPlayers, addStoredPlayer, saveBannedPlayers, clearCache,
 cleanupExpiredBans, getFormattedDateTime
};
