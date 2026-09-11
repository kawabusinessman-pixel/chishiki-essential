import { world, system, ItemStack, EntityComponentTypes, ItemComponentTypes, EnchantmentTypes } from '../../core.js';
import { QIDB } from '../../function/QIDB.js';

const SHULKER_CONFIG_KEY = "shulker_tracker:config";
const OLD_SHULKER_PREFIX = "shulker_db:";
const SHULKER_ID_PROPERTY = "kiw:shulker_id";
let shulkerConfigCache = { value: { enabled: false }, time: 0 };
const getShulkerConfig = () => {
 const now = Date.now();
 if (now - shulkerConfigCache.time < 5000) return shulkerConfigCache.value;
 try {
 const raw = world.getDynamicProperty(SHULKER_CONFIG_KEY);
 const value = raw ? JSON.parse(raw) : { enabled: false };
 shulkerConfigCache = { value, time: now };
 return value;
 } catch { return shulkerConfigCache.value; }
};
export const saveShulkerConfig = (config) => {
 try {
  world.setDynamicProperty(SHULKER_CONFIG_KEY, JSON.stringify(config));
  shulkerConfigCache = { value: config, time: Date.now() };
  return true;
 } catch { return false; }
};
export const isShulkerTrackingEnabled = () => getShulkerConfig().enabled === true;
export { getShulkerConfig };

const shulkerDB = new QIDB("sk", 20, 1);
shulkerDB.logs = { startUp: false, save: false, load: false, set: false, get: false, has: false, delete: false, clear: false, values: false, keys: false };
const PLAYER_SHULKER_KEY = "shulker:held_id";
const idMapping = new Map();

function generateShortId() {
 const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
 let id = "";
 for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
 return id;
}

function generateAvailableId() {
 for (let attempt = 0; attempt < 5; attempt++) {
 const id = generateShortId();
 try { if (!shulkerDB.has(id)) return id; } catch { return null; }
 }
 return null;
}

function isOldUUID(id) {
 return id && id.includes("-") && id.length > 20;
}

function migrateOldShulkerData(oldId) {
 if (idMapping.has(oldId)) return idMapping.get(oldId);
 try {
 const raw = world.getDynamicProperty(OLD_SHULKER_PREFIX + oldId);
 if (!raw) return null;
 const oldItems = JSON.parse(raw);
 if (!Array.isArray(oldItems)) return null;
 const newId = generateAvailableId();
 if (!newId) return null;
 if (oldItems.length === 0) {
  shulkerDB.set(newId, []);
  idMapping.set(oldId, newId);
  return newId;
 }
 const stacks = [];
 let maxSlot = 0;
 for (const data of oldItems) {
 if (typeof data.s === "number" && data.s > maxSlot) maxSlot = data.s;
 }
 for (let i = 0; i <= maxSlot; i++) stacks.push(undefined);
 for (const data of oldItems) {
 try {
 if (!data || !data.typeId || data.typeId === "minecraft:air") continue;
 const item = new ItemStack(data.typeId, Math.max(1, Number(data.amount) || 1));
 if (data.name) item.nameTag = data.name;
 if (data.lore?.length) item.setLore(data.lore);
 if (data.durability && typeof data.durability === 'object') {
 const dur = item.getComponent(ItemComponentTypes.Durability);
 if (dur) {
 const dmg = data.durability.damage ?? data.durability.currentDamage ?? 0;
 dur.damage = Math.min(dmg, dur.maxDurability);
 }
 }
 if (data.enchantments?.length) {
 const enc = item.getComponent(ItemComponentTypes.Enchantable);
 if (enc) {
 for (const e of data.enchantments) {
 try {
 const type = EnchantmentTypes.get(e.id);
 if (type) enc.addEnchantment({ type, level: e.level || 1 });
 } catch { }
 }
 }
 }
 const slot = typeof data.s === "number" ? data.s : stacks.length;
 if (slot < stacks.length) stacks[slot] = item;
 else stacks.push(item);
 } catch { }
 }
 const filtered = stacks.filter(s => s !== undefined);
 if (filtered.length > 0) {
 shulkerDB.set(newId, stacks);
 idMapping.set(oldId, newId);
 return newId;
 }
 } catch { }
 return null;
}

