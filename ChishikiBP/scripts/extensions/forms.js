import { ActionFormData } from '@minecraft/server-ui';
import { custom_content, custom_content_keys, inventory_enabled, CHEST_UI_SIZES } from './constants.js';
import { getItemChestTexture } from './chestItemDisplay.js';
import { resolveActionFormItemIcon } from '../lib/itemIconTexture.js';

export function getTextureFallback(typeId) {
  if (typeof typeId !== 'string') return 'textures/items/stick';
  if (typeId.startsWith('textures/')) return typeId;
  if (custom_content_keys.has(typeId)) {
    const customTex = custom_content[typeId]?.texture;
    if (customTex) return getTextureFallback(customTex);
  }
  const resolved = resolveActionFormItemIcon(typeId);
  if (resolved && resolved !== 'textures/ui/trade_icon') {
    return resolved;
  }
  const cleanId = typeId.replace(/^minecraft:/, '');
  return `textures/items/${cleanId}`;
}

class ChestFormData {
  #titleText; #buttonArray;
  constructor(size = 'small') {
    const sizing = CHEST_UI_SIZES.get(size) ?? ['§c§h§e§s§t§2§7§r', 27];
    this.#titleText = { rawtext: [{ text: `${sizing[0]}` }] };
    this.#buttonArray = Array(sizing[1]).fill(['', undefined]);
    this.slotCount = sizing[1];
  }
  title(text) {
    if (typeof text === 'string') {
      this.#titleText.rawtext.push({ text: text });
    }
    else if (typeof text === 'object') {
      if (text.rawtext) {
        this.#titleText.rawtext.push(...text.rawtext);
      }
      else {
        this.#titleText.rawtext.push(text);
      }
    }
    return this;
  }
  button(slot, itemName, itemDesc, texture, stackSize = 1, durability = 0, enchanted = false) {
    let rawTarget = texture;
    if (typeof texture === 'object' && texture !== null) {
      rawTarget = getItemChestTexture(texture) || texture.typeId;
    }
    const targetTexture = custom_content_keys.has(rawTarget) ? custom_content[rawTarget]?.texture : rawTarget;
    const resolvedTexture = getTextureFallback(targetTexture);
    let buttonRawtext = {
      rawtext: [
        {
          text: `stack#${String(Math.min(Math.max(stackSize, 1), 99)).padStart(2, '0')}dur#${String(Math.min(Math.max(durability, 0), 99)).padStart(2, '0')}§r`
        }
      ]
    };
    if (typeof itemName === 'string') {
      buttonRawtext.rawtext.push({ text: itemName ? `${itemName}§r` : '§r' });
    }
    else if (typeof itemName === 'object' && itemName.rawtext) {
      buttonRawtext.rawtext.push(...itemName.rawtext, { text: '§r' });
    }
    else return;
    if (Array.isArray(itemDesc) && itemDesc.length > 0) {
      for (const obj of itemDesc) {
        if (typeof obj === 'string') {
          buttonRawtext.rawtext.push({ text: `\n${obj}` });
        }
        else if (typeof obj === 'object' && obj.rawtext) {
          buttonRawtext.rawtext.push({ text: `\n` }, ...obj.rawtext);
        }
      }
    }
    this.#buttonArray.splice(Math.max(0, Math.min(slot, this.slotCount - 1)), 1, [
      buttonRawtext,
      resolvedTexture
    ]);
    return this;
  }
  pattern(pattern, key) {
    for (let i = 0; i < pattern.length; i++) {
      const row = pattern[i];
      for (let j = 0; j < row.length; j++) {
        const letter = row.charAt(j);
        const data = key[letter];
        if (!data) continue;
        const slot = j + i * 9;
        let rawTarget = data.texture;
        if (typeof rawTarget === 'object' && rawTarget !== null) {
          rawTarget = getItemChestTexture(rawTarget) || rawTarget.typeId;
        }
        const targetTexture = custom_content_keys.has(rawTarget) ? custom_content[rawTarget]?.texture : rawTarget;
        const resolvedTexture = getTextureFallback(targetTexture);
        const { stackAmount = 1, durability = 0, itemName, itemDesc, enchanted = false } = data;
        const stackSize = String(Math.min(Math.max(stackAmount, 1), 99)).padStart(2, '0');
        const durValue = String(Math.min(Math.max(durability, 0), 99)).padStart(2, '0');
        let buttonRawtext = {
          rawtext: [{ text: `stack#${stackSize}dur#${durValue}§r` }]
        };
        if (typeof itemName === 'string') {
          buttonRawtext.rawtext.push({ text: `${itemName}§r` });
        }
        else if (itemName?.rawtext) {
          buttonRawtext.rawtext.push(...itemName.rawtext, { text: '§r' });
        }
        else continue;
        if (Array.isArray(itemDesc) && itemDesc.length > 0) {
          for (const obj of itemDesc) {
            if (typeof obj === 'string') {
              buttonRawtext.rawtext.push({ text: `\n${obj}` });
            } else if (obj?.rawtext) {
              buttonRawtext.rawtext.push({ text: `\n`, ...obj.rawtext });
            }
          }
        }
        this.#buttonArray.splice(Math.max(0, Math.min(slot, this.slotCount - 1)), 1, [
          buttonRawtext,
          resolvedTexture
        ]);
      }
    }
    return this;
  }
  show(player) {
    const form = new ActionFormData().title(this.#titleText);
    this.#buttonArray.forEach(button => {
      form.button(button[0], button[1]?.toString());
    });
    if (!inventory_enabled) return form.show(player);

    const container = player.getComponent('inventory')?.container;
    if (!container) return form.show(player);

    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (!item) continue;
      const resolvedItemTex = getItemChestTexture(item) || item.typeId;
      const targetTexture = custom_content_keys.has(resolvedItemTex) ? custom_content[resolvedItemTex]?.texture : resolvedItemTex;
      const durability = item.getComponent('durability');
      const durDamage = durability ? Math.round((durability.maxDurability - durability.damage) / durability.maxDurability * 99) : 0;
      const amount = item.amount;
      const formattedItemName = item.typeId.replace(/.*(?<=:)/, '').replace(/_/g, ' ').replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
      let buttonRawtext = {
        rawtext: [
          {
            text: `stack#${String(amount).padStart(2, '0')}dur#${String(durDamage).padStart(2, '0')}§r${formattedItemName}`
          }
        ]
      };
      const loreText = item.getLore().join('\n');
      if (loreText) buttonRawtext.rawtext.push({ text: loreText });
      const fallback = getTextureFallback(targetTexture);
      form.button(buttonRawtext, fallback);
    }
    return form.show(player);
  }
}

