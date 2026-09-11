import { world, ItemTypes } from '@minecraft/server';

export const inventory_enabled = true;

export const custom_content = {
  'kwd:item01': {
    texture: 'textures/items/kiwadmin',
    type: 'block'
  },
  'kwd:member01': {
    texture: 'textures/items/kiwmember',
    type: 'block'
  },
  'r4isen1920_invsee:inventory': {
    texture: 'minecraft:stick',
    type: 'item'
  }
};

export const custom_content_keys = new Set(Object.keys(custom_content));

let cachedCustomItemCount = null;

export function getDetectedCustomItemCount() {
  if (cachedCustomItemCount !== null) return cachedCustomItemCount;
  try {
    if (typeof ItemTypes?.getAll === 'function') {
      const all = ItemTypes.getAll();
      let count = 0;
      for (const itemType of all) {
        if (
          itemType &&
          typeof itemType.id === 'string' &&
          !itemType.id.startsWith('minecraft:') &&
          !itemType.id.endsWith('_spawn_egg') &&
          !itemType.id.includes(':spawn_egg')
        ) {
          count++;
        }
      }
      cachedCustomItemCount = count;
      return count;
    }
  } catch {}
  cachedCustomItemCount = custom_content_keys.size;
  return cachedCustomItemCount;
}

export function getCustomItemOffset() {
  try {
    const saved = world?.getDynamicProperty?.('custom_item_id_offset');
    if (typeof saved === 'number' && Number.isFinite(saved)) {
      return Math.floor(saved);
    }
  } catch {}
  return getDetectedCustomItemCount();
}

export const CHEST_UI_SIZES = new Map([
  ['single', ['§c§h§e§s§t§2§7§r', 27]], ['small', ['§c§h§e§s§t§2§7§r', 27]],
  ['double', ['§c§h§e§s§t§5§4§r', 54]], ['large', ['§c§h§e§s§t§5§4§r', 54]],
  ['1', ['§c§h§e§s§t§0§1§r', 1]],
  ['5', ['§c§h§e§s§t§0§5§r', 5]],
  ['9', ['§c§h§e§s§t§0§9§r', 9]],
  ['18', ['§c§h§e§s§t§1§8§r', 18]],
  ['27', ['§c§h§e§s§t§2§7§r', 27]],
  ['36', ['§c§h§e§s§t§3§6§r', 36]],
  ['45', ['§c§h§e§s§t§4§5§r', 45]],
  ['54', ['§c§h§e§s§t§5§4§r', 54]],
  [1, ['§c§h§e§s§t§0§1§r', 1]],
  [5, ['§c§h§e§s§t§0§5§r', 5]],
  [9, ['§c§h§e§s§t§0§9§r', 9]],
  [18, ['§c§h§e§s§t§1§8§r', 18]],
  [27, ['§c§h§e§s§t§2§7§r', 27]],
  [36, ['§c§h§e§s§t§3§6§r', 36]],
  [45, ['§c§h§e§s§t§4§5§r', 45]],
  [54, ['§c§h§e§s§t§5§4§r', 54]]
]);
