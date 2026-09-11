import { system, world, ItemStack, ActionFormData, ModalFormData, MessageFormData } from '../../../core.js';
import {
 getFullMoney,
 removeMoney,
 getFormattedMoney,
 formatMoneyValue,
} from "../../../function/moneySystem.js";
import {
 getPlayerCoins,
 addPlayerCoins,
 removePlayerCoins,
} from "../../tf-money/tf-money.js";
import { ForceOpen, metricNumbers } from "../../../lib/game.js";
import { RareShopConfig } from "./rare_shop_config.js";
const UI_TEXTURES = {
 gear: "textures/ui/gear",
 check: "textures/ui/check",
 cancel: "textures/ui/cancel",
 plus: "textures/ui/plus",
 pencil: "textures/ui/anvil_icon",
 color_picker: "textures/ui/color_picker",
 arrow_left: "textures/ui/arrow_left",
};
const RESTOCK_TIME_KEY = "rs:last_restock";
let _lastRestockTime = 0;
let _restockInterval = 3600;
system.run(() => {
 try {
 const config = RareShopConfig.get();
 _restockInterval = config.restockInterval || 3600;
 const raw = world.getDynamicProperty(RESTOCK_TIME_KEY);
 if (raw) {
 _lastRestockTime = parseInt(raw);
 } else {
 _lastRestockTime = Math.floor(Date.now() / 1000);
 world.setDynamicProperty(RESTOCK_TIME_KEY, String(_lastRestockTime));
 }
 } catch { _lastRestockTime = Math.floor(Date.now() / 1000); }
});
function _saveRestockTime(ts) {
 _lastRestockTime = ts;
 try { world.setDynamicProperty(RESTOCK_TIME_KEY, String(ts)); } catch { }
}
export function getRareShopCountdownText() {
 const config = RareShopConfig.get();
 const interval = config.restockInterval || _restockInterval;
 const now = Math.floor(Date.now() / 1000);
 const remaining = interval - (now - _lastRestockTime);
 if (remaining <= 0) return "§aRestock: §eNow!";
 const h = Math.floor(remaining / 3600);
 const m = Math.floor((remaining % 3600) / 60);
 const s = remaining % 60;
 if (h > 0) return `§aRestock: §e${h}h ${m}m`;
 if (m > 0) return `§aRestock: §e${m}m ${s}s`;
 return `§aRestock: §e${s}s`;
}
function checkAndRestock() {
 try {
 const config = RareShopConfig.get();
 _restockInterval = config.restockInterval || 3600;
 const now = Math.floor(Date.now() / 1000);
 const elapsed = now - _lastRestockTime;
 if (elapsed >= _restockInterval) {
 config.items.forEach(item => { item.stock = item.maxStock || 1; });
 if (config.stockMode === "per_player") {
 world.setDynamicProperty("rare_shop_player_stocks", "{}");
 }
 RareShopConfig.save(config);
 _saveRestockTime(now);
 return true;
 }
 return false;
 } catch {
 return false;
 }
}

