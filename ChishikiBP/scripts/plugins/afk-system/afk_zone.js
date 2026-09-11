import { world, system, ActionFormData, ModalFormData } from '../../core.js';
import { Database } from "../../function/Database.js";
const rT = (t) => JSON.stringify({ rawtext: [{ text: String(t ?? "") }] });
function sAB(player, text) {
 try {
 player.onScreenDisplay.setActionBar(text);
 return;
 } catch { }
 try {
 player.runCommand(`titleraw @s actionbar ${rT(text)}`);
 } catch { }
}
let addMoney = null;
try {
 import("../../function/moneySystem.js").then(module => {
 addMoney = module.addMoney;
 });
} catch (e) { console.warn("Money system not found"); }
const afkZoneDB = Database.getDatabase("afk_zone_config");
const DEFAULT_CONFIG = {
 zones: []
};
const DEFAULT_ZONE = {
 id: "",
 name: "AFK Zone",
 enabled: true,
 zone: null,
 interval: 300,
 rewards: {
 xp: 0,
 money: 0,
 items: [],
 command: ""
 }
};
const playerTimers = new Map();
const playerTempZones = new Map();

function getTempZone(player) {
 let tz = playerTempZones.get(player.id);
 if (!tz) {
  tz = { p1: null, p2: null };
  playerTempZones.set(player.id, tz);
 }
 return tz;
}
let cachedZoneConfig = null;
let zoneRunId = undefined;
const zonesByDimension = new Map();

function rebuildZoneIndex(zones) {
 zonesByDimension.clear();
 for (const zone of zones) {
  if (!zone.enabled || !zone.zone?.dimensionId || !zone.zone.min || !zone.zone.max) continue;
  const zonesForDimension = zonesByDimension.get(zone.zone.dimensionId) || [];
  zonesForDimension.push(zone);
  zonesByDimension.set(zone.zone.dimensionId, zonesForDimension);
 }
}

function hasActiveZones() {
 for (const zones of zonesByDimension.values()) {
  if (zones.length) return true;
 }
 return false;
}

function stopZoneScheduler() {
 if (zoneRunId !== undefined) {
  system.clearRun(zoneRunId);
  zoneRunId = undefined;
 }
}

function ensureZoneScheduler() {
 if (!hasActiveZones() || zoneRunId !== undefined) return;
 zoneRunId = system.runInterval(runZoneTick, 20);
}

function getIntervalMs(zone) {
 return Math.max(1, Number(zone.interval) || DEFAULT_ZONE.interval) * 1000;
}

function getRemainingSeconds(nextRewardAt, now) {
 return Math.max(0, Math.ceil((nextRewardAt - now) / 1000));
}

function getActiveZone(player, zones) {
 for (const zone of zones) {
  if (isInZone(player, zone.zone)) return zone;
 }
 return null;
}

function runZoneTick() {
 if (!hasActiveZones()) {
  stopZoneScheduler();
  return;
 }

 let players;
 try {
  players = world.getPlayers();
 } catch {
  return;
 }
 if (!players.length) {
  stopZoneScheduler();
  playerTimers.clear();
  return;
 }

 const now = Date.now();
 for (const player of players) {
  try {
   const zones = zonesByDimension.get(player.dimension.id);
   if (!zones) {
    playerTimers.delete(player.id);
    continue;
   }

   const activeZone = getActiveZone(player, zones);
   const tracker = playerTimers.get(player.id);
   if (activeZone) {
    const intervalMs = getIntervalMs(activeZone);
    let nextRewardAt = tracker?.zoneId === activeZone.id && tracker.nextRewardAt
     ? tracker.nextRewardAt
     : now + intervalMs;

    if (now >= nextRewardAt) {
     giveRewards(player, activeZone.rewards);
     nextRewardAt = now + intervalMs;
    }

    const remaining = getRemainingSeconds(nextRewardAt, now);
    const bar = `§aAFK [${activeZone.name}]: §e${remaining}s §funtil reward`;
    playerTimers.set(player.id, { zoneId: activeZone.id, nextRewardAt, bar });
    if (tracker?.bar !== bar) sAB(player, bar);
   } else {
    if (tracker) {
     playerTimers.delete(player.id);
     sAB(player, "§cLeft AFK Zone");
    }
   }
  } catch { }
 }
}

