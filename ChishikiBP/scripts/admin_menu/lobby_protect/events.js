import { system, world } from "../../core.js";
import { Lang } from "../../lib/Lang.js";
import { getRegionConfig, getProtectedRegionRevision, isInProtectedRegion, isEntityExcluded, isBlockExcluded, isLobbyProtectionEnabled, isPlayerRankAllowed, getLobbyRankLabel, getPlayerLobbyRank, isPvpRegion } from "./config.js";
import { isAuthorizedAdmin, sendProtectionMessage, playerAreas } from "./utils.js";
import { getGenerators, onGeneratorsChanged } from "../ore_generator/database_ore.js";
import { activateLobbyMode, clearLobbyRecoveryFailure, deactivateLobbyMode } from "./lobby_inventory.js"
import { registerFarmlandEvents, updateFarmlandTracking } from "./farmland_protect.js";

const cache = {
 prot: new Map(),
 lastProt: 0,
 regions: [],
 regionsTime: 0,
 lastPos: new Map(),
 lastReg: new Map(),
 lastRegion: new Map(),
 lastRegionCheck: new Map(),
 inventoryRetry: new Map(),
 mobScanQueue: new Map(),
 activeRegionIds: new Set(),
 regionRevision: -1,
 generators: [],
 generatorsTime: 0,
};

const isInOreGen = (loc, dim) => {
 if (dim.id !== "minecraft:overworld") return false;
 const now = Date.now();
 if (now - cache.generatorsTime > 5000) {
 cache.generators = getGenerators().filter(g => g.pos1 && g.pos2);
 cache.generatorsTime = now;
 }
 return cache.generators.some(
 (g) =>
 loc.x >= Math.min(g.pos1.x, g.pos2.x) &&
 loc.x <= Math.max(g.pos1.x, g.pos2.x) &&
 loc.y >= Math.min(g.pos1.y, g.pos2.y) &&
 loc.y <= Math.max(g.pos1.y, g.pos2.y) &&
 loc.z >= Math.min(g.pos1.z, g.pos2.z) &&
 loc.z <= Math.max(g.pos1.z, g.pos2.z),
 );
};
const ADVENTURE_TAG = "lobby_adventure_mode";

const BOW_ITEM_IDS = new Set(["minecraft:bow"]);
const RESTRICTED_ITEM_IDS = new Set([
 "minecraft:flint_and_steel",
 "minecraft:fire_charge",
 "minecraft:lava_bucket",
 "minecraft:water_bucket",
 "minecraft:powder_snow_bucket",
 "minecraft:end_crystal",
 "minecraft:respawn_anchor",
]);
const PROTECTION_EFFECT_DURATION_SECONDS = 10;
const PROTECTION_EFFECT_DURATION_TICKS = PROTECTION_EFFECT_DURATION_SECONDS * 20;
const DAMAGE_EFFECT_AMPLIFIER = 255;
const PVP_EFFECT_TAG = "lobby_pvp_protection";
const damageEffectPlayers = new Set();
const REGION_RECHECK_TICKS = 100;
const EFFECT_REFRESH_PASSES = 4;
const MAX_MOB_SCAN_AREAS_PER_PASS = 2;
let eventsRegistered = false;
let lobbyProtectionRun;
let mobTick = 0;
let effectTick = 0;
let hungerEffectTick = 0;
let protectionWasEnabled = true;

const hasAntiBowProtection = (regionId) => !!(getRegionConfig(regionId).antiBowProtection ?? false);

function applyLobbyDamageEffect(player) {
  try {
    try {
      player.addEffect("resistance", PROTECTION_EFFECT_DURATION_TICKS, { amplifier: DAMAGE_EFFECT_AMPLIFIER, showParticles: false });
    } catch {
      player.runCommand(`effect @s resistance ${PROTECTION_EFFECT_DURATION_SECONDS} ${DAMAGE_EFFECT_AMPLIFIER} true`);
    }
    damageEffectPlayers.add(player.id);
  } catch {}
}