function getPlayerStock(item, playerName) {
 try {
 const raw = world.getDynamicProperty("rare_shop_player_stocks");
 const data = raw ? JSON.parse(raw) : {};
 const key = `${playerName}::${item.id}`;
 return data[key] !== undefined ? data[key] : (item.maxStock || 1);
 } catch {
 return item.maxStock || 1;
 }
}
function setPlayerStock(item, playerName, newStock) {
 try {
 const raw = world.getDynamicProperty("rare_shop_player_stocks");
 const data = raw ? JSON.parse(raw) : {};
 const key = `${playerName}::${item.id}`;
 data[key] = newStock;
 world.setDynamicProperty("rare_shop_player_stocks", JSON.stringify(data));
 } catch (e) {
 console.warn("Failed to set player stock:", e);
 }
}
function getEffectiveStock(item, player, config) {
 if (config.stockMode === "per_player") {
 return getPlayerStock(item, player.name);
 }
 return typeof item.stock === "number" ? item.stock : 0;
}
function getCurrencyLabel(currencyType) {
 return currencyType === "coin" ? "Coin" : "Money";
}
function getCurrencyColor(currencyType) {
 return currencyType === "coin" ? "§6" : "§a";
}
function isCurrencyEnabled(currencyType, currencyMode) {
 if (currencyMode === "dual") return true;
 return currencyMode === currencyType;
}
function getCurrencyOptions(currencyMode) {
 if (currencyMode === "money") return ["Money"];
 if (currencyMode === "coin") return ["Coin"];
 return ["Money", "Coin"];
}
function getCurrencyIndex(currencyType, currencyMode) {
 if (currencyMode === "money") return 0;
 if (currencyMode === "coin") return 0;
 return currencyType === "coin" ? 1 : 0;
}
class RareShop {
 static isAdmin(player) {
 return player.hasTag("admin");
 }
 static getRarityColor(rarityName, config) {
 return config.rarities[rarityName]?.color || "§f";
 }
 static async showMainMenu(player) {
 try {
 checkAndRestock();
 const config = RareShopConfig.get();
 const form = new ActionFormData();
 form.title("Rare Shop");
 const countdown = getRareShopCountdownText();
 const modeLabel = config.stockMode === "per_player" ? "§bMode: Per Player" : "§7Mode: Global";
 const currencyMode = config.currencyMode || "dual";
 let balanceText = "§7Your Balance:\n";
 if (currencyMode === "dual" || currencyMode === "money") {
 balanceText += `§aMoney: ${getFormattedMoney(player)}\n`;
 }
 if (currencyMode === "dual" || currencyMode === "coin") {
 balanceText += `§6Coin: ${metricNumbers(getPlayerCoins(player).toString())}\n`;
 }
 form.body(
 `§7Welcome to the Limited Edition Shop.\n§7Exclusive items with limited stock.\n\n${balanceText}\n${modeLabel}\n${countdown}`,
 );
 const isPlayerAdmin = this.isAdmin(player);
 if (isPlayerAdmin) {
 form.button("§cAdmin Settings\n§7Manage Shop", UI_TEXTURES.gear);
 }
 for (const item of config.items) {
 const rarityColor = this.getRarityColor(item.rarity, config);
 const currencyType = item.currencyType || "money";
 const currencyLabel = getCurrencyLabel(currencyType);
 const currencyColor = getCurrencyColor(currencyType);
 const priceText = `${currencyColor}${currencyLabel} ${metricNumbers(item.price)}`;
 const stock = getEffectiveStock(item, player, config);
 let buttonText;
 if (stock > 0) {
 buttonText = `${rarityColor}${item.name}\n§r§7${priceText} §8| §e${stock} Left`;
 } else {
 buttonText = `§7${item.name}\n§cSOLD OUT`;
 }
 form.button(buttonText, item.texture);
 }
 const response = await ForceOpen(player, form);
 if (response.canceled) return;
 let index = response.selection;
 if (isPlayerAdmin) {
 if (index === 0) {
 RareShopAdmin.showMenu(player);
 return;
 }
 index--;
 }
 if (index >= 0 && index < config.items.length) {
 const selectedItem = config.items[index];
 const stock = getEffectiveStock(selectedItem, player, config);
 if (stock > 0) {
 this.showPurchaseConfirmation(player, selectedItem, index);
 } else {
 player.sendMessage("§cThis item is sold out!");
 this.showMainMenu(player);
 }
 }
 } catch (error) {
 console.error(`Error showing Rare Shop to ${player.name}:`, error);
 player.sendMessage("§cAn error occurred while opening the shop.");
 }
 }
 static async showPurchaseConfirmation(player, item, itemIndex) {
 const config = RareShopConfig.get();
 const freshItem = config.items[itemIndex];
 const stock = getEffectiveStock(freshItem, player, config);
 if (!freshItem || stock <= 0) {
 player.sendMessage("§cSorry! This item just went out of stock.");
 this.showMainMenu(player);
 return;
 }
 const rarityColor = this.getRarityColor(freshItem.rarity, config);
 const currencyType = freshItem.currencyType || "money";
 const isCoin = currencyType === "coin";
 const playerMoney = isCoin ? BigInt(getPlayerCoins(player)) : getFullMoney(player);
 const currencyLabel = getCurrencyLabel(currencyType);
 const currencyColor = getCurrencyColor(currencyType);
 const form = new ActionFormData();
 form.title(`Buy ${freshItem.name}`);
 let body = `§7You are about to purchase:\n\n`;
 body += `§7Name: ${rarityColor}${freshItem.name}\n`;
 body += `§7Rarity: ${rarityColor}${config.rarities[freshItem.rarity]?.display || freshItem.rarity}\n`;
 body += `§7Price: ${currencyColor}${currencyLabel} ${metricNumbers(freshItem.price)}\n`;
 body += `§7Stock Remaining: §e${stock}\n`;
 body += `§7Description: §f${freshItem.description || "No description"}\n`;
 body += `\n§7Your Balance:`;
 if (isCoin) {
 body += `\n§6Coin: ${metricNumbers(getPlayerCoins(player).toString())}`;
 } else {
 body += `\n§aMoney: ${formatMoneyValue(playerMoney)}`;
 }
 if (playerMoney < BigInt(freshItem.price)) {
 body += `\n\n§cINSUFFICIENT FUNDS`;
 }
 form.body(body);
 form.button("Confirm Purchase", UI_TEXTURES.check);
 form.button("Cancel", UI_TEXTURES.cancel);
 const response = await ForceOpen(player, form);
 if (response.canceled || response.selection === 1) {
 this.showMainMenu(player);
 return;
 }
 if (response.selection === 0) {
 this.processPurchase(player, itemIndex);
 }
 }
 static processPurchase(player, itemIndex) {
 const config = RareShopConfig.get();
 const item = config.items[itemIndex];
 if (!item) {
 player.sendMessage("§cPurchase failed: Item not found.");
 return;
 }
 const stock = getEffectiveStock(item, player, config);
 if (stock <= 0) {
 player.sendMessage("§cPurchase failed: Item is out of stock.");
 return;
 }
 const currencyType = item.currencyType || "money";
 const isCoin = currencyType === "coin";
 const price = BigInt(item.price);
 let balance;
 let hasEnough;
 if (isCoin) {
 balance = BigInt(getPlayerCoins(player));
 hasEnough = balance >= price;
 } else {
 balance = getFullMoney(player);
 hasEnough = balance >= price;
 }
 if (!hasEnough) {
 const currencyLabel = getCurrencyLabel(currencyType);
 player.sendMessage(
 `§cYou don't have enough ${currencyLabel}. Required: ${currencyLabel} ${metricNumbers(item.price)}`,
 );
 return;
 }
 const inventory = player.getComponent("inventory")?.container;
 if (!inventory || inventory.emptySlotsCount < 1) {
 player.sendMessage("§cYour inventory is full!");
 return;
 }
 let deductSuccess;
 if (isCoin) {
 deductSuccess = removePlayerCoins(player, Number(item.price));
 } else {
 deductSuccess = removeMoney(player, item.price);
 }
 if (deductSuccess) {
 try {
 if (config.stockMode === "per_player") {
 setPlayerStock(item, player.name, stock - 1);
 } else {
 item.stock--;
 RareShopConfig.save(config);
 }
 inventory.addItem(new ItemStack(item.id, item.amount || 1));
 const currencyLabel = getCurrencyLabel(currencyType);
 const currencyColor = getCurrencyColor(currencyType);
 player.sendMessage(
 `§aSuccessfully purchased §r${item.name} §afor §r${currencyColor}${currencyLabel} ${metricNumbers(item.price)}`,
 );
 player.runCommand("playsound random.levelup @s");
 } catch (e) {
 console.warn(`Transaction error: ${e}`);
 player.sendMessage(`§cSystem error during purchase.`);
 }
 } else {
 player.sendMessage("§cTransaction failed (deduction error).");
 }
 }
}
class RareShopAdmin {
 static async showMenu(player) {
 const form = new ActionFormData();
 form.title("Rare Shop Admin");
 form.body("Manage items in the Rare Shop.");
 form.button("Add New Item", UI_TEXTURES.plus);
 form.button("Edit Items", UI_TEXTURES.pencil);
 form.button("Config Rarities", UI_TEXTURES.color_picker);
 form.button("§eRestock Settings\n§7Interval & Mode", UI_TEXTURES.gear);
 form.button("§bCurrency Settings\n§7Money/Coin Mode", UI_TEXTURES.color_picker);
 form.button("§aForce Restock Now", UI_TEXTURES.check);
 form.button("Back to Shop", UI_TEXTURES.arrow_left);
 const response = await ForceOpen(player, form);
 if (response.canceled) return;
 switch (response.selection) {
 case 0:
 this.showAddItem(player);
 break;
 case 1:
 this.showEditList(player);
 break;
 case 2:
 this.showRarityConfig(player);
 break;
 case 3:
 this.showRestockSettings(player);
 break;
 case 4:
 this.showCurrencySettings(player);
 break;
 case 5:
 this.forceRestock(player);
 break;
 case 6:
 RareShop.showMainMenu(player);
 break;
 }
 }
 static async showCurrencySettings(player) {
 const config = RareShopConfig.get();
 const currentMode = config.currencyMode || "dual";
 const modeIndex = currentMode === "money" ? 1 : currentMode === "coin" ? 2 : 0;
 const form = new ModalFormData();
 form.title("Currency Settings");
 form.dropdown("Currency Mode", ["Dual (Money + Coin)", "Money Only", "Coin Only"], { defaultValueIndex: modeIndex });
 const response = await ForceOpen(player, form);
 if (response.canceled) {
 this.showMenu(player);
 return;
 }
 const [selectedModeIndex] = response.formValues;
 const modes = ["dual", "money", "coin"];
 const newMode = modes[selectedModeIndex];
 config.currencyMode = newMode;
 if (RareShopConfig.save(config)) {
 player.sendMessage(`§aCurrency mode updated to: §e${newMode === "dual" ? "Dual (Money + Coin)" : newMode === "money" ? "Money Only" : "Coin Only"}`);
 } else {
 player.sendMessage("§cFailed to save currency settings.");
 }
 this.showMenu(player);
 }
 static async showRestockSettings(player) {
 const config = RareShopConfig.get();
 const currentMode = config.stockMode === "per_player" ? 1 : 0;
 const currentIntervalHours = Math.floor(config.restockInterval / 3600) || 1;
 const form = new ModalFormData();
 form.title("Restock Settings");
 form.dropdown("Stock Mode", ["Global (shared stock)", "Per Player (individual stock)"], { defaultValueIndex: currentMode });
 form.slider("Restock Interval (hours)", 1, 168, { valueStep: 1, defaultValue: currentIntervalHours });
 const response = await ForceOpen(player, form);
 if (response.canceled) {
 this.showMenu(player);
 return;
 }
 const [modeIndex, intervalHours] = response.formValues;
 config.stockMode = modeIndex === 1 ? "per_player" : "global";
 config.restockInterval = Math.floor(intervalHours) * 3600;
 if (RareShopConfig.save(config)) {
 player.sendMessage(`§aRestock settings updated! Mode: §e${config.stockMode}§a, Interval: §e${Math.floor(intervalHours)}h`);
 } else {
 player.sendMessage("§cFailed to save restock settings.");
 }
 this.showMenu(player);
 }
 static forceRestock(player) {
 const config = RareShopConfig.get();
 config.items.forEach(item => {
 item.stock = item.maxStock || 1;
 });
 if (config.stockMode === "per_player") {
 world.setDynamicProperty("rare_shop_player_stocks", "{}");
 }
 const now = Math.floor(Date.now() / 1000);
 _saveRestockTime(now);
 if (RareShopConfig.save(config)) {
 player.sendMessage("§aForce restock done! All items restocked.");
 } else {
 player.sendMessage("§cFailed to restock.");
 }
 this.showMenu(player);
 }
 static async showAddItem(player) {
 const config = RareShopConfig.get();
 const rarityKeys = Object.keys(config.rarities);
 const currencyMode = config.currencyMode || "dual";
 const currencyOptions = getCurrencyOptions(currencyMode);
 const form = new ModalFormData();
 form.title("Add New Rare Item");
 form.textField("Item Name (Display)", "Ex: God Sword");
 form.textField("Item ID (Minecraft/Custom)", "Ex: minecraft:diamond_sword");
 form.textField("Price", "Ex: 100000");
 if (currencyOptions.length > 1) {
 form.dropdown("Currency Type", currencyOptions, { defaultValueIndex: 0 });
 }
 form.dropdown(
 "Rarity",
 rarityKeys.map((k) => config.rarities[k].display),
 { defaultValueIndex: 0 },
 );
 form.textField("Texture Path (Optional)", "textures/items/diamond_sword");
 form.textField("Description", "Item lore/info");
 form.textField("Amount per Buy", "1", { defaultValue: "1" });
 form.textField("Max Stock", "5", { defaultValue: "5" });
 const response = await ForceOpen(player, form);
 if (response.canceled) {
 this.showMenu(player);
 return;
 }
 const formValues = response.formValues;
 let valueIndex = 0;
 const name = formValues[valueIndex++];
 const id = formValues[valueIndex++];
 const priceStr = formValues[valueIndex++];
 let currencyIndex = 0;
 if (currencyOptions.length > 1) {
 currencyIndex = formValues[valueIndex++];
 }
 const rarityIndex = formValues[valueIndex++];
 const texture = formValues[valueIndex++];
 const desc = formValues[valueIndex++];
 const amountStr = formValues[valueIndex++];
 const stockStr = formValues[valueIndex++];
 const price = parseInt(priceStr);
 const amount = parseInt(amountStr);
 const stock = parseInt(stockStr);
 if (!name || !id || isNaN(price) || isNaN(amount) || isNaN(stock)) {
 player.sendMessage(
 "§cInvalid input. Name, ID, Price, Amount, and Stock are required numbers.",
 );
 this.showMenu(player);
 return;
 }
 const newItem = {
 id: id.trim(),
 name: name.trim(),
 price: price,
 currencyType: currencyOptions[currencyIndex] === "Coin" ? "coin" : "money",
 rarity: rarityKeys[rarityIndex],
 texture: texture?.trim() || undefined,
 description: desc?.trim() || undefined,
 amount: amount,
 maxStock: stock,
 stock: stock,
 };
 config.items.push(newItem);
 if (RareShopConfig.save(config)) {
 player.sendMessage("§aItem added successfully!");
 this.showMenu(player);
 } else {
 player.sendMessage("§cFailed to save config.");
 }
 }
 static async showEditList(player) {
 const config = RareShopConfig.get();
 const form = new ActionFormData();
 form.title("Edit Items");
 form.body("Select an item to edit or delete.");
 config.items.forEach((item) => {
 const stock = item.stock !== undefined ? item.stock : 0;
 const currencyType = item.currencyType || "money";
 const currencyLabel = getCurrencyLabel(currencyType);
 form.button(`${item.name}\n§7${currencyLabel} ${metricNumbers(item.price)} | Stock: ${stock}/${item.maxStock || stock}`);
 });
 form.button("Back", UI_TEXTURES.arrow_left);
 const response = await ForceOpen(player, form);
 if (response.canceled || response.selection === config.items.length) {
 this.showMenu(player);
 return;
 }
 this.showEditItem(player, response.selection);
 }
 static async showEditItem(player, index) {
 const config = RareShopConfig.get();
 const item = config.items[index];
 if (!item) {
 this.showEditList(player);
 return;
 }
 const rarityKeys = Object.keys(config.rarities);
 const currentRarityIndex = rarityKeys.indexOf(item.rarity);
 const currencyMode = config.currencyMode || "dual";
 const currencyOptions = getCurrencyOptions(currencyMode);
 const currentCurrencyIndex = getCurrencyIndex(item.currencyType || "money", currencyMode);
 const form = new ModalFormData();
 form.title(`Edit: ${item.name}`);
 form.textField("Item Name", "", { defaultValue: item.name });
 form.textField("Item ID", "", { defaultValue: item.id });
 form.textField("Price", "", { defaultValue: item.price.toString() });
 if (currencyOptions.length > 1) {
 form.dropdown("Currency Type", currencyOptions, { defaultValueIndex: currentCurrencyIndex });
 }
 form.dropdown(
 "Rarity",
 rarityKeys.map((k) => config.rarities[k].display),
 { defaultValueIndex: currentRarityIndex !== -1 ? currentRarityIndex : 0 },
 );
 form.textField("Texture Path", "", { defaultValue: item.texture || "" });
 form.textField("Description", "", { defaultValue: item.description || "" });
 form.textField("Amount", "", {
 defaultValue: item.amount?.toString() || "1",
 });
 form.textField("Max Stock", "", {
 defaultValue: item.maxStock?.toString() || item.stock?.toString() || "1",
 });
 form.textField("Current Stock", "", {
 defaultValue: item.stock?.toString() || "0",
 });
 form.toggle("§cDELETE ITEM", { defaultValue: false });
 const response = await ForceOpen(player, form);
 if (response.canceled) {
 this.showEditList(player);
 return;
 }
 const formValues = response.formValues;
 let valueIndex = 0;
 const name = formValues[valueIndex++];
 const id = formValues[valueIndex++];
 const priceStr = formValues[valueIndex++];
 let currencyIndex = 0;
 if (currencyOptions.length > 1) {
 currencyIndex = formValues[valueIndex++];
 }
 const rarityIndex = formValues[valueIndex++];
 const texture = formValues[valueIndex++];
 const desc = formValues[valueIndex++];
 const amountStr = formValues[valueIndex++];
 const maxStockStr = formValues[valueIndex++];
 const stockStr = formValues[valueIndex++];
 const deleteItem = formValues[valueIndex++];
 if (deleteItem) {
 config.items.splice(index, 1);
 if (RareShopConfig.save(config)) {
 player.sendMessage("§cItem deleted.");
 this.showEditList(player);
 }
 return;
 }
 item.name = name.trim();
 item.id = id.trim();
 item.price = parseInt(priceStr);
 item.currencyType = currencyOptions[currencyIndex] === "Coin" ? "coin" : "money";
 item.rarity = rarityKeys[rarityIndex];
 item.texture = texture?.trim() || undefined;
 item.description = desc?.trim() || undefined;
 item.amount = parseInt(amountStr);
 item.maxStock = parseInt(maxStockStr);
 item.stock = parseInt(stockStr);
 if (RareShopConfig.save(config)) {
 player.sendMessage("§aItem updated.");
 this.showEditList(player);
 } else {
 player.sendMessage("§cFailed to save config.");
 }
 }
 static async showRarityConfig(player) {
 const config = RareShopConfig.get();
 const form = new ActionFormData();
 form.title("Config Rarities");
 form.body("Rarity Overview (Read-only in this version)");
 Object.entries(config.rarities).forEach(([key, val]) => {
 form.button(
 `${val.color}${val.display}\n§7Key: ${key}`,
 UI_TEXTURES.color_picker,
 );
 });
 form.button("Back", UI_TEXTURES.arrow_left);
 await ForceOpen(player, form);
 this.showMenu(player);
 }
}
system.runInterval(() => {
 checkAndRestock();
}, 1200);
export function showRareShop(player) {
 RareShop.showMainMenu(player);
}
export function showRareShopAdmin(player) {
 RareShopAdmin.showMenu(player);
}
