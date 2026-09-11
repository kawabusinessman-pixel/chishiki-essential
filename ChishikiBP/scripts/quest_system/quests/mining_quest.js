import { world, system, ActionFormData } from '../../core.js';
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { giveQuestRewards } from "../quest_rewards.js";
export class MiningQuest {
 static defaultQuests = [
 { id: "diamond", name: "Diamond Mining", target: 20, block: "minecraft:diamond_ore", icon: "textures/blocks/diamond_ore", reward: 5000, cooldown: 86400000, enabled: true },
 { id: "iron", name: "Iron Mining", target: 50, block: "minecraft:iron_ore", icon: "textures/blocks/iron_ore", reward: 1000, cooldown: 43200000, enabled: true },
 { id: "gold", name: "Gold Mining", target: 30, block: "minecraft:gold_ore", icon: "textures/blocks/gold_ore", reward: 2000, cooldown: 43200000, enabled: true },
 { id: "emerald", name: "Emerald Mining", target: 20, block: "minecraft:emerald_ore", icon: "textures/blocks/emerald_ore", reward: 6000, cooldown: 86400000, enabled: true },
 { id: "coal", name: "Coal Mining", target: 4, block: "minecraft:coal_ore", icon: "textures/blocks/coal_ore", reward: 500, cooldown: 21600000, enabled: true }
 ];

