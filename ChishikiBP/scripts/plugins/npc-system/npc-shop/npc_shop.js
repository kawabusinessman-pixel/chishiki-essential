import { ActionFormData, ModalFormData, MessageFormData, ItemStack } from '../../../core.js';
import {
 getFullMoney,
 removeMoney,
 addMoney,
 formatMoneyValue,
} from "../../../function/moneySystem.js";
import { ForceOpen, metricNumbers } from "../../../lib/game.js";
import { NPCShopConfig, DEFAULT_CONFIG } from "./npc_shop_config.js";

function getItemType(item) {
 return isCommandShopItem(item) ? "command" : (item.type || "buy");
}

function isCommandShopItem(item) {
 const command = String(item?.command || "").trim();
 const id = String(item?.id || "").trim();
 return item?.type === "command" || Boolean(command) || /\s/.test(id);
}

function getSellPrice(item) {
 return item.sellPrice ?? Math.floor((item.price || 0) * 0.5);
}

function itemTypeLabel(type) {
 switch (type) {
 case "buy": return "§a[Buy]";
 case "sell": return "§e[Sell]";
 case "both": return "§a[Buy]§7/§e[Sell]";
 case "command": return "§d[Command]";
 default: return "";
 }
}

function getItemCount(player, itemId) {
 const inventory = player.getComponent("inventory")?.container;
 if (!inventory) return 0;
 let total = 0;
 for (let i = 0; i < inventory.size; i++) {
 const slot = inventory.getItem(i);
 if (slot?.typeId === itemId) {
 total += slot.amount;
 }
 }
 return total;
}

function removeItemsFromInventory(player, itemId, count) {
 const inventory = player.getComponent("inventory")?.container;
 if (!inventory) return false;
 let remaining = count;
 for (let i = 0; i < inventory.size && remaining > 0; i++) {
 const slot = inventory.getItem(i);
 if (slot?.typeId === itemId) {
 if (slot.amount <= remaining) {
 inventory.setItem(i, undefined);
 remaining -= slot.amount;
 } else {
 slot.amount -= remaining;
 inventory.setItem(i, slot);
 remaining = 0;
 }
 }
 }
 return remaining === 0;
}

class NPCShop {
 static isAdmin(player) {
 return player.hasTag("admin");
 }

 static async showMainMenu(player, shopId) {
 const config = NPCShopConfig.get(shopId);
 const form = new ActionFormData();
 form.title("NPC Shop");
 form.body("§7Welcome to the Shop!\n§7Select a category to browse items.");

 if (this.isAdmin(player)) {
 form.button("§cAdmin Settings\n§7Manage Shop", "textures/ui/gear");
 }

 config.categories.forEach((cat) => {
 form.button(cat.name, cat.icon);
 });

 const response = await ForceOpen(player, form);
 if (response.canceled) return;

 let index = response.selection;
 if (this.isAdmin(player)) {
 if (index === 0) {
 NPCShopAdmin.showMenu(player, shopId);
 return;
 }
 index--;
 }

 if (index >= 0 && index < config.categories.length) {
 this.showCategoryMenu(player, config.categories[index], shopId);
 }
 }

 static async showCategoryMenu(player, category, shopId) {
 const config = NPCShopConfig.get(shopId);
 const items = config.items[category.id] || [];
 const form = new ActionFormData();
 form.title(category.name);
 form.body(`§7Browse ${category.name} items.`);

 items.forEach((item) => {
 const type = getItemType(item);
 const label = itemTypeLabel(type);
 let priceText;
 if (type === "buy" || type === "command") {
 priceText = `$${metricNumbers(item.price)}`;
 } else if (type === "sell") {
 priceText = `$${metricNumbers(getSellPrice(item))}`;
 } else {
 priceText = `§a$${metricNumbers(item.price)}§7/§e$${metricNumbers(getSellPrice(item))}`;
 }
 form.button(`${item.name}\n§7${label} ${priceText}`, item.icon);
 });

 form.button("§cBack", "textures/ui/arrow_left");

 const response = await ForceOpen(player, form);
 if (response.canceled || response.selection === items.length) {
 this.showMainMenu(player, shopId);
 return;
 }

 const selectedItem = items[response.selection];
 const type = getItemType(selectedItem);

 if (type === "both") {
 this.showBuyOrSell(player, selectedItem, category, shopId);
 } else if (type === "sell") {
 this.showSellConfirmation(player, selectedItem, category, shopId);
 } else {
 this.showPurchaseConfirmation(player, selectedItem, category, shopId);
 }
 }

