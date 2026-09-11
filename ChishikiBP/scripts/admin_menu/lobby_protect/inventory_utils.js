import { ItemStack, EnchantmentTypes, ItemComponentTypes, EquipmentSlot } from '../../core.js';
import { saveShulkerToDB, loadShulkerFromDB, hasShulkerInDB, applyShulkerIdentity, getShulkerId, isShulkerTrackingEnabled } from "./shulker_tracker.js";
import { QIDB } from '../../function/QIDB.js';
const isShulkerBox = id => id?.includes("shulker_box");
const itemBackupDB = new QIDB("ib", 128, 4);
itemBackupDB.logs = { startUp: false, save: false, load: false, set: false, get: false, has: false, delete: false, clear: false, values: false, keys: false };
function generateBackupId() {
 const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
 let id = "";
 for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
 return id;
}
const cloneItemStack = item => {
 try { return typeof item?.clone === "function" ? item.clone() : item; } catch { return item; }
};
const backupRawItem = (item, entry) => {
 try {
 let backupId;
 for (let attempt = 0; attempt < 5; attempt++) {
  const candidate = generateBackupId();
  if (!itemBackupDB.has(candidate)) { backupId = candidate; break; }
 }
 if (!backupId) throw new Error("Unable to allocate a unique raw backup ID");
 itemBackupDB.set(backupId, cloneItemStack(item));
 const verified = itemBackupDB.get(backupId);
 if (!verified) throw new Error(`Raw backup ${backupId} could not be verified`);
 entry.rawItemId = backupId;
 entry.rawRequired = item.isStackable !== true;
 return true;
 } catch (error) {
 console.warn(`[Lobby Inventory] Gagal membuat raw item backup ${item?.typeId || "unknown"}: ${error}`);
 return false;
 }
};
const serializeItemData = item => {
 const data = {};
 if (item.nameTag) data.name = item.nameTag;
 const lore = item.getLore(); if (lore?.length) data.lore = lore;
 const dur = item.getComponent(ItemComponentTypes.Durability);
 if (dur?.maxDurability > 0) data.durability = { max: dur.maxDurability, damage: dur.damage };
 const enc = item.getComponent(ItemComponentTypes.Enchantable)?.getEnchantments();
 if (enc?.length) data.enchantments = enc.map(e => ({ id: e.type?.id || "unknown", level: e.level || 1 }));
 try { const propIds = item.getDynamicPropertyIds(); if (propIds?.length) { data.dynamicProperties = {}; for (const id of propIds) { const val = item.getDynamicProperty(id); if (val !== undefined) data.dynamicProperties[id] = val; } } } catch { }
 try { if (item.keepOnDeath) data.keepOnDeath = true; } catch { }
 try { if (item.lockMode && item.lockMode !== "none") data.lockMode = item.lockMode; } catch { }
 try { const canDestroy = item.getCanDestroy(); if (canDestroy?.length) data.canDestroy = canDestroy; } catch { }
 try { const canPlaceOn = item.getCanPlaceOn(); if (canPlaceOn?.length) data.canPlaceOn = canPlaceOn; } catch { }
 return data;
};
const applyItemData = (item, data) => {
 if (!data) return;
 if (data.name) item.nameTag = data.name;
 if (data.lore?.length) item.setLore(data.lore);
 if (data.durability) { const dur = item.getComponent(ItemComponentTypes.Durability); if (dur) try { dur.damage = Math.min(data.durability.damage, dur.maxDurability); } catch { } }
 if (data.enchantments?.length) { const enc = item.getComponent(ItemComponentTypes.Enchantable); if (enc?.addEnchantment) for (const e of data.enchantments) { try { const type = EnchantmentTypes.get(e.id); if (type) enc.addEnchantment({ type, level: e.level || 1 }); } catch { } } }
 if (data.dynamicProperties) { try { for (const [k, v] of Object.entries(data.dynamicProperties)) item.setDynamicProperty(k, v); } catch { } }
 if (data.keepOnDeath === true) try { item.keepOnDeath = true; } catch { }
 if (data.lockMode) try { item.lockMode = data.lockMode; } catch { }
 if (data.canDestroy?.length) try { item.setCanDestroy(data.canDestroy); } catch { }
 if (data.canPlaceOn?.length) try { item.setCanPlaceOn(data.canPlaceOn); } catch { }
};
const processItem = (item, slot, location, player) => {
 const slotId = location === "eq" ? (slot === "head" ? "Head" : slot === "chest" ? "Chest" : slot === "legs" ? "Legs" : slot === "feet" ? "Feet" : slot === "offhand" ? "Offhand" : slot) : slot;
 const entry = { typeId: item.typeId, amount: item.amount, s: slotId, l: location, data: serializeItemData(item) };
 if (isShulkerBox(item.typeId)) {
 const existingId = getShulkerId(item);
   if (isShulkerTrackingEnabled() && existingId) entry.shulkerId = existingId;
 }
 if (!backupRawItem(item, entry)) throw new Error(`Failed to back up ${item.typeId} from ${location}:${slotId}`);
 return entry;
};
export const serializePlayerInventory = player => {
 const items = [];
 try {
 const inv = player.getComponent(ItemComponentTypes.Inventory)?.container;
 if (inv) for (let i = 0; i < inv.size; i++) { const item = inv.getItem(i); if (item) items.push(processItem(item, i, "inv", player)); }
 const eq = player.getComponent("minecraft:equippable");
 if (eq) for (const [key, name] of [["Head", "head"], ["Chest", "chest"], ["Legs", "legs"], ["Feet", "feet"], ["Offhand", "offhand"]]) { const item = eq.getEquipment(EquipmentSlot[key]); if (item) items.push(processItem(item, name, "eq", player)); }
 } catch (error) {
 releaseSerializedInventoryBackups(items);
 throw error;
 }
 return items;
};
export const releaseSerializedInventoryBackups = items => {
 if (!Array.isArray(items)) return;
 for (const entry of items) {
  if (!entry?.rawItemId) continue;
  try { itemBackupDB.delete(entry.rawItemId); } catch { }
 }
};
export const releaseUnavailableSerializedInventoryBackups = items => {
 if (!Array.isArray(items)) return;
 for (const entry of items) {
  if (!entry?.rawItemId) continue;
  try {
   if (itemBackupDB.get(entry.rawItemId)) continue;
  } catch { }
  try { itemBackupDB.delete(entry.rawItemId); } catch { }
 }
};
const createShulkerItem = (typeId, contents, amount, player, existingId = null, data = null) => {
 const item = new ItemStack(typeId, amount);
 applyItemData(item, data);
 const dbId = existingId || (contents?.length ? saveShulkerToDB(contents, player) : null);
 return dbId ? applyShulkerIdentity(item, contents || [], dbId) : item;
};
const createItemFromEntry = (entry, player) => {
  if (isShulkerTrackingEnabled() && isShulkerBox(entry.typeId) && (entry.shulkerId || entry.shulkerContents?.length)) {
 if (entry.shulkerId && !entry.shulkerContents?.length && !hasShulkerInDB(entry.shulkerId)) {
  throw new Error(`Shulker backup ${entry.shulkerId} is unavailable`);
 }
 const contents = entry.shulkerContents?.length
 ? entry.shulkerContents
 : loadShulkerFromDB(entry.shulkerId, player);
 return createShulkerItem(entry.typeId, contents, entry.amount, player, entry.shulkerId, entry.data);
 }
 const item = new ItemStack(entry.typeId, entry.amount);
 applyItemData(item, entry.data);
 return item;
};
const EQUIPMENT_SLOTS = {
 Head: EquipmentSlot.Head,
 Chest: EquipmentSlot.Chest,
 Legs: EquipmentSlot.Legs,
 Feet: EquipmentSlot.Feet,
 Offhand: EquipmentSlot.Offhand,
};

