import { system, world, ItemStack, ActionFormData, ModalFormData, shopTitle } from "../../core.js";
import { getFullMoney, addMoney, removeMoney, formatMoneyValue } from "../../function/moneySystem.js";
import { Lang } from "../../lib/Lang.js";
import { resolveActionFormItemIcon } from "../../lib/itemIconTexture.js";
import {
  CHEST_TYPES,
  SHOP_PREFIX,
  shopKey,
  parseShopKey,
  getItemOptions,
  getItemCount,
  removeItems,
  getInventoryCapacity,
} from "./logic.js";

/**
 * Chishiki Essential Chest Shop
 * Port of SimpleKSentials' chest shop feature.
 * - Sneak + interact chest/barrel -> setup form (sell/buy mode + price).
 * - Sell mode: others buy items from the chest, money goes to owner.
 * - Buy mode: others sell hand items into the chest, money comes from owner.
 * - Owner/admin sneak + interact -> edit/remove form.
 * - Storage: dynamic properties per block + index array.
 * - Offline owner credit is queued and paid on join.
 */

const SHOP_INDEX_KEY = "kiw:chestshops";
const PENDING_PREFIX = "kiw:chestshop_pending:";
const ENABLED_KEY = "kiw:chestshop_enabled";
const MAX_KEY = "kiw:chestshop_max";
const MAX_DEFAULT = 10;
const UI_COOLDOWN_TICKS = 5;



/* ---------------- storage ---------------- */

const shopCache = new Map();
let shopCacheLoaded = false;

function ensureShopCache() {
  if (shopCacheLoaded) return;
  shopCacheLoaded = true;
  for (const key of getShopKeys()) {
    const raw = world.getDynamicProperty(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") shopCache.set(key, parsed);
    } catch {}
  }
}

function getShop(block) {
  ensureShopCache();
  const key = shopKey(block);
  if (shopCache.has(key)) return shopCache.get(key);
  const raw = world.getDynamicProperty(key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      shopCache.set(key, parsed);
      return parsed;
    }
  } catch (e) {}
  return undefined;
}

function getShopKeys() {
  const raw = world.getDynamicProperty(SHOP_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveShopKeys(keys) {
  world.setDynamicProperty(SHOP_INDEX_KEY, keys.length ? JSON.stringify(keys) : undefined);
}

function registerShop(key, shopData) {
  ensureShopCache();
  if (shopData) shopCache.set(key, shopData);
  const keys = getShopKeys();
  if (!keys.includes(key)) {
    keys.push(key);
    saveShopKeys(keys);
  }
}

function unregisterShop(key) {
  ensureShopCache();
  shopCache.delete(key);
  const keys = getShopKeys();
  const idx = keys.indexOf(key);
  if (idx >= 0) {
    keys.splice(idx, 1);
    saveShopKeys(keys);
  }
  world.setDynamicProperty(key, undefined);
}

function getAllShops() {
  ensureShopCache();
  const shops = [];
  for (const key of getShopKeys()) {
    const shop = shopCache.get(key) || getShopByKey(key);
    if (!shop) continue;
    const parsed = parseShopKey(key);
    if (parsed) shops.push({ key, shop, ...parsed });
  }
  return shops;
}

function getShopByKey(key) {
  const raw = world.getDynamicProperty(key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      shopCache.set(key, parsed);
      return parsed;
    }
  } catch {}
  return undefined;
}

function isShopEnabled() {
  return world.getDynamicProperty(ENABLED_KEY) !== false;
}

function getShopMax() {
  const v = world.getDynamicProperty(MAX_KEY);
  if (typeof v !== "number" || isNaN(v)) return MAX_DEFAULT;
  return Math.max(0, Math.min(99, Math.floor(v)));
}

/* ---------------- container helpers ---------------- */

function getContainer(block) {
  return block.getComponent("minecraft:inventory")?.container;
}

/* ---------------- chest shop entry lookup ---------------- */

function getShopEntry(block) {
  if (!block) return undefined;
  ensureShopCache();
  const direct = getShop(block);
  if (direct) return { key: shopKey(block), shop: direct };
  if (!CHEST_TYPES.has(block.typeId) || block.typeId === "minecraft:barrel" || shopCache.size === 0) return undefined;
  const loc = block.location;
  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const neighborKey = `${SHOP_PREFIX}${block.dimension.id}:${loc.x + d[0]}_${loc.y}_${loc.z + d[1]}`;
    if (shopCache.has(neighborKey)) {
      const nb = block.dimension.getBlock({ x: loc.x + d[0], y: loc.y, z: loc.z + d[1] });
      if (nb && CHEST_TYPES.has(nb.typeId)) {
        return { key: neighborKey, shop: shopCache.get(neighborKey) };
      }
    }
  }
  return undefined;
}