 static async showBuyOrSell(player, item, category, shopId) {
 const form = new ActionFormData();
 form.title(item.name);
 form.body(`§7What would you like to do with §f${item.name}§7?`);

 form.button(`§aBuy §7$${metricNumbers(item.price)}`, "textures/ui/check");
 form.button(`§eSell §7$${metricNumbers(getSellPrice(item))} each`);
 form.button("§cCancel", "textures/ui/cancel");

 const response = await ForceOpen(player, form);
 if (response.canceled || response.selection === 2) {
 this.showCategoryMenu(player, category, shopId);
 return;
 }

 if (response.selection === 0) {
 this.showPurchaseConfirmation(player, item, category, shopId);
 } else {
 this.showSellConfirmation(player, item, category, shopId);
 }
 }

 static async showPurchaseConfirmation(player, item, category, shopId) {
 const playerMoney = getFullMoney(player);
 const form = new ActionFormData();
 form.title(`Buy ${item.name}`);
 let body = `§7You are about to purchase:\n\n`;
 body += `§7Item: §f${item.name}\n`;
 body += `§7Price: §a$${metricNumbers(item.price)}\n`;
 if (getItemType(item) === "command") {
 body += `§7Type: §dCommand\n`;
 } else {
 body += `§7Amount: §e${item.amount || 1}\n`;
 }
 body += `§7Category: §f${category.name}\n`;
 body += `\n§7Your Balance: §a$${formatMoneyValue(playerMoney)}`;
 if (playerMoney < item.price) {
 body += `\n\n§cINSUFFICIENT FUNDS`;
 }
 form.body(body);
 form.button("§aConfirm Purchase", "textures/ui/check");
 form.button("§cCancel", "textures/ui/cancel");

 const response = await ForceOpen(player, form);
 if (response.canceled || response.selection === 1) {
 this.showCategoryMenu(player, category, shopId);
 return;
 }
 if (response.selection === 0) {
 this.processPurchase(player, item, category, shopId);
 }
 }

 static async showSellConfirmation(player, item, category, shopId) {
 const sellPrice = getSellPrice(item);
 const playerHas = getItemCount(player, item.id);

 if (playerHas < 1) {
 player.sendMessage(`§cYou don't have any ${item.name} to sell.`);
 this.showCategoryMenu(player, category, shopId);
 return;
 }

 const maxSell = Math.min(playerHas, 9999);
 const form = new ModalFormData();
 form.title(`Sell ${item.name}`);
 form.slider(`§7You have §f${playerHas}x §7@ §e$${metricNumbers(sellPrice)} §7each`, 1, Math.max(maxSell, 1), 1, Math.min(item.amount || 1, maxSell || 1));

 const response = await ForceOpen(player, form);
 if (response.canceled) {
 this.showCategoryMenu(player, category, shopId);
 return;
 }

 const [amountToSell] = response.formValues;
 if (!amountToSell || amountToSell < 1) {
 player.sendMessage("§cInvalid amount.");
 this.showCategoryMenu(player, category, shopId);
 return;
 }

 const totalEarn = sellPrice * amountToSell;
 const form2 = new ActionFormData();
 form2.title(`Sell ${item.name}`);
 let body2 = `§7You are about to sell:\n\n`;
 body2 += `§7Item: §f${item.name}\n`;
 body2 += `§7Amount: §e${amountToSell}\n`;
 body2 += `§7Price: §e$${metricNumbers(sellPrice)} each\n`;
 body2 += `§7Total Earn: §a$${metricNumbers(totalEarn)}\n`;
 form2.body(body2);
 form2.button("§aConfirm Sell", "textures/ui/check");
 form2.button("§cCancel", "textures/ui/cancel");

 const response2 = await ForceOpen(player, form2);
 if (response2.canceled || response2.selection === 1) {
 this.showCategoryMenu(player, category, shopId);
 return;
 }

 if (response2.selection === 0) {
 this.processSell(player, item, amountToSell, sellPrice, category, shopId);
 }
 }