function resolveId(id) {
 if (!id) return null;
 if (isOldUUID(id)) {
 const mapped = idMapping.get(id);
 if (mapped) return mapped;
 const migrated = migrateOldShulkerData(id);
 return migrated;
 }
 return id;
}

export const saveShulkerToDB = (itemStacks, player, existingId = null) => {
 if (!Array.isArray(itemStacks)) return null;
 const resolved = existingId ? resolveId(existingId) : null;
 const id = resolved || generateAvailableId();
 if (!id) return null;
 try {
 shulkerDB.set(id, itemStacks);
 return id;
 } catch { return null; }
};

export const loadShulkerFromDB = (id, player) => {
 const resolved = resolveId(id);
 if (!resolved) return [];
 try {
 if (!shulkerDB.has(resolved)) return [];
 const result = shulkerDB.get(resolved);
 if (!result) return [];
 return Array.isArray(result) ? result : [result];
 } catch { return []; }
};

export const hasShulkerInDB = id => {
 const resolved = resolveId(id);
 if (!resolved) return false;
 try { return shulkerDB.has(resolved); } catch { return false; }
};

export const generateShulkerLore = (contents, dbId) => {
 const lore = ["§r§9Items"];
 const items = (contents || []).filter(i => i);
 for (const item of items.slice(0, 5)) {
 const name = (item.nameTag || item.typeId || "").replace("minecraft:", "").split("_").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");
 lore.push(`§7${name} x${item.amount}`);
 }
 if (items.length > 5) lore.push(`§7§o...+${items.length - 5} more`);
 lore.push(`§8ID:${dbId}`);
 return lore;
};

function getCustomShulkerLore(item) {
 try {
  const lore = item?.getLore?.() || [];
  const clean = lore.map(line => line.replace(/§./g, ""));
  const idIndex = clean.findIndex(line => line.startsWith("ID:"));
  if (idIndex < 0) return lore;
  let headerIndex = -1;
  for (let i = idIndex - 1; i >= 0; i--) {
   if (clean[i] === "Items") {
    headerIndex = i;
    break;
   }
  }
  if (headerIndex < 0) return lore.filter((_, index) => index !== idIndex);
  return lore.filter((_, index) => index < headerIndex || index > idIndex);
 } catch {
  return [];
 }
}

const isShulkerBox = id => id?.includes("shulker_box");
const getBlockKey = (loc, dimId) => `${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)},${dimId}`;
const extractIdFromLore = lore => { if (!lore) return null; for (const l of lore) { const c = l.replace(/§./g, ""); if (c.startsWith("ID:")) return c.substring(3); } return null; };

export const getShulkerId = item => {
 try {
 const id = item?.getDynamicProperty?.(SHULKER_ID_PROPERTY);
 if (typeof id === "string" && id) return id;
 } catch { }
 try { return extractIdFromLore(item?.getLore?.()); } catch { return null; }
};

export const applyShulkerIdentity = (item, contents, dbId) => {
 if (!item || !dbId) return item;
 try { item.setDynamicProperty(SHULKER_ID_PROPERTY, dbId); } catch { }
 try { item.setLore([...getCustomShulkerLore(item), ...generateShulkerLore(contents, dbId)]); } catch { }
 return item;
};

const readShulkerBlockSnapshot = block => {
 if (!block || !isShulkerBox(block.typeId)) return { ok: false, contents: [] };
 try {
 const container = block.getComponent("minecraft:inventory")?.container;
 if (!container) return { ok: false, contents: [] };
 const items = [];
 for (let i = 0; i < container.size; i++) items.push(container.getItem(i) || undefined);
 while (items.length > 0 && !items[items.length - 1]) items.pop();
 return { ok: true, contents: items };
 } catch { return { ok: false, contents: [] }; }
};
export const readShulkerBlockContents = block => readShulkerBlockSnapshot(block).contents;

export const placedShulkerContents = new Map();
const pendingPlacedShulkerIds = new Map();
const pendingBrokenShulkers = new Map();

const hasAnyItem = contents => Array.isArray(contents) && contents.some(Boolean);

function rememberPendingPlacement(playerId, data) {
 pendingPlacedShulkerIds.set(playerId, data);
 system.runTimeout(() => {
  if (pendingPlacedShulkerIds.get(playerId) === data) pendingPlacedShulkerIds.delete(playerId);
 }, 10);
}

