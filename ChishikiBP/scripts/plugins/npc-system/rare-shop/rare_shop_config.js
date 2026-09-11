import { world } from '../../../core.js';
import { GlobalConfig } from "../../../function/GlobalConfig.js";

const STOCK_MODE_KEY = "rs:mode";
const RESTOCK_INTERVAL_KEY = "rs:interval";
const CURRENCY_MODE_KEY = "rs:currency_mode";

const DEFAULT_CONFIG = {
 stockMode: "global",
 restockInterval: 3600,
 currencyMode: "dual",
 lastRestock: 0,
 rarities: {
 "COMMON": { color: "§f", display: "Common", value: 1 },
 "UNCOMMON": { color: "§a", display: "Uncommon", value: 2 },
 "RARE": { color: "§b", display: "Rare", value: 3 },
 "EPIC": { color: "§5", display: "Epic", value: 4 },
 "LEGENDARY": { color: "§6", display: "Legendary", value: 5 },
 "MYTHIC": { color: "§d", display: "Mythic", value: 6 }
 },
 items: [
 {
 id: "minecraft:elytra",
 name: "Ancient Wings",
 price: 100000,
 rarity: "LEGENDARY",
 texture: "textures/items/elytra",
 description: "Wings found in the End Cities.",
 amount: 1,
 maxStock: 3,
 stock: 3
 },
 {
 id: "minecraft:nether_star",
 name: "Star of the Void",
 price: 500000,
 rarity: "MYTHIC",
 texture: "textures/items/nether_star",
 description: "A powerful star dropped by the Wither.",
 amount: 1,
 maxStock: 1,
 stock: 1
 }
 ]
};

export const RareShopConfig = {
 get: () => {
 try {
 const data = GlobalConfig.get("rare_shop_config");
 const config = data
 ? (typeof data === "string" ? JSON.parse(data) : JSON.parse(JSON.stringify(data)))
 : JSON.parse(JSON.stringify(DEFAULT_CONFIG));

 const savedMode = world.getDynamicProperty(STOCK_MODE_KEY);
 config.stockMode = savedMode || config.stockMode || "global";

 const savedInterval = world.getDynamicProperty(RESTOCK_INTERVAL_KEY);
 config.restockInterval = savedInterval ? parseInt(savedInterval) : (config.restockInterval || 3600);

 const savedCurrencyMode = world.getDynamicProperty(CURRENCY_MODE_KEY);
 config.currencyMode = savedCurrencyMode || config.currencyMode || "dual";

 if (!config.lastRestock) config.lastRestock = 0;
 config.items.forEach(item => {
 if (item.maxStock === undefined) item.maxStock = item.stock || 1;
 });
 return config;
 } catch (e) {
 console.warn("Failed to load rare shop config:", e);
 return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
 }
 },
 save: (config) => {
 try {
 world.setDynamicProperty(STOCK_MODE_KEY, config.stockMode || "global");
 world.setDynamicProperty(RESTOCK_INTERVAL_KEY, String(config.restockInterval || 3600));
 world.setDynamicProperty(CURRENCY_MODE_KEY, config.currencyMode || "dual");
 GlobalConfig.set("rare_shop_config", config);
 return true;
 } catch (e) {
 console.warn("Failed to save rare shop config:", e);
 return false;
 }
 },
 getCurrencyMode: () => {
 try {
 return world.getDynamicProperty(CURRENCY_MODE_KEY) || "dual";
 } catch (e) {
 return "dual";
 }
 },
 setCurrencyMode: (mode) => {
 try {
 world.setDynamicProperty(CURRENCY_MODE_KEY, mode);
 return true;
 } catch (e) {
 console.warn("Failed to save currency mode:", e);
 return false;
 }
 }
};
