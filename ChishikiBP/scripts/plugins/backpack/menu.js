import {
 world,
 ModalFormData,
 ItemLockMode,
 ItemComponentTypes,
} from "../../core";
import { ChestFormData } from "../../extensions/forms.js";
import { getItemChestTexture } from "../../extensions/chestItemDisplay.js";
import { BackpackDatabase } from "./backpack_database";

const db = new BackpackDatabase();

const COLS = 9;
const TOP_ROW = 0;
const ITEM_ROWS = 4;
const ACTION_ROW = 5;
const ACTION_START = ACTION_ROW * COLS;

const MAX_DISPLAY_SLOTS = ITEM_ROWS * (COLS - 2);

const ITEM_SLOTS = (() => {
 const arr = [];
 for (let row = 1; row <= ITEM_ROWS; row++)
 for (let col = 1; col <= COLS - 2; col++) arr.push(row * COLS + col);
 return arr;
})();

function getUnavailableSlots(maxSlots) {
 const activeSlots = new Set(ITEM_SLOTS.slice(0, maxSlots));
 const unavailable = [];
 for (let row = ITEM_ROWS; row >= 1; row--) {
 for (let col = 1; col <= COLS - 2; col++) {
 const slot = row * COLS + col;
 if (!activeSlots.has(slot)) unavailable.push(slot);
 }
 }
 return unavailable;
}

const SLOT_TO_IDX = new Map(ITEM_SLOTS.map((slot, idx) => [slot, idx]));

const TOP_BORDER_SLOTS = (() => {
 const arr = [];
 for (let col = 0; col < COLS; col++) arr.push(TOP_ROW * COLS + col);
 return arr;
})();

const BORDER_SLOTS = (() => {
 const set = new Set();
 for (let row = 1; row <= ITEM_ROWS; row++) {
 set.add(row * COLS + 0);
 set.add(row * COLS + (COLS - 1));
 }
 return set;
})();

const ACTION_BARRIER_SLOTS = (() => {
 const arr = [];
 for (let col = 1; col <= COLS - 2; col++) arr.push(ACTION_START + col);
 return arr;
})();

const CLOSE_SLOT = ACTION_START;
const DEPOSIT_SLOT = ACTION_START + 8;
const PREVIOUS_PAGE_SLOT = ACTION_START + 7;
const NEXT_PAGE_SLOT = ACTION_START + 8;

const BORDER_TEX = "minecraft:barrier";
const UNAVAILABLE_TEX = "minecraft:barrier";
const CLOSE_TEX = "minecraft:dark_oak_door";
const DEPOSIT_TEX = "minecraft:chest";
const BLOCKED_CUSTOM_ITEM_IDS = new Set(["kwd:item01", "kwd:member01"]);
const BORDER_LABEL = " ";
const BORDER_LORE = [];
const UNAVAILABLE_LABEL = "§cLocked";
const UNAVAILABLE_LORE = ["§7Upgrade to unlock"];

function placeBorder(form, slot) {
 form.button(slot, BORDER_LABEL, BORDER_LORE, BORDER_TEX, 1, 0, false);
}

function placeUnavailable(form, slot) {
 form.button(slot, UNAVAILABLE_LABEL, UNAVAILABLE_LORE, UNAVAILABLE_TEX, 1, 0, false);
}

function getCapacityColor(used, max) {
 if (max <= 0 || used <= 0) return "§f";
 const ratio = used / max;
 if (ratio >= 1) return "§c";
 if (ratio >= 0.5) return "§e";
 return "§a";
}

export const BackpackConfig = {
 get: () => {
 try {
 const data = world.getDynamicProperty("backpack_config");
 return data ? JSON.parse(data) : { maxSlots: 27 };
 } catch {
 return { maxSlots: 27 };
 }
 },
 save: (config) => {
 try {
 world.setDynamicProperty("backpack_config", JSON.stringify(config));
 return true;
 } catch {
 return false;
 }
 },
};