function rememberPendingBreak(key, data) {
 pendingBrokenShulkers.set(key, data);
 system.runTimeout(() => {
  if (pendingBrokenShulkers.get(key) === data) pendingBrokenShulkers.delete(key);
 }, 20);
}

function collectNearbyItemEntityIds(dimension, location) {
 const ids = new Set();
 try {
  const center = { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 };
  for (const entity of dimension.getEntities({ type: "minecraft:item", location: center, maxDistance: 1.75 })) {
   try { ids.add(entity.id); } catch { }
  }
 } catch { }
 return ids;
}

function findNewDroppedShulker(dimension, location, typeId, preexistingIds, acceptableIds) {
 let nearest;
 let nearestDistance = Number.POSITIVE_INFINITY;
 try {
  const center = { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 };
  for (const entity of dimension.getEntities({ type: "minecraft:item", location: center, maxDistance: 1.75 })) {
   try {
    if (entity.isValid !== true) continue;
    if (preexistingIds?.has(entity.id)) continue;
    const stack = entity.getComponent(EntityComponentTypes.Item)?.itemStack;
    if (!stack || stack.typeId !== typeId || stack.amount !== 1) continue;
    const existingId = getShulkerId(stack);
    if (existingId && !acceptableIds.has(existingId)) continue;
    const dx = entity.location.x - center.x;
    const dy = entity.location.y - center.y;
    const dz = entity.location.z - center.z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < nearestDistance) {
     nearestDistance = distance;
     nearest = { entity, stack };
    }
   } catch { }
  }
 } catch { }
 return nearest;
}

function replaceVanillaShulkerDrop(dimension, location, pending, dbId) {
 const acceptableIds = new Set([dbId, pending.existingId].filter(Boolean));
 const dropped = findNewDroppedShulker(
  dimension,
  location,
  pending.typeId,
  pending.preexistingItemIds,
  acceptableIds,
 );
 if (!dropped) return false;
 let replacement;
 try {
  const trackedStack = applyShulkerIdentity(dropped.stack.clone(), pending.contents, dbId);
  const dropLocation = {
   x: dropped.entity.location.x,
   y: dropped.entity.location.y,
   z: dropped.entity.location.z,
  };
  replacement = dimension.spawnItem(trackedStack, dropLocation);
  dropped.entity.remove();
  return true;
 } catch {
  try { if (replacement?.isValid === true) replacement.remove(); } catch { }
  return false;
 }
}

function scheduleBrokenShulkerDropTracking(dimension, location, pending, dbId) {
 const state = { finished: false, attempts: 0 };
 const attempt = () => {
  if (state.finished) return;
  state.attempts++;
  if (replaceVanillaShulkerDrop(dimension, location, pending, dbId)) {
   state.finished = true;
   return;
  }
  if (state.attempts < 6) {
   system.runTimeout(attempt, 1);
   return;
  }
  state.finished = true;
  console.warn(`[Shulker Tracker] Drop ${pending.typeId} milik ${pending.playerName} di ${dimension.id} ${location.x},${location.y},${location.z} tidak ditemukan; item vanilla dibiarkan utuh.`);
 };
 attempt();
}

function isShulkerIdPlacedElsewhere(dbId, currentKey) {
 if (!dbId) return false;
 for (const [key, data] of placedShulkerContents) {
  if (key !== currentKey && data?.originalId === dbId) return true;
 }
 return false;
}

const lastCheckedSlots = new Map();

system.runInterval(() => {
 if (!isShulkerTrackingEnabled()) return;
 const players = world.getAllPlayers();
 if (!players.length) return;
 for (const player of players) {
  try {
   const slotIndex = player.selectedSlotIndex;
   const lastSlot = lastCheckedSlots.get(player.id);
   const inv = player.getComponent(ItemComponentTypes.Inventory)?.container;
   const item = inv?.getItem(slotIndex);
   if (!item && lastSlot === slotIndex) continue;
   lastCheckedSlots.set(player.id, slotIndex);
   const currentStored = player.getDynamicProperty(PLAYER_SHULKER_KEY);
   if (item && isShulkerBox(item.typeId)) {
    const existingId = getShulkerId(item);
    if (existingId) {
     const resolved = resolveId(existingId);
     if (resolved && resolved !== existingId) {
      const newItem = applyShulkerIdentity(item.clone(), loadShulkerFromDB(resolved), resolved);
      inv.setItem(slotIndex, newItem);
     }
     if (currentStored !== (resolved || existingId)) player.setDynamicProperty(PLAYER_SHULKER_KEY, resolved || existingId);
    } else {
     if (currentStored) player.setDynamicProperty(PLAYER_SHULKER_KEY, undefined);
    }
   } else {
    if (currentStored) player.setDynamicProperty(PLAYER_SHULKER_KEY, undefined);
   }
  } catch { }
 }
}, 80);

