import { world, ActionFormData, ModalFormData, MessageFormData } from "../core.js";
import { GlobalConfig } from "../function/GlobalConfig.js";
import { Lang } from "../lib/Lang.js";
import { custom_content } from "../extensions/constants.js";
import { resolveActionFormItemIcon, resolveActionFormItemIconFromStack, coalesceItemIconTexture } from "../lib/itemIconTexture.js";
import { showMainMenu } from "../kiwora";
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
 itemFarm,
 itemFood,
 itemOres,
 itemSpawner,
 itemEnchantedBook,
} from "../menu_member/config_shop.js";
let shopMenuReturnCallback = null;
const DB_PREFIX = {
 CATEGORY: "kategori_db_kt",
 ITEM: "item_db_kt",
};
const MAX_ITEMS_PER_DB = 50;
const MAX_CATEGORIES_PER_DB = 6;
const MAX_DB_SIZE = 32767;
const SHOP_SETTINGS_PROPERTY = "shop_settings_config";
const DEFAULT_SHOP_SETTINGS = {
 currency: "money",
 currencySymbol: "$",
 currencyName: "Money",
 currencyMode: "money",
};
let shopSettings = { ...DEFAULT_SHOP_SETTINGS };


function shopBtn(title, subtitle) {
 const line = String(title ?? "").replace(/§l/g, "").trim();
 if (!subtitle) return line;
 const sub = String(subtitle).replace(/§l/g, "").trim();
 
 const short = sub.length > 20 ? `${sub.slice(0, 18)}…` : sub;
 return `${line}\n§8${short}`;
}

function shopField(label, hint) {
 const line = String(label ?? "").replace(/§l/g, "");
 return hint ? `${line}\n§8${hint}` : line;
}

function normalizeItemIdInput(raw) {
 const s = String(raw ?? "").trim();
 if (!s) return "";
 return s.includes(":") ? s : `minecraft:${s}`;
}

function formatTypeIdName(typeId) {
 return String(typeId).replace(/^.*:/, "").replace(/_/g, " ")
 .replace(/\b\w/g, (c) => c.toUpperCase());
}

function guessItemTexture(typeId, stack = null) {
 if (stack) return resolveActionFormItemIconFromStack(stack);
 return resolveActionFormItemIcon(typeId);
}

function normalizeShopItem(item) {
 if (!item || typeof item !== "object") return null;
 const itemId = normalizeItemIdInput(item.item || item.id || (item.command ? "minecraft:command_block" : ""));
 if (!itemId && !item.command) return null;
 const actualItemId = itemId || "minecraft:command_block";
 const defaultTexture = item.command ? "textures/blocks/command_block" : "";
 const normalized = {
  name: String(item.name ?? (item.command ? "Custom Command" : formatTypeIdName(actualItemId))),
  item: actualItemId,
  textures: coalesceItemIconTexture(actualItemId, item.textures || defaultTexture),
  cost: Math.max(0, parseInt(item.cost) || 0),
  sell: Math.max(0, parseInt(item.sell) || 0),
  data: Math.max(0, parseInt(item.data) || 0),
  currencyType: item.currencyType === "coin" ? "coin" : "money",
 };
 if (item.notsold || item.command) normalized.notsold = true;
 if (item.enchantments) normalized.enchantments = String(item.enchantments);
 if (item.command) normalized.command = String(item.command);
 return normalized;
}

function writeShopBackup() {
 try {
 world.setDynamicProperty("shopConfigBackup", JSON.stringify({
 categories: shopConfig.categories,
 items: shopConfig.items,
 meta: dbMeta,
 }));
 } catch { }
}

function loadShopBackup() {
 try {
 const raw = world.getDynamicProperty("shopConfigBackup");
 if (!raw) return false;
 const backup = JSON.parse(raw);
 if (!backup?.categories?.length || !backup?.items) return false;
 shopConfig.categories = backup.categories;
 shopConfig.items = backup.items;
 if (backup.meta) dbMeta = backup.meta;
 return true;
 } catch {
 return false;
 }
}

function collectInventoryShopItems(player) {
 try {
 const container = player.getComponent("inventory")?.container;
 if (!container) return [];
 const seen = new Set();
 const out = [];
 for (let i = 0; i < container.size; i++) {
 const stack = container.getItem(i);
 if (!stack?.typeId || stack.typeId === "minecraft:air") continue;
 const itemData = stack.data ?? 0;
 const key = `${stack.typeId}:${itemData}`;
 if (seen.has(key)) continue;
 seen.add(key);
 out.push({
 typeId: stack.typeId,
 name: stack.nameTag?.trim() || formatTypeIdName(stack.typeId),
 textures: resolveActionFormItemIconFromStack(stack),
 data: itemData,
 stack,
 });
 }
 return out;
 } catch {
 return [];
 }
}

async function pickInventoryShopItem(player) {
 const items = collectInventoryShopItems(player);
 if (!items.length) return null;
 const form = new ModalFormData()
 .title("Add from Inventory")
 .dropdown(
 shopField("Pick item", "From your inventory"),
 items.map((it) => `${it.name} (${it.typeId})`),
 { defaultValueIndex: 0 },
 );
 const res = await form.show(player);
 if (res.canceled) return null;
 return items[res.formValues[0]];
}

function loadShopSettings() {
 try {
 const saved = world.getDynamicProperty(SHOP_SETTINGS_PROPERTY);
 if (saved) {
 const parsed = JSON.parse(saved);
 shopSettings = { ...DEFAULT_SHOP_SETTINGS, ...parsed };
 }
 } catch (e) {
 console.warn("[Shop Settings] Error loading settings:", e);
 shopSettings = { ...DEFAULT_SHOP_SETTINGS };
 }
 return shopSettings;
}
function saveShopSettings() {
 try {
 world.setDynamicProperty(SHOP_SETTINGS_PROPERTY, JSON.stringify(shopSettings));
 return true;
 } catch (e) {
 console.warn("[Shop Settings] Error saving settings:", e);
 return false;
 }
}
export function getShopCurrency() {
 loadShopSettings();
 return shopSettings.currency || "money";
}
export function getShopCurrencySymbol() {
 loadShopSettings();
 return shopSettings.currencySymbol || "$";
}
export function getShopCurrencyName() {
 loadShopSettings();
 return shopSettings.currencyName || "Money";
}
export function getShopCurrencyMode() {
 loadShopSettings();
 return shopSettings.currencyMode || "money";
}
const DEFAULT_SHOP_CONFIG = {
 categories: [
 {
 id: "blocks",
 name: "§l§0(§1§lBLOCKS§l§0)",
 icon: "textures/blocks/cobblestone.png",
 enabled: true,
 },
 {
 id: "wool",
 name: "§l§0(§2§lWOOL§l§0)",
 icon: "textures/blocks/wool_colored_white.png",
 enabled: true,
 },
 {
 id: "wood",
 name: "§l§0(§3§lWOOD§l§0)",
 icon: "textures/blocks/log_oak.png",
 enabled: true,
 },
 {
 id: "furniture",
 name: "§l§0(§4§lFURNITURE§l§0)",
 icon: "textures/blocks/crafting_table_front.png",
 enabled: true,
 },
 {
 id: "glass",
 name: "§l§0(§6§lGLASS§l§0)",
 icon: "textures/blocks/glass_black.png",
 enabled: true,
 },
 {
 id: "tools",
 name: "§l§0(§8§lTOOLS§l§0)",
 icon: "textures/items/diamond_sword.png",
 enabled: true,
 },
 {
 id: "helmet",
 name: "§l§0(§a§lHELMET§l§0)",
 icon: "textures/items/diamond_helmet.png",
 enabled: true,
 },
 {
 id: "chestplate",
 name: "§l§0(§a§lCHESTPLATE§l§0)",
 icon: "textures/items/diamond_chestplate.png",
 enabled: true,
 },
 {
 id: "leggings",
 name: "§l§0(§a§lLEGGINGS§l§0)",
 icon: "textures/items/diamond_leggings.png",
 enabled: true,
 },
 {
 id: "boots",
 name: "§l§0(§a§lBOOTS§l§0)",
 icon: "textures/items/diamond_boots.png",
 enabled: true,
 },
 {
 id: "farming",
 name: "§l§0(§b§lFARMING§l§0)",
 icon: "textures/items/carrot.png",
 enabled: true,
 },
 {
 id: "food",
 name: "§l§0(§e§lFOOD§l§0)",
 icon: "textures/items/beef_cooked.png",
 enabled: true,
 },
 {
 id: "ores",
 name: "§l§0(§f§lORES§l§0)",
 icon: "textures/items/diamond.png",
 enabled: true,
 },
 {
 id: "spawner",
 name: "§l§0(§g§lSPAWNER§l§0)",
 icon: "textures/blocks/mob_spawner.png",
 enabled: true,
 },
 {
 id: "enchanted_books",
 name: "§l§0(§d§lENCHANTED BOOKS§l§0)",
 icon: "textures/items/book_enchanted.png",
 enabled: true,
 },
 ],
 items: {
 blocks: itemBlock,
 wool: itemBlockColor,
 wood: itemLog,
 furniture: itemFurniture,
 glass: itemGlass,
 tools: [...itemSword, ...itemAxe, ...itemPickaxe, ...itemShovel],
 helmet: itemHelmet,
 chestplate: itemChestplate,
 leggings: itemLeggings,
 boots: itemBoots,
 farming: itemFarm,
 food: itemFood,
 ores: itemOres,
 spawner: itemSpawner,
 enchanted_books: itemEnchantedBook,
 },
};
let shopConfig = JSON.parse(JSON.stringify(DEFAULT_SHOP_CONFIG));
let dbMeta = {
 categoryDBs: [],
 itemDBs: {},
 categoryCount: 0,
 itemCounts: {},
};
let dbRegistryReady = false;
let dbCleanDone = false;

