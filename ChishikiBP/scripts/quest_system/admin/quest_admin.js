import { world, system, ActionFormData, ModalFormData } from '../../core.js';
import { addMoney } from "../../function/moneySystem.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
let MiningQuest, CombatQuest, FarmingQuest;
async function loadQuestClasses() {
 if (!MiningQuest) {
 const mining = await import("../quests/mining_quest.js");
 MiningQuest = mining.MiningQuest;
 }
 if (!CombatQuest) {
 const combat = await import("../quests/combat_quest.js");
 CombatQuest = combat.CombatQuest;
 }
 if (!FarmingQuest) {
 const farming = await import("../quests/farming_quest.js");
 FarmingQuest = farming.FarmingQuest;
 }
}

const QUEST_TYPES = ["mining", "combat", "farming"];

function getQuestClassByType(type) {
 if (type === "combat") return CombatQuest;
 if (type === "mining") return MiningQuest;
 if (type === "farming") return FarmingQuest;
 return undefined;
}

async function getQuestIdsByType() {
 await loadQuestClasses();

 const result = { mining: [], combat: [], farming: [] };
 for (const type of QUEST_TYPES) {
 const QuestClass = getQuestClassByType(type);
 const ids = Array.isArray(QuestClass?.quests)
 ? QuestClass.quests.map(quest => quest?.id).filter(Boolean)
 : [];
 result[type] = [...new Set(ids)];
 }

 return result;
}

function collectQuestIds(questIdsByType, selectedTypes) {
 const ids = [];
 for (const type of selectedTypes) {
 const byType = questIdsByType[type] || [];
 for (const questId of byType) {
 ids.push(questId);
 }
 }
 return [...new Set(ids)];
}

function clearQuestCooldownEntry(player, questId) {
 GlobalConfig.set(`${player.name}_last_${questId}_completion`, 0);
 try {
 player.setDynamicProperty(`last_${questId}_completion`, 0);
 } catch { }
}

function getFirstItemReward(items) {
 if (!Array.isArray(items)) return { id: "", count: "1" };
 const first = items.find(item => item && typeof item === "object" && typeof item.id === "string" && item.id.trim());
 if (!first) return { id: "", count: "1" };

 const parsedCount = Number.parseInt(String(first.count ?? "1"), 10);
 return {
 id: first.id.trim(),
 count: Number.isFinite(parsedCount) && parsedCount > 0 ? String(parsedCount) : "1"
 };
}

function parseItemRewardInputs(itemIdValue, itemCountValue) {
 const id = String(itemIdValue ?? "").trim();
 if (!id) return [];

 const parsedCount = Number.parseInt(String(itemCountValue ?? ""), 10);
 const count = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;
 return [{ id, count }];
}

function formatItemRewardLine(items) {
 const first = Array.isArray(items) ? items[0] : undefined;
 if (!first || typeof first.id !== "string" || !first.id.trim()) return "§8None";

 const parsedCount = Number.parseInt(String(first.count ?? 1), 10);
 const count = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;
 return `§e${first.id.trim()} §7x${count}`;
}