world.beforeEvents.playerPlaceBlock.subscribe(e => {
 if (!isShulkerTrackingEnabled()) return;
 try {
 const inventory = e.player.getComponent(ItemComponentTypes.Inventory)?.container;
 const item = inventory?.getItem(e.player.selectedSlotIndex);
 if (!item || !isShulkerBox(item.typeId)) return;
 const dbId = getShulkerId(item);
  if (dbId) {
   const location = e.block.location;
   const key = getBlockKey(location, e.dimension.id);
   rememberPendingPlacement(e.player.id, {
    dbId,
    typeId: item.typeId,
    key,
    location: { x: location.x, y: location.y, z: location.z },
    dimensionId: e.dimension.id,
    originalItem: item.clone(),
    tick: system.currentTick,
   });
  }
 } catch { }
});

world.afterEvents.playerPlaceBlock.subscribe(e => {
 if (!isShulkerTrackingEnabled()) return;
 if (!isShulkerBox(e.block.typeId)) return;
 const pending = pendingPlacedShulkerIds.get(e.player.id);
 pendingPlacedShulkerIds.delete(e.player.id);
 const player = e.player;
 const dimension = e.block.dimension;
 const location = { x: e.block.location.x, y: e.block.location.y, z: e.block.location.z };
 const typeId = e.block.typeId;
 system.run(() => {
 try {
 const block = dimension.getBlock(location);
 if (!block || block.typeId !== typeId) return;
 const key = getBlockKey(location, dimension.id);
 const pendingIsNearby = pending && pending.dimensionId === dimension.id &&
  Math.abs(pending.location.x - location.x) + Math.abs(pending.location.y - location.y) + Math.abs(pending.location.z - location.z) <= 1;
 const dbId = pending && (pending.key === key || pendingIsNearby) && pending.typeId === typeId && system.currentTick - pending.tick <= 3
 ? pending.dbId
 : null;
 let trackedId = null;
 if (dbId) {
 let resolved = resolveId(dbId);
 let hasStoredData = resolved ? hasShulkerInDB(resolved) : false;
 let contents = resolved ? loadShulkerFromDB(resolved, player) : [];
 const placedSnapshot = readShulkerBlockSnapshot(block);
 const placedHasItems = placedSnapshot.ok && hasAnyItem(placedSnapshot.contents);
 const returnTrackedItem = (message) => {
  const sourceItem = pending?.originalItem?.clone?.() || new ItemStack(typeId, 1);
  const item = applyShulkerIdentity(sourceItem, contents, resolved || dbId);
  const dropped = dimension.spawnItem(item, { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 });
  try { block.setType("minecraft:air"); }
  catch (error) { try { dropped.remove(); } catch { } throw error; }
  try { player.sendMessage(message); } catch { }
 };
 if (!hasStoredData) {
  if (!placedHasItems) {
   returnTrackedItem("§cShulker dikembalikan karena data isinya belum dapat dimuat. Coba letakkan lagi.");
   return;
  }
  const recoveredId = saveShulkerToDB(placedSnapshot.contents, player, resolved || dbId);
  if (!recoveredId) {
   try { player.sendMessage("§eIsi shulker tetap aman di blok, tetapi backup tracker belum berhasil. Pecahkan dan coba lagi sebelum masuk lobby."); } catch { }
   placedShulkerContents.set(key, { contents: placedSnapshot.contents, typeId, originalId: resolved || dbId, lastUpdate: Date.now() });
   return;
  }
  resolved = recoveredId;
  hasStoredData = true;
  contents = placedSnapshot.contents;
 }
 if (isShulkerIdPlacedElsewhere(resolved, key)) {
  const forkContents = placedHasItems ? placedSnapshot.contents : contents;
  const forkId = saveShulkerToDB(forkContents, player);
  if (!forkId) {
   returnTrackedItem("§cShulker dikembalikan karena ID duplikat tidak berhasil dipisahkan dengan aman.");
   return;
  }
  resolved = forkId;
  contents = forkContents;
 }
 const container = block.getComponent("minecraft:inventory")?.container;
 if (!container) {
  returnTrackedItem("§cShulker dikembalikan karena container belum siap.");
  return;
 }
 if (placedHasItems) {
  const updatedId = saveShulkerToDB(placedSnapshot.contents, player, resolved);
  if (updatedId) {
   resolved = updatedId;
   contents = placedSnapshot.contents;
  }
 } else {
  try {
   for (let i = 0; i < contents.length; i++) {
    if (!contents[i] || i >= container.size) continue;
    container.setItem(i, contents[i]);
    const verified = container.getItem(i);
    if (!verified || verified.typeId !== contents[i].typeId || verified.amount !== contents[i].amount) {
     throw new Error(`Failed to verify shulker slot ${i}`);
    }
   }
  } catch {
   try { container.clearAll(); } catch { }
   returnTrackedItem("§cShulker dikembalikan karena isi gagal dipulihkan seluruhnya.");
   return;
  }
 }
 try { if (player?.isValid === true) player.setDynamicProperty(PLAYER_SHULKER_KEY, undefined); } catch { }
 trackedId = resolved || dbId;
 }
 placedShulkerContents.set(key, { contents: readShulkerBlockContents(block), typeId, originalId: trackedId, lastUpdate: Date.now() });
 } catch { }
 });
});