function canReconstructWithoutRaw(entry) {
  if (isShulkerTrackingEnabled() && isShulkerBox(entry?.typeId)) {
  if (entry.shulkerContents?.length) return true;
  return !!entry.shulkerId && hasShulkerInDB(entry.shulkerId);
 }
 if (entry?.rawRequired !== true) return true;
 try { return new ItemStack(entry.typeId, entry.amount).isStackable === true; }
 catch { return false; }
}

function restoreItemFromEntry(entry, player) {
 if (entry.rawItemId) {
  try {
   const raw = itemBackupDB.get(entry.rawItemId);
   if (raw) return cloneItemStack(raw);
  } catch { }
 }
 if (!canReconstructWithoutRaw(entry)) {
  throw new Error(`Required raw inventory backup ${entry.rawItemId || "unknown"} is unavailable`);
 }
 return createItemFromEntry(entry, player);
}

function itemMatchesExpected(expected, actual) {
 if (!expected || !actual || expected.typeId !== actual.typeId || expected.amount !== actual.amount) return false;
 try {
  return JSON.stringify(serializeItemData(expected)) === JSON.stringify(serializeItemData(actual));
 } catch {
  return false;
 }
}

export const preparePlayerInventoryRestore = (player, items) => {
 if (!Array.isArray(items)) throw new Error("Inventory backup is not an array");
 const inv = player.getComponent(ItemComponentTypes.Inventory)?.container;
 const eq = player.getComponent("minecraft:equippable");
 const staged = [];
 for (const entry of items) {
  if (!entry?.typeId) throw new Error("Invalid serialized inventory entry");
  const item = restoreItemFromEntry(entry, player);
  if (entry.l === "eq") {
   const slot = EQUIPMENT_SLOTS[entry.s];
   if (!eq || slot === undefined) throw new Error(`Invalid equipment slot ${entry.s}`);
   staged.push({ item, target: "eq", slot });
  } else if (typeof entry.s === "number" && inv && entry.s >= 0 && entry.s < inv.size) {
   staged.push({ item, target: "inv", slot: entry.s });
  } else {
   throw new Error(`Invalid inventory slot ${entry.s}`);
  }
 }
 return { items, staged };
};