 static processPurchase(player, item, category, shopId) {
 if (getItemType(item) === "command") {
 this.processCommandPurchase(player, item, category, shopId);
 return;
 }
 const money = getFullMoney(player);
 if (money < item.price) {
 player.sendMessage(`§cYou don't have enough money. Required: $${metricNumbers(item.price)}`);
 this.showCategoryMenu(player, category, shopId);
 return;
 }

 const inventory = player.getComponent("inventory")?.container;
 if (!inventory || inventory.emptySlotsCount < 1) {
 player.sendMessage("§cYour inventory is full!");
 this.showCategoryMenu(player, category, shopId);
 return;
 }

 if (removeMoney(player, item.price)) {
 try {
 inventory.addItem(new ItemStack(item.id, item.amount || 1));
 player.sendMessage(`§aSuccessfully purchased §r${item.name} §afor §r$${metricNumbers(item.price)}`);
 player.runCommand("playsound random.levelup @s");
 } catch (e) {
 console.warn(`Transaction error: ${e}`);
 player.sendMessage("§cSystem error during purchase.");
 }
 } else {
 player.sendMessage("§cTransaction failed (Money deduction error).");
 }
 }

 static processCommandPurchase(player, item, category, shopId) {
 const money = getFullMoney(player);
 if (money < item.price) {
 player.sendMessage(`§cYou don't have enough money. Required: $${metricNumbers(item.price)}`);
 this.showCategoryMenu(player, category, shopId);
 return;
 }

 if (removeMoney(player, item.price)) {
 try {
  const command = String(item.command || item.id || "").trim();
  if (!command) throw new Error("Command item has no command configured");
  const cmd = command.replace(/@s\b/g, `@a[name="${player.name}"]`);
 player.dimension.runCommand(cmd);
 player.sendMessage(`§aSuccessfully purchased §r${item.name} §afor §r$${metricNumbers(item.price)}`);
 player.runCommand("playsound random.levelup @s");
 } catch (e) {
 console.warn(`Command purchase error: ${e}`);
 if (item.price > 0) addMoney(player, item.price);
 player.sendMessage("§cSystem error during purchase. Your money has been refunded.");
 }
 } else {
 player.sendMessage("§cTransaction failed (Money deduction error).");
 }
 }

 static processSell(player, item, amount, sellPrice, category, shopId) {
 const playerHas = getItemCount(player, item.id);
 if (playerHas < amount) {
 player.sendMessage(`§cYou don't have enough ${item.name}. You have: ${playerHas}`);
 this.showCategoryMenu(player, category, shopId);
 return;
 }

 if (removeItemsFromInventory(player, item.id, amount)) {
 if (addMoney(player, sellPrice * amount)) {
 const total = sellPrice * amount;
 player.sendMessage(`§aSuccessfully sold §r${amount}x ${item.name} §afor §r$${metricNumbers(total)}`);
 player.runCommand("playsound random.levelup @s");
 } else {
 player.sendMessage("§cTransaction failed (Money addition error).");
 try {
 const inventory = player.getComponent("inventory")?.container;
 if (inventory) {
 inventory.addItem(new ItemStack(item.id, amount));
 }
 } catch (e) {
 console.warn(`Refund error: ${e}`);
 }
 }
 } else {
 player.sendMessage("§cFailed to remove items from inventory.");
 }
 }
}