export function configureBackpackSystem(player) {
 const config = BackpackConfig.get();
 const current = Math.min(config.maxSlots, MAX_DISPLAY_SLOTS);
 const form = new ModalFormData()
 .title("Backpack Configuration")
 .slider(`Max Slots (1 § ${MAX_DISPLAY_SLOTS})`, 1, MAX_DISPLAY_SLOTS, {
 valueStep: 1,
 defaultValue: current,
 });
 form.show(player).then((res) => {
 if (res.canceled) return;
 const [maxSlots] = res.formValues;
 config.maxSlots = maxSlots;
 if (BackpackConfig.save(config)) {
 player.sendMessage(`§aBackpack max slots set to §f${maxSlots}§a!`);
 } else {
 player.sendMessage("§cFailed to save configuration.");
 }
 });
}

function formatItemName(typeId) {
 return typeId
 .replace(/.*(?<=:)/, "")
 .replace(/_/g, " ")
 .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
}

function getItemDurability(item) {
 if (!item) return null;
 try {
 const dur = item.getComponent(ItemComponentTypes.Durability);
 if (
 !dur ||
 typeof dur.maxDurability !== "number" ||
 typeof dur.damage !== "number"
 )
 return null;
 if (
 dur.damage < 0 ||
 dur.damage > dur.maxDurability ||
 dur.maxDurability <= 0
 )
 return null;
 const remaining = dur.maxDurability - dur.damage;
 return {
 maxDurability: dur.maxDurability,
 currentDamage: dur.damage,
 remainingDurability: remaining,
 durabilityPercentage: Math.floor((remaining / dur.maxDurability) * 100),
 };
 } catch {
 return null;
 }
}

function getItemEnchantments(item) {
 if (!item) return [];
 try {
 const enc = item.getComponent(ItemComponentTypes.Enchantable);
 if (!enc) return [];
 const enchants = enc.getEnchantments();
 if (!enchants || !Array.isArray(enchants)) return [];
 return enchants
 .filter((e) => e?.type?.id)
 .map((e) => ({ id: e.type.id, level: e.level || 1 }));
 } catch {
 return [];
 }
}

function getItemCustomName(item) {
 if (!item) return "";
 try {
 return item.nameTag || "";
 } catch {
 return "";
 }
}

function getItemLore(item) {
 if (!item) return [];
 try {
 return item.getLore() || [];
 } catch {
 return [];
 }
}

function isItemLocked(item) {
 if (!item) return false;
 try {
 return (
 item.lockMode === ItemLockMode.slot ||
 item.lockMode === ItemLockMode.inventory
 );
 } catch {
 return false;
 }
}

function isItemAllowedInBackpack(item) {
 if (!item) return false;
 if (BLOCKED_CUSTOM_ITEM_IDS.has(item.typeId)) return false;
 if (item.typeId === "minecraft:enchanted_book") return false;
 if (item.typeId === "minecraft:bundle") return false;
 if (item.typeId.includes("shulker")) return false;
 if (item.getComponent("inventory")) return false;
 return true;
}

function formatItemDetailInfo(item) {
 const lines = [];
 const name = getItemCustomName(item);
 if (name) lines.push(`Name: ${name}`);
 lines.push(`Type: ${item.typeId}`);
 lines.push(`Amount: x${item.amount}`);
 const enchants = getItemEnchantments(item);
 if (enchants.length > 0)
 lines.push(
 `Enchants: ${enchants.map((e) => `${(e.id || "?").replace("minecraft:", "")} ${e.level}`).join(", ")}`,
 );
 const dur = getItemDurability(item);
 if (dur)
 lines.push(
 `Durability: ${dur.remainingDurability}/${dur.maxDurability} (${dur.durabilityPercentage}%)`,
 );
 const lore = getItemLore(item);
 if (lore.length > 0) lines.push(`Lore: ${lore.join(", ")}`);
 return lines.join("\n");
}


function openBackpackMenu(player) {
 showBackpackChest(player);
}