export function clearLobbyDamageEffect(player) {
  if (!player || !damageEffectPlayers.has(player.id)) return;
  try {
    try {
      player.removeEffect("resistance");
    } catch {
      player.runCommand("effect @s clear resistance");
    }
  } catch {}
  damageEffectPlayers.delete(player.id);
}

function clearLobbyPvpEffect(player) {
  try {
    if (!player?.hasTag(PVP_EFFECT_TAG)) return;
    try {
      player.removeEffect("weakness");
    } catch {
      player.runCommand("effect @s clear weakness");
    }
    player.removeTag(PVP_EFFECT_TAG);
  } catch {}
}

function applyLobbyPvpEffect(player) {
  try {
    if (!player.hasTag(PVP_EFFECT_TAG)) player.addTag(PVP_EFFECT_TAG);
    try {
      player.addEffect("weakness", PROTECTION_EFFECT_DURATION_TICKS, { amplifier: 255, showParticles: false });
    } catch {
      player.runCommand(`effect @s weakness ${PROTECTION_EFFECT_DURATION_SECONDS} 255 true`);
    }
  } catch {}
}

function removeSpawnedEntityInProtectedRegion(entity) {
 try {
 if (entity?.isValid !== true || entity.typeId === "minecraft:player" || entity.typeId === "minecraft:item") return;
 const region = isInProtectedRegion(entity.location, entity.dimension.id);
 if (!region) return;
 if (!cache.activeRegionIds.has(region.id)) return;
 const config = getRegionConfig(region.id);
 if (!config.mobSpawnProtection || isEntityExcluded(entity.typeId, region.id)) return;
 entity.remove();
 } catch {}
}

function getRegionExitLocation(player, region) {
 const loc = player.location;
 const minX = Math.min(region.pos1.x, region.pos2.x);
 const maxX = Math.max(region.pos1.x, region.pos2.x);
 const minZ = Math.min(region.pos1.z, region.pos2.z);
 const maxZ = Math.max(region.pos1.z, region.pos2.z);
 const exits = [
 { x: minX - 1.5, z: loc.z, distance: Math.abs(loc.x - minX) },
 { x: maxX + 1.5, z: loc.z, distance: Math.abs(loc.x - maxX) },
 { x: loc.x, z: minZ - 1.5, distance: Math.abs(loc.z - minZ) },
 { x: loc.x, z: maxZ + 1.5, distance: Math.abs(loc.z - maxZ) },
 ];
 exits.sort((a, b) => a.distance - b.distance);
 return { x: exits[0].x, y: loc.y, z: exits[0].z };
}

function ejectPlayerFromRegion(player, region, conf) {
 try {
 const allowedRanks = (conf.allowedRanks || []).map(getLobbyRankLabel).join(", ");
 const rank = getLobbyRankLabel(getPlayerLobbyRank(player));
 if (!deactivateLobbyMode(player)) {
  cache.inventoryRetry.set(player.id, Date.now() + 5000);
  ensureLobbyProtectionRunner();
  return false;
 }
 cache.inventoryRetry.delete(player.id);
 clearLobbyDamageEffect(player);
 playerAreas.delete(player.id);
 if (player.hasTag(ADVENTURE_TAG)) {
 try { player.runCommand("gamemode survival"); } catch {}
 try { player.removeTag(ADVENTURE_TAG); } catch {}
 }
 player.teleport(getRegionExitLocation(player, region), { dimension: player.dimension });
 sendProtectionMessage(
 player,
 allowedRanks
 ? Lang.t(player, "lobby.rank.denied.allowed", rank, allowedRanks)
  : Lang.t(player, "lobby.rank.denied", rank),
 );
 return true;
 } catch { return false; }
}