world.beforeEvents.playerBreakBlock.subscribe(e => {
 if (!isShulkerTrackingEnabled()) return;
 const block = e.block;
 if (!isShulkerBox(block.typeId)) return;
 const snapshot = readShulkerBlockSnapshot(block);
 if (!snapshot.ok) return;
 const contents = snapshot.contents;
 const location = { x: block.location.x, y: block.location.y, z: block.location.z };
 const dimension = block.dimension;
 const typeId = block.typeId;
 const player = e.player;
 const key = getBlockKey(location, dimension.id);
 const cached = placedShulkerContents.get(key);
 const existingId = cached?.typeId === typeId ? cached.originalId : null;
 rememberPendingBreak(key, {
  contents,
  typeId,
  existingId,
  preexistingItemIds: collectNearbyItemEntityIds(dimension, location),
  playerId: player.id,
  playerName: player.name,
  tick: system.currentTick,
 });
});

world.afterEvents.playerBreakBlock.subscribe(e => {
 if (!isShulkerTrackingEnabled()) return;
 const location = { x: e.block.location.x, y: e.block.location.y, z: e.block.location.z };
 const dimension = e.block.dimension;
 const key = getBlockKey(location, dimension.id);
 const pending = pendingBrokenShulkers.get(key);
 if (!pending || pending.playerId !== e.player.id || system.currentTick - pending.tick > 5) return;
 let brokenTypeId;
 try { brokenTypeId = e.brokenBlockPermutation.type.id; } catch { }
 pendingBrokenShulkers.delete(key);
 if (brokenTypeId !== pending.typeId) return;
 placedShulkerContents.delete(key);

 const dbId = saveShulkerToDB(pending.contents, e.player, pending.existingId);
 if (!dbId) {
  try { e.player.sendMessage("§eShulker pecah secara normal dan isinya aman, tetapi tracker gagal membuat backup. Letakkan dan pecahkan lagi sebelum masuk lobby."); } catch { }
  return;
 }

 scheduleBrokenShulkerDropTracking(dimension, location, pending, dbId);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
 pendingPlacedShulkerIds.delete(playerId);
 lastCheckedSlots.delete(playerId);
 for (const [key, data] of pendingBrokenShulkers) {
  if (data.playerId === playerId) pendingBrokenShulkers.delete(key);
 }
});
system.runInterval(() => {
 const now = Date.now();
 for (const [k, v] of placedShulkerContents.entries()) if (now - v.lastUpdate > 3600000) placedShulkerContents.delete(k);
}, 6000);