function showBackpackChest(player) {
 try {
 const items = db.get(player.name) || [];
 const config = BackpackConfig.get();
 const maxSlots = Math.min(config.maxSlots, MAX_DISPLAY_SLOTS);
 const usedSlots = Math.min(items.length, maxSlots);
 const usedColor = getCapacityColor(usedSlots, maxSlots);
 const form = new ChestFormData("double").title(
 `§rBackpack (${usedColor}${usedSlots}§r/${maxSlots})`,
 );

 for (const slot of TOP_BORDER_SLOTS) placeBorder(form, slot);
 for (const slot of BORDER_SLOTS) placeBorder(form, slot);
 for (const slot of ACTION_BARRIER_SLOTS) placeBorder(form, slot);
 for (const slot of getUnavailableSlots(maxSlots)) placeUnavailable(form, slot);

 for (let i = 0; i < maxSlots; i++) {
 const item = items[i];
 if (!item) continue;
 const slot = ITEM_SLOTS[i];
 const name = getItemCustomName(item) || formatItemName(item.typeId);
 const lore = [`§7x${item.amount}`, "§eClick to withdraw"];
 const enchants = getItemEnchantments(item);
 if (enchants.length > 0) lore.push(`§d${enchants.length} enchant(s)`);
 const dur = getItemDurability(item);
 const durPct = dur
 ? Math.max(0, Math.min(99, Math.round((dur.remainingDurability / dur.maxDurability) * 99)))
 : 0;
 if (dur) lore.push(`§cDurability ${dur.durabilityPercentage}%`);
 form.button(
 slot,
 `§f${name}`,
 lore,
 getItemChestTexture(item) || item.typeId,
 Math.min(99, Math.max(1, item.amount || 1)),
 durPct,
 enchants.length > 0,
 );
 }

 form.button(CLOSE_SLOT, "§cClose", ["§7Close backpack"], CLOSE_TEX, 1, 0, false);
 form.button(DEPOSIT_SLOT, "§aDeposit", ["§7Store an item"], DEPOSIT_TEX, 1, 0, false);

 form.show(player).then((res) => {
 if (!res || res.canceled) return;
 const sel = res.selection;
 if (typeof sel !== "number") return showBackpackChest(player);
 if (sel === CLOSE_SLOT) return;
 if (sel === DEPOSIT_SLOT) {
 if (items.length >= maxSlots) {
 player.sendMessage("§cYour backpack is full!");
 return showBackpackChest(player);
 }
 return showDepositInventoryMenu(player);
 }
 if (SLOT_TO_IDX.has(sel)) {
 const idx = SLOT_TO_IDX.get(sel);
 if (idx < items.length && items[idx]) {
 withdrawItem(player, idx, items[idx].amount, () => showBackpackChest(player));
 return;
 }
 }
 showBackpackChest(player);
 }).catch((err) => {
 console.warn("[Backpack] chest show failed:", err);
 player.sendMessage("§cAn error occurred while opening the backpack.");
 });
 } catch (err) {
 console.warn("[Backpack] open error:", err);
 player.sendMessage("§cAn error occurred while opening the backpack.");
 }
}

