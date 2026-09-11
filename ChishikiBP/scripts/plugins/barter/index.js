import {
 system,
 world,
 ItemStack,
 EnchantmentType,
 ActionFormData,
 ModalFormData,
} from "../../core.js";
import { showMemberMenu } from "../../member.js";
const BARTER_DATA_PROPERTY = "kiwora:barter_data";
const DURABILITY_COMPONENT = "minecraft:durability";
const ENCHANTABLE_COMPONENT = "enchantable";
const CUSTOM_NAME_COMPONENT = "minecraft:custom_name";
const LORE_COMPONENT = "minecraft:lore";
const INVENTORY_COMPONENT = "inventory";
const activeBarters = new Map();
system.runTimeout(() => {
 try {
 if (!world.getDynamicProperty(BARTER_DATA_PROPERTY)) {
 world.setDynamicProperty(BARTER_DATA_PROPERTY, JSON.stringify([]));
 }
 loadBarterSessions();
 } catch (error) {
 }
}, 20);
function saveBarterSessions() {
 try {
 const barterData = [];
 for (const [sessionId, session] of activeBarters.entries()) {
 const player1 = world
 .getPlayers()
 .find((p) => p.name === session.player1.name);
 const player2 = world
 .getPlayers()
 .find((p) => p.name === session.player2.name);
 if (!player1 || !player2) continue;
 barterData.push({
 sessionId,
 player1Name: session.player1.name,
 player2Name: session.player2.name,
 items1: session.items1,
 items2: session.items2,
 confirmed1: session.confirmed1,
 confirmed2: session.confirmed2,
 locked: session.locked,
 });
 }
 world.setDynamicProperty(BARTER_DATA_PROPERTY, JSON.stringify(barterData));
 } catch (error) {
 }
}
function loadBarterSessions() {
 try {
 const barterDataJson = world.getDynamicProperty(BARTER_DATA_PROPERTY);
 if (!barterDataJson) return;
 const barterData = JSON.parse(barterDataJson);
 if (!Array.isArray(barterData)) return;
 activeBarters.clear();
 for (const data of barterData) {
 try {
 const player1 = world
 .getPlayers()
 .find((p) => p.name === data.player1Name);
 const player2 = world
 .getPlayers()
 .find((p) => p.name === data.player2Name);
 if (!player1 || !player2) continue;
 const session = new BarterSession(player1, player2);
 session.items1 = data.items1 || [];
 session.items2 = data.items2 || [];
 session.confirmed1 = data.confirmed1 || false;
 session.confirmed2 = data.confirmed2 || false;
 session.locked = data.locked || false;
 activeBarters.set(data.sessionId, session);
 } catch (playerError) {
 }
 }
 } catch (error) {
 }
}
function saveBarterChanges() {
 system.runTimeout(saveBarterSessions, 5);
}
system.afterEvents.scriptEventReceive.subscribe((event) => {
 if (event.id === "kiwora:barter") {
 const player = event.sourceEntity;
 if (player) {
 BarterMenu(player);
 }
 }
});
world.afterEvents.playerJoin.subscribe((event) => {
 try {
 loadBarterSessions();
 } catch (error) {
 }
});
class BarterSession {
 constructor(player1, player2) {
 this.player1 = player1;
 this.player2 = player2;
 this.items1 = [];
 this.items2 = [];
 this.confirmed1 = false;
 this.confirmed2 = false;
 this.locked = false;
 }
}
class SuperStack {
 constructor(itemStack) {
 this.itemStack = itemStack;
 }
 setData(data) {
 if (data !== undefined && data !== null) {
 this.itemStack.data = data;
 }
 return this;
 }
}
function getItemDurability(item) {
 if (!item) return null;
 const durabilityComponent = item.getComponent(DURABILITY_COMPONENT);
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
function getItemFullData(itemStack) {
 if (!itemStack) return null;
 const enchantments = [];
 let name = "";
 let lore = [];
 let durability = null;
 try {
 const enchantComp = itemStack.getComponent(ENCHANTABLE_COMPONENT);
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
 } catch {}
 }
 try {
 const nameComp = itemStack.getComponent(CUSTOM_NAME_COMPONENT);
 if (nameComp && nameComp.name) {
 name = nameComp.name;
 } else if (itemStack.nameTag) {
 name = itemStack.nameTag;
 }
 } catch {}
 try {
 const loreComp = itemStack.getComponent(LORE_COMPONENT);
 if (loreComp && loreComp.lore) {
 lore = loreComp.lore;
 } else if (itemStack.getLore) {
 lore = itemStack.getLore();
 }
 } catch {}
 durability = getItemDurability(itemStack);
 } catch {}
 return {
 typeId: itemStack.typeId,
 amount: itemStack.amount,
 data: itemStack.data || 0,
 enchantments: enchantments,
 name: name,
 lore: lore,
 durability: durability,
 };
}
function formatItemName(item) {
 let name =
 item.name ||
 item.typeId
 .replace("minecraft:", "")
 .split("_")
 .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
 .join(" ");
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
 return name;
}
function applyItemProperties(
 player,
 itemTypeId,
 amount,
 data,
 enchantments = [],
 name = "",
 lore = [],
 durability = null,
) {
 try {
 if (!player || !itemTypeId || isNaN(amount) || amount <= 0) {
 return false;
 }
 const item = new ItemStack(itemTypeId, amount);
 if (!item) {
 return false;
 }
 try {
 if (data !== undefined && data !== null) {
 item.data = data;
 }
 } catch {}
 if (enchantments && enchantments.length > 0) {
 try {
 const enchantable = item.getComponent(ENCHANTABLE_COMPONENT);
 if (enchantable) {
 for (const ench of enchantments) {
 try {
 enchantable.addEnchantment({
 type: new EnchantmentType(ench.id || ench.type),
 level: ench.level || 1,
 });
 } catch {}
 }
 }
 } catch {}
 }
 if (name) {
 try {
 item.nameTag = name;
 } catch {}
 }
 if (lore && lore.length > 0) {
 try {
 item.setLore(lore);
 } catch {}
 }
 if (durability && typeof durability === "object") {
 try {
 const durabilityComp = item.getComponent(DURABILITY_COMPONENT);
 if (durabilityComp && durability.currentDamage !== undefined) {
 durabilityComp.damage = durability.currentDamage;
 }
 } catch {}
 }
 try {
 const inventory = player.getComponent(INVENTORY_COMPONENT);
 if (!inventory || !inventory.container) {
 return false;
 }
 if (!item || typeof item !== "object" || !item.typeId) {
 return false;
 }
 try {
 const result = inventory.container.addItem(item);
 return result && result.successCount && result.successCount > 0;
 } catch {
 let command = `give @s ${itemTypeId.replace("minecraft:", "")} ${amount}`;
 if (data !== undefined && data !== null) {
 command += ` ${data}`;
 } else if (durability && durability.currentDamage !== undefined) {
 command += ` ${durability.currentDamage}`;
 }
 player.runCommand(command);
 return true;
 }
 } catch {
 return false;
 }
 } catch {
 return false;
 }
}
function buildItemComponentJson(enchantments, name, lore) {
 let components = {};
 if (enchantments && enchantments.length > 0) {
 let enchList = [];
 for (const ench of enchantments) {
 enchList.push({
 id: ench.id,
 level: ench.level,
 });
 }
 components["minecraft:enchantments"] = {
 enchantments: enchList,
 };
 }
 if (name) {
 components["minecraft:custom_name"] = {
 value: name,
 };
 }
 if (lore && lore.length > 0) {
 components["minecraft:lore"] = {
 value: lore,
 };
 }
 return JSON.stringify({ components: components });
}
export function BarterMenu(player) {
 const form = new ActionFormData()
 .title("Barter System")
 .body("§7Trade items with players")
 .button("Create Request", "textures/ui/icon_book_writable")
 .button("Active Barter", "textures/ui/inventory_icon")
 .button("Back", "textures/ui/arrow_left");
 form.show(player).then((response) => {
 if (!response.canceled) {
 switch (response.selection) {
 case 0:
 createBarterRequest(player);
 break;
 case 1:
 viewActiveBarter(player);
 break;
 case 2:
 showMemberMenu(player);
 break;
 }
 }
 });
}
async function createBarterRequest(player) {
 const playerList = Array.from(world.getPlayers())
 .filter((p) => p.name !== player.name)
 .map((p) => p.name);
 if (playerList.length === 0) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ No players available for barter!"}]}`,
 );
 return;
 }
 const form = new ModalFormData()
 .title("Create Barter §t§p§a")
 .dropdown("§eSelect Player", playerList, { defaultValue: 0 });
 const response = await form.show(player);
 if (!response.canceled) {
 const targetPlayer = world
 .getPlayers()
 .find((p) => p.name === playerList[response.formValues[0]]);
 if (targetPlayer) {
 if (isPlayerInBarter(player) || isPlayerInBarter(targetPlayer)) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ One of the players is already in a barter session!"}]}`,
 );
 return;
 }
 const session = new BarterSession(player, targetPlayer);
 const sessionId = `${player.name}_${targetPlayer.name}`;
 activeBarters.set(sessionId, session);
 saveBarterChanges();
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✔ Barter request sent to ${targetPlayer.name}!"}]}`,
 );
 targetPlayer.runCommand(
 `tellraw @s {"rawtext":[{"text":"§e⚡ ${player.name} wants to barter with you! Check your active barter menu to respond."}]}`,
 );
 viewActiveBarter(player);
 }
 }
}
function viewActiveBarter(player) {
 const session = getPlayerBarterSession(player);
 if (!session) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ You don't have any active barter sessions!"}]}`,
 );
 return;
 }
 const isPlayer1 = session.player1.name === player.name;
 const otherPlayer = isPlayer1 ? session.player2 : session.player1;
 const myItems = isPlayer1 ? session.items1 : session.items2;
 const theirItems = isPlayer1 ? session.items2 : session.items1;
 const form = new ActionFormData()
 .title("Active Barter")
 .body(
 `§7With: §b${otherPlayer.name} §8| §7You: §b${myItems.length} §8| §7Them: §b${theirItems.length}`,
 )
 .button("Add/Remove", "textures/ui/inventory_icon")
 .button("View Items", "textures/ui/magnifying_glass")
 .button("Confirm", "textures/ui/check")
 .button("Cancel", "textures/ui/redX1");
 form.show(player).then((response) => {
 if (!response.canceled) {
 switch (response.selection) {
 case 0:
 manageBarterItems(player, session);
 break;
 case 1:
 viewBarterItems(player, session);
 break;
 case 2:
 confirmBarter(player, session);
 break;
 case 3:
 cancelBarter(player, session);
 break;
 }
 }
 });
}
function manageBarterItems(player, session) {
 if (session.locked) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ Cannot modify items while trade is locked!"}]}`,
 );
 return;
 }
 const isPlayer1 = session.player1.name === player.name;
 const myItems = isPlayer1 ? session.items1 : session.items2;
 const form = new ActionFormData()
 .title("Manage Items")
 .body("§7Select action")
 .button("Add Item", "textures/ui/plus")
 .button("Remove Item", "textures/ui/minus")
 .button("Back", "textures/ui/arrow_left");
 form.show(player).then((response) => {
 if (!response.canceled) {
 switch (response.selection) {
 case 0:
 showInventoryItems(player, session);
 break;
 case 1:
 showRemoveItems(player, session);
 break;
 case 2:
 viewActiveBarter(player);
 break;
 }
 }
 });
}
async function showInventoryItems(player, session) {
 try {
 const container = player.getComponent("inventory").container;
 const inventory = [];
 for (let i = 0; i < container.size; i++) {
 const item = container.getItem(i);
 if (item) {
 const itemData = getItemFullData(item);
 itemData.slot = i;
 inventory.push(itemData);
 if (itemData.durability) {
 console.warn(
 `Item in slot ${i}: ${itemData.typeId} has durability: damage=${itemData.durability.currentDamage}, max=${itemData.durability.maxDurability}`,
 );
 }
 }
 }
 if (inventory.length === 0) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ No items in your inventory!"}]}`,
 );
 return manageBarterItems(player, session);
 }
 const itemSelectionForm = new ModalFormData()
 .title("Add Item §t§p§a")
 .dropdown(
 "§eSelect Item",
 inventory.map((item) => {
 const itemName = formatItemName(item);
 const enchantMark =
 item.enchantments && item.enchantments.length > 0 ? " ✨" : "";
 return `${itemName} (x${item.amount})${enchantMark}`;
 }),
 { defaultValue: 1 },
 );
 const itemResponse = await itemSelectionForm.show(player);
 if (itemResponse.canceled) {
 return manageBarterItems(player, session);
 }
 const selectedItem = inventory[itemResponse.formValues[0]];
 const isPlayer1 = session.player1.name === player.name;
 const items = isPlayer1 ? session.items1 : session.items2;
 const existingItemIndex = items.findIndex(
 (item) =>
 item.typeId === selectedItem.typeId &&
 (item.data || 0) === (selectedItem.data || 0) &&
 item.name === selectedItem.name &&
 arraysEqual(item.enchantments, selectedItem.enchantments) &&
 arraysEqual(item.lore, selectedItem.lore),
 );
 const existingAmount =
 existingItemIndex !== -1 ? items[existingItemIndex].amount : 0;
 const maxStack = 64;
 const maxAddableAmount = Math.min(
 selectedItem.amount,
 maxStack - existingAmount,
 );
 if (maxAddableAmount <= 0) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ Cannot add more of this item (stack limit reached)!"}]}`,
 );
 return manageBarterItems(player, session);
 }
 const amountForm = new ModalFormData()
 .title("Select Amount §t§p§a")
 .slider("§6Amount to Add", 1, maxAddableAmount, {
 defaultValue: Math.min(maxAddableAmount, 64),
 valueStep: 1,
 tooltip: "§8Choose how many items to add",
 });
 const amountResponse = await amountForm.show(player);
 if (amountResponse.canceled) {
 return showInventoryItems(player, session);
 }
 let amount = 1;
 try {
 if (
 amountResponse.formValues &&
 amountResponse.formValues[0] !== undefined
 ) {
 amount = Math.floor(parseFloat(amountResponse.formValues[0]));
 if (isNaN(amount) || amount < 1) {
 amount = 1;
 }
 }
 } catch {}
 if (amount > maxAddableAmount) amount = maxAddableAmount;
 try {
 const currentItem = container.getItem(selectedItem.slot);
 if (
 !currentItem ||
 currentItem.typeId !== selectedItem.typeId ||
 (currentItem.data || 0) !== (selectedItem.data || 0) ||
 currentItem.amount < amount
 ) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ Item no longer available in required amount!"}]}`,
 );
 return manageBarterItems(player, session);
 }
 console.warn(
 `Adding item: ${currentItem.typeId}, amount: ${amount}, slot: ${selectedItem.slot}`,
 );
 if (currentItem.amount === amount) {
 container.setItem(selectedItem.slot, null);
 } else {
 const newItem = new ItemStack(
 currentItem.typeId,
 currentItem.amount - amount,
 );
 if (currentItem.data !== undefined && currentItem.data !== null) {
 newItem.data = currentItem.data;
 }
 container.setItem(selectedItem.slot, newItem);
 }
 if (existingItemIndex !== -1) {
 items[existingItemIndex].amount += amount;
 } else {
 const itemToAdd = {
 typeId: selectedItem.typeId,
 amount: amount,
 data: selectedItem.data || 0,
 enchantments: selectedItem.enchantments || [],
 name: selectedItem.name || "",
 lore: selectedItem.lore || [],
 durability: selectedItem.durability,
 };
 if (selectedItem.durability) {
 console.warn(
 `Adding item to trade with durability: ${JSON.stringify(selectedItem.durability)}`,
 );
 }
 items.push(itemToAdd);
 }
 session.confirmed1 = false;
 session.confirmed2 = false;
 saveBarterChanges();
 const itemName =
 selectedItem.name || selectedItem.typeId.replace("minecraft:", "");
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✔ Added ${amount}x ${itemName} to trade"}]}`,
 );
 const otherPlayer = isPlayer1 ? session.player2 : session.player1;
 otherPlayer.runCommand(
 `tellraw @s {"rawtext":[{"text":"§e⚡ ${player.name} added ${amount}x ${itemName} to trade"}]}`,
 );
 viewActiveBarter(player);
 } catch {}
 } catch {}
}
function showRemoveItems(player, session) {
 const isPlayer1 = session.player1.name === player.name;
 const items = isPlayer1 ? session.items1 : session.items2;
 if (items.length === 0) {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ No items in trade to remove!"}]}`,
 );
 return manageBarterItems(player, session);
 }
 const itemSelectionForm = new ModalFormData()
 .title("Remove Trade Item §t§p§a")
 .dropdown(
 "§6Select Item to Remove",
 items.map((item) => {
 const itemName = formatItemName(item);
 const enchantMark =
 item.enchantments && item.enchantments.length > 0 ? " ✨" : "";
 return `${itemName} (x${item.amount})${enchantMark}`;
 }),
 )
 .toggle("§6Remove All?", false, {
 defaultValue: false,
 tooltip:
 "§8Choose if you want to remove all items or just a specific amount",
 });
 itemSelectionForm.show(player).then((itemResponse) => {
 if (itemResponse.canceled) {
 return manageBarterItems(player, session);
 }
 const [selectedIndex, removeAll] = itemResponse.formValues;
 const selectedItem = items[selectedIndex];
 if (removeAll) {
 const removedItem = items.splice(selectedIndex, 1)[0];
 try {
 const success = applyItemProperties(
 player,
 removedItem.typeId,
 removedItem.amount,
 removedItem.data,
 removedItem.enchantments,
 removedItem.name,
 removedItem.lore,
 removedItem.durability,
 );
 if (success) {
 const displayName = formatItemName(removedItem);
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✔ Removed all ${displayName} (x${removedItem.amount}) from trade"}]}`,
 );
 } else {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ Error returning item to inventory!"}]}`,
 );
 items.push(removedItem);
 return;
 }
 } catch {}
 session.confirmed1 = false;
 session.confirmed2 = false;
 saveBarterChanges();
 const otherPlayer = isPlayer1 ? session.player2 : session.player1;
 const displayName = formatItemName(removedItem);
 otherPlayer.runCommand(
 `tellraw @s {"rawtext":[{"text":"§e⚡ ${player.name} removed ${removedItem.amount}x ${displayName} from trade"}]}`,
 );
 viewActiveBarter(player);
 } else {
 const amountForm = new ModalFormData()
 .title("Select Amount to Remove §t§p§a")
 .slider("§6Amount to Remove", 1, selectedItem.amount, 1, {
 defaultValue: 1,
 valueStep: 1,
 tooltip: "§8Choose how many items to remove",
 });
 amountForm.show(player).then((amountResponse) => {
 if (amountResponse.canceled) {
 return showRemoveItems(player, session);
 }
 let amountToRemove = 1;
 try {
 if (
 amountResponse.formValues &&
 amountResponse.formValues[0] !== undefined
 ) {
 amountToRemove = Math.floor(
 parseFloat(amountResponse.formValues[0]),
 );
 if (isNaN(amountToRemove) || amountToRemove < 1) {
 amountToRemove = 1;
 }
 }
 } catch {}
 try {
 console.warn(
 `Removing ${amountToRemove} of ${selectedItem.typeId} from trade`,
 );
 if (amountToRemove >= selectedItem.amount) {
 const removedItem = items.splice(selectedIndex, 1)[0];
 const success = applyItemProperties(
 player,
 removedItem.typeId,
 removedItem.amount,
 removedItem.data,
 removedItem.enchantments,
 removedItem.name,
 removedItem.lore,
 removedItem.durability,
 );
 if (success) {
 const displayName = formatItemName(removedItem);
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✔ Removed all ${displayName} (x${removedItem.amount}) from trade"}]}`,
 );
 } else {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ Error returning item to inventory!"}]}`,
 );
 items.push(removedItem);
 return;
 }
 } else {
 selectedItem.amount -= amountToRemove;
 const success = applyItemProperties(
 player,
 selectedItem.typeId,
 amountToRemove,
 selectedItem.data,
 selectedItem.enchantments,
 selectedItem.name,
 selectedItem.lore,
 selectedItem.durability,
 );
 if (success) {
 const displayName = formatItemName(selectedItem);
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✔ Removed ${amountToRemove}x ${displayName} (Remaining: ${selectedItem.amount})"}]}`,
 );
 } else {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§c✘ Error returning item to inventory!"}]}`,
 );
 selectedItem.amount += amountToRemove;
 return;
 }
 }
 session.confirmed1 = false;
 session.confirmed2 = false;
 saveBarterChanges();
 const otherPlayer = isPlayer1 ? session.player2 : session.player1;
 const displayName = formatItemName(selectedItem);
 otherPlayer.runCommand(
 `tellraw @s {"rawtext":[{"text":"§e⚡ ${player.name} removed ${amountToRemove}x ${displayName} from trade"}]}`,
 );
 viewActiveBarter(player);
 } catch {}
 });
 }
 });
}
async function getPlayerInventory(player) {
 const inventory = [];
 try {
 const container = player.getComponent("inventory").container;
 for (let i = 0; i < container.size; i++) {
 const item = container.getItem(i);
 if (item) {
 inventory.push({
 typeId: item.typeId,
 amount: item.amount,
 data: item.data,
 slot: i,
 });
 }
 }
 } catch {}
 return inventory;
}
async function verifyItemInInventory(player, typeId, amount) {
 try {
 const container = player.getComponent("inventory").container;
 let totalAmount = 0;
 for (let i = 0; i < container.size; i++) {
 const item = container.getItem(i);
 if (item && item.typeId === typeId) {
 totalAmount += item.amount;
 if (totalAmount >= amount) {
 return true;
 }
 }
 }
 return false;
 } catch {}
 return false;
}
function viewBarterItems(player, session) {
 const isPlayer1 = session.player1.name === player.name;
 const myItems = isPlayer1 ? session.items1 : session.items2;
 const theirItems = isPlayer1 ? session.items2 : session.items1;
 const form = new ActionFormData()
 .title("View Barter Items")
 .body(
 `§e=== Your Items ===\n${formatItems(myItems)}\n\n§e=== Their Items ===\n${formatItems(theirItems)}`,
 )
 .button("Back", "textures/ui/arrow_left");
 form.show(player).then(() => viewActiveBarter(player));
}
function confirmBarter(player, session) {
 const isPlayer1 = session.player1.name === player.name;
 if (isPlayer1) {
 session.confirmed1 = true;
 } else {
 session.confirmed2 = true;
 }
 saveBarterChanges();
 if (session.confirmed1 && session.confirmed2) {
 session.locked = true;
 saveBarterChanges();
 executeBarter(session);
 } else {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✔ Trade confirmed! Waiting for other player..."}]}`,
 );
 const otherPlayer = isPlayer1 ? session.player2 : session.player1;
 otherPlayer.runCommand(
 `tellraw @s {"rawtext":[{"text":"§e⚡ ${player.name} has confirmed the trade!"}]}`,
 );
 }
}
function cancelBarter(player, session) {
 const sessionId = getSessionId(session);
 try {
 let originalFeedbackState = "true";
 try {
 world
 .getDimension("overworld")
 .runCommand("gamerule sendcommandfeedback");
 } catch (error) {
 const match = error.message.match(/sendcommandfeedback = (true|false)/i);
 if (match) {
 originalFeedbackState = match[1].toLowerCase();
 }
 }
 world
 .getDimension("overworld")
 .runCommand("gamerule sendcommandfeedback false");
 let player1Success = true;
 for (const item of session.items1) {
 try {
 const success = applyItemProperties(
 session.player1,
 item.typeId,
 item.amount,
 item.data,
 item.enchantments,
 item.name,
 item.lore,
 item.durability,
 );
 if (!success) {
 player1Success = false;
 }
 } catch {}
 }
 let player2Success = true;
 for (const item of session.items2) {
 try {
 const success = applyItemProperties(
 session.player2,
 item.typeId,
 item.amount,
 item.data,
 item.enchantments,
 item.name,
 item.lore,
 item.durability,
 );
 if (!success) {
 player2Success = false;
 }
 } catch {}
 }
 world
 .getDimension("overworld")
 .runCommand(`gamerule sendcommandfeedback ${originalFeedbackState}`);
 activeBarters.delete(sessionId);
 saveBarterChanges();
 let message1 = player1Success
 ? "§c✘ Barter cancelled! All items returned."
 : "§c✘ Barter cancelled! Some items may not have been returned correctly.";
 let message2 = player2Success
 ? "§c✘ Barter cancelled! All items returned."
 : "§c✘ Barter cancelled! Some items may not have been returned correctly.";
 session.player1.runCommand(
 `tellraw @s {"rawtext":[{"text":"${message1}"}]}`,
 );
 session.player2.runCommand(
 `tellraw @s {"rawtext":[{"text":"${message2}"}]}`,
 );
 } catch {}
}
function isPlayerInBarter(player) {
 return Array.from(activeBarters.values()).some(
 (session) =>
 session.player1.name === player.name ||
 session.player2.name === player.name,
 );
}
function getPlayerBarterSession(player) {
 return Array.from(activeBarters.values()).find(
 (session) =>
 session.player1.name === player.name ||
 session.player2.name === player.name,
 );
}
function getSessionId(session) {
 return `${session.player1.name}_${session.player2.name}`;
}
function formatItems(items) {
 return items.length > 0
 ? items
 .map((item) => {
 const displayName = formatItemName(item);
 const enchantmentMark =
 item.enchantments && item.enchantments.length > 0 ? " §b✨" : "";
 return `§f- ${displayName} (x${item.amount})${enchantmentMark}`;
 })
 .join("\n")
 : "§7No items added";
}
function arraysEqual(a, b) {
 if (!a || !b) return !a && !b;
 if (a.length !== b.length) return false;
 for (let i = 0; i < a.length; i++) {
 if (typeof a[i] === "object" && typeof b[i] === "object") {
 if (!objectsEqual(a[i], b[i])) return false;
 } else if (a[i] !== b[i]) {
 return false;
 }
 }
 return true;
}
function objectsEqual(a, b) {
 const keysA = Object.keys(a);
 const keysB = Object.keys(b);
 if (keysA.length !== keysB.length) return false;
 for (let key of keysA) {
 if (a[key] !== b[key]) return false;
 }
 return true;
}
async function executeBarter(session) {
 try {
 let originalFeedbackState = "true";
 try {
 await world
 .getDimension("overworld")
 .runCommand("gamerule sendcommandfeedback");
 } catch (error) {
 const match = error.message.match(/sendcommandfeedback = (true|false)/i);
 if (match) {
 originalFeedbackState = match[1].toLowerCase();
 }
 }
 for (const item of session.items1) {
 try {
 await session.player1.runCommand(
 `testfor @s[hasitem={item=${item.typeId.replace("minecraft:", "")},quantity=${item.amount}${item.data ? `,data=${item.data}` : ""}}]`,
 );
 } catch (error) {
 throw new Error(
 `${session.player1.name} no longer has enough ${item.typeId.replace("minecraft:", "")}`,
 );
 }
 }
 for (const item of session.items2) {
 try {
 await session.player2.runCommand(
 `testfor @s[hasitem={item=${item.typeId.replace("minecraft:", "")},quantity=${item.amount}${item.data ? `,data=${item.data}` : ""}}]`,
 );
 } catch (error) {
 throw new Error(
 `${session.player2.name} no longer has enough ${item.typeId.replace("minecraft:", "")}`,
 );
 }
 }
 const items1Copy = JSON.parse(JSON.stringify(session.items1));
 const items2Copy = JSON.parse(JSON.stringify(session.items2));
 await world
 .getDimension("overworld")
 .runCommand("gamerule sendcommandfeedback false");
 for (const item of session.items1) {
 await session.player1.runCommand(
 `clear @s ${item.typeId.replace("minecraft:", "")} ${item.amount} ${item.data || 0}`,
 );
 }
 for (const item of session.items2) {
 await session.player2.runCommand(
 `clear @s ${item.typeId.replace("minecraft:", "")} ${item.amount} ${item.data || 0}`,
 );
 }
 let failedItemsPlayer1 = 0;
 let totalItemsPlayer1 = items2Copy.length;
 let failedItemsPlayer2 = 0;
 let totalItemsPlayer2 = items1Copy.length;
 for (const item of items2Copy) {
 try {
 const success = applyItemProperties(
 session.player1,
 item.typeId,
 item.amount,
 item.data,
 item.enchantments,
 item.name,
 item.lore,
 item.durability,
 );
 if (!success) {
 failedItemsPlayer1++;
 }
 } catch {}
 }
 for (const item of items1Copy) {
 try {
 const success = applyItemProperties(
 session.player2,
 item.typeId,
 item.amount,
 item.data,
 item.enchantments,
 item.name,
 item.lore,
 item.durability,
 );
 if (!success) {
 failedItemsPlayer2++;
 }
 } catch {}
 }
 await world
 .getDimension("overworld")
 .runCommand(`gamerule sendcommandfeedback ${originalFeedbackState}`);
 const successPercentPlayer1 =
 totalItemsPlayer1 > 0
 ? ((totalItemsPlayer1 - failedItemsPlayer1) / totalItemsPlayer1) * 100
 : 100;
 const successPercentPlayer2 =
 totalItemsPlayer2 > 0
 ? ((totalItemsPlayer2 - failedItemsPlayer2) / totalItemsPlayer2) * 100
 : 100;
 const isTradeMostlySuccessful =
 successPercentPlayer1 >= 90 && successPercentPlayer2 >= 90;
 if (isTradeMostlySuccessful) {
 session.player1.runCommand(`playsound random.levelup @s`);
 session.player2.runCommand(`playsound random.levelup @s`);
 if (failedItemsPlayer1 > 0 || failedItemsPlayer2 > 0) {
 session.player1.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✔ Trade completed with minor issues - some item properties may not have transferred perfectly."}]}`,
 );
 session.player2.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✔ Trade completed with minor issues - some item properties may not have transferred perfectly."}]}`,
 );
 } else {
 session.player1.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✔ Trade completed successfully!"}]}`,
 );
 session.player2.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✔ Trade completed successfully!"}]}`,
 );
 }
 const sessionId = getSessionId(session);
 activeBarters.delete(sessionId);
 saveBarterChanges();
 } else {
 session.player1.runCommand(`playsound random.levelup @s`);
 session.player2.runCommand(`playsound random.levelup @s`);
 session.player1.runCommand(
 `tellraw @s {"rawtext":[{"text":"§e⚠ Trade completed with some issues - basic items transferred but some properties may be missing."}]}`,
 );
 session.player2.runCommand(
 `tellraw @s {"rawtext":[{"text":"§e⚠ Trade completed with some issues - basic items transferred but some properties may be missing."}]}`,
 );
 const sessionId = getSessionId(session);
 activeBarters.delete(sessionId);
 saveBarterChanges();
 }
 } catch {}
}
export { getItemFullData, applyItemProperties };
