import { ItemStack } from '../core.js';
import { addMoney } from "../function/moneySystem.js";

const parseRewardCount = (value) => {
 const parsed = Number(value);
 if (!Number.isFinite(parsed) || parsed <= 0) return null;
 return Math.floor(parsed);
};

const normalizeRewardItems = (rewards) => {
 const normalized = [];
 const sourceItems = [];

 if (Array.isArray(rewards?.items)) {
 sourceItems.push(...rewards.items);
 }

 if (rewards?.item) {
 sourceItems.push(rewards.item);
 }

 const directItemId = typeof rewards?.itemId === "string" ? rewards.itemId.trim() : "";
 const directCount = parseRewardCount(rewards?.count ?? rewards?.amount ?? rewards?.qty);
 if (directItemId && directCount !== null) {
 sourceItems.push({
 id: directItemId,
 count: directCount,
 data: rewards.data,
 });
 }

 for (const rawItem of sourceItems) {
 if (!rawItem) continue;

 if (typeof rawItem === "string") {
 const id = rawItem.trim();
 if (!id) continue;
 normalized.push({ id, count: 1 });
 continue;
 }

 if (typeof rawItem !== "object") continue;

 const id = String(rawItem.id ?? rawItem.itemId ?? rawItem.identifier ?? "").trim();
 if (!id) continue;
 const count = parseRewardCount(rawItem.count ?? rawItem.amount ?? rawItem.qty);
 if (count === null) continue;

 normalized.push({
 id,
 count,
 data: rawItem.data,
 });
 }

 return normalized;
};

const normalizeRewardCommands = (rewards) => {
 if (!Array.isArray(rewards?.commands)) return [];

 const commands = [];
 for (const entry of rewards.commands) {
 if (!entry) continue;

 if (typeof entry === "string") {
 const cmd = entry.trim();
 if (cmd) commands.push({ cmd });
 continue;
 }

 if (typeof entry !== "object") continue;

 const cmd = typeof entry.cmd === "string" ? entry.cmd.trim() : "";
 if (!cmd) continue;

 commands.push({
 cmd,
 msg: typeof entry.msg === "string" ? entry.msg : "",
 });
 }

 return commands;
};

const isSafeItemId = (itemId) => /^[a-z0-9_.:-]+$/i.test(itemId);

const getDisplayItemName = (itemId) =>
 itemId.startsWith("minecraft:") ? itemId.replace("minecraft:", "").replace(/_/g, " ") : itemId;

const getMaxStackAmount = (itemId) => {
 try {
 const probe = new ItemStack(itemId, 1);
 const maxAmount = Number(probe?.maxAmount);
 return Number.isFinite(maxAmount) && maxAmount > 0 ? Math.floor(maxAmount) : 64;
 } catch {
 return 64;
 }
};

const giveItemReward = (player, inventory, rewardItem) => {
 const totalCount = parseRewardCount(rewardItem?.count) ?? 1;

 try {
 const maxStackAmount = getMaxStackAmount(rewardItem.id);
 let remaining = totalCount;
 let droppedAny = false;

 while (remaining > 0) {
 const giveAmount = Math.min(maxStackAmount, remaining);
 const itemStack = new ItemStack(rewardItem.id, giveAmount);

 if (inventory) {
 const leftOver = inventory.addItem(itemStack);
 if (leftOver) {
 player.dimension.spawnItem(leftOver, player.location);
 droppedAny = true;
 }
 } else {
 player.dimension.spawnItem(itemStack, player.location);
 }

 remaining -= giveAmount;
 }

 if (droppedAny) {
 player.sendMessage("§eInventory full! Reward dropped at your feet.");
 }

 return true;
 } catch (stackError) {
 if (!isSafeItemId(rewardItem.id)) {
 console.warn(`[QuestReward] Invalid item id: ${rewardItem.id}`);
 return false;
 }

 try {
 const dataValue = Number.isFinite(Number(rewardItem.data))
 ? ` ${Math.max(0, Math.floor(Number(rewardItem.data)))}`
 : "";

 let remaining = totalCount;
 const commandChunkLimit = 32767;
 while (remaining > 0) {
 const giveAmount = Math.min(remaining, commandChunkLimit);
 player.runCommand(`give @s ${rewardItem.id} ${giveAmount}${dataValue}`);
 remaining -= giveAmount;
 }

 return true;
 } catch (cmdError) {
 console.warn(`[QuestReward] Failed to give item '${rewardItem.id}':`, cmdError);
 return false;
 }
 }
};