function showDepositInventoryMenuFree(player, requestedPage = 0) {
 const inv = player.getComponent("inventory").container;
 const pageCount = Math.max(1, Math.ceil(inv.size / MAX_DISPLAY_SLOTS));
 const page = Math.max(0, Math.min(Math.floor(requestedPage), pageCount - 1));
 const start = page * MAX_DISPLAY_SLOTS;
 const end = Math.min(inv.size, start + MAX_DISPLAY_SLOTS);
 const pageItems = [];
 for (let inventorySlot = start; inventorySlot < end; inventorySlot++) {
 const item = inv.getItem(inventorySlot);
 pageItems.push({ inventorySlot, item });
 }
 const form = new ChestFormData("double").title(
 `§rDeposit Item (§f${page + 1}§r/${pageCount})`,
 );

 for (const slot of TOP_BORDER_SLOTS) placeBorder(form, slot);
 for (const slot of BORDER_SLOTS) placeBorder(form, slot);
 for (const slot of ACTION_BARRIER_SLOTS) placeBorder(form, slot);

 for (let i = 0; i < pageItems.length; i++) {
 const { inventorySlot, item } = pageItems[i];
 if (!item || item.typeId === "minecraft:air" || item.amount <= 0) continue;
 const name = getItemCustomName(item) || formatItemName(item.typeId);
 const lore = [`§7Inventory slot ${inventorySlot + 1}`, `§7x${item.amount}`, "§aClick to deposit"];
 if (isItemLocked(item)) lore.splice(2, 1, "§cLocked item");
 else if (!isItemAllowedInBackpack(item)) lore.splice(2, 1, "§cCannot be stored");
 const enchants = getItemEnchantments(item);
 if (enchants.length) lore.splice(2, 0, `§d${enchants.length} enchant(s)`);
 const dur = getItemDurability(item);
 const durPct = dur
 ? Math.max(0, Math.min(99, Math.round((dur.remainingDurability / dur.maxDurability) * 99)))
 : 0;
 if (dur) lore.splice(2, 0, `§cDurability ${dur.durabilityPercentage}%`);
 form.button(
 ITEM_SLOTS[i],
 `§f${name}`,
 lore,
 getItemChestTexture(item) || item.typeId,
 Math.min(99, Math.max(1, item.amount || 1)),
 durPct,
 enchants.length > 0,
 );
 }

  form.button(CLOSE_SLOT, "§eBack", ["§7Return to backpack"], CLOSE_TEX, 1, 0, false);
  if (page > 0) {
    form.button(PREVIOUS_PAGE_SLOT, "§ePrevious", [`§7Go to page ${page}/${pageCount}`], "minecraft:arrow", 1, 0, false);
  } else {
    form.button(PREVIOUS_PAGE_SLOT, "§7Previous", ["§8No previous page"], "minecraft:arrow", 1, 0, false);
  }

  if (page < pageCount - 1) {
    form.button(NEXT_PAGE_SLOT, "§eNext", [`§7Go to page ${page + 2}/${pageCount}`], "minecraft:arrow", 1, 0, false);
  } else {
    form.button(NEXT_PAGE_SLOT, "§7Next", ["§8No next page"], "minecraft:arrow", 1, 0, false);
  }

  form.show(player).then((res) => {
    if (res.canceled) return showBackpackChest(player);
    if (typeof res.selection !== "number") return showDepositInventoryMenuFree(player, page);
    if (res.selection === CLOSE_SLOT) return showBackpackChest(player);
    if (res.selection === PREVIOUS_PAGE_SLOT) {
      if (page > 0) return showDepositInventoryMenuFree(player, page - 1);
      return showDepositInventoryMenuFree(player, page);
    }
    if (res.selection === NEXT_PAGE_SLOT) {
      if (page < pageCount - 1) return showDepositInventoryMenuFree(player, page + 1);
      return showDepositInventoryMenuFree(player, page);
    }
 if (SLOT_TO_IDX.has(res.selection)) {
 const pageIndex = SLOT_TO_IDX.get(res.selection);
 const selected = pageItems[pageIndex];
 if (!selected) return showDepositInventoryMenuFree(player, page);
 const invSlot = selected.inventorySlot;
 const item = inv.getItem(invSlot);
 if (!item || item.typeId === "minecraft:air" || item.amount <= 0) {
 player.sendMessage("§cItem not found in that slot!");
 return showDepositInventoryMenuFree(player, page);
 }
 if (isItemLocked(item)) {
 player.sendMessage("§cThis item is locked!");
 return showDepositInventoryMenuFree(player, page);
 }
 if (!isItemAllowedInBackpack(item)) {
 player.sendMessage("§cThis item type cannot be stored!");
 return showDepositInventoryMenuFree(player, page);
 }
 showDepositAmountForm(player, invSlot, item, "", page);
 }
 }).catch((error) => {
 console.warn("[Backpack] deposit chest show failed:", error);
 player.sendMessage("§cCould not open the deposit menu.");
 });
}

function showDepositInventoryMenu(player, page = 0) {
 return showDepositInventoryMenuFree(player, page);
}

function showDepositAmountForm(player, slot, item, errorMsg = "", returnPage = 0) {
 const itemInfo = formatItemDetailInfo(item);
 const form = new ModalFormData()
 .title("§fDeposit Item")
 .textField(
 `${itemInfo}\n\nHow many do you want to deposit? (1 § ${item.amount})${errorMsg ? `\n§c${errorMsg}` : ""}`,
 "Enter amount",
 { defaultValue: "1" },
 )
 .submitButton("§aDeposit");

 form.show(player).then((res) => {
 if (res.canceled || res.formValues === undefined)
 return showDepositInventoryMenu(player, returnPage);
 const amount = parseInt(res.formValues[0]);
 if (isNaN(amount) || amount < 1 || amount > item.amount)
 return showDepositAmountForm(
 player,
 slot,
 item,
 "Invalid amount! Please enter a valid number.",
 returnPage,
 );
 depositItem(player, slot, amount, () => showDepositInventoryMenu(player, returnPage));
 });
}

