/**
 * Chest Shop — pure logic (no @minecraft/server imports).
 * Kept import-free so it can be unit-tested with plain objects.
 */

export const CHEST_TYPES = new Set(["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel"]);
export const SHOP_PREFIX = "kiw:chestshop:";

export function shopKey(block) {
  return `${SHOP_PREFIX}${block.dimension.id}:${Math.floor(block.location.x)},${Math.floor(block.location.y)},${Math.floor(block.location.z)}`;
}

export function parseShopKey(key) {
  if (typeof key !== "string" || !key.startsWith(SHOP_PREFIX)) return undefined;
  const parts = key.slice(SHOP_PREFIX.length).split(":");
  if (parts.length < 3) return undefined;
  const dim = parts[0] + ":" + parts[1];
  const c = parts[2].split(",");
  if (c.length < 3) return undefined;
  const x = parseInt(c[0], 10);
  const y = parseInt(c[1], 10);
  const z = parseInt(c[2], 10);
  if (isNaN(x) || isNaN(y) || isNaN(z)) return undefined;
  return { dim, pos: { x, y, z } };
}

export function getItemOptions(container) {
  const seen = new Map();
  if (!container) return [];
  for (let i = 0; i < container.size; i++) {
    const it = container.getItem(i);
    if (it) seen.set(it.typeId, (seen.get(it.typeId) || 0) + it.amount);
  }
  const options = [];
  for (const [id, count] of seen) options.push({ id, count });
  return options;
}

export function getItemCount(container, itemId) {
  let count = 0;
  if (!container) return 0;
  for (let i = 0; i < container.size; i++) {
    const it = container.getItem(i);
    if (it && it.typeId === itemId) count += it.amount;
  }
  return count;
}

export function removeItems(container, itemId, qty) {
  if (!container) return;
  let remaining = qty;
  for (let i = 0; i < container.size && remaining > 0; i++) {
    const it = container.getItem(i);
    if (!it || it.typeId !== itemId) continue;
    if (it.amount <= remaining) {
      container.setItem(i, undefined);
      remaining -= it.amount;
    } else {
      it.amount -= remaining;
      container.setItem(i, it);
      remaining = 0;
    }
  }
}

export function getInventoryCapacity(container, itemId, maxStack) {
  let cap = 0;
  for (let i = 0; i < container.size; i++) {
    const it = container.getItem(i);
    if (!it) cap += maxStack;
    else if (it.typeId === itemId) cap += maxStack - it.amount;
  }
  return cap;
}