function getConfig() {
 if (cachedZoneConfig) return cachedZoneConfig;
 const config = afkZoneDB.get("config") || {};
 if (config.zone && !config.zones) {
 config.zones = [{
 id: Date.now().toString(),
 name: "Default Zone",
 enabled: config.enabled ?? true,
 zone: config.zone,
 interval: config.interval ?? 300,
 rewards: config.rewards ?? { ...DEFAULT_ZONE.rewards }
 }];
 delete config.zone;
 delete config.enabled;
 delete config.interval;
 delete config.rewards;
 saveConfig(config);
 }
 cachedZoneConfig = {
 zones: (config.zones || []).map(z => ({
  ...DEFAULT_ZONE,
  ...z,
  rewards: { ...DEFAULT_ZONE.rewards, ...(z.rewards || {}) }
 }))
 };
 rebuildZoneIndex(cachedZoneConfig.zones);
 ensureZoneScheduler();
 return cachedZoneConfig;
}
function saveConfig(config) {
 cachedZoneConfig = null;
 zonesByDimension.clear();
 afkZoneDB.set("config", config);
 ensureZoneScheduler();
}
function getZone(id) {
 return getConfig().zones.find(z => z.id === id);
}
function saveZone(zone) {
 const config = getConfig();
 const idx = config.zones.findIndex(z => z.id === zone.id);
 if (idx >= 0) {
 config.zones[idx] = zone;
 } else {
 config.zones.push(zone);
 }
 saveConfig(config);
}
function deleteZone(id) {
 const config = getConfig();
 config.zones = config.zones.filter(z => z.id !== id);
 saveConfig(config);
}
world.afterEvents.playerJoin.subscribe(() => {
 ensureZoneScheduler();
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
 playerTimers.delete(playerId);
 playerTempZones.delete(playerId);
 if (!world.getPlayers().length) stopZoneScheduler();
});