/* ---------------- UI helpers ---------------- */

const uiCooldown = new Map();

function openUiOnce(player, open) {
  const tick = system.currentTick;
  if (tick - (uiCooldown.get(player.id) ?? -100) < UI_COOLDOWN_TICKS) return;
  uiCooldown.set(player.id, tick);
  system.run(open);
}

function msg(player, key, ...args) {
  try {
    player.sendMessage(Lang.t(player, key, ...args));
  } catch (e) {
    // player left
  }
}

function priceText(value) {
  return `$${formatMoneyValue(value)}`;
}

/* ---------------- interact handler ---------------- */

function onChestInteract(evt) {
  const block = evt.block;
  if (!block || !CHEST_TYPES.has(block.typeId)) return;
  if (!isShopEnabled()) return;
  const player = evt.player;
  const entry = getShopEntry(block);
  if (!entry) {
    if (player.isSneaking) {
      evt.cancel = true;
      openUiOnce(player, () => openSetupForm(player, block, undefined));
    }
    return;
  }
  const shop = entry.shop;
  const isOwnerOrAdmin = shop.owner === player.id || player.hasTag("admin");
  if (isOwnerOrAdmin) {
    if (player.isSneaking) {
      evt.cancel = true;
      openUiOnce(player, () => openSetupForm(player, block, entry));
    }
    return;
  }
  if (shop.enabled === false) return;
  evt.cancel = true;
  openUiOnce(player, () => openShopUi(player, block, shop));
}

/* ---------------- setup / edit ---------------- */

function openSetupForm(player, block, entry) {
  const shop = entry ? entry.shop : undefined;
  const actions = [
    { label: `${Lang.t(player, "chestshop.mode.sell")}\n§7Players buy from this chest`, icon: "textures/items/emerald" },
    { label: `${Lang.t(player, "chestshop.mode.buy")}\n§7Players sell into this chest`, icon: "textures/items/gold_ingot" },
  ];
  if (shop) actions.push({ label: `${Lang.t(player, "chestshop.remove")}\n§7Delete this chest shop`, icon: "textures/blocks/barrier" });
  actions.push({ label: `${Lang.t(player, "common.back")}\n§7Exit setup menu`, icon: "textures/ui/arrow_left" });

  const form = new ActionFormData()
    .preserveButtonCase()
    .title(shopTitle(Lang.t(player, "chestshop.setup.title")));

  if (shop) {
    const modeText = shop.mode === "sell" ? "Sell Mode" : "Buy Mode";
    const itemText = shop.itemId ? `\n§7Item: §f${shop.itemId}` : "";
    form.body(`§e=== §6Chest Shop Info §e===\n§7Owner: §e${shop.ownerName || "Unknown"}\n§7Mode: §a${modeText}${itemText}\n§7Price: §6${priceText(shop.price)}\n\n§7Select an option:`);
  } else {
    form.body("§e=== §6Chest Shop Setup §e===\n§7Choose a shop mode to setup on this chest:");
  }

  for (const a of actions) {
    form.button(a.label, a.icon);
  }

  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection < 0 || res.selection >= actions.length) return;
    if (res.selection === 0) openPriceForm(player, block, "sell", shop);
    else if (res.selection === 1) openPriceForm(player, block, "buy", shop);
    else if (shop && res.selection === 2) {
      unregisterShop(entry.key);
      msg(player, "chestshop.removed");
    }
  });
}

