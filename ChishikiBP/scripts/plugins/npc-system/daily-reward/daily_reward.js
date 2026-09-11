import { world, system, ItemStack, ActionFormData, ModalFormData } from '../../../core.js';
import { addMoney } from "../../../function/moneySystem.js";
import { GlobalConfig } from "../../../function/GlobalConfig.js";
import { getAllRanks, isPlayerValid } from "../../ranks/rank.js";
const DEFAULT_CONFIG = {
 items: {
 enabled: true,
 list: [
 { item: "minecraft:diamond", amount: 3 },
 { item: "minecraft:emerald", amount: 5 },
 { item: "minecraft:golden_apple", amount: 2 },
 ],
 prefix: "minecraft:",
 },
 money: { enabled: true, amount: 1000 },
 cooldown: 86400000,
 rankRewards: {},
};
const DailyRewardConfig = {
 get: () => {
 try {
 const data = GlobalConfig.get("dailyRewardConfig");
 const parsed = data ? (typeof data === "string" ? JSON.parse(data) : data) : {};
 const merged = { ...DEFAULT_CONFIG, ...parsed };
 if (!merged.items || typeof merged.items !== "object") merged.items = { ...DEFAULT_CONFIG.items };
 if (!merged.money || typeof merged.money !== "object") merged.money = { ...DEFAULT_CONFIG.money };
 if (!merged.rankRewards || typeof merged.rankRewards !== "object" || Array.isArray(merged.rankRewards)) merged.rankRewards = {};
 return merged;
 } catch {
 return { ...DEFAULT_CONFIG, items: { ...DEFAULT_CONFIG.items }, money: { ...DEFAULT_CONFIG.money }, rankRewards: {} };
 }
 },
 save: (config) => {
 try {
 GlobalConfig.set("dailyRewardConfig", config);
 return true;
 } catch {
 return false;
 }
 },
};
function readRankTag(player) {
 try {
 const tag = player.getTags().find((tag) => tag.startsWith("rank:"));
 return tag ? tag.slice("rank:".length) : null;
 } catch { return null; }
}
function findRankRewardKey(rankRewards, rankName) {
 if (!rankName) return null;
 const keys = Object.keys(rankRewards || {});
 return keys.find((key) => key === rankName) || keys.find((key) => key.toLowerCase() === String(rankName).toLowerCase()) || null;
}
function resolveRewardFor(player, cfg) {
 let rankName = null;
 try { rankName = readRankTag(player); } catch { rankName = null; }
 const rankKey = findRankRewardKey(cfg.rankRewards, rankName);
 if (rankKey) {
 const entry = cfg.rankRewards[rankKey] || {};
 const entryItems = entry.items && typeof entry.items === "object" ? entry.items : {};
 const entryMoney = entry.money && typeof entry.money === "object" ? entry.money : {};
 return {
 rankKey,
 rankName,
 items: { enabled: !!entryItems.enabled, list: Array.isArray(entryItems.list) ? entryItems.list : [], prefix: typeof entryItems.prefix === "string" && entryItems.prefix ? entryItems.prefix : "minecraft:" },
 money: { enabled: !!entryMoney.enabled, amount: Number(entryMoney.amount) || 0 },
 cooldown: typeof entry.cooldownMs === "number" && entry.cooldownMs > 0 ? entry.cooldownMs : cfg.cooldown,
 isRankReward: true,
 };
 }
 return {
 rankKey: null,
 rankName,
 items: cfg.items,
 money: cfg.money,
 cooldown: cfg.cooldown,
 isRankReward: false,
 };
}
function claimStorageKey(playerName, rankKey) {
 return rankKey ? `${playerName}_lastDailyReward:${rankKey.toLowerCase()}` : `${playerName}_lastDailyReward`;
}
class Helper {
 static formatTime(ms) {
 const hours = Math.floor(ms / 3600000);
 const minutes = Math.floor((ms % 3600000) / 60000);
 const seconds = Math.floor((ms % 60000) / 1000);
 return `${hours}h ${minutes}m ${seconds}s`;
 }
 static stripPrefix(str, prefix) {
 if (!prefix || prefix === "") return str.replace("minecraft:", "");
 return str.startsWith(prefix)
 ? str.slice(prefix.length)
 : str.replace("minecraft:", "");
 }
 static parseItems(str, prefix) {
 if (!str) return [];
 return str.split(";").map((s) => s.trim()).filter((s) => s.includes(",")).map((s) => {
 const [id, amt] = s.split(",");
 const fullId =
 id.includes(":") || prefix === "" ? id.trim() : prefix + id.trim();
 return {
 item: fullId,
 amount: parseInt(amt) || 1,
 };
 });
 }
 static playSound(player, type) {
 const sounds = {
 success: "random.levelup",
 error: "note.bass",
 warning: "random.pop",
 };
 player.runCommand(`playsound ${sounds[type]} @s`);
 }
 static showMsg(player, type, msg) {
 const colors = { success: "§a", error: "§c", warning: "§e" };
 player.sendMessage(`${colors[type] || "§f"}${msg}`);
 this.playSound(player, type);
 }
}
export class DailyReward {
 static async claim(player) {
 const cfg = DailyRewardConfig.get();
 let reward = resolveRewardFor(player, cfg);
 let storageKey = claimStorageKey(player.name, reward.rankKey);
 const lastClaim = GlobalConfig.get(storageKey) || 0;
 const timeLeft = reward.cooldown - (Date.now() - lastClaim);
 if (timeLeft > 0) {
 Helper.showMsg(
 player,
 "warning",
 `You can claim again in: ${Helper.formatTime(timeLeft)}`,
 );
 return;
 }
 const rankLine = reward.isRankReward
 ? `§7Rank: §b${reward.rankName} §a(special)`
 : (reward.rankName ? `§7Rank: §b${reward.rankName} §8(default)` : "");
 const itemsText =
 reward.items?.enabled && reward.items.list?.length > 0
 ? `§6Items:§r\n${reward.items.list.map((i) => `§7• ${Helper.stripPrefix(i.item, reward.items.prefix)} x${i.amount}`).join("\n")}`
 : "§7No items available";
 const moneyText = reward.money?.enabled
 ? `\n\n§6Money:§r\n§7• $${reward.money.amount}`
 : "";
 const form = new ActionFormData()
 .title("Daily Rewards")
 .body(
 `§eToday's Rewards:\n${rankLine ? rankLine + "\n" : ""}\n${itemsText}${moneyText}\n\n§eClick to claim your rewards!`,
 )
 .button("§2Claim Rewards", "textures/ui/gift_square")
 .button("§cClose", "textures/ui/cancel");
 const res = await form.show(player);
 if (!isPlayerValid(player)) return;
 reward = resolveRewardFor(player, DailyRewardConfig.get());
 storageKey = claimStorageKey(player.name, reward.rankKey);
 const recheckTime =
 reward.cooldown -
 (Date.now() - (GlobalConfig.get(storageKey) || 0));
 if (recheckTime <= 0 && !res.canceled && res.selection === 0) {
 GlobalConfig.set(storageKey, Date.now());
 if (reward.items?.enabled) {
 const inventory = player.getComponent("inventory")?.container;
 reward.items.list.forEach((i) => {
 try {
 const itemStack = new ItemStack(i.item, i.amount);
 if (inventory) {
 const leftOver = inventory.addItem(itemStack);
 if (leftOver) {
 player.dimension.spawnItem(leftOver, {
 x: player.location.x,
 y: player.location.y + 0.5,
 z: player.location.z,
 });
 player.sendMessage(
 `§eInventory full! Dropped ${Helper.stripPrefix(i.item, reward.items.prefix)} x${i.amount}`,
 );
 } else {
 player.sendMessage(
 `§a+ ${Helper.stripPrefix(i.item, reward.items.prefix)} x${i.amount}`,
 );
 }
 } else {
 player.dimension.spawnItem(itemStack, {
 x: player.location.x,
 y: player.location.y + 0.5,
 z: player.location.z,
 });
 }
 } catch (e) {
 try {
 player.runCommand("gamerule sendcommandfeedback false");
 player.runCommand(`give @s ${i.item} ${i.amount}`);
 player.runCommand("gamerule sendcommandfeedback true");
 player.sendMessage(
 `§a+ ${Helper.stripPrefix(i.item, reward.items.prefix)} x${i.amount}`,
 );
 } catch (err) {
 player.runCommand("gamerule sendcommandfeedback true");
 }
 }
 });
 }
 if (reward.money?.enabled && addMoney(player, reward.money.amount)) {
 player.sendMessage(`§a+ $${reward.money.amount}`);
 }
 Helper.showMsg(player, "success", "Daily reward claimed successfully!");
 player.runCommand("particle minecraft:totem_particle ~~~");
 }
 }
}
export class DailyRewardAdmin {
 static async showMenu(player) {
 const cfg = DailyRewardConfig.get();
 const rankCount = Object.keys(cfg.rankRewards || {}).length;
 const form = new ActionFormData()
 .title("Daily Reward Settings")
 .button("Configure Items", "textures/ui/gift_square")
 .button("Configure Money", "textures/ui/MCoin")
 .button("Configure Cooldown", "textures/ui/timer")
 .button(`Rank Rewards${rankCount ? ` (${rankCount})` : ""}`, "textures/items/bordure_indented_banner_pattern")
 .button("Reset All Players", "textures/ui/refresh")
 .button("§cClose", "textures/ui/cancel");
 const res = await form.show(player);
 if (!res.canceled) {
 switch (res.selection) {
 case 0:
 this.editItems(player);
 break;
 case 1:
 this.editMoney(player);
 break;
 case 2:
 this.editCooldown(player);
 break;
 case 3:
 this.showRankRewards(player);
 break;
 case 4:
 this.resetAll(player);
 break;
 }
 }
 }
 static async showRankRewards(player) {
 const cfg = DailyRewardConfig.get();
 const keys = Object.keys(cfg.rankRewards || {});
 const lines = keys.length ? keys.map((key) => {
 const entry = cfg.rankRewards[key];
 const itemCount = entry.items?.enabled ? (entry.items.list?.length || 0) : 0;
 const moneyText = entry.money?.enabled ? `$${entry.money.amount}` : "no money";
 const cooldownText = entry.cooldownMs ? `${Math.round(entry.cooldownMs / 3600000)}h` : "global";
 return `§b${key} §7- ${itemCount} items, ${moneyText}, ${cooldownText}`;
 }).join("\n") : "§7No rank rewards yet. Default reward applies to all ranks.";
 const form = new ActionFormData()
 .title("Rank Daily Rewards")
 .body(`${lines}\n\n§8Each rank has its own daily cooldown.`)
 .button("Set Rank Reward", "textures/ui/color_plus")
 .button("Delete Rank Reward", "textures/ui/trash_default")
 .button("§cBack", "textures/ui/arrow_left");
 const res = await form.show(player);
 if (res.canceled) return;
 if (res.selection === 0) return this.editRankReward(player);
 if (res.selection === 1) return this.deleteRankReward(player);
 return this.showMenu(player);
 }
 static async editRankReward(player) {
 const cfg = DailyRewardConfig.get();
 let ranks = [];
 try { ranks = getAllRanks().filter((rank) => rank && String(rank).trim()); } catch { ranks = []; }
 if (!ranks.length) {
 Helper.showMsg(player, "error", "No ranks available.");
 return this.showRankRewards(player);
 }
 const pick = await new ModalFormData()
 .title("Select Rank")
 .dropdown("§eRank", ranks, { defaultValueIndex: 0 })
 .show(player);
 if (pick.canceled || !Array.isArray(pick.formValues)) return this.showRankRewards(player);
 const rankName = ranks[pick.formValues[0]];
 if (!rankName) return this.showRankRewards(player);
 const storageKey = findRankRewardKey(cfg.rankRewards, rankName) || rankName;
 const existing = cfg.rankRewards[storageKey] || {};
 const items = existing.items || { enabled: true, list: [], prefix: "minecraft:" };
 const money = existing.money || { enabled: false, amount: 1000 };
 const cooldownHours = existing.cooldownMs ? Math.round(existing.cooldownMs / 3600000) : 0;
 const res = await new ModalFormData()
 .title(`Rank Reward: ${rankName}`)
 .toggle("§eEnable Item Rewards", { defaultValue: items.enabled })
 .textField("§6Custom Item Prefix (e.g., custom:)", "minecraft:", {
 defaultValue: items.prefix || "minecraft:",
 })
 .textField("§6Items List (item,amount;...)", "diamond,3;emerald,5", {
 defaultValue: (items.list || [])
 .map((i) => `${Helper.stripPrefix(i.item, items.prefix)},${i.amount}`)
 .join(";"),
 })
 .toggle("§eEnable Money Reward", { defaultValue: money.enabled })
 .slider("§eMoney Amount", 0, 10000, {
 valueStep: 100,
 defaultValue: money.amount || 0,
 })
 .slider("§eCooldown Hours (0 = global)", 0, 72, {
 valueStep: 1,
 defaultValue: cooldownHours,
 })
 .show(player);
 if (res.canceled || !Array.isArray(res.formValues)) return this.showRankRewards(player);
 const [itemsEnabled, prefix, itemsStr, moneyEnabled, moneyAmount, cooldownHrs] = res.formValues;
 const cleanPrefix = prefix.trim() || "minecraft:";
 cfg.rankRewards[storageKey] = {
 items: {
 enabled: itemsEnabled,
 prefix: cleanPrefix,
 list: Helper.parseItems(itemsStr, cleanPrefix),
 },
 money: {
 enabled: moneyEnabled,
 amount: moneyAmount,
 },
 cooldownMs: cooldownHrs > 0 ? cooldownHrs * 3600000 : null,
 };
 DailyRewardConfig.save(cfg)
 ? Helper.showMsg(player, "success", `Rank reward for ${storageKey} updated.`)
 : Helper.showMsg(player, "error", "Failed to save.");
 return this.showRankRewards(player);
 }
 static async deleteRankReward(player) {
 const cfg = DailyRewardConfig.get();
 const keys = Object.keys(cfg.rankRewards || {});
 if (!keys.length) {
 Helper.showMsg(player, "warning", "No rank rewards to delete.");
 return this.showRankRewards(player);
 }
 const pick = await new ModalFormData()
 .title("Delete Rank Reward")
 .dropdown("§eRank", keys, { defaultValueIndex: 0 })
 .show(player);
 if (pick.canceled || !Array.isArray(pick.formValues)) return this.showRankRewards(player);
 const target = keys[pick.formValues[0]];
 if (!target) return this.showRankRewards(player);
 const confirm = await new ActionFormData()
 .title("Confirm Delete")
 .body(`Delete daily reward for rank §b${target}§r? Players with this rank will get the default reward.`)
 .button("§4Yes, Delete", "textures/ui/check")
 .button("No, Cancel", "textures/ui/cancel")
 .show(player);
 if (!confirm.canceled && confirm.selection === 0) {
 delete cfg.rankRewards[target];
 DailyRewardConfig.save(cfg)
 ? Helper.showMsg(player, "success", "Rank reward deleted.")
 : Helper.showMsg(player, "error", "Failed to save.");
 }
 return this.showRankRewards(player);
 }
 static async editItems(player) {
 const cfg = DailyRewardConfig.get();
 const items = cfg.items || DEFAULT_CONFIG.items;
 const res = await new ModalFormData()
 .title("Configure Items")
 .toggle("§eEnable Item Rewards", { defaultValue: items.enabled })
 .textField("§6Custom Item Prefix (e.g., custom:)", "minecraft:", {
 defaultValue: items.prefix,
 })
 .textField("§6Items List (item,amount;...)", "diamond,3;emerald,5", {
 defaultValue: items.list
 .map((i) => `${Helper.stripPrefix(i.item, items.prefix)},${i.amount}`)
 .join(";"),
 })
 .show(player);
 if (!res.canceled) {
 const [enabled, prefix, itemsStr] = res.formValues;
 const cleanPrefix = prefix.trim() || "minecraft:";
 cfg.items = {
 enabled,
 prefix: cleanPrefix,
 list: Helper.parseItems(itemsStr, cleanPrefix),
 };
 DailyRewardConfig.save(cfg)
 ? Helper.showMsg(player, "success", "Daily reward items updated.")
 : Helper.showMsg(player, "error", "Failed to save.");
 }
 }
 static async editMoney(player) {
 const cfg = DailyRewardConfig.get();
 const money = cfg.money || DEFAULT_CONFIG.money;
 const res = await new ModalFormData()
 .title("Configure Money Reward")
 .toggle("§eEnable Money Reward", { defaultValue: money.enabled })
 .slider("§eMoney Amount", 0, 10000, {
 valueStep: 100,
 defaultValue: money.amount,
 })
 .show(player);
 if (!res.canceled) {
 cfg.money = {
 enabled: res.formValues[0],
 amount: res.formValues[1],
 };
 DailyRewardConfig.save(cfg)
 ? Helper.showMsg(player, "success", "Money reward updated.")
 : Helper.showMsg(player, "error", "Failed to save.");
 }
 }
 static async editCooldown(player) {
 const cfg = DailyRewardConfig.get();
 const hours = Math.floor(cfg.cooldown / 3600000);
 const res = await new ModalFormData()
 .title("Configure Cooldown")
 .slider("§eCooldown (Hours)", 1, 72, {
 valueStep: 1,
 defaultValue: hours,
 })
 .show(player);
 if (!res.canceled) {
 cfg.cooldown = res.formValues[0] * 3600000;
 DailyRewardConfig.save(cfg)
 ? Helper.showMsg(
 player,
 "success",
 `Cooldown set to ${res.formValues[0]} hours.`,
 )
 : Helper.showMsg(player, "error", "Failed to save.");
 }
 }
 static async resetAll(player) {
 const res = await new ActionFormData()
 .title("Reset Cooldowns")
 .body(
 "Are you sure you want to reset daily reward cooldowns for ALL players?",
 )
 .button("§4Yes, Reset All", "textures/ui/check")
 .button("No, Cancel", "textures/ui/cancel")
 .show(player);
 if (!res.canceled && res.selection === 0) {
 try {
 for (const id of world.getDynamicPropertyIds()) {
 const key = typeof id === "string" && id.startsWith("kiw:cfg:") ? id.slice("kiw:cfg:".length) : id;
 if (typeof key !== "string") continue;
 if (key.endsWith("_lastDailyReward") || key.includes("_lastDailyReward:")) GlobalConfig.delete(key);
 }
 } catch {
 world
 .getPlayers()
 .forEach((p) => GlobalConfig.set(`${p.name}_lastDailyReward`, 0));
 }
 Helper.showMsg(
 player,
 "success",
 "All player cooldowns have been reset.",
 );
 world.sendMessage(
 "§e[System] Daily rewards have been reset by an administrator.",
 );
 }
 }
}
export function showDailyRewardMenu(player) {
 DailyReward.claim(player);
}
export function showDailyRewardAdminMenu(player) {
 DailyRewardAdmin.showMenu(player);
}
