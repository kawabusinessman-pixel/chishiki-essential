import { world } from '../../../core.js';

export const DEFAULT_CONFIG = {
 categories: [
 { id: "weapons", name: "§6Weapons", icon: "textures/items/diamond_sword" },
 { id: "armor", name: "§bArmor", icon: "textures/items/diamond_chestplate" },
 { id: "tools", name: "§aTools", icon: "textures/items/diamond_pickaxe" },
 { id: "food", name: "§eFood", icon: "textures/items/beef_cooked" },
 { id: "ores", name: "§7Ores & Materials", icon: "textures/items/diamond" }
 ],
 items: {
 weapons: [
 { id: "minecraft:diamond_sword", name: "Diamond Sword", price: 500, amount: 1, icon: "textures/items/diamond_sword", type: "buy" },
 { id: "minecraft:netherite_sword", name: "Netherite Sword", price: 2000, amount: 1, icon: "textures/items/netherite_sword", type: "buy" },
 { id: "minecraft:bow", name: "Bow", price: 150, amount: 1, icon: "textures/items/bow_standby", type: "buy" }
 ],
 armor: [
 { id: "minecraft:diamond_helmet", name: "Diamond Helmet", price: 300, amount: 1, icon: "textures/items/diamond_helmet", type: "buy" },
 { id: "minecraft:diamond_chestplate", name: "Diamond Chestplate", price: 500, amount: 1, icon: "textures/items/diamond_chestplate", type: "buy" },
 { id: "minecraft:diamond_leggings", name: "Diamond Leggings", price: 400, amount: 1, icon: "textures/items/diamond_leggings", type: "buy" },
 { id: "minecraft:diamond_boots", name: "Diamond Boots", price: 300, amount: 1, icon: "textures/items/diamond_boots", type: "buy" }
 ],
 tools: [
 { id: "minecraft:diamond_pickaxe", name: "Diamond Pickaxe", price: 400, amount: 1, icon: "textures/items/diamond_pickaxe", type: "buy" },
 { id: "minecraft:diamond_axe", name: "Diamond Axe", price: 350, amount: 1, icon: "textures/items/diamond_axe", type: "buy" },
 { id: "minecraft:diamond_shovel", name: "Diamond Shovel", price: 300, amount: 1, icon: "textures/items/diamond_shovel", type: "buy" }
 ],
 food: [
 { id: "minecraft:cooked_beef", name: "Steak", price: 10, amount: 16, icon: "textures/items/beef_cooked", type: "both", sellPrice: 5 },
 { id: "minecraft:golden_apple", name: "Golden Apple", price: 100, amount: 1, icon: "textures/items/apple_golden", type: "buy" },
 { id: "minecraft:bread", name: "Bread", price: 5, amount: 8, icon: "textures/items/bread", type: "both", sellPrice: 2 }
 ],
 ores: [
 { id: "minecraft:diamond", name: "Diamond", price: 100, amount: 1, icon: "textures/items/diamond", type: "both", sellPrice: 80 },
 { id: "minecraft:iron_ingot", name: "Iron Ingot", price: 20, amount: 1, icon: "textures/items/iron_ingot", type: "both", sellPrice: 15 },
 { id: "minecraft:gold_ingot", name: "Gold Ingot", price: 40, amount: 1, icon: "textures/items/gold_ingot", type: "both", sellPrice: 30 },
 { id: "minecraft:netherite_scrap", name: "Netherite Scrap", price: 250, amount: 1, icon: "textures/items/netherite_scrap", type: "sell", sellPrice: 200 }
 ]
 }
};

export const NPCShopConfig = {
 get: (shopId = null) => {
 try {
 const key = shopId ? `custom_shop_config_${shopId}` : "custom_shop_config";
 const data = world.getDynamicProperty(key);
 if (!data && shopId) {
 const globalData = world.getDynamicProperty("custom_shop_config");
 return globalData ? JSON.parse(globalData) : JSON.parse(JSON.stringify(DEFAULT_CONFIG));
 }
 return data ? JSON.parse(data) : JSON.parse(JSON.stringify(DEFAULT_CONFIG));
 } catch (e) {
 console.warn("Failed to load npc shop config:", e);
 return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
 }
 },
 save: (config, shopId = null) => {
 try {
 const key = shopId ? `custom_shop_config_${shopId}` : "custom_shop_config";
 world.setDynamicProperty(key, JSON.stringify(config));
 return true;
 } catch (e) {
 console.warn("Failed to save npc shop config:", e);
 return false;
 }
 }
};
