import { world, system, ItemStack, EnchantmentType, ActionFormData, ModalFormData, MessageFormData, CustomForm, ObservableBoolean, ObservableString, shopTitle as coreShopTitle } from '../../../core.js';
import { ForceOpen, metricNumbers } from "../../../lib/game.js";
import { Lang } from "../../../lib/Lang.js";
import { shopConfig, loadShopConfig, getShopCurrency, getShopCurrencySymbol, getShopCurrencyName, getShopCurrencyMode, getEffectivePrice, incrementDPBuyCount, getDPShopResetLine } from "../../../admin_menu/shopConfig.js";
import {
  getFullMoney,
  addMoney,
  removeMoney,
  formatMoneyValue,
  getFormattedMoney,
} from "../../../function/moneySystem.js";
import {
  getPlayerCoins,
  addPlayerCoins,
  removePlayerCoins,
} from "../../../plugins/tf-money/tf-money.js";
import { getEconomyBenefits } from "../../../plugins/ranks/rank_benefits.js";
import {
  itemBlock,
  itemBlockColor,
  itemLog,
  itemFurniture,
  itemGlass,
  itemSword,
  itemAxe,
  itemPickaxe,
  itemShovel,
  itemHelmet,
  itemChestplate,
  itemLeggings,
  itemBoots,
  itemArmor,
  itemFarm,
  itemFood,
  itemOres,
  itemSpawner,
  itemEnchantedBook,
} from "../../config_shop.js";

const SHOP_MAX_QUANTITY = 64 * 1000;
const SHOP_MAX_SAFE_COST = Number.MAX_SAFE_INTEGER;
const pendingTransactions = new Map();
const SHOP_TX_COOLDOWN_TICKS = 20;
const SHOP_SELL_LIST_MARKER = "§s§h§s§l";
const SHOP_SEARCH_LIST_MARKER = "§s§h§s§r";

function parseShopQuantity(raw) {
  const parsed = Math.floor(Number(String(raw ?? "").trim()));
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.min(parsed, SHOP_MAX_QUANTITY);
}

function getShopItemMaxStack(itemId) {
  try {
    const probe = new ItemStack(normalizeShopItemId(itemId) || itemId, 1);
    const maxAmount = Number(probe?.maxAmount);
    return Number.isFinite(maxAmount) && maxAmount > 0 ? Math.floor(maxAmount) : 64;
  } catch {
    return 64;
  }
}

function calcShopTotalCost(unitPrice, quantity) {
  const unit = Math.floor(Number(unitPrice));
  const qty = Math.floor(Number(quantity));
  if (!Number.isSafeInteger(unit) || !Number.isSafeInteger(qty) || unit < 0 || qty < 1) {
    return null;
  }
  if (unit === 0) return 0;
  if (unit > SHOP_MAX_SAFE_COST / qty) return null;
  const total = unit * qty;
  if (!Number.isSafeInteger(total) || total < 0) return null;
  return total;
}

function stripShopFormatting(value) {
  return String(value ?? "").replace(/\u00C2?§./g, "");
}

function cleanShopLabel(value) {
  return stripShopFormatting(value)
    .replace(/^\((.*)\)$/, "$1")
    .trim();
}

function translateShopOrFallback(player, key, fallback) {
  const translated = Lang.t(player, key);
  return !translated || translated === key ? fallback : translated;
}

function lowerShopLabel(value) {
  return cleanShopLabel(value).toLowerCase();
}

function getShopPlayerId(player) {
  return player.id || player.name;
}

function isShopBusy(player) {
  const state = pendingTransactions.get(getShopPlayerId(player));
  if (!state) return false;
  if (state.busy) return true;
  return system.currentTick < (state.cooldownUntil ?? 0);
}

function beginShopTx(player) {
  if (isShopBusy(player)) return false;
  const id = getShopPlayerId(player);
  const prev = pendingTransactions.get(id);
  pendingTransactions.set(id, { busy: true, cooldownUntil: prev?.cooldownUntil ?? 0 });
  return true;
}

function endShopTx(player, success = false) {
  const id = getShopPlayerId(player);
  const cooldownTicks = success ? SHOP_TX_COOLDOWN_TICKS : 10;
  pendingTransactions.set(id, {
    busy: false,
    cooldownUntil: system.currentTick + cooldownTicks,
  });
}

function normalizeShopItemId(itemId) {
  const raw = String(itemId ?? "").trim();
  if (!raw) return "";
  return raw.includes(":") ? raw : `minecraft:${raw}`;
}

function getShopItemIdBase(item) {
  return normalizeShopItemId(item?.item).replace("minecraft:", "");
}

function matchesShopItem(slotTypeId, item) {
  if (!slotTypeId || !item?.item || item.command) return false;
  const base = getShopItemIdBase(item);
  const slotBase = slotTypeId.replace("minecraft:", "");
  if (slotBase === base || slotTypeId.endsWith(`:${base}`)) return true;
  if (base === "shulker_box") {
    return slotBase === "shulker_box" || slotBase === "undyed_shulker_box" || slotBase.endsWith("_shulker_box");
  }
  return false;
}

function getInventoryContainer(player) {
  try {
    return player.getComponent("inventory")?.container || null;
  } catch {
    return null;
  }
}

function countPlayerItemsById(player, item) {
  const container = getInventoryContainer(player);
  if (!container) return 0;
  let total = 0;
  for (let i = 0; i < container.size; i++) {
    const slotItem = container.getItem(i);
    if (!slotItem) continue;
    if (matchesShopItem(slotItem.typeId, item)) total += slotItem.amount;
  }
  return total;
}

function countEmptyInventorySlots(player) {
  const container = getInventoryContainer(player);
  if (!container) return 0;
  let emptySlots = 0;
  for (let i = 0; i < container.size; i++) {
    if (!container.getItem(i)) emptySlots++;
  }
  return emptySlots;
}

function hasSpaceForShopPurchase(player, item, quantity) {
  if (item?.command) {
    return { ok: true, emptySlots: 36, requiredSlots: 0 };
  }
  const emptySlots = countEmptyInventorySlots(player);
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const maxStack = item?.enchantments ? 1 : getShopItemMaxStack(item?.item);
  const requiredSlots = Math.max(1, Math.ceil(qty / Math.max(1, maxStack)));
  if (maxStack <= 1) {
    return { ok: emptySlots >= requiredSlots, emptySlots, requiredSlots };
  }
  return { ok: emptySlots >= 1, emptySlots, requiredSlots: 1 };
}