export const applyPreparedInventoryRestore = (player, prepared, consumeBackups = true) => {
 try {
  if (!prepared || !Array.isArray(prepared.staged)) throw new Error("Invalid prepared inventory restore");
  const inv = player.getComponent(ItemComponentTypes.Inventory)?.container;
  const eq = player.getComponent("minecraft:equippable");
  for (const data of prepared.staged) {
   if (data.target === "eq") {
    if (!eq) throw new Error("Equippable component is unavailable");
    eq.setEquipment(data.slot, data.item);
   } else {
    if (!inv) throw new Error("Inventory container is unavailable");
    inv.setItem(data.slot, data.item);
   }
  }
  for (const data of prepared.staged) {
   const restored = data.target === "eq" ? eq?.getEquipment(data.slot) : inv?.getItem(data.slot);
   if (!itemMatchesExpected(data.item, restored)) throw new Error(`Failed to verify restored ${data.target} slot ${data.slot}`);
  }
  if (consumeBackups) releaseSerializedInventoryBackups(prepared.items);
  return true;
 } catch (error) {
  console.warn(`[Lobby Inventory] Gagal menerapkan inventory yang sudah disiapkan untuk ${player?.name || player?.id || "unknown"}: ${error}`);
  return false;
 }
};

export const deserializePlayerInventory = (player, items, consumeBackups = true) => {
 try {
  const prepared = preparePlayerInventoryRestore(player, items);
  return applyPreparedInventoryRestore(player, prepared, consumeBackups);
 } catch (error) {
  console.warn(`[Lobby Inventory] Gagal menyiapkan inventory untuk ${player?.name || player?.id || "unknown"}: ${error}`);
  return false;
 }
};
export const purgePlayerInventory = player => {
 try {
  const inv = player.getComponent(ItemComponentTypes.Inventory)?.container;
  inv?.clearAll();
  const eq = player.getComponent("minecraft:equippable");
  if (eq) for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) eq.setEquipment(slot, undefined);
  if (inv) for (let i = 0; i < inv.size; i++) if (inv.getItem(i)) throw new Error(`Inventory slot ${i} was not cleared`);
  if (eq) for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) {
   if (eq.getEquipment(slot)) throw new Error(`Equipment slot ${slot} was not cleared`);
  }
  return true;
 } catch (error) {
  console.warn(`[Lobby Inventory] Gagal membersihkan inventory ${player?.name || player?.id || "unknown"}: ${error}`);
  return false;
 }
};