class FurnaceFormData {
  #titleText; #buttonArray;
  constructor(isLit = false) {
    this.#titleText = { rawtext: [{ text: isLit ? '§f§u§r§n§a§c§e§l§i§t§r' : '§f§u§r§n§a§c§e§r' }] };
    this.#buttonArray = Array(3).fill(['', undefined]);
    this.slotCount = 3;
  }
  title(text) {
    if (typeof text === 'string') {
      this.#titleText.rawtext.push({ text });
    }
    else if (typeof text === 'object' && text.rawtext) {
      this.#titleText.rawtext.push(...text.rawtext);
    }
    else {
      this.#titleText.rawtext.push({ text: '' });
    }
    return this;
  }
  button(slot, itemName, itemDesc, texture, stackSize = 1, durability = 0, enchanted = false) {
    let rawTarget = texture;
    if (typeof texture === 'object' && texture !== null) {
      rawTarget = getItemChestTexture(texture) || texture.typeId;
    }
    const targetTexture = custom_content_keys.has(rawTarget) ? custom_content[rawTarget]?.texture : rawTarget;
    const resolvedTexture = getTextureFallback(targetTexture);
    let buttonRawtext = {
      rawtext: [{ text: `stack#${String(Math.min(Math.max(stackSize, 1), 99)).padStart(2, '0')}dur#${String(Math.min(Math.max(durability, 0), 99)).padStart(2, '0')}§r` }]
    };

    if (typeof itemName === 'string') {
      buttonRawtext.rawtext.push({ text: itemName ? `${itemName}§r` : '§r' });
    }
    else if (typeof itemName === 'object' && itemName.rawtext) {
      buttonRawtext.rawtext.push(...itemName.rawtext, { text: '§r' });
    }
    else return;
    if (Array.isArray(itemDesc) && itemDesc.length) {
      itemDesc.forEach(obj => {
        if (typeof obj === 'string') {
          buttonRawtext.rawtext.push({ text: `\n${obj}` });
        } else if (typeof obj === 'object' && obj.rawtext) {
          buttonRawtext.rawtext.push({ text: `\n` }, ...obj.rawtext);
        }
      });
    }
    this.#buttonArray.splice(Math.max(0, Math.min(slot, this.slotCount - 1)), 1, [
      buttonRawtext,
      resolvedTexture
    ]);
    return this;
  }
  show(player) {
    const form = new ActionFormData().title(this.#titleText);
    this.#buttonArray.forEach(button => {
      form.button(button[0], button[1]?.toString());
    });
    if (!inventory_enabled) return form.show(player);

    const container = player.getComponent('inventory')?.container;
    if (!container) return form.show(player);

    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (!item) continue;
      const resolvedItemTex = getItemChestTexture(item) || item.typeId;
      const targetTexture = custom_content_keys.has(resolvedItemTex) ? custom_content[resolvedItemTex]?.texture : resolvedItemTex;
      const durability = item.getComponent('durability');
      const durDamage = durability ? Math.round((durability.maxDurability - durability.damage) / durability.maxDurability * 99) : 0;
      const amount = item.amount;
      const formattedItemName = item.typeId.replace(/.*(?<=:)/, '').replace(/_/g, ' ').replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
      let buttonRawtext = {
        rawtext: [
          {
            text: `stack#${String(amount).padStart(2, '0')}dur#${String(durDamage).padStart(2, '0')}§r${formattedItemName}`
          }
        ]
      };
      const loreText = item.getLore().join('\n');
      if (loreText) buttonRawtext.rawtext.push({ text: loreText });
      const fallback = getTextureFallback(targetTexture);
      form.button(buttonRawtext, fallback);
    }
    return form.show(player);
  }
}

export { ChestFormData, FurnaceFormData };
