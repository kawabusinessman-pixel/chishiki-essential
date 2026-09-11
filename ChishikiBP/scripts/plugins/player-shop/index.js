import { system, world, ActionFormData, ModalFormData } from '../../core.js';
import { showMemberMenu } from "../../member.js";
import {
 getFullMoney,
 setMoney,
 addMoney,
 removeMoney,
 getFormattedMoney,
} from "../../function/moneySystem.js";
import { applyItemProperties } from "../barter/index.js";
import { Database } from "../../function/Database.js";
import { Lang } from "../../lib/Lang.js";
import { getScoreboardTimestamp } from "../../function/timeSystem.js";
import { PlayerShopDatabase } from "./player_shop_database.js";
import { ChestFormData } from "../../extensions/forms.js";
const offlineMoneyDB = new Database("offline_money");
const playerShopDB = new PlayerShopDatabase();
const marketListings = new Map();
let lastListingId = 0;
let hasInitialized = false;
let isDataLoaded = false;
let lastSaveTime = 0;
const SAVE_INTERVAL = 30000;
const CACHE_DURATION = 5000;
const SHOP_UI_MARKER = "";
const SHOP_MENU_MARKER = "";
const SHOP_ICONS = {
 browse: "textures/ui/magnifying_glass",
 sell: "textures/items/emerald",
 listings: "textures/items/book_writable",
 returns: "textures/items/paper",
 money: "textures/items/gold_ingot",
 cancel: "textures/ui/cancel",
 back: "textures/ui/arrow_left",
};
const MARKET_TAX_RATE = 0.05;
const LISTING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const MARKET_GRID_COLS = 9;
const MARKET_GRID_BACK_SLOT = 45;
const MARKET_GRID_PREV_SLOT = 48;
const MARKET_GRID_INFO_SLOT = 49;
const MARKET_GRID_NEXT_SLOT = 53;
const MARKET_GRID_FRAME_TEXTURE = "minecraft:barrier";
const MARKET_GRID_BACK_TEXTURE = "minecraft:dark_oak_door";
const MARKET_GRID_INFO_TEXTURE = "minecraft:book";
const MARKET_GRID_LISTING_SLOTS = (() => {
  const slots = [];
  for (let row = 1; row <= 4; row++) {
    for (let col = 1; col <= 7; col++) slots.push(row * MARKET_GRID_COLS + col);
  }
  return slots;
})();
const MARKET_GRID_FRAME_SLOTS = (() => {
  const slots = new Set();
  for (let col = 0; col < MARKET_GRID_COLS; col++) {
    slots.add(col);
    slots.add(45 + col);
  }
  for (let row = 1; row <= 4; row++) {
    slots.add(row * MARKET_GRID_COLS);
    slots.add(row * MARKET_GRID_COLS + 8);
  }
  return Array.from(slots);
})();
function getChestPageState(entries, requestedPage = 0) {
  const list = Array.isArray(entries) ? entries : [];
  const pageSize = MARKET_GRID_LISTING_SLOTS.length;
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.max(0, Math.min(Number(requestedPage) || 0, pageCount - 1));
  const start = page * pageSize;
  return {
    entries: list.slice(start, start + pageSize),
    page,
    pageCount,
    start,
  };
}
function getChestDurabilityValue(durability) {
  if (!durability) return 0;
  const percentage = Number(
    durability.durabilityPercentage ??
      ((durability.remainingDurability / durability.maxDurability) * 100),
  );
  if (!Number.isFinite(percentage)) return 0;
  return Math.max(0, Math.min(99, Math.round((percentage / 100) * 99)));
}
function createPlayerShopChest(title, infoLines, pageState) {
  const form = new ChestFormData("double").title(`§r${title}`);
  for (const slot of MARKET_GRID_FRAME_SLOTS) {
    form.button(slot, " ", [], MARKET_GRID_FRAME_TEXTURE, 1, 0, false);
  }
  form.button(
    MARKET_GRID_BACK_SLOT,
    "§cBack",
    ["§7Return to Player Shop"],
    MARKET_GRID_BACK_TEXTURE,
    1,
    0,
    false,
  );
  if (pageState.pageCount > 1) {
    if (pageState.page > 0) {
      form.button(
        MARKET_GRID_PREV_SLOT,
        "§ePrevious Page",
        [`§7Page ${pageState.page}/${pageState.pageCount}`],
        "textures/ui/arrow_left",
        1,
        0,
        false,
      );
    } else {
      form.button(
        MARKET_GRID_PREV_SLOT,
        "§7Previous Page",
        ["§8No previous page"],
        "textures/ui/arrow_left",
        1,
        0,
        false,
      );
    }

    if (pageState.page < pageState.pageCount - 1) {
      form.button(
        MARKET_GRID_NEXT_SLOT,
        "§eNext Page",
        [`§7Page ${pageState.page + 2}/${pageState.pageCount}`],
        "textures/ui/arrow_right",
        1,
        0,
        false,
      );
    } else {
      form.button(
        MARKET_GRID_NEXT_SLOT,
        "§7Next Page",
        ["§8No next page"],
        "textures/ui/arrow_right",
        1,
        0,
        false,
      );
    }
  }
 form.button(
  MARKET_GRID_INFO_SLOT,
  `§fPage ${pageState.page + 1}/${pageState.pageCount}`,
  Array.isArray(infoLines) ? infoLines : [],
  MARKET_GRID_INFO_TEXTURE,
  1,
  0,
  false,
 );
 return form;
}
const playerCache = new Map();
const playerCacheTimeout = new Map();
const uiCache = new Map();
const UI_CACHE_DURATION = 1000;
const BANNED_ITEMS = [
 "minecraft:potion",
 "minecraft:splash_potion",
 "minecraft:lingering_potion",
 "minecraft:enchanted_book",
];
function shopTitle(player, key, ...args) {
 return Lang.t(player, key, ...args);
}
function shopMenuTitle(player, key, ...args) {
 return Lang.t(player, key, ...args);
}
function getListingTaxAmount(price) {
 const numericPrice = Number(price) || 0;
 if (numericPrice <= 0) return 0;
 return Math.ceil(numericPrice * MARKET_TAX_RATE);
}
function getSellerReceives(price) {
 return Math.max((Number(price) || 0) - getListingTaxAmount(price), 0);
}
function ensureListingDefaults(listing) {
 if (!listing) return listing;
 listing.timestamp = Number(listing.timestamp) || getScoreboardTimestamp();
 listing.taxRate = Number(listing.taxRate ?? MARKET_TAX_RATE);
 listing.taxAmount = Number(listing.taxAmount ?? getListingTaxAmount(listing.price));
 listing.expiresAt = Number(listing.expiresAt) || listing.timestamp + LISTING_EXPIRY_MS;
 return listing;
}
function isListingExpired(listing) {
 return getScoreboardTimestamp() >= Number(ensureListingDefaults(listing).expiresAt);
}
function formatTimeLeft(ms) {
 const safeMs = Math.max(Number(ms) || 0, 0);
 const days = Math.floor(safeMs / 86400000);
 const hours = Math.floor((safeMs % 86400000) / 3600000);
 if (days > 0) return `${days}d ${hours}h`;
 const minutes = Math.max(Math.floor((safeMs % 3600000) / 60000), 1);
 return `${hours}h ${minutes}m`;
}
function getListingStatusText(player, listing) {
 const safeListing = ensureListingDefaults(listing);
 if (isListingExpired(safeListing)) {
 return Lang.t(player, "player.shop.listing.expired");
 }
 return Lang.t(
 player,
 "player.shop.listing.expires_in",
 formatTimeLeft(safeListing.expiresAt - getScoreboardTimestamp()),
 );
}
function listingToReturnItem(listing, reason = "expired") {
 ensureListingDefaults(listing);
 return {
 id: listing.id,
 sellerName: listing.sellerName,
 itemTypeId: listing.itemTypeId,
 itemAmount: listing.itemAmount,
 itemData: listing.itemData || 0,
 price: listing.price,
 durabilityData: listing.durabilityData || null,
 enchantments: listing.enchantments || [],
 name: listing.name || "",
 lore: listing.lore || [],
 reason,
 listedAt: listing.timestamp,
 expiresAt: listing.expiresAt,
 returnedAt: getScoreboardTimestamp(),
 };
}
function getReturnedItems() {
 try {
 return playerShopDB.meta.returns || {};
 } catch {
 return {};
 }
}
function getPlayerReturnedItems(playerName) {
 const data = getReturnedItems();
 return Array.isArray(data[playerName]) ? data[playerName] : [];
}
function addReturnedItem(playerName, item) {
 const stack = playerShopDB.getListingItem(item.id);
 playerShopDB.addReturn(playerName, item, stack || item);
}
function removeReturnedItem(playerName, itemId) {
 playerShopDB.removeReturn(playerName, itemId);
}
function processExpiredListings() {
 if (!playerShopDB.isInitialized) return;
 if (!isDataLoaded) {
 try {
 loadMarketListings();
 } catch {}
 }
 let changed = false;
 for (const listing of Array.from(marketListings.values())) {
 ensureListingDefaults(listing);
 if (!isListingExpired(listing)) continue;
 addReturnedItem(listing.sellerName, listingToReturnItem(listing, "expired"));
 marketListings.delete(listing.id);
 playerShopDB.deleteListingItem(listing.id);
 changed = true;
 }
 if (changed) saveMarketListings(true);
}
function getPlayerMoney(player) {
 return getFullMoney(player);
}
const itemVerificationCache = new Map();
const VERIFICATION_CACHE_DURATION = 2000;
function getItemDurability(item) {
 if (!item) return null;
 const durabilityComponent = item.getComponent("minecraft:durability");
 if (!durabilityComponent) return null;
 if (
 typeof durabilityComponent.maxDurability !== "number" ||
 typeof durabilityComponent.damage !== "number"
 ) {
 return null;
 }
 const maxDurability = durabilityComponent.maxDurability;
 const currentDamage = durabilityComponent.damage;
 const remainingDurability = maxDurability - currentDamage;
 const durabilityPercentage = Math.floor(
 (remainingDurability / maxDurability) * 100,
 );
 if (
 currentDamage < 0 ||
 currentDamage > maxDurability ||
 maxDurability <= 0
 ) {
 return null;
 }
 return {
 maxDurability,
 currentDamage,
 remainingDurability,
 durabilityPercentage,
 };
}
function getItemEnchantments(item) {
 if (!item) return [];
 const enchantments = [];
 try {
 const enchantComp = item.getComponent("enchantable");
 if (enchantComp) {
 try {
 const enchants = enchantComp.getEnchantments();
 if (enchants && Array.isArray(enchants)) {
 for (const enchant of enchants) {
 if (enchant && enchant.type && enchant.type.id) {
 enchantments.push({
 id: enchant.type.id,
 level: enchant.level || 1,
 });
 }
 }
 }
 } catch (enchError) {}
 }
 } catch (error) {}
 return enchantments;
}
function getItemCustomName(item) {
 if (!item) return "";
 let customName = "";
 try {
 if (item.nameTag && item.nameTag.length > 0) {
 customName = item.nameTag;
 } else {
 try {
 const nameComp = item.getComponent("minecraft:custom_name");
 if (nameComp && nameComp.name && nameComp.name.length > 0) {
 customName = nameComp.name;
 }
 } catch {}
 }
 } catch {}
 return customName;
}
async function verifyItemInInventory(
 player,
 typeId,
 amount,
 data = 0,
 durabilityData = null,
) {
 const cacheKey = `${player.name}-${typeId}-${amount}-${data}-${durabilityData ? JSON.stringify(durabilityData) : "noDurability"}`;
 const now = Date.now();
 const cachedResult = itemVerificationCache.get(cacheKey);
 if (
 cachedResult &&
 now - cachedResult.timestamp < VERIFICATION_CACHE_DURATION
 ) {
 return cachedResult.result;
 }
 try {
 if (durabilityData) {
 const inventory = player.getComponent("inventory").container;
 let foundAmount = 0;
 for (let i = 0; i < inventory.size; i++) {
 const item = inventory.getItem(i);
 if (!item || item.typeId !== typeId) continue;
 const itemDurability = getItemDurability(item);
 if (
 itemDurability &&
 itemDurability.currentDamage === durabilityData.currentDamage
 ) {
 foundAmount += item.amount;
 if (foundAmount >= amount) {
 itemVerificationCache.set(cacheKey, {
 result: true,
 timestamp: now,
 });
 return true;
 }
 }
 }
 itemVerificationCache.set(cacheKey, { result: false, timestamp: now });
 return false;
 }
 const itemName = typeId.replace("minecraft:", "");
 let testCommand;
 if (itemName === "potion") {
 testCommand = `testfor @s[hasitem={item=${itemName},quantity=${amount}}]`;
 } else {
 testCommand = `testfor @s[hasitem={item=${itemName},quantity=${amount}${data !== 0 ? `,data=${data}` : ""}}]`;
 }
 try {
 await player.runCommand(testCommand);
 itemVerificationCache.set(cacheKey, { result: true, timestamp: now });
 return true;
 } catch {
 itemVerificationCache.set(cacheKey, { result: false, timestamp: now });
 return false;
 }
 } catch {
 return false;
 }
}
let lastItemRemoval = new Map();
const ITEM_REMOVAL_INTERVAL = 500;
async function removeItemFromInventory(
 player,
 typeId,
 amount,
 data = 0,
 durabilityData = null,
) {
 const now = Date.now();
 const lastRemoval = lastItemRemoval.get(player.name) || 0;
 if (now - lastRemoval < ITEM_REMOVAL_INTERVAL) {
 return false;
 }
 try {
 if (durabilityData || typeId.includes(":")) {
 const inventory = player.getComponent("inventory").container;
 let remainingToRemove = amount;
 for (let i = 0; i < inventory.size; i++) {
 const item = inventory.getItem(i);
 if (!item || item.typeId !== typeId) continue;
 if (durabilityData && item.getComponent("minecraft:durability")) {
 const itemDurability = getItemDurability(item);
 if (
 !itemDurability ||
 itemDurability.currentDamage !== durabilityData.currentDamage
 )
 continue;
 }
 const amountToRemove = Math.min(remainingToRemove, item.amount);
 if (amountToRemove === item.amount) {
 inventory.setItem(i, undefined);
 } else {
 item.amount -= amountToRemove;
 inventory.setItem(i, item);
 }
 remainingToRemove -= amountToRemove;
 if (remainingToRemove <= 0) break;
 }
 if (remainingToRemove > 0) {
 return false;
 }
 lastItemRemoval.set(player.name, now);
 clearPlayerCache(player.name);
 return true;
 }
 const itemName = typeId.replace("minecraft:", "");
 let clearCommand;
 if (itemName === "potion") {
 clearCommand = `clear @s ${itemName} 0 ${amount}`;
 } else {
 clearCommand = `clear @s ${itemName} ${data} ${amount}`;
 }
 try {
 await player.runCommand(clearCommand);
 lastItemRemoval.set(player.name, now);
 clearPlayerCache(player.name);
 return true;
 } catch {
 const inventory = player.getComponent("inventory").container;
 let remainingToRemove = amount;
 for (let i = 0; i < inventory.size; i++) {
 const item = inventory.getItem(i);
 if (!item || item.typeId !== typeId) continue;
 const amountToRemove = Math.min(remainingToRemove, item.amount);
 if (amountToRemove === item.amount) {
 inventory.setItem(i, undefined);
 } else {
 item.amount -= amountToRemove;
 inventory.setItem(i, item);
 }
 remainingToRemove -= amountToRemove;
 if (remainingToRemove <= 0) break;
 }
 if (remainingToRemove > 0) {
 return false;
 }
 lastItemRemoval.set(player.name, now);
 clearPlayerCache(player.name);
 return true;
 }
 } catch {
 return false;
 }
}
let lastItemGive = new Map();
const ITEM_GIVE_INTERVAL = 500;
function hasEmptyInventorySlot(player) {
 try {
 const inventory = player.getComponent("inventory").container;
 for (let i = 0; i < inventory.size; i++) if (!inventory.getItem(i)) return true;
 } catch {}
 return false;
}
function giveStoredItemStack(player, storedItem, amount) {
 if (!storedItem?.clone || !hasEmptyInventorySlot(player)) return false;
 try {
 const item = storedItem.clone();
 item.amount = Math.max(1, Math.min(Number(amount) || item.amount, item.amount));
 const left = player.getComponent("inventory").container.addItem(item);
 return !left;
 } catch {
 return false;
 }
}
async function giveItemToPlayer(
 player,
 typeId,
 amount,
 data = 0,
 silent = false,
 durabilityData = null,
 enchantments = [],
 name = "",
 lore = [],
 storedItem = null,
) {
 const now = Date.now();
 const lastGive = lastItemGive.get(player.name) || 0;
 if (now - lastGive < ITEM_GIVE_INTERVAL) {
 return false;
 }
 try {
 const feedbackStatus = silent ? await getFeedbackStatus(player) : null;
 if (silent) {
 await player.runCommand("gamerule sendcommandfeedback false");
 }
 let success = false;
 let itemGiven = false;
 try {
 if (storedItem) itemGiven = giveStoredItemStack(player, storedItem, amount);
 try {
 if (!itemGiven) itemGiven = applyItemProperties(
 player,
 typeId,
 amount,
 data,
 enchantments,
 name,
 lore,
 durabilityData,
 );
 } catch (applyError) {}
 if (!itemGiven) {
 const itemId = typeId.replace("minecraft:", "");
 const dataValue =
 data !== undefined && data !== null
 ? data
 : durabilityData && durabilityData.currentDamage !== undefined
 ? durabilityData.currentDamage
 : 0;
 await player.runCommand(`give @s ${itemId} ${amount} ${dataValue}`);
 itemGiven = true;
 if (name && name.length > 0) {
 try {
 const inventory = player.getComponent("inventory").container;
 for (let i = 0; i < inventory.size; i++) {
 const item = inventory.getItem(i);
 if (item && item.typeId === typeId && item.amount === amount) {
 try {
 item.nameTag = name;
 inventory.setItem(i, item);
 break;
 } catch (nameError) {}
 }
 }
 } catch (invError) {}
 }
 }
 try {
 const container = player.getComponent("inventory").container;
 let foundItem = false;
 for (let i = 0; i < container.size; i++) {
 const item = container.getItem(i);
 if (item && item.typeId === typeId) {
 foundItem = true;
 break;
 }
 }
 success = foundItem;
 } catch (verifyError) {
 success = itemGiven;
 }
 } catch (giveError) {
 success = false;
 }
 if (silent && feedbackStatus !== null) {
 await player.runCommand(`gamerule sendcommandfeedback ${feedbackStatus}`);
 }
 lastItemGive.set(player.name, now);
 clearPlayerCache(player.name);
 return itemGiven || success;
 } catch (error) {
 if (silent) {
 try {
 await player.runCommand("gamerule sendcommandfeedback true");
 } catch {}
 }
 return false;
 }
}
async function getFeedbackStatus(player) {
 try {
 return true;
 } catch {
 return true;
 }
}
function saveMarketListings(force = false) {
 const now = Date.now();
 if (!force && now - lastSaveTime < SAVE_INTERVAL) {
 return;
 }
 try {
 const listingsArray = Array.from(marketListings.values()).map((listing) =>
 ensureListingDefaults(listing),
 );
 if (playerShopDB.isInitialized) {
 playerShopDB.meta.listings = listingsArray;
 playerShopDB.meta.lastListingId = Number(lastListingId) || 0;
 playerShopDB.save();
 }
 world.setDynamicProperty("marketListings", JSON.stringify(listingsArray));
 world.setDynamicProperty("lastListingId", lastListingId);
 lastSaveTime = now;
 } catch {}
}
function loadMarketListings() {
 if (isDataLoaded) return;
 try {
 const dbListings = playerShopDB.isInitialized ? playerShopDB.getListings() : [];
 const savedLastId = playerShopDB.isInitialized ? playerShopDB.getLastListingId() : world.getDynamicProperty("lastListingId");
 if (dbListings.length) {
 marketListings.clear();
 dbListings.forEach((listing) => marketListings.set(listing.id, ensureListingDefaults(listing)));
 } else {
 const listingsJson = world.getDynamicProperty("marketListings");
 if (listingsJson) {
 const listingsArray = JSON.parse(listingsJson);
 marketListings.clear();
 listingsArray.forEach((listing) => {
 marketListings.set(listing.id, ensureListingDefaults(listing));
 });
 }
 }
 if (savedLastId !== undefined) {
 lastListingId = savedLastId;
 }
 isDataLoaded = true;
 } catch {}
}
async function getPlayerData(player) {
 try {
 const now = Date.now();
 const cachedData = playerCache.get(player.name);
 const cacheTimeout = playerCacheTimeout.get(player.name);
 if (cachedData && cacheTimeout && now < cacheTimeout) {
 return cachedData;
 }
 const money = getPlayerMoney(player);
 const inventory = await getPlayerInventory(player);
 const data = {
 money: money,
 inventory: inventory,
 };
 playerCache.set(player.name, data);
 playerCacheTimeout.set(player.name, now + CACHE_DURATION);
 return data;
 } catch {
 return {
 money: 0,
 inventory: [],
 };
 }
}
function clearPlayerCache(playerName) {
 playerCache.delete(playerName);
 playerCacheTimeout.delete(playerName);
}
system.afterEvents.scriptEventReceive.subscribe((event) => {
 if (event.id === "kiwora:PlayerShop") {
 const player = event.sourceEntity;
 if (player) {
 if (!hasInitialized) {
 try {
 loadMarketListings();
 hasInitialized = true;
 } catch {}
 }
 clearPlayerCache(player.name);
 showPlayerShopMenu(player);
 }
 }
});
world.afterEvents.worldLoad.subscribe(() => {
 try {
 loadMarketListings();
 system.runTimeout(processExpiredListings, 60);
 } catch {}
});
system.runInterval(processExpiredListings, 1200);
function isItemBanned(typeId) {
 return BANNED_ITEMS.includes(typeId);
}
class MarketListing {
 constructor(
 seller,
 itemTypeId,
 itemAmount,
 itemData,
 price,
 durabilityData = null,
 enchantments = [],
 name = "",
 lore = [],
 ) {
 this.id = ++lastListingId;
 this.seller = seller;
 this.sellerName = seller.name;
 this.itemTypeId = itemTypeId;
 this.itemAmount = itemAmount;
 this.itemData = itemData || 0;
 this.price = price;
 this.timestamp = getScoreboardTimestamp();
 this.taxRate = MARKET_TAX_RATE;
 this.taxAmount = getListingTaxAmount(price);
 this.expiresAt = this.timestamp + LISTING_EXPIRY_MS;
 this.durabilityData = durabilityData;
 this.enchantments = enchantments;
 this.name = name;
 this.lore = lore;
 }
}
function getCachedUI(key, generator) {
 const now = Date.now();
 const cached = uiCache.get(key);
 if (cached && now - cached.timestamp < UI_CACHE_DURATION) {
 return cached.element;
 }
 const element = generator();
 uiCache.set(key, { element, timestamp: now });
 return element;
}
export function showPlayerShopMenu(player) {
 if (!playerShopDB.isInitialized) {
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 return;
 }
 processExpiredListings();
 const returnedCount = getPlayerReturnedItems(player.name).length;
 const form = new ActionFormData()
  .title(shopMenuTitle(player, "player.shop.title"))
  .body(Lang.t(player, "player.shop.body"))
  .button(Lang.t(player, "player.shop.btn.browse"), SHOP_ICONS.browse)
  .button(Lang.t(player, "player.shop.btn.sell"), SHOP_ICONS.sell)
  .button(Lang.t(player, "player.shop.btn.my_listings"), SHOP_ICONS.listings)
  .button(
   Lang.t(player, "player.shop.btn.returns", returnedCount),
   SHOP_ICONS.returns,
  )
  .button(Lang.t(player, "common.back"), SHOP_ICONS.back);
 form.show(player).then((response) => {
 if (!response.canceled) {
 try {
 switch (response.selection) {
 case 0:
 showMarketplace(player).catch(() => {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.err.open_market")}"}]}`,
 );
 });
 break;
 case 1:
 showSellItemMenu(player).catch(() => {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.err.open_sell")}"}]}`,
 );
 });
 break;
 case 2:
 showMyListingsMenu(player).catch(() => {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.err.open_listings")}"}]}`,
 );
 });
 break;
 case 3:
 showReturnedItemsMenu(player).catch(() => {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.returns.err")}"}]}`,
 );
 });
 break;
 case 4:
 showMemberMenu(player);
 break;
 }
 } catch {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.err.general")}"}]}`,
 );
 }
 }
 });
}
async function showReturnedItemsMenu(player, page = 0) {
 try {
 processExpiredListings();
 const items = getPlayerReturnedItems(player.name).sort((a, b) => b.returnedAt - a.returnedAt);
 const pageState = getChestPageState(items, page);
 const form = createPlayerShopChest(
  shopTitle(player, "player.shop.returns.title"),
  [
   items.length
    ? Lang.t(player, "player.shop.returns.body", items.length)
    : Lang.t(player, "player.shop.returns.empty"),
  ],
  pageState,
 );
 const slotMap = new Map();
 for (let index = 0; index < pageState.entries.length; index++) {
 const item = pageState.entries[index];
 const slot = MARKET_GRID_LISTING_SLOTS[index];
 const itemName = formatItemName({
 typeId: item.itemTypeId,
 data: item.itemData,
 durability: item.durabilityData,
 enchantments: item.enchantments,
 name: item.name,
 });
 form.button(
 slot,
 `§b${itemName}`,
 [
  `§fAmount: §a${item.itemAmount}`,
  `§6${Lang.t(player, "player.shop.returns.reason." + item.reason)}`,
  `§7ID: #${item.id}`,
  "§eClick to claim",
 ],
 item.itemTypeId,
 Math.min(99, Math.max(1, Number(item.itemAmount) || 1)),
 getChestDurabilityValue(item.durabilityData),
 Array.isArray(item.enchantments) && item.enchantments.length > 0,
 );
 slotMap.set(slot, item);
 }
 const response = await form.show(player);
 if (!response || response.canceled || response.selection === MARKET_GRID_BACK_SLOT) {
 showPlayerShopMenu(player);
 return;
 }
 if (response.selection === MARKET_GRID_PREV_SLOT && pageState.page > 0) {
  return showReturnedItemsMenu(player, pageState.page - 1);
 }
 if (response.selection === MARKET_GRID_NEXT_SLOT && pageState.page + 1 < pageState.pageCount) {
  return showReturnedItemsMenu(player, pageState.page + 1);
 }
 const selectedItem = slotMap.get(response.selection);
 if (selectedItem) return showReturnedItemConfirm(player, selectedItem, pageState.page);
 return showReturnedItemsMenu(player, pageState.page);
 } catch {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.returns.err")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 }
}
async function showReturnedItemConfirm(player, item, page = 0) {
 try {
 const itemName = formatItemName({
 typeId: item.itemTypeId,
 data: item.itemData,
 durability: item.durabilityData,
 enchantments: item.enchantments,
 name: item.name,
 });
 const form = new ActionFormData()
 .title(shopTitle(player, "player.shop.returns.claim.title"))
 .body(Lang.t(player, "player.shop.returns.claim.body", itemName, item.itemAmount, item.id))
 .button(Lang.t(player, "player.shop.returns.claim.btn"), SHOP_ICONS.returns)
 .button(`§c${Lang.t(player, "common.back")}`, SHOP_ICONS.back);
 const response = await form.show(player);

 if (response.canceled || response.selection === 1) {
 showReturnedItemsMenu(player, page);
 return;
 }

 await claimReturnedItem(player, item, page);
 } catch {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.returns.err")}"}]}`,
 );
 system.runTimeout(() => showReturnedItemsMenu(player), 20);
 }
}
async function claimReturnedItem(player, item, page = 0) {
 try {
 const items = getPlayerReturnedItems(player.name);
 if (!items.some(entry => entry.id === item.id)) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.returns.claim.err.not_found")}"}]}`,
 );
 system.runTimeout(() => showReturnedItemsMenu(player), 20);
 return;
 }

 const success = await giveItemToPlayer(
 player,
 item.itemTypeId,
 item.itemAmount,
 item.itemData,
 true,
 item.durabilityData,
 item.enchantments,
 item.name,
 item.lore,
 playerShopDB.getReturnItem(item.id),
 );

 if (!success) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.returns.claim.err.give")}"}]}`,
 );
 system.runTimeout(() => showReturnedItemsMenu(player), 20);
 return;
 }

 removeReturnedItem(player.name, item.id);
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.returns.claim.success")}"}]}`,
 );
 player.runCommand(`playsound random.pop @s`);
 showReturnedItemsMenu(player, page);
 } catch (error) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.returns.claim.err.general", error.message)}"}]}`,
 );
 system.runTimeout(() => showReturnedItemsMenu(player), 20);
 }
}
async function getPlayerInventory(player) {
 const inventory = [];
 try {
 const container = player.getComponent("inventory").container;
 for (let i = 0; i < container.size; i++) {
 const item = container.getItem(i);
 if (item) {
 const durabilityInfo = getItemDurability(item);
 const enchantments = getItemEnchantments(item);
 const customName = getItemCustomName(item);
 let lore = [];
 try {
 if (item.getLore && typeof item.getLore === "function") {
 lore = item.getLore();
 }
 } catch {}
 inventory.push({
 typeId: item.typeId,
 amount: item.amount,
 data: item.data,
 slot: i,
 durability: durabilityInfo,
 enchantments: enchantments,
 name: customName,
 lore: lore,
 });
 }
 }
 } catch (error) {}
 return inventory;
}
async function showSellItemMenu(player) {
 try {
 const playerData = await getPlayerData(player);
 if (!playerData || !playerData.inventory) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.sell.err.load_inv")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 return;
 }
 const inventory = playerData.inventory;
 if (inventory.length === 0) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.sell.err.empty_inv")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 return;
 }
 const sellableItems = inventory.filter(
 (item) => !isItemBanned(item.typeId),
 );
 if (sellableItems.length === 0) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.sell.err.no_sellable")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 return;
 }
 await showSelectItemMenu(player, sellableItems);
 } catch {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.err.open_sell")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 }
}
async function showSelectItemMenuFree(player, sellableItems, page = 0) {
 try {
 const pageState = getChestPageState(sellableItems, page);
 const form = createPlayerShopChest(
  shopTitle(player, "player.shop.sell.title"),
  [
   Lang.t(player, "player.shop.sell.body"),
   `§7Items: §f${sellableItems.length}`,
  ],
  pageState,
 );
 const slotMap = new Map();
 pageState.entries.forEach((item, index) => {
 const slot = MARKET_GRID_LISTING_SLOTS[index];
 const itemName = formatItemName(item);
 const lines = [
  `§7Inventory slot: §f${item.slot + 1}`,
  `§7Amount: §a${item.amount}`,
  "§eClick to sell",
 ];
 if (item.durability) lines.splice(2, 0, `§7Durability: §f${item.durability.durabilityPercentage}%`);
 if (item.enchantments?.length > 0) lines.splice(2, 0, `§d${item.enchantments.length} enchantment(s)`);
 form.button(
  slot,
  `§f${itemName}`,
  lines,
  item.typeId,
  Math.min(99, Math.max(1, Number(item.amount) || 1)),
  getChestDurabilityValue(item.durability),
  Array.isArray(item.enchantments) && item.enchantments.length > 0,
 );
 slotMap.set(slot, item);
 });
 const response = await form.show(player);
 if (!response || response.canceled || response.selection === MARKET_GRID_BACK_SLOT) {
 showPlayerShopMenu(player);
 return;
 }
 if (response.selection === MARKET_GRID_PREV_SLOT && pageState.page > 0) {
  return showSelectItemMenuFree(player, sellableItems, pageState.page - 1);
 }
 if (response.selection === MARKET_GRID_NEXT_SLOT && pageState.page + 1 < pageState.pageCount) {
  return showSelectItemMenuFree(player, sellableItems, pageState.page + 1);
 }
 const selectedItem = slotMap.get(response.selection);
 if (selectedItem) {
 showSetPriceAndQuantityMenu(player, selectedItem);
 } else {
 showSelectItemMenuFree(player, sellableItems, pageState.page);
 }
 } catch {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.sell.err.select")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 }
}

async function showSelectItemMenu(player, sellableItems, page = 0) {
 return showSelectItemMenuFree(player, sellableItems, page);
}


function getListingItemStack(player, itemData, amount) {
 try {
 const item = player.getComponent("inventory").container.getItem(itemData.slot)
 if (!item || item.typeId !== itemData.typeId) return null
 const stack = item.clone()
 stack.amount = Math.max(1, Number(amount) || 1)
 return stack
 } catch {
 return null
 }
}
async function showSetPriceAndQuantityMenu(player, selectedItem) {
 const maxQuantity = selectedItem.amount;
 const itemName = formatItemName(selectedItem);
 const form = new ModalFormData()
 .title(shopTitle(player, "player.shop.price.title"))
 .label(Lang.t(player, "player.shop.price.item", itemName, maxQuantity))
 .slider(Lang.t(player, "player.shop.price.quantity"), 1, maxQuantity, {
 defaultValue: Math.min(maxQuantity, 64),
 valueStep: 1,
 tooltip: "§bSelect how many items to sell",
 })
 .textField(Lang.t(player, "player.shop.price.price"), Lang.t(player, "player.shop.price.placeholder"), {
 defaultValue: "",
 placeholder: Lang.t(player, "player.shop.price.placeholder"),
 tooltip: "§bSet the selling price",
 });
 form.show(player).then(async (response) => {
 if (response.canceled) {
 getPlayerInventory(player).then((inventory) => {
 const filteredItems = inventory.filter(
 (item) => !isItemBanned(item.typeId),
 );
 showSelectItemMenu(player, filteredItems);
 });
 return;
 }
 const [amountValue, priceText] = response.formValues.slice(-2);
 const amount = Number(amountValue);
 const price = parseInt(priceText);
 if (isNaN(price) || price <= 0) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.price.err.invalid")}"}]}`,
 );
 system.runTimeout(
 () => showSetPriceAndQuantityMenu(player, selectedItem),
 20,
 );
 return;
 }
 const taxAmount = getListingTaxAmount(price);
 const sellerReceives = getSellerReceives(price);
 const currentInventory = await getPlayerInventory(player);
 const currentItem = currentInventory.find(
 (item) =>
 item.typeId === selectedItem.typeId &&
 item.data === selectedItem.data &&
 ((!selectedItem.durability && !item.durability) ||
 (selectedItem.durability &&
 item.durability &&
 selectedItem.durability.currentDamage ===
 item.durability.currentDamage)),
 );
 if (!currentItem) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.price.err.not_found")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 return;
 }
 if (amount > currentItem.amount) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.price.err.not_enough", currentItem.amount)}"}]}`,
 );
 getPlayerInventory(player).then((inventory) => {
 const filteredItems = inventory.filter(
 (item) => !isItemBanned(item.typeId),
 );
 system.runTimeout(() => showSelectItemMenu(player, filteredItems), 20);
 });
 return;
 }
 if (
 !(await verifyItemInInventory(
 player,
 selectedItem.typeId,
 amount,
 selectedItem.data || 0,
 selectedItem.durability,
 ))
 ) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.price.err.not_found")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 return;
 }
  try {
  const listingStack = getListingItemStack(player, currentItem, amount);
  const listing = new MarketListing(
  player,
  selectedItem.typeId,
  amount,
  selectedItem.data || 0,
  price,
  selectedItem.durability,
  selectedItem.enchantments || [],
  selectedItem.name || "",
  selectedItem.lore || [],
  );
  if (!playerShopDB.isInitialized || !playerShopDB.setListingItem(listing.id, listingStack || listing)) {
  throw new Error("Listing item could not be committed to storage");
  }
  const success = await removeItemFromInventory(
 player,
 selectedItem.typeId,
 amount,
 selectedItem.data || 0,
 selectedItem.durability,
  );
  if (!success) {
  playerShopDB.deleteListingItem(listing.id);
  player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.price.err.remove")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 return;
 }
  marketListings.set(listing.id, listing);
 saveMarketListings(true);
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.list.success", listing.id)} ${Lang.t(player, "player.shop.list.tax", taxAmount, sellerReceives)}"}]}`,
 );
 player.runCommand(`playsound random.levelup @s`);
 for (const onlinePlayer of world.getPlayers()) {
 if (onlinePlayer.name !== player.name) {
 onlinePlayer.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(onlinePlayer, "player.shop.list.broadcast", player.name, formatItemName(selectedItem), amount, price)}"}]}`,
 );
 }
 }
 showPlayerShopMenu(player);
 } catch (error) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c? Error when selling: ${error.message}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 }
 });
}
async function showMarketplace(player, page = 0) {
 try {
 if (!isDataLoaded) {
 try {
 loadMarketListings();
 } catch {}
 }
 processExpiredListings();
 const playerData = await getPlayerData(player);
 const money = playerData?.money || 0;
 const validListings = Array.from(marketListings.values())
 .map((listing) => ensureListingDefaults(listing))
 .filter((listing) => listing.sellerName !== player.name && !isListingExpired(listing))
 .sort((a, b) => b.timestamp - a.timestamp);
 const pageState = getChestPageState(validListings, page);
 const form = createPlayerShopChest(
  shopTitle(player, "player.shop.market.title"),
  [
   validListings.length
    ? Lang.t(player, "player.shop.market.body", validListings.length, money)
    : Lang.t(player, "player.shop.market.empty"),
   `§7Balance: §a${money}`,
  ],
  pageState,
 );
 const slotMap = new Map();
 pageState.entries.forEach((listing, index) => {
 const slot = MARKET_GRID_LISTING_SLOTS[index];
 const itemName = formatItemName({
 typeId: listing.itemTypeId,
 data: listing.itemData,
 durability: listing.durabilityData,
 });
 form.button(
 slot,
 `§b${itemName}`,
 [
  `§fAmount: §a${listing.itemAmount}`,
  `§a${Lang.t(player, "player.shop.price.price")}: §f${listing.price}`,
  `§6${getListingStatusText(player, listing)}`,
  `§dSeller: ${listing.sellerName}`,
  "§eClick to buy",
 ],
 listing.itemTypeId,
 Math.min(99, Math.max(1, Number(listing.itemAmount) || 1)),
 getChestDurabilityValue(listing.durabilityData),
 Array.isArray(listing.enchantments) && listing.enchantments.length > 0,
 );
 slotMap.set(slot, listing);
 });
 const response = await form.show(player);
 if (!response || response.canceled || response.selection === MARKET_GRID_BACK_SLOT) {
 showPlayerShopMenu(player);
 return;
 }
 if (response.selection === MARKET_GRID_PREV_SLOT && pageState.page > 0) {
  return showMarketplace(player, pageState.page - 1);
 }
 if (response.selection === MARKET_GRID_NEXT_SLOT && pageState.page + 1 < pageState.pageCount) {
  return showMarketplace(player, pageState.page + 1);
 }
 const selectedListing = slotMap.get(response.selection);
 if (selectedListing) return showBuyConfirmation(player, selectedListing, pageState.page);
 return showMarketplace(player, pageState.page);
 } catch {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.market.err")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 }
}
async function showBuyConfirmation(player, listing, page = 0) {
 try {
 if (listing.sellerName === player.name) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.own_item")}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player, page), 20);
 return;
 }
 ensureListingDefaults(listing);
 if (isListingExpired(listing)) {
 processExpiredListings();
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.expired")}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player, page), 20);
 return;
 }
 const playerData = await getPlayerData(player);
 const money = playerData?.money || 0;
 const itemName = formatItemName({
 typeId: listing.itemTypeId,
 data: listing.itemData,
 durability: listing.durabilityData,
 enchantments: listing.enchantments,
 });
 let enchantmentText = "";
 if (listing.enchantments && listing.enchantments.length > 0) {
 enchantmentText = Lang.t(player, "player.shop.buy.enchantments");
 listing.enchantments.forEach((ench) => {
 enchantmentText += Lang.t(player, "player.shop.buy.enchantment", ench.id.replace("minecraft:", ""), ench.level);
 });
 }
 const form = getCachedUI(`buyConfirmation-${listing.id}`, () => {
 const taxInfo = Lang.t(
 player,
 "player.shop.buy.tax",
 getListingTaxAmount(listing.price),
 getSellerReceives(listing.price),
 getListingStatusText(player, listing),
 );
 const balanceStatus = money < listing.price
 ? "§c? " + Lang.t(player, "player.shop.buy.err.no_money", listing.price)
 : "§a? " + Lang.t(player, "player.shop.buy.success", itemName, listing.itemAmount);
 return new ActionFormData()
 .title(shopTitle(player, "player.shop.buy.title"))
 .body(Lang.t(player, "player.shop.buy.body", itemName, listing.itemAmount, listing.price, listing.sellerName, `${enchantmentText}${taxInfo}`, money, balanceStatus))
 .button("§a" + Lang.t(player, "player.shop.buy.title"), SHOP_ICONS.money)
 .button("§c" + Lang.t(player, "common.close"), SHOP_ICONS.cancel);
 });
 form.show(player).then((response) => {
 if (response.canceled || response.selection === 1) {
 showMarketplace(player, page);
 return;
 }
 if (response.selection === 0) {
 buyItem(player, listing);
 }
 });
 } catch {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.confirm")}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player, page), 20);
 }
}
function saveOfflineTransaction(
 sellerName,
 amount,
 buyerName,
 itemTypeId,
 itemAmount,
 itemData,
) {
 try {
 const amountStr = String(amount);
 console.warn(
 `[MARKET DEBUG] Saving offline transaction for ${sellerName}: ${amountStr} Money from ${buyerName}`,
 );
 let offlineTransactions = offlineMoneyDB.get("transactions", {});
 if (!offlineTransactions[sellerName]) {
 offlineTransactions[sellerName] = {
 pendingMoney: 0,
 transactions: [],
 };
 }
 const currentPending =
 Number(offlineTransactions[sellerName].pendingMoney) || 0;
 const amountToAdd = Number(amount) || 0;
 offlineTransactions[sellerName].pendingMoney = currentPending + amountToAdd;
 offlineTransactions[sellerName].transactions.push({
 buyerName: buyerName,
 amount: amountToAdd,
 itemTypeId: itemTypeId,
 itemAmount: itemAmount,
 itemData: itemData,
 timestamp: Date.now(),
 });
 if (offlineTransactions[sellerName].transactions.length > 20) {
 offlineTransactions[sellerName].transactions =
 offlineTransactions[sellerName].transactions.slice(-20);
 }
 offlineMoneyDB.set("transactions", offlineTransactions);
 savePendingNotification(
 sellerName,
 buyerName,
 amount,
 itemTypeId,
 itemAmount,
 itemData,
 );
 return true;
 } catch (error) {
 console.warn("Error saving offline transaction:", error);
 return false;
 }
}
function savePendingNotification(
 sellerName,
 buyerName,
 amount,
 itemTypeId,
 itemAmount,
 itemData,
) {
 try {
 return true;
 } catch (error) {
 console.warn("Error saving notification:", error);
 return false;
 }
}
function checkOfflineTransactions(player) {
 try {
 if (!player || typeof player !== "object") return false;
 let playerName;
 try {
 playerName = player.name;
 } catch {
 return false;
 }
 if (!playerName || typeof playerName !== "string") return false;
 const offlineTransactions = offlineMoneyDB.get("transactions", {});
 if (
 offlineTransactions[playerName] &&
 offlineTransactions[playerName].pendingMoney > 0
 ) {
 const pendingData = offlineTransactions[playerName];
 const pendingAmount = pendingData.pendingMoney;
 const transactions = pendingData.transactions || [];
 const amountStr = String(pendingAmount);
 console.warn(
 `[MARKET DEBUG] Processing offline money for ${playerName}: ${amountStr}`,
 );
 try {
 try {
 if (!player.name) return false;
 } catch {
 return false;
 }
 const amountToAdd = BigInt(amountStr);
 const success = addMoney(player, amountToAdd);
 if (success) {
 delete offlineTransactions[playerName];
 offlineMoneyDB.set("transactions", offlineTransactions);
 try {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.offline.received", amountStr)}"}]}`,
 );
 player.runCommand(`playsound random.levelup @s`);
 } catch {}
 if (transactions.length > 0) {
 system.runTimeout(() => {
 try {
 if (!player.name) return;
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.offline.details")}"}]}`,
 );
 for (let i = 0; i < Math.min(transactions.length, 5); i++) {
 const tx = transactions[i];
 const itemName = formatItemName({
 typeId: tx.itemTypeId,
 data: tx.itemData,
 });
 system.runTimeout(
 () => {
 try {
 if (!player.name) return;
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.offline.transaction", tx.buyerName, itemName, tx.itemAmount, tx.amount)}"}]}`,
 );
 } catch {}
 },
 20 * (i + 1),
 );
 }
 if (transactions.length > 5) {
 system.runTimeout(() => {
 try {
 if (!player.name) return;
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.offline.more", transactions.length - 5)}"}]}`,
 );
 } catch {}
 }, 20 * 6);
 }
 } catch {}
 }, 40);
 }
 return true;
 } else {
 console.warn(`[MARKET] Failed to add offline money to ${playerName}`);
 return false;
 }
 } catch (conversionError) {
 console.warn(
 `[MARKET] Error converting money amount for ${playerName}:`,
 conversionError,
 );
 try {
 try {
 if (!player.name) return false;
 } catch {
 return false;
 }
 const numericAmount = Number(pendingAmount);
 if (!isNaN(numericAmount) && numericAmount > 0) {
 const success = addMoney(player, numericAmount);
 if (success) {
 delete offlineTransactions[playerName];
 offlineMoneyDB.set("transactions", offlineTransactions);
 try {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.offline.received", numericAmount)}"}]}`,
 );
 player.runCommand(`playsound random.levelup @s`);
 } catch {}
 return true;
 }
 }
 } catch (fallbackError) {
 console.warn(
 `[MARKET] Fallback error for ${playerName}:`,
 fallbackError,
 );
 }
 return false;
 }
 }
 return false;
 } catch (error) {
 console.warn("Error checking offline transactions:", error);
 return false;
 }
}
function showPendingNotifications(player) {
 try {
 return false;
 } catch (error) {
 console.warn("Error showing notifications:", error);
 return false;
 }
}
world.afterEvents.playerSpawn.subscribe((event) => {
 const player = event.player;
 if (!player) return;
 system.runTimeout(() => {
 try {
 if (!player || typeof player !== "object") return;
 try {
 if (!player.name) return;
 } catch {
 return;
 }
 checkOfflineTransactions(player);
 showPendingNotifications(player);
 processExpiredListings();
 const returnedCount = getPlayerReturnedItems(player.name).length;
 if (returnedCount > 0) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.returns.notify", returnedCount)}"}]}`,
 );
 }
 } catch {}
 }, 60);
});
async function buyItem(player, listing) {
 if (!marketListings.has(listing.id)) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.not_available")}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player), 20);
 return;
 }
 if (listing.sellerName === player.name) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.own_item")}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player), 20);
 return;
 }
 ensureListingDefaults(listing);
 if (isListingExpired(listing)) {
 processExpiredListings();
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.expired")}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player), 20);
 return;
 }
 const seller = world.getPlayers({ name: listing.sellerName })[0];
 const playerMoney = getPlayerMoney(player);
 const price = listing.price;
 let priceBigInt;
 try {
 priceBigInt = BigInt(price);
 } catch (error) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c? Invalid price format. Please report this to an admin."}]}`,
 );
 system.runTimeout(() => showMarketplace(player), 20);
 return;
 }
 if (playerMoney < priceBigInt) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.no_money", price)}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player), 20);
 return;
 }
 let moneyDebited = false;
 let itemDelivered = false;
 let transactionCommitted = false;
 try {
 const moneyRemoveSuccess = removeMoney(player, price);
 if (!moneyRemoveSuccess) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.payment")}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player), 20);
 return;
 }
 moneyDebited = true;
 const success = await giveItemToPlayer(
 player,
 listing.itemTypeId,
 listing.itemAmount,
 listing.itemData,
 true,
 listing.durabilityData,
 listing.enchantments,
 listing.name,
 listing.lore,
 playerShopDB.getListingItem(listing.id),
 );
 let itemFound = false;
 try {
 const container = player.getComponent("inventory").container;
 for (let i = 0; i < container.size; i++) {
 const item = container.getItem(i);
 if (item && item.typeId === listing.itemTypeId) {
 itemFound = true;
 break;
 }
 }
 } catch (invError) {}
 if (!success && !itemFound) {
 addMoney(player, price);
 moneyDebited = false;
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.give_item")}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player), 20);
 return;
 }
 itemDelivered = true;
 let paymentSuccess = true;
 const sellerReceives = getSellerReceives(price);
 if (seller) {
 try {
 const addMoneySuccess = addMoney(seller, sellerReceives);
 if (addMoneySuccess) {
 seller.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(seller, "player.shop.seller.msg", player.name, formatItemName({ typeId: listing.itemTypeId, data: listing.itemData }), listing.itemAmount, sellerReceives)} ${Lang.t(seller, "player.shop.seller.tax", getListingTaxAmount(price))}"}]}`,
 );
 seller.runCommand(`playsound random.orb @s`);
 } else {
 console.warn(
 `[MARKET] Failed to add money to online seller ${seller.name}`,
 );
 paymentSuccess = false;
 }
 } catch (moneyError) {
 console.warn(
 `[MARKET] Error adding money to online seller:`,
 moneyError,
 );
 paymentSuccess = false;
 }
 } else {
 try {
 paymentSuccess = saveOfflineTransaction(
 listing.sellerName,
 sellerReceives,
 player.name,
 listing.itemTypeId,
 listing.itemAmount,
 listing.itemData,
 );
 if (!paymentSuccess) {
 console.warn(
 `[MARKET] Failed to save offline transaction for ${listing.sellerName}`,
 );
 }
 } catch (offlineError) {
 console.warn(
 `[MARKET] Error saving offline transaction:`,
 offlineError,
 );
 paymentSuccess = false;
 }
 }
 if (!paymentSuccess) {
 addMoney(player, price);
 moneyDebited = false;
 if (itemDelivered) {
 try {
 await removeItemFromInventory(
 player,
 listing.itemTypeId,
 listing.itemAmount,
 listing.itemData,
 listing.durabilityData,
 );
 itemDelivered = false;
 } catch {}
 }
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.payment_seller")}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player), 20);
 return;
 }
 marketListings.delete(listing.id);
 playerShopDB.deleteListingItem(listing.id);
 saveMarketListings(true);
 transactionCommitted = true;
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.success", formatItemName({ typeId: listing.itemTypeId, data: listing.itemData }), listing.itemAmount)}"}]}`,
 );
 player.runCommand(`playsound random.levelup @s`);
 showPlayerShopMenu(player);
 } catch (error) {
 try {
 if (!transactionCommitted) {
 if (moneyDebited) addMoney(player, price);
 if (itemDelivered) {
 await removeItemFromInventory(
 player,
 listing.itemTypeId,
 listing.itemAmount,
 listing.itemData,
 listing.durabilityData,
 );
 }
 marketListings.set(listing.id, listing);
 if (playerShopDB.isInitialized && !playerShopDB.getListingItem(listing.id)) playerShopDB.setListingItem(listing.id, listing);
 saveMarketListings(true);
 }
 } catch {}
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.buy.err.general", error.message)}"}]}`,
 );
 system.runTimeout(() => showMarketplace(player), 20);
 }
}
async function showMyListingsMenu(player, page = 0) {
 try {
 if (!isDataLoaded) {
 try {
 loadMarketListings();
 } catch {}
 }
 processExpiredListings();
 const myListings = Array.from(marketListings.values())
 .map((listing) => ensureListingDefaults(listing))
 .filter((listing) => listing.sellerName === player.name)
 .sort((a, b) => b.timestamp - a.timestamp);
 const pageState = getChestPageState(myListings, page);
 const form = createPlayerShopChest(
  shopTitle(player, "player.shop.my_listings.title"),
  [
   myListings.length
    ? Lang.t(player, "player.shop.my_listings.body", myListings.length)
    : Lang.t(player, "player.shop.my_listings.empty"),
  ],
  pageState,
 );
 const slotMap = new Map();
 pageState.entries.forEach((listing, index) => {
 const slot = MARKET_GRID_LISTING_SLOTS[index];
 const itemName = formatItemName({
 typeId: listing.itemTypeId,
 data: listing.itemData,
 durability: listing.durabilityData,
 });
 form.button(
 slot,
 `§b${itemName}`,
 [
  `§fAmount: §a${listing.itemAmount}`,
  `§a${Lang.t(player, "player.shop.price.price")}: §f${listing.price}`,
  `§6${getListingStatusText(player, listing)}`,
  `§7ID: #${listing.id}`,
  "§eClick to manage",
 ],
 listing.itemTypeId,
 Math.min(99, Math.max(1, Number(listing.itemAmount) || 1)),
 getChestDurabilityValue(listing.durabilityData),
 Array.isArray(listing.enchantments) && listing.enchantments.length > 0,
 );
 slotMap.set(slot, listing);
 });
 const response = await form.show(player);
 if (!response || response.canceled || response.selection === MARKET_GRID_BACK_SLOT) {
 showPlayerShopMenu(player);
 return;
 }
 if (response.selection === MARKET_GRID_PREV_SLOT && pageState.page > 0) {
  return showMyListingsMenu(player, pageState.page - 1);
 }
 if (response.selection === MARKET_GRID_NEXT_SLOT && pageState.page + 1 < pageState.pageCount) {
  return showMyListingsMenu(player, pageState.page + 1);
 }
 const selectedListing = slotMap.get(response.selection);
 if (selectedListing) return showListingManagement(player, selectedListing, pageState.page);
 return showMyListingsMenu(player, pageState.page);
 } catch {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.my_listings.err")}"}]}`,
 );
 system.runTimeout(() => showPlayerShopMenu(player), 20);
 }
}
async function showListingManagement(player, listing, page = 0) {
 try {
 const itemName = formatItemName({
 typeId: listing.itemTypeId,
 data: listing.itemData,
 durability: listing.durabilityData,
 });
 const form = getCachedUI(`listingManagement-${listing.id}`, () => {
 return new ActionFormData()
 .title(shopTitle(player, "player.shop.manage.title"))
 .body(`${Lang.t(player, "player.shop.manage.body", itemName, listing.itemAmount, listing.price, listing.id)}\n${Lang.t(player, "player.shop.manage.tax", getListingTaxAmount(listing.price), getSellerReceives(listing.price), getListingStatusText(player, listing))}`)
 .button(Lang.t(player, "player.shop.manage.btn.cancel"), SHOP_ICONS.cancel)
 .button(Lang.t(player, "player.shop.manage.btn.modify"), SHOP_ICONS.money)
 .button(`§a${Lang.t(player, "common.back")}`, SHOP_ICONS.back);
 });
 form.show(player).then(async (response) => {
 if (response.canceled) {
 showMyListingsMenu(player, page).catch(() => {});
 return;
 }
 if (response.selection === 0) {
 cancelAndRetrieveItem(player, listing).catch(() => {});
 } else if (response.selection === 1) {
 showModifyPriceMenu(player, listing, page);
 } else {
 showMyListingsMenu(player, page).catch(() => {});
 }
 });
 } catch {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.manage.err")}"}]}`,
 );
 system.runTimeout(() => showMyListingsMenu(player), 20);
 }
}
async function cancelAndRetrieveItem(player, listing) {
 try {
 if (!marketListings.has(listing.id)) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.cancel.err.not_found")}"}]}`,
 );
 system.runTimeout(() => showMyListingsMenu(player), 20);
 return;
 }
 const success = await giveItemToPlayer(
 player,
 listing.itemTypeId,
 listing.itemAmount,
 listing.itemData,
 true,
 listing.durabilityData,
 listing.enchantments,
 listing.name,
 listing.lore,
 playerShopDB.getListingItem(listing.id),
 );
 if (!success) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.cancel.err.return")}"}]}`,
 );
 system.runTimeout(() => showMyListingsMenu(player), 20);
 return;
 }
 marketListings.delete(listing.id);
 playerShopDB.deleteListingItem(listing.id);
 saveMarketListings(true);
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.cancel.success")}"}]}`,
 );
 player.runCommand(`playsound random.pop @s`);
 showMyListingsMenu(player);
 } catch (error) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.cancel.err.general", error.message)}"}]}`,
 );
 system.runTimeout(() => showMyListingsMenu(player), 20);
 }
}
async function showModifyPriceMenu(player, listing, page = 0) {
 try {
 const form = new ModalFormData()
 .title(shopTitle(player, "player.shop.modify.title"))
 .textField(
 Lang.t(player, "player.shop.modify.label"),
 Lang.t(player, "player.shop.modify.placeholder"),
 {
 defaultValue: String(listing.price),
 placeholder: Lang.t(player, "player.shop.modify.placeholder"),
 tooltip: "§bEnter the new price for this item",
 },
 );
 form.show(player).then((response) => {
 if (response.canceled) {
 showListingManagement(player, listing, page).catch(() => {});
 return;
 }
 const [newPriceText] = response.formValues;
 const newPrice = parseInt(newPriceText);
 if (isNaN(newPrice) || newPrice <= 0) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.modify.err.invalid")}"}]}`,
 );
 system.runTimeout(() => showListingManagement(player, listing, page), 20);
 return;
 }
 listing.price = newPrice;
 listing.taxAmount = getListingTaxAmount(newPrice);
 listing.taxRate = MARKET_TAX_RATE;
 saveMarketListings(true);
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.modify.success")}"}]}`,
 );
 player.runCommand(`playsound random.orb @s`);
 showListingManagement(player, listing, page).catch(() => {});
 });
 } catch {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${Lang.t(player, "player.shop.modify.err")}"}]}`,
 );
 system.runTimeout(() => showMyListingsMenu(player), 20);
 }
}
function formatItemName(item) {
 let name = "";
 if (item.name && item.name.length > 0) {
 name = item.name;
 } else {
 name = item.typeId
 .replace("minecraft:", "")
 .split("_")
 .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
 .join(" ");
 }
 if (item.durability) {
 const durabilityPercent =
 item.durability.durabilityPercentage ||
 Math.floor(
 (item.durability.remainingDurability / item.durability.maxDurability) *
 100,
 );
 let durabilityColor = "§a";
 if (durabilityPercent < 30) durabilityColor = "§c";
 else if (durabilityPercent < 70) durabilityColor = "§e";
 name += ` ${durabilityColor}[${durabilityPercent}%]§r`;
 }
 if (item.enchantments && item.enchantments.length > 0) {
 name += ` §b?`;
 }
 return name;
}