function openPriceForm(player, block, mode, existing) {
  const container = getContainer(block);
  const form = new ModalFormData()
    .title(shopTitle(Lang.t(player, "chestshop.setup.title")));

  let options = [];
  if (mode === "sell") {
    options = getItemOptions(container);
    if (options.length === 0) {
      msg(player, "chestshop.empty");
      return;
    }
    const labels = options.map((o) => `${o.id} (x${o.count})`);
    form.dropdown(Lang.t(player, "chestshop.item.label"), labels, { defaultValueIndex: 0 });
  }
  form.textField(Lang.t(player, "chestshop.price.label"), "100", {
    defaultValue: existing ? String(existing.price) : "100",
  });

  form.show(player).then((res) => {
    if (res.canceled) return;
    const priceRaw = mode === "sell" ? res.formValues[1] : res.formValues[0];
    const price = parseInt(String(priceRaw || "0"), 10);
    if (isNaN(price) || price < 0) return;
    const shop = { owner: player.id, ownerName: player.name, mode, price: Math.floor(price), enabled: true };
    if (mode === "sell") {
      shop.itemId = options[res.formValues[0]]?.id;
      if (!shop.itemId) return;
    }
    const key = shopKey(block);
    const owned = getAllShops().filter((s) => s.shop.owner === player.id && s.key !== key).length;
    if (owned >= getShopMax()) {
      msg(player, "chestshop.max.reached", getShopMax().toString());
      return;
    }
    world.setDynamicProperty(key, JSON.stringify(shop));
    registerShop(key, shop);
    msg(player, "chestshop.saved");
    player.playSound("random.levelup");
  });
}

/* ---------------- buy / sell flows ---------------- */

function openShopUi(player, block, shop) {
  if (shop.mode === "sell") openBuyForm(player, block, shop);
  else openSellForm(player, block, shop);
}

function creditOwner(shop, gross, buyer, qty) {
  const owner = world.getAllPlayers().find((p) => p.id === shop.owner);
  if (owner) {
    addMoney(owner, gross);
    msg(owner, "chestshop.owner.sold", [`${buyer.name}§r`, shop.itemId || "item", qty.toString(), priceText(gross)]);
  } else {
    const key = PENDING_PREFIX + shop.owner;
    const current = world.getDynamicProperty(key);
    world.setDynamicProperty(key, (typeof current === "number" ? current : 0) + gross);
  }
}

function openBuyForm(player, block, shop) {
  const container = getContainer(block);
  if (!container || getItemCount(container, shop.itemId) <= 0) {
    msg(player, "chestshop.no.stock");
    return;
  }
  const form = new ModalFormData()
    .title(shopTitle(Lang.t(player, "chestshop.buy.title")))
    .textField(Lang.t(player, "chestshop.quantity"), "1", { defaultValue: "1" });

  form.show(player).then((res) => {
    if (res.canceled) return;
    let qty = parseInt(String(res.formValues[0] || "1"), 10);
    if (isNaN(qty) || qty < 1) qty = 1;
    if (qty > 64) qty = 64;

    const inv = player.getComponent("minecraft:inventory").container;
    const maxStack = new ItemStack(shop.itemId, 1).maxAmount;
    let capacity = getInventoryCapacity(inv, shop.itemId, maxStack);
    if (qty > capacity) qty = capacity;
    if (qty <= 0) {
      msg(player, "chestshop.no.space");
      return;
    }
    const stock = getItemCount(container, shop.itemId);
    if (qty > stock) qty = stock;
    if (qty <= 0) {
      msg(player, "chestshop.no.stock");
      return;
    }
    const cost = qty * shop.price;
    if (getFullMoney(player) < BigInt(cost)) {
      msg(player, "chestshop.no.balance");
      return;
    }

    removeItems(container, shop.itemId, qty);
    const leftover = inv.addItem(new ItemStack(shop.itemId, qty));
    const given = qty - (leftover ? leftover.amount : 0);
    if (leftover) container.addItem(leftover);
    if (given <= 0) {
      msg(player, "chestshop.no.space");
      return;
    }
    const actualCost = given * shop.price;
    removeMoney(player, actualCost);
    creditOwner(shop, actualCost, player, given);
    msg(player, "chestshop.buy.success", [shop.itemId, given.toString(), priceText(actualCost)]);
    player.playSound("random.orb");
  });
}

