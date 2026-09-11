import { ActionFormData, ModalFormData, world, system } from "../../core";
import { GlobalConfig } from "../../function/GlobalConfig.js";
const playerData = new Map();
const afkPlayers = new Set();
const DEFAULT_CONFIG = {
 enabled: false,
 timeout: 300,
 movement: true,
 rotation: true,
 interaction: true,
 itemUse: true,
 blockBreak: false,
 showAfkTime: true,
 announceAfk: true,
 autoKick: false
};
let config = { ...DEFAULT_CONFIG };
const loadConfig = () => {
 try {
 const saved = GlobalConfig.get('afkConfig');
 if (saved) return typeof saved === "string" ? JSON.parse(saved) : saved;
 } catch (e) { console.warn("Error loading AFK config:", e); }
 return DEFAULT_CONFIG;
};
const saveConfig = () => {
 try {
 GlobalConfig.set('afkConfig', config);
 return true;
 } catch (e) { console.warn("Error saving AFK config:", e); return false; }
};
const getRealTime = () => {
 const timezone = world.getDynamicProperty("time:timezone") || "UTC+7";
 const offset = parseInt(timezone.replace("UTC", "")) || 7;
 const now = new Date();
 const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
 return new Date(utc + (offset * 3600000));
};
const formatTime = (date) => {
 const hours = date.getHours().toString().padStart(2, '0');
 const minutes = date.getMinutes().toString().padStart(2, '0');
 const seconds = date.getSeconds().toString().padStart(2, '0');
 return `${hours}:${minutes}:${seconds}`;
};
const formatDuration = (seconds) => {
 const hours = Math.floor(seconds / 3600);
 const mins = Math.floor((seconds % 3600) / 60);
 const secs = seconds % 60;
 if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
 if (mins > 0) return `${mins}m ${secs}s`;
 return `${secs}s`;
};
const updateActivity = player => {
 if (!player || !config.enabled) return;
 const now = Date.now();
 const previous = playerData.get(player.id);
 const data = {
 pos: player.location,
 rot: player.getRotation(),
 lastActivity: now,
 afkStartTime: null
 };
 playerData.set(player.id, data);
 if (afkPlayers.has(player.id)) {
 const afkDuration = Math.floor((now - (previous?.afkStartTime ?? now)) / 1000);
 afkPlayers.delete(player.id);
 if (config.announceAfk) {
 const msg = config.showAfkTime
 ? `§a${player.name} is no longer AFK! (was AFK for ${formatDuration(afkDuration)})`
 : `§a${player.name} is no longer AFK!`;
 world.sendMessage(msg);
 }
 }
};
const checkAFK = (player, now) => {
 if (!config.enabled) return;
 const current = { pos: player.location, rot: player.getRotation() };
 const data = playerData.get(player.id);
 if (!data) {
 playerData.set(player.id, {
 pos: current.pos,
 rot: current.rot,
 lastActivity: now,
 afkStartTime: null
 });
 return;
 }
 const hasMovement = config.movement && (
 Math.abs(data.pos.x - current.pos.x) >= 0.1 ||
 Math.abs(data.pos.y - current.pos.y) >= 0.1 ||
 Math.abs(data.pos.z - current.pos.z) >= 0.1
 );
 const hasRotation = config.rotation && (
 Math.abs(data.rot.x - current.rot.x) >= 0.1 ||
 Math.abs(data.rot.y - current.rot.y) >= 0.1
 );
 const hasActivity = hasMovement || hasRotation;
 if (hasActivity) {
 data.pos = current.pos;
 data.rot = current.rot;
 data.lastActivity = now;
 if (afkPlayers.has(player.id)) {
 const afkDuration = Math.floor((now - data.afkStartTime) / 1000);
 afkPlayers.delete(player.id);
 if (config.announceAfk) {
 const msg = config.showAfkTime
 ? `§a${player.name} is no longer AFK! (was AFK for ${formatDuration(afkDuration)})`
 : `§a${player.name} is no longer AFK!`;
 world.sendMessage(msg);
 }
 }
 } else {
 const timeSinceActivity = Math.floor((now - data.lastActivity) / 1000);
 if (timeSinceActivity >= config.timeout && !afkPlayers.has(player.id)) {
 data.afkStartTime = now;
 afkPlayers.add(player.id);
 if (config.announceAfk) {
 const afkTime = formatTime(getRealTime());
 const msg = config.showAfkTime
 ? `§c${player.name} is now AFK! (since ${afkTime})`
 : `§c${player.name} is now AFK!`;
 world.sendMessage(msg);
 }
 }
 if (config.autoKick && afkPlayers.has(player.id)) {
 const afkDuration = Math.floor((now - data.afkStartTime) / 1000);
 if (afkDuration >= config.timeout) {
 try {
 player.runCommand(`kick @s "Auto kick: AFK too long"`);
 } catch (e) {
 }
 }
 }
 }
};
export function showAfkConfig(player) {
 try {
 const currentTime = formatTime(getRealTime());
 const timezone = world.getDynamicProperty("time:timezone") || "UTC+7";
 const UI = new ModalFormData()
 .title(`AFK Config - ${currentTime} (${timezone})`);
 UI.toggle("Enable AFK System", { defaultValue: config.enabled });
 UI.textField(
 "AFK Timeout (seconds)",
 "Enter timeout in seconds (min: 30)",
 {
 defaultValue: config.timeout.toString(),
 placeholder: "300"
 }
 );
 UI.toggle("Movement Detection", {
 defaultValue: config.movement,
 tooltip: "Detect player movement"
 });
 UI.toggle("Camera Rotation", {
 defaultValue: config.rotation,
 tooltip: "Detect camera movement"
 });
 UI.toggle("Block/Entity Interaction", {
 defaultValue: config.interaction,
 tooltip: "Detect interactions"
 });
 UI.toggle("Item Usage", {
 defaultValue: config.itemUse,
 tooltip: "Detect item usage"
 });
 UI.toggle("Block Breaking", {
 defaultValue: config.blockBreak,
 tooltip: "Detect block breaking"
 });
 UI.toggle("Show AFK Duration", {
 defaultValue: config.showAfkTime,
 tooltip: "Show how long player was AFK"
 });
 UI.toggle("Announce AFK Status", {
 defaultValue: config.announceAfk,
 tooltip: "Announce when players go AFK/return"
 });
 UI.toggle("Auto Kick AFK", {
 defaultValue: config.autoKick,
 tooltip: "Automatically kick if AFK exceeds timeout"
 });
 UI.show(player).then(response => {
 try {
 if (response.canceled) return;
 const [enabled, timeoutStr, moveDetect, rotateDetect, interactDetect, itemDetect, breakDetect, showTime, announce, autoKick] = response.formValues;
 const timeoutSeconds = Math.max(30, parseInt(timeoutStr) || 300);
 const newConfig = {
 enabled,
 timeout: timeoutSeconds,
 movement: moveDetect,
 rotation: rotateDetect,
 interaction: interactDetect,
 itemUse: itemDetect,
 blockBreak: breakDetect,
 showAfkTime: showTime,
 announceAfk: announce,
 autoKick: autoKick
 };
 if (!enabled) {
 for (const playerId of afkPlayers) {
 const afkPlayer = world.getEntity(playerId);
 if (afkPlayer && announce) {
 world.sendMessage(`§a${afkPlayer.name} is no longer AFK!`);
 }
 }
 afkPlayers.clear();
 playerData.clear();
 }
 config = newConfig;
 const saved = saveConfig();
 player.sendMessage(saved ? "§aAFK settings updated and saved:" : "§eAFK settings updated but failed to save:");
 player.sendMessage(`§f- System: ${enabled ? "§aENABLED" : "§cDISABLED"}`);
 if (enabled) {
 const mins = Math.floor(timeoutSeconds / 60);
 const secs = timeoutSeconds % 60;
 const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
 player.sendMessage(`§f- Timeout: §e${timeStr}`);
 player.sendMessage(`§f- Movement: ${moveDetect ? "§aON" : "§cOFF"}`);
 player.sendMessage(`§f- Camera: ${rotateDetect ? "§aON" : "§cOFF"}`);
 player.sendMessage(`§f- Interaction: ${interactDetect ? "§aON" : "§cOFF"}`);
 player.sendMessage(`§f- Item Usage: ${itemDetect ? "§aON" : "§cOFF"}`);
 player.sendMessage(`§f- Block Break: ${breakDetect ? "§aON" : "§cOFF"}`);
 player.sendMessage(`§f- Show AFK Time: ${showTime ? "§aON" : "§cOFF"}`);
 player.sendMessage(`§f- Announce AFK: ${announce ? "§aON" : "§cOFF"}`);
 player.sendMessage(`§f- Auto Kick: ${autoKick ? "§aON" : "§cOFF"}`);
 }
 player.runCommand("playsound random.levelup @s");
 } catch (error) {
 console.warn("Error in AFK config response:", error);
 player.sendMessage("§cFailed to update AFK settings");
 player.runCommand("playsound note.bass @s");
 }
 });
 } catch (error) {
 console.warn("Error showing AFK config:", error);
 player.sendMessage("§cFailed to show AFK settings menu");
 player.runCommand("playsound note.bass @s");
 }
}
export function getAfkPlayers() {
 const result = [];
 for (const playerId of afkPlayers) {
 const player = world.getEntity(playerId);
 if (player) {
 const data = playerData.get(playerId);
 const afkDuration = data?.afkStartTime ? Math.floor((Date.now() - data.afkStartTime) / 1000) : 0;
 result.push({
 name: player.name,
 duration: formatDuration(afkDuration),
 startTime: data?.afkStartTime ? formatTime(data.afkStartTime) : "Unknown"
 });
 }
 }
 return result;
}
export function isPlayerAfk(player) {
 return afkPlayers.has(player.id);
}
system.run(() => {
 try {
 config = loadConfig();
 } catch (error) {
 console.warn("[AFK] Error loading config:", error);
 }
});
world.beforeEvents.itemUse.subscribe(({ source }) => {
 if (config.enabled && config.itemUse) updateActivity(source);
});
world.beforeEvents.playerInteractWithBlock.subscribe(({ player }) => {
 if (config.enabled && config.interaction) updateActivity(player);
});
world.beforeEvents.playerInteractWithEntity.subscribe(({ player }) => {
 if (config.enabled && config.interaction) updateActivity(player);
});
world.beforeEvents.playerBreakBlock.subscribe(({ player }) => {
 if (config.enabled && config.blockBreak) updateActivity(player);
});
world.afterEvents.playerJoin.subscribe(({ playerId }) => {
 if (!config.enabled) return;
 system.runTimeout(() => {
 const player = world.getEntity(playerId);
 if (player && config.enabled) {
 const now = Date.now();
 playerData.set(playerId, {
 pos: player.location,
 rot: player.getRotation(),
 lastActivity: now,
 afkStartTime: null
 });
 }
 }, 20);
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
 playerData.delete(playerId);
 afkPlayers.delete(playerId);
});
system.runInterval(() => {
 if (!config.enabled) return;
 const now = Date.now();
 for (const player of world.getAllPlayers()) {
 checkAFK(player, now);
 }
}, 100);