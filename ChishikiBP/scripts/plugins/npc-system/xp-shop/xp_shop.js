import { system, world, ActionFormData, ModalFormData } from '../../../core.js';
import {
 getFullMoney,
 addMoney,
 removeMoney,
 getFormattedMoney,
 formatMoneyValue,
} from "../../../function/moneySystem.js";
import { ForceOpen, metricNumbers } from "../../../lib/game.js";
const XP_SHOP_CONFIG = {
 buyRates: [
 { levels: 1, price: 100, description: "1 Level" },
 { levels: 5, price: 450, description: "5 Levels" },
 { levels: 10, price: 850, description: "10 Levels" },
 { levels: 25, price: 2000, description: "25 Levels" },
 { levels: 50, price: 3800, description: "50 Levels" },
 { levels: 100, price: 7200, description: "100 Levels" },
 ],
 sellRates: [
 { levels: 1, price: 80, description: "1 Level" },
 { levels: 5, price: 380, description: "5 Levels" },
 { levels: 10, price: 720, description: "10 Levels" },
 { levels: 25, price: 1700, description: "25 Levels" },
 { levels: 50, price: 3200, description: "50 Levels" },
 { levels: 100, price: 6000, description: "100 Levels" },
 ],
};
function getXPShopConfig() {
 try {
 const config = world.getDynamicProperty("xpShopConfig");
 return config ? JSON.parse(config) : XP_SHOP_CONFIG;
 } catch {
 return XP_SHOP_CONFIG;
 }
}
function saveXPShopConfig(config) {
 try {
 world.setDynamicProperty("xpShopConfig", JSON.stringify(config));
 return true;
 } catch {
 return false;
 }
}
function getPlayerXPLevel(player) {
 try {
 return player.level || 0;
 } catch {
 return 0;
 }
}
function getPlayerInfo(player) {
 return {
 level: getPlayerXPLevel(player),
 money: getFullMoney(player),
 formattedMoney: getFormattedMoney(player),
 };
}
function formatFormBody(title, player, extra = "") {
 const info = getPlayerInfo(player);
 return `§6═══════════════════════════════\n§6${title}\n§6═══════════════════════════════\n\n§a▶ §fPlayer: §e${player.name}\n§a▶ §fCurrent Level: §b${info.level}\n§a▶ §fMoney: §e${info.formattedMoney}${extra ? `\n\n${extra}` : ""}`;
}
function navigateBack(callback, delay = 2) {
 system.runTimeout(callback, delay);
}
function validatePackage(description, levels, price) {
 if (!description?.trim())
 return { valid: false, message: "§c✘ Please enter a description!" };
 if (isNaN(levels) || levels <= 0 || levels > 1000)
 return {
 valid: false,
 message: "§c✘ Invalid levels! Enter a number between 1 and 1000.",
 };
 if (isNaN(price) || price <= 0 || price > 999999)
 return {
 valid: false,
 message: "§c✘ Invalid price! Enter a number between 1 and 999999.",
 };
 return { valid: true };
}
function createPackageForm(title, defaultValue = null) {
 const form = new ModalFormData().title(title);
 form.textField("§6Package Description:", "e.g., 10 Levels", {
 defaultValue: defaultValue?.description || "",
 });
 form.textField("§6XP Levels:", "Enter amount (1-1000)", {
 defaultValue: defaultValue?.levels?.toString() || "",
 });
 form.textField("§6Price:", "Enter price (1-999999)", {
 defaultValue: defaultValue?.price?.toString() || "",
 });
 return form;
}
function buildRateButtons(form, rates, playerMoney, playerLevel, isBuy) {
 for (const rate of rates) {
 const canAfford = isBuy
 ? playerMoney >= BigInt(rate.price)
 : playerLevel >= rate.levels;
 const statusIcon = canAfford ? "§a✓" : "§c✗";
 const statusText = canAfford
 ? isBuy
 ? "§aAffordable"
 : "§aAvailable"
 : isBuy
 ? "§cNot enough money"
 : "§cNot enough XP";
 const priceFormatted = metricNumbers(rate.price.toString());
 const prefix = isBuy ? "Price" : "Sell for";
 form.button(
 `${statusIcon} §6${rate.description}\n§7${prefix}: §e$${priceFormatted} §8| §7${statusText}`,
 "textures/items/experience_bottle",
 );
 }
}
export async function showXPShop(player) {
 try {
 const info = getPlayerInfo(player);
 const form = new ActionFormData()
 .title("XP SHOP")
 .body(
 formatFormBody(
 "EXPERIENCE EXCHANGE",
 player,
 "§7Choose an option to buy or sell XP levels:",
 ),
 )
 .button(
 "§a⬆ Buy XP Levels\n§r§7Purchase experience points",
 "textures/items/experience_bottle",
 )
 .button(
 "§c⬇ Sell XP Levels\n§r§7Convert XP to money",
 "textures/items/experience_bottle",
 )
 .button("§8Close\n§r§7Exit shop", "textures/ui/cancel");
 const result = await ForceOpen(player, form);
 if (result.canceled || result.selection === 2) return;
 navigateBack(() => {
 result.selection === 0 ? showBuyXPMenu(player) : showSellXPMenu(player);
 });
 } catch {
 player.sendMessage("§cError opening XP shop. Please try again.");
 }
}
async function showBuyXPMenu(player) {
 try {
 const config = getXPShopConfig();
 const info = getPlayerInfo(player);
 const form = new ActionFormData()
 .title("BUY XP LEVELS")
 .body(
 formatFormBody(
 "XP PURCHASE MENU",
 player,
 "§7Select an XP package to purchase:",
 ),
 );
 buildRateButtons(form, config.buyRates, info.money, info.level, true);
 form.button("§8« Back\n§r§7Return to main menu", "textures/ui/arrow_left");
 const result = await ForceOpen(player, form);
 if (result.canceled || result.selection === config.buyRates.length) {
 navigateBack(() => showXPShop(player));
 return;
 }
 navigateBack(() =>
 showBuyConfirmation(player, config.buyRates[result.selection]),
 );
 } catch {
 player.sendMessage("§cError opening buy menu. Please try again.");
 navigateBack(() => showXPShop(player), 10);
 }
}
async function showSellXPMenu(player) {
 try {
 const config = getXPShopConfig();
 const info = getPlayerInfo(player);
 const form = new ActionFormData()
 .title("SELL XP LEVELS")
 .body(
 formatFormBody(
 "XP SELLING MENU",
 player,
 "§7Select an XP package to sell:",
 ),
 );
 buildRateButtons(form, config.sellRates, info.money, info.level, false);
 form.button("§8« Back\n§r§7Return to main menu", "textures/ui/arrow_left");
 const result = await ForceOpen(player, form);
 if (result.canceled || result.selection === config.sellRates.length) {
 navigateBack(() => showXPShop(player));
 return;
 }
 navigateBack(() =>
 showSellConfirmation(player, config.sellRates[result.selection]),
 );
 } catch {
 player.sendMessage("§cError opening sell menu. Please try again.");
 navigateBack(() => showXPShop(player), 10);
 }
}
async function showBuyConfirmation(player, rate) {
 try {
 const info = getPlayerInfo(player);
 if (info.money < BigInt(rate.price)) {
 player.sendMessage(
 "§c✘ You don't have enough money to buy this XP package!",
 );
 navigateBack(() => showBuyXPMenu(player), 10);
 return;
 }
 const priceFormatted = metricNumbers(rate.price.toString());
 const newLevel = info.level + rate.levels;
 const body = `§6═══════════════════════════════\n§6PURCHASE CONFIRMATION\n§6═══════════════════════════════\n\n§a▶ §fPackage: §e${rate.description}\n§a▶ §fPrice: §e$${priceFormatted}\n§a▶ §fCurrent Level: §b${info.level}\n§a▶ §fNew Level: §b${newLevel}\n§a▶ §fYour Money: §e${info.formattedMoney}\n\n§7Are you sure you want to purchase this XP package?`;
 const form = new ActionFormData()
 .title("CONFIRM PURCHASE")
 .body(body)
 .button(
 "§aConfirm Purchase\n§r§7Buy XP levels",
 "textures/items/experience_bottle",
 )
 .button("§cCancel\n§r§7Go back", "textures/ui/cancel");
 const result = await ForceOpen(player, form);
 if (result.canceled || result.selection === 1) {
 navigateBack(() => showBuyXPMenu(player));
 return;
 }
 if (result.selection === 0) processBuyTransaction(player, rate);
 } catch {
 player.sendMessage("§cError processing confirmation. Please try again.");
 navigateBack(() => showBuyXPMenu(player), 10);
 }
}
async function showSellConfirmation(player, rate) {
 try {
 const info = getPlayerInfo(player);
 if (info.level < rate.levels) {
 player.sendMessage(
 "§c✘ You don't have enough XP levels to sell this package!",
 );
 navigateBack(() => showSellXPMenu(player), 10);
 return;
 }
 const priceFormatted = metricNumbers(rate.price.toString());
 const newLevel = info.level - rate.levels;
 const newMoney = info.money + BigInt(rate.price);
 const body = `§6═══════════════════════════════\n§6SALE CONFIRMATION\n§6═══════════════════════════════\n\n§a▶ §fPackage: §e${rate.description}\n§a▶ §fSell Price: §e$${priceFormatted}\n§a▶ §fCurrent Level: §b${info.level}\n§a▶ §fNew Level: §b${newLevel}\n§a▶ §fCurrent Money: §e${info.formattedMoney}\n§a▶ §fNew Money: §e$${formatMoneyValue(newMoney)}\n\n§7Are you sure you want to sell this XP package?`;
 const form = new ActionFormData()
 .title("CONFIRM SALE")
 .body(body)
 .button(
 "§aConfirm Sale\n§r§7Sell XP levels",
 "textures/items/experience_bottle",
 )
 .button("§cCancel\n§r§7Go back", "textures/ui/cancel");
 const result = await ForceOpen(player, form);
 if (result.canceled || result.selection === 1) {
 navigateBack(() => showSellXPMenu(player));
 return;
 }
 if (result.selection === 0) processSellTransaction(player, rate);
 } catch {
 player.sendMessage("§cError processing confirmation. Please try again.");
 navigateBack(() => showSellXPMenu(player), 10);
 }
}
function processBuyTransaction(player, rate) {
 try {
 const info = getPlayerInfo(player);
 if (info.money < BigInt(rate.price)) {
 player.sendMessage("§cInsufficient funds! You need more money.");
 navigateBack(() => showBuyXPMenu(player), 10);
 return;
 }
 if (removeMoney(player, rate.price)) {
 system.run(() => {
 try {
 player.runCommand(`xp ${rate.levels}L @s`);
 player.sendMessage(
 `§a[XP SHOP] §r§aSuccessfully purchased ${rate.levels} XP level${rate.levels > 1 ? "s" : ""} for $${metricNumbers(rate.price.toString())}!`,
 );
 player.runCommand("playsound random.levelup @s ~~~ 1 1");
 player.runCommand("particle minecraft:villager_happy ~~~");
 } catch {
 addMoney(player, rate.price);
 player.sendMessage(
 "§cFailed to add XP levels. Your money has been refunded.",
 );
 }
 });
 } else {
 player.sendMessage("§cTransaction failed. Please try again.");
 }
 navigateBack(() => showXPShop(player), 40);
 } catch {
 player.sendMessage("§cTransaction failed. Please try again.");
 navigateBack(() => showXPShop(player), 10);
 }
}
function processSellTransaction(player, rate) {
 try {
 const info = getPlayerInfo(player);
 if (info.level < rate.levels) {
 player.sendMessage("§cInsufficient XP levels! You need more XP.");
 navigateBack(() => showSellXPMenu(player), 10);
 return;
 }
 system.run(() => {
 try {
 player.runCommand(`xp -${rate.levels}L @s`);
 if (addMoney(player, rate.price)) {
 player.sendMessage(
 `§a[XP SHOP] §r§aSuccessfully sold ${rate.levels} XP level${rate.levels > 1 ? "s" : ""} for $${metricNumbers(rate.price.toString())}!`,
 );
 player.runCommand("playsound random.orb @s ~~~ 1 1");
 player.runCommand("particle minecraft:totem ~~~");
 } else {
 player.runCommand(`xp ${rate.levels}L @s`);
 player.sendMessage("§cFailed to add money. Transaction cancelled.");
 }
 } catch {
 player.sendMessage(
 "§cFailed to remove XP levels. Transaction cancelled.",
 );
 }
 });
 navigateBack(() => showXPShop(player), 40);
 } catch {
 player.sendMessage("§cTransaction failed. Please try again.");
 navigateBack(() => showXPShop(player), 10);
 }
}
export async function showXPShopAdmin(player) {
 try {
 if (!player.hasTag("admin")) {
 player.sendMessage(
 "§cYou don't have permission to access admin settings!",
 );
 return;
 }
 const form = new ActionFormData()
 .title("XP Shop Admin")
 .body(
 "§6═══════════════════════════════\n§e⚙ §6PACKAGE MANAGEMENT §e⚙\n§6═══════════════════════════════\n\n§7Manage XP shop packages:",
 )
 .button(
 "§aManage Buy Packages\n§r§7Add, edit, remove buy packages",
 "textures/items/experience_bottle",
 )
 .button(
 "§cManage Sell Packages\n§r§7Add, edit, remove sell packages",
 "textures/items/experience_bottle",
 )
 .button(
 "§eReset to Default\n§r§7Reset all configurations",
 "textures/ui/refresh",
 )
 .button("§8« Back\n§r§7Return", "textures/ui/arrow_left");
 const result = await ForceOpen(player, form);
 if (result.canceled || result.selection === 3) return;
 const actions = [
 () => showManagePackages(player, "buy"),
 () => showManagePackages(player, "sell"),
 () => resetXPShopConfig(player),
 ];
 if (actions[result.selection]) actions[result.selection]();
 } catch {
 player.sendMessage("§cError opening admin menu. Please try again.");
 }
}
async function showManagePackages(player, type) {
 try {
 const config = getXPShopConfig();
 const rates = type === "buy" ? config.buyRates : config.sellRates;
 const title =
 type === "buy" ? "§aManage Buy Packages" : "§cManage Sell Packages";
 const managerTitle =
 type === "buy" ? "BUY PACKAGE MANAGER" : "SELL PACKAGE MANAGER";
 const form = new ActionFormData()
 .title(title)
 .body(
 `§6═══════════════════════════════\n§e⚙ §6${managerTitle} §e⚙\n§6═══════════════════════════════\n\n§7Current ${type} packages:`,
 );
 for (const rate of rates) {
 form.button(
 `§e${rate.description}\n§r§7Price: $${metricNumbers(rate.price.toString())} §8| §7Edit/Delete`,
 "textures/items/experience_bottle",
 );
 }
 form
 .button(
 `§aAdd New Package\n§r§7Create a new ${type} package`,
 "textures/ui/color_plus",
 )
 .button("§8Back\n§r§7Return to admin menu", "textures/ui/arrow_left");
 const result = await ForceOpen(player, form);
 if (result.canceled || result.selection === rates.length + 1) {
 showXPShopAdmin(player);
 return;
 }
 if (result.selection === rates.length) {
 showAddPackage(player, type);
 } else {
 showEditPackage(player, type, result.selection);
 }
 } catch {
 player.sendMessage(
 `§cError opening ${type} packages manager. Please try again.`,
 );
 showXPShopAdmin(player);
 }
}
async function showAddPackage(player, type) {
 try {
 const form = createPackageForm(
 `§a+ Add ${type === "buy" ? "Buy" : "Sell"} Package`,
 );
 const result = await form.show(player);
 if (result.canceled) {
 showManagePackages(player, type);
 return;
 }
 const description = result.formValues[0].trim();
 const levels = parseInt(result.formValues[1]);
 const price = parseInt(result.formValues[2]);
 const validation = validatePackage(description, levels, price);
 if (!validation.valid) {
 player.sendMessage(validation.message);
 showAddPackage(player, type);
 return;
 }
 const config = getXPShopConfig();
 const packageData = { levels, price, description };
 if (type === "buy") {
 config.buyRates.push(packageData);
 } else {
 config.sellRates.push(packageData);
 }
 if (saveXPShopConfig(config)) {
 player.sendMessage(
 `§a✓ Successfully added ${type} package: ${description}!`,
 );
 } else {
 player.sendMessage("§c✘ Failed to save configuration.");
 }
 showManagePackages(player, type);
 } catch {
 player.sendMessage(`§cError adding ${type} package. Please try again.`);
 showManagePackages(player, type);
 }
}
async function showEditPackage(player, type, index) {
 try {
 const config = getXPShopConfig();
 const rates = type === "buy" ? config.buyRates : config.sellRates;
 const rate = rates[index];
 if (!rate) {
 player.sendMessage("§c✘ Package not found!");
 showManagePackages(player, type);
 return;
 }
 const form = new ActionFormData()
 .title(`Edit ${type === "buy" ? "Buy" : "Sell"} Package`)
 .body(
 `§6═══════════════════════════════\n§e⚙ §6EDIT PACKAGE §e⚙\n§6═══════════════════════════════\n\n§7Current package:\n§e${rate.description}\n§7Levels: §b${rate.levels}\n§7Price: §e$${metricNumbers(rate.price.toString())}\n\n§7Choose action:`,
 )
 .button(
 "§eEdit Package\n§r§7Modify description, levels, or price",
 "textures/ui/gear",
 )
 .button(
 "§cDelete Package\n§r§7Remove this package permanently",
 "textures/ui/cancel",
 )
 .button("§8Back\n§r§7Return to package list", "textures/ui/arrow_left");
 const result = await ForceOpen(player, form);
 if (result.canceled || result.selection === 2) {
 showManagePackages(player, type);
 return;
 }
 if (result.selection === 0) {
 showModifyPackage(player, type, index);
 } else if (result.selection === 1) {
 showDeletePackage(player, type, index);
 }
 } catch {
 player.sendMessage(`§cError editing ${type} package. Please try again.`);
 showManagePackages(player, type);
 }
}
async function showModifyPackage(player, type, index) {
 try {
 const config = getXPShopConfig();
 const rates = type === "buy" ? config.buyRates : config.sellRates;
 const rate = rates[index];
 const form = createPackageForm(
 `§eModify ${type === "buy" ? "Buy" : "Sell"} Package`,
 rate,
 );
 const result = await form.show(player);
 if (result.canceled) {
 showEditPackage(player, type, index);
 return;
 }
 const description = result.formValues[0].trim();
 const levels = parseInt(result.formValues[1]);
 const price = parseInt(result.formValues[2]);
 const validation = validatePackage(description, levels, price);
 if (!validation.valid) {
 player.sendMessage(validation.message);
 showModifyPackage(player, type, index);
 return;
 }
 rates[index] = { levels, price, description };
 if (saveXPShopConfig(config)) {
 player.sendMessage(
 `§a✓ Successfully updated ${type} package: ${description}!`,
 );
 } else {
 player.sendMessage("§c✘ Failed to save configuration.");
 }
 showManagePackages(player, type);
 } catch {
 player.sendMessage(`§cError modifying ${type} package. Please try again.`);
 showEditPackage(player, type, index);
 }
}
async function showDeletePackage(player, type, index) {
 try {
 const config = getXPShopConfig();
 const rates = type === "buy" ? config.buyRates : config.sellRates;
 const rate = rates[index];
 const form = new ActionFormData()
 .title(`Delete ${type === "buy" ? "Buy" : "Sell"} Package`)
 .body(
 `§6═══════════════════════════════\n§c⚠ §6DELETE CONFIRMATION §c⚠\n§6═══════════════════════════════\n\n§7Are you sure you want to delete:\n§e${rate.description}\n§7Levels: §b${rate.levels}\n§7Price: §e$${metricNumbers(rate.price.toString())}\n\n§c⚠ This action cannot be undone!`,
 )
 .button(
 "§cYes, Delete\n§r§7Remove this package permanently",
 "textures/ui/cancel",
 )
 .button("§aNo, Cancel\n§r§7Keep this package", "textures/ui/check");
 const result = await ForceOpen(player, form);
 if (result.canceled || result.selection === 1) {
 showEditPackage(player, type, index);
 return;
 }
 if (result.selection === 0) {
 rates.splice(index, 1);
 if (saveXPShopConfig(config)) {
 player.sendMessage(
 `§a✓ Successfully deleted ${type} package: ${rate.description}!`,
 );
 } else {
 player.sendMessage("§c✘ Failed to save configuration.");
 }
 showManagePackages(player, type);
 }
 } catch {
 player.sendMessage(`§cError deleting ${type} package. Please try again.`);
 showEditPackage(player, type, index);
 }
}
async function resetXPShopConfig(player) {
 try {
 const form = new ActionFormData()
 .title("Reset Configuration")
 .body(
 "§6═══════════════════════════════\n§c⚠ §6RESET CONFIRMATION §c⚠\n§6═══════════════════════════════\n\n§7This will reset ALL XP Shop packages to default values:\n\n§eBuy Packages:\n§7• 1 Level - $100\n§7• 5 Levels - $450\n§7• 10 Levels - $850\n§7• 25 Levels - $2000\n§7• 50 Levels - $3750\n\n§eSell Packages:\n§7• 1 Level - $80\n§7• 5 Levels - $360\n§7• 10 Levels - $720\n§7• 25 Levels - $1600\n§7• 50 Levels - $3000\n\n§c⚠ All custom packages will be lost!",
 )
 .button(
 "§cYes, Reset\n§r§7Reset to default configuration",
 "textures/ui/refresh",
 )
 .button(
 "§aNo, Cancel\n§r§7Keep current configuration",
 "textures/ui/cancel",
 );
 const result = await ForceOpen(player, form);
 if (result.canceled || result.selection === 1) {
 showXPShopAdmin(player);
 return;
 }
 if (result.selection === 0) {
 if (saveXPShopConfig(XP_SHOP_CONFIG)) {
 player.sendMessage(
 "§a✓ XP Shop configuration successfully reset to default values!",
 );
 player.runCommand("playsound random.levelup @s ~~~ 1 1");
 } else {
 player.sendMessage(
 "§c✘ Failed to reset configuration. Please try again.",
 );
 }
 }
 navigateBack(() => showXPShopAdmin(player), 60);
 } catch {
 player.sendMessage("§cError resetting configuration. Please try again.");
 showXPShopAdmin(player);
 }
}