function openSellForm(player, block, shop) {
  const owner = world.getAllPlayers().find((p) => p.id === shop.owner);
  if (!owner) {
    msg(player, "chestshop.owner.offline");
    return;
  }
  const container = getContainer(block);
  if (!container) return;
  const inv = player.getComponent("minecraft:inventory").container;
  const hand = inv.getItem(player.selectedSlotIndex);
  if (!hand) {
    msg(player, "chestshop.sell.hand.empty");
    return;
  }
  const grossFull = shop.price * hand.amount;
  if (getFullMoney(owner) < BigInt(grossFull)) {
    msg(player, "chestshop.owner.balance");
    return;
  }

  const leftover = container.addItem(hand);
  const given = hand.amount - (leftover ? leftover.amount : 0);
  if (given <= 0) {
    msg(player, "chestshop.full");
    return;
  }
  if (given < hand.amount) inv.setItem(player.selectedSlotIndex, new ItemStack(hand.typeId, hand.amount - given));
  else inv.setItem(player.selectedSlotIndex, undefined);

  const gross = given * shop.price;
  removeMoney(owner, gross);
  addMoney(player, gross);
  msg(player, "chestshop.sell.success", [hand.typeId, given.toString(), priceText(gross)]);
  msg(owner, "chestshop.owner.sold", [`${player.name}§r`, hand.typeId, given.toString(), priceText(gross)]);
  player.playSound("random.orb");
}

/* ---------------- event wiring ---------------- */

export function showChestShopAdminMenu(player, onBack) {
  const enabled = isShopEnabled();
  const max = getShopMax();
  const count = getAllShops().length;
  const form = new ModalFormData()
    .title(shopTitle(`Chest Shop Config (${count} active)`))
    .toggle("§eEnable Chest Shop", { defaultValue: enabled })
    .textField("§eMax shops per player", "10", { defaultValue: String(max) })
    .submitButton("§aSave");
  form.show(player).then((res) => {
    if (res.canceled) {
      if (onBack) onBack();
      return;
    }
    world.setDynamicProperty(ENABLED_KEY, res.formValues[0] === true);
    const m = parseInt(String(res.formValues[1] || "10"), 10);
    world.setDynamicProperty(MAX_KEY, isNaN(m) ? MAX_DEFAULT : Math.max(0, Math.min(99, Math.floor(m))));
    msg(player, "chestshop.admin.saved");
    if (onBack) onBack();
  }).catch((error) => {
    console.warn(`[Chest Shop] Admin menu gagal dibuka: ${error}`);
    try { player.sendMessage("§cChest Shop settings gagal dibuka."); } catch { }
  });
}

world.beforeEvents.playerInteractWithBlock.subscribe(onChestInteract);

world.afterEvents.playerBreakBlock.subscribe((evt) => {
  try {
    const key = shopKey(evt.block);
    if (world.getDynamicProperty(key) !== undefined) unregisterShop(key);
  } catch (e) {
    // block gone
  }
});

world.afterEvents.playerJoin.subscribe((evt) => {
  system.run(() => {
    try {
      const key = PENDING_PREFIX + evt.playerId;
      const pending = world.getDynamicProperty(key);
      if (typeof pending === "number" && pending > 0) {
        const player = world.getAllPlayers().find((p) => p.id === evt.playerId);
        if (player) {
          addMoney(player, pending);
          world.setDynamicProperty(key, 0);
          msg(player, "chestshop.pending.credited", priceText(pending));
        }
      }
    } catch (e) {
      // ignore
    }
  });
});

world.afterEvents.playerLeave.subscribe((evt) => {
  uiCooldown.delete(evt.playerId);
});