export async function giveQuestRewards(player, rewards) {
 try {
 if (typeof rewards?.money === "number" && rewards.money > 0) {
 if (addMoney(player, rewards.money)) {
 player.sendMessage(`§a+ $${rewards.money}`);
 } else {
 console.warn(`Failed to add money reward to player ${player.name}`);
 }
 }

 const inventory = player.getComponent("inventory")?.container;
 const itemRewards = normalizeRewardItems(rewards);
 for (const rewardItem of itemRewards) {
 const gave = giveItemReward(player, inventory, rewardItem);
 if (gave) {
 player.sendMessage(`§a+ ${getDisplayItemName(rewardItem.id)} §7x${rewardItem.count}`);
 } else {
 player.sendMessage(`§cFailed to give item reward: ${rewardItem.id}`);
 }
 }

 const commandRewards = normalizeRewardCommands(rewards);
 for (const commandReward of commandRewards) {
 try {
 player.runCommand(commandReward.cmd);
 if (commandReward.msg) {
 player.sendMessage(commandReward.msg);
 }
 } catch (commandError) {
 console.warn(`[QuestReward] Failed command '${commandReward.cmd}':`, commandError);
 }
 }

 if (typeof rewards?.xp === "number" && rewards.xp > 0) {
 const xpAmount = Math.floor(rewards.xp);
 try {
 player.runCommand(`xp ${xpAmount} @s`);
 } catch (xpError) {
 console.warn(`Failed to add XP reward to player ${player.name}:`, xpError);
 }
 }

 player.runCommand("playsound random.levelup @s ~~~ 1 1");
 player.runCommand("particle minecraft:totem_particle ~~~");
 return true;
 } catch (error) {
 console.warn("Error giving quest rewards:", error);
 return false;
 }
}
export function calculateRewardValue(rewards) {
 let totalValue = 0;
 if (typeof rewards?.money === "number" && rewards.money > 0) {
 totalValue += rewards.money;
 }

 const itemRewards = normalizeRewardItems(rewards);
 for (const item of itemRewards) {
 const valuePerItem =
 {
 "minecraft:diamond": 100,
 "minecraft:golden_apple": 50,
 "minecraft:emerald": 25,
 }[item.id] || 5;
 totalValue += valuePerItem * item.count;
 }

 return totalValue;
}
export function formatRewardDisplay(rewards) {
 const display = [];

 if (typeof rewards?.money === "number" && rewards.money > 0) {
 display.push(`§6$${rewards.money}`);
 }

 const itemRewards = normalizeRewardItems(rewards);
 for (const item of itemRewards) {
 display.push(`§e${getDisplayItemName(item.id)} §7x${item.count}`);
 }

 if (typeof rewards?.xp === "number" && rewards.xp > 0) {
 display.push(`§bXP §7x${Math.floor(rewards.xp)}`);
 }

 const commandRewards = normalizeRewardCommands(rewards);
 for (const commandReward of commandRewards) {
 display.push(`§dCommand: §7${commandReward.cmd}`);
 }

 return display.join("\n");
}
export function adjustRewardsByDifficulty(rewards, difficulty = 1) {
 const adjustedRewards = { ...rewards };

 if (typeof adjustedRewards.money === "number" && adjustedRewards.money > 0) {
 adjustedRewards.money = Math.floor(adjustedRewards.money * difficulty);
 }

 if (typeof adjustedRewards.xp === "number" && adjustedRewards.xp > 0) {
 adjustedRewards.xp = Math.floor(adjustedRewards.xp * difficulty);
 }

 if (adjustedRewards.items && Array.isArray(adjustedRewards.items)) {
 adjustedRewards.items = adjustedRewards.items.map((item) => {
 if (typeof item === "string") {
 return { id: item, count: Math.max(1, Math.floor(difficulty)) };
 }

 const normalizedItem = typeof item === "object" && item !== null ? { ...item } : { id: item };
 const baseCount = parseRewardCount(normalizedItem.count ?? normalizedItem.amount ?? normalizedItem.qty);
 if (baseCount === null) {
 return normalizedItem;
 }

 return {
 ...normalizedItem,
 count: Math.max(1, Math.floor(baseCount * difficulty)),
 };
 });
 }

 if (adjustedRewards.item && typeof adjustedRewards.item === "object") {
 const baseCount = parseRewardCount(
 adjustedRewards.item.count ?? adjustedRewards.item.amount ?? adjustedRewards.item.qty,
 );
 adjustedRewards.item = {
 ...adjustedRewards.item,
 ...(baseCount !== null ? { count: Math.max(1, Math.floor(baseCount * difficulty)) } : {}),
 };
 }

 return adjustedRewards;
}
export function validateRewards(rewards) {
 if (!rewards) return false;

 if (rewards.money !== undefined) {
 if (typeof rewards.money !== "number" || !Number.isFinite(rewards.money) || rewards.money < 0) return false;
 }

 if (rewards.xp !== undefined) {
 if (typeof rewards.xp !== "number" || !Number.isFinite(rewards.xp) || rewards.xp < 0) return false;
 }

 const isValidItemEntry = (item) => {
 if (typeof item === "string") return item.trim().length > 0;
 if (!item || typeof item !== "object") return false;

 const itemId = item.id ?? item.itemId ?? item.identifier;
 if (typeof itemId !== "string" || !itemId.trim()) return false;

 const countValue = item.count ?? item.amount ?? item.qty;
 if (countValue === undefined) return false;

 const countNumber = Number(countValue);
 if (!Number.isFinite(countNumber) || countNumber <= 0) return false;

 return true;
 };

 if (rewards.items !== undefined) {
 if (!Array.isArray(rewards.items)) return false;
 for (const item of rewards.items) {
 if (!isValidItemEntry(item)) return false;
 }
 }

 if (rewards.item !== undefined && !isValidItemEntry(rewards.item)) {
 return false;
 }

 if (rewards.itemId !== undefined) {
 if (typeof rewards.itemId !== "string" || !rewards.itemId.trim()) return false;

 const directCount = rewards.count ?? rewards.amount ?? rewards.qty;
 if (directCount === undefined) return false;

 const countNumber = Number(directCount);
 if (!Number.isFinite(countNumber) || countNumber <= 0) return false;
 }

 if (rewards.commands !== undefined) {
 if (!Array.isArray(rewards.commands)) return false;

 for (const command of rewards.commands) {
 if (typeof command === "string") {
 if (!command.trim()) return false;
 continue;
 }

 if (!command || typeof command !== "object") return false;
 if (typeof command.cmd !== "string" || !command.cmd.trim()) return false;
 }
 }

 return true;
}