function parseNonNegativeInt(value, fallback) {
 const parsed = Number.parseInt(String(value ?? ""), 10);
 return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function createDefaultQuestConfig() {
 return {
 mining: { rewards: {}, cooldowns: {}, targets: {} },
 combat: { rewards: {}, cooldowns: {}, targets: {} },
 farming: { rewards: {}, cooldowns: {}, targets: {} }
 };
}

function normalizeQuestConfig(rawConfig) {
 const base = createDefaultQuestConfig();
 if (!rawConfig || typeof rawConfig !== "object") {
 return base;
 }

 const config = { ...base, ...rawConfig };
 for (const type of QUEST_TYPES) {
 if (!config[type] || typeof config[type] !== "object") {
 config[type] = { ...base[type] };
 continue;
 }
 if (!config[type].rewards || typeof config[type].rewards !== "object") config[type].rewards = {};
 if (!config[type].cooldowns || typeof config[type].cooldowns !== "object") config[type].cooldowns = {};
 if (!config[type].targets || typeof config[type].targets !== "object") config[type].targets = {};
 }

 return config;
}

function getQuestConfig() {
 try {
 let config;
 const legacyConfig = world.getDynamicProperty('questConfig');

 if (legacyConfig !== undefined && legacyConfig !== null) {
 try {
 config = typeof legacyConfig === "string" ? JSON.parse(legacyConfig) : legacyConfig;
 GlobalConfig.set('questConfig', config);
 } catch {
 config = GlobalConfig.get('questConfig');
 }
 } else {
 config = GlobalConfig.get('questConfig');
 }

 return normalizeQuestConfig(config);
 } catch (error) {
 console.warn("Error getting quest config:", error);
 return createDefaultQuestConfig();
 }
}
async function saveQuestConfig(config) {
 try {
 const normalized = normalizeQuestConfig(config);
 GlobalConfig.set('questConfig', normalized);
 world.setDynamicProperty('questConfig', JSON.stringify(normalized));
 await loadQuestClasses();
 MiningQuest?.updateQuestsFromConfig();
 CombatQuest?.updateQuestsFromConfig();
 FarmingQuest?.updateQuestsFromConfig();
 return true;
 } catch (error) {
 console.warn("Error saving quest config:", error);
 return false;
 }
}
export async function showQuestAdminMenu(player) {
 try {
 const form = new ActionFormData()
 .title("§6Quest Admin Menu")
 .body("§eSelect an option:")
 .button("Manage Custom Quests\n§8Create new dynamic quests", "textures/items/book_writable")
 .button("Enable/Disable Quests\n§8Toggle quest availability", "textures/ui/toggle_on")
 .button("Edit Quest Settings\n§8Change rewards, targets, cooldowns", "textures/ui/accessibility_glyph_color")
 .button("Reset All Quests\n§8Reset progress for all players", "textures/ui/refresh")
 .button("§cBack", "textures/ui/arrow_left");
 const response = await form.show(player);
 if (!response.canceled) {
 switch (response.selection) {
 case 0:
 const { showCustomQuestMenu } = await import("./custom_quest_admin.js");
 await showCustomQuestMenu(player);
 break;
 case 1:
 await showQuestToggleMenu(player);
 break;
 case 2:
 await showQuestSettingsMenu(player);
 break;
 case 3:
 await resetAllQuests(player);
 break;
 }
 }
 } catch (error) {
 console.warn("Error in quest admin menu:", error);
 player.sendMessage("§c⚠ An error occurred in the quest admin menu!");
 }
}
async function showQuestToggleMenu(player) {
 try {
 const form = new ActionFormData()
 .title("§6Toggle Quests")
 .body("§eSelect quest type to toggle:")
 .button("Combat Quests\n§8Enable/Disable combat quests", "textures/ui/sword")
 .button("Mining Quests\n§8Enable/Disable mining quests", "textures/blocks/diamond_ore")
 .button("Farming Quests\n§8Enable/Disable farming quests", "textures/blocks/wheat_stage_7")
 .button("§cBack", "textures/ui/arrow_left");
 const response = await form.show(player);
 if (!response.canceled) {
 switch (response.selection) {
 case 0:
 await showCombatQuestToggle(player);
 break;
 case 1:
 await showMiningQuestToggle(player);
 break;
 case 2:
 await showFarmingQuestToggle(player);
 break;
 case 3:
 await showQuestAdminMenu(player);
 break;
 }
 }
 } catch (error) {
 console.warn("Error in quest toggle menu:", error);
 player.sendMessage("§c⚠ An error occurred while toggling quests!");
 }
}
async function showQuestSettingsMenu(player) {
 try {
 const form = new ActionFormData()
 .title("§6Quest Settings")
 .body("§eSelect what to configure:")
 .button("Edit Individual Quest\n§8Edit specific quest settings", "textures/ui/accessibility_glyph_color")
 .button("Quick Edit Rewards\n§8Set rewards for all quests", "textures/ui/gift_square")
 .button("Quick Edit Targets\n§8Set targets for all quests", "textures/ui/anvil_icon")
 .button("Quick Edit Cooldowns\n§8Set cooldowns for all quests", "textures/ui/timer")
 .button("§cBack", "textures/ui/arrow_left");
 const response = await form.show(player);
 if (!response.canceled) {
 switch (response.selection) {
 case 0:
 await showQuestTypeSelection(player);
 break;
 case 1:
 await showQuickRewardEdit(player);
 break;
 case 2:
 await showQuickTargetEdit(player);
 break;
 case 3:
 await showQuickCooldownEdit(player);
 break;
 case 4:
 await showQuestAdminMenu(player);
 break;
 }
 }
 } catch (error) {
 console.warn("Error in quest settings menu:", error);
 player.sendMessage("§c⚠ An error occurred in the settings menu!");
 }
}
async function showQuestToggle(player, questType, questsList) {
 try {
 const config = getQuestConfig();
 if (!config[questType]) config[questType] = {};
 if (!config[questType].enabled) config[questType].enabled = {};
 const form = new ModalFormData().title(`§6${questType.charAt(0).toUpperCase() + questType.slice(1)} Quest Toggle`);
 const toggles = [];
 questsList.forEach(quest => {
 form.toggle(`§e§l${quest.name}\n§6${quest.desc}`,
 { defaultValue: config[questType].enabled[quest.id] !== false });
 toggles.push(quest.id);
 });
 const response = await form.show(player);
 if (!response.canceled) {
 toggles.forEach((questId, index) => {
 config[questType].enabled[questId] = response.formValues[index];
 });
 if (await saveQuestConfig(config)) {
 player.sendMessage(`§a✔ ${questType.charAt(0).toUpperCase() + questType.slice(1)} quest settings updated successfully!`);
 } else {
 player.sendMessage(`§c⚠ Failed to save ${questType} quest settings!`);
 }
 }
 await showQuestToggleMenu(player);
 } catch (error) {
 console.warn(`Error in ${questType} quest toggle:`, error);
 player.sendMessage(`§c⚠ An error occurred while toggling ${questType} quests!`);
 }
}
async function showCombatQuestToggle(player) {
 const combatQuests = [
 { id: "zombie", name: "Zombie Slayer", desc: "Toggle zombie slaying quests" },
 { id: "skeleton", name: "Skeleton Hunter", desc: "Toggle skeleton hunting quests" },
 { id: "spider", name: "Spider Exterminator", desc: "Toggle spider extermination quests" },
 { id: "creeper", name: "Creeper Destroyer", desc: "Toggle creeper destroying quests" },
 { id: "husk", name: "Desert Hunter", desc: "Toggle husk hunting quests" },
 { id: "stray", name: "Frozen Archer", desc: "Toggle stray hunting quests" },
 { id: "drowned", name: "Ocean Cleaner", desc: "Toggle drowned hunting quests" },
 { id: "witch", name: "Witch Hunter", desc: "Toggle witch hunting quests" },
 { id: "pillager", name: "Pillager Slayer", desc: "Toggle pillager slaying quests" },
 { id: "vindicator", name: "Vindicator Hunter", desc: "Toggle vindicator hunting quests" },
 { id: "ravager", name: "Ravager Destroyer", desc: "Toggle ravager destroying quests" }
 ];
 await showQuestToggle(player, "combat", combatQuests);
}
async function showQuickRewardEdit(player) {
 try {
 const config = getQuestConfig();
 const toSliderNumber = (value, fallback, min = 0, max = 500) => {
 const parsed = Number(value);
 if (!Number.isFinite(parsed)) return fallback;
 if (parsed < min) return min;
 if (parsed > max) return max;
 return parsed;
 };

 const combatXpDefault = toSliderNumber(config.combat?.rewards?.xp, 100);
 const miningXpDefault = toSliderNumber(config.mining?.rewards?.xp, 100);
 const farmingXpDefault = toSliderNumber(config.farming?.rewards?.xp, 100);

 const combatItemDefault = getFirstItemReward(config.combat?.rewards?.items);
 const miningItemDefault = getFirstItemReward(config.mining?.rewards?.items);
 const farmingItemDefault = getFirstItemReward(config.farming?.rewards?.items);
 const combatItemEnabledDefault = combatItemDefault.id.length > 0;
 const miningItemEnabledDefault = miningItemDefault.id.length > 0;
 const farmingItemEnabledDefault = farmingItemDefault.id.length > 0;
 const form = new ModalFormData().title("§6Quick Edit Rewards");
 const canUseHeader = typeof form.header === "function" || typeof form.label === "function";

 const addSectionDivider = (title) => {
 if (typeof form.divider === "function") {
 form.divider();
 }
 if (typeof form.header === "function") {
 form.header(`§f${title}`);
 } else if (typeof form.label === "function") {
 form.label(`§f${title}`);
 }
 };

 const combatPrefix = canUseHeader ? "" : "§f[ COMBAT ]\n";
 const miningPrefix = canUseHeader ? "" : "§f[ MINING ]\n";
 const farmingPrefix = canUseHeader ? "" : "§f[ FARMING ]\n";

 addSectionDivider("[ COMBAT ]");
 form
 .textField(
 `${combatPrefix}§eMoney Reward\n§fExample: 2000`,
 "Enter amount",
 { defaultValue: config.combat?.rewards?.money?.toString() || "2000" }
 )
 .slider(
 "§eXP Reward\n§fDefault: 100",
 0,
 500,
 { defaultValue: combatXpDefault, valueStep: 10 }
 )
 .toggle(
 "§eEnable Item Reward",
 { defaultValue: combatItemEnabledDefault }
 )
 .textField(
 "§eItem ID\n§fExample: minecraft:diamond or kiwora:token",
 "",
 { defaultValue: combatItemDefault.id }
 )
 .textField(
 "§eItem Count\n§fSet > 0",
 "1",
 { defaultValue: combatItemDefault.count }
 );

 addSectionDivider("[ MINING ]");
 form
 .textField(
 `${miningPrefix}§eMoney Reward\n§fExample: 1000`,
 "Enter amount",
 { defaultValue: config.mining?.rewards?.money?.toString() || "1000" }
 )
 .slider(
 "§eXP Reward\n§fDefault: 100",
 0,
 500,
 { defaultValue: miningXpDefault, valueStep: 10 }
 )
 .toggle(
 "§eEnable Item Reward",
 { defaultValue: miningItemEnabledDefault }
 )
 .textField(
 "§eItem ID\n§fExample: minecraft:diamond or kiwora:token",
 "",
 { defaultValue: miningItemDefault.id }
 )
 .textField(
 "§eItem Count\n§fSet > 0",
 "1",
 { defaultValue: miningItemDefault.count }
 );

 addSectionDivider("[ FARMING ]");
 form
 .textField(
 `${farmingPrefix}§eMoney Reward\n§fExample: 1500`,
 "Enter amount",
 { defaultValue: config.farming?.rewards?.money?.toString() || "1500" }
 )
 .slider(
 "§eXP Reward\n§fDefault: 100",
 0,
 500,
 { defaultValue: farmingXpDefault, valueStep: 10 }
 )
 .toggle(
 "§eEnable Item Reward",
 { defaultValue: farmingItemEnabledDefault }
 )
 .textField(
 "§eItem ID\n§fExample: minecraft:wheat or kiwora:token",
 "",
 { defaultValue: farmingItemDefault.id }
 )
 .textField(
 "§eItem Count\n§fSet > 0",
 "1",
 { defaultValue: farmingItemDefault.count }
 );
 const response = await form.show(player);
 if (!response.canceled) {
 const rawValues = Array.isArray(response.formValues) ? response.formValues : [];
 const sectionCount = 3;
 const fieldsPerSection = 5;
 const expectedInteractiveCount = sectionCount * fieldsPerSection;
 const normalizedValues = [];

 const totalDecoratorValues = Math.max(0, rawValues.length - expectedInteractiveCount);
 if (rawValues.length > expectedInteractiveCount) {
 const baseDecoratorsPerSection = Math.floor(totalDecoratorValues / sectionCount);
 const trailingSectionsWithExtraDecorator = totalDecoratorValues % sectionCount;
 let cursor = 0;
 for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex++) {
 const sectionDecorators = baseDecoratorsPerSection
 + (sectionIndex >= sectionCount - trailingSectionsWithExtraDecorator ? 1 : 0);
 cursor += sectionDecorators;
 for (let fieldIndex = 0; fieldIndex < fieldsPerSection; fieldIndex++) {
 normalizedValues.push(rawValues[cursor]);
 cursor++;
 }
 }
 } else {
 normalizedValues.push(...rawValues);
 }

 const [
 combatMoneyReward,
 combatXpReward,
 combatItemEnabled,
 combatItemId,
 combatItemCount,
 miningMoneyReward,
 miningXpReward,
 miningItemEnabled,
 miningItemId,
 miningItemCount,
 farmingMoneyReward,
 farmingXpReward,
 farmingItemEnabled,
 farmingItemId,
 farmingItemCount
 ] = normalizedValues;

 if (!config.combat) config.combat = {};
 if (!config.mining) config.mining = {};
 if (!config.farming) config.farming = {};

 if (!config.combat.rewards || typeof config.combat.rewards !== "object") config.combat.rewards = {};
 if (!config.mining.rewards || typeof config.mining.rewards !== "object") config.mining.rewards = {};
 if (!config.farming.rewards || typeof config.farming.rewards !== "object") config.farming.rewards = {};

 const parseNumberOr = (value, fallback) => {
 const num = Number(value);
 return Number.isFinite(num) ? num : fallback;
 };

 const parseBool = value => value === true || value === 1 || value === "1" || value === "true";

 const combatMoney = parseNonNegativeInt(combatMoneyReward, config.combat.rewards.money ?? 2000);
 const combatXp = parseNumberOr(combatXpReward, config.combat.rewards.xp ?? 100);
 const combatItems = parseBool(combatItemEnabled) ? parseItemRewardInputs(combatItemId, combatItemCount) : [];
 config.combat.rewards = {
 ...config.combat.rewards,
 money: combatMoney,
 xp: combatXp,
 items: combatItems,
 individual: {}
 };

 const miningMoney = parseNonNegativeInt(miningMoneyReward, config.mining.rewards.money ?? 1000);
 const miningXp = parseNumberOr(miningXpReward, config.mining.rewards.xp ?? 100);
 const miningItems = parseBool(miningItemEnabled) ? parseItemRewardInputs(miningItemId, miningItemCount) : [];
 config.mining.rewards = {
 ...config.mining.rewards,
 money: miningMoney,
 xp: miningXp,
 items: miningItems,
 individual: {}
 };

 const farmingMoney = parseNonNegativeInt(farmingMoneyReward, config.farming.rewards.money ?? 1500);
 const farmingXp = parseNumberOr(farmingXpReward, config.farming.rewards.xp ?? 100);
 const farmingItems = parseBool(farmingItemEnabled) ? parseItemRewardInputs(farmingItemId, farmingItemCount) : [];
 config.farming.rewards = {
 ...config.farming.rewards,
 money: farmingMoney,
 xp: farmingXp,
 items: farmingItems,
 individual: {}
 };

 if (await saveQuestConfig(config)) {
 player.sendMessage("§a✔ Quest rewards updated successfully!");
 player.sendMessage("§e💰 Money Rewards:");
 player.sendMessage(`§7Combat: §6$${combatMoney}`);
 player.sendMessage(`§7Mining: §6$${miningMoney}`);
 player.sendMessage(`§7Farming: §6$${farmingMoney}`);
 player.sendMessage("§b✨ XP Rewards:");
 player.sendMessage(`§7Combat: §b${combatXp}`);
 player.sendMessage(`§7Mining: §b${miningXp}`);
 player.sendMessage(`§7Farming: §b${farmingXp}`);
 player.sendMessage("§d📦 Item Rewards:");
 player.sendMessage(`§7Combat: ${formatItemRewardLine(combatItems)}`);
 player.sendMessage(`§7Mining: ${formatItemRewardLine(miningItems)}`);
 player.sendMessage(`§7Farming: ${formatItemRewardLine(farmingItems)}`);
 } else {
 player.sendMessage("§c⚠ Failed to save quest rewards!");
 }
 }
 await showQuestSettingsMenu(player);
 } catch (error) {
 console.warn("Error in quick reward edit:", error);
 player.sendMessage("§c⚠ An error occurred while editing rewards!");
 }
}
async function showQuickTargetEdit(player) {
 try {
 const config = getQuestConfig();
 const form = new ModalFormData()
 .title("§6Quick Edit Targets")
 .slider("§e§l⚔ Zombie Quest Target\n§6Default: 10", 1, 50, { defaultValue: config.combat?.targets?.zombie || 10, valueStep: 1, tooltip: "§6Number of zombies to kill" })
 .slider("§e§l⚔ Skeleton Quest Target\n§6Default: 10", 1, 50, { defaultValue: config.combat?.targets?.skeleton || 10, valueStep: 1, tooltip: "§6Number of skeletons to kill" })
 .slider("§e§l⚔ Spider Quest Target\n§6Default: 8", 1, 50, { defaultValue: config.combat?.targets?.spider || 8, valueStep: 1, tooltip: "§6Number of spiders to kill" })
 .slider("§e§l⚔ Creeper Quest Target\n§6Default: 5", 1, 30, { defaultValue: config.combat?.targets?.creeper || 5, valueStep: 1, tooltip: "§6Number of creepers to kill" })
 .slider("§e§l⚔ Husk Quest Target\n§6Default: 12", 1, 50, { defaultValue: config.combat?.targets?.husk || 12, valueStep: 1, tooltip: "§6Number of husks to kill" })
 .slider("§e§l⚔ Stray Quest Target\n§6Default: 12", 1, 50, { defaultValue: config.combat?.targets?.stray || 12, valueStep: 1, tooltip: "§6Number of strays to kill" })
 .slider("§e§l⚔ Drowned Quest Target\n§6Default: 15", 1, 50, { defaultValue: config.combat?.targets?.drowned || 15, valueStep: 1, tooltip: "§6Number of drowned to kill" })
 .slider("§e§l⚔ Witch Quest Target\n§6Default: 8", 1, 30, { defaultValue: config.combat?.targets?.witch || 8, valueStep: 1, tooltip: "§6Number of witches to kill" })
 .slider("§e§l⚔ Pillager Quest Target\n§6Default: 10", 1, 30, { defaultValue: config.combat?.targets?.pillager || 10, valueStep: 1, tooltip: "§6Number of pillagers to kill" })
 .slider("§e§l⚔ Vindicator Quest Target\n§6Default: 8", 1, 30, { defaultValue: config.combat?.targets?.vindicator || 8, valueStep: 1, tooltip: "§6Number of vindicators to kill" })
 .slider("§e§l⚔ Ravager Quest Target\n§6Default: 3", 1, 20, { defaultValue: config.combat?.targets?.ravager || 3, valueStep: 1, tooltip: "§6Number of ravagers to kill" })
 .slider("§e§l⛏ Diamond Quest Target\n§6Default: 20", 1, 100, { defaultValue: config.mining?.targets?.diamond || 20, valueStep: 1, tooltip: "§6Number of diamonds to mine" })
 .slider("§e§l⛏ Iron Quest Target\n§6Default: 50", 1, 200, { defaultValue: config.mining?.targets?.iron || 50, valueStep: 5, tooltip: "§6Number of iron ores to mine" })
 .slider("§e§l⛏ Gold Quest Target\n§6Default: 30", 1, 150, { defaultValue: config.mining?.targets?.gold || 30, valueStep: 5, tooltip: "§6Number of gold ores to mine" })
 .slider("§e§l⛏ Emerald Quest Target\n§6Default: 20", 1, 100, { defaultValue: config.mining?.targets?.emerald || 20, valueStep: 1, tooltip: "§6Number of emeralds to mine" })
 .slider("§e§l⛏ Coal Quest Target\n§6Default: 40", 1, 200, { defaultValue: config.mining?.targets?.coal || 40, valueStep: 5, tooltip: "§6Number of coal ores to mine" })
 .slider("§e§l🌾 Wheat Quest Target\n§6Default: 20", 1, 200, { defaultValue: config.farming?.targets?.wheat || 20, valueStep: 5, tooltip: "§6Number of wheat to harvest" })
 .slider("§e§l🌾 Potato Quest Target\n§6Default: 20", 1, 200, { defaultValue: config.farming?.targets?.potato || 20, valueStep: 5, tooltip: "§6Number of potatoes to harvest" })
 .slider("§e§l🌾 Carrot Quest Target\n§6Default: 20", 1, 200, { defaultValue: config.farming?.targets?.carrot || 20, valueStep: 5, tooltip: "§6Number of carrots to harvest" })
 .slider("§e§l🌾 Beetroot Quest Target\n§6Default: 20", 1, 200, { defaultValue: config.farming?.targets?.beetroot || 20, valueStep: 5, tooltip: "§6Number of beetroots to harvest" });
 const response = await form.show(player);
 if (!response.canceled) {
 const [
 zombieTarget, skeletonTarget, spiderTarget, creeperTarget,
 huskTarget, strayTarget, drownedTarget, witchTarget,
 pillagerTarget, vindicatorTarget, ravagerTarget,
 diamondTarget, ironTarget, goldTarget, emeraldTarget, coalTarget,
 wheatTarget, potatoTarget, carrotTarget, beetrootTarget
 ] = response.formValues;
 if (!config.combat) config.combat = {};
 if (!config.mining) config.mining = {};
 if (!config.farming) config.farming = {};
 config.combat.targets = {
 zombie: zombieTarget,
 skeleton: skeletonTarget,
 spider: spiderTarget,
 creeper: creeperTarget,
 husk: huskTarget,
 stray: strayTarget,
 drowned: drownedTarget,
 witch: witchTarget,
 pillager: pillagerTarget,
 vindicator: vindicatorTarget,
 ravager: ravagerTarget
 };
 config.mining.targets = {
 diamond: diamondTarget,
 iron: ironTarget,
 gold: goldTarget,
 emerald: emeraldTarget,
 coal: coalTarget
 };
 config.farming.targets = {
 wheat: wheatTarget,
 potato: potatoTarget,
 carrot: carrotTarget,
 beetroot: beetrootTarget
 };
 if (await saveQuestConfig(config)) {
 player.sendMessage("§a✔ Quest targets updated successfully!");
 player.sendMessage("§c⚔ Combat Targets (Tier 1):");
 player.sendMessage(`§7- Zombie: ${zombieTarget} | Skeleton: ${skeletonTarget}`);
 player.sendMessage(`§7- Spider: ${spiderTarget} | Creeper: ${creeperTarget}`);
 player.sendMessage("§c⚔ Combat Targets (Tier 2):");
 player.sendMessage(`§7- Husk: ${huskTarget} | Stray: ${strayTarget}`);
 player.sendMessage(`§7- Drowned: ${drownedTarget} | Witch: ${witchTarget}`);
 player.sendMessage("§c⚔ Combat Targets (Tier 3):");
 player.sendMessage(`§7- Pillager: ${pillagerTarget} | Vindicator: ${vindicatorTarget}`);
 player.sendMessage(`§7- Ravager: ${ravagerTarget}`);
 player.sendMessage("§b⛏ Mining Targets:");
 player.sendMessage(`§7- Diamond: ${diamondTarget} | Iron: ${ironTarget}`);
 player.sendMessage(`§7- Gold: ${goldTarget} | Emerald: ${emeraldTarget}`);
 player.sendMessage(`§7- Coal: ${coalTarget}`);
 player.sendMessage("§a🌾 Farming Targets:");
 player.sendMessage(`§7- Wheat: ${wheatTarget} | Potato: ${potatoTarget}`);
 player.sendMessage(`§7- Carrot: ${carrotTarget} | Beetroot: ${beetrootTarget}`);
 } else {
 player.sendMessage("§c⚠ Failed to save quest targets!");
 }
 }
 await showQuestSettingsMenu(player);
 } catch (error) {
 console.warn("Error in quick target edit:", error);
 player.sendMessage("§c⚠ An error occurred while editing targets!");
 }
}
async function showQuickCooldownEdit(player) {
 try {
 const config = getQuestConfig();
 const form = new ModalFormData()
 .title("§6Quick Edit Cooldowns")
 .slider(
 "§eCombat Quest Cooldown\n§6Default: 12 hours",
 1,
 72,
 { defaultValue: (config.combat?.cooldowns?.default || 43200000) / 3600000, valueStep: 1, tooltip: "§6Hours before combat quests can be taken again" }
 )
 .slider(
 "§eMining Quest Cooldown\n§6Default: 24 hours",
 1,
 72,
 { defaultValue: (config.mining?.cooldowns?.default || 86400000) / 3600000, valueStep: 1, tooltip: "§6Hours before mining quests can be taken again" }
 )
 .slider(
 "§eFarming Quest Cooldown\n§6Default: 6 hours",
 1,
 72,
 { defaultValue: (config.farming?.cooldowns?.default || 21600000) / 3600000, valueStep: 1, tooltip: "§6Hours before farming quests can be taken again" }
 );
 const response = await form.show(player);
 if (!response.canceled) {
 const [combatHours, miningHours, farmingHours] = response.formValues;
 if (!config.combat) config.combat = {};
 if (!config.mining) config.mining = {};
 if (!config.farming) config.farming = {};
 config.combat.cooldowns = { default: combatHours * 3600000 };
 config.mining.cooldowns = { default: miningHours * 3600000 };
 config.farming.cooldowns = { default: farmingHours * 3600000 };
 if (await saveQuestConfig(config)) {
 player.sendMessage("§a✔ Quest cooldowns updated successfully!");
 } else {
 player.sendMessage("§c⚠ Failed to save quest cooldowns!");
 }
 }
 await showQuestSettingsMenu(player);
 } catch (error) {
 console.warn("Error in quick cooldown edit:", error);
 player.sendMessage("§c⚠ An error occurred while editing cooldowns!");
 }
}
async function resetAllQuests(player) {
 try {
 const form = new ActionFormData()
 .title("§cReset Quest Settings")
 .body("§eSelect what you want to reset:")
 .button("Reset All Quest Progress\n§8Reset progress for all players", "textures/ui/refresh")
 .button("Reset Cooldowns\n§8Reset quest cooldowns", "textures/ui/timer")
 .button("Reset Rewards\n§8Reset to default rewards", "textures/ui/MCoin")
 .button("Reset Targets\n§8Reset to default targets", "textures/blocks/target_side")
 .button("§cBack", "textures/ui/arrow_left");
 const response = await form.show(player);
 if (!response.canceled) {
 switch (response.selection) {
 case 0:
 await resetQuestProgress(player);
 break;
 case 1:
 await resetQuestCooldowns(player);
 break;
 case 2:
 await resetQuestRewards(player);
 break;
 case 3:
 await resetQuestTargets(player);
 break;
 case 4:
 await showQuestAdminMenu(player);
 break;
 }
 }
 } catch (error) {
 console.warn("Error in reset menu:", error);
 player.sendMessage("§c⚠ An error occurred in the reset menu!");
 }
}
async function resetQuestProgress(player) {
 try {
 const confirmForm = new ActionFormData()
 .title("§cReset Quest Progress")
 .body("§eAre you sure you want to reset ALL quest progress for all players?\n§cThis action cannot be undone!")
 .button("§cYes, Reset All Progress", "textures/ui/redX1")
 .button("No, Cancel", "textures/ui/arrow_left");
 const response = await confirmForm.show(player);
 if (!response.canceled && response.selection === 0) {
 const config = getQuestConfig();
 const questIdsByType = await getQuestIdsByType();
 const allQuestIds = collectQuestIds(questIdsByType, QUEST_TYPES);

 QUEST_TYPES.forEach(type => {
 if (config[type]) {
 config[type].progress = {};
 }
 });

 for (const p of world.getPlayers()) {
 const tags = Array.from(p.getTags());
 tags.forEach(tag => {
 if (tag.startsWith('quest:')) {
 p.removeTag(tag);
 }
 });
 p.removeTag('adaquest');

 allQuestIds.forEach(questId => {
 clearQuestCooldownEntry(p, questId);
 try {
 p.runCommand(`scoreboard players reset @s quest_${questId}`);
 } catch { }
 });
 }
 if (await saveQuestConfig(config)) {
 player.sendMessage("§a✔ All quest progress has been reset!");
 world.sendMessage("§6System: §eAll quest progress has been reset by an administrator.");
 } else {
 player.sendMessage("§c⚠ Failed to reset quest progress!");
 }
 }
 } catch (error) {
 console.warn("Error resetting quest progress:", error);
 player.sendMessage("§c⚠ An error occurred while resetting quest progress!");
 }
}
async function resetQuestCooldowns(player) {
 try {
 const confirmForm = new ActionFormData()
 .title("§cReset Quest Cooldowns")
 .body("§eSelect which quest type cooldowns to reset:")
 .button("Reset Mining Cooldowns\n§8Reset mining quest cooldowns", "textures/blocks/diamond_ore")
 .button("Reset Combat Cooldowns\n§8Reset combat quest cooldowns", "textures/items/diamond_sword")
 .button("Reset Farming Cooldowns\n§8Reset farming quest cooldowns", "textures/blocks/wheat_stage_7")
 .button("Reset ALL Cooldowns\n§8Reset all quest cooldowns", "textures/ui/refresh")
 .button("§cBack", "textures/ui/arrow_left");
 const response = await confirmForm.show(player);
 if (!response.canceled) {
 const config = getQuestConfig();
 const questIdsByType = await getQuestIdsByType();
 let message = "";
 let selectedTypes = [];

 switch (response.selection) {
 case 0:
 if (!config.mining) config.mining = {};
 if (config.mining) config.mining.cooldowns = {};
 message = "mining";
 selectedTypes = ["mining"];
 break;
 case 1:
 if (!config.combat) config.combat = {};
 if (config.combat) config.combat.cooldowns = {};
 message = "combat";
 selectedTypes = ["combat"];
 break;
 case 2:
 if (!config.farming) config.farming = {};
 if (config.farming) config.farming.cooldowns = {};
 message = "farming";
 selectedTypes = ["farming"];
 break;
 case 3:
 QUEST_TYPES.forEach(type => {
 if (!config[type]) config[type] = {};
 if (config[type]) config[type].cooldowns = {};
 });
 message = "all";
 selectedTypes = [...QUEST_TYPES];
 break;
 default:
 return;
 }

 const questsToReset = collectQuestIds(questIdsByType, selectedTypes);
 if (await saveQuestConfig(config)) {
 for (const p of world.getPlayers()) {
 questsToReset.forEach(questId => {
 clearQuestCooldownEntry(p, questId);
 });
 }
 player.sendMessage(`§a✔ Successfully reset ${message} quest cooldowns!`);
 world.sendMessage(`§6System: §e${message.charAt(0).toUpperCase() + message.slice(1)} quest cooldowns have been reset by an administrator.`);
 } else {
 player.sendMessage("§c⚠ Failed to reset cooldowns!");
 }
 }
 } catch (error) {
 console.warn("Error resetting cooldowns:", error);
 player.sendMessage("§c⚠ An error occurred while resetting cooldowns!");
 }
}
async function resetQuestRewards(player) {
 try {
 const confirmForm = new ActionFormData()
 .title("§cReset Quest Rewards")
 .body("§eSelect which quest type rewards to reset:")
 .button("Reset Mining Rewards\n§8Reset to default rewards", "textures/blocks/diamond_ore")
 .button("Reset Combat Rewards\n§8Reset to default rewards", "textures/items/diamond_sword")
 .button("Reset Farming Rewards\n§8Reset to default rewards", "textures/blocks/wheat_stage_7")
 .button("Reset ALL Rewards\n§8Reset all quest rewards", "textures/ui/refresh")
 .button("§cBack", "textures/ui/arrow_left");
 const response = await confirmForm.show(player);
 if (!response.canceled) {
 const config = getQuestConfig();
 const questIdsByType = await getQuestIdsByType();
 let message = "";
 let selectedTypes = [];
 const defaultRewards = {
 mining: { money: 1000, xp: 100, items: [] },
 combat: { money: 2000, xp: 100, items: [] },
 farming: { money: 1500, xp: 100, items: [] }
 };
 switch (response.selection) {
 case 0:
 if (!config.mining) config.mining = {};
 if (config.mining) config.mining.rewards = defaultRewards.mining;
 message = "mining";
 selectedTypes = ["mining"];
 break;
 case 1:
 if (!config.combat) config.combat = {};
 if (config.combat) config.combat.rewards = defaultRewards.combat;
 message = "combat";
 selectedTypes = ["combat"];
 break;
 case 2:
 if (!config.farming) config.farming = {};
 if (config.farming) config.farming.rewards = defaultRewards.farming;
 message = "farming";
 selectedTypes = ["farming"];
 break;
 case 3:
 QUEST_TYPES.forEach(type => {
 if (!config[type]) config[type] = {};
 if (config[type]) config[type].rewards = defaultRewards[type];
 });
 message = "all";
 selectedTypes = [...QUEST_TYPES];
 break;
 default:
 return;
 }

 const questsToReset = collectQuestIds(questIdsByType, selectedTypes);
 if (await saveQuestConfig(config)) {
 for (const p of world.getPlayers()) {
 questsToReset.forEach(questId => {
 p.setDynamicProperty(`${questId}_reward_claimed`, false);
 p.setDynamicProperty(`${questId}_reward_amount`, 0);
 p.setDynamicProperty(`${questId}_xp_reward`, 0);
 });
 }
 player.sendMessage(`§a✔ Successfully reset ${message} quest rewards!`);
 world.sendMessage(`§6System: §e${message.charAt(0).toUpperCase() + message.slice(1)} quest rewards have been reset by an administrator.`);
 } else {
 player.sendMessage("§c⚠ Failed to reset rewards!");
 }
 }
 } catch (error) {
 console.warn("Error resetting rewards:", error);
 player.sendMessage("§c⚠ An error occurred while resetting rewards!");
 }
}
async function resetQuestTargets(player) {
 try {
 const confirmForm = new ActionFormData()
 .title("§cReset Quest Targets")
 .body("§eSelect which quest type targets to reset:")
 .button("Reset Mining Targets\n§8Reset to default targets", "textures/blocks/diamond_ore")
 .button("Reset Combat Targets\n§8Reset to default targets", "textures/items/diamond_sword")
 .button("Reset Farming Targets\n§8Reset to default targets", "textures/blocks/wheat_stage_7")
 .button("Reset ALL Targets\n§8Reset all quest targets", "textures/ui/refresh")
 .button("§cBack", "textures/ui/arrow_left");
 const response = await confirmForm.show(player);
 if (!response.canceled) {
 const config = getQuestConfig();
 const questIdsByType = await getQuestIdsByType();
 let message = "";
 let selectedTypes = [];
 switch (response.selection) {
 case 0:
 if (!config.mining) config.mining = {};
 if (config.mining) config.mining.targets = {};
 message = "mining";
 selectedTypes = ["mining"];
 break;
 case 1:
 if (!config.combat) config.combat = {};
 if (config.combat) config.combat.targets = {};
 message = "combat";
 selectedTypes = ["combat"];
 break;
 case 2:
 if (!config.farming) config.farming = {};
 if (config.farming) config.farming.targets = {};
 message = "farming";
 selectedTypes = ["farming"];
 break;
 case 3:
 QUEST_TYPES.forEach(type => {
 if (!config[type]) config[type] = {};
 if (config[type]) config[type].targets = {};
 });
 message = "all";
 selectedTypes = [...QUEST_TYPES];
 break;
 default:
 return;
 }

 const questsToReset = collectQuestIds(questIdsByType, selectedTypes);
 if (await saveQuestConfig(config)) {
 for (const p of world.getPlayers()) {
 questsToReset.forEach(questId => {
 p.setDynamicProperty(`${questId}_progress`, 0);
 p.setDynamicProperty(`${questId}_target_completed`, false);
 p.setDynamicProperty(`${questId}_current_target`, 0);
 p.removeTag(`quest:${questId}`);
 try {
 p.runCommand(`scoreboard players reset @s quest_${questId}`);
 } catch { }
 });
 p.removeTag('adaquest');
 }
 player.sendMessage(`§a✔ Successfully reset ${message} quest targets!`);
 world.sendMessage(`§6System: §e${message.charAt(0).toUpperCase() + message.slice(1)} quest targets have been reset by an administrator.`);
 } else {
 player.sendMessage("§c⚠ Failed to reset targets!");
 }
 }
 } catch (error) {
 console.warn("Error resetting targets:", error);
 player.sendMessage("§c⚠ An error occurred while resetting targets!");
 }
}
async function showMiningQuestToggle(player) {
 const miningQuests = [
 { id: "diamond", name: "Diamond Mining", desc: "Toggle diamond mining quests" },
 { id: "iron", name: "Iron Mining", desc: "Toggle iron mining quests" },
 { id: "gold", name: "Gold Mining", desc: "Toggle gold mining quests" },
 { id: "emerald", name: "Emerald Mining", desc: "Toggle emerald mining quests" },
 { id: "coal", name: "Coal Mining", desc: "Toggle coal mining quests" }
 ];
 await showQuestToggle(player, "mining", miningQuests);
}
async function showFarmingQuestToggle(player) {
 const farmingQuests = [
 { id: "wheat", name: "Wheat Farmer", desc: "Toggle wheat farming quests" },
 { id: "potato", name: "Potato Farmer", desc: "Toggle potato farming quests" },
 { id: "carrot", name: "Carrot Farmer", desc: "Toggle carrot farming quests" },
 { id: "beetroot", name: "Beetroot Farmer", desc: "Toggle beetroot farming quests" }
 ];
 await showQuestToggle(player, "farming", farmingQuests);
}
async function showQuestTypeSelection(player) {
 try {
 const form = new ActionFormData()
 .title("§6Select Quest Type")
 .body("§eSelect quest type to edit:")
 .button("Combat Quests\n§8Edit combat quest settings", "textures/items/diamond_sword")
 .button("Mining Quests\n§8Edit mining quest settings", "textures/blocks/diamond_ore")
 .button("Farming Quests\n§8Edit farming quest settings", "textures/blocks/wheat_stage_7")
 .button("§cBack", "textures/ui/arrow_left");
 const response = await form.show(player);
 if (!response.canceled) {
 switch (response.selection) {
 case 0:
 await showCombatQuestList(player);
 break;
 case 1:
 await showMiningQuestList(player);
 break;
 case 2:
 await showFarmingQuestList(player);
 break;
 case 3:
 await showQuestSettingsMenu(player);
 break;
 }
 }
 } catch (error) {
 console.warn("Error in quest type selection:", error);
 player.sendMessage("§c⚠ An error occurred!");
 }
}
async function showQuestList(player, questType, questClass) {
 try {
 await loadQuestClasses();
 const QuestClass = questClass === "combat" ? CombatQuest : questClass === "mining" ? MiningQuest : FarmingQuest;
 QuestClass.updateQuestsFromConfig();
 const form = new ActionFormData()
 .title(`§6${questType.charAt(0).toUpperCase() + questType.slice(1)}`)
 .body("§eSelect a quest to edit:");
 const config = getQuestConfig();
 QuestClass.quests.forEach(quest => {
 const isEnabled = config[questClass]?.enabled?.[quest.id] !== false;
 const status = isEnabled ? "§a✓ Enabled" : "§c✗ Disabled";
 const reward = typeof quest.reward === 'object' ? quest.reward.money : quest.reward;
 form.button(`${quest.name}\n§8Target: ${quest.target} | Reward: $${reward || 0}\n${status}`, quest.icon);
 });
 form.button("§cBack", "textures/ui/arrow_left");
 const response = await form.show(player);
 if (!response.canceled) {
 if (response.selection < QuestClass.quests.length) {
 await showIndividualQuestEdit(player, questClass, QuestClass.quests[response.selection]);
 } else {
 await showQuestTypeSelection(player);
 }
 }
 } catch (error) {
 console.warn(`Error showing ${questType} quest list:`, error);
 player.sendMessage("§c⚠ An error occurred!");
 }
}
async function showCombatQuestList(player) {
 await showQuestList(player, "Combat Quests", "combat");
}
async function showMiningQuestList(player) {
 await showQuestList(player, "Mining Quests", "mining");
}
async function showFarmingQuestList(player) {
 await showQuestList(player, "Farming Quests", "farming");
}
async function showIndividualQuestEdit(player, questType, quest) {
 try {
 await loadQuestClasses();
 if (questType === 'combat') {
 CombatQuest.updateQuestsFromConfig();
 const updatedQuest = CombatQuest.quests.find(q => q.id === quest.id);
 if (updatedQuest) quest = updatedQuest;
 } else if (questType === 'mining') {
 MiningQuest.updateQuestsFromConfig();
 const updatedQuest = MiningQuest.quests.find(q => q.id === quest.id);
 if (updatedQuest) quest = updatedQuest;
 } else {
 FarmingQuest.updateQuestsFromConfig();
 const updatedQuest = FarmingQuest.quests.find(q => q.id === quest.id);
 if (updatedQuest) quest = updatedQuest;
 }
 const config = getQuestConfig();
 if (!config[questType]) config[questType] = {};
 const currentTarget = config[questType].targets?.[quest.id] || quest.target;
 const currentCooldown = config[questType].cooldowns?.[quest.id] || quest.cooldown;
 const rewardObject = typeof quest.reward === 'object' && quest.reward !== null ? quest.reward : {};
 const currentRewardMoney = config[questType].rewards?.individual?.[quest.id]?.money
 ?? config[questType].rewards?.money
 ?? rewardObject.money
 ?? (typeof quest.reward === 'number' ? quest.reward : 0);
 const currentRewardXP = config[questType].rewards?.individual?.[quest.id]?.xp
 ?? config[questType].rewards?.xp
 ?? rewardObject.xp
 ?? quest.xpReward
 ?? 100;
 const currentRewardItems = config[questType].rewards?.individual?.[quest.id]?.items
 ?? (Array.isArray(rewardObject.items) ? rewardObject.items : config[questType].rewards?.items)
 ?? [];
 const currentItemReward = getFirstItemReward(currentRewardItems);
 const isEnabled = config[questType].enabled?.[quest.id] !== false;
 const form = new ModalFormData()
 .title(`§6Edit ${quest.name}`)
 .toggle(`§eEnable Quest\n§6Quest is ${isEnabled ? 'enabled' : 'disabled'}`, { defaultValue: isEnabled })
 .slider(`§eTarget\n§6Current: ${currentTarget}`, 1, questType === 'combat' ? 50 : 200, {
 defaultValue: currentTarget,
 valueStep: 1,
 tooltip: `§6Set the target amount for ${quest.name}`
 })
 .textField(`§eMoney Reward\n§6Current: $${currentRewardMoney}`, "Enter amount", {
 defaultValue: currentRewardMoney.toString()
 })
 .slider(`§eXP Reward\n§6Current: ${currentRewardXP}`, 0, 500, {
 defaultValue: currentRewardXP,
 valueStep: 10,
 tooltip: `§6Set the XP reward for ${quest.name}`
 })
 .textField(
 `§eItem Reward ID (Optional)\n§6Current: ${currentItemReward.id || '-'}`,
 "minecraft:diamond or kiwora:token",
 { defaultValue: currentItemReward.id }
 )
 .textField(
 `§eItem Reward Count\n§6Current: ${currentItemReward.id ? currentItemReward.count : 'None'}`,
 "1",
 { defaultValue: currentItemReward.count }
 )
 .slider(`§eCooldown (Hours)\n§6Current: ${Math.floor(currentCooldown / 3600000)}h`, 1, 72, {
 defaultValue: Math.floor(currentCooldown / 3600000),
 valueStep: 1,
 tooltip: `§6Set cooldown in hours for ${quest.name}`
 });
 const response = await form.show(player);
 if (!response.canceled) {
 const [enabled, target, moneyRewardStr, xpReward, itemRewardId, itemRewardCount, cooldownHours] = response.formValues;
 const moneyReward = parseNonNegativeInt(moneyRewardStr, currentRewardMoney);
 const itemRewards = parseItemRewardInputs(itemRewardId, itemRewardCount);
 if (!config[questType].enabled) config[questType].enabled = {};
 if (!config[questType].targets) config[questType].targets = {};
 if (!config[questType].cooldowns) config[questType].cooldowns = {};
 if (!config[questType].rewards) config[questType].rewards = {};
 config[questType].enabled[quest.id] = enabled;
 config[questType].targets[quest.id] = target;
 config[questType].cooldowns[quest.id] = cooldownHours * 3600000;
 if (questType === 'combat') {
 if (!config[questType].rewards.individual) config[questType].rewards.individual = {};
 if (!config[questType].rewards.individual[quest.id]) {
 config[questType].rewards.individual[quest.id] = {};
 }
 config[questType].rewards.individual[quest.id].money = moneyReward;
 config[questType].rewards.individual[quest.id].xp = xpReward;
 config[questType].rewards.individual[quest.id].items = itemRewards;
 } else {
 if (!config[questType].rewards.individual) config[questType].rewards.individual = {};
 config[questType].rewards.individual[quest.id] = {
 money: moneyReward,
 xp: xpReward,
 items: itemRewards
 };
 }
 if (await saveQuestConfig(config)) {
 player.sendMessage(`§a✔ Successfully updated ${quest.name}!`);
 player.sendMessage(`§eSettings:`);
 player.sendMessage(`§7- Enabled: ${enabled ? '§aYes' : '§cNo'}`);
 player.sendMessage(`§7- Target: §e${target}`);
 player.sendMessage(`§7- Money Reward: §6$${moneyReward}`);
 player.sendMessage(`§7- XP Reward: §b${xpReward}`);
 player.sendMessage(`§7- Item Reward: ${formatItemRewardLine(itemRewards)}`);
 player.sendMessage(`§7- Cooldown: §e${cooldownHours} hours`);
 player.runCommand("playsound random.levelup @s");
 } else {
 player.sendMessage("§c⚠ Failed to save quest settings!");
 }
 }
 if (questType === 'combat') {
 await showCombatQuestList(player);
 } else if (questType === 'mining') {
 await showMiningQuestList(player);
 } else {
 await showFarmingQuestList(player);
 }
 } catch (error) {
 console.warn("Error editing individual quest:", error);
 player.sendMessage("§c⚠ An error occurred while editing quest!");
 }
}