function depositItem(player, slot, amount, cb) {
 if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
 player.sendMessage("§cInvalid deposit amount!");
 if (cb) cb();
 return;
 }
 const inv = player.getComponent("inventory").container;
 const item = inv.getItem(slot);
 if (!item || item.typeId === "minecraft:air" || item.amount < amount) {
 player.sendMessage("§cItem not found or not enough amount!");
 if (cb) cb();
 return;
 }
 if (isItemLocked(item)) {
 player.sendMessage("§cThis item is locked!");
 if (cb) cb();
 return;
 }
 if (!isItemAllowedInBackpack(item)) {
 player.sendMessage("§cThis item type cannot be stored!");
 if (cb) cb();
 return;
 }

 const backpack = db.get(player.name) || [];
 const config = BackpackConfig.get();
 const maxSlots = Math.min(config.maxSlots, MAX_DISPLAY_SLOTS);

 if (backpack.length >= maxSlots) {
 player.sendMessage("§cBackpack is full!");
 if (cb) cb();
 return;
 }

 const clone = item.clone();
 clone.amount = amount;
 backpack.push(clone);
 if (!db.set(player.name, backpack)) {
 player.sendMessage("§cBackpack storage is busy right now. Try again in a moment.");
 if (cb) cb();
 return;
 }

 const remaining = item.amount - amount;
 if (remaining > 0) {
 const leftover = item.clone();
 leftover.amount = remaining;
 inv.setItem(slot, leftover);
 } else {
 inv.setItem(slot, undefined);
 }

 player.sendMessage(
 `§aDeposited §f${amount}x ${formatItemName(item.typeId)} §ato your backpack!`,
 );
 if (cb) cb();
}

function withdrawItem(player, idx, amount, cb) {
 const backpack = db.get(player.name) || [];
 if (idx < 0 || idx >= backpack.length || !backpack[idx]) {
 player.sendMessage("§cInvalid slot!");
 if (cb) cb();
 return;
 }

 // Item diserahkan sebelum penyimpanan, jadi tolak lebih awal daripada menggandakan item
 // ketika penyimpanan sedang tidak bisa ditulis.
 if (!db.canWrite(player.name)) {
 player.sendMessage("§cBackpack storage is busy right now. Try again in a moment.");
 if (cb) cb();
 return;
 }

 const item = backpack[idx];
 const giveAmount = Math.min(item.amount, amount);
 const inv = player.getComponent("inventory").container;
 let capacity = 0;
 for (let slot = 0; slot < inv.size && capacity < giveAmount; slot++) {
 const existing = inv.getItem(slot);
 if (!existing) capacity += item.maxAmount;
 else if (existing.isStackableWith(item)) capacity += existing.maxAmount - existing.amount;
 }
 if (capacity < giveAmount) {
 player.sendMessage("§cNot enough inventory space!");
 if (cb) cb();
 return;
 }

 const updated = backpack.slice();
 if (item.amount > giveAmount) {
 const remaining = item.clone();
 remaining.amount = item.amount - giveAmount;
 updated[idx] = remaining;
 } else {
 updated.splice(idx, 1);
 }
 if (!db.set(player.name, updated)) {
 player.sendMessage("§cBackpack storage is busy right now. Try again in a moment.");
 if (cb) cb();
 return;
 }

 try {
 const give = item.clone();
 give.amount = giveAmount;
 const leftover = inv.addItem(give);
 if (leftover) throw new Error("Inventory changed during withdrawal");
 } catch {
 db.set(player.name, backpack);
 player.sendMessage("§cFailed to withdraw item!");
 if (cb) cb();
 return;
 }
 player.sendMessage(
 `§aWithdrew §f${giveAmount}x ${formatItemName(item.typeId)} §afrom your backpack!`,
 );
 if (cb) cb();
}

export { openBackpackMenu };
