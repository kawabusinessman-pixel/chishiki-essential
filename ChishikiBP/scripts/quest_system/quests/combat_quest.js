import { world, system, ActionFormData } from '../../core.js';
import { giveQuestRewards } from "../quest_rewards";
import { GlobalConfig } from "../../function/GlobalConfig.js";
export class CombatQuest {
 static defaultQuests = [
 { id: "zombie", name: "Zombie Slayer", target: 10, entity: "minecraft:zombie", icon: "textures/items/diamond_sword", reward: { money: 2000, xp: 100 }, cooldown: 43200000, tier: 1, enabled: true },
 { id: "skeleton", name: "Skeleton Hunter", target: 10, entity: "minecraft:skeleton", icon: "textures/items/bow_pulling_0", reward: { money: 2500, xp: 100 }, cooldown: 43200000, tier: 1, enabled: true },
 { id: "spider", name: "Spider Exterminator", target: 8, entity: "minecraft:spider", icon: "textures/items/string", reward: { money: 1500, xp: 100 }, cooldown: 21600000, tier: 1, enabled: true },
 { id: "creeper", name: "Creeper Destroyer", target: 5, entity: "minecraft:creeper", icon: "textures/items/gunpowder", reward: { money: 3000, xp: 100 }, cooldown: 86400000, tier: 1, enabled: true },
 { id: "husk", name: "Desert Hunter", target: 12, entity: "minecraft:husk", icon: "textures/items/iron_sword", reward: { money: 3500, xp: 150 }, cooldown: 43200000, tier: 2, enabled: true },
 { id: "stray", name: "Frozen Archer", target: 12, entity: "minecraft:stray", icon: "textures/items/arrow", reward: { money: 3500, xp: 150 }, cooldown: 43200000, tier: 2, enabled: true },
 { id: "drowned", name: "Ocean Cleaner", target: 15, entity: "minecraft:drowned", icon: "textures/items/trident", reward: { money: 4000, xp: 150 }, cooldown: 43200000, tier: 2, enabled: true },
 { id: "witch", name: "Witch Hunter", target: 8, entity: "minecraft:witch", icon: "textures/items/potion_bottle_splash", reward: { money: 5000, xp: 150 }, cooldown: 86400000, tier: 2, enabled: true },
 { id: "pillager", name: "Pillager Slayer", target: 10, entity: "minecraft:pillager", icon: "textures/items/crossbow_pulling_0", reward: { money: 6000, xp: 200 }, cooldown: 86400000, tier: 3, enabled: true },
 { id: "vindicator", name: "Vindicator Hunter", target: 8, entity: "minecraft:vindicator", icon: "textures/items/iron_axe", reward: { money: 7000, xp: 200 }, cooldown: 86400000, tier: 3, enabled: true },
 { id: "ravager", name: "Ravager Destroyer", target: 3, entity: "minecraft:ravager", icon: "textures/items/beef_cooked", reward: { money: 10000, xp: 300 }, cooldown: 172800000, tier: 3, enabled: true }
 ];