const checkProt = (player, loc, regId, type) => {
 const conf = getRegionConfig(regId),
 admin = isAuthorizedAdmin(player, regId);
 return (
 !conf[type] || admin
 ? false
 : conf.protectedDimensions.includes(player.dimension.id.split(":")[1])
 );
};

const partQ = [];

function clearLobbyRuntimeState(playerId) {
 cache.lastPos.delete(playerId);
 cache.lastReg.delete(playerId);
 cache.lastRegion.delete(playerId);
 cache.lastRegionCheck.delete(playerId);
 cache.inventoryRetry.delete(playerId);
 playerAreas.delete(playerId);
 damageEffectPlayers.delete(playerId);
}

function stopLobbyProtectionRunner() {
 if (lobbyProtectionRun === undefined) return;
 system.clearRun(lobbyProtectionRun);
 lobbyProtectionRun = undefined;
}

export function ensureLobbyProtectionRunner() {
 if (lobbyProtectionRun !== undefined) return;
 lobbyProtectionRun = system.runInterval(runLobbyProtection, 40);
}

function resetRegionRuntimeCacheIfNeeded() {
 const revision = getProtectedRegionRevision();
 if (cache.regionRevision === revision) return;
 cache.regionRevision = revision;
 cache.lastPos.clear();
 cache.lastReg.clear();
 cache.lastRegion.clear();
 cache.lastRegionCheck.clear();
 cache.mobScanQueue.clear();
 cache.activeRegionIds.clear();
}

function queueMobScan(player, region, position, location) {
 const areaKey = `${player.dimension.id}:${region.id}:${Math.floor(position.x / 24)}:${Math.floor(position.z / 24)}`;
 if (cache.mobScanQueue.has(areaKey)) return;
 cache.mobScanQueue.set(areaKey, {
  dimension: player.dimension,
  regionId: region.id,
  location: { x: location.x, y: location.y, z: location.z },
 });
}

function processQueuedMobScans() {
 for (let scanned = 0; scanned < MAX_MOB_SCAN_AREAS_PER_PASS; scanned++) {
  const next = cache.mobScanQueue.entries().next();
  if (next.done) return;
  const [areaKey, scan] = next.value;
  cache.mobScanQueue.delete(areaKey);
  try {
   const region = isInProtectedRegion(scan.location, scan.dimension.id);
   if (!region || region.id !== scan.regionId) continue;
   if (!cache.activeRegionIds.has(region.id)) continue;
   const config = getRegionConfig(region.id);
   if (!config.mobSpawnProtection) continue;
   const minX = Math.min(region.pos1.x, region.pos2.x);
   const maxX = Math.max(region.pos1.x, region.pos2.x);
   const minY = Math.min(region.pos1.y, region.pos2.y);
   const maxY = Math.max(region.pos1.y, region.pos2.y);
   const minZ = Math.min(region.pos1.z, region.pos2.z);
   const maxZ = Math.max(region.pos1.z, region.pos2.z);
   const entities = scan.dimension.getEntities({
    location: scan.location,
    maxDistance: 24,
    excludeTypes: ["minecraft:player", "minecraft:item"],
   });
   for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    try {
     if (isEntityExcluded(entity.typeId, region.id)) continue;
     const entityLocation = entity.location;
     if (
      entityLocation.x < minX || entityLocation.x > maxX ||
      entityLocation.y < minY || entityLocation.y > maxY ||
      entityLocation.z < minZ || entityLocation.z > maxZ
     ) continue;
     entity.remove();
    } catch { }
   }
  } catch { }
 }
}