class NPCShopAdmin {
 static async showMenu(player, shopId) {
 const form = new ActionFormData();
 form.title("NPC Shop Admin");
 form.body(`Manage the NPC Shop.${shopId ? `\n§7Shop ID: ${shopId}` : ""}`);
 form.button("§aAdd Category", "textures/ui/color_plus");
 form.button("§eEdit Categories", "textures/ui/gear");
 form.button("§bAdd Item", "textures/ui/plus");
 form.button("§dEdit Items", "textures/ui/anvil_icon");
 form.button("§cReset Shop", "textures/ui/redX1");
 form.button("Back to Shop", "textures/ui/arrow_left");

 const response = await ForceOpen(player, form);
 if (response.canceled) return;
 switch (response.selection) {
 case 0: this.showAddCategory(player, shopId); break;
 case 1: this.showEditCategories(player, shopId); break;
 case 2: this.showAddItem(player, shopId); break;
 case 3: this.showEditItems(player, shopId); break;
 case 4: this.showResetConfirm(player, shopId); break;
 case 5: NPCShop.showMainMenu(player, shopId); break;
 }
 }

 static async showAddCategory(player, shopId) {
 const form = new ModalFormData();
 form.title("Add New Category");
 form.textField("Category ID", "weapons");
 form.textField("Display Name", "§6Weapons");
 form.textField("Icon Texture", "textures/items/diamond_sword");

 const response = await ForceOpen(player, form);
 if (response.canceled) { this.showMenu(player, shopId); return; }

 const [id, name, icon] = response.formValues;
 if (!id || !name) {
 player.sendMessage("§cCategory ID and Name are required.");
 this.showAddCategory(player, shopId);
 return;
 }

 const config = NPCShopConfig.get(shopId);
 if (config.categories.find((c) => c.id === id)) {
 player.sendMessage("§cCategory ID already exists.");
 this.showAddCategory(player, shopId);
 return;
 }

 config.categories.push({
 id: id.trim(),
 name: name.trim(),
 icon: icon?.trim() || "textures/ui/unknown",
 });
 config.items[id.trim()] = [];

 if (NPCShopConfig.save(config, shopId)) {
 player.sendMessage("§aCategory added successfully!");
 this.showMenu(player, shopId);
 } else {
 player.sendMessage("§cFailed to save config.");
 }
 }

 static async showEditCategories(player, shopId) {
 const config = NPCShopConfig.get(shopId);
 const form = new ActionFormData();
 form.title("Edit Categories");
 config.categories.forEach((cat) => {
 form.button(cat.name, cat.icon);
 });
 form.button("Back", "textures/ui/arrow_left");

 const response = await ForceOpen(player, form);
 if (response.canceled || response.selection === config.categories.length) {
 this.showMenu(player, shopId);
 return;
 }
 this.showEditCategory(player, config.categories[response.selection], shopId);
 }

 static async showEditCategory(player, category, shopId) {
 const config = NPCShopConfig.get(shopId);
 const form = new ModalFormData();
 form.title(`Edit: ${category.name}`);
 form.textField("Display Name", "", { defaultValue: category.name });
 form.textField("Icon Texture", "", { defaultValue: category.icon || "" });
 form.toggle("§cDelete Category", { defaultValue: false });

 const response = await ForceOpen(player, form);
 if (response.canceled) { this.showEditCategories(player, shopId); return; }

 const [name, icon, deleteCat] = response.formValues;
 if (deleteCat) {
 const idx = config.categories.findIndex((c) => c.id === category.id);
 if (idx !== -1) config.categories.splice(idx, 1);
 delete config.items[category.id];
 if (NPCShopConfig.save(config, shopId)) {
 player.sendMessage("§cCategory deleted.");
 this.showEditCategories(player, shopId);
 }
 return;
 }

 category.name = name.trim();
 category.icon = icon?.trim() || "textures/ui/unknown";
 if (NPCShopConfig.save(config, shopId)) {
 player.sendMessage("§aCategory updated.");
 this.showEditCategories(player, shopId);
 } else {
 player.sendMessage("§cFailed to save config.");
 }
 }

