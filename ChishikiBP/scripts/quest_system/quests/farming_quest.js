import { world, system, ActionFormData } from '../../core.js';
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { giveQuestRewards } from "../quest_rewards.js";

const HOUR_IN_MS = 3600000;
const DEFAULT_XP_REWARD = 100;

const toNumber = (value, fallback) => {
 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveInt = (value, fallback) => {
 const parsed = Number.parseInt(String(value ?? ""), 10);
 return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getTimeLeftText = (timeLeft) => {
 const hours = Math.floor(timeLeft / HOUR_IN_MS);
 const minutes = Math.floor((timeLeft % HOUR_IN_MS) / 60000);
 return `${hours}h ${minutes}m`;
};

export class FarmingQuest {
 static defaultQuests = [
 { id: "wheat", name: "Wheat Farmer", target: 2, block: "minecraft:wheat", icon: "textures/blocks/wheat_stage_7", reward: 1000, xpReward: 100, cooldown: 21600000, enabled: true },
 { id: "carrot", name: "Carrot Farmer", target: 20, block: "minecraft:carrots", icon: "textures/blocks/carrots_stage_3", reward: 1500, xpReward: 100, cooldown: 43200000, enabled: true },
 { id: "potato", name: "Potato Farmer", target: 20, block: "minecraft:potatoes", icon: "textures/blocks/potatoes_stage_3", reward: 1500, xpReward: 100, cooldown: 43200000, enabled: true },
 { id: "beetroots", name: "Beetroot Farmer", target: 20, block: "minecraft:beetroot", icon: "textures/blocks/beetroots_stage_3", reward: 2000, xpReward: 100, cooldown: 43200000, enabled: true }
 ];

 static questCache = [];
 static questById = new Map();
 static activeQuestCache = new Map();

 static createQuestList() {
 const custom = GlobalConfig.get("custom_quests", [])
 .filter(q => q.type === "farming")
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

 return {
 id: q.id,
 name: q.name,
 target: toPositiveInt(q.target, 1),
 block: q.targetId,
 icon: q.icon || "textures/blocks/wheat_stage_7",
 reward: toNumber(q.money, 0),
 xpReward: toNumber(q.xp, DEFAULT_XP_REWARD),
 itemRewards,
 cooldown: toPositiveInt((q.cooldown || 1) * HOUR_IN_MS, HOUR_IN_MS),
 enabled: true
 };
 });

 const defaults = this.defaultQuests.map(quest => ({
 ...quest,
 itemRewards: []
 }));

 return [...defaults, ...custom];
 }

 static get quests() {
 if (this.questCache.length === 0) {
 this.refreshQuests();
 }
 return this.questCache;
 }

 static isQuestActive(player, questId) {
 const activeQuest = this.getActiveQuest(player);
 return !!activeQuest && activeQuest.id === questId;
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

 static refreshQuests() {
 const quests = this.createQuestList();
 const config = this.getQuestConfig();
 const farmingConfig = config?.farming;

 const enabledConfig = farmingConfig?.enabled;
 const targetsConfig = farmingConfig?.targets;
 const cooldownsConfig = farmingConfig?.cooldowns;
 const rewardsConfig = farmingConfig?.rewards;

 for (const quest of quests) {
 if (enabledConfig && Object.prototype.hasOwnProperty.call(enabledConfig, quest.id)) {
 quest.enabled = enabledConfig[quest.id] !== false;
 }

 if (targetsConfig && Object.prototype.hasOwnProperty.call(targetsConfig, quest.id)) {
 quest.target = toPositiveInt(targetsConfig[quest.id], quest.target);
 }

 const directCooldown = cooldownsConfig?.[quest.id];
 const defaultCooldown = cooldownsConfig?.default;
 if (directCooldown !== undefined) {
 quest.cooldown = toPositiveInt(directCooldown, quest.cooldown);
 } else if (defaultCooldown !== undefined) {
 quest.cooldown = toPositiveInt(defaultCooldown, quest.cooldown);
 }

 let moneyReward = toNumber(quest.reward, 0);
 let xpReward = toNumber(quest.xpReward, DEFAULT_XP_REWARD);
 let itemRewards = [];

 if (rewardsConfig && typeof rewardsConfig === "object") {
 const individualReward = rewardsConfig.individual?.[quest.id];
 const moneySource = individualReward?.money ?? rewardsConfig.money;
 const xpSource = individualReward?.xp ?? rewardsConfig.xp;
 const itemsSource = Array.isArray(individualReward?.items)
 ? individualReward.items
 : (Array.isArray(rewardsConfig.items) ? rewardsConfig.items : []);

 moneyReward = toNumber(moneySource, moneyReward);
 xpReward = toNumber(xpSource, xpReward);
 itemRewards = [...itemsSource];
 } else if (rewardsConfig !== undefined) {
 moneyReward = toNumber(rewardsConfig, moneyReward);
 }

 quest.reward = moneyReward;
 quest.xpReward = xpReward;
 quest.itemRewards = itemRewards;
 }

 this.questCache = quests;
 this.questById = new Map(quests.map(quest => [quest.id, quest]));
 }

 static updateQuestsFromConfig() {
 this.refreshQuests();
 }

 static getQuestById(questId) {
 if (!questId) return null;
 if (this.questById.size === 0) {
 this.refreshQuests();
 }
 return this.questById.get(questId) || null;
 }

 static getActiveQuest(player) {
 const cachedQuestId = this.activeQuestCache.get(player.id);
 if (cachedQuestId) {
 const cachedQuest = this.getQuestById(cachedQuestId);
 if (cachedQuest && player.hasTag(`quest:${cachedQuestId}`)) {
 return cachedQuest;
 }
 this.activeQuestCache.delete(player.id);
 }

 for (const quest of this.quests) {
 if (player.hasTag(`quest:${quest.id}`)) {
 this.activeQuestCache.set(player.id, quest.id);
 return quest;
 }
 }

 return null;
 }

 static getQuestProgress(player, questId) {
 const objective = world.scoreboard.getObjective(`quest_${questId}`);
 if (!objective) return 0;
 return objective.getScore(player.scoreboardIdentity) || 0;
 }

 static showMenu(player, returnToMain = null) {
 this.updateQuestsFromConfig();
 const quests = this.quests;
 const hasActiveQuest = player.hasTag("adaquest");
 const activeQuest = hasActiveQuest ? this.getActiveQuest(player) : null;
 const form = new ActionFormData()
 .title("§6Farming Quests")
 .body(hasActiveQuest ? "§eYou have an active quest. Track progress or select another quest:" : "§eSelect a farming quest:");

 if (activeQuest) {
 const progress = this.getQuestProgress(player, activeQuest.id);
 const percentComplete = Math.floor((progress / activeQuest.target) * 100);
 form.button(
 `§l§a✔ Active Quest: ${activeQuest.name}\n§8Progress: §e${progress}/${activeQuest.target} §8(${percentComplete}%)\n§cClick to cancel`,
 activeQuest.icon
 );
 }

 const availableQuests = [];
 const currentTime = Date.now();
 for (const quest of quests) {
 if (!quest.enabled || player.hasTag(`quest:${quest.id}`)) continue;

 availableQuests.push(quest);
 const lastCompletion = GlobalConfig.get(`${player.name}_last_${quest.id}_completion`) || 0;
 const timeLeft = lastCompletion + quest.cooldown - currentTime;

 let buttonText = `${quest.name}\n§8Harvest ${quest.target} ${quest.id}\n§6Reward: $${quest.reward}`;
 if (timeLeft > 0) {
 buttonText += ` §cCD: ${getTimeLeftText(timeLeft)}`;
 }
 form.button(buttonText, quest.icon);
 }

 form.button("§l§c✘ Close\n§r§8Close the menu", "textures/ui/cancel");

 form.show(player).then(response => {
 if (response.canceled) {
 if (returnToMain) returnToMain(player);
 return;
 }

 const offset = activeQuest ? 1 : 0;
 const closeIndex = offset + availableQuests.length;

 if (activeQuest && response.selection === 0) {
 this.confirmCancelQuest(player, activeQuest, returnToMain);
 return;
 }

 const questIndex = response.selection - offset;
 if (questIndex >= 0 && questIndex < availableQuests.length) {
 this.acceptQuest(player, availableQuests[questIndex]);
 return;
 }

 if (response.selection === closeIndex && returnToMain) {
 returnToMain(player);
 }
 });
 }

 static showAvailableQuests(player, returnToMain = null) {
 this.updateQuestsFromConfig();
 const availableQuests = this.quests.filter(quest => quest.enabled && !player.hasTag(`quest:${quest.id}`));

 const form = new ActionFormData()
 .title("§6Available Farming Quests")
 .body("§eSelect a farming quest:");

 const currentTime = Date.now();
 for (const quest of availableQuests) {
 const lastCompletion = GlobalConfig.get(`${player.name}_last_${quest.id}_completion`) || 0;
 const timeLeft = lastCompletion + quest.cooldown - currentTime;

 let buttonText = `${quest.name}\n§8Harvest ${quest.target} ${quest.id}\n§6Reward: $${quest.reward}`;
 if (timeLeft > 0) {
 buttonText += ` §cCD: ${getTimeLeftText(timeLeft)}`;
 }
 form.button(buttonText, quest.icon);
 }

 form.button("§cBack", "textures/ui/arrow_left");

 form.show(player).then(response => {
 if (response.canceled) return;

 if (response.selection < availableQuests.length) {
 this.acceptQuest(player, availableQuests[response.selection]);
 } else {
 this.showMenu(player, returnToMain);
 }
 });
 }

 static showActiveQuests(player, returnToMain = null) {
 this.updateQuestsFromConfig();
 const activeQuests = this.quests.filter(quest => player.hasTag(`quest:${quest.id}`));

 if (activeQuests.length === 0) {
 player.sendMessage("§c⚠ You don't have any active farming quests!");
 this.showMenu(player, returnToMain);
 return;
 }

 const form = new ActionFormData()
 .title("§6Active Farming Quests")
 .body("§eSelect a quest to view progress or cancel:");

 for (const quest of activeQuests) {
 const progress = this.getQuestProgress(player, quest.id);
 const percentComplete = Math.floor((progress / quest.target) * 100);
 form.button(
 `${quest.name}\n§8Progress: §e${progress}/${quest.target} §8(${percentComplete}%)\n§cClick to cancel`,
 quest.icon
 );
 }

 form.button("§cBack", "textures/ui/arrow_left");

 form.show(player).then(response => {
 if (response.canceled) return;

 if (response.selection < activeQuests.length) {
 this.confirmCancelQuest(player, activeQuests[response.selection], returnToMain);
 } else {
 this.showMenu(player, returnToMain);
 }
 });
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
 this.clearPlayerCache(player.id);
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
 const timeLeft = lastCompletion + quest.cooldown - Date.now();

 if (timeLeft > 0) {
 player.runCommand("playsound mob.villager.no @s");
 player.sendMessage(`§c⚠ This quest is still on cooldown! Time remaining: ${getTimeLeftText(timeLeft)}`);
 return;
 }

 if (player.hasTag("adaquest")) {
 player.runCommand("playsound mob.villager.no @s");
 player.sendMessage("§c⚠ You already have an active quest!");
 return;
 }

 player.addTag(`quest:${quest.id}`);
 player.addTag("adaquest");
 this.activeQuestCache.set(player.id, quest.id);

 try {
 player.runCommand(`scoreboard objectives add quest_${quest.id} dummy`);
 } catch { }

 player.runCommand(`scoreboard players set @s quest_${quest.id} 0`);
 player.sendMessage(`§8[ §eQuest §8] §fSuccessfully accepted quest: §e${quest.name}`);
 player.runCommand("playsound mob.villager.yes @s");
 } catch (error) {
 console.warn("Error accepting quest:", error);
 }
 });
 }

 static getQuestRewards(quest) {
 const money = toNumber(
 typeof quest.reward === "object" && quest.reward !== null ? quest.reward.money : quest.reward,
 0
 );
 const xp = toNumber(
 quest.xpReward ?? (typeof quest.reward === "object" && quest.reward !== null ? quest.reward.xp : DEFAULT_XP_REWARD),
 DEFAULT_XP_REWARD
 );
 const items = Array.isArray(quest.itemRewards)
 ? [...quest.itemRewards]
 : (typeof quest.reward === "object" && quest.reward !== null && Array.isArray(quest.reward.items)
 ? [...quest.reward.items]
 : []);

 return { money, xp, items };
 }

 static async completeQuest(player, quest) {
 player.removeTag(`quest:${quest.id}`);
 player.removeTag("adaquest");
 this.clearPlayerCache(player.id);

 GlobalConfig.set(`${player.name}_last_${quest.id}_completion`, Date.now());

 try {
 player.runCommand(`scoreboard players reset @s quest_${quest.id}`);
 } catch { }

 const rewards = this.getQuestRewards(quest);
 const success = await giveQuestRewards(player, rewards);

 const itemLine = rewards.items.length > 0
 ? `\n§a+ §e${rewards.items[0].id} §7x${rewards.items[0].count}`
 : "";

 if (success) {
 player.sendMessage(`\n§8[ §6QUEST COMPLETED §8]\n§fQuest: §e${quest.name}\n§fRewards:\n§a+ §6$${rewards.money} §fMoney\n§a+ §b${rewards.xp} XP${itemLine}\n`);
 return;
 }

 player.sendMessage(`\n§8[ §6QUEST COMPLETED §8]\n§fQuest: §e${quest.name}\n§fRewards:\n§c× Failed to add money\n§a+ §b${rewards.xp} XP\n`);
 console.warn(`Failed to apply rewards to player ${player.name} for quest ${quest.id}`);
 }

 static handleCropBreak(player, quest) {
 try {
 player.runCommand(`scoreboard players add @s quest_${quest.id} 1`);
 const progress = this.getQuestProgress(player, quest.id);
 player.sendMessage(`§8[ §eQuest §8] §fQuest progress: §e${progress}/${quest.target}`);

 if (progress >= quest.target) {
 system.run(async () => {
 await this.completeQuest(player, quest);
 });
 }
 } catch (error) {
 console.warn("Error updating quest progress:", error);
 }
 }

 static {
 world.beforeEvents.playerBreakBlock.subscribe((event) => {
 const { player, block } = event;

 if (!player.hasTag("adaquest")) {
 return;
 }

 const activeQuest = this.getActiveQuest(player);
 if (!activeQuest) {
 return;
 }

 const blockId = block.typeId;
 if (blockId !== activeQuest.block) {
 return;
 }

 const isBeetroot = blockId === "minecraft:beetroot" || blockId === "minecraft:beetroots";
 const maxGrowth = isBeetroot ? 3 : 7;
 const growth = block.permutation.getState("growth");
 if (typeof growth !== "number" || growth < maxGrowth) {
 return;
 }

 system.run(() => {
 this.handleCropBreak(player, activeQuest);
 });
 });
 }
}