export function registerAllEvents() {
 if (eventsRegistered) return;
 eventsRegistered = true;
 registerFarmlandEvents();
 world.afterEvents.entitySpawn.subscribe(({ entity }) => {
 system.run(() => removeSpawnedEntityInProtectedRegion(entity));
 });
 onGeneratorsChanged(() => {
 cache.generatorsTime = 0;
 });
  const handleBlock = (ev, type, msg) => {
  try {
  if (!isLobbyProtectionEnabled()) return;
 const { player, block } = ev;
  if (type === "blockBreakProtection" && isInOreGen(block.location, block.dimension)) return;
  const reg = isInProtectedRegion(block.location, block.dimension.id);
  if (!reg) return;
  const config = getRegionConfig(reg.id);
  const isFarmBlock = block.typeId === "minecraft:farmland" || block.typeId?.includes("crop") || block.typeId?.includes("wheat") || block.typeId?.includes("carrot") || block.typeId?.includes("potato") || block.typeId?.includes("beetroot") || block.typeId?.includes("melon_stem") || block.typeId?.includes("pumpkin_stem") || block.typeId?.includes("torchflower") || block.typeId?.includes("pitcher") || block.typeId?.includes("berry") || block.typeId?.includes("cocoa") || block.typeId?.includes("wart");
  if (type === "blockBreakProtection" && isFarmBlock && config.farmlandProtection) return;
  if (!checkProt(player, block.location, reg.id, type)) return;
 ev.cancel = true;
 sendProtectionMessage(player, Lang.t(player, msg));
 if (getRegionConfig(reg.id).showParticles)
 partQ.push({ dim: player.dimension, loc: block.location, type: "minecraft:large_smoke", delay: 0 });
 } catch {}
 };
 world.beforeEvents.playerBreakBlock.subscribe((e) =>
 handleBlock(e, "blockBreakProtection", "lobby.protect.block_break"),
 );
  world.beforeEvents.playerPlaceBlock.subscribe((e) => {
  try {
  if (!isLobbyProtectionEnabled()) return;
  const { player, block } = e;
  const reg = isInProtectedRegion(block.location, block.dimension.id);
  if (!reg) return;
  if (isAuthorizedAdmin(player, reg.id)) return;
  const blockId = block.typeId?.toLowerCase() || "";
  if (blockId.includes("lava") || blockId.includes("water")) {
  if (checkProt(player, block.location, reg.id, "blockPlaceProtection")) {
  e.cancel = true;
  sendProtectionMessage(player, Lang.t(player, "lobby.protect.block_place"));
  return;
  }
  }
  } catch {}
  handleBlock(e, "blockPlaceProtection", "lobby.protect.block_place");
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
  try {
  if (!isLobbyProtectionEnabled()) return;
 const { player, block, itemStack } = e;
 if (block.typeId === "minecraft:ender_chest" && player.getDynamicProperty("lobby_protect:saved_inventory")) {
 e.cancel = true;
 sendProtectionMessage(player, Lang.t(player, "lobby.protect.ender_chest"));
 return;
 }
 const reg = isInProtectedRegion(block.location, block.dimension.id);
 if (!reg) return;
 if (
  itemStack &&
  (itemStack.typeId.includes("flint_and_steel") || itemStack.typeId.includes("fire_charge")) &&
  getRegionConfig(reg.id).fireProtection &&
  !isAuthorizedAdmin(player, reg.id)
 ) {
 e.cancel = true;
 sendProtectionMessage(player, Lang.t(player, "lobby.protect.fire"));
 return;
 }
 if (block.typeId === "minecraft:flower_pot") {
 if (
 checkProt(player, block.location, reg.id, "blockPlaceProtection") ||
 checkProt(player, block.location, reg.id, "blockBreakProtection")
 ) {
 e.cancel = true;
 sendProtectionMessage(player, Lang.t(player, "lobby.protect.flower_pot"));
 return;
 }
 }
  if (isBlockExcluded(block.typeId, reg.id)) {
  const itemTypeId = itemStack?.typeId?.toLowerCase() || "";
  if ((itemTypeId.includes("lava_bucket") || itemTypeId.includes("water_bucket")) &&
  checkProt(player, block.location, reg.id, "blockPlaceProtection")) {
  e.cancel = true;
  sendProtectionMessage(player, Lang.t(player, "lobby.protect.block_place"));
  }
  return;
  }
 const conf = getRegionConfig(reg.id);
 const blockProtKey =
 conf.interactiveBlocksProtection !== undefined
 ? "interactiveBlocksProtection"
 : "interactionProtection";
 if (!checkProt(player, block.location, reg.id, blockProtKey)) return;
 e.cancel = true;
 sendProtectionMessage(player, Lang.t(player, "lobby.protect.interaction"));
 } catch {}
 });
  world.beforeEvents.playerInteractWithEntity.subscribe((e) => {
  try {
  if (!isLobbyProtectionEnabled()) return;
  const { player, target: t, itemStack } = e;
  if (t?.isValid !== true) return;
  const targetLocation = t.location;
  const reg = isInProtectedRegion(targetLocation, t.dimension.id);
  if (!reg) return;
  if (isEntityExcluded(t.typeId, reg.id)) {
  const itemTypeId = itemStack?.typeId?.toLowerCase() || "";
  if ((itemTypeId.includes("lava_bucket") || itemTypeId.includes("water_bucket")) &&
  checkProt(player, targetLocation, reg.id, "blockPlaceProtection")) {
  e.cancel = true;
  sendProtectionMessage(player, Lang.t(player, "lobby.protect.block_place"));
  }
  return;
  }
 if ((t.typeId === "minecraft:frame" || t.typeId === "minecraft:glow_frame") && !isAuthorizedAdmin(player, reg.id)) {
 e.cancel = true;
 sendProtectionMessage(player, Lang.t(player, "lobby.protect.item_frame"));
 if (getRegionConfig(reg.id).showParticles)
 partQ.push({
 dim: player.dimension,
 loc: t.location,
 type: "minecraft:villager_angry",
 delay: 0,
 });
 return;
 }
  if (!checkProt(player, targetLocation, reg.id, "interactionProtection")) return;
  e.cancel = true;
  sendProtectionMessage(player, Lang.t(player, "lobby.protect.interaction"));
  } catch {}
  });
  world.beforeEvents.explosion.subscribe((e) => {
  if (!isLobbyProtectionEnabled()) return;
 const loc = e.source?.location;
 const dimId = e.source?.dimension?.id ?? e.dimension?.id;
 if (!dimId) return;
 if (loc) {
 const sourceReg = isInProtectedRegion(loc, dimId);
 if (sourceReg && cache.activeRegionIds.has(sourceReg.id) && (getRegionConfig(sourceReg.id).explosionProtection ?? true)) {
 e.cancel = true;
 return;
 }
 }
 const impactedBlocks = e.getImpactedBlocks();
 if (!impactedBlocks.length) return;
 const blocksToDestroy = [];
 for (const block of impactedBlocks) {
 const blockReg = isInProtectedRegion(block.location, dimId);
 if (!blockReg || !cache.activeRegionIds.has(blockReg.id) || !(getRegionConfig(blockReg.id).explosionProtection ?? true)) {
 blocksToDestroy.push(block);
 }
 }
 if (blocksToDestroy.length === 0) {
 e.cancel = true;
 } else {
 e.setImpactedBlocks(blocksToDestroy);
 }
 });
  world.beforeEvents.itemUse.subscribe((e) => {
  try {
  if (!isLobbyProtectionEnabled()) return;
 const itemId = e.itemStack?.typeId;
 const player = e.source;
 if (!itemId || !player) return;
  const reg = isInProtectedRegion(player.location, player.dimension.id);
  if (!reg) return;
  if (RESTRICTED_ITEM_IDS.has(itemId) && checkProt(player, player.location, reg.id, "itemUseProtection")) {
  e.cancel = true;
  sendProtectionMessage(player, Lang.t(player, "lobby.protect.interaction"));
  return;
  }
 if (BOW_ITEM_IDS.has(itemId) && hasAntiBowProtection(reg.id) && !isAuthorizedAdmin(player, reg.id)) {
 e.cancel = true;
 sendProtectionMessage(player, Lang.t(player, "lobby.protect.bow"));
 }
 } catch {}
 });
  world.afterEvents.itemStartUse?.subscribe?.((e) => {
  try {
  if (!isLobbyProtectionEnabled()) return;
 const itemId = e.itemStack?.typeId;
 if (!itemId || !BOW_ITEM_IDS.has(itemId)) return;
 const reg = isInProtectedRegion(e.source.location, e.source.dimension.id);
 if (!reg || !hasAntiBowProtection(reg.id) || isAuthorizedAdmin(e.source, reg.id)) return;
 sendProtectionMessage(e.source, Lang.t(e.source, "lobby.protect.bow"));
 } catch {}
 });
  const onPvpDamage = (e) => {
  try {
  if (!isLobbyProtectionEnabled()) return;
  const target = e.hurtEntity || e.entity;
  const attacker = e.damageSource?.damagingEntity;
  if (target?.typeId !== "minecraft:player" || attacker?.typeId !== "minecraft:player") return;
  const reg = isInProtectedRegion(target.location, target.dimension.id);
  if (!reg || isPvpRegion(reg.id) || !getRegionConfig(reg.id).pvpProtection || isAuthorizedAdmin(attacker, reg.id)) return;
  e.cancel = true;
  sendProtectionMessage(attacker, "§cPvP is disabled in this lobby.");
  } catch {}
  };
  const beforeEvents = world.beforeEvents;
  if (beforeEvents.entityHurt) beforeEvents.entityHurt.subscribe(onPvpDamage);
  else if (beforeEvents.entityDamage) beforeEvents.entityDamage.subscribe(onPvpDamage);
  world.afterEvents.playerSpawn.subscribe(({ player }) => system.run(() => {
   try {
    ensureLobbyProtectionRunner();
    if (player?.isValid === true) checkPlayerRegion(player);
   } catch { }
  }));
  world.afterEvents.playerLeave.subscribe(({ playerId }) => {
   clearLobbyRecoveryFailure(playerId);
   clearLobbyRuntimeState(playerId);
   system.run(() => {
    try {
     if (world.getPlayers().length) return;
     cache.mobScanQueue.clear();
     stopLobbyProtectionRunner();
    } catch { }
   });
  });
  try {
   if (world.getPlayers().length) ensureLobbyProtectionRunner();
  } catch { }
}