function cleanInvalidDBEntries() {
 if (dbCleanDone) return true;
 try {
 let fixed = 0;
 for (const dbName of [...dbMeta.categoryDBs]) {
 try {
 const data = world.getDynamicProperty(dbName);
 if (!data) continue;
 JSON.parse(data);
 } catch (e) {
 console.warn(`[Shop Config] Invalid data in ${dbName}, resetting...`);
 try { world.setDynamicProperty(dbName, "[]"); } catch { }
 fixed++;
 }
 }
 for (const categoryId in dbMeta.itemDBs) {
 for (const dbName of [...(dbMeta.itemDBs[categoryId] || [])]) {
 try {
 const data = world.getDynamicProperty(dbName);
 if (!data) continue;
 JSON.parse(data);
 } catch (e) {
 console.warn(`[Shop Config] Invalid data in ${dbName}, resetting...`);
 try { world.setDynamicProperty(dbName, "[]"); } catch { }
 fixed++;
 }
 }
 }
 dbCleanDone = true;
 if (fixed > 0) {
 console.log(`[Shop Config] DB cleaning completed (${fixed} fixed)`);
 }
 return true;
 } catch (e) {
 console.error("[Shop Config] Error during DB cleaning:", e);
 return false;
 }
}
function migrateFullDBs() {
 try {
 let didMigrate = false;
 for (const dbName of [...dbMeta.categoryDBs]) {
 const data = world.getDynamicProperty(dbName) || "[]";
 if (data.length > MAX_DB_SIZE * 0.8) {
 console.log(
 `[Shop Config] Category DB ${dbName} is nearly full, migrating...`,
 );
 let categories = [];
 try {
 categories = JSON.parse(data);
 if (!Array.isArray(categories)) categories = [categories];
 } catch (e) {
 console.error(`[Shop Config] Error parsing data from ${dbName}`, e);
 continue;
 }
 const halfPoint = Math.floor(categories.length / 2);
 const categoriesToMove = categories.splice(halfPoint);
 world.setDynamicProperty(dbName, JSON.stringify(categories));
 const newDBName = getNextCategoryDB();
 world.setDynamicProperty(newDBName, JSON.stringify(categoriesToMove));
 didMigrate = true;
 }
 }
 for (const categoryId in dbMeta.itemDBs) {
 for (const dbName of [...dbMeta.itemDBs[categoryId]]) {
 const data = world.getDynamicProperty(dbName) || "[]";
 if (data.length > MAX_DB_SIZE * 0.8) {
 console.log(
 `[Shop Config] Item DB ${dbName} is nearly full, migrating...`,
 );
 let items = [];
 try {
 items = JSON.parse(data);
 if (!Array.isArray(items)) items = [items];
 } catch (e) {
 console.error(`[Shop Config] Error parsing data from ${dbName}`, e);
 continue;
 }
 const halfPoint = Math.floor(items.length / 2);
 const itemsToMove = items.splice(halfPoint);
 world.setDynamicProperty(dbName, JSON.stringify(items));
 const newDBName = getNextItemDB(categoryId);
 world.setDynamicProperty(newDBName, JSON.stringify(itemsToMove));
 didMigrate = true;
 }
 }
 }
 if (didMigrate) {
 world.setDynamicProperty("shop_db_meta", JSON.stringify(dbMeta));
 console.log("[Shop Config] DB migration completed");
 }
 return didMigrate;
 } catch (e) {
 console.error("[Shop Config] Error during DB migration:", e);
 return false;
 }
}
function initDBRegistry() {
 if (dbRegistryReady) return;
 try {
 const metaData = world.getDynamicProperty("shop_db_meta");
 if (metaData) {
 try {
 dbMeta = JSON.parse(metaData);
 } catch {
 dbMeta = {
 categoryDBs: [`${DB_PREFIX.CATEGORY}_0`],
 itemDBs: {},
 categoryCount: 0,
 itemCounts: {},
 };
 }
 cleanInvalidDBEntries();
 migrateFullDBs();
 dbRegistryReady = true;
 return;
 }
 dbMeta = {
 categoryDBs: [`${DB_PREFIX.CATEGORY}_0`],
 itemDBs: {},
 categoryCount: 0,
 itemCounts: {},
 };
 try {
 if (typeof world.getDynamicPropertyRegistry === "function") {
 world
 .getDynamicPropertyRegistry()
 .defineString(`${DB_PREFIX.CATEGORY}_0`, 65536);
 } else {
 world.setDynamicProperty(`${DB_PREFIX.CATEGORY}_0`, "[]");
 }
 } catch (e) {
 world.setDynamicProperty(`${DB_PREFIX.CATEGORY}_0`, "[]");
 }
 world.setDynamicProperty("shop_db_meta", JSON.stringify(dbMeta));
 dbCleanDone = true;
 dbRegistryReady = true;
 } catch (e) {
 console.error("[Shop Config] Error initializing DB registry:", e);
 }
}
const DP_CONFIG_KEY = "shop_dp_config";
const DP_COUNTERS_KEY = "shop_dp_counters";
const DEFAULT_DP_CONFIG = {
 enabled: false,
 priceStep: 1,
 itemsPerStep: 8,
 maxPriceMultiplier: 3,
 resetInterval: 3600,
 lastReset: 0,
};
function getDPConfig() {
 try {
  const saved = GlobalConfig.get(DP_CONFIG_KEY);
  if (saved && typeof saved === "object") return { ...DEFAULT_DP_CONFIG, ...saved };
 } catch {}
 return { ...DEFAULT_DP_CONFIG };
}
function saveDPConfig(cfg) {
 invalidateDPCache();
 return GlobalConfig.set(DP_CONFIG_KEY, cfg);
}
let dpRuntimeCache = { cfg: null, counters: null, at: 0 };
const DP_RUNTIME_CACHE_MS = 1500;
function invalidateDPCache() {
 dpRuntimeCache = { cfg: null, counters: null, at: 0 };
}
function getDPRuntime() {
 const now = Date.now();
 if (dpRuntimeCache.cfg && now - dpRuntimeCache.at < DP_RUNTIME_CACHE_MS) return dpRuntimeCache;
 const cfg = getDPConfig();
 if (checkDPReset(cfg)) {
  dpRuntimeCache = { cfg, counters: {}, at: Date.now() };
  return dpRuntimeCache;
 }
 dpRuntimeCache = {
  cfg,
  counters: cfg.enabled ? getDPCounters() : null,
  at: Date.now(),
 };
 return dpRuntimeCache;
}
function parseDPCounters(raw) {
 const map = {};
 if (!raw || typeof raw !== "string") return map;
 for (const entry of raw.split(",").filter(Boolean)) {
  const parts = entry.split(":");
  if (parts.length >= 2) {
   const id = parts[0];
   const count = parseInt(parts[1]) || 0;
   const lastReset = parseInt(parts[2]) || 0;
   map[id] = { count, lastReset };
  }
 }
 return map;
}
function serializeDPCounters(map) {
 return Object.entries(map)
  .map(([id, d]) => `${id}:${d.count}:${d.lastReset}`)
  .join(",");
}
function getDPCounters() {
 try {
  const raw = GlobalConfig.get(DP_COUNTERS_KEY);
  return typeof raw === "string" ? parseDPCounters(raw) : {};
 } catch { return {}; }
}
function saveDPCounters(map) {
 invalidateDPCache();
 return GlobalConfig.set(DP_COUNTERS_KEY, serializeDPCounters(map));
}
function getShortId(item) {
 return String(item?.item || "").replace("minecraft:", "");
}
function checkDPReset(cfg) {
 const now = Math.floor(Date.now() / 1000);
 if (cfg.enabled && cfg.resetInterval > 0 && now - cfg.lastReset >= cfg.resetInterval) {
  cfg.lastReset = now;
  GlobalConfig.set(DP_CONFIG_KEY, cfg);
  GlobalConfig.set(DP_COUNTERS_KEY, "");
  invalidateDPCache();
  return true;
 }
 return false;
}
export function getEffectivePrice(item) {
 const rt = getDPRuntime();
 if (!rt.cfg.enabled) return item.cost;
 const count = rt.counters?.[getShortId(item)]?.count || 0;
 const perStep = Math.max(1, rt.cfg.itemsPerStep | 0);
 const steps = Math.floor(count / perStep);
 if (steps <= 0) return item.cost;
 const multiplier = 1 + (steps * rt.cfg.priceStep / 100);
 const capped = Math.min(multiplier, rt.cfg.maxPriceMultiplier);
 return Math.floor(item.cost * capped);
}
export function incrementDPBuyCount(item, quantity = 1) {
 const rt = getDPRuntime();
 if (!rt.cfg.enabled) return;
 const shortId = getShortId(item);
 const counters = { ...(rt.counters || {}) };
 if (!counters[shortId]) counters[shortId] = { count: 0, lastReset: rt.cfg.lastReset };
 counters[shortId] = { ...counters[shortId], count: counters[shortId].count + quantity };
 saveDPCounters(counters);
}
async function showDynamicPricingMenu(player) {
 const cfg = getDPConfig();
 const status = cfg.enabled ? Lang.t(player, "dp.status.on") : Lang.t(player, "dp.status.off");
 const intervalLabel = formatInterval(cfg.resetInterval);
 const form = new ActionFormData()
  .title(Lang.t(player, "dp.title"))
  .body(Lang.t(player, "dp.body", status, cfg.priceStep, cfg.itemsPerStep ?? 8, cfg.maxPriceMultiplier, intervalLabel))
  .button(Lang.t(player, "dp.btn.configure"), "textures/ui/icon_setting.png")
  .button(Lang.t(player, "dp.btn.view_counters"), "textures/ui/icon_book_writable.png")
  .button(Lang.t(player, "dp.btn.manual_reset"), "textures/ui/refresh_light.png")
  .button(Lang.t(player, "dp.btn.help"), "textures/ui/infobulb")
  .button(Lang.t(player, "dp.btn.back"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return showShopEconomyMenu(player);
 switch (response.selection) {
  case 0:
   showDPSettingsForm(player);
   break;
  case 1:
   showDPCountersInfo(player);
   break;
  case 2:
   saveDPCounters({});
   cfg.lastReset = Math.floor(Date.now() / 1000);
   saveDPConfig(cfg);
   player.sendMessage(Lang.t(player, "dp.msg.counters_reset"));
   player.playSound("random.orb");
   showDynamicPricingMenu(player);
   break;
  case 3:
   showDPHelpMenu(player);
   break;
  case 4:
   showShopEconomyMenu(player);
   break;
 }
}
async function showDPHelpMenu(player) {
 const form = new MessageFormData()
  .title(Lang.t(player, "dp.help.title"))
  .body(Lang.t(player, "dp.help.full"))
  .button1(Lang.t(player, "dp.help.close"))
  .button2(Lang.t(player, "dp.help.back_to_menu"));
 await form.show(player);
 showDynamicPricingMenu(player);
}
async function showDPSettingsForm(player) {
 const cfg = getDPConfig();
 const intervalOptions = [300, 900, 1800, 3600, 7200, 21600, 43200, 86400];
 const intervalLabels = ["5m", "15m", "30m", "1h", "2h", "6h", "12h", "24h"];
 const currentIntervalIdx = intervalOptions.indexOf(cfg.resetInterval);
 const form = new ModalFormData()
  .title(Lang.t(player, "dp.title"))
  .toggle(Lang.t(player, "dp.toggle.label"), { defaultValue: cfg.enabled })
  .slider(Lang.t(player, "dp.slider.price_step"), 1, 20, { defaultValue: cfg.priceStep, step: 1 })
  .slider(Lang.t(player, "dp.slider.items_per_step"), 1, 64, { defaultValue: cfg.itemsPerStep ?? 8, step: 1 })
  .slider(Lang.t(player, "dp.slider.max_multiplier"), 2, 5, { defaultValue: cfg.maxPriceMultiplier, step: 1 })
  .dropdown(Lang.t(player, "dp.dropdown.reset_interval"), intervalLabels, { defaultValueIndex: currentIntervalIdx >= 0 ? currentIntervalIdx : 3 })
  .submitButton("APPLY");
 const response = await form.show(player);
 if (response.canceled) return showDynamicPricingMenu(player);
 const [newEnabled, newPriceStep, newItemsPerStep, newMaxMultiplier, newIntervalIdx] = response.formValues;
 cfg.enabled = newEnabled;
 cfg.priceStep = newPriceStep;
 cfg.itemsPerStep = newItemsPerStep;
 cfg.maxPriceMultiplier = newMaxMultiplier;
 cfg.resetInterval = intervalOptions[newIntervalIdx];
 saveDPConfig(cfg);
 player.sendMessage(Lang.t(player, "dp.msg.saved"));
 player.playSound("random.click");
 showDynamicPricingMenu(player);
}
function formatInterval(seconds) {
 if (seconds < 60) return `${seconds}s`;
 if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
 return `${Math.floor(seconds / 3600)}h`;
}
function formatCountdown(seconds) {
 const s = Math.max(0, seconds | 0);
 const h = Math.floor(s / 3600);
 const m = Math.floor((s % 3600) / 60);
 const sec = s % 60;
 if (h > 0) return `${h}h ${m}m ${sec}s`;
 if (m > 0) return `${m}m ${sec}s`;
 return `${sec}s`;
}
export function getDPShopResetLine() {
 const rt = getDPRuntime();
 if (!rt?.cfg?.enabled) return "";
 const now = Math.floor(Date.now() / 1000);
 const last = rt.cfg.lastReset > 0 ? rt.cfg.lastReset : now;
 const remaining = Math.max(0, (rt.cfg.resetInterval || 0) - (now - last));
 return `§r§ashop price reset : §e${formatCountdown(remaining)}`;
}
async function showDPCountersInfo(player) {
 const counters = getDPCounters();
 const entries = Object.entries(counters);
 let infoText = `§e${Lang.t(player, "dp.counters.title")}\n\n`;
 if (entries.length === 0) {
  infoText += Lang.t(player, "dp.counters.empty");
 } else {
  infoText += Lang.t(player, "dp.counters.tracked", entries.length) + "\n\n";
  for (const [id, data] of entries.sort((a, b) => b[1].count - a[1].count)) {
   const shopItem = findShopItemByShortId(id);
   const name = shopItem?.name || id;
   const dynamicPrice = shopItem ? getEffectivePrice(shopItem) : "?";
   infoText += Lang.t(player, "dp.counters.item", name, data.count, dynamicPrice) + "\n";
  }
 }
 const form = new ActionFormData()
   .title(Lang.t(player, "dp.title"))
   .body(infoText)
   .button(Lang.t(player, "dp.btn.back"), "textures/ui/arrow_left.png");
  const response = await form.show(player);
  if (!response.canceled) showDynamicPricingMenu(player);
}
function findShopItemByShortId(shortId) {
 for (const category of shopConfig.categories) {
  const items = shopConfig.items?.[category.id];
  if (!Array.isArray(items)) continue;
  for (const item of items) {
   if (getShortId(item) === shortId) return item;
  }
 }
 return null;
}
export { shopConfig, loadShopConfig, saveShopConfig, showShopConfigMenu };
function getNextCategoryDB() {
 const currentCount = dbMeta.categoryCount;
 const dbIndex = Math.floor(currentCount / MAX_CATEGORIES_PER_DB);
 const dbName = `${DB_PREFIX.CATEGORY}_${dbIndex}`;
 if (!dbMeta.categoryDBs.includes(dbName)) {
 try {
 try {
 if (typeof world.getDynamicPropertyRegistry === "function") {
 world.getDynamicPropertyRegistry().defineString(dbName, 65536);
 } else {
 if (world.getDynamicProperty(dbName) === undefined) {
 world.setDynamicProperty(dbName, "[]");
 }
 }
 } catch (e) {
 if (world.getDynamicProperty(dbName) === undefined) {
 world.setDynamicProperty(dbName, "[]");
 }
 }
 dbMeta.categoryDBs.push(dbName);
 world.setDynamicProperty("shop_db_meta", JSON.stringify(dbMeta));
 console.log(`[Shop Config] Created new category DB: ${dbName}`);
 } catch (e) {
 console.error(`[Shop Config] Error creating category DB ${dbName}:`, e);
 }
 }
 return dbName;
}
function getNextItemDB(categoryId) {
 if (!dbMeta.itemDBs[categoryId]) {
 dbMeta.itemDBs[categoryId] = [`${DB_PREFIX.ITEM}_${categoryId}_0`];
 dbMeta.itemCounts[categoryId] = 0;
 }
 const currentCount = dbMeta.itemCounts[categoryId] || 0;
 const dbIndex = Math.floor(currentCount / MAX_ITEMS_PER_DB);
 const dbName = `${DB_PREFIX.ITEM}_${categoryId}_${dbIndex}`;
 if (!dbMeta.itemDBs[categoryId].includes(dbName)) {
 try {
 try {
 if (typeof world.getDynamicPropertyRegistry === "function") {
 world.getDynamicPropertyRegistry().defineString(dbName, 65536);
 } else {
 if (world.getDynamicProperty(dbName) === undefined) {
 world.setDynamicProperty(dbName, "[]");
 }
 }
 } catch (e) {
 if (world.getDynamicProperty(dbName) === undefined) {
 world.setDynamicProperty(dbName, "[]");
 }
 }
 dbMeta.itemDBs[categoryId].push(dbName);
 world.setDynamicProperty("shop_db_meta", JSON.stringify(dbMeta));
 console.log(
 `[Shop Config] Created new item DB for ${categoryId}: ${dbName}`,
 );
 } catch (e) {
 console.error(`[Shop Config] Error creating item DB ${dbName}:`, e);
 }
 }
 return dbName;
}
function saveCategoryToDB(category) {
 try {
 const dbName = getNextCategoryDB();
 const currentData = world.getDynamicProperty(dbName) || "[]";
 let categories;
 try {
 categories = JSON.parse(currentData);
 if (!Array.isArray(categories)) categories = [];
 } catch (e) {
 categories = [];
 }
 const newCategory = JSON.parse(JSON.stringify(category));
 categories.push(newCategory);
 const newData = JSON.stringify(categories);
 if (newData.length > MAX_DB_SIZE * 0.8) {
 const newDBName = getNextCategoryDB();
 world.setDynamicProperty(newDBName, JSON.stringify([newCategory]));
 } else {
 world.setDynamicProperty(dbName, newData);
 }
 dbMeta.categoryCount++;
 world.setDynamicProperty("shop_db_meta", JSON.stringify(dbMeta));
 return true;
 } catch (e) {
 console.error("[Shop Config] Error saving category to DB:", e);
 return false;
 }
}
function saveItemToDB(categoryId, item) {
 try {
 const dbName = getNextItemDB(categoryId);
 const currentData = world.getDynamicProperty(dbName) || "[]";
 let items;
 try {
 items = JSON.parse(currentData);
 if (!Array.isArray(items)) items = [];
 } catch (e) {
 items = [];
 }
 const newItem = JSON.parse(JSON.stringify(item));
 items.push(newItem);
 const newData = JSON.stringify(items);
 if (newData.length > MAX_DB_SIZE * 0.8) {
 const newDBName = getNextItemDB(categoryId);
 world.setDynamicProperty(newDBName, JSON.stringify([newItem]));
 } else {
 world.setDynamicProperty(dbName, newData);
 }
 dbMeta.itemCounts[categoryId] = (dbMeta.itemCounts[categoryId] || 0) + 1;
 world.setDynamicProperty("shop_db_meta", JSON.stringify(dbMeta));
 return true;
 } catch (e) {
 console.error(
 `[Shop Config] Error saving item to DB for ${categoryId}:`,
 e,
 );
 return false;
 }
}
function loadCategoriesFromDB() {
 const categories = [];
 try {
 for (const dbName of dbMeta.categoryDBs) {
 const data = world.getDynamicProperty(dbName);
 if (data) {
 try {
 const categoryData = JSON.parse(data);
 if (categoryData) {
 if (Array.isArray(categoryData)) {
 categories.push(...categoryData);
 } else {
 categories.push(categoryData);
 }
 }
 } catch (e) {
 console.warn(`[Shop or parsing category data from ${dbName}:`, e);
 }
 }
 }
 return categories.length > 0 ? categories : null;
 } catch (e) {
 console.error("[Shop Config] Error loading categories from DB:", e);
 return null;
 }
}
function loadItemsFromDB(categoryId) {
 const items = [];
 try {
 if (!dbMeta.itemDBs[categoryId]) return null;
 for (const dbName of dbMeta.itemDBs[categoryId]) {
 const data = world.getDynamicProperty(dbName);
 if (data) {
 try {
 const itemData = JSON.parse(data);
 if (itemData) {
 if (Array.isArray(itemData)) {
 for (const entry of itemData) {
 const normalized = normalizeShopItem(entry);
 if (normalized) items.push(normalized);
 }
 } else {
 const normalized = normalizeShopItem(itemData);
 if (normalized) items.push(normalized);
 }
 }
 } catch (e) {
 console.warn(
 `[Shop Config] Error parsing item data from ${dbName}:`,
 e,
 );
 }
 }
 }
 return items.length > 0 ? items : null;
 } catch (e) {
 console.error(
 `[Shop Config] Error loading items from DB for ${categoryId}:`,
 e,
 );
 return null;
 }
}
let shopConfigLoadedAt = 0;
const SHOP_CONFIG_CACHE_MS = 8000;

function loadShopConfig(force = false) {
 if (
 !force &&
 dbRegistryReady &&
 shopConfig.categories?.length > 0 &&
 Date.now() - shopConfigLoadedAt < SHOP_CONFIG_CACHE_MS
 ) {
 return true;
 }
 try {
 initDBRegistry();
 const categories = loadCategoriesFromDB();
 if (categories && categories.length > 0) {
 shopConfig.categories = categories;
 shopConfig.items = {};
 for (const category of categories) {
 const items = loadItemsFromDB(category.id);
 shopConfig.items[category.id] = items || [];
 }
 const oldConfig = world.getDynamicProperty("shopConfigData");
 if (oldConfig) {
 try {
 const parsed = JSON.parse(oldConfig);
 if (parsed?.categories?.length > 0) {
 const existingCategoryIds = shopConfig.categories.map((c) => c.id);
 const missingCategories = parsed.categories.filter(
 (c) => !existingCategoryIds.includes(c.id),
 );
 if (missingCategories.length > 0) {
 console.log(
 `[Shop Config] Found ${missingCategories.length} missing categories to migrate`,
 );
 for (const category of missingCategories) {
 shopConfig.categories.push(category);
 const items = parsed.items[category.id] || [];
 shopConfig.items[category.id] = items;
 saveCategoryToDB(category);
 for (const item of items) {
 saveItemToDB(category.id, item);
 }
 }
 console.log(
 "[Shop Config] Migration completed, removing old property",
 );
 try {
 world.setDynamicProperty("shopConfigData", undefined);
 } catch {
 console.warn(
 "[Shop Config] Could not delete old shopConfigData",
 );
 }
 }
 }
 } catch (e) {
 console.warn("[Shop Config] Error parsing old config:", e);
 }
 }
 for (const category of shopConfig.categories) {
 if (!shopConfig.items[category.id]) {
 shopConfig.items[category.id] = [];
 }
 }
 shopConfigLoadedAt = Date.now();
 return true;
 }
 const saved = world.getDynamicProperty("shopConfigData");
 if (saved) {
 try {
 const parsed = JSON.parse(saved);
 if (
 parsed?.categories?.length > 0 &&
 parsed?.items &&
 Object.keys(parsed.items).length > 0
 ) {
 shopConfig = parsed;
 migrateConfigToDB();
 shopConfigLoadedAt = Date.now();
 return true;
 }
 } catch (e) {
 console.warn("[Shop Config] Error parsing shopConfigData:", e);
 }
 }
 } catch (e) {
 console.warn("Error loading shop config:", e);
 }
 if (loadShopBackup()) {
 saveShopConfig();
 return true;
 }
 shopConfig = JSON.parse(JSON.stringify(DEFAULT_SHOP_CONFIG));
 saveShopConfig();
 return false;
}
function migrateConfigToDB() {
 try {
 dbMeta = {
 categoryDBs: [`${DB_PREFIX.CATEGORY}_0`],
 itemDBs: {},
 categoryCount: 0,
 itemCounts: {},
 };
 try {
 world
 .getDynamicPropertyRegistry()
 .defineString(`${DB_PREFIX.CATEGORY}_0`, 65536);
 } catch (e) { }
 for (const category of shopConfig.categories) {
 saveCategoryToDB(category);
 const items = shopConfig.items[category.id] || [];
 for (const item of items) {
 saveItemToDB(category.id, item);
 }
 }
 console.log("[Shop Config] Migration to new DB format completed");
 return true;
 } catch (e) {
 console.error("[Shop Config] Error during migration:", e);
 return false;
 }
}
function saveShopConfig() {
 try {
 shopConfigLoadedAt = 0;
 writeShopBackup();
 const currentDbMeta = JSON.parse(JSON.stringify(dbMeta));
 for (const dbName of currentDbMeta.categoryDBs || []) {
 world.setDynamicProperty(dbName, "[]");
 }
 for (const categoryId in currentDbMeta.itemDBs || {}) {
 for (const dbName of currentDbMeta.itemDBs[categoryId] || []) {
 world.setDynamicProperty(dbName, "[]");
 }
 }
 dbMeta = {
 categoryDBs: [`${DB_PREFIX.CATEGORY}_0`],
 itemDBs: {},
 categoryCount: 0,
 itemCounts: {},
 };
 try {
 if (typeof world.getDynamicPropertyRegistry === "function") {
 world
 .getDynamicPropertyRegistry()
 .defineString(`${DB_PREFIX.CATEGORY}_0`, 65536);
 }
 } catch (e) { }
 const batchSize = 5;
 for (let i = 0; i < shopConfig.categories.length; i += batchSize) {
 const batch = shopConfig.categories.slice(i, i + batchSize);
 for (const category of batch) {
 saveCategoryToDB(category);
 }
 }
 for (const category of shopConfig.categories) {
 const items = shopConfig.items[category.id] || [];
 for (let i = 0; i < items.length; i += batchSize) {
 const batch = items.slice(i, i + batchSize);
 for (const item of batch) {
 saveItemToDB(category.id, item);
 }
 }
 }
 try {
 world.setDynamicProperty("shopConfigData", undefined);
 } catch (e) {
 console.warn("[Shop Config] Could not delete old shopConfigData:", e);
 }
 shopConfigLoadedAt = Date.now();
 return true;
 } catch (e) {
 console.warn("Error saving shop config:", e);
 if (loadShopBackup()) {
 console.warn("[Shop Config] Save failed — restored from backup");
 }
 return false;
 }
}
function forceResetShopConfig() {
 try {
 try {
 world.setDynamicProperty("shopConfigData", undefined);
 } catch (e) {
 console.warn("[Shop Config] Error clearing property:", e);
 }
 try {
 for (const dbName of dbMeta.categoryDBs || []) {
 world.setDynamicProperty(dbName, undefined);
 }
 for (const categoryId in dbMeta.itemDBs || {}) {
 for (const dbName of dbMeta.itemDBs[categoryId] || []) {
 world.setDynamicProperty(dbName, undefined);
 }
 }
 world.setDynamicProperty("shop_db_meta", undefined);
 } catch (e) {
 console.warn("[Shop Config] Error clearing DB properties:", e);
 }
 try {
 world.getDynamicPropertyRegistry().defineString("shopConfigData", 65536);
 console.warn(
 '[Shop Config] Dynamic property "shopConfigData" redefined.',
 );
 world.getDynamicPropertyRegistry().defineString("shop_db_meta", 65536);
 world
 .getDynamicPropertyRegistry()
 .defineString(`${DB_PREFIX.CATEGORY}_0`, 65536);
 } catch (e) { }
 shopConfig = JSON.parse(JSON.stringify(DEFAULT_SHOP_CONFIG));
 if (!shopConfig.items.helmet || !Array.isArray(shopConfig.items.helmet)) {
 shopConfig.items.helmet = [...itemHelmet];
 }
 if (
 !shopConfig.items.chestplate ||
 !Array.isArray(shopConfig.items.chestplate)
 ) {
 shopConfig.items.chestplate = [...itemChestplate];
 }
 if (
 !shopConfig.items.leggings ||
 !Array.isArray(shopConfig.items.leggings)
 ) {
 shopConfig.items.leggings = [...itemLeggings];
 }
 if (!shopConfig.items.boots || !Array.isArray(shopConfig.items.boots)) {
 shopConfig.items.boots = [...itemBoots];
 }
 initDBRegistry();
 try {
 world.setDynamicProperty("shop_last_percent", undefined);
 } catch (e) {
 console.warn("[Shop Config] Could not reset last percentage:", e);
 }
 if (!saveShopConfig()) {
 console.error("[Shop Config] Failed to save default config!");
 return false;
 }
 console.log("[Shop Config] Configuration reset successfully.");
 return true;
 } catch (e) {
 console.error("[Shop Config] Error during force reset:", e);
 return false;
 }
}
world.afterEvents.worldLoad.subscribe(() => {
 try {
 initDBRegistry();
 loadShopConfig();
 let configValid = false;
 try {
 if (
 shopConfig.categories &&
 shopConfig.categories.length > 0 &&
 shopConfig.items
 ) {
 configValid = true;
 for (const category of shopConfig.categories) {
 if (
 !shopConfig.items[category.id] ||
 !Array.isArray(shopConfig.items[category.id])
 ) {
 shopConfig.items[category.id] = JSON.parse(
 JSON.stringify(DEFAULT_SHOP_CONFIG.items[category.id] || []),
 );
 }
 }
 if (shopConfig.items.armor && Array.isArray(shopConfig.items.armor)) {
 if (!shopConfig.items.helmet) shopConfig.items.helmet = [];
 if (!shopConfig.items.chestplate) shopConfig.items.chestplate = [];
 if (!shopConfig.items.leggings) shopConfig.items.leggings = [];
 if (!shopConfig.items.boots) shopConfig.items.boots = [];
 delete shopConfig.items.armor;
 shopConfig.categories = shopConfig.categories.filter(
 (cat) => cat.id !== "armor",
 );
 }
 }
 } catch (e) {
 console.error("[Shop Config] Error validating configuration:", e);
 configValid = false;
 }
 if (!configValid) {
 console.warn(
 "[Shop Config] Invalid configuration, trying backup before reset",
 );
 if (!loadShopBackup() || !saveShopConfig()) {
 shopConfig = JSON.parse(JSON.stringify(DEFAULT_SHOP_CONFIG));
 saveShopConfig();
 }
 }
 migrateFullDBs();
 } catch (e) {
 console.error("[Shop Config] Error during initialization:", e);
 shopConfig = JSON.parse(JSON.stringify(DEFAULT_SHOP_CONFIG));
 saveShopConfig();
 }
});
async function showShopConfigMenu(player, returnCallback) {
 shopMenuReturnCallback = returnCallback || null;
 loadShopSettings();
 const modeLabel = shopSettings.currencyMode === "dual"
 ? "Dual (Money + Coin)"
 : shopSettings.currencyMode === "coin"
 ? "Coin Only"
 : "Money Only";
 const dp = getDPConfig();
 const dpLine = dp.enabled
  ? `§aDynamic pricing ON §7(§e+${dp.priceStep}%§7 / §e${dp.itemsPerStep ?? 8}§7 items, max §e${dp.maxPriceMultiplier}x§7)`
  : "§8Dynamic pricing OFF";
 const form = new ActionFormData()
 .title("Shop Configuration")
 .body(`§7Customize shop categories and items\n§7Mode: §e${modeLabel} §7(${shopSettings.currency})\n${dpLine}`)
 .button(shopBtn("Catalog", "Categories & items"), "textures/ui/icon_recipe_nature.png")
 .button(shopBtn("Economy", dp.enabled ? `ON · +${dp.priceStep}%/${dp.itemsPerStep ?? 8}` : "OFF · prices"), "textures/ui/icon_deals.png")
 .button(shopBtn("Tools", "DB info & reset"), "textures/ui/gear.png")
 .button(shopBtn("Back", "Return to menu"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return;
 const actions = [
  () => showShopCatalogMenu(player),
  () => showShopEconomyMenu(player),
  () => showShopToolsMenu(player),
  () => {
  if (typeof shopMenuReturnCallback === "function") {
   shopMenuReturnCallback(player);
  } else {
   showMainMenu(player);
  }
  },
 ];
 actions[response.selection]?.();
}
async function showShopCatalogMenu(player) {
 const form = new ActionFormData()
 .title("Shop Catalog")
 .body("§7Manage categories and items")
 .button(shopBtn("Manage Categories", "Add / edit categories"), "textures/ui/icon_recipe_nature.png")
 .button(shopBtn("Manage Items", "Add / edit items"), "textures/ui/inventory_icon")
 .button(shopBtn("Back", "Return to hub"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return showShopConfigMenu(player, shopMenuReturnCallback);
 const actions = [
  () => showCategoriesMenu(player),
  () => showCategorySelector(player),
  () => showShopConfigMenu(player, shopMenuReturnCallback),
 ];
 actions[response.selection]?.();
}
async function showShopEconomyMenu(player) {
 const dp = getDPConfig();
 const form = new ActionFormData()
 .title("Shop Economy")
 .body("§7Prices, dynamic pricing, and currency")
 .button(shopBtn("Price Adjustment", "Manual % change"), "textures/ui/icon_deals.png")
 .button(shopBtn("Dynamic Pricing", dp.enabled ? `ON · +${dp.priceStep}%/${dp.itemsPerStep ?? 8}` : "OFF · auto demand"), "textures/ui/icon_best3.png")
 .button(shopBtn("Currency Settings", "Money / Coin / Dual"), "textures/ui/icon_setting.png")
 .button(shopBtn("Back", "Return to hub"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return showShopConfigMenu(player, shopMenuReturnCallback);
 const actions = [
  () => showPriceAdjustmentMenu(player),
  () => showDynamicPricingMenu(player),
  () => showCurrencySettings(player),
  () => showShopConfigMenu(player, shopMenuReturnCallback),
 ];
 actions[response.selection]?.();
}
async function showShopToolsMenu(player) {
 const form = new ActionFormData()
 .title("Shop Tools")
 .body("§7Database info and danger zone")
 .button(shopBtn("DB Info", "View database usage"), "textures/ui/icon_book_writable.png")
 .button(shopBtn("§cDanger Zone", "Reset / import default"), "textures/ui/refresh_light.png")
 .button(shopBtn("Back", "Return to hub"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return showShopConfigMenu(player, shopMenuReturnCallback);
 const actions = [
  () => showDBInfo(player),
  () => showResetOptionsMenu(player),
  () => showShopConfigMenu(player, shopMenuReturnCallback),
 ];
 actions[response.selection]?.();
}
async function showCurrencySettings(player) {
 loadShopSettings();
 const modeLabel = shopSettings.currencyMode === "dual"
 ? "Dual (Money + Coin)"
 : shopSettings.currencyMode === "coin"
 ? "Coin Only"
 : "Money Only";
 const form = new ActionFormData()
 .title("Currency Settings")
 .body(
 `§e=== CURRENT CURRENCY SETTINGS ===\n\n` +
 `§7Currency Mode: §a${modeLabel}\n` +
 `§7Objective Name: §a${shopSettings.currency}\n` +
 `§7Currency Symbol: §a${shopSettings.currencySymbol}\n` +
 `§7Currency Name: §a${shopSettings.currencyName}\n\n` +
 `§6Note: §fCoin uses scoreboard 'coin' objective.\n` +
 `§fMoney uses the configured money system.`
 )
 .button(shopBtn("Change Currency Mode", "Money / Coin / Dual"), "textures/ui/icon_setting.png")
 .button(shopBtn("Change Currency Objective", "Select scoreboard"), "textures/ui/icon_setting.png")
 .button(shopBtn("Change Symbol & Name", "Customize display"), "textures/ui/editIcon.png")
 .button(shopBtn("Reset to Default", "Use 'money' objective"), "textures/ui/refresh_light.png")
 .button(shopBtn("Back", "Return to economy"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return;
 switch (response.selection) {
 case 0:
 showCurrencyModeSelector(player);
 break;
 case 1:
 showCurrencyObjectiveSelector(player);
 break;
 case 2:
 showCurrencyCustomize(player);
 break;
 case 3:
 shopSettings = { ...DEFAULT_SHOP_SETTINGS };
 if (saveShopSettings()) {
 player.sendMessage("§a[Shop] Currency reset to default (money)");
 player.playSound("random.click");
 }
 showCurrencySettings(player);
 break;
 case 4:
 showShopEconomyMenu(player);
 break;
 }
}
async function showCurrencyModeSelector(player) {
 loadShopSettings();
 const currentMode = shopSettings.currencyMode || "money";
 const modeIndex = currentMode === "dual" ? 2 : currentMode === "coin" ? 1 : 0;
 const form = new ModalFormData()
 .title("Select Currency Mode")
 .dropdown(
 "§7Currency Mode",
 ["Money Only", "Coin Only", "Dual (Money + Coin)"],
 { defaultValueIndex: modeIndex }
 );
 const response = await form.show(player);
 if (response.canceled) {
 showCurrencySettings(player);
 return;
 }
 const [selectedIndex] = response.formValues;
 const modes = ["money", "coin", "dual"];
 const newMode = modes[selectedIndex];
 shopSettings.currencyMode = newMode;
 if (saveShopSettings()) {
 player.sendMessage(`§a[Shop] Currency mode updated to: §e${newMode === "dual" ? "Dual (Money + Coin)" : newMode === "coin" ? "Coin Only" : "Money Only"}`);
 player.playSound("random.click");
 } else {
 player.sendMessage("§c[Shop] Failed to save currency mode");
 }
 showCurrencySettings(player);
}
async function showCurrencyObjectiveSelector(player) {
 const objectives = world.scoreboard.getObjectives();
 if (objectives.length === 0) {
 const form = new ActionFormData()
 .title("No Objectives Found")
 .body("§cNo scoreboard objectives found.\n\n§7Create one using:\n§e/scoreboard objectives add <name> dummy")
 .button(shopBtn("Back"));
 const response = await form.show(player);
 if (!response.canceled) showCurrencySettings(player);
 return;
 }
 const form = new ActionFormData()
 .title("Select Currency Objective")
 .body(`§7Select which scoreboard objective to use as currency.\n§7Current: §a${shopSettings.currency}`);
 for (const obj of objectives) {
 const isActive = obj.id === shopSettings.currency;
 form.button(`${isActive ? "§a✓ " : "§f"}${obj.id}${isActive ? " §7(Current)" : ""}`);
 }
 form.button(shopBtn("Back", "Return"));
 const response = await form.show(player);
 if (response.canceled) return;
 if (response.selection < objectives.length) {
 const obj = objectives[response.selection];
 shopSettings.currency = obj.id;
 shopSettings.currencyName = obj.id.charAt(0).toUpperCase() + obj.id.slice(1);
 if (saveShopSettings()) {
 player.sendMessage(`§a[Shop] Currency changed to: §e${obj.id}`);
 player.playSound("random.click");
 } else {
 player.sendMessage("§c[Shop] Failed to save currency settings");
 }
 showCurrencySettings(player);
 } else {
 showCurrencySettings(player);
 }
}
async function showCurrencyCustomize(player) {
 loadShopSettings();
 const form = new ModalFormData()
 .title("Customize Currency Display")
 .textField("§7Currency Symbol (e.g., $, Rp, ¥)", "Enter symbol...", { defaultValue: shopSettings.currencySymbol })
 .textField("§7Currency Name (e.g., Money, Coins, Gold)", "Enter name...", { defaultValue: shopSettings.currencyName });
 const response = await form.show(player);
 if (response.canceled) return;
 const [symbol, name] = response.formValues;
 const trimmedSymbol = symbol.trim();
 const trimmedName = name.trim();
 if (trimmedSymbol) shopSettings.currencySymbol = trimmedSymbol;
 if (trimmedName) shopSettings.currencyName = trimmedName;
 if (saveShopSettings()) {
 player.sendMessage(`§a[Shop] Currency display updated!`);
 player.sendMessage(`§7Symbol: §e${shopSettings.currencySymbol} §7| Name: §e${shopSettings.currencyName}`);
 player.playSound("random.click");
 } else {
 player.sendMessage("§c[Shop] Failed to save settings");
 }
 showCurrencySettings(player);
}
async function showPriceAdjustmentMenu(player) {
 const form = new ActionFormData()
 .title("Price Adjustment")
 .body("§7Adjust item prices by percentage")
 .button(shopBtn("§aIncrease All Prices", "Increase by %"), "textures/ui/color_plus.png")
 .button(shopBtn("§cDecrease All Prices", "Decrease by %"), "textures/ui/minus.png")
 .button(shopBtn("§eAdjust Category", "Adjust specific category"), "textures/ui/icon_recipe_nature.png")
 .button(shopBtn("Back", "Return to economy"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return;
 const actions = [
 () => showPercentageInput(player, "increase", null),
 () => showPercentageInput(player, "decrease", null),
 () => showCategoryForPriceAdjust(player),
 () => showShopEconomyMenu(player),
 ];
 actions[response.selection]?.();
}
async function showCategoryForPriceAdjust(player) {
 const form = new ActionFormData()
 .title("Select Category")
 .body("§7Select a category to adjust prices");
 for (const category of shopConfig.categories) {
 const itemCount = (shopConfig.items[category.id] || []).length;
 form.button(shopBtn(category.name.replace(/§l/g, ""), `${itemCount} items`), category.icon);
 }
 form.button(shopBtn("Back", "Return to price menu"));
 const response = await form.show(player);
 if (response.canceled) return;
 if (response.selection < shopConfig.categories.length) {
 showCategoryPriceOptions(player, shopConfig.categories[response.selection].id);
 } else {
 showPriceAdjustmentMenu(player);
 }
}
async function showCategoryPriceOptions(player, categoryId) {
 const category = shopConfig.categories.find((c) => c.id === categoryId);
 const form = new ActionFormData()
 .title(`Adjust: ${category.name}`)
 .body("§7Choose adjustment type")
 .button(shopBtn("§aIncrease Prices", "Increase by %"), "textures/ui/color_plus.png")
 .button(shopBtn("§cDecrease Prices", "Decrease by %"), "textures/ui/minus.png")
 .button(shopBtn("Back", "Return to categories"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return;
 const actions = [
 () => showPercentageInput(player, "increase", categoryId),
 () => showPercentageInput(player, "decrease", categoryId),
 () => showCategoryForPriceAdjust(player),
 ];
 actions[response.selection]?.();
}
function getLastPercentage() {
 try {
 const saved = world.getDynamicProperty("shop_last_percent");
 return saved ? parseInt(saved) : 10;
 } catch {
 return 10;
 }
}
function saveLastPercentage(value) {
 try {
 world.setDynamicProperty("shop_last_percent", String(value));
 } catch (e) {
 console.warn("[Shop Config] Could not save last percentage:", e);
 }
}
async function showPercentageInput(player, mode, categoryId) {
 const isIncrease = mode === "increase";
 const targetText = categoryId
 ? shopConfig.categories.find((c) => c.id === categoryId)?.name || categoryId
 : "All Categories";
 const lastPercent = getLastPercentage();
 const form = new ModalFormData()
 .title(isIncrease ? "Increase Prices" : "Decrease Prices")
 .slider(
 `§7Target: §e${targetText}\n§l${isIncrease ? "§aIncrease" : "§cDecrease"} Percentage`,
 1,
 100,
 { defaultValue: lastPercent, step: 1 }
 )
 .toggle(shopField("Adjust buy price"), { defaultValue: true })
 .toggle(shopField("Adjust sell price"), { defaultValue: true });
 const response = await form.show(player);
 if (response.canceled) {
 if (categoryId) showCategoryPriceOptions(player, categoryId);
 else showPriceAdjustmentMenu(player);
 return;
 }
 const [percentage, adjustBuy, adjustSell] = response.formValues;
 saveLastPercentage(percentage);
 if (!adjustBuy && !adjustSell) {
 player.sendMessage("§c[Shop Config] Select at least one price type!");
 showPercentageInput(player, mode, categoryId);
 return;
 }
 const result = applyPriceAdjustment(mode, percentage, categoryId, adjustBuy, adjustSell);
 if (result.success) {
 const symbol = isIncrease ? "+" : "-";
 player.sendMessage(
 `§a[Shop Config] Prices adjusted! ${symbol}${percentage}% applied to ${result.itemCount} items.`
 );
 } else {
 player.sendMessage(`§c[Shop Config] Failed: ${result.error}`);
 }
 showPriceAdjustmentMenu(player);
}
function applyPriceAdjustment(mode, percentage, categoryId, adjustBuy, adjustSell) {
 try {
 const multiplier = mode === "increase"
 ? 1 + percentage / 100
 : 1 - percentage / 100;
 let itemCount = 0;
 const categoriesToAdjust = categoryId
 ? [categoryId]
 : Object.keys(shopConfig.items);
 console.log(`[Shop Config] Adjusting prices: ${mode} ${percentage}% for ${categoriesToAdjust.length} categories`);
 for (const catId of categoriesToAdjust) {
 const items = shopConfig.items[catId] || [];
 for (const item of items) {
 if (adjustBuy && typeof item.cost === "number") {
 const oldCost = item.cost;
 item.cost = Math.max(1, Math.round(item.cost * multiplier));
 console.log(`[Shop Config] ${item.name}: cost ${oldCost} -> ${item.cost}`);
 }
 if (adjustSell && typeof item.sell === "number") {
 const oldSell = item.sell;
 item.sell = Math.max(0, Math.round(item.sell * multiplier));
 console.log(`[Shop Config] ${item.name}: sell ${oldSell} -> ${item.sell}`);
 }
 itemCount++;
 }
 }
 const saved = saveShopConfig();
 console.log(`[Shop Config] Save result: ${saved}, items adjusted: ${itemCount}`);
 if (!saved) {
 return { success: false, error: "Failed to save configuration" };
 }
 return { success: true, itemCount };
 } catch (e) {
 console.error("[Shop Config] Error applying price adjustment:", e);
 return { success: false, error: e.message };
 }
}
async function showCategoriesMenu(player) {
 const form = new ActionFormData()
 .title("Manage Categories")
 .body("§7Select a category to edit or create new");
 for (let i = 0; i < shopConfig.categories.length; i++) {
 const category = shopConfig.categories[i];
 const status = category.enabled !== false ? "§aEnabled" : "§cDisabled";
 form.button(shopBtn(category.name.replace(/§l/g, ""), status), category.icon);
 }
 form.button(shopBtn("§2Add New Category", "Create new"), "textures/ui/color_plus.png");
 form.button(shopBtn("Back", "Return to catalog"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return;
 if (response.selection < shopConfig.categories.length) {
 editCategory(player, response.selection);
 } else if (response.selection === shopConfig.categories.length) {
 createCategory(player);
 } else {
 showShopCatalogMenu(player);
 }
}
async function createCategory(player) {
 const form = new ModalFormData()
 .title("Create New Category")
 .textField("§lCategory ID\n§r§8Unique identifier (no spaces)", "Example: custom_blocks", { defaultValue: "custom_blocks" })
 .textField("§lDisplay Name\n§r§8Name with formatting", "§l§0(§d§lCUSTOM§l§0)", { defaultValue: "§l§0(§d§lCUSTOM§l§0)" })
 .textField("§lIcon Path\n§r§8Texture path", "textures/blocks/custom.png", { defaultValue: "textures/blocks/custom.png" });
 const response = await form.show(player);
 if (response.canceled) { showCategoriesMenu(player); return; }
 const [id, name, icon] = response.formValues.map(v => v.trim());
 if (!id || !name || !icon) {
 player.sendMessage("§c[Shop Config] All fields are required!");
 createCategory(player);
 return;
 }
 if (shopConfig.categories.some((cat) => cat.id === id)) {
 player.sendMessage("§c[Shop Config] Category ID already exists!");
 createCategory(player);
 return;
 }
 const newCategory = { id, name, icon, enabled: true };
 shopConfig.categories.push(newCategory);
 shopConfig.items[id] = [];
 saveCategoryToDB(newCategory);
 saveShopConfig();
 player.sendMessage("§a[Shop Config] Category created!");
 showCategoriesMenu(player);
}
async function editCategory(player, index) {
 const category = shopConfig.categories[index];
 const form = new ModalFormData()
 .title("Edit Category")
 .textField("§lCategory ID\n§r§8Unique identifier", "Enter category ID", { defaultValue: category.id })
 .textField("§lDisplay Name\n§r§8Name with formatting", "Enter display name", { defaultValue: category.name })
 .textField("§lIcon Path\n§r§8Texture path", "Enter icon texture path", { defaultValue: category.icon })
 .toggle("§lEnable Category", { defaultValue: category.enabled !== false })
 .toggle("§cDelete Category", { defaultValue: false });
 const response = await form.show(player);
 if (response.canceled) { showCategoriesMenu(player); return; }
 const [idRaw, nameRaw, iconRaw, enabled, shouldDelete] = response.formValues;
 if (shouldDelete) {
 const oldId = category.id;
 shopConfig.categories.splice(index, 1);
 delete shopConfig.items[oldId];
 try {
 if (dbMeta.itemDBs[oldId]) {
 for (const dbName of dbMeta.itemDBs[oldId]) {
 world.setDynamicProperty(dbName, undefined);
 }
 delete dbMeta.itemDBs[oldId];
 delete dbMeta.itemCounts[oldId];
 world.setDynamicProperty("shop_db_meta", JSON.stringify(dbMeta));
 }
 } catch (e) {
 console.error(`[Shop Config] Error deleting DB for ${oldId}:`, e);
 }
 saveShopConfig();
 player.sendMessage("§a[Shop Config] Category deleted!");
 showCategoriesMenu(player);
 return;
 }
 const id = idRaw.trim();
 const name = nameRaw.trim();
 const icon = iconRaw.trim();
 if (!id || !name || !icon) {
 player.sendMessage("§c[Shop Config] All fields are required!");
 editCategory(player, index);
 return;
 }
 if (id !== category.id && shopConfig.categories.some((cat) => cat.id === id)) {
 player.sendMessage("§c[Shop Config] Category ID already exists!");
 editCategory(player, index);
 return;
 }
 const oldId = category.id;
 category.id = id;
 category.name = name;
 category.icon = icon;
 category.enabled = enabled;
 if (id !== oldId) {
 shopConfig.items[id] = shopConfig.items[oldId] || [];
 delete shopConfig.items[oldId];
 if (dbMeta.itemDBs[oldId]) {
 dbMeta.itemDBs[id] = dbMeta.itemDBs[oldId];
 dbMeta.itemCounts[id] = dbMeta.itemCounts[oldId];
 delete dbMeta.itemDBs[oldId];
 delete dbMeta.itemCounts[oldId];
 world.setDynamicProperty("shop_db_meta", JSON.stringify(dbMeta));
 }
 }
 saveShopConfig();
 player.sendMessage("§a[Shop Config] Category updated!");
 showCategoriesMenu(player);
}
async function showCategorySelector(player) {
 const form = new ActionFormData()
 .title("Select Category")
 .body("§7Select a category to manage items");
 for (const category of shopConfig.categories) {
 form.button(shopBtn(category.name.replace(/§l/g, ""), "Manage items"), category.icon);
 }
 form.button(shopBtn("Back", "Return to catalog"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return;
 if (response.selection < shopConfig.categories.length) {
 showItemsMenu(player, shopConfig.categories[response.selection].id);
 } else {
 showShopCatalogMenu(player);
 }
}
async function showItemsMenu(player, categoryId) {
	const items = shopConfig.items[categoryId] || [];
	const form = new ActionFormData()
		.title("Items")
		.body(`§7Manage items (${items.length} items)`);
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const currencyTag = shopSettings.currencyMode === "dual"
			? (item.currencyType === "coin" ? " §6[C]" : " §a[$]")
			: "";
		const buy = getEffectivePrice(item);
		const priceSub = item.command
			? `Buy: ${buy} §8[CMD]`
			: (buy !== item.cost
				? `Buy ${item.cost}→${buy} Sell ${item.sell}`
				: `Buy: ${item.cost} Sell: ${item.sell}`);
		form.button(shopBtn(`${item.name.replace(/§l/g, "")}${currencyTag}`, priceSub), item.textures);
	}
	form.button(shopBtn("§2Add New Item", "Quick add"), "textures/ui/color_plus.png");
	form.button(shopBtn("Back", "Return to categories"), "textures/ui/arrow_left.png");
	const response = await form.show(player);
	if (response.canceled) return;
	if (response.selection < items.length) {
		editItem(player, categoryId, response.selection);
	} else if (response.selection === items.length) {
		showAddItemMenu(player, categoryId);
	} else {
		showCategorySelector(player);
	}
}
async function showAddItemMenu(player, categoryId) {
	const invItems = collectInventoryShopItems(player);
	const form = new ActionFormData()
		.title("Add Item")
		.body(invItems.length
			? `§7${invItems.length} item(s) in inventory\n§8Pick "Add from inventory" for quick add`
			: "§7Inventory empty — type an ID manually\n§8e.g. §fminecraft:stick §8or §fkwd:item01")
		.button(shopBtn("Add from inventory", invItems.length ? `${invItems.length} item(s)` : "Empty"), "textures/ui/inventory_icon")
		.button(shopBtn("Type item ID", "minecraft:stick, kwd:item01"), "textures/ui/icon_book_writable.png")
		.button(shopBtn("Custom Command", "/give @s, /say, /tag..."), "textures/blocks/command_block")
		.button(shopBtn("Advanced", "Texture, data, enchants"), "textures/ui/gear.png")
		.button(shopBtn("Back", "Return to items"), "textures/ui/arrow_left.png");
	const response = await form.show(player);
	if (response.canceled) return showItemsMenu(player, categoryId);
	switch (response.selection) {
		case 0: {
			const item = await pickInventoryShopItem(player);
			if (!item) {
				if (!invItems.length) player.sendMessage("§c[Shop] Inventory is empty.");
				return showAddItemMenu(player, categoryId);
			}
			return createItemSimple(player, categoryId, item);
		}
		case 1:
			return createItemSimple(player, categoryId, null);
		case 2:
			return createItemCommand(player, categoryId);
		case 3:
			return createItemAdvanced(player, categoryId);
		default:
			return showItemsMenu(player, categoryId);
	}
}

async function createItemCommand(player, categoryId) {
	loadShopSettings();
	const isDual = shopSettings.currencyMode === "dual";
	const form = new ModalFormData()
		.title("Add Command Item")
		.textField(shopField("Shop name", "e.g. VIP Rank, 64x Diamond, Fly Buff"), "VIP Rank", { defaultValue: "VIP Rank" })
		.textField(shopField("Command(s)", "e.g. /give @s diamond 64 or /say @s bought VIP!"), "/give @s diamond 64", { defaultValue: "/give @s diamond 64" })
		.textField(shopField("Texture path / Icon", "e.g. textures/blocks/command_block or diamond"), "textures/blocks/command_block", { defaultValue: "textures/blocks/command_block" })
		.textField(shopField("Buy price"), "500", { defaultValue: "500" })
		.toggle(shopField("Cannot be sold", "Command items cannot be sold back"), { defaultValue: true });
	if (isDual) {
		form.dropdown(shopField("Currency", "Money or Coin"), ["Money", "Coin"], { defaultValueIndex: 0 });
	}
	const response = await form.show(player);
	if (response.canceled) return showAddItemMenu(player, categoryId);
	let fv = response.formValues;
	let idx = 0;
	const nameRaw = fv[idx++];
	const commandRaw = fv[idx++];
	const texturesRaw = fv[idx++];
	const costRaw = fv[idx++];
	const notsold = fv[idx++];
	let currencyType = "money";
	if (isDual) {
		currencyType = fv[idx++] === 1 ? "coin" : "money";
	}
	const name = nameRaw?.trim();
	const command = commandRaw?.trim();
	if (!name || !command) {
		player.sendMessage("§c[Shop] Name and Command are required!");
		return createItemCommand(player, categoryId);
	}
	let textures = texturesRaw?.trim() || "textures/blocks/command_block";
	if (!textures.includes("/") && !textures.includes(".")) {
		textures = guessItemTexture(normalizeItemIdInput(textures)) || "textures/blocks/command_block";
	}
	const cost = parseInt(costRaw) || 1;
	const newItem = {
		name,
		item: "minecraft:command_block",
		textures,
		cost,
		sell: 0,
		data: 0,
		currencyType,
		notsold: Boolean(notsold),
		command,
	};
	shopConfig.items[categoryId].push(newItem);
	saveItemToDB(categoryId, newItem);
	saveShopConfig();
	player.sendMessage(`§a[Shop] Added command item §f${name} §a(§f${command}§a)`);
	showItemsMenu(player, categoryId);
}

async function createItemSimple(player, categoryId, preset) {
	loadShopSettings();
	const isDual = shopSettings.currencyMode === "dual";
	const defaults = preset ?? {
		typeId: "minecraft:stick",
		name: "Stick",
		textures: guessItemTexture("minecraft:stick"),
	};
	const form = new ModalFormData()
		.title("Add Item")
		.textField(shopField("Item ID", "namespace:id — minecraft:stick, kwd:item01"), "minecraft:stick", { defaultValue: defaults.typeId })
		.textField(shopField("Shop name"), "Stick", { defaultValue: defaults.name })
		.textField(shopField("Buy price"), "100", { defaultValue: "100" })
		.textField(shopField("Sell price"), "50", { defaultValue: "50" });
	if (isDual) {
		form.dropdown(shopField("Currency", "Money or Coin"), ["Money", "Coin"], { defaultValueIndex: 0 });
	}
	const response = await form.show(player);
	if (response.canceled) return showAddItemMenu(player, categoryId);
	let fv = response.formValues;
	let idx = 0;
	const itemIdRaw = fv[idx++];
	const nameRaw = fv[idx++];
	const costRaw = fv[idx++];
	const sellRaw = fv[idx++];
	let currencyType = "money";
	if (isDual) currencyType = fv[idx++] === 1 ? "coin" : "money";
	const itemId = normalizeItemIdInput(itemIdRaw);
	const name = nameRaw.trim() || formatTypeIdName(itemId);
	if (!itemId) {
		player.sendMessage("§c[Shop] Item ID required (e.g. minecraft:stick)");
		return createItemSimple(player, categoryId, preset);
	}
	const textures = preset?.textures && normalizeItemIdInput(itemIdRaw) === preset.typeId
		? preset.textures
		: guessItemTexture(itemId, preset?.stack ?? null);
	const newItem = {
		name,
		item: itemId,
		textures,
		cost: parseInt(costRaw) || 1,
		sell: parseInt(sellRaw) || 0,
		data: preset?.data ?? 0,
		currencyType,
	};
	shopConfig.items[categoryId].push(newItem);
	saveItemToDB(categoryId, newItem);
	saveShopConfig();
	player.sendMessage(`§a[Shop] Added §f${name} §a(§f${itemId}§a)`);
	showItemsMenu(player, categoryId);
}

async function createItemAdvanced(player, categoryId) {
	loadShopSettings();
	const isDual = shopSettings.currencyMode === "dual";
	const form = new ModalFormData()
		.title("Add Item (Advanced)")
		.textField(shopField("Shop name"), "Diamond Sword", { defaultValue: "Diamond Sword" })
		.textField(shopField("Item ID", "minecraft:diamond_sword or stick"), "minecraft:diamond_sword", { defaultValue: "minecraft:diamond_sword" })
		.textField(shopField("Texture path"), "textures/items/diamond_sword.png", { defaultValue: "textures/items/diamond_sword.png" })
		.textField(shopField("Buy price"), "1000", { defaultValue: "1000" })
		.textField(shopField("Sell price"), "500", { defaultValue: "500" })
		.textField(shopField("Data value", "0-15 for variants"), "0", { defaultValue: "0" })
		.toggle(shopField("Cannot be sold"), { defaultValue: false });
	if (isDual) {
		form.dropdown(shopField("Currency", "Money or Coin"), ["Money", "Coin"], { defaultValueIndex: 0 });
	}
	form.textField(shopField("Enchantments", "sharpness:5,unbreaking:3"), "", { defaultValue: "" })
		.textField(shopField("Custom Command (Optional)", "Run command upon purchase e.g. /give @s diamond 64"), "", { defaultValue: "" });
	const response = await form.show(player);
	if (response.canceled) { showAddItemMenu(player, categoryId); return; }
	let fv = response.formValues;
	let idx = 0;
	const nameRaw = fv[idx++];
	const itemIdRaw = fv[idx++];
	const texturesRaw = fv[idx++];
	const costRaw = fv[idx++];
	const sellRaw = fv[idx++];
	const dataRaw = fv[idx++];
	const notsold = fv[idx++];
	let currencyType = "money";
	if (isDual) {
		currencyType = fv[idx++] === 1 ? "coin" : "money";
	}
	const enchantmentsRaw = fv[idx++];
	const commandRaw = fv[idx++];
	const name = nameRaw.trim();
	const item = normalizeItemIdInput(itemIdRaw);
	const textures = texturesRaw.trim() || guessItemTexture(item);
	if (!name || !item) {
		player.sendMessage("§c[Shop] Name and Item ID required!");
		return createItemAdvanced(player, categoryId);
	}
	const cost = parseInt(costRaw) || 1;
	const sell = parseInt(sellRaw) || 0;
	const data = parseInt(dataRaw) || 0;
	const enchantments = enchantmentsRaw?.trim();
	const command = commandRaw?.trim();
	const newItem = {
		name,
		item,
		textures,
		cost,
		sell,
		data,
		currencyType,
		...(notsold && { notsold: true }),
		...(enchantments && { enchantments }),
		...(command && { command }),
	};
	shopConfig.items[categoryId].push(newItem);
	saveItemToDB(categoryId, newItem);
	saveShopConfig();
	player.sendMessage("§a[Shop Config] Item created!");
	showItemsMenu(player, categoryId);
}
async function editItem(player, categoryId, index) {
	loadShopSettings();
	const isDual = shopSettings.currencyMode === "dual";
	const raw = shopConfig.items[categoryId]?.[index];
	const item = normalizeShopItem(raw);
	if (!item) {
		player.sendMessage("§c[Shop] Item not found or invalid.");
		return showItemsMenu(player, categoryId);
	}
	const currentCurrencyIndex = item.currencyType === "coin" ? 1 : 0;
	const form = new ModalFormData()
		.title("Edit Item")
		.textField(shopField("Shop name"), "Display name", { defaultValue: item.name })
		.textField(shopField("Item ID", "minecraft:stick"), "minecraft:stick", { defaultValue: item.item })
		.textField(shopField("Texture path"), "textures/items/...", { defaultValue: item.textures })
		.textField(shopField("Buy price"), "100", { defaultValue: String(item.cost) })
		.textField(shopField("Sell price"), "50", { defaultValue: String(item.sell) })
		.textField(shopField("Data value"), "0", { defaultValue: String(item.data) })
		.toggle(shopField("Cannot be sold"), { defaultValue: item.notsold || false });
	if (isDual) {
		form.dropdown(shopField("Currency", "Money or Coin"), ["Money", "Coin"], { defaultValueIndex: currentCurrencyIndex });
	}
	form.textField(shopField("Enchantments", "sharpness:5"), "sharpness:5", { defaultValue: item.enchantments || "" })
		.textField(shopField("Custom Command (Optional)", "e.g. /give @s diamond 64 or /say ..."), item.command || "", { defaultValue: item.command || "" })
		.toggle("§cDelete Item", { defaultValue: false });
	const response = await form.show(player);
	if (response.canceled) { showItemsMenu(player, categoryId); return; }
	let fv = response.formValues;
	let idx = 0;
	const nameRaw = fv[idx++];
	const itemIdRaw = fv[idx++];
	const texturesRaw = fv[idx++];
	const costRaw = fv[idx++];
	const sellRaw = fv[idx++];
	const dataRaw = fv[idx++];
	const notsold = fv[idx++];
	let currencyType = item.currencyType || "money";
	if (isDual) {
		currencyType = fv[idx++] === 1 ? "coin" : "money";
	}
	const enchantmentsRaw = fv[idx++];
	const commandRaw = fv[idx++];
	const shouldDelete = fv[idx++];
	if (shouldDelete) {
		shopConfig.items[categoryId].splice(index, 1);
		if (dbMeta.itemCounts[categoryId] && dbMeta.itemCounts[categoryId] > 0) {
			dbMeta.itemCounts[categoryId]--;
			world.setDynamicProperty("shop_db_meta", JSON.stringify(dbMeta));
		}
		saveShopConfig();
		player.sendMessage("§a[Shop Config] Item deleted!");
		showItemsMenu(player, categoryId);
		return;
	}
	const name = nameRaw.trim();
	const itemId = normalizeItemIdInput(itemIdRaw);
	const textures = texturesRaw.trim() || guessItemTexture(itemId);
	if (!name || !itemId) {
		player.sendMessage("§c[Shop] Name and Item ID required!");
		editItem(player, categoryId, index);
		return;
	}
	const cost = parseInt(costRaw) || 1;
	const sell = parseInt(sellRaw) || 0;
	const data = parseInt(dataRaw) || 0;
	const enchantments = enchantmentsRaw?.trim();
	const command = commandRaw?.trim();
	const updated = normalizeShopItem({ name, item: itemId, textures, cost, sell, data, currencyType, notsold, enchantments, command });
	if (!updated) {
		player.sendMessage("§c[Shop] Name and Item ID required!");
		return editItem(player, categoryId, index);
	}
	shopConfig.items[categoryId][index] = updated;
	saveShopConfig();
	player.sendMessage("§a[Shop Config] Item updated!");
	showItemsMenu(player, categoryId);
}
async function showResetOptionsMenu(player) {
 const form = new ActionFormData()
 .title("§cDanger Zone")
 .body("§c§lWarning!§r\n§7Resetting overwrites shop data.\n§7Choose carefully:")
 .button(shopBtn("§cCategories Only", "Keep custom items"), "textures/ui/refresh_light.png")
 .button(shopBtn("§6Items Only", "Keep categories"), "textures/ui/refresh_light.png")
 .button(shopBtn("§4Reset All", "Categories + items"), "textures/ui/refresh_light.png")
 .button(shopBtn("Cancel", "Back to tools"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return showShopToolsMenu(player);
 const actions = [
 () => confirmResetCategories(player),
 () => confirmResetItems(player),
 () => confirmResetEverything(player),
 () => showShopToolsMenu(player),
 ];
 actions[response.selection]?.();
}
async function confirmResetCategories(player) {
 const form = new ActionFormData()
 .title("Reset Categories")
 .body("§c§lWarning!§r\nThis will reset all categories to default.\nCustom categories will be lost, but custom items will be preserved.\n\nContinue?")
 .button(shopBtn("§cReset Categories", "Confirm"), "textures/ui/refresh_light.png")
 .button(shopBtn("Cancel", "Return to options"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return;
 if (response.selection === 0) {
 if (resetCategories()) {
 player.sendMessage("§a[Shop Config] Categories reset to default successfully!");
 } else {
 player.sendMessage("§c[Shop Config] Failed to reset categories!");
 }
 showShopToolsMenu(player);
 } else {
 showResetOptionsMenu(player);
 }
}
async function confirmResetItems(player) {
 const form = new ActionFormData()
 .title("Reset Items")
 .body("§c§lWarning!§r\nThis will reset all items in all categories to default.\nCustom items will be lost, but custom categories will be preserved.\n\nContinue?")
 .button(shopBtn("§6Reset Items", "Confirm"), "textures/ui/refresh_light.png")
 .button(shopBtn("Cancel", "Return to options"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return;
 if (response.selection === 0) {
 if (resetItems()) {
 player.sendMessage("§a[Shop Config] Items reset to default successfully!");
 } else {
 player.sendMessage("§c[Shop Config] Failed to reset items!");
 }
 showShopToolsMenu(player);
 } else {
 showResetOptionsMenu(player);
 }
}
async function confirmResetEverything(player) {
 const form = new ActionFormData()
 .title("Reset Everything")
 .body("§c§lWarning!§r\nThis will reset the entire shop configuration to default.\nAll custom categories and items will be lost.\n\nContinue?")
 .button(shopBtn("§4Reset Everything", "Confirm"), "textures/ui/refresh_light.png")
 .button(shopBtn("Cancel", "Return to options"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (response.canceled) return;
 if (response.selection === 0) {
 if (forceResetShopConfig()) {
 player.sendMessage("§a[Shop Config] Configuration reset to default successfully!");
 } else {
 player.sendMessage("§c[Shop Config] Failed to reset configuration!");
 }
 showShopToolsMenu(player);
 } else {
 showResetOptionsMenu(player);
 }
}
function resetCategories() {
 try {
 const currentItems = JSON.parse(JSON.stringify(shopConfig.items));
 shopConfig.categories = JSON.parse(
 JSON.stringify(DEFAULT_SHOP_CONFIG.categories),
 );
 for (const dbName of dbMeta.categoryDBs || []) {
 world.setDynamicProperty(dbName, "[]");
 }
 dbMeta.categoryDBs = [`${DB_PREFIX.CATEGORY}_0`];
 dbMeta.categoryCount = 0;
 shopConfig.items = {};
 for (const category of shopConfig.categories) {
 if (currentItems[category.id]) {
 shopConfig.items[category.id] = currentItems[category.id];
 } else {
 shopConfig.items[category.id] = JSON.parse(
 JSON.stringify(DEFAULT_SHOP_CONFIG.items[category.id] || []),
 );
 }
 }
 if (saveShopConfig()) {
 console.log("[Shop Config] Categories reset successfully");
 return true;
 }
 return false;
 } catch (e) {
 console.error("[Shop Config] Error resetting categories:", e);
 return false;
 }
}
function resetItems() {
 try {
 for (const category of shopConfig.categories) {
 if (DEFAULT_SHOP_CONFIG.items[category.id]) {
 shopConfig.items[category.id] = JSON.parse(
 JSON.stringify(DEFAULT_SHOP_CONFIG.items[category.id]),
 );
 } else {
 shopConfig.items[category.id] = [];
 }
 }
 for (const categoryId in dbMeta.itemDBs || {}) {
 for (const dbName of dbMeta.itemDBs[categoryId] || []) {
 world.setDynamicProperty(dbName, "[]");
 }
 }
 dbMeta.itemDBs = {};
 dbMeta.itemCounts = {};
 if (saveShopConfig()) {
 console.log("[Shop Config] Items reset successfully");
 return true;
 }
 return false;
 } catch (e) {
 console.error("[Shop Config] Error resetting items:", e);
 return false;
 }
}
async function showDBInfo(player) {
 const totalCategories = shopConfig.categories.length;
 let totalItems = 0;
 for (const catId in shopConfig.items) {
 totalItems += shopConfig.items[catId].length;
 }
 const categoryDBCount = dbMeta.categoryDBs.length;
 let itemDBCount = 0;
 for (const catId in dbMeta.itemDBs) {
 itemDBCount += dbMeta.itemDBs[catId].length;
 }
 let infoText = `§7§lDatabase Usage Info\n\n`;
 infoText += `§fTotal Categories: §a${totalCategories}\n`;
 infoText += `§fTotal Items: §a${totalItems}\n\n`;
 infoText += `§fCategory DB Count: §a${categoryDBCount}\n`;
 infoText += `§fItem DB Count: §a${itemDBCount}\n\n`;
 infoText += `§fCategory DBs:\n`;
 for (const dbName of dbMeta.categoryDBs) {
 infoText += `§8- §f${dbName}\n`;
 }
 infoText += `\n§fItem DBs:\n`;
 for (const catId in dbMeta.itemDBs) {
 const catName =
 shopConfig.categories.find((c) => c.id === catId)?.name || catId;
 infoText += `§8- §f${catName}: §a${dbMeta.itemDBs[catId].length} §fdatabases\n`;
 }
 const form = new ActionFormData()
 .title("Database Info")
 .body(infoText)
 .button(shopBtn("Back", "Return to tools"), "textures/ui/arrow_left.png");
 const response = await form.show(player);
 if (!response.canceled) {
 showShopToolsMenu(player);
 }
}
