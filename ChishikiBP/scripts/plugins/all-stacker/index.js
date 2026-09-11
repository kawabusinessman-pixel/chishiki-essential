import { system, world, ActionFormData, ModalFormData, ItemStack } from "../../core.js";
import { Lang } from "../../lib/Lang.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
import {
 ITEM_TOTAL_PROPERTY,
 ITEM_EXPIRY_PROPERTY,
 ITEM_DISPLAY_PROPERTY,
 MOB_TOTAL_PROPERTY,
 MOB_DISPLAY_PROPERTY,
 ITEM_SUPPRESS_TAG,
 MOB_SUPPRESS_TAG,
} from "./stack-info.js";

/**
 * All Stacker integration for Chishiki Essential.
 * Dynamic properties and suppression tags are shared with ClearLag and kill tools.
 */
const CONFIG_KEY = "all_stacker_config";
const ITEM_VIRTUAL_LIFETIME_MS = 4 * 60 * 1000;
const SCAN_INTERVAL_TICKS = 100;
const MAX_ITEM_MERGES_PER_PASS = 32;
const MAX_MOB_MERGES_PER_PASS = 24;
const MAX_ITEM_STACK_TOTAL = 4096;
const MAX_MOB_STACK_TOTAL = 128;
const PLAYER_SCAN_MERGE_DISTANCE = 32;
const DIMENSION_IDS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const DEFAULT_CONFIG = Object.freeze({
 enabled: false,
 itemEnabled: true,
 mobEnabled: true,
 itemRadius: 8,
 itemDisplayRadius: 16,
 itemExcluded: [],
 mobRadius: 8,
 mobTypes: [
  "minecraft:pig",
  "minecraft:cow",
  "minecraft:sheep",
  "minecraft:chicken",
 ],
});

let settingsCache;
let itemUnpackRunning = false;
let mobUnpackRunning = false;
const pendingItemPickups = new Set();
const pendingMobSplits = new Set();
const mobSplitCooldowns = new Map();
let stackerRunId;