function executeShopCommand(player, item, quantity = 1) {
  if (!item?.command) return 0;
  const rawCmds = String(item.command)
    .split(/[\n;]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  if (rawCmds.length === 0) return 0;

  const rawPlayerName = player?.name || "";
  const cleanPlayerName = rawPlayerName.replace(/"/g, "");
  const safePlayerTarget = `"${cleanPlayerName}"`;
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));

  let successCount = 0;
  for (let i = 0; i < qty; i++) {
    let stepSuccess = true;
    for (const rawCmd of rawCmds) {
      let cmd = rawCmd;
      if (cmd.startsWith("/")) cmd = cmd.substring(1).trim();

      cmd = cmd
        .replace(/\{player\}/gi, safePlayerTarget)
        .replace(/<player>/gi, safePlayerTarget)
        .replace(/\{name\}/gi, safePlayerTarget)
        .replace(/<name>/gi, safePlayerTarget)
        .replace(/\{target\}/gi, safePlayerTarget);

      const serverCmd = cmd.replace(/(^|\s)@s(\b|$)/g, `$1${safePlayerTarget}$2`);

      try {
        if (player.dimension?.runCommand) {
          player.dimension.runCommand(serverCmd);
        } else {
          player.runCommand(cmd);
        }
      } catch (err) {
        try {
          player.runCommand(cmd);
        } catch (err2) {
          console.warn(`[Shop] Failed executing command "${cmd}" for ${rawPlayerName}:`, err2);
          stepSuccess = false;
        }
      }
    }
    if (stepSuccess) successCount++;
  }
  return successCount;
}

function getShopBalance(player) {
  const currency = getShopCurrency();
  if (currency === "money") {
    return getFullMoney(player);
  }
  try {
    const objective = world.scoreboard.getObjective(currency);
    if (!objective) return BigInt(0);
    const score = objective.getScore(player.scoreboardIdentity) || 0;
    return BigInt(Math.max(score, 0));
  } catch {
    return BigInt(0);
  }
}

function formatShopBalance(amount) {
  const currency = getShopCurrency();
  if (currency === "money") {
    return formatMoneyValue(amount);
  }
  return metricNumbers(amount.toString());
}

function getEffectiveCurrencyType(item) {
  const mode = getShopCurrencyMode();
  if (mode === "money") return "money";
  if (mode === "coin") return "coin";
  return item?.currencyType || "money";
}

function getItemBalance(player, currencyType) {
  if (currencyType === "coin") {
    return BigInt(getPlayerCoins(player));
  }
  return getFullMoney(player);
}

function removeItemBalance(player, amount, currencyType) {
  if (currencyType === "coin") {
    return removePlayerCoins(player, Number(amount));
  }
  return removeMoney(player, amount);
}

function addItemBalance(player, amount, currencyType) {
  if (currencyType === "coin") {
    return addPlayerCoins(player, Number(amount));
  }
  return addMoney(player, amount);
}

function formatItemBalance(amount, currencyType) {
  if (currencyType === "coin") {
    return metricNumbers(amount.toString());
  }
  return formatMoneyValue(amount);
}

function getShopMoneyLine(player) {
  const mode = getShopCurrencyMode();
  const currencySymbol = getShopCurrencySymbol();
  const balanceLabel = Lang.t(player, "shop.balance");
  if (mode === "dual") {
    return `§7${balanceLabel}: §aMoney: ${currencySymbol}${getFormattedMoney(player)} §8| §6Coins: ${metricNumbers(getPlayerCoins(player).toString())}`;
  }
  if (mode === "coin") {
    return `§7${balanceLabel}: §6Coins: ${metricNumbers(getPlayerCoins(player).toString())}`;
  }
  const balance = getShopBalance(player);
  return `§7${balanceLabel}: §a${currencySymbol}${formatShopBalance(balance)}`;
}

function isShopItemSellable(item) {
  if (item?.command) return false;
  return Boolean(item && item.name && item.item && !item.notsold && Number(item.sell) > 0);
}

/**
 * Calculate safe effective buy price with anti-arbitrage safeguard:
 * Buy price will never be <= sell price, ensuring zero infinite money exploits.
 */
function getSafeEffectiveBuyPrice(player, item) {
  const baseCost = getEffectivePrice(item);
  const economyBenefits = getEconomyBenefits(player);
  const discountPercent = Math.min(95, Math.max(0, economyBenefits.discount || 0));

  let finalCost = baseCost;
  if (discountPercent > 0) {
    finalCost = Math.floor(baseCost * (1 - discountPercent / 100));
  }

  // Anti-Arbitrage Protection:
  // If item can be sold, the buy price CANNOT drop below (sell + 15%) or (sell + 1)
  if (isShopItemSellable(item)) {
    const sellPrice = Math.floor(Number(item.sell) || 0);
    const minSafeCost = Math.max(sellPrice + 1, Math.ceil(sellPrice * 1.15));
    if (finalCost < minSafeCost) {
      finalCost = minSafeCost;
    }
  }

  return Math.max(1, finalCost);
}

function getAllSellableShopItems() {
  loadShopConfig();
  const list = [];
  const seen = new Set();
  const categories = Array.isArray(shopConfig.categories) ? shopConfig.categories : [];
  for (const category of categories) {
    if (!category || category.enabled === false) continue;
    const items = shopConfig.items?.[category.id];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!isShopItemSellable(item)) continue;
      const key = normalizeShopItemId(item.item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(item);
    }
  }
  return list;
}