 static async showAddItem(player, shopId) {
 const config = NPCShopConfig.get(shopId);
 const form = new ModalFormData();
 form.title("Add Item");
 form.dropdown(
 "Category",
 config.categories.map((c) => c.name)
 );
 form.dropdown("Item Type", ["Item (by ID)", "Command (runs command, use @s for buyer)"]);
 form.textField("Item ID / Command", "e.g., minecraft:diamond  |  give @s minecraft:diamond 5");
 form.textField("Display Name", "e.g., Diamond");
 form.textField("Buy Price", "e.g., 500 (0 = not for buy)");
 form.textField("Sell Price", "e.g., 250 (leave empty = 50% buy price; ignored for command)");
 form.textField("Amount", "e.g., 1 (ignored for command)", { defaultValue: "1" });
 form.textField("Icon Path", "e.g., textures/items/diamond");

 const response = await ForceOpen(player, form);
 if (response.canceled) { this.showMenu(player, shopId); return; }

 const [catIndex, modeIdx, idOrCmd, name, buyPriceStr, sellPriceStr, amountStr, icon] = response.formValues;
 const categoryId = config.categories[catIndex].id;
 const isCommand = modeIdx === 1;
 const buyPrice = parseInt(buyPriceStr) || 0;
 const sellPrice = sellPriceStr ? parseInt(sellPriceStr) : undefined;
 const amount = parseInt(amountStr) || 1;

 if (!idOrCmd || !name) {
 player.sendMessage("§cItem ID/Command and Name are required.");
 this.showMenu(player, shopId);
 return;
 }

 const id = idOrCmd.trim();

 let type = "buy";
 if (isCommand) {
 type = "command";
 } else if (buyPrice > 0 && sellPrice !== undefined && sellPrice > 0) {
 type = "both";
 } else if (buyPrice === 0 && sellPrice !== undefined && sellPrice > 0) {
 type = "sell";
 }

 const item = {
 id: id,
 name: name.trim(),
 price: buyPrice > 0 ? buyPrice : (sellPrice || 0),
 amount: isCommand ? 1 : amount,
 icon: icon?.trim() || undefined,
 type: type,
 };
 if (isCommand) item.command = id;
 if (sellPrice !== undefined && !isCommand) item.sellPrice = sellPrice;

 if (!config.items[categoryId]) config.items[categoryId] = [];
 config.items[categoryId].push(item);

 if (NPCShopConfig.save(config, shopId)) {
 player.sendMessage("§aItem added successfully!");
 this.showMenu(player, shopId);
 } else {
 player.sendMessage("§cFailed to save config.");
 }
 }

 static async showEditItems(player, shopId) {
 const config = NPCShopConfig.get(shopId);
 const form = new ActionFormData();
 form.title("Select Category");
 config.categories.forEach((cat) => {
 const itemCount = config.items[cat.id]?.length || 0;
 form.button(`${cat.name}\n§7${itemCount} items`, cat.icon);
 });
 form.button("Back", "textures/ui/arrow_left");

 const response = await ForceOpen(player, form);
 if (response.canceled || response.selection === config.categories.length) {
 this.showMenu(player, shopId);
 return;
 }
 this.showCategoryItems(player, config.categories[response.selection], shopId);
 }

 static async showCategoryItems(player, category, shopId) {
 const config = NPCShopConfig.get(shopId);
 const items = config.items[category.id] || [];
 if (items.length === 0) {
 player.sendMessage("§cNo items in this category.");
 this.showEditItems(player, shopId);
 return;
 }

 const form = new ActionFormData();
 form.title(`${category.name} Items`);
 items.forEach((item) => {
 const typeLabel = itemTypeLabel(getItemType(item));
 form.button(`${item.name}\n§7${typeLabel} $${metricNumbers(item.price)}`);
 });
 form.button("Back", "textures/ui/arrow_left");

 const response = await ForceOpen(player, form);
 if (response.canceled || response.selection === items.length) {
 this.showEditItems(player, shopId);
 return;
 }
 this.showEditItem(player, category, response.selection, shopId);
 }