 static get quests() {
 const custom = GlobalConfig.get("custom_quests", [])
 .filter(q => q.type === "mining")
 .map(q => {
 const itemRewards = Array.isArray(q.items)
 ? q.items
 .filter(item => item && typeof item === "object" && typeof item.id === "string" && item.id.trim())
 .map(item => {
 const parsedCount = Number.parseInt(String(item.count ?? 1), 10);
 return {
 id: item.id.trim(),
 count: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1
 };
 })
 : [];

 const money = Number(q.money);
 const xp = Number(q.xp);
 const target = Number.parseInt(String(q.target ?? 1), 10);
 const cooldownHours = Number.parseInt(String(q.cooldown ?? 1), 10);

 return {
 id: q.id,
 name: q.name,
 target: Number.isFinite(target) && target > 0 ? target : 1,
 block: q.targetId,
 icon: q.icon || "textures/blocks/diamond_ore",
 reward: {
 money: Number.isFinite(money) ? money : 0,
 xp: Number.isFinite(xp) ? xp : 100,
 items: itemRewards
 },
 cooldown: (Number.isFinite(cooldownHours) && cooldownHours > 0 ? cooldownHours : 1) * 3600000,
 enabled: true
 };
 });
 return [...this.defaultQuests, ...custom];
 }
 static activeQuestCache = new Map();
 static isQuestActive(player, questId) {
 const playerId = player.id;
 if (!this.activeQuestCache.has(playerId)) {
 this.activeQuestCache.set(playerId, new Set());
 }
 const playerQuests = this.activeQuestCache.get(playerId);
 if (!playerQuests.has(questId)) {
 const hasQuest = player.hasTag(`quest:${questId}`);
 if (hasQuest) {
 playerQuests.add(questId);
 }
 return hasQuest;
 }
 return true;
 }
 static clearPlayerCache(playerId) {
 this.activeQuestCache.delete(playerId);
 }
 static getQuestConfig() {
 try {
 const legacyConfig = world.getDynamicProperty('questConfig');
 if (legacyConfig !== undefined && legacyConfig !== null) {
 try {
 const parsedLegacy = typeof legacyConfig === "string" ? JSON.parse(legacyConfig) : legacyConfig;
 GlobalConfig.set('questConfig', parsedLegacy);
 return parsedLegacy;
 } catch { }
 }

 const config = GlobalConfig.get('questConfig');
 return config ? (typeof config === "string" ? JSON.parse(config) : config) : null;
 } catch (error) {
 console.warn("Error getting quest config:", error);
 return null;
 }
 }
 static updateQuestsFromConfig() {
 const config = this.getQuestConfig();
 if (!config || !config.mining) return;
 if (config.mining.enabled) {
 this.quests.forEach(quest => {
 quest.enabled = config.mining.enabled[quest.id] !== false;
 });
 }
 if (config.mining.targets) {
 this.quests.forEach(quest => {
 if (config.mining.targets[quest.id]) {
 quest.target = config.mining.targets[quest.id];
 }
 });
 }
 if (config.mining.cooldowns) {
 this.quests.forEach(quest => {
 if (config.mining.cooldowns[quest.id]) {
 quest.cooldown = config.mining.cooldowns[quest.id];
 } else if (config.mining.cooldowns.default) {
 quest.cooldown = config.mining.cooldowns.default;
 }
 });
 }
 if (config.mining.rewards) {
 const defaultReward = {
 money: config.mining.rewards.money || 2000,
 xp: config.mining.rewards.xp || 100,
 items: config.mining.rewards.items || []
 };
 this.quests.forEach(quest => {
 if (config.mining.rewards.individual && config.mining.rewards.individual[quest.id]) {
 const individualReward = config.mining.rewards.individual[quest.id];
 quest.reward = {
 money: individualReward.money || defaultReward.money,
 xp: individualReward.xp || defaultReward.xp,
 items: [...(individualReward.items || defaultReward.items)]
 };
 } else {
 quest.reward = {
 money: defaultReward.money,
 xp: defaultReward.xp,
 items: [...defaultReward.items]
 };
 }
 });
 }
 }
 static updateQuestProperty(configProperty, questProperty) {
 if (configProperty) {
 this.quests.forEach(quest => {
 if (configProperty[quest.id]) {
 quest[questProperty] = configProperty[quest.id];
 }
 });
 }
 }
 static showMenu(player, returnToMain = null) {
 this.updateQuestsFromConfig();
 const hasActiveQuest = player.hasTag("adaquest");
 const form = new ActionFormData()
 .title("§6Mining Quests")
 .body(hasActiveQuest ? "§eYou have an active quest. Track progress or select another quest:" : "§eSelect a mining quest:");
 this.addActiveQuestButton(form, player, hasActiveQuest);
 this.addAvailableQuestButtons(form, player);
 form.button("§l§c✘ Close\n§r§8Close the menu", "textures/ui/cancel");
 form.show(player).then(response => this.handleMenuResponse(response, player, hasActiveQuest, returnToMain));
 }
 static addActiveQuestButton(form, player, hasActiveQuest) {
 if (hasActiveQuest) {
 const activeQuest = this.quests.find(quest => player.hasTag(`quest:${quest.id}`));
 if (activeQuest) {
 const objective = world.scoreboard.getObjective(`quest_${activeQuest.id}`);
 const progress = objective ? objective.getScore(player.scoreboardIdentity) || 0 : 0;
 const percentComplete = Math.floor((progress / activeQuest.target) * 100);
 form.button(
 `§l§a✔ Active Quest: ${activeQuest.name}\n§8Progress: §e${progress}/${activeQuest.target} §8(${percentComplete}%)\n§cClick to cancel`,
 activeQuest.icon
 );
 }
 }
 }
 static addAvailableQuestButtons(form, player) {
 const availableQuests = this.quests.filter(quest =>
 quest.enabled && !player.hasTag(`quest:${quest.id}`)
 );
 for (const quest of availableQuests) {
 const lastCompletion = GlobalConfig.get(`${player.name}_last_${quest.id}_completion`) || 0;
 const currentTime = Date.now();
 const timeLeft = lastCompletion + quest.cooldown - currentTime;
 let rewardText;
 if (typeof quest.reward === 'object' && quest.reward !== null) {
 rewardText = `$${quest.reward.money || 0}`;
 } else {
 rewardText = `$${quest.reward || 0}`;
 }
 let buttonText = `${quest.name}\n§8Mine ${quest.target} ${quest.id}\n§6Reward: ${rewardText}`;
 if (timeLeft > 0) {
 const hours = Math.floor(timeLeft / 3600000);
 const minutes = Math.floor((timeLeft % 3600000) / 60000);
 buttonText += ` §cCD: ${hours}h${minutes}m`;
 }
 form.button(buttonText, quest.icon);
 }
 }
 static handleMenuResponse(response, player, hasActiveQuest, returnToMain) {
 if (!response.canceled) {
 if (response.selection === 0 && hasActiveQuest) {
 const activeQuest = this.quests.find(quest => player.hasTag(`quest:${quest.id}`));
 if (activeQuest) {
 this.confirmCancelQuest(player, activeQuest, returnToMain);
 }
 } else {
 const availableQuests = this.quests.filter(q =>
 q.enabled && !player.hasTag(`quest:${q.id}`)
 );
 const questIndex = hasActiveQuest ? response.selection - 1 : response.selection;
 if (questIndex === availableQuests.length) {
 if (returnToMain) returnToMain(player);
 return;
 }
 if (questIndex < availableQuests.length) {
 const selectedQuest = availableQuests[questIndex];
 this.acceptQuest(player, selectedQuest);
 }
 }
 } else if (returnToMain) {
 returnToMain(player);
 }
 }
 static confirmCancelQuest(player, quest, returnToMain = null) {
 const form = new ActionFormData()
 .title("§l§cCancel Quest")
 .body(`§eAre you sure you want to cancel the quest:\n§f${quest.name}?\n\n§cThis action cannot be undone and all progress will be lost!`)
 .button("§l§c✘ Yes, Cancel Quest\n§r§8Cancel current quest", "textures/ui/redX1")
 .button("§l§a✔ No, Keep Quest\n§r§8Return to quests", "textures/ui/arrow_left");
 form.show(player).then(response => {
 if (!response.canceled && response.selection === 0) {
 player.removeTag(`quest:${quest.id}`);
 player.removeTag("adaquest");
 try {
 player.runCommand(`scoreboard players reset @s quest_${quest.id}`);
 } catch { }
 player.sendMessage(`§a✔ Successfully cancelled quest: §e${quest.name}`);
 player.runCommand("playsound note.bass @s ~~~ 1 1");
 }
 this.showMenu(player, returnToMain);
 });
 }
 static acceptQuest(player, quest) {
 if (!quest) return;
 system.run(() => {
 try {
 const lastCompletion = GlobalConfig.get(`${player.name}_last_${quest.id}_completion`) || 0;
 const currentTime = Date.now();
 const timeLeft = lastCompletion + quest.cooldown - currentTime;
 if (timeLeft > 0) {
 const hours = Math.floor(timeLeft / 3600000);
 const minutes = Math.floor((timeLeft % 3600000) / 60000);
 player.runCommand("playsound mob.villager.no @s");
 player.runCommand(`tellraw @s {"rawtext":[{"text":"§c⚠ This quest is still on cooldown! Time remaining: ${hours}h ${minutes}m"}]}`);
 return;
 }
 if (player.hasTag("adaquest")) {
 player.runCommand("playsound mob.villager.no @s");
 player.runCommand('tellraw @s {"rawtext":[{"text":"§c⚠ You already have an active quest!"}]}');
 return;
 }
 player.runCommand(`tag @s add quest:${quest.id}`);
 player.runCommand(`tag @s add adaquest`);
 player.runCommand(`scoreboard objectives add quest_${quest.id} dummy`);
 player.runCommand(`scoreboard players set @s quest_${quest.id} 0`);
 player.runCommand(`tellraw @s {"rawtext":[{"text":"§8[ §eQuest §8] §fSuccessfully accepted quest: §e${quest.name}"}]}`);
 player.runCommand("playsound mob.villager.yes @s");
 } catch (error) {
 console.warn("Error accepting quest:", error);
 }
 });
 }
 static {
 world.beforeEvents.playerBreakBlock.subscribe((event) => {
 const { player, block, itemStack } = event;
 if (!player || !player.hasTag("adaquest")) return;
 const blockId = block.typeId;
 if (itemStack) {
 const enchantable = itemStack.getComponent("minecraft:enchantable");
 if (enchantable && enchantable.getEnchantment("silk_touch")) {
 return;
 }
 }
 for (const quest of this.quests) {
 if (this.isQuestActive(player, quest.id) && blockId === quest.block) {
 system.run(() => this.handleBlockBreak(player, quest));
 break;
 }
 }
 });
 }
 static handleBlockBreak(player, quest) {
 try {
 const objective = world.scoreboard.getObjective(`quest_${quest.id}`);
 if (objective) {
 const progress = (objective.getScore(player.scoreboardIdentity) || 0) + 1;
 objective.setScore(player.scoreboardIdentity, progress);
 player.sendMessage(`§8[ §eQuest §8] §fQuest progress: §e${progress}/${quest.target}`);
 if (progress >= quest.target) {
 this.completeQuest(player, quest);
 }
 } else {
 player.runCommand(`scoreboard objectives add quest_${quest.id} dummy`);
 player.runCommand(`scoreboard players set @s quest_${quest.id} 1`);
 }
 } catch (error) {
 console.warn("Error updating quest progress:", error);
 }
 }
 static async completeQuest(player, quest) {
 this.clearPlayerCache(player.id);
 player.runCommand(`tag @s remove quest:${quest.id}`);
 player.runCommand(`tag @s remove adaquest`);
 GlobalConfig.set(`${player.name}_last_${quest.id}_completion`, Date.now());
 player.runCommand(`scoreboard players reset @s quest_${quest.id}`);
 let moneyReward, xpAmount, itemRewards;
 if (typeof quest.reward === 'object' && quest.reward !== null) {
 moneyReward = quest.reward.money || 0;
 xpAmount = quest.reward.xp || quest.xpReward || 100;
 itemRewards = Array.isArray(quest.reward.items) ? [...quest.reward.items] : [];
 } else {
 moneyReward = quest.reward || 0;
 xpAmount = quest.xpReward || 100;
 itemRewards = [];
 }

 const success = await giveQuestRewards(player, {
 money: moneyReward,
 xp: xpAmount,
 items: itemRewards,
 });

 const itemLine = itemRewards.length > 0
 ? `\n§a+ §e${itemRewards[0].id} §7x${itemRewards[0].count}`
 : "";

 if (success) {
 player.runCommand(`tellraw @s {"rawtext":[{"text":"\n§8[ §6QUEST COMPLETED §8]\n§fQuest: §e${quest.name}\n§fRewards:\n§a+ §6$${moneyReward} §fMoney\n§a+ §b${xpAmount} XP${itemLine}\n"}]}`);
 } else {
 player.runCommand(`tellraw @s {"rawtext":[{"text":"\n§8[ §6QUEST COMPLETED §8]\n§fQuest: §e${quest.name}\n§fRewards:\n§c× Failed to add money\n§a+ §b${xpAmount} XP\n"}]}`);
 console.warn(`Failed to apply rewards to player ${player.name} for quest ${quest.id}`);
 }
 }
}