function clampInteger(value, minimum, maximum, fallback) {
 const number = Number(value);
 if (!Number.isFinite(number)) return fallback;
 return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function normalizeStringList(value, limit = 64) {
 if (!Array.isArray(value)) return [];
 return [...new Set(value.filter((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 128))]
 .slice(0, limit);
}

function normalizeConfig(value) {
 const input = value && typeof value === "object" ? value : {};
 return {
  enabled: input.enabled === undefined ? DEFAULT_CONFIG.enabled : !!input.enabled,
  itemEnabled: input.itemEnabled === undefined ? DEFAULT_CONFIG.itemEnabled : !!input.itemEnabled,
  mobEnabled: input.mobEnabled === undefined ? DEFAULT_CONFIG.mobEnabled : !!input.mobEnabled,
  itemRadius: clampInteger(input.itemRadius, 1, 32, DEFAULT_CONFIG.itemRadius),
  itemDisplayRadius: clampInteger(input.itemDisplayRadius, 4, 48, DEFAULT_CONFIG.itemDisplayRadius),
  itemExcluded: normalizeStringList(input.itemExcluded),
  mobRadius: clampInteger(input.mobRadius, 1, 24, DEFAULT_CONFIG.mobRadius),
  mobTypes: input.mobTypes === undefined
  ? [...DEFAULT_CONFIG.mobTypes]
  : normalizeStringList(input.mobTypes),
 };
}

function getSettings() {
 if (!settingsCache) {
  settingsCache = normalizeConfig(GlobalConfig.get(CONFIG_KEY, DEFAULT_CONFIG));
 }
 return settingsCache;
}

function saveSettings(nextSettings) {
 const normalized = normalizeConfig(nextSettings);
 if (!GlobalConfig.set(CONFIG_KEY, normalized)) return false;
 settingsCache = normalized;
 syncStackerInterval();
 return true;
}

function isEntityValid(entity) {
 try {
  if (!entity) return false;
  return entity.isValid === true;
 } catch {
  return false;
 }
}

function getEntityId(entity) {
 try {
  return entity?.id;
 } catch {
  return undefined;
 }
}

function hasTag(entity, tag) {
 try {
  return entity?.hasTag?.(tag) === true;
 } catch {
  return false;
 }
}

function addTag(entity, tag) {
 try {
  if (!entity?.addTag) return false;
  return entity.addTag(tag) !== false;
 } catch {
  return false;
 }
}

function removeTag(entity, tag) {
 try {
  if (!entity?.removeTag) return false;
  return entity.removeTag(tag) !== false;
 } catch {
  return false;
 }
}

function getDynamic(entity, key) {
 try {
  return entity?.getDynamicProperty?.(key);
 } catch {
  return undefined;
 }
}

function setDynamic(entity, key, value) {
 try {
  entity?.setDynamicProperty?.(key, value);
  return true;
 } catch {
  return false;
 }
}

function getComponent(target, ...ids) {
 for (const id of ids) {
  try {
   const component = target?.getComponent?.(id);
   if (component) return component;
  } catch {
  }
 }
 return undefined;
}

function hasComponent(target, ...ids) {
 for (const id of ids) {
  try {
   if (target?.hasComponent?.(id)) return true;
  } catch {
  }
 }
 return false;
}

function getDimensionSafe(id) {
 try {
  return world.getDimension(id);
 } catch {
  try {
   return world.getDimension(String(id).replace("minecraft:", ""));
  } catch {
   return undefined;
  }
 }
}

function getLoadedDimensions() {
 const dimensions = [];
 const seen = new Set();
 for (const id of DIMENSION_IDS) {
  const dimension = getDimensionSafe(id);
  if (dimension && !seen.has(dimension.id)) {
   seen.add(dimension.id);
   dimensions.push(dimension);
  }
 }
 return dimensions;
}

function getItemStack(entity) {
 try {
  return getComponent(entity, "item", "minecraft:item")?.itemStack;
 } catch {
  return undefined;
 }
}

function cloneItemStack(item) {
 try {
  return item.clone();
 } catch {
  return new ItemStack(item.typeId, item.amount);
 }
}

function getItemTotal(entity, physicalAmount) {
 const stored = Number(getDynamic(entity, ITEM_TOTAL_PROPERTY));
 return Number.isSafeInteger(stored) && stored > physicalAmount ? stored : physicalAmount;
}

function getItemExpiry(entity, fallback = Date.now() + ITEM_VIRTUAL_LIFETIME_MS) {
 const stored = Number(getDynamic(entity, ITEM_EXPIRY_PROPERTY));
 return Number.isFinite(stored) && stored > 0 ? stored : fallback;
}

function hasOurItemDisplay(entity) {
 return getDynamic(entity, ITEM_DISPLAY_PROPERTY) === true;
}

function clearItemStackMetadata(entity) {
 const shouldClearNameTag = hasOurItemDisplay(entity);
 setDynamic(entity, ITEM_TOTAL_PROPERTY, undefined);
 setDynamic(entity, ITEM_EXPIRY_PROPERTY, undefined);
 setDynamic(entity, ITEM_DISPLAY_PROPERTY, undefined);
 if (shouldClearNameTag) {
  try {
   entity.nameTag = "";
  } catch {
  }
 }
}

function formatIdentifier(identifier) {
 const raw = String(identifier || "").split(":").pop() || "";
 return raw.split("_").filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || identifier;
}

function updateItemDisplay(entity, item, total) {
 if (total <= item.amount) {
  clearItemStackMetadata(entity);
  return;
 }
 try {
  entity.nameTag = `§e×${total}§r\n§7${formatIdentifier(item.typeId)}`;
  setDynamic(entity, ITEM_DISPLAY_PROPERTY, true);
 } catch {
 }
}

function setVirtualItem(entity, item, total, expiry) {
 if (total <= item.amount) {
  clearItemStackMetadata(entity);
  return true;
 }
 if (!setDynamic(entity, ITEM_TOTAL_PROPERTY, total) || !setDynamic(entity, ITEM_EXPIRY_PROPERTY, expiry)) {
  clearItemStackMetadata(entity);
  return false;
 }
 updateItemDisplay(entity, item, total);
 return true;
}

function itemHasUnsafeData(item) {
 try {
  if (item.nameTag) return true;
  if ((item.getLore?.() || []).length > 0) return true;
  if ((item.getDynamicPropertyIds?.() || []).length > 0) return true;
  if (hasComponent(item, "minecraft:potion", "potion")) return true;
  if (hasComponent(item, "minecraft:book", "book")) return true;
  if (hasComponent(item, "minecraft:inventory", "inventory")) return true;
  if (hasComponent(item, "minecraft:dyeable", "dyeable")) return true;
  const enchantable = getComponent(item, "minecraft:enchantable", "enchantable");
  if (enchantable?.getEnchantments?.().length > 0) return true;
  const durability = getComponent(item, "minecraft:durability", "durability");
  if (Number(durability?.damage) > 0) return true;
 } catch {
  return true;
 }
 return false;
}

function isSafeItemToStack(item, config) {
 if (!item?.typeId || Number(item.amount) <= 0 || Number(item.maxAmount) <= 1) return false;
 if (config.itemExcluded.includes(item.typeId)) return false;
 if (["potion", "shulker_box", "bundle", "bed", "bottle"].some((part) => item.typeId.includes(part))) return false;
 return !itemHasUnsafeData(item);
}

function canMergeItems(first, second, config) {
 return first.typeId === second.typeId && isSafeItemToStack(first, config) && isSafeItemToStack(second, config);
}

function captureItemSnapshot(entity, item, total) {
 try {
  return {
   dimensionId: entity.dimension.id,
   location: { x: entity.location.x, y: entity.location.y, z: entity.location.z },
   item: cloneItemStack(item),
   physicalAmount: item.amount,
   total,
   expiry: getItemExpiry(entity),
  };
 } catch {
  return undefined;
 }
}

function spawnNormalItemRemainder(dimension, sourceItem, remaining, location) {
 while (remaining > 0) {
  const part = cloneItemStack(sourceItem);
  part.amount = Math.min(remaining, part.maxAmount);
  dimension.spawnItem(part, location);
  remaining -= part.amount;
 }
}

function restoreVirtualItem(snapshot) {
 if (!snapshot || snapshot.expiry <= Date.now()) return;
 const remaining = snapshot.total - snapshot.physicalAmount;
 if (remaining <= 0) return;
 try {
  const dimension = getDimensionSafe(snapshot.dimensionId);
  if (!dimension) return;
  const item = cloneItemStack(snapshot.item);
  item.amount = Math.min(remaining, item.maxAmount);
  const entity = dimension.spawnItem(item, snapshot.location);
  if (!setVirtualItem(entity, item, remaining, snapshot.expiry)) {
   spawnNormalItemRemainder(dimension, item, remaining - item.amount, snapshot.location);
  }
 } catch (error) {
  console.warn("[AllStacker] Gagal memulihkan tumpukan item:", error);
 }
}

function restoreCompleteItemSnapshot(snapshot) {
 if (!snapshot) return undefined;
 try {
  const dimension = getDimensionSafe(snapshot.dimensionId);
  if (!dimension) return undefined;
  const item = cloneItemStack(snapshot.item);
  item.amount = snapshot.physicalAmount;
  const entity = dimension.spawnItem(item, snapshot.location);
  if (snapshot.total > item.amount && !setVirtualItem(entity, item, snapshot.total, snapshot.expiry)) {
   spawnNormalItemRemainder(dimension, item, snapshot.total - item.amount, snapshot.location);
  }
  return entity;
 } catch (error) {
  console.warn("[AllStacker] Gagal memulihkan actor item:", error);
  return undefined;
 }
}

function expireVirtualItem(entity) {
 addTag(entity, ITEM_SUPPRESS_TAG);
 clearItemStackMetadata(entity);
 try {
  entity.remove();
 } catch {
 }
}

function mergeItems(anchor, source, config) {
 const anchorId = getEntityId(anchor);
 const sourceId = getEntityId(source);
 if (!anchorId || !sourceId || pendingItemPickups.has(anchorId) || pendingItemPickups.has(sourceId)) return false;
 const anchorItem = getItemStack(anchor);
 const sourceItem = getItemStack(source);
 if (!anchorItem || !sourceItem || !canMergeItems(anchorItem, sourceItem, config)) return false;

 const total = getItemTotal(anchor, anchorItem.amount) + getItemTotal(source, sourceItem.amount);
 if (!Number.isSafeInteger(total) || total > MAX_ITEM_STACK_TOTAL) return false;

 const anchorSnapshot = captureItemSnapshot(anchor, anchorItem, getItemTotal(anchor, anchorItem.amount));
 const sourceSnapshot = captureItemSnapshot(source, sourceItem, getItemTotal(source, sourceItem.amount));
 if (!anchorSnapshot || !sourceSnapshot) return false;
 let replacement;
 let replacementReady = false;
 try {
  const item = cloneItemStack(anchorItem);
  const location = { x: anchor.location.x, y: anchor.location.y, z: anchor.location.z };
  replacement = anchor.dimension.spawnItem(item, location);
  if (!setVirtualItem(replacement, item, total, Date.now() + ITEM_VIRTUAL_LIFETIME_MS)) {
   addTag(replacement, ITEM_SUPPRESS_TAG);
   replacement.remove();
   return false;
  }
  replacementReady = true;

  if (!addTag(anchor, ITEM_SUPPRESS_TAG) || !addTag(source, ITEM_SUPPRESS_TAG)) {
   throw new Error("failed to lock source items");
  }
  if (!isEntityValid(anchor) || !isEntityValid(source)) throw new Error("source item became invalid");
  source.remove();
  anchor.remove();
  return true;
 } catch (error) {
  let replacementRemoved = true;
  if (isEntityValid(replacement)) {
   try {
    addTag(replacement, ITEM_SUPPRESS_TAG);
    replacement.remove();
   } catch {
    replacementRemoved = false;
   }
  }
  if (replacementRemoved) {
   if (isEntityValid(anchor)) removeTag(anchor, ITEM_SUPPRESS_TAG);
   else restoreCompleteItemSnapshot(anchorSnapshot);
   if (isEntityValid(source)) removeTag(source, ITEM_SUPPRESS_TAG);
   else restoreCompleteItemSnapshot(sourceSnapshot);
  } else if (replacementReady) {
   for (const original of [source, anchor]) {
    if (!isEntityValid(original)) continue;
    try {
     addTag(original, ITEM_SUPPRESS_TAG);
     original.remove();
    } catch { }
   }
  } else {
   if (isEntityValid(anchor)) removeTag(anchor, ITEM_SUPPRESS_TAG);
   if (isEntityValid(source)) removeTag(source, ITEM_SUPPRESS_TAG);
  }
  console.warn("[AllStacker] Gagal menggabungkan item:", error);
  return replacementReady && isEntityValid(replacement) && !isEntityValid(anchor) && !isEntityValid(source);
 }
}

function getPlayerSnapshots() {
 const snapshots = [];
 for (const player of world.getPlayers()) {
  if (!isEntityValid(player)) continue;
  try {
   const location = player.location;
   const dimension = player.dimension;
   snapshots.push({
    dimension,
    location: { x: location.x, y: location.y, z: location.z },
   });
  } catch {
  }
 }
 return snapshots;
}

function distanceSquared(first, second) {
 const dx = first.x - second.x;
 const dy = first.y - second.y;
 const dz = first.z - second.z;
 return dx * dx + dy * dy + dz * dz;
}

function buildPlayerScanRegions(playerSnapshots, baseRadius) {
 const regions = [];
 const mergeDistance = Math.min(PLAYER_SCAN_MERGE_DISTANCE, Math.max(16, baseRadius / 2));
 const mergeDistanceSquared = mergeDistance * mergeDistance;

 for (const snapshot of playerSnapshots) {
  let selected;
  let selectedDistance = Infinity;
  for (const region of regions) {
   if (region.dimension.id !== snapshot.dimension.id) continue;
   const distance = distanceSquared(region.anchor, snapshot.location);
   if (distance <= mergeDistanceSquared && distance < selectedDistance) {
    selected = region;
    selectedDistance = distance;
   }
  }
  if (selected) {
   selected.players.push(snapshot);
  } else {
   regions.push({
    dimension: snapshot.dimension,
    anchor: snapshot.location,
    players: [snapshot],
   });
  }
 }

 for (const region of regions) {
  const center = { x: 0, y: 0, z: 0 };
  for (const snapshot of region.players) {
   center.x += snapshot.location.x;
   center.y += snapshot.location.y;
   center.z += snapshot.location.z;
  }
  center.x /= region.players.length;
  center.y /= region.players.length;
  center.z /= region.players.length;
  let spreadSquared = 0;
  for (const snapshot of region.players) {
   spreadSquared = Math.max(spreadSquared, distanceSquared(center, snapshot.location));
  }
  region.center = center;
  region.queryRadius = baseRadius + Math.sqrt(spreadSquared);
 }
 return regions;
}

function collectNearbyEntities(typeId, radius, playerSnapshots) {
 const entities = new Map();
 const radiusSquared = radius * radius;
 for (const region of buildPlayerScanRegions(playerSnapshots, radius)) {
  try {
   const query = { location: region.center, maxDistance: region.queryRadius };
   if (typeId) query.type = typeId;
   for (const entity of region.dimension.getEntities(query)) {
    const entityId = getEntityId(entity);
    if (!entityId || entities.has(entityId)) continue;
    let location;
    try { location = entity.location; } catch { continue; }
    if (!region.players.some((snapshot) => distanceSquared(location, snapshot.location) <= radiusSquared)) continue;
    entities.set(entityId, entity);
   }
  } catch {
  }
 }
 return [...entities.values()];
}

function getSpatialCell(location, cellSize) {
 return {
  x: Math.floor(location.x / cellSize),
  y: Math.floor(location.y / cellSize),
  z: Math.floor(location.z / cellSize),
 };
}

function makeSpatialKey(dimensionId, typeId, x, y, z) {
 return `${dimensionId}:${typeId}:${x},${y},${z}`;
}

function isLocationNearPlayers(location, dimensionId, playerSnapshots, radiusSquared) {
 for (const snapshot of playerSnapshots) {
  if (snapshot.dimension.id !== dimensionId) continue;
  if (distanceSquared(location, snapshot.location) <= radiusSquared) return true;
 }
 return false;
}

function maintainAndStackItems(config, playerSnapshots) {
 if (!config.enabled || playerSnapshots.length === 0) return;
 const scanRadius = Math.max(config.itemRadius, config.itemDisplayRadius);
 const candidatePadding = config.itemEnabled ? config.itemRadius : 0;
 const entities = collectNearbyEntities("minecraft:item", scanRadius + candidatePadding, playerSnapshots);
 const primaryRadiusSquared = scanRadius * scanRadius;
 const now = Date.now();
 const records = [];

 for (const entity of entities) {
  const id = getEntityId(entity);
  if (!id || !isEntityValid(entity) || hasTag(entity, ITEM_SUPPRESS_TAG) || pendingItemPickups.has(id)) continue;
  const item = getItemStack(entity);
  if (!item) continue;
  let location;
  let dimensionId;
  try {
   location = entity.location;
   dimensionId = entity.dimension.id;
  } catch {
   continue;
  }
  const isPrimary = isLocationNearPlayers(location, dimensionId, playerSnapshots, primaryRadiusSquared);
  const total = getItemTotal(entity, item.amount);
  if (isPrimary && total > item.amount) {
   if (getItemExpiry(entity) <= now) {
    expireVirtualItem(entity);
    continue;
   }
   updateItemDisplay(entity, item, total);
  }
  if (config.itemEnabled && isSafeItemToStack(item, config)) {
   records.push({ entity, id, item, location, dimensionId, isPrimary });
  }
 }

 if (!config.itemEnabled || records.length < 2) return;
 const cellSize = Math.max(1, config.itemRadius);
 const buckets = new Map();
 for (const record of records) {
  const cell = getSpatialCell(record.location, cellSize);
  record.cell = cell;
  const key = makeSpatialKey(record.dimensionId, record.item.typeId, cell.x, cell.y, cell.z);
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(record);
 }

 const processed = new Set();
 const radiusSquared = config.itemRadius * config.itemRadius;
 let merges = 0;
 for (const record of records) {
  if (merges >= MAX_ITEM_MERGES_PER_PASS) break;
  if (!record.isPrimary || processed.has(record.id) || !isEntityValid(record.entity)) continue;

  let merged = false;
  for (let x = record.cell.x - 1; x <= record.cell.x + 1 && !merged; x++) {
   for (let y = record.cell.y - 1; y <= record.cell.y + 1 && !merged; y++) {
    for (let z = record.cell.z - 1; z <= record.cell.z + 1 && !merged; z++) {
     const nearby = buckets.get(makeSpatialKey(record.dimensionId, record.item.typeId, x, y, z));
     if (!nearby) continue;
     for (const sourceRecord of nearby) {
      if (merges >= MAX_ITEM_MERGES_PER_PASS) break;
      if (sourceRecord.id === record.id || processed.has(sourceRecord.id)) continue;
      if (distanceSquared(record.location, sourceRecord.location) > radiusSquared) continue;
      const source = sourceRecord.entity;
      if (!isEntityValid(source) || hasTag(source, ITEM_SUPPRESS_TAG)) continue;
      const sourceItem = getItemStack(source);
      if (!sourceItem) continue;
      if (getItemTotal(source, sourceItem.amount) > sourceItem.amount && getItemExpiry(source) <= now) {
       expireVirtualItem(source);
       processed.add(sourceRecord.id);
       continue;
      }
      if (mergeItems(record.entity, source, config)) {
       processed.add(record.id);
       processed.add(sourceRecord.id);
       merges++;
       merged = true;
       break;
      }
     }
    }
   }
  }
 }
}

function* unpackItemStacks() {
 try {
  for (const dimension of getLoadedDimensions()) {
   const entities = dimension.getEntities({ type: "minecraft:item" });
   for (const entity of entities) {
    if (!isEntityValid(entity)) continue;
    const item = getItemStack(entity);
    if (!item) continue;
    const total = getItemTotal(entity, item.amount);
    if (total <= item.amount) continue;

    const baseItem = cloneItemStack(item);
    const location = { x: entity.location.x, y: entity.location.y, z: entity.location.z };
    let remaining = total - item.amount;
    clearItemStackMetadata(entity);

    while (remaining > 0) {
     const part = cloneItemStack(baseItem);
     part.amount = Math.min(remaining, part.maxAmount);
     dimension.spawnItem(part, location);
     remaining -= part.amount;
    }
    yield;
   }
  }
 } catch (error) {
  console.warn("[AllStacker] Gagal membongkar tumpukan item:", error);
 } finally {
  itemUnpackRunning = false;
 }
}

function scheduleItemUnpack() {
 if (itemUnpackRunning) return;
 itemUnpackRunning = true;
 system.runJob(unpackItemStacks());
}

function getMobTotal(entity) {
 const stored = Number(getDynamic(entity, MOB_TOTAL_PROPERTY));
 return Number.isSafeInteger(stored) && stored > 1 ? stored : 1;
}

function hasOurMobDisplay(entity) {
 return getDynamic(entity, MOB_DISPLAY_PROPERTY) === true;
}

function clearMobStackMetadata(entity) {
 const shouldClearNameTag = hasOurMobDisplay(entity);
 setDynamic(entity, MOB_TOTAL_PROPERTY, undefined);
 setDynamic(entity, MOB_DISPLAY_PROPERTY, undefined);
 if (shouldClearNameTag) {
  try {
   entity.nameTag = "";
  } catch {
  }
 }
}

function updateMobDisplay(entity, total) {
 if (total <= 1) {
  clearMobStackMetadata(entity);
  return;
 }
 try {
  entity.nameTag = `§e×${total}§r\n§7${formatIdentifier(entity.typeId)}`;
  setDynamic(entity, MOB_DISPLAY_PROPERTY, true);
 } catch {
 }
}

function setMobTotal(entity, total) {
 if (total <= 1) {
  clearMobStackMetadata(entity);
  return true;
 }
 if (!setDynamic(entity, MOB_TOTAL_PROPERTY, total)) return false;
 updateMobDisplay(entity, total);
 return true;
}

function getColorValue(entity) {
 try {
  return getComponent(entity, "color", "minecraft:color")?.value;
 } catch {
  return undefined;
 }
}

function isBabyMob(entity) {
 return hasComponent(entity, "is_baby", "minecraft:is_baby");
}

function isTamedOrLeashed(entity) {
 if (hasComponent(entity, "is_tamed", "minecraft:is_tamed", "tameable", "minecraft:tameable")) return true;
 const leashable = getComponent(entity, "leashable", "minecraft:leashable");
 return !!leashable?.leashHolder;
}

function isSafeMobToStack(entity, config) {
 if (!isEntityValid(entity) || hasTag(entity, MOB_SUPPRESS_TAG)) return false;
 if (!config.mobTypes.includes(entity.typeId)) return false;
 if (entity.typeId === "minecraft:player") return false;
 if (isTamedOrLeashed(entity)) return false;
 if (entity.nameTag && !hasOurMobDisplay(entity)) return false;
 const cooldown = mobSplitCooldowns.get(entity.id) || 0;
 return cooldown <= system.currentTick;
}

function canMergeMobs(anchor, source, config) {
 if (!isSafeMobToStack(anchor, config) || !isSafeMobToStack(source, config)) return false;
 if (anchor.typeId !== source.typeId) return false;
 if (isBabyMob(anchor) !== isBabyMob(source)) return false;
 return getColorValue(anchor) === getColorValue(source);
}

function captureMobSnapshot(entity, amount = getMobTotal(entity)) {
 try {
  return {
   dimensionId: entity.dimension.id,
   location: { x: entity.location.x, y: entity.location.y, z: entity.location.z },
   typeId: entity.typeId,
   color: getColorValue(entity),
   isBaby: isBabyMob(entity),
   amount,
  };
 } catch {
  return undefined;
 }
}

function spawnMobSnapshot(snapshot, amount = snapshot?.amount || 1, offsetIndex = 0) {
 if (!snapshot || amount <= 0) return undefined;
 try {
  const dimension = getDimensionSafe(snapshot.dimensionId);
  if (!dimension) return undefined;
  const angle = offsetIndex * 2.399963229728653;
  const radius = offsetIndex > 0 ? Math.min(1.5, 0.25 + Math.sqrt(offsetIndex) * 0.08) : 0;
  const location = {
   x: snapshot.location.x + Math.cos(angle) * radius,
   y: snapshot.location.y,
   z: snapshot.location.z + Math.sin(angle) * radius,
  };
  const entity = dimension.spawnEntity(snapshot.typeId, location);
  const color = getComponent(entity, "color", "minecraft:color");
  if (color && snapshot.color !== undefined) {
   try {
    color.value = snapshot.color;
   } catch {
   }
  }
  if (snapshot.isBaby) {
   try {
    entity.triggerEvent("minecraft:entity_born");
   } catch {
   }
  }
  if (!setMobTotal(entity, amount)) {
   for (let index = 1; index < amount; index++) {
    spawnMobSnapshot(snapshot, 1, offsetIndex + index);
   }
  }
  return entity;
 } catch (error) {
  console.warn("[AllStacker] Gagal memulihkan mob:", error);
  return undefined;
 }
}

function mergeMobs(anchor, source, config, prevalidated = false) {
 if (prevalidated) {
  if (!isEntityValid(anchor) || !isEntityValid(source)) return false;
 } else if (!canMergeMobs(anchor, source, config)) {
  return false;
 }
 const previousTotal = getMobTotal(anchor);
 const total = previousTotal + getMobTotal(source);
 if (!Number.isSafeInteger(total) || total > MAX_MOB_STACK_TOTAL) return false;
 try {
  if (!setMobTotal(anchor, total)) return false;
  addTag(source, MOB_SUPPRESS_TAG);
  source.remove();
  return true;
 } catch (error) {
  setMobTotal(anchor, previousTotal);
  console.warn("[AllStacker] Gagal menggabungkan mob:", error);
  return false;
 }
}

function stackMobs(config, playerSnapshots) {
 if (!config.enabled || !config.mobEnabled || config.mobTypes.length === 0 || playerSnapshots.length === 0) return;
 const scanRadius = Math.max(config.mobRadius, 12);
 const entities = collectNearbyEntities(undefined, scanRadius + config.mobRadius, playerSnapshots);
 const primaryRadiusSquared = scanRadius * scanRadius;
 const records = [];

 for (const entity of entities) {
  const id = getEntityId(entity);
  if (!id || !isSafeMobToStack(entity, config)) continue;
  let location;
  let dimensionId;
  try {
   location = entity.location;
   dimensionId = entity.dimension.id;
  } catch {
   continue;
  }
  records.push({
   entity,
   id,
   typeId: entity.typeId,
   location,
   dimensionId,
   isPrimary: isLocationNearPlayers(location, dimensionId, playerSnapshots, primaryRadiusSquared),
   isBaby: isBabyMob(entity),
   color: getColorValue(entity),
  });
 }

 if (records.length < 2) return;
 const cellSize = Math.max(1, config.mobRadius);
 const buckets = new Map();
 for (const record of records) {
  const cell = getSpatialCell(record.location, cellSize);
  record.cell = cell;
  const key = makeSpatialKey(record.dimensionId, record.typeId, cell.x, cell.y, cell.z);
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(record);
 }

 const processed = new Set();
 const radiusSquared = config.mobRadius * config.mobRadius;
 let merges = 0;
 for (const record of records) {
  if (merges >= MAX_MOB_MERGES_PER_PASS) break;
  if (!record.isPrimary || processed.has(record.id) || !isEntityValid(record.entity)) continue;

  for (let x = record.cell.x - 1; x <= record.cell.x + 1; x++) {
   for (let y = record.cell.y - 1; y <= record.cell.y + 1; y++) {
    for (let z = record.cell.z - 1; z <= record.cell.z + 1; z++) {
     const nearby = buckets.get(makeSpatialKey(record.dimensionId, record.typeId, x, y, z));
     if (!nearby) continue;
     for (const sourceRecord of nearby) {
      if (merges >= MAX_MOB_MERGES_PER_PASS) break;
      if (sourceRecord.id === record.id || processed.has(sourceRecord.id)) continue;
      if (sourceRecord.isBaby !== record.isBaby || sourceRecord.color !== record.color) continue;
      if (distanceSquared(record.location, sourceRecord.location) > radiusSquared) continue;
      if (mergeMobs(record.entity, sourceRecord.entity, config, true)) {
       processed.add(sourceRecord.id);
       merges++;
      }
     }
     if (merges >= MAX_MOB_MERGES_PER_PASS) break;
    }
    if (merges >= MAX_MOB_MERGES_PER_PASS) break;
   }
  }
 }
}

function* unpackMobStacks() {
 try {
  for (const dimension of getLoadedDimensions()) {
   for (const entity of dimension.getEntities()) {
    if (!isEntityValid(entity)) continue;
    const total = getMobTotal(entity);
    if (total <= 1) continue;
    const snapshot = captureMobSnapshot(entity, total);
    if (!snapshot) continue;

    clearMobStackMetadata(entity);
    for (let index = 1; index < total; index++) {
     spawnMobSnapshot(snapshot, 1, index);
    }
    yield;
   }
  }
 } catch (error) {
  console.warn("[AllStacker] Gagal membongkar tumpukan mob:", error);
 } finally {
  mobUnpackRunning = false;
 }
}

function scheduleMobUnpack() {
 if (mobUnpackRunning) return;
 mobUnpackRunning = true;
 system.runJob(unpackMobStacks());
}

function statusText(player, enabled) {
 return Lang.t(player, enabled ? "all_stacker.status.enabled" : "all_stacker.status.disabled");
}

function showLater(callback) {
 if (typeof callback === "function") system.runTimeout(callback, 2);
}

function isCanceled(response) {
 return !response || response.canceled || response.isCanceled;
}

async function showItemSettings(player, onBack) {
 const config = getSettings();
 const response = await new ActionFormData().simpleUi()
 .title(Lang.t(player, "all_stacker.item.title"))
 .body(Lang.t(
  player,
  "all_stacker.item.body",
  statusText(player, config.enabled && config.itemEnabled),
  config.itemRadius,
  config.itemDisplayRadius,
  config.itemExcluded.length,
 ))
 .button(
  Lang.t(player, config.itemEnabled ? "all_stacker.item.btn.disable" : "all_stacker.item.btn.enable"),
  config.itemEnabled ? "textures/ui/toggle/on" : "textures/ui/toggle/off",
 )
 .button(Lang.t(player, "all_stacker.item.btn.settings"), "textures/ui/settings_glyph_color_2x")
 .button(Lang.t(player, "all_stacker.item.btn.exclusions"), "textures/ui/icon_book_writable")
 .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
 .show(player);
 if (isCanceled(response)) return;

 if (response.selection === 0) {
  const next = { ...config, itemEnabled: !config.itemEnabled };
  if (!saveSettings(next)) {
   player.sendMessage(Lang.t(player, "all_stacker.msg.save_failed"));
   return;
  }
  player.sendMessage(Lang.t(player, next.itemEnabled ? "all_stacker.msg.item_enabled" : "all_stacker.msg.item_disabled"));
  showLater(() => showItemSettings(player, onBack));
 } else if (response.selection === 1) {
  await showItemAdvancedSettings(player, onBack);
 } else if (response.selection === 2) {
  await showItemExclusions(player, onBack);
 } else if (response.selection === 3) {
  showLater(onBack);
 }
}

async function showItemAdvancedSettings(player, onBack) {
 const config = getSettings();
 const response = await new ModalFormData()
 .title(Lang.t(player, "all_stacker.item.settings.title"))
 .slider(Lang.t(player, "all_stacker.item.settings.radius_merge"), 1, 32, { valueStep: 1, defaultValue: config.itemRadius })
 .slider(Lang.t(player, "all_stacker.item.settings.radius_display"), 4, 48, { valueStep: 1, defaultValue: config.itemDisplayRadius })
 .submitButton(Lang.t(player, "all_stacker.item.settings.submit"))
 .show(player);
 if (isCanceled(response)) return;

 const [itemRadius, itemDisplayRadius] = response.formValues || [];
 if (!saveSettings({ ...config, itemRadius, itemDisplayRadius })) {
  player.sendMessage(Lang.t(player, "all_stacker.msg.save_failed"));
  return;
 }
 player.sendMessage(Lang.t(player, "all_stacker.msg.saved"));
 showLater(() => showItemSettings(player, onBack));
}

function getInventoryStackableItems(player, config) {
 const inventory = getComponent(player, "inventory", "minecraft:inventory")?.container;
 if (!inventory) return [];
 const items = new Map();
 for (let slot = 0; slot < inventory.size; slot++) {
  const item = inventory.getItem(slot);
  if (item && isSafeItemToStack(item, config)) items.set(item.typeId, item);
 }
 return [...items.values()];
}

async function showItemExclusions(player, onBack) {
 const config = getSettings();
 const response = await new ActionFormData().simpleUi()
 .title(Lang.t(player, "all_stacker.exclusions.title"))
 .body(Lang.t(player, "all_stacker.exclusions.body", config.itemExcluded.length))
 .button(Lang.t(player, "all_stacker.exclusions.btn.add"), "textures/ui/plus")
 .button(Lang.t(player, "all_stacker.exclusions.btn.remove"), "textures/ui/trash")
 .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
 .show(player);
 if (isCanceled(response)) return;
 if (response.selection === 0) {
  await showAddItemExclusion(player, onBack);
 } else if (response.selection === 1) {
  await showRemoveItemExclusion(player, onBack);
 } else if (response.selection === 2) {
  showLater(() => showItemSettings(player, onBack));
 }
}

async function showAddItemExclusion(player, onBack) {
 const config = getSettings();
 const items = getInventoryStackableItems(player, config).filter((item) => !config.itemExcluded.includes(item.typeId));
 if (items.length === 0) {
  await new ActionFormData().simpleUi()
  .title(Lang.t(player, "all_stacker.exclusions.add.title"))
  .body(Lang.t(player, "all_stacker.exclusions.add.empty"))
  .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
  .show(player);
  showLater(() => showItemExclusions(player, onBack));
  return;
 }

 const form = new ActionFormData().simpleUi()
 .title(Lang.t(player, "all_stacker.exclusions.add.title"))
 .body(Lang.t(player, "all_stacker.exclusions.add.body"));
 for (const item of items) form.button(formatIdentifier(item.typeId), "textures/ui/icon_recipe_item");
 form.button(Lang.t(player, "common.back"), "textures/ui/arrow_left");
 const response = await form.show(player);
 if (isCanceled(response)) return;
 if (response.selection === items.length) {
  showLater(() => showItemExclusions(player, onBack));
  return;
 }
 const item = items[response.selection];
 if (!item) return;
 if (!saveSettings({ ...config, itemExcluded: [...config.itemExcluded, item.typeId] })) {
  player.sendMessage(Lang.t(player, "all_stacker.msg.save_failed"));
  return;
 }
 player.sendMessage(Lang.t(player, "all_stacker.exclusions.msg.added", formatIdentifier(item.typeId)));
 showLater(() => showItemExclusions(player, onBack));
}

async function showRemoveItemExclusion(player, onBack) {
 const config = getSettings();
 if (config.itemExcluded.length === 0) {
  await new ActionFormData().simpleUi()
  .title(Lang.t(player, "all_stacker.exclusions.remove.title"))
  .body(Lang.t(player, "all_stacker.exclusions.remove.empty"))
  .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
  .show(player);
  showLater(() => showItemExclusions(player, onBack));
  return;
 }

 const form = new ActionFormData().simpleUi()
 .title(Lang.t(player, "all_stacker.exclusions.remove.title"))
 .body(Lang.t(player, "all_stacker.exclusions.remove.body"));
 for (const typeId of config.itemExcluded) form.button(formatIdentifier(typeId), "textures/ui/trash");
 form.button(Lang.t(player, "common.back"), "textures/ui/arrow_left");
 const response = await form.show(player);
 if (isCanceled(response)) return;
 if (response.selection === config.itemExcluded.length) {
  showLater(() => showItemExclusions(player, onBack));
  return;
 }
 const typeId = config.itemExcluded[response.selection];
 if (!typeId) return;
 if (!saveSettings({ ...config, itemExcluded: config.itemExcluded.filter((entry) => entry !== typeId) })) {
  player.sendMessage(Lang.t(player, "all_stacker.msg.save_failed"));
  return;
 }
 player.sendMessage(Lang.t(player, "all_stacker.exclusions.msg.removed", formatIdentifier(typeId)));
 showLater(() => showItemExclusions(player, onBack));
}

async function showMobSettings(player, onBack) {
 const config = getSettings();
 const response = await new ActionFormData().simpleUi()
 .title(Lang.t(player, "all_stacker.mob.title"))
 .body(Lang.t(player, "all_stacker.mob.body", statusText(player, config.enabled && config.mobEnabled), config.mobRadius, config.mobTypes.length))
 .button(
  Lang.t(player, config.mobEnabled ? "all_stacker.mob.btn.disable" : "all_stacker.mob.btn.enable"),
  config.mobEnabled ? "textures/ui/toggle/on" : "textures/ui/toggle/off",
 )
 .button(Lang.t(player, "all_stacker.mob.btn.settings"), "textures/ui/settings_glyph_color_2x")
 .button(Lang.t(player, "all_stacker.mob.btn.types"), "textures/blocks/build_allow")
 .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
 .show(player);
 if (isCanceled(response)) return;

 if (response.selection === 0) {
  const next = { ...config, mobEnabled: !config.mobEnabled };
  if (!saveSettings(next)) {
   player.sendMessage(Lang.t(player, "all_stacker.msg.save_failed"));
   return;
  }
  player.sendMessage(Lang.t(player, next.mobEnabled ? "all_stacker.msg.mob_enabled" : "all_stacker.msg.mob_disabled"));
  showLater(() => showMobSettings(player, onBack));
 } else if (response.selection === 1) {
  await showMobAdvancedSettings(player, onBack);
 } else if (response.selection === 2) {
  await showMobTypes(player, onBack);
 } else if (response.selection === 3) {
  showLater(onBack);
 }
}

async function showMobAdvancedSettings(player, onBack) {
 const config = getSettings();
 const response = await new ModalFormData()
 .title(Lang.t(player, "all_stacker.mob.settings.title"))
 .slider(Lang.t(player, "all_stacker.mob.settings.radius"), 1, 24, { valueStep: 1, defaultValue: config.mobRadius })
 .submitButton(Lang.t(player, "all_stacker.mob.settings.submit"))
 .show(player);
 if (isCanceled(response)) return;
 const [mobRadius] = response.formValues || [];
 if (!saveSettings({ ...config, mobRadius })) {
  player.sendMessage(Lang.t(player, "all_stacker.msg.save_failed"));
  return;
 }
 player.sendMessage(Lang.t(player, "all_stacker.msg.saved"));
 showLater(() => showMobSettings(player, onBack));
}

function getNearbyMobTypes(player, config) {
 const types = new Map();
 try {
  for (const entity of player.dimension.getEntities({ location: player.location, maxDistance: 10 })) {
   if (!isEntityValid(entity) || entity.typeId === "minecraft:player") continue;
   if (!getComponent(entity, "health", "minecraft:health")) continue;
   if (isTamedOrLeashed(entity)) continue;
   if (entity.nameTag && !hasOurMobDisplay(entity)) continue;
   if (!types.has(entity.typeId)) types.set(entity.typeId, entity);
  }
 } catch {
 }
 return [...types.keys()].filter((typeId) => !config.mobTypes.includes(typeId));
}

async function showMobTypes(player, onBack) {
 const config = getSettings();
 const response = await new ActionFormData().simpleUi()
 .title(Lang.t(player, "all_stacker.mob.types.title"))
 .body(Lang.t(player, "all_stacker.mob.types.body", config.mobTypes.length))
 .button(Lang.t(player, "all_stacker.mob.types.btn.add"), "textures/ui/plus")
 .button(Lang.t(player, "all_stacker.mob.types.btn.remove"), "textures/ui/trash")
 .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
 .show(player);
 if (isCanceled(response)) return;
 if (response.selection === 0) {
  await showAddMobType(player, onBack);
 } else if (response.selection === 1) {
  await showRemoveMobType(player, onBack);
 } else if (response.selection === 2) {
  showLater(() => showMobSettings(player, onBack));
 }
}

async function showAddMobType(player, onBack) {
 const config = getSettings();
 const types = getNearbyMobTypes(player, config);
 if (types.length === 0) {
  await new ActionFormData().simpleUi()
  .title(Lang.t(player, "all_stacker.mob.types.add.title"))
  .body(Lang.t(player, "all_stacker.mob.types.add.empty"))
  .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
  .show(player);
  showLater(() => showMobTypes(player, onBack));
  return;
 }

 const form = new ActionFormData().simpleUi()
 .title(Lang.t(player, "all_stacker.mob.types.add.title"))
 .body(Lang.t(player, "all_stacker.mob.types.add.body"));
 for (const typeId of types) form.button(formatIdentifier(typeId), "textures/ui/icon_book_writable");
 form.button(Lang.t(player, "common.back"), "textures/ui/arrow_left");
 const response = await form.show(player);
 if (isCanceled(response)) return;
 if (response.selection === types.length) {
  showLater(() => showMobTypes(player, onBack));
  return;
 }
 const typeId = types[response.selection];
 if (!typeId) return;
 if (!saveSettings({ ...config, mobTypes: [...config.mobTypes, typeId] })) {
  player.sendMessage(Lang.t(player, "all_stacker.msg.save_failed"));
  return;
 }
 player.sendMessage(Lang.t(player, "all_stacker.mob.types.msg.added", formatIdentifier(typeId)));
 showLater(() => showMobTypes(player, onBack));
}

async function showRemoveMobType(player, onBack) {
 const config = getSettings();
 if (config.mobTypes.length === 0) {
  await new ActionFormData().simpleUi()
  .title(Lang.t(player, "all_stacker.mob.types.remove.title"))
  .body(Lang.t(player, "all_stacker.mob.types.remove.empty"))
  .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
  .show(player);
  showLater(() => showMobTypes(player, onBack));
  return;
 }

 const form = new ActionFormData().simpleUi()
 .title(Lang.t(player, "all_stacker.mob.types.remove.title"))
 .body(Lang.t(player, "all_stacker.mob.types.remove.body"));
 for (const typeId of config.mobTypes) form.button(formatIdentifier(typeId), "textures/ui/trash");
 form.button(Lang.t(player, "common.back"), "textures/ui/arrow_left");
 const response = await form.show(player);
 if (isCanceled(response)) return;
 if (response.selection === config.mobTypes.length) {
  showLater(() => showMobTypes(player, onBack));
  return;
 }
 const typeId = config.mobTypes[response.selection];
 if (!typeId) return;
 if (!saveSettings({ ...config, mobTypes: config.mobTypes.filter((entry) => entry !== typeId) })) {
  player.sendMessage(Lang.t(player, "all_stacker.msg.save_failed"));
  return;
 }
 player.sendMessage(Lang.t(player, "all_stacker.mob.types.msg.removed", formatIdentifier(typeId)));
 showLater(() => showMobTypes(player, onBack));
}

async function showAllStackerAdminMenu(player, onBack) {
 if (!player?.hasTag?.("admin")) return;
 const config = getSettings();
 const response = await new ActionFormData().simpleUi()
 .title(Lang.t(player, "all_stacker.title"))
 .body(Lang.t(
  player,
  "all_stacker.body",
  statusText(player, config.enabled),
  statusText(player, config.enabled && config.itemEnabled),
  statusText(player, config.enabled && config.mobEnabled),
 ))
 .button(
  `${Lang.t(player, config.enabled ? "all_stacker.btn.disable" : "all_stacker.btn.enable")}\n${statusText(player, config.enabled)}`,
  config.enabled ? "textures/ui/toggle/on" : "textures/ui/toggle/off",
 )
 .button(Lang.t(player, "all_stacker.btn.items", statusText(player, config.enabled && config.itemEnabled)), "textures/items/arrow")
 .button(Lang.t(player, "all_stacker.btn.mobs", statusText(player, config.enabled && config.mobEnabled)), "textures/items/spawn_eggs/spawn_egg_cow")
 .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
 .show(player);
 if (isCanceled(response)) return;

 if (response.selection === 0) {
  const next = { ...config, enabled: !config.enabled };
  if (!saveSettings(next)) {
   player.sendMessage(Lang.t(player, "all_stacker.msg.save_failed"));
   return;
  }
  player.sendMessage(Lang.t(player, next.enabled ? "all_stacker.msg.enabled" : "all_stacker.msg.disabled"));
  showLater(() => showAllStackerAdminMenu(player, onBack));
 } else if (response.selection === 1) {
  await showItemSettings(player, () => showAllStackerAdminMenu(player, onBack));
 } else if (response.selection === 2) {
  await showMobSettings(player, () => showAllStackerAdminMenu(player, onBack));
 } else if (response.selection === 3) {
  showLater(onBack);
 }
}

world.beforeEvents.entityItemPickup?.subscribe((event) => {
 if (!getSettings().enabled) return;
 const entity = event.item;
 if (!entity || hasTag(entity, ITEM_SUPPRESS_TAG) || pendingItemPickups.has(entity.id)) return;
 const item = getItemStack(entity);
 if (!item) return;
 const total = getItemTotal(entity, item.amount);
 if (total <= item.amount) return;

 const snapshot = captureItemSnapshot(entity, item, total);
 if (!snapshot) return;
 const entityId = entity.id;
 const physicalAmount = item.amount;
 pendingItemPickups.add(entityId);
 system.run(() => {
  try {
   const currentItem = isEntityValid(entity) ? getItemStack(entity) : undefined;
   if (currentItem?.typeId === snapshot.item.typeId) {
    const pickedAmount = Math.max(0, physicalAmount - currentItem.amount);
    const remaining = total - pickedAmount;
    if (remaining > currentItem.amount) {
     if (!setVirtualItem(entity, currentItem, remaining, snapshot.expiry)) {
      spawnNormalItemRemainder(entity.dimension, currentItem, remaining - currentItem.amount, entity.location);
     }
    } else {
     clearItemStackMetadata(entity);
    }
   } else {
    restoreVirtualItem({ ...snapshot, physicalAmount });
   }
  } finally {
   pendingItemPickups.delete(entityId);
  }
 });
});

world.afterEvents.entityDie.subscribe((event) => {
 if (!getSettings().enabled) return;
 const entity = event.deadEntity;
 if (!entity || hasTag(entity, MOB_SUPPRESS_TAG) || pendingMobSplits.has(entity.id)) return;
 const total = getMobTotal(entity);
 if (total <= 1) return;
 const snapshot = captureMobSnapshot(entity, total);
 if (!snapshot) return;
 system.run(() => spawnMobSnapshot(snapshot, total - 1));
});

world.afterEvents.playerInteractWithEntity?.subscribe((event) => {
 if (!getSettings().enabled) return;
 const entity = event.target;
 const total = getMobTotal(entity);
 if (total <= 1 || hasTag(entity, MOB_SUPPRESS_TAG) || pendingMobSplits.has(entity.id)) return;
 const snapshot = captureMobSnapshot(entity, total);
 if (!snapshot) return;
 const entityId = entity.id;
 const splitUntil = system.currentTick + 200;
 pendingMobSplits.add(entityId);
 mobSplitCooldowns.set(entityId, splitUntil);
 system.run(() => {
  try {
   if (isEntityValid(entity)) clearMobStackMetadata(entity);
   const remainder = spawnMobSnapshot(snapshot, total - 1, 1);
   if (remainder) mobSplitCooldowns.set(remainder.id, splitUntil);
  } finally {
   system.runTimeout(() => pendingMobSplits.delete(entityId), 2);
  }
 });
});

function cleanupRetainedState(hasPlayers) {
 for (const [entityId, untilTick] of mobSplitCooldowns) {
  if (untilTick <= system.currentTick) mobSplitCooldowns.delete(entityId);
 }
 if (!hasPlayers) {
  pendingItemPickups.clear();
  pendingMobSplits.clear();
  mobSplitCooldowns.clear();
 }
}

function runStackerPass() {
 try {
  const config = getSettings();
  if (!config.enabled) {
   syncStackerInterval();
   return;
  }
  const playerSnapshots = getPlayerSnapshots();
  cleanupRetainedState(playerSnapshots.length > 0);
  if (playerSnapshots.length === 0) return;
  maintainAndStackItems(config, playerSnapshots);
  stackMobs(config, playerSnapshots);
 } catch (error) {
  console.warn("[AllStacker] Kesalahan saat memproses stack:", error);
 }
}

function syncStackerInterval() {
 if (getSettings().enabled) {
  if (stackerRunId === undefined) stackerRunId = system.runInterval(runStackerPass, SCAN_INTERVAL_TICKS);
  return;
 }
 if (stackerRunId !== undefined) system.clearRun(stackerRunId);
 stackerRunId = undefined;
 cleanupRetainedState(false);
}

system.run(syncStackerInterval);

export { showAllStackerAdminMenu };