 static get quests() {
 const custom = GlobalConfig.get("custom_quests", [])
 .filter(q => q.type === "combat")
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
 const tier = Number.parseInt(String(q.tier ?? 1), 10);

 return {
 id: q.id,
 name: q.name,
 target: Number.isFinite(target) && target > 0 ? target : 1,
 entity: q.targetId,
 icon: q.icon || "textures/items/diamond_sword",
 reward: {
 money: Number.isFinite(money) ? money : 0,
 xp: Number.isFinite(xp) ? xp : 100,
 items: itemRewards
 },
 cooldown: (Number.isFinite(cooldownHours) && cooldownHours > 0 ? cooldownHours : 1) * 3600000,
 tier: Number.isFinite(tier) && tier > 0 ? tier : 1,
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
 static getQuestsByTier(tier) {
 return this.quests.filter(quest => quest.tier === tier);
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
 if (!config || !config.combat) return;
 if (config.combat.enabled) {
 this.quests.forEach(quest => {
 if (config.combat.enabled.hasOwnProperty(quest.id)) {
 quest.enabled = config.combat.enabled[quest.id];
 }
 });
 }
 if (config.combat.targets) {
 this.quests.forEach(quest => {
 if (config.combat.targets[quest.id]) {
 quest.target = config.combat.targets[quest.id];
 }
 });
 }
 if (config.combat.cooldowns) {
 this.quests.forEach(quest => {
 if (config.combat.cooldowns[quest.id]) {
 quest.cooldown = config.combat.cooldowns[quest.id];
 } else if (config.combat.cooldowns.default) {
 quest.cooldown = config.combat.cooldowns.default;
 }
 });
 }
 if (config.combat.rewards) {
 const defaultReward = {
 money: config.combat.rewards.money || 2000,
 xp: config.combat.rewards.xp || 100,
 items: config.combat.rewards.items || []
 };
 this.quests.forEach(quest => {
 if (config.combat.rewards.individual && config.combat.rewards.individual[quest.id]) {
 const individualReward = config.combat.rewards.individual[quest.id];
 quest.reward = {
 money: individualReward.money || Math.floor(defaultReward.money * (quest.tier * 0.5 + 0.5)),
 xp: individualReward.xp || Math.floor(defaultReward.xp * (quest.tier * 0.5)),
 items: [...(individualReward.items || defaultReward.items)]
 };
 } else {
 quest.reward = {
 money: Math.floor(defaultReward.money * (quest.tier * 0.5 + 0.5)),
 xp: Math.floor(defaultReward.xp * (quest.tier * 0.5)),
 items: [...defaultReward.items]
 };
 }
 });
 }
 }
 static showMenu(player, returnToMain = null) {
 this.updateQuestsFromConfig();
 const hasActiveQuest = player.hasTag("adaquest");
 const form = new ActionFormData()
 .title("§6Combat Quests")
 .body(hasActiveQuest ? "§eYou have an active quest. Track progress or select another quest:" : "§eSelect a combat quest:");
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
 for (const quest of this.quests) {
 if (!quest.enabled || player.hasTag(`quest:${quest.id}`)) continue;
 const lastCompletion = GlobalConfig.get(`${player.name}_last_${quest.id}_completion`) || 0;
 const currentTime = Date.now();
 const timeLeft = lastCompletion + quest.cooldown - currentTime;
 let buttonText = `${quest.name}\n§8Kill ${quest.target} ${quest.id}s\n§6Reward: $${quest.reward.money}`;
 if (timeLeft > 0) {
 const hours = Math.floor(timeLeft / 3600000);
 const minutes = Math.floor((timeLeft % 3600000) / 60000);
 buttonText += ` §cCD: ${hours}h${minutes}m`;
 }
 form.button(buttonText, quest.icon);
 }
 form.button("§l§c✘ Close\n§r§8Close the menu", "textures/ui/cancel");
 form.show(player).then(response => {
 if (!response.canceled) {
 if (response.selection === 0 && hasActiveQuest) {
 const activeQuest = this.quests.find(quest => player.hasTag(`quest:${quest.id}`));
 if (activeQuest) {
 this.confirmCancelQuest(player, activeQuest, returnToMain);
 }
 } else {
 const availableQuests = this.quests.filter(q => q.enabled && !player.hasTag(`quest:${q.id}`));
 const questIndex = hasActiveQuest ? response.selection - 1 : response.selection;
 if (questIndex === availableQuests.length) {
 if (returnToMain) {
 returnToMain(player);
 }
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
 });
 }
 static confirmCancelQuest(player, quest, returnToMain = null) {
 const form = new ActionFormData()
 .title("§cCancel Quest")
 .body(`§eAre you sure you want to cancel the quest:\n§f${quest.name}?\n\n§cThis action cannot be undone and all progress will be lost!`)
 .button("§l§c✘ Yes, Cancel Quest\n§r§8Cancel current quest", "textures/ui/redX1")
 .button("§l§a✔ No, Keep Quest\n§r§8Return to quests", "textures/ui/arrow_left");
 form.show(player).then(response => {
 if (!response.canceled) {
 if (response.selection === 0) {
 player.removeTag(`quest:${quest.id}`);
 player.removeTag("adaquest");
 try {
 player.runCommand(`scoreboard players reset @s quest_${quest.id}`);
 } catch { }
 player.sendMessage(`§a✔ Successfully cancelled quest: §e${quest.name}`);
 player.runCommand("playsound note.bass @s ~~~ 1 1");
 }
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
 static async completeQuest(player, quest) {
 try {
 this.clearPlayerCache(player.id);
 player.removeTag(`quest:${quest.id}`);
 player.removeTag("adaquest");
 GlobalConfig.set(`${player.name}_last_${quest.id}_completion`, Date.now());
 player.runCommand(`scoreboard players reset @s quest_${quest.id}`);

 const rewardObject = typeof quest.reward === "object" && quest.reward !== null
 ? {
 money: Number.isFinite(Number(quest.reward.money)) ? Number(quest.reward.money) : 0,
 xp: Number.isFinite(Number(quest.reward.xp)) ? Number(quest.reward.xp) : 100,
 items: Array.isArray(quest.reward.items) ? [...quest.reward.items] : []
 }
 : {
 money: Number.isFinite(Number(quest.reward)) ? Number(quest.reward) : 0,
 xp: 100,
 items: []
 };

 const success = await giveQuestRewards(player, rewardObject);
 const itemLine = rewardObject.items.length > 0
 ? `§a+ §e${rewardObject.items[0].id} §7x${rewardObject.items[0].count}\n`
 : "";

 if (success) {
 player.sendMessage(`\n§8[ §6QUEST COMPLETED §8]\n§fQuest: §e${quest.name}\n§fRewards:\n§a+ §6$${rewardObject.money} §fMoney\n§a+ §b${rewardObject.xp} XP\n${itemLine}`);
 player.runCommand("playsound random.levelup @s ~~~ 1 1");
 player.runCommand("particle minecraft:villager_happy ~~~");
 } else {
 player.sendMessage("§c⚠ Error giving quest rewards!");
 }
 } catch (error) {
 console.warn("Error completing quest:", error);
 player.sendMessage("§c⚠ An error occurred while completing the quest!");
 }
 }
 static {
 world.afterEvents.entityDie.subscribe((event) => {
 try {
 const { deadEntity, damageSource } = event;
 const killer = damageSource.damagingEntity;
 if (!killer || killer.typeId !== "minecraft:player" || !killer.hasTag("adaquest")) return;
 const entityId = deadEntity.typeId;
 const matchingQuest = this.quests.find(quest =>
 quest.entity === entityId && this.isQuestActive(killer, quest.id)
 );
 if (matchingQuest) {
 system.run(() => {
 try {
 const objective = world.scoreboard.getObjective(`quest_${matchingQuest.id}`);
 if (objective) {
 const progress = (objective.getScore(killer.scoreboardIdentity) || 0) + 1;
 objective.setScore(killer.scoreboardIdentity, progress);
 killer.sendMessage(`§8[ §eQuest §8] §fQuest progress: §e${progress}/${matchingQuest.target}`);
 if (progress >= matchingQuest.target) {
 this.completeQuest(killer, matchingQuest);
 }
 } else {
 try { killer.runCommand(`scoreboard objectives add quest_${matchingQuest.id} dummy`); } catch { }
 killer.runCommand(`scoreboard players set @s quest_${matchingQuest.id} 1`);
 }
 } catch (error) {
 console.warn("Error updating quest progress:", error);
 }
 });
 }
 } catch (error) {
 console.warn("Error in combat quest handler:", error);
 }
 });
 }
}