 static async showEditItem(player, category, index, shopId) {
 const config = NPCShopConfig.get(shopId);
 const item = config.items[category.id][index];
 const type = getItemType(item);

 const form = new ModalFormData();
 form.title(`Edit: ${item.name}`);
 form.dropdown("Type", ["Buy", "Sell", "Both", "Command"], {
 defaultValueIndex: type === "command" ? 3 : type === "both" ? 2 : type === "sell" ? 1 : 0,
 });
 form.textField(
 type === "command" ? "Command (use @s for buyer)" : "Item ID",
 "",
 { defaultValue: type === "command" ? item.command || "" : item.id }
 );
 form.textField("Display Name", "", { defaultValue: item.name });
 form.textField("Buy Price", "", { defaultValue: (item.price || 0).toString() });
 form.textField("Sell Price", "leave empty = 50% buy price", {
 defaultValue: item.sellPrice !== undefined ? item.sellPrice.toString() : "",
 });
 form.textField("Amount", "", { defaultValue: (item.amount || 1).toString() });
 form.textField("Icon Path", "", { defaultValue: item.icon || "" });
 form.toggle("§cDelete Item", { defaultValue: false });

 const response = await ForceOpen(player, form);
 if (response.canceled) { this.showCategoryItems(player, category, shopId); return; }

 const [typeIdx, id, name, buyPriceStr, sellPriceStr, amountStr, icon, deleteItem] = response.formValues;

 if (deleteItem) {
 config.items[category.id].splice(index, 1);
 if (NPCShopConfig.save(config, shopId)) {
 player.sendMessage("§cItem deleted.");
 this.showCategoryItems(player, category, shopId);
 }
 return;
 }

 const newType = ["buy", "sell", "both", "command"][typeIdx];
 const buyPrice = parseInt(buyPriceStr) || 0;
 const sellPriceVal = sellPriceStr ? parseInt(sellPriceStr) : undefined;

 if (newType === "command") {
 item.type = "command";
 item.command = id.trim();
 item.price = buyPrice > 0 ? buyPrice : 0;
 item.amount = 1;
 delete item.sellPrice;
 } else {
 item.type = newType;
 item.id = id.trim();
 item.price = buyPrice > 0 ? buyPrice : 0;
 item.amount = parseInt(amountStr) || 1;
 if (sellPriceVal !== undefined) {
 item.sellPrice = sellPriceVal;
 } else {
 delete item.sellPrice;
 }
 delete item.command;
 }
 item.name = name.trim();
 item.icon = icon?.trim() || undefined;

 if (NPCShopConfig.save(config, shopId)) {
 player.sendMessage("§aItem updated.");
 this.showCategoryItems(player, category, shopId);
 } else {
 player.sendMessage("§cFailed to save config.");
 }
 }

 static async showResetConfirm(player, shopId) {
 const form = new MessageFormData();
 form.title("Reset Shop");
 form.body("§eAre you sure you want to reset the shop to default settings?\n\n§cThis action cannot be undone!");

 const response = await form.show(player);
 if (response.canceled || response.selection === 1) {
 this.showMenu(player, shopId);
 return;
 }

 const newConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
 NPCShopConfig.save(newConfig, shopId);
 player.sendMessage("§aShop has been reset to default.");
 this.showMenu(player, shopId);
 }
}

export function showNPCShop(player, npcEntity) {
 const shopId = getShopId(npcEntity);
 NPCShop.showMainMenu(player, shopId);
}

export function showNPCShopAdmin(player, npcEntity) {
 const shopId = getShopId(npcEntity);
 NPCShopAdmin.showMenu(player, shopId);
}

function getShopId(npcEntity) {
 if (!npcEntity) return null;
 const tags = npcEntity.getTags();
 const idTag = tags.find(t => t.startsWith("npc_id:"));
 if (idTag) {
 return idTag.replace("npc_id:", "");
 }
 const newId = Math.floor(Math.random() * 1e9).toString();
 try {
 npcEntity.addTag("npc_id:" + newId);
 if (!npcEntity.hasTag("fixed_position")) {
 npcEntity.addTag("fixed_position");
 }
 } catch (e) {
 console.warn("Failed to assign ID to NPC:", e);
 return null;
 }
 return newId;
}