function runLobbyProtection() {
 let players;
 try {
  players = world.getPlayers();
 } catch {
  return;
 }
 if (!players.length) {
  cache.mobScanQueue.clear();
  cache.activeRegionIds.clear();
  stopLobbyProtectionRunner();
  return;
 }

 const now = Date.now();
 if (!isLobbyProtectionEnabled()) {
  cache.activeRegionIds.clear();
  if (protectionWasEnabled || cache.inventoryRetry.size) {
   for (let i = 0; i < players.length; i++) {
    const player = players[i];
    if (protectionWasEnabled || (cache.inventoryRetry.get(player.id) || Infinity) <= now) checkPlayerRegion(player);
   }
  }
  protectionWasEnabled = false;
  cache.mobScanQueue.clear();
  if (!cache.inventoryRetry.size) stopLobbyProtectionRunner();
  return;
 }

 protectionWasEnabled = true;
 cache.activeRegionIds.clear();
 resetRegionRuntimeCacheIfNeeded();
 const tick = system.currentTick;
 mobTick = (mobTick + 1) % 5;
 effectTick = (effectTick + 1) % EFFECT_REFRESH_PASSES;
 hungerEffectTick = (hungerEffectTick + 1) % 2;
 const scanMobs = mobTick === 0;
 const refreshEffects = effectTick === 0;
 const refreshHungerEffect = hungerEffectTick === 0;
 if (partQ.length) {
  const particles = partQ.splice(0, 15);
  for (let i = 0; i < particles.length; i++) {
   const particle = particles[i];
   system.runTimeout(() => {
    try {
     particle.dim.runCommand(`particle ${particle.type} ${particle.loc.x + 0.5} ${particle.loc.y + 0.5} ${particle.loc.z + 0.5}`);
    } catch { }
   }, particle.delay + i * 5);
  }
 }

 for (let i = 0; i < players.length; i++) {
  const player = players[i];
  try {
   const location = player.location;
   const position = { x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) };
   const previousPosition = cache.lastPos.get(player.id);
   const previousRegionId = cache.lastReg.get(player.id);
   const moved = !previousPosition || previousPosition.x !== position.x || previousPosition.y !== position.y || previousPosition.z !== position.z;
   cache.lastPos.set(player.id, position);
   const lastLookup = cache.lastRegionCheck.get(player.id);
   const needsRegionLookup = moved || !cache.lastRegion.has(player.id) || tick - lastLookup >= REGION_RECHECK_TICKS;
   let region;
   if (needsRegionLookup) {
    region = isInProtectedRegion(position, player.dimension.id);
    cache.lastRegion.set(player.id, region);
    cache.lastRegionCheck.set(player.id, tick);
   } else {
    region = cache.lastRegion.get(player.id);
   }
   const currentRegionId = region?.id;
   const retryDue = (cache.inventoryRetry.get(player.id) || Infinity) <= now;
   const hasLoadChunkTag = player.getTags().some((tag) => tag.startsWith("loadchunck`"));
   if (!hasLoadChunkTag && (!previousPosition || currentRegionId !== previousRegionId || retryDue)) {
    cache.lastReg.set(player.id, currentRegionId);
    if (checkPlayerRegion(player, region) === false) continue;
   }
   if (!region) continue;
   cache.activeRegionIds.add(region.id);
   const config = getRegionConfig(region.id);
   if (moved) updateFarmlandTracking(player, region, config);
   const admin = isAuthorizedAdmin(player, region.id, config);
   if (!admin && !isPlayerRankAllowed(player, config)) {
    ejectPlayerFromRegion(player, region, config);
    continue;
   }
   if (scanMobs && config.mobSpawnProtection) queueMobScan(player, region, position, location);
   if (!admin && config.antiFly && player.isFlying) {
    try {
     const below1 = player.dimension.getBlock({ x: position.x, y: position.y - 1, z: position.z });
     const below2 = player.dimension.getBlock({ x: position.x, y: position.y - 2, z: position.z });
     if (below1?.isAir && below2?.isAir) player.teleport({ x: position.x + 0.5, y: position.y - 2, z: position.z + 0.5 });
    } catch { }
   }
   if (!admin) {
    const isPvp = isPvpRegion(region.id);
    if (!isPvp && config.pvpProtection && refreshEffects) applyLobbyPvpEffect(player);
    else clearLobbyPvpEffect(player);
    if (!isPvp && config.damageProtection && refreshEffects) applyLobbyDamageEffect(player);
    else clearLobbyDamageEffect(player);
    if (config.hungerProtection && refreshHungerEffect) {
     try {
      try {
       player.addEffect("saturation", 100, { amplifier: 255, showParticles: false });
      } catch {
       player.runCommand("effect @s saturation 5 255 true");
      }
     } catch { }
    }
   } else {
    clearLobbyPvpEffect(player);
    clearLobbyDamageEffect(player);
   }
  } catch { }
 }
 processQueuedMobScans();
}