function scanPlayerSellableInventory(player) {
  const sellableShopItems = getAllSellableShopItems();
  if (sellableShopItems.length === 0) return [];
  const container = getInventoryContainer(player);
  if (!container) return [];
  const byKey = new Map();
  for (let i = 0; i < container.size; i++) {
    const slotItem = container.getItem(i);
    if (!slotItem) continue;
    let matched = null;
    for (const shopItem of sellableShopItems) {
      if (matchesShopItem(slotItem.typeId, shopItem)) {
        matched = shopItem;
        break;
      }
    }
    if (!matched) continue;
    const key = normalizeShopItemId(matched.item);
    const existing = byKey.get(key);
    if (existing) {
      existing.amount += slotItem.amount;
    } else {
      byKey.set(key, { shopItem: matched, amount: slotItem.amount });
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    cleanShopLabel(a.shopItem.name).localeCompare(cleanShopLabel(b.shopItem.name))
  );
}

function calculateSellAllValue(player) {
  const sellEntries = scanPlayerSellableInventory(player);
  let totalValue = 0n;
  let totalItems = 0;
  for (const entry of sellEntries) {
    const amount = entry.amount;
    const sellPrice = BigInt(entry.shopItem.sell) * BigInt(amount);
    totalValue += sellPrice;
    totalItems += amount;
  }
  return { totalValue, totalItems, sellEntries };
}

function executeSellAll(player) {
  const container = getInventoryContainer(player);
  if (!container) {
    player.sendMessage("§cInventory error.");
    return false;
  }
  const sellEntries = scanPlayerSellableInventory(player);
  if (sellEntries.length === 0) {
    player.sendMessage(Lang.t(player, "shop.sell_menu.empty"));
    try { player.playSound("note.bass"); } catch {}
    return false;
  }
  let totalEarnings = 0n;
  let totalItemsSold = 0;
  const summary = [];
  for (const entry of sellEntries) {
    const shopItem = entry.shopItem;
    const amount = entry.amount;
    let removed = 0;
    for (let i = 0; i < container.size && removed < amount; i++) {
      const slotItem = container.getItem(i);
      if (!slotItem) continue;
      if (matchesShopItem(slotItem.typeId, shopItem)) {
        const toRemove = Math.min(slotItem.amount, amount - removed);
        if (toRemove >= slotItem.amount) {
          container.setItem(i, undefined);
        } else {
          container.setItem(i, new ItemStack(slotItem.typeId, slotItem.amount - toRemove));
        }
        removed += toRemove;
      }
    }
    if (removed > 0) {
      const actualEarnings = BigInt(shopItem.sell) * BigInt(removed);
      totalEarnings += actualEarnings;
      totalItemsSold += removed;
      summary.push(`§7  §f${shopItem.name}: §ex${removed} §7= §a${getShopCurrencySymbol()}${formatShopBalance(actualEarnings)}`);
    }
  }
  if (totalItemsSold === 0) {
    player.sendMessage("§cFailed to process sell items.");
    try { player.playSound("note.bass"); } catch {}
    return false;
  }
  addItemBalance(player, totalEarnings, "money");
  player.sendMessage("§e=== §6" + Lang.t(player, "shop.sell_menu.header") + " §e===");
  player.sendMessage(summary.join("\n"));
  player.sendMessage("§e------------------------------");
  player.sendMessage(`§7Total: §e${totalItemsSold} items`);
  player.sendMessage(`§7Earned: §a${getShopCurrencySymbol()}${formatShopBalance(totalEarnings)}`);
  player.sendMessage("§e==============================");
  try { player.playSound("random.orb"); } catch {}
  return true;
}

function giveShopItems(player, item, quantity) {
  const container = getInventoryContainer(player);
  if (!container) throw new Error("Inventory not found");
  const itemId = normalizeShopItemId(item.item);
  const maxStack = getShopItemMaxStack(itemId);
  let delivered = 0;
  let left = Math.max(0, Math.floor(Number(quantity) || 0));
  while (left > 0) {
    const batch = Math.min(left, maxStack);
    const stack = new ItemStack(itemId, batch);
    const remainder = container.addItem(stack);
    if (remainder) {
      const added = batch - remainder.amount;
      if (added > 0) delivered += added;
      player.dimension.spawnItem(remainder, player.location);
      delivered += remainder.amount;
    } else {
      delivered += batch;
    }
    left -= batch;
  }
  return delivered;
}

function normalizeShopSearchQuery(raw) {
  return lowerShopLabel(raw).replace(/\s+/g, " ").trim();
}

function filterShopItemsByQuery(items, query) {
  const list = Array.isArray(items) ? items : [];
  const q = normalizeShopSearchQuery(query);
  if (!q) return list.filter((item) => item && item.name && (item.cost !== undefined || item.sell !== undefined));
  return list.filter((item) => {
    if (!item || !item.name) return false;
    const name = lowerShopLabel(item.name);
    const id = lowerShopLabel(item.item || item.id || "");
    return name.includes(q) || id.includes(q);
  });
}

async function promptShopSearch(player, currentQuery = "") {
  const form = new ModalFormData()
    .title(Lang.t(player, "shop.search.title"))
    .textField(
      Lang.t(player, "shop.search.field"),
      Lang.t(player, "shop.search.placeholder"),
      { defaultValue: normalizeShopSearchQuery(currentQuery) }
    );
  const result = await ForceOpen(player, form);
  if (result.canceled) return null;
  return normalizeShopSearchQuery(result.formValues?.[0] ?? "");
}

// Sub-Menu Definitions for Categories
const CATEGORY_SUBMENUS = {
  tools: {
    titleKey: "shop.cat.tools",
    defaultTitle: "Tools & Weapons",
    subcategories: [
      { id: "swords", nameKey: "shop.subcat.swords", defaultName: "Swords", descKey: "shop.subcat.swords_desc", defaultDesc: "Swords & Melee Weapons", icon: "textures/items/diamond_sword.png", filter: (it) => it.item?.includes("sword") || it.name?.toLowerCase().includes("sword") },
      { id: "pickaxes", nameKey: "shop.subcat.pickaxes", defaultName: "Pickaxes", descKey: "shop.subcat.pickaxes_desc", defaultDesc: "Mining Pickaxes", icon: "textures/items/diamond_pickaxe.png", filter: (it) => it.item?.includes("pickaxe") || it.name?.toLowerCase().includes("pickaxe") },
      { id: "axes", nameKey: "shop.subcat.axes", defaultName: "Axes", descKey: "shop.subcat.axes_desc", defaultDesc: "Woodcutting & Combat Axes", icon: "textures/items/diamond_axe.png", filter: (it) => (it.item?.includes("axe") && !it.item?.includes("pickaxe")) || it.name?.toLowerCase().includes("axe") },
      { id: "shovels", nameKey: "shop.subcat.shovels", defaultName: "Shovels", descKey: "shop.subcat.shovels_desc", defaultDesc: "Digging Tools", icon: "textures/items/diamond_shovel.png", filter: (it) => it.item?.includes("shovel") || it.name?.toLowerCase().includes("shovel") },
      { id: "all_tools", nameKey: "shop.subcat.all_tools", defaultName: "All Tools", descKey: "shop.subcat.all_tools_desc", defaultDesc: "View all tools and weapons", icon: "textures/items/iron_pickaxe.png", filter: () => true },
    ],
  },
  armor_group: {
    titleKey: "shop.cat.armor",
    defaultTitle: "Armor & Sets",
    subcategories: [
      { id: "helmets", nameKey: "shop.subcat.helmets", defaultName: "Helmets", descKey: "shop.subcat.helmets_desc", defaultDesc: "Head Protection", icon: "textures/items/diamond_helmet.png", categoryKey: "helmet", filter: (it) => it.item?.includes("helmet") || it.name?.toLowerCase().includes("helmet") },
      { id: "chestplates", nameKey: "shop.subcat.chestplates", defaultName: "Chestplates", descKey: "shop.subcat.chestplates_desc", defaultDesc: "Body Protection", icon: "textures/items/diamond_chestplate.png", categoryKey: "chestplate", filter: (it) => it.item?.includes("chestplate") || it.name?.toLowerCase().includes("chestplate") },
      { id: "leggings", nameKey: "shop.subcat.leggings", defaultName: "Leggings", descKey: "shop.subcat.leggings_desc", defaultDesc: "Leg Protection", icon: "textures/items/diamond_leggings.png", categoryKey: "leggings", filter: (it) => it.item?.includes("leggings") || it.name?.toLowerCase().includes("leggings") },
      { id: "boots", nameKey: "shop.subcat.boots", defaultName: "Boots", descKey: "shop.subcat.boots_desc", defaultDesc: "Foot Protection", icon: "textures/items/diamond_boots.png", categoryKey: "boots", filter: (it) => it.item?.includes("boots") || it.name?.toLowerCase().includes("boots") },
      { id: "all_armor", nameKey: "shop.subcat.all_armor", defaultName: "All Armor", descKey: "shop.subcat.all_armor_desc", defaultDesc: "View all armor sets", icon: "textures/items/netherite_chestplate.png", isArmorAll: true, filter: () => true },
    ],
  },
  farming: {
    titleKey: "shop.cat.farming",
    defaultTitle: "Farming & Agriculture",
    subcategories: [
      { id: "seeds", nameKey: "shop.subcat.seeds", defaultName: "Seeds & Tools", descKey: "shop.subcat.seeds_desc", defaultDesc: "Seeds, hoes & fertilizers", icon: "textures/items/seeds_wheat.png", filter: (it) => it.item?.includes("seeds") || it.item?.includes("hoe") || it.item?.includes("bone_meal") || it.name?.toLowerCase().includes("seed") || it.name?.toLowerCase().includes("hoe") },
      { id: "crops", nameKey: "shop.subcat.crops", defaultName: "Harvested Crops", descKey: "shop.subcat.crops_desc", defaultDesc: "Wheat, carrots, potatoes, cane", icon: "textures/items/wheat.png", filter: (it) => it.item?.includes("wheat") || it.item?.includes("carrot") || it.item?.includes("potato") || it.item?.includes("beetroot") || it.item?.includes("cane") || it.name?.toLowerCase().includes("wheat") || it.name?.toLowerCase().includes("carrot") || it.name?.toLowerCase().includes("potato") || it.name?.toLowerCase().includes("beetroot") || it.name?.toLowerCase().includes("sugar") },
      { id: "all_farming", nameKey: "shop.subcat.all_farming", defaultName: "All Farming Items", descKey: "shop.subcat.all_farming_desc", defaultDesc: "View all farming supplies", icon: "textures/items/carrot.png", filter: () => true },
    ],
  },
  ores: {
    titleKey: "shop.cat.ores",
    defaultTitle: "Ores & Minerals",
    subcategories: [
      { id: "basic_ores", nameKey: "shop.subcat.basic_ores", defaultName: "Basic Ores & Metals", descKey: "shop.subcat.basic_ores_desc", defaultDesc: "Coal, Copper, Iron, Gold", icon: "textures/items/iron_ingot.png", filter: (it) => it.item?.includes("coal") || it.item?.includes("copper") || it.item?.includes("iron") || it.item?.includes("gold") || it.name?.toLowerCase().includes("coal") || it.name?.toLowerCase().includes("iron") || it.name?.toLowerCase().includes("gold") || it.name?.toLowerCase().includes("copper") },
      { id: "rare_gems", nameKey: "shop.subcat.rare_gems", defaultName: "Rare Gems & Minerals", descKey: "shop.subcat.rare_gems_desc", defaultDesc: "Diamond, Emerald, Netherite", icon: "textures/items/diamond.png", filter: (it) => it.item?.includes("diamond") || it.item?.includes("emerald") || it.item?.includes("netherite") || it.name?.toLowerCase().includes("diamond") || it.name?.toLowerCase().includes("emerald") || it.name?.toLowerCase().includes("netherite") },
      { id: "all_ores", nameKey: "shop.subcat.all_ores", defaultName: "All Minerals", descKey: "shop.subcat.all_ores_desc", defaultDesc: "View all mined resources", icon: "textures/items/gold_ingot.png", filter: () => true },
    ],
  },
  spawner: {
    titleKey: "shop.cat.spawner",
    defaultTitle: "Spawners & Mob Eggs",
    subcategories: [
      { id: "spawners", nameKey: "shop.subcat.spawners", defaultName: "Monster Spawners", descKey: "shop.subcat.spawners_desc", defaultDesc: "Mob cage spawners", icon: "textures/blocks/mob_spawner.png", filter: (it) => it.item?.includes("spawner") || it.name?.toLowerCase().includes("spawner") },
      { id: "spawn_eggs", nameKey: "shop.subcat.spawn_eggs", defaultName: "Spawn Eggs", descKey: "shop.subcat.spawn_eggs_desc", defaultDesc: "Entity spawn eggs", icon: "textures/items/egg_zombie.png", filter: (it) => it.item?.includes("egg") || it.name?.toLowerCase().includes("egg") },
      { id: "all_spawners", nameKey: "shop.subcat.all_spawners", defaultName: "All Spawners & Eggs", descKey: "shop.subcat.all_spawners_desc", defaultDesc: "View all mob items", icon: "textures/blocks/mob_spawner.png", filter: () => true },
    ],
  },
  wool: {
    titleKey: "shop.cat.wool",
    defaultTitle: "Wool & Colors",
    subcategories: [
      { id: "warm_wool", nameKey: "shop.subcat.warm_wool", defaultName: "Warm Colors", descKey: "shop.subcat.warm_wool_desc", defaultDesc: "Red, Orange, Yellow, Pink, Brown", icon: "textures/blocks/wool_colored_red.png", filter: (it) => ["red", "orange", "yellow", "pink", "brown"].some((c) => it.textures?.includes(c) || it.item?.includes(c)) },
      { id: "cool_wool", nameKey: "shop.subcat.cool_wool", defaultName: "Cool Colors", descKey: "shop.subcat.cool_wool_desc", defaultDesc: "Blue, Cyan, Purple, Magenta, Light Blue", icon: "textures/blocks/wool_colored_blue.png", filter: (it) => ["blue", "cyan", "purple", "magenta", "light_blue"].some((c) => it.textures?.includes(c) || it.item?.includes(c)) },
      { id: "neutral_wool", nameKey: "shop.subcat.neutral_wool", defaultName: "Neutral Colors", descKey: "shop.subcat.neutral_wool_desc", defaultDesc: "White, Gray, Black, Green, Lime", icon: "textures/blocks/wool_colored_white.png", filter: (it) => ["white", "gray", "silver", "black", "green", "lime"].some((c) => it.textures?.includes(c) || it.item?.includes(c)) },
      { id: "all_wool", nameKey: "shop.subcat.all_wool", defaultName: "All 16 Wool Colors", descKey: "shop.subcat.all_wool_desc", defaultDesc: "View all colored wool", icon: "textures/blocks/wool_colored_lime.png", filter: () => true },
    ],
  },
  wood: {
    titleKey: "shop.cat.wood",
    defaultTitle: "Wood & Logs",
    subcategories: [
      { id: "tree_logs", nameKey: "shop.subcat.tree_logs", defaultName: "Tree Logs", descKey: "shop.subcat.tree_logs_desc", defaultDesc: "Oak, Birch, Spruce, Dark Oak, etc", icon: "textures/blocks/log_oak.png", filter: (it) => it.item?.includes("log") || it.name?.toLowerCase().includes("log") },
      { id: "all_wood", nameKey: "shop.subcat.all_wood", defaultName: "All Wood Items", descKey: "shop.subcat.all_wood_desc", defaultDesc: "View all wood products", icon: "textures/blocks/log_big_oak.png", filter: () => true },
    ],
  },
};

function getCategoryItems(categoryId) {
  loadShopConfig();
  if (categoryId === "armor_group" || categoryId === "armor") {
    const list = [];
    const keys = ["helmet", "chestplate", "leggings", "boots", "armor"];
    for (const k of keys) {
      if (Array.isArray(shopConfig.items?.[k])) {
        list.push(...shopConfig.items[k]);
      }
    }
    if (list.length === 0) return itemArmor;
    return list;
  }
  if (Array.isArray(shopConfig.items?.[categoryId])) {
    return shopConfig.items[categoryId];
  }
  switch (categoryId) {
    case "blocks": return itemBlock;
    case "wool": return itemBlockColor;
    case "wood": return itemLog;
    case "furniture": return itemFurniture;
    case "glass": return itemGlass;
    case "tools": return [...itemSword, ...itemAxe, ...itemPickaxe, ...itemShovel];
    case "helmet": return itemHelmet;
    case "chestplate": return itemChestplate;
    case "leggings": return itemLeggings;
    case "boots": return itemBoots;
    case "farming": return itemFarm;
    case "food": return itemFood;
    case "ores": return itemOres;
    case "spawner": return itemSpawner;
    case "enchanted_books": return itemEnchantedBook;
    default: return [];
  }
}

/**
 * Main Shop Menu (Level 1 - Categories List)
 */
export async function Shop(player, categoryPage = 0, itemPage = 0, searchQuery = "", selectedCategoryId = "") {
  loadShopConfig();
  const dpLine = getDPShopResetLine();
  const moneyLine = getShopMoneyLine(player);

  const categories = shopConfig.categories.filter((c) => c && c.enabled !== false);
  if (!categories.length) {
    player.sendMessage("§cNo shop categories configured.");
    return;
  }

  const processedCategories = [];
  let addedArmorGroup = false;

  for (const cat of categories) {
    if (["helmet", "chestplate", "leggings", "boots"].includes(cat.id)) {
      if (!addedArmorGroup) {
        processedCategories.push({
          id: "armor_group",
          name: Lang.t(player, "shop.cat.armor") || "Armor & Sets",
          subtitle: Lang.t(player, "shop.desc.armor") || "Helmets, Chestplates, Leggings & Boots",
          icon: "textures/items/diamond_chestplate.png",
          hasSubMenu: true,
        });
        addedArmorGroup = true;
      }
    } else {
      const hasSubMenu = Boolean(CATEGORY_SUBMENUS[cat.id]);
      const localizedCatName = translateShopOrFallback(
        player,
        `shop.cat.${cat.id}`,
        cleanShopLabel(cat.name),
      );
      const subtitle = translateShopOrFallback(
        player,
        `shop.desc.${cat.id}`,
        "View items",
      );

      processedCategories.push({
        id: cat.id,
        name: localizedCatName,
        subtitle: subtitle,
        icon: cat.icon || "textures/ui/icon_recipe_item",
        hasSubMenu,
      });
    }
  }

  const form = new ActionFormData()
    .shop()
    .shopSellHeader()
    .shopSearchHeader()
    .preserveButtonCase()
    .title(`${Lang.t(player, "shop.title")} - ${Lang.t(player, "shop.categories")}`)
    .body(
      `§e=== §6${Lang.t(player, "shop.title")} §e===\n` +
      `${moneyLine}\n` +
      (dpLine ? `${dpLine}\n` : "") +
      `§7${Lang.t(player, "shop.select_category")}`
    );

  // Header SELL button (index 0, hidden from list, shown via kiw_shop header)
  form.button(`${SHOP_SELL_LIST_MARKER}§a${Lang.t(player, "shop.btn.sell_inventory")}\n§7${Lang.t(player, "shop.btn.sell_inventory_desc")}`, "textures/items/emerald");
  // Header SEARCH button (index 1, hidden from list, shown via kiw_shop header as square icon)
  form.button(`${SHOP_SEARCH_LIST_MARKER}§b${Lang.t(player, "shop.btn.search")}\n§7${Lang.t(player, "shop.btn.search_desc")}`, "textures/ui/magnifyingGlass.png");
  for (const cat of processedCategories) {
    const cleanName = cleanShopLabel(cat.name);
    form.button(`§f${cleanName}\n§7${cat.subtitle}`, cat.icon);
  }

  // Quick Action Button: Close
  form.button(`§c${Lang.t(player, "shop.btn.close")}\n§7${Lang.t(player, "shop.btn.close_desc")}`, "textures/ui/cancel");

  const result = await ForceOpen(player, form);
  if (result.canceled) return;

  const selection = result.selection;
  const catCount = processedCategories.length;
  if (selection === 0) {
    return Sell(player);
  }
  if (selection === 1) {
    const query = await promptShopSearch(player);
    if (!query) return Shop(player);
    return showGlobalSearchResults(player, query);
  }
  if (selection >= 2 && selection < 2 + catCount) {
    const selectedCat = processedCategories[selection - 2];
    try { player.playSound("random.click", { volume: 0.6, pitch: 1.2 }); } catch {}
    if (selectedCat.hasSubMenu) {
      return showCategorySubMenu(player, selectedCat.id);
    } else {
      return showCategoryItems(player, selectedCat.id, selectedCat.name);
    }
  }
}

/**
 * Sub-Menu (Level 2 - Category Sub-Menu)
 */
async function showCategorySubMenu(player, categoryId) {
  loadShopConfig();
  const subMenuDef = CATEGORY_SUBMENUS[categoryId];
  if (!subMenuDef) {
    return showCategoryItems(player, categoryId);
  }

  const menuTitle = subMenuDef.titleKey
    ? translateShopOrFallback(player, subMenuDef.titleKey, subMenuDef.defaultTitle)
    : subMenuDef.defaultTitle;
  const moneyLine = getShopMoneyLine(player);
  const form = new ActionFormData()
    .shop()
    .preserveButtonCase()
    .title(`${menuTitle}`)
    .body(
      `§e=== §6${cleanShopLabel(menuTitle)} §e===\n` +
      `${moneyLine}\n` +
      `§7${Lang.t(player, "shop.select_category")}`
    );

  for (const sub of subMenuDef.subcategories) {
    const subName = sub.nameKey
      ? translateShopOrFallback(player, sub.nameKey, sub.defaultName)
      : sub.defaultName;
    const subDesc = sub.descKey
      ? translateShopOrFallback(player, sub.descKey, sub.defaultDesc)
      : sub.defaultDesc;
    form.button(`§f${subName}\n§7${subDesc}`, sub.icon);
  }

  form.button(`§c${Lang.t(player, "shop.btn.back")}\n§7${Lang.t(player, "shop.btn.back_desc")}`, "textures/ui/arrow_left");

  const result = await ForceOpen(player, form);
  if (result.canceled) return Shop(player);

  if (result.selection < subMenuDef.subcategories.length) {
    const chosenSub = subMenuDef.subcategories[result.selection];
    const subName = chosenSub.nameKey
      ? translateShopOrFallback(player, chosenSub.nameKey, chosenSub.defaultName)
      : chosenSub.defaultName;
    try { player.playSound("random.click", { volume: 0.6, pitch: 1.2 }); } catch {}
    return showCategoryItems(player, categoryId, subName, chosenSub);
  }

  try { player.playSound("random.click", { volume: 0.6, pitch: 0.9 }); } catch {}
  return Shop(player);
}

/**
 * Items Catalog (Level 3 - Items in Category / Sub-Menu)
 */
async function showCategoryItems(player, categoryId, categoryTitle = "", subCategory = null, searchQuery = "") {
  loadShopConfig();
  let allItems = getCategoryItems(categoryId);

  if (subCategory && typeof subCategory.filter === "function") {
    if (subCategory.categoryKey && Array.isArray(shopConfig.items?.[subCategory.categoryKey])) {
      allItems = shopConfig.items[subCategory.categoryKey];
    } else {
      allItems = allItems.filter(subCategory.filter);
    }
  }

  const activeQuery = normalizeShopSearchQuery(searchQuery);
  const displayItems = filterShopItemsByQuery(allItems, activeQuery);
  const currencySymbol = getShopCurrencySymbol();
  const moneyLine = getShopMoneyLine(player);
  const titleText = categoryTitle ? cleanShopLabel(categoryTitle) : cleanShopLabel(categoryId).toUpperCase();

  const form = new ActionFormData()
    .shop()
    .shopSellHeader()
    .shopSearchHeader()
    .preserveButtonCase()
    .title(`Shop - ${titleText}`)
    .body(
      `§e=== §6${titleText} §e===\n` +
      `${moneyLine}\n` +
      `§7${Lang.t(player, "shop.total_items", displayItems.length)}` +
      (activeQuery ? ` §8| §b${Lang.t(player, "shop.filter_active", activeQuery)}` : "") +
      `\n§7${Lang.t(player, "shop.click_to_trade")}`
    );

  // Sell Inventory at top (index 0, hidden from list)
  form.button(`${SHOP_SELL_LIST_MARKER}§a${Lang.t(player, "shop.btn.sell_inventory")}\n§7${Lang.t(player, "shop.btn.sell_inventory_desc")}`, "textures/items/emerald");
  // Search at top (index 1, hidden from list)
  form.button(`${SHOP_SEARCH_LIST_MARKER}§b${Lang.t(player, "shop.btn.search")}\n§7${Lang.t(player, "shop.btn.search_desc")}`, "textures/ui/magnifyingGlass.png");
  if (displayItems.length === 0) {
    form.button(`§c${Lang.t(player, "shop.no_items_found")}\n§7${Lang.t(player, "shop.btn.back")}`, "textures/ui/cancel");
  } else {
    for (const item of displayItems) {
      const currencyType = getEffectiveCurrencyType(item);
      const symbol = currencyType === "coin" ? "Coins " : currencySymbol;
      const effectiveBuy = getSafeEffectiveBuyPrice(player, item);
      const buyText = `§a${Lang.t(player, "shop.buy")}: ${symbol}${formatItemBalance(effectiveBuy, currencyType)}`;
      const sellText = isShopItemSellable(item)
        ? `§c${Lang.t(player, "shop.sell")}: ${symbol}${formatItemBalance(item.sell, currencyType)}`
        : `§8${Lang.t(player, "shop.no_sell")}`;

      form.button(
        `§f${cleanShopLabel(item.name)}\n${buyText} §8| ${sellText}`,
        item.textures || "textures/ui/icon_recipe_item"
      );
    }
  }

  form.button(`§c${Lang.t(player, "shop.btn.back")}\n§7${Lang.t(player, "shop.btn.back_desc")}`, "textures/ui/arrow_left");

  const result = await ForceOpen(player, form);
  if (result.canceled) {
    if (subCategory && CATEGORY_SUBMENUS[categoryId]) {
      return showCategorySubMenu(player, categoryId);
    }
    return Shop(player);
  }

  const selection = result.selection;
  if (selection === 0) {
    return Sell(player);
  }
  if (selection === 1) {
    const query = await promptShopSearch(player, activeQuery);
    if (!query) return showCategoryItems(player, categoryId, categoryTitle, subCategory, activeQuery);
    return showGlobalSearchResults(player, query);
  }
  if (displayItems.length === 0) {
    if (selection === 2) {
      if (subCategory && CATEGORY_SUBMENUS[categoryId]) {
        return showCategorySubMenu(player, categoryId);
      }
      return Shop(player);
    }
    return Shop(player);
  }
  if (selection >= 2 && selection < 2 + displayItems.length) {
    const selectedItem = displayItems[selection - 2];
    try { player.playSound("random.click", { volume: 0.6, pitch: 1.2 }); } catch {}
    return showItemTransaction(player, selectedItem, () => {
      showCategoryItems(player, categoryId, categoryTitle, subCategory, activeQuery);
    });
  }
  if (selection === 2 + displayItems.length) {
    if (subCategory && CATEGORY_SUBMENUS[categoryId]) {
      return showCategorySubMenu(player, categoryId);
    }
    return Shop(player);
  }
}

/**
 * Global Search Results
 */
async function showGlobalSearchResults(player, query) {
  loadShopConfig();
  const allSellable = [];
  const seen = new Set();
  const categories = Array.isArray(shopConfig.categories) ? shopConfig.categories : [];

  for (const cat of categories) {
    const items = getCategoryItems(cat.id);
    for (const it of items) {
      const key = normalizeShopItemId(it.item);
      if (key && !seen.has(key)) {
        seen.add(key);
        allSellable.push(it);
      }
    }
  }

  const matched = filterShopItemsByQuery(allSellable, query);
  const currencySymbol = getShopCurrencySymbol();
  const form = new ActionFormData()
    .shop()
    .shopSellHeader()
    .shopSearchHeader()
    .preserveButtonCase()
    .title(`${Lang.t(player, "shop.search.results_title")}`)
    .body(
      `§e=== §6${Lang.t(player, "shop.search.results_title")} §e===\n` +
      `§7${Lang.t(player, "shop.search.results_body", matched.length, query)}\n` +
      `§7${Lang.t(player, "shop.click_to_trade")}`
    );

  // Sell Inventory at top (index 0, hidden from list)
  form.button(`${SHOP_SELL_LIST_MARKER}§a${Lang.t(player, "shop.btn.sell_inventory")}\n§7${Lang.t(player, "shop.btn.sell_inventory_desc")}`, "textures/items/emerald");
  // Search at top (index 1, hidden from list)
  form.button(`${SHOP_SEARCH_LIST_MARKER}§b${Lang.t(player, "shop.btn.search")}\n§7${Lang.t(player, "shop.btn.search_desc")}`, "textures/ui/magnifyingGlass.png");

  if (matched.length === 0) {
    form.button(`§c${Lang.t(player, "shop.no_items_found")}\n§7${Lang.t(player, "shop.btn.search")}`, "textures/ui/cancel");
  } else {
    for (const item of matched) {
      const currencyType = getEffectiveCurrencyType(item);
      const symbol = currencyType === "coin" ? "Coins " : currencySymbol;
      const effectiveBuy = getSafeEffectiveBuyPrice(player, item);
      const buyText = `§a${Lang.t(player, "shop.buy")}: ${symbol}${formatItemBalance(effectiveBuy, currencyType)}`;
      const sellText = isShopItemSellable(item)
        ? `§c${Lang.t(player, "shop.sell")}: ${symbol}${formatItemBalance(item.sell, currencyType)}`
        : `§8${Lang.t(player, "shop.no_sell")}`;

      form.button(
        `§f${cleanShopLabel(item.name)}\n${buyText} §8| ${sellText}`,
        item.textures || "textures/ui/icon_recipe_item"
      );
    }
  }

  form.button(`§c${Lang.t(player, "shop.btn.back")}\n§7${Lang.t(player, "shop.btn.back_desc")}`, "textures/ui/arrow_left");

  const result = await ForceOpen(player, form);
  if (result.canceled) return Shop(player);

  const selection = result.selection;
  if (selection === 0) {
    return Sell(player);
  }
  if (selection === 1) {
    const nextQ = await promptShopSearch(player, query);
    if (!nextQ) return Shop(player);
    return showGlobalSearchResults(player, nextQ);
  }
  if (matched.length === 0) {
    if (selection === 2) {
      const nextQ = await promptShopSearch(player, query);
      if (!nextQ) return Shop(player);
      return showGlobalSearchResults(player, nextQ);
    }
    return Shop(player);
  }
  if (selection >= 2 && selection < 2 + matched.length) {
    const selectedItem = matched[selection - 2];
    return showItemTransaction(player, selectedItem, () => showGlobalSearchResults(player, query));
  }
  if (selection === 2 + matched.length) {
    return Shop(player);
  }
  return Shop(player);
}

/**
 * Transaction Menu (Level 4 - Buy / Sell Modal Dialog)
 */
async function showItemTransaction(player, item, onFinish) {
  const currencyType = getEffectiveCurrencyType(item);
  const isCoin = currencyType === "coin";
  const currencySymbol = isCoin ? "Coins " : getShopCurrencySymbol();
  const currencyName = isCoin ? "Coins" : getShopCurrencyName();

  const economyBenefits = getEconomyBenefits(player);
  const discountPercent = Math.min(95, Math.max(0, economyBenefits.discount || 0));
  const finalCost = getSafeEffectiveBuyPrice(player, item);

  const currentBal = getItemBalance(player, currencyType);
  const inInventory = countPlayerItemsById(player, item);
  const canSell = isShopItemSellable(item);

  const options = [Lang.t(player, "shop.transaction.mode_buy")];
  if (canSell) {
    options.push(Lang.t(player, "shop.transaction.mode_sell"));
    if (inInventory > 0) {
      options.push(Lang.t(player, "shop.transaction.mode_sell_all", inInventory));
    }
  }

  const buyPriceText = `${currencySymbol}${formatItemBalance(finalCost, currencyType)}`;
  const sellPriceText = canSell ? `${currencySymbol}${formatItemBalance(item.sell, currencyType)}` : Lang.t(player, "shop.no_sell");
  const balanceText = `${currencySymbol}${formatItemBalance(currentBal, currencyType)}`;
  const discountText = discountPercent > 0 ? ` §7${Lang.t(player, "shop.transaction.discount", discountPercent)}` : "";

  const form = new ModalFormData()
    .title(Lang.t(player, "shop.transaction.title", cleanShopLabel(item.name)))
    .dropdown(
      `§e${Lang.t(player, "shop.transaction.item", item.name)}\n` +
      `§a${Lang.t(player, "shop.transaction.buy_price", buyPriceText)}${discountText}\n` +
      `§c${Lang.t(player, "shop.transaction.sell_price", sellPriceText)}\n` +
      `§b${Lang.t(player, "shop.transaction.your_balance", balanceText)}\n` +
      `§6${Lang.t(player, "shop.transaction.in_inventory", inInventory)}\n\n` +
      `§7${Lang.t(player, "shop.transaction.mode_select")}`,
      options,
      { defaultValueIndex: 0 }
    )
    .textField(
      Lang.t(player, "shop.transaction.quantity", SHOP_MAX_QUANTITY),
      Lang.t(player, "shop.transaction.quantity_hint"),
      { defaultValue: "1" }
    );

  const result = await ForceOpen(player, form);
  if (result.canceled) {
    if (typeof onFinish === "function") onFinish();
    return;
  }

  const modeIndex = result.formValues?.[0] ?? 0;
  const qtyRaw = result.formValues?.[1] ?? "1";
  const isBuy = modeIndex === 0;
  const isSellAll = canSell && (inInventory > 0 ? modeIndex === 2 : false);
  const isSell = canSell && modeIndex === 1;

  if (isShopBusy(player)) {
    player.sendMessage("§cTransaction is processing, please wait...");
    try { player.playSound("note.bass"); } catch {}
    if (typeof onFinish === "function") onFinish();
    return;
  }

  let quantity = isSellAll ? inInventory : parseShopQuantity(qtyRaw);
  if (quantity <= 0) {
    player.sendMessage(Lang.t(player, "shop.transaction.invalid_qty"));
    try { player.playSound("note.bass"); } catch {}
    if (typeof onFinish === "function") onFinish();
    return;
  }

  if (isBuy) {
    const totalCost = calcShopTotalCost(finalCost, quantity);
    if (totalCost === null) {
      player.sendMessage("§cTotal cost calculation overflow.");
      try { player.playSound("note.bass"); } catch {}
      if (typeof onFinish === "function") onFinish();
      return;
    }

    const space = hasSpaceForShopPurchase(player, item, quantity);
    if (!space.ok) {
      player.sendMessage(Lang.t(player, "shop.transaction.inventory_full", space.requiredSlots));
      try { player.playSound("note.bass"); } catch {}
      if (typeof onFinish === "function") onFinish();
      return;
    }

    if (currentBal < BigInt(totalCost)) {
      player.sendMessage(Lang.t(player, "shop.transaction.no_balance", `${currencySymbol}${formatItemBalance(totalCost, currencyType)}`));
      try { player.playSound("note.bass"); } catch {}
      if (typeof onFinish === "function") onFinish();
      return;
    }

    if (!beginShopTx(player)) {
      player.sendMessage("§cTransaction busy...");
      if (typeof onFinish === "function") onFinish();
      return;
    }

    if (!removeItemBalance(player, totalCost, currencyType)) {
      endShopTx(player, false);
      player.sendMessage("§cFailed to deduct money.");
      try { player.playSound("note.bass"); } catch {}
      if (typeof onFinish === "function") onFinish();
      return;
    }

    let delivered = 0;
    try {
      if (item.command) {
        delivered = executeShopCommand(player, item, quantity);
      } else if (item.enchantments) {
        const inventory = player.getComponent("inventory");
        if (inventory?.container) {
          const enchants = item.enchantments.split(",");
          for (let i = 0; i < quantity; i++) {
            const book = new ItemStack("minecraft:enchanted_book", 1);
            const enchantComp = book.getComponent("enchantable");
            if (enchantComp?.addEnchantment) {
              for (const ench of enchants) {
                const parts = ench.split(":");
                const lvl = parseInt(parts.pop()) || 1;
                let id = parts.join(":");
                if (id.startsWith("minecraft:")) id = id.substring(10);
                try {
                  enchantComp.addEnchantment({ type: new EnchantmentType(id), level: lvl });
                } catch {}
              }
            }
            const remainder = inventory.container.addItem(book);
            if (remainder) player.dimension.spawnItem(remainder, player.location);
            delivered++;
          }
        }
      } else {
        delivered = giveShopItems(player, item, quantity);
      }
    } catch (e) {
      console.error("[Shop] Item delivery error:", e);
    }

    if (delivered < quantity) {
      const refund = Math.floor((totalCost * (quantity - delivered)) / quantity);
      if (refund > 0) addItemBalance(player, refund, currencyType);
      player.sendMessage("§e[Shop] Partial delivery failure - refund issued.");
    }

    endShopTx(player, true);
    incrementDPBuyCount(item, delivered);
    player.sendMessage(Lang.t(player, "shop.transaction.buy_success", delivered, item.name, `${currencySymbol}${formatItemBalance(totalCost, currencyType)}`));
    try { player.playSound("random.orb"); } catch {}
    if (typeof onFinish === "function") onFinish();
    return;
  }

  if (isSell || isSellAll) {
    if (!canSell) {
      player.sendMessage(Lang.t(player, "shop.transaction.cannot_sell"));
      try { player.playSound("note.bass"); } catch {}
      if (typeof onFinish === "function") onFinish();
      return;
    }

    if (inInventory < quantity) {
      player.sendMessage(Lang.t(player, "shop.transaction.no_items", inInventory));
      try { player.playSound("note.bass"); } catch {}
      if (typeof onFinish === "function") onFinish();
      return;
    }

    const totalEarned = calcShopTotalCost(item.sell, quantity);
    if (totalEarned === null) {
      player.sendMessage("§cInvalid sell total.");
      try { player.playSound("note.bass"); } catch {}
      if (typeof onFinish === "function") onFinish();
      return;
    }

    if (!beginShopTx(player)) {
      player.sendMessage("§cTransaction busy...");
      if (typeof onFinish === "function") onFinish();
      return;
    }

    const container = getInventoryContainer(player);
    if (!container) {
      endShopTx(player, false);
      player.sendMessage("§cFailed to access inventory.");
      if (typeof onFinish === "function") onFinish();
      return;
    }

    let remaining = quantity;
    let removed = 0;
    for (let i = 0; i < container.size && remaining > 0; i++) {
      const slotItem = container.getItem(i);
      if (!slotItem || !matchesShopItem(slotItem.typeId, item)) continue;
      if (slotItem.amount <= remaining) {
        container.setItem(i, undefined);
        remaining -= slotItem.amount;
        removed += slotItem.amount;
      } else {
        container.setItem(i, new ItemStack(slotItem.typeId, slotItem.amount - remaining));
        removed += remaining;
        remaining = 0;
      }
    }

    if (removed !== quantity) {
      if (removed > 0) {
        try { giveShopItems(player, item, removed); } catch {}
      }
      endShopTx(player, false);
      player.sendMessage("§cFailed to remove items from inventory.");
      try { player.playSound("note.bass"); } catch {}
      if (typeof onFinish === "function") onFinish();
      return;
    }

    addItemBalance(player, totalEarned, currencyType);
    endShopTx(player, true);
    player.sendMessage(Lang.t(player, "shop.transaction.sell_success", removed, item.name, `${currencySymbol}${formatItemBalance(totalEarned, currencyType)}`));
    try { player.playSound("random.orb"); } catch {}
    if (typeof onFinish === "function") onFinish();
    return;
  }
}

/**
 * Sell Inventory Menu (Simple UI)
 */
export async function Sell(player, itemPage = 0) {
  loadShopConfig();
  const sellEntries = scanPlayerSellableInventory(player);
  const sellAllData = calculateSellAllValue(player);
  const currencySymbol = getShopCurrencySymbol();
  const moneyLine = getShopMoneyLine(player);

  const form = new ActionFormData()
    .shop()
    .preserveButtonCase()
    .title(`${Lang.t(player, "shop.sell_menu.title")}`)
    .body(
      `§e=== §6${Lang.t(player, "shop.sell_menu.header")} §e===\n` +
      `${moneyLine}\n` +
      `§7${Lang.t(player, "shop.sell_menu.items_count", sellAllData.totalItems, `${currencySymbol}${formatShopBalance(sellAllData.totalValue)}`)}\n` +
      `§7${Lang.t(player, "shop.select_category")}`
    );

  // Button Sell All at top
  if (sellAllData.totalItems > 0) {
    form.button(
      `§a${Lang.t(player, "shop.sell_menu.btn_sell_all", `${currencySymbol}${formatShopBalance(sellAllData.totalValue)}`, sellAllData.totalItems)}`,
      "textures/ui/confirm"
    );
  }

  if (sellEntries.length === 0) {
    form.button(`§c${Lang.t(player, "shop.sell_menu.empty")}\n§7${Lang.t(player, "shop.btn.back")}`, "textures/ui/cancel");
  } else {
    for (const entry of sellEntries) {
      const item = entry.shopItem;
      const amount = entry.amount;
      const currencyType = getEffectiveCurrencyType(item);
      const symbol = currencyType === "coin" ? "Coins " : currencySymbol;
      const totalItemVal = BigInt(item.sell) * BigInt(amount);

      form.button(
        `§f${cleanShopLabel(item.name)}\n§7x${amount} §8| §a${symbol}${formatItemBalance(item.sell, currencyType)} ea §7(Tot: §e${symbol}${formatItemBalance(totalItemVal, currencyType)}§7)`,
        item.textures || "textures/ui/icon_recipe_item"
      );
    }
  }

  form.button(`§b${Lang.t(player, "shop.sell_menu.btn_open_shop")}\n§7${Lang.t(player, "shop.title")}`, "textures/ui/icon_recipe_item");
  form.button(`§c${Lang.t(player, "shop.btn.close")}\n§7${Lang.t(player, "shop.btn.close_desc")}`, "textures/ui/arrow_left");

  const result = await ForceOpen(player, form);
  if (result.canceled) return;

  const hasSellAllBtn = sellAllData.totalItems > 0;
  const selection = result.selection;

  if (hasSellAllBtn && selection === 0) {
    const confirm = new MessageFormData()
      .title("§cConfirm SELL ALL")
      .body(`§7Sell §e${sellAllData.totalItems} §7items for §a${currencySymbol}${formatShopBalance(sellAllData.totalValue)}§7?\n§cThis cannot be undone!`)
      .button1("CONFIRM")
      .button2("CANCEL");
    const cRes = await ForceOpen(player, confirm);
    if (cRes.canceled || cRes.selection === 1) {
      system.runTimeout(() => Sell(player), 5);
      return;
    }
    executeSellAll(player);
    system.runTimeout(() => Sell(player), 20);
    return;
  }

  const offset = hasSellAllBtn ? 1 : 0;
  const itemIndex = selection - offset;

  if (sellEntries.length > 0 && itemIndex >= 0 && itemIndex < sellEntries.length) {
    const chosenEntry = sellEntries[itemIndex];
    return showItemTransaction(player, chosenEntry.shopItem, () => Sell(player));
  }

  if (sellEntries.length === 0 && itemIndex === 0) {
    return Shop(player);
  }

  const actionOffset = (hasSellAllBtn ? 1 : 0) + (sellEntries.length === 0 ? 1 : sellEntries.length);
  const actionIndex = selection - actionOffset;

  if (actionIndex === 0) {
    return Shop(player);
  }
}