system.run(() => {
 getConfig();
 ensureZoneScheduler();
});
function isInZone(player, zone) {
 if (player.dimension.id !== zone.dimensionId) return false;
 const x = Math.floor(player.location.x);
 const y = Math.floor(player.location.y);
 const z = Math.floor(player.location.z);
 return x >= zone.min.x && x <= zone.max.x &&
 y >= zone.min.y && y <= zone.max.y &&
 z >= zone.min.z && z <= zone.max.z;
}
function checkOverlap(newZoneRegion, zones, currentZoneId) {
 for (const z of zones) {
 if (z.id === currentZoneId) continue;
 if (!z.zone) continue;
 if (z.zone.dimensionId !== newZoneRegion.dimensionId) continue;
 const overlapX = newZoneRegion.min.x <= z.zone.max.x && newZoneRegion.max.x >= z.zone.min.x;
 const overlapY = newZoneRegion.min.y <= z.zone.max.y && newZoneRegion.max.y >= z.zone.min.y;
 const overlapZ = newZoneRegion.min.z <= z.zone.max.z && newZoneRegion.max.z >= z.zone.min.z;
 if (overlapX && overlapY && overlapZ) {
 return z.name;
 }
 }
 return null;
}
function giveRewards(player, rewards) {
 if (rewards.xp > 0) player.runCommand(`xp ${rewards.xp} @s`);
 if (rewards.money > 0 && addMoney) {
 addMoney(player, rewards.money);
 player.sendMessage(`§a+ $${rewards.money}`);
 }
 if (rewards.items?.length > 0) {
 const inv = player.getComponent("inventory")?.container;
 if (inv) {
 for (const item of rewards.items) {
 try {
 player.runCommand(`give @s ${item.typeId} ${item.amount}`);
 } catch (e) {
 player.sendMessage(`§cFailed to give item: ${item.typeId}`);
 }
 }
 }
 }
 if (rewards.command) {
 try { player.runCommand(rewards.command); } catch {}
 }
 player.sendMessage("§aYou received your AFK reward!");
 player.playSound("random.levelup");
}
export function showAfkZoneMenu(player, message = "") {
 const config = getConfig();
 let bodyText = `Total Zones: ${config.zones.length}`;
 if (message) bodyText = `${message}\n\n${bodyText}`;
 const form = new ActionFormData()
 .title("AFK Zones Manager")
 .body(bodyText)
 .button("Create New Zone", "textures/ui/plus");
 config.zones.forEach(z => {
 const status = z.enabled ? "§aON" : "§cOFF";
 form.button(`${z.name}\n${status} | ${z.interval}s`, "textures/ui/icon_map");
 });
 form.show(player).then(res => {
 if (res.canceled) return;
 if (res.selection === 0) {
 createNewZone(player);
 } else {
 const zone = config.zones[res.selection - 1];
 showZoneDetails(player, zone.id);
 }
 });
}
function createNewZone(player) {
 const modal = new ModalFormData()
 .title("Create AFK Zone")
 .textField("Zone Name", "Lobby AFK", {defaultValue: `Zone ${getConfig().zones.length + 1}`});
 modal.show(player).then(res => {
 if (res.canceled) return showAfkZoneMenu(player);
 const name = res.formValues[0] || `Zone ${Date.now()}`;
 const newZone = {
 ...DEFAULT_ZONE,
 id: Date.now().toString(),
 name,
 rewards: { ...DEFAULT_ZONE.rewards }
 };
 saveZone(newZone);
 showAfkZoneMenu(player, `§aCreated zone "${name}"`);
 });
}
function showZoneDetails(player, zoneId, message = "") {
 const zone = getZone(zoneId);
 if (!zone) return showAfkZoneMenu(player, "§cZone not found");
 const tempZone = getTempZone(player);
 const p1Label = tempZone.p1 ? "§a(Set)" : "(Here)";
 const p2Label = tempZone.p2 ? "§a(Set)" : "(Here)";
 const locStatus = zone.zone ? "§aRegion Set" : "§cRegion Not Set";
 let body = `§fName: §7${zone.name}§r\n§fStatus: ${zone.enabled ? "§aEnabled" : "§cDisabled"}§r\n§fRegion: ${locStatus}§r\n§fInterval: §e${zone.interval}s§r\n§fRewards: §e${zone.rewards.items.length} items, ${zone.rewards.xp} XP, $${zone.rewards.money}§r`;
 if (message) body = `${message}§r\n\n${body}`;
 new ActionFormData()
 .title(`Manage: ${zone.name}`)
 .body(body)
 .button(`Status: ${zone.enabled ? "ENABLED" : "DISABLED"}`, zone.enabled ? "textures/ui/toggle_on" : "textures/ui/toggle_off")
 .button(`Set Pos 1 ${p1Label}`, "textures/ui/world_glyph")
 .button(`Set Pos 2 ${p2Label}`, "textures/ui/world_glyph")
 .button("Save Region", "textures/ui/RTX_Sparkle")
 .button("Configure Rewards", "textures/ui/Scaffolding")
 .button("Set Interval", "textures/ui/accessibility_glyph_color")
 .button("Rename Zone", "textures/ui/icon_sign")
 .button("Delete Zone", "textures/ui/trash")
 .button("Back", "textures/ui/arrow_left")
 .show(player).then(res => {
 if (res.canceled) return showAfkZoneMenu(player);
 const { x, y, z } = player.location;
 const loc = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
 switch (res.selection) {
 case 0:
 zone.enabled = !zone.enabled;
 saveZone(zone);
 showZoneDetails(player, zoneId, `§aZone ${zone.enabled ? "Enabled" : "Disabled"}`);
 break;
 case 1:
 getTempZone(player).p1 = loc;
 showZoneDetails(player, zoneId, `§aPos 1 set to ${loc.x}, ${loc.y}, ${loc.z}`);
 break;
 case 2:
 getTempZone(player).p2 = loc;
 showZoneDetails(player, zoneId, `§aPos 2 set to ${loc.x}, ${loc.y}, ${loc.z}`);
 break;
 case 3:
 const tmp = getTempZone(player);
 if (!tmp.p1 || !tmp.p2) {
 showZoneDetails(player, zoneId, "§cSet both positions first!");
 return;
 }
 const { p1, p2 } = tmp;
 const newRegion = {
 min: { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), z: Math.min(p1.z, p2.z) },
 max: { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y), z: Math.max(p1.z, p2.z) },
 dimensionId: player.dimension.id
 };
 const conflict = checkOverlap(newRegion, getConfig().zones, zoneId);
 if (conflict) {
 showZoneDetails(player, zoneId, `§cError: Overlaps with "${conflict}"!`);
 return;
 }
 zone.zone = newRegion;
 saveZone(zone);
 playerTempZones.delete(player.id);
 showZoneDetails(player, zoneId, "§aRegion saved!");
 break;
 case 4:
 showRewardConfig(player, zoneId);
 break;
 case 5:
 showIntervalConfig(player, zoneId);
 break;
 case 6:
 renameZone(player, zoneId);
 break;
 case 7:
 deleteZone(zoneId);
 showAfkZoneMenu(player, "§cZone deleted");
 break;
 case 8:
 showAfkZoneMenu(player);
 break;
 }
 });
}
function renameZone(player, zoneId) {
 const zone = getZone(zoneId);
 new ModalFormData()
 .title("Rename Zone")
 .textField("New Name", "Name", {defaultValue: zone.name})
 .show(player).then(res => {
 if (res.canceled) return showZoneDetails(player, zoneId);
 if (res.formValues[0]) {
 zone.name = res.formValues[0];
 saveZone(zone);
 showZoneDetails(player, zoneId, "§aRenamed!");
 }
 });
}
function showRewardConfig(player, zoneId) {
 const zone = getZone(zoneId);
 if (!zone) return;
 new ModalFormData()
 .title("Rewards: " + zone.name)
 .textField("XP Amount", "0", {defaultValue: zone.rewards.xp.toString()})
 .textField("Money Amount", "0", {defaultValue: zone.rewards.money.toString()})
 .textField("Command", "say Hi", {defaultValue: zone.rewards.command || ""})
 .textField("Add Item (ID:Amount)", "minecraft:apple:1", {defaultValue: ""})
 .toggle("Clear existing items", {defaultValue: zone.rewards.clearItems || false})
 .show(player).then(res => {
 if (res.canceled) return showZoneDetails(player, zoneId);
 const [xpStr, moneyStr, cmd, itemStr, clearItems] = res.formValues;
 zone.rewards.xp = parseInt(xpStr) || 0;
 zone.rewards.money = parseInt(moneyStr) || 0;
 zone.rewards.command = cmd;
 let msg = "§aRewards updated";
 if (clearItems) {
 zone.rewards.items = [];
 msg += ", Items cleared";
 }
 if (itemStr && itemStr.trim()) {
 const parts = itemStr.split(":");
 if (parts.length >= 2) {
 const amount = parseInt(parts.pop());
 const typeId = parts.join(":");
 if (typeId && amount) {
 zone.rewards.items.push({ typeId, amount });
 msg += `, Added ${amount}x ${typeId}`;
 }
 }
 }
 saveZone(zone);
 showZoneDetails(player, zoneId, msg);
 });
}
function showIntervalConfig(player, zoneId) {
 const zone = getZone(zoneId);
 if (!zone) return;
 new ModalFormData()
 .title("Interval: " + zone.name)
 .textField("Time (seconds)", "300", {defaultValue: zone.interval.toString()})
 .show(player).then(res => {
 if (res.canceled) return showZoneDetails(player, zoneId);
 const val = parseInt(res.formValues[0]);
 if (val > 0) {
 zone.interval = val;
 saveZone(zone);
 showZoneDetails(player, zoneId, "§aInterval updated!");
 return;
 }
 showZoneDetails(player, zoneId);
 });
}