export function checkPlayerRegion(player, region = undefined) {
  try {
  const protectionEnabled = isLobbyProtectionEnabled();
  if (protectionEnabled) ensureLobbyProtectionRunner();
  if (!protectionEnabled) {
	updateFarmlandTracking(player, null, null);
  if (!deactivateLobbyMode(player)) {
   cache.inventoryRetry.set(player.id, Date.now() + 5000);
   ensureLobbyProtectionRunner();
   return false;
  }
  clearLobbyDamageEffect(player);
  clearLobbyPvpEffect(player);
  playerAreas.delete(player.id);
  cache.inventoryRetry.delete(player.id);
  if (player.hasTag(ADVENTURE_TAG)) {
  player.runCommand("gamemode survival");
  player.removeTag(ADVENTURE_TAG);
  }
  return true;
  }
 const reg =
 region === undefined
 ? isInProtectedRegion(player.location, player.dimension.id)
 : region;
  if (!reg) {
	updateFarmlandTracking(player, null, null);
  const wasTracked = playerAreas.has(player.id);
  const hadSavedInventory = player.getDynamicProperty("lobby_protect:saved_inventory") !== undefined;
  if (!deactivateLobbyMode(player)) {
   cache.inventoryRetry.set(player.id, Date.now() + 5000);
   ensureLobbyProtectionRunner();
   return false;
  }
  cache.inventoryRetry.delete(player.id);
  if (wasTracked || hadSavedInventory) {
 player.onScreenDisplay.setActionBar(Lang.t(player, "lobby.action.wilderness"));
  }
 playerAreas.delete(player.id);
  clearLobbyDamageEffect(player);
  clearLobbyPvpEffect(player);
 if (player.hasTag(ADVENTURE_TAG)) {
 player.runCommand("gamemode survival");
 try { player.removeTag(ADVENTURE_TAG); } catch {}
 }
 return true;
 }
 const conf = getRegionConfig(reg.id);
	updateFarmlandTracking(player, reg, conf);
 const admin = isAuthorizedAdmin(player, reg.id, conf);
 if (!admin && !isPlayerRankAllowed(player, conf)) {
  return ejectPlayerFromRegion(player, reg, conf);
 }
 const inventoryReady = conf.lobbyInventoryEnabled ? activateLobbyMode(player) : deactivateLobbyMode(player);
 if (!inventoryReady) {
  cache.inventoryRetry.set(player.id, Date.now() + 5000);
  ensureLobbyProtectionRunner();
  return false;
 }
 cache.inventoryRetry.delete(player.id);
  const isPvpReg = isPvpRegion(reg.id);
  if (!admin && !isPvpReg && conf.damageProtection) applyLobbyDamageEffect(player);
  else clearLobbyDamageEffect(player);
  if (!admin && !isPvpReg && conf.pvpProtection) applyLobbyPvpEffect(player);
  else clearLobbyPvpEffect(player);
  if (conf.adventureModeEnabled && !admin && !player.hasTag(ADVENTURE_TAG)) {
 player.runCommand("gamemode adventure");
  try { player.addTag(ADVENTURE_TAG); } catch {}
  }
    if (!conf.adventureModeEnabled && player.hasTag(ADVENTURE_TAG)) {
    player.runCommand("gamemode survival");
    try { player.removeTag(ADVENTURE_TAG); } catch {}
    }
 playerAreas.set(player.id, { regionId: reg.id, isProtected: true });
 if (conf.notifyOnEnter) {
 const isPvpNotify = isPvpRegion(reg.id);
 if (isPvpNotify) {
 player.onScreenDisplay.setActionBar(admin ? "§c⚔ §lPVP ARENA §r§7(Admin)" : "§c⚔ §lPVP ARENA §r§7- Fight!");
 } else {
 player.onScreenDisplay.setActionBar(
 admin
 ? Lang.t(player, "lobby.action.admin_zone")
 : Lang.t(player, "lobby.action.safe_zone"),
 );
 }
 }
 return true;
 } catch {
   try {
    cache.inventoryRetry.set(player.id, Date.now() + 5000);
    ensureLobbyProtectionRunner();
   } catch { }
   return false;
 }
}
