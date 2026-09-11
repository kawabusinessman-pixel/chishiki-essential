import { system, world, ActionFormData, ModalFormData, EquipmentSlot } from "../core.js";
import { showMainMenu } from "../kiwora.js";
import { Bank } from "../plugins/bank/bank.js";
import { showClanMenu } from "../plugins/clan/clan.js";
import { Shop as ShopMenu } from "../menu_member/functions/shop/index.js";
import { ShowPlayerWarps } from "../plugins/player-warp/index.js";
import { getRTPConfig, random_tp } from "../plugins/random-teleport/index.js";
import { configureRandomTeleport } from "../menu_member/control_member/control.js";
import { showQuestAdminMenu } from "../quest_system/admin/quest_admin.js";
import { CombatQuest } from "../quest_system/quests/combat_quest.js";
import { FarmingQuest } from "../quest_system/quests/farming_quest.js";
import { MiningQuest } from "../quest_system/quests/mining_quest.js";
import { EditWarp, ShowAvailableWarps } from "../warp.js";
import { showInfoServerMenu, showInfoServerAdmin } from "../plugins/npc-system/info-server/info_server.js";
import { createNPCText, deleteRecord, findNpcRecord, getRecords, moveRecord, setRecordText, setTextOnly } from "../plugins/floating-text/registry.js";
import { GlobalConfig } from "../function/GlobalConfig.js";
import { Lang } from "../lib/Lang.js";

import { showXPShop, showXPShopAdmin } from "../plugins/npc-system/xp-shop/xp_shop.js";
import { showStarterKitMenu } from "../plugins/npc-system/starter-kit/starter.js";
import { showRepairKitMenu, showRepairKitAdmin } from "../plugins/npc-system/repair-kit/repair_kit.js";
import { showBountyMenu } from "../plugins/npc-system/bounty/bounty.js";
import { showTopUpRankMenu } from "../plugins/npc-system/top-up-rank/top-up-rank.js";
import { openBackpackMenu } from "../plugins/backpack/menu.js";
import { vote, showVoteAdminMenu } from "../plugins/npc-system/vote/index.js";
import { showRareShop, showRareShopAdmin } from "../plugins/npc-system/rare-shop/rare_shop.js";
import { showDailyRewardMenu as claimDailyReward, showDailyRewardAdminMenu } from "../plugins/npc-system/daily-reward/daily_reward.js";
import { showTeleportMenu, showTeleportAdminMenu } from "../plugins/npc-system/teleport/teleport.js";
import { showNPCShop, showNPCShopAdmin } from "../plugins/npc-system/npc-shop/npc_shop.js";
import { showRedeemCodeMenu, showRedeemCodeAdminMenu } from "../plugins/npc-system/redeem-code/redeem_code.js";
import { openJobsMenu } from "../plugins/jobs/jobs.js";
import { isMemberFeatureEnabled } from "../function/memberFeatureState.js";
import { getLobbyConfig, saveLobbyConfig, getRegionConfig, saveRegionConfig, isInProtectedRegion } from "./lobby_protect/config.js";
import { showDuelMenu } from "../plugins/pvp-arena/pvp_1vs1.js";
import { showSquadMenu } from "../plugins/pvp-arena/pvp_squad.js";
import { showFfaMenu } from "../plugins/pvp-arena/pvp_ffa.js";
import "../plugins/pvp-arena/index.js";
import { getNpcScheduleState, formatDuration, formatCompact, showNpcScheduleMenu } from "./npc_schedule.js";
const CUSTOM_COMMANDS_PROPERTY = "npc:custom_commands";
const NPC_POSITION_PROPERTY = "npc:position";
const FLOATING_TEXT_POSITION_PROPERTY = "sft:fixedPosition";
const MACE_RECOVERY_RADIUS = 12;
const FISHING_RECOVERY_RADIUS = 64;
const NPC_ACTIVE_RADIUS = 4;
const POSITION_SETTLE_TICKS = 5;
const pendingPositionRestores = new Set();

function isEntityUsable(entity) {
 try {
 return entity?.isValid === true;
 } catch {
 return false;
 }
}

function getEntityTypeId(entity) {
 try {
 return entity?.typeId || "";
 } catch {
 return "";
 }
}

function getEntityTagsSafe(entity) {
 if (!isEntityUsable(entity)) return [];
 try {
 return entity.getTags();
 } catch {
 return [];
 }
}

function entityHasTag(entity, tag) {
 if (!isEntityUsable(entity)) return false;
 try {
 return entity.hasTag(tag);
 } catch {
 return false;
 }
}

function getEntityLocationSafe(entity) {
 if (!isEntityUsable(entity)) return null;
 try {
 const { x, y, z } = entity.location;
 return { x, y, z };
 } catch {
 return null;
 }
}

function getEntityWorldSnapshot(entity) {
 if (!isEntityUsable(entity)) return null;
 try {
 const location = getEntityLocationSafe(entity);
 if (!location) return null;
 return { dimension: entity.dimension, location };
 } catch {
 return null;
 }
}

function queueFixedPositionRestore(entity) {
 try {
 if (!isEntityUsable(entity)) return;
 if (!entityHasTag(entity, "fixed_position")) return;
 const entityId = entity.id;
 if (pendingPositionRestores.has(entityId)) return;

 const positionProperty = getEntityTypeId(entity) === "add:floating_text"
 ? FLOATING_TEXT_POSITION_PROPERTY
 : NPC_POSITION_PROPERTY;
 const rawPosition = entity.getDynamicProperty(positionProperty);
 if (typeof rawPosition !== "string") return;
 const position = JSON.parse(rawPosition);
 if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) return;

 const restore = () => {
 if (!isEntityUsable(entity)) return;
 try { entity.clearVelocity(); } catch { }
 try { entity.teleport({ x: position.x, y: position.y, z: position.z }); } catch { }
 };

 pendingPositionRestores.add(entityId);
 system.run(() => {
 restore();
 system.runTimeout(() => {
 pendingPositionRestores.delete(entityId);
 restore();
 }, POSITION_SETTLE_TICKS);
 });
 } catch { }
}

function restoreFixedEntitiesNear(dimension, location, maxDistance) {
 try {
 for (const entity of dimension.getEntities({
 tags: ["fixed_position"],
 location,
 maxDistance
 })) {
 queueFixedPositionRestore(entity);
 }
 } catch { }
}

function isMaceAttack(entity) {
 if (!isEntityUsable(entity)) return false;
 try {
 return entity?.getComponent("minecraft:equippable")
 ?.getEquipment(EquipmentSlot.Mainhand)?.typeId === "minecraft:mace";
 } catch {
 return false;
 }
}

const SOUNDS = {
 error: { prefix: "§c", sound: "note.bass", pitch: 0.5 },
 warning: { prefix: "§e", sound: "random.pop", pitch: 0.7 },
 success: { prefix: "§a", sound: "random.levelup", pitch: 1.0 },
 info: { prefix: "§b", sound: "random.pop", pitch: 1.0 },
};
const showMsg = (player, type, msg) => {
 const { prefix, sound, pitch } = SOUNDS[type] || SOUNDS.info;
 player.sendMessage(`${prefix} ${msg}`);
 try { player.runCommand(`playsound ${sound} @s ~~~ 1 ${pitch}`); } catch { }
};

function getCustomNPCCommands(npc) {
 try {
 const raw = npc.getDynamicProperty(CUSTOM_COMMANDS_PROPERTY);
 const commands = raw ? JSON.parse(raw) : [];
 return Array.isArray(commands) ? commands.filter(command => typeof command === "string" && command.trim()) : [];
 } catch {
 return [];
 }
}

function runCustomCommandNPC(player, npc) {
 const commands = getCustomNPCCommands(npc);
 if (!commands.length) {
 player.sendMessage("§cThis Custom Command NPC has no commands configured.");
 return;
 }
 for (const savedCommand of commands) {
 try {
 const command = savedCommand.trim().replace(/^\//, "");
 if (command) player.runCommand(command);
 } catch (error) {
 console.warn("[NPC] Custom command failed:", error);
 }
 }
}

async function configureCustomCommandNPC(player, npc) {
 const commands = getCustomNPCCommands(npc);
 const form = new ActionFormData().simpleUi()
 .title("Custom Command NPC")
 .body(`§7Configured commands: §f${commands.length}/20\n§8Use @s for the player who clicks this NPC.`)
 .button("Add Command", "textures/ui/color_plus")
 .button("Remove Command", "textures/ui/trash_default")
 .button("Clear All Commands", "textures/ui/refresh_light")
 .button("Close", "textures/ui/cancel");
 const response = await form.show(player);
 if (response.canceled) return;
 if (response.selection === 0) return addCustomNPCCommand(player, npc);
 if (response.selection === 1) return removeCustomNPCCommand(player, npc);
 if (response.selection === 2) return clearCustomNPCCommands(player, npc);
}

function saveCustomNPCCommands(npc, commands) {
 try {
 npc.setDynamicProperty(CUSTOM_COMMANDS_PROPERTY, JSON.stringify(commands));
 return true;
 } catch (error) {
 console.warn("[NPC] Failed to save custom commands:", error);
 return false;
 }
}

async function addCustomNPCCommand(player, npc) {
 const commands = getCustomNPCCommands(npc);
 if (commands.length >= 20) {
 player.sendMessage("§cThis NPC already has the maximum of 20 commands.");
 return;
 }
 const form = new ModalFormData()
 .title("Add NPC Command")
 .textField("Command. Use @s for the player who clicks this NPC.", "give @s diamond 1");
 const response = await form.show(player);
 if (response.canceled) return configureCustomCommandNPC(player, npc);
 const command = String(response.formValues[0] || "").trim().replace(/^\//, "");
 if (!command) {
 player.sendMessage("§cCommand cannot be empty.");
 return configureCustomCommandNPC(player, npc);
 }
 commands.push(command);
 if (saveCustomNPCCommands(npc, commands)) player.sendMessage("§aCommand added.");
 else player.sendMessage("§cCould not save this command.");
 return configureCustomCommandNPC(player, npc);
}

async function removeCustomNPCCommand(player, npc) {
 const commands = getCustomNPCCommands(npc);
 if (!commands.length) {
 player.sendMessage("§eThis NPC has no commands to remove.");
 return configureCustomCommandNPC(player, npc);
 }
 const form = new ActionFormData().simpleUi()
 .title("Remove NPC Command")
 .body("§7Choose a command to remove.");
 commands.forEach(command => form.button(command, "textures/ui/trash_default"));
 form.button("Back", "textures/ui/arrow_left");
 const response = await form.show(player);
 if (response.canceled || response.selection >= commands.length) return configureCustomCommandNPC(player, npc);
 commands.splice(response.selection, 1);
 if (saveCustomNPCCommands(npc, commands)) player.sendMessage("§aCommand removed.");
 else player.sendMessage("§cCould not remove this command.");
 return configureCustomCommandNPC(player, npc);
}

async function clearCustomNPCCommands(player, npc) {
 const form = new ActionFormData().simpleUi()
 .title("Clear NPC Commands")
 .body("§cRemove every command from this NPC?")
 .button("§cClear All", "textures/ui/trash_default")
 .button("Cancel", "textures/ui/cancel");
 const response = await form.show(player);
 if (!response.canceled && response.selection === 0) {
 if (saveCustomNPCCommands(npc, [])) player.sendMessage("§aAll commands removed.");
 else player.sendMessage("§cCould not clear commands.");
 }
 return configureCustomCommandNPC(player, npc);
}

const hasVipAccess = (player) => {
 return true;
};
const NPC_TYPES = [
 { name: "Shop NPC", icon: "textures/ui/trade_icon", npcName: "§eMerchant", desc: "Buy and sell items", fn: ShopMenu, feature: "shop" },
 { name: "Daily Reward NPC", icon: "textures/ui/achievements", npcName: "§dDaily Reward", desc: "Claim your daily reward", fn: claimDailyReward, admin: showDailyRewardAdminMenu },
 { name: "Quest NPC", icon: "textures/items/book_enchanted", npcName: "§6Quest", desc: "Daily missions & challenges", fn: showQuestMenu, admin: showQuestAdminMenu },
 { name: "Job NPC", icon: "textures/items/diamond_pickaxe", npcName: "§6Job", desc: "Choose jobs and earn rewards", fn: openJobsMenu, feature: "job" },
 { name: "Bank NPC", icon: "textures/ui/MCoin", npcName: "§6Bank", desc: "Manage your finances", fn: Bank, feature: "bank" },
 { name: "Redeem Code NPC", icon: "textures/icon_custom/reedemcode", npcName: "Redeem Code", desc: "Redeem a gift code", fn: showRedeemCodeMenu, admin: showRedeemCodeAdminMenu },
 { name: "Vote NPC", icon: "textures/ui/icon_deals", npcName: "§dVote", desc: "Vote for the server", fn: vote, admin: showVoteAdminMenu },
 { name: "Clan NPC", icon: "textures/items/bordure_indented_banner_pattern", npcName: "§bClan", desc: "Clan management", fn: showClanMenu, feature: "clan" },
 { name: "Warp NPC", icon: "textures/ui/csb_faq_parrot", npcName: "§aWarp", desc: "Teleport to a location", fn: ShowAvailableWarps, admin: EditWarp, feature: "warp" },
 { name: "Backpack NPC", icon: "textures/ui/inventory_icon", npcName: "§dBackpack", desc: "Access extra storage", fn: openBackpackMenu, feature: "backpack" },
 { name: "Info Server NPC", legacyNames: ["Rules NPC"], icon: "textures/items/book_writable", npcName: "§6Info Server", desc: "Staff, rules & member guide", fn: showInfoServerMenu, admin: showInfoServerAdmin },
 { name: "Random Teleport NPC", icon: "textures/ui/dressing_room_capes", npcName: "§aRandom Teleport", desc: "Teleport to a random location", fn: random_tp, admin: editRandomTeleportSettings, feature: "randomTeleport" },
 { name: "Player Warp NPC", icon: "textures/ui/icon_recipe_construction", npcName: "§aPlayer Warp", desc: "Player-created warps", fn: ShowPlayerWarps, feature: "pwarp" },

 { name: "XP Shop NPC", icon: "textures/items/experience_bottle", npcName: "§6XP Shop", desc: "Buy and sell XP", fn: showXPShop, admin: showXPShopAdmin },
 { name: "Starter Kit NPC", icon: "textures/ui/gift_square", npcName: "§bStarter Kit", desc: "Claim your starter kit", fn: showStarterKitMenu },
 { name: "Repair Kit NPC", icon: "textures/blocks/anvil_top_damaged_0", npcName: "§eRepair Kit", desc: "Repair item durability", fn: showRepairKitMenu, admin: showRepairKitAdmin },
 { name: "Bounty NPC", icon: "textures/ui/regeneration_effect", npcName: "§cBounty", desc: "Set and claim bounties", fn: showBountyMenu },
  { name: "Rank Store NPC", legacyNames: ["Top Up Rank NPC"], legacyFullNames: ["§eTop Up Rank\n§7Buy a premium rank\n§8[Click Here]"], icon: "textures/ui/MCoin", npcName: "§eRank Store", desc: "Unlock and switch ranks", fn: showTopUpRankMenu },
 { name: "Rare Shop NPC", icon: "textures/items/nether_star", npcName: "§bRare Shop", desc: "Buy exclusive items", fn: showRareShop, admin: showRareShopAdmin },
  { name: "Teleport NPC", icon: "textures/ui/dressing_room_capes", npcName: "§aTeleport", desc: "Teleport to a location", fn: (p, n) => showTeleportMenu(p, n), admin: (p, n) => showTeleportAdminMenu(p, n), feature: "teleport" },
  { name: "Custom Shop NPC", icon: "textures/ui/trade_icon", npcName: "§eCustom Shop", desc: "Customizable shop system", fn: showNPCShop, admin: showNPCShopAdmin },
 { name: "Custom Command NPC", icon: "textures/blocks/command_block", npcName: "Custom Command NPC", desc: "Run configured commands", fn: runCustomCommandNPC, admin: configureCustomCommandNPC },
 { name: "PVP 1vs1 NPC", icon: "textures/items/diamond_sword", npcName: "§cPVP §f1vs1", desc: "Duel 1vs1 challenge a friend", fn: showDuelMenu },
 { name: "PVP Squad NPC", icon: "textures/items/bordure_indented_banner_pattern", npcName: "§bSquad §fPVP", desc: "Squad vs Squad clan battle", fn: showSquadMenu },
 { name: "PVP Brutal NPC", icon: "textures/items/nether_star", npcName: "§4War §fBrutal", desc: "FFA last man standing", fn: showFfaMenu },
 ].map(n => ({ ...n, fullName: `${n.npcName}\n§7${n.desc}\n§8[Click Here]` }));
function canUseNPCFeature(player, npc) {
 if (!npc?.feature || isMemberFeatureEnabled(npc.feature)) return true;
 showMsg(player, "warning", `${npc.name} is currently disabled in Member Feature Toggle.`);
 return false;
}
async function showUniversalNPCCustomization(player, npc, npcEntity) {
 if (!isEntityUsable(player) || !isEntityUsable(npcEntity)) return;
 const currentTypeId = getEntityTypeId(npcEntity);
 const entitySnapshot = getEntityWorldSnapshot(npcEntity);
 if (!entitySnapshot) return;
 const isKiwoNPC = currentTypeId === "kiwo:npc";
 const isVanillaNPC = currentTypeId === "minecraft:npc";
 const entityInfo = isKiwoNPC
 ? "§dCustom 3D (kiwo:npc + linked model)"
 : isVanillaNPC
 ? "§aVanilla (minecraft:npc)"
 : `§dCustom 3D (${currentTypeId || "unknown"})`;
 const entityId = npcEntity.id;
 const entityType = currentTypeId;
 const entityDimension = entitySnapshot.dimension.id;
 const entityLocation = entitySnapshot.location;
 const btns = [
 { text: `Use ${npc.name}\n§8Test functionality`, icon: npc.icon, actionType: "use" },
 ...(npc.admin ? [{ text: "Admin Settings\n§8Configure settings", icon: "textures/ui/gear", actionType: "admin" }] : []),
 { text: Lang.t(player, "npc.schedule.btn"), icon: "textures/items/clock_item", actionType: "schedule" },
 ...(isVanillaNPC ? [{ text: "Customize Vanilla Appearance\n§8Built-in skins & name", icon: "textures/ui/dressing_room_skins", actionType: "customize" }] : []),
 ...(isKiwoNPC ? [{ text: "Change 3D Model\n§8Keep NPC data & settings", icon: "textures/ui/dressing_room_capes", actionType: "change_model" }] : []),
 { text: "§cRemove NPC", icon: "textures/ui/trash_default", actionType: "remove" },
 { text: "§cClose", icon: "textures/ui/cancel", actionType: "close" }
 ];
 const form = new ActionFormData().simpleUi()
 .title(`${npc.name} Options`)
 .body(`§eWhat would you like to do with this ${npc.name}?\n\n§7Entity Type: ${entityInfo}`);
 btns.forEach(b => form.button(b.text, b.icon));
 const res = await form.show(player);
 if (res.canceled) return;
 if (!isEntityUsable(player)) return;
 const selectedAction = btns[res.selection]?.actionType;
 if (!selectedAction) return;
 switch (selectedAction) {
 case "use":
 if (isEntityUsable(npcEntity) && canUseNPCFeature(player, npc)) npc.fn(player, npcEntity);
 break;
 case "admin":
 if (isEntityUsable(npcEntity)) npc.admin(player, npcEntity);
 break;
 case "schedule":
 if (isEntityUsable(npcEntity)) showNpcScheduleMenu(player, npcEntity);
 break;
 case "customize":
 try { player.runCommand(`dialogue open @e[type=npc,c=1,r=5] @s`); } catch { }
 break;
 case "change_model":
 if (isEntityUsable(npcEntity)) showModelSelectionMenu(player, npc, npcEntity);
 break;
 case "remove":
 removeNPCById(player, entityId, entityType, entityDimension, entityLocation);
 break;
 }
}
function removeNPCById(player, entityId, entityType, dimensionId, location) {
 try {
 if (!entityId || !entityType || !dimensionId) {
 showMsg(player, "error", "NPC data not found!");
 return;
 }
 const dim = world.getDimension(dimensionId);
 if (!dim) {
 showMsg(player, "error", "Dimension not found!");
 return;
 }
 const searchOptions = {
 type: entityType,
 location: location || player.location,
 maxDistance: 10,
 tags: ["fixed_position"]
 };
 const entities = dim.getEntities(searchOptions);
 let npcEntity = entities.find(e => e.id === entityId && isEntityUsable(e));
 if (!npcEntity) {
 npcEntity = entities.find(isEntityUsable);
 }
 if (!npcEntity) {
 showMsg(player, "error", "NPC not found! It may have been removed already.");
 return;
 }
 removeNPCEntity(player, npcEntity);
 } catch (e) {
 console.warn("[NPC] Remove by ID error:", e);
 showMsg(player, "error", "Failed to find NPC!");
 }
}
function cleanupNPCAttachments(dimension, npcId, location) {
 if (!dimension || !location) return;
 for (const record of getRecords()) {
  if (record.type !== "npc" || record.dim !== dimension.id) continue;
  const isLinked = npcId && record.npcId === npcId;
  const isNear = Math.abs(record.x - location.x) <= 1.25
   && Math.abs(record.y - (location.y + 3)) <= 3.5
   && Math.abs(record.z - location.z) <= 1.25;
  if (isLinked || isNear) deleteRecord(record.id);
 }
 if (!npcId) return;
 const modelEntities = dimension.getEntities({ tags: [`model_id:${npcId}`] });
 modelEntities.forEach(model => { try { model.remove(); } catch { } });
}
function removeNPCEntity(player, npcEntity) {
 try {
 if (!npcEntity) {
 showMsg(player, "error", "NPC entity is null!");
 return;
 }
 if (!isEntityUsable(npcEntity)) {
 showMsg(player, "error", "NPC is no longer valid!");
 return;
 }
 const tags = getEntityTagsSafe(npcEntity);
 const npcIdTag = tags.find(t => t.startsWith("npc_id:"));
 const npcId = npcIdTag?.replace("npc_id:", "") || null;
 const npcType = NPC_TYPES.find(type => tags.includes(type.name));
 const npcLocation = { ...npcEntity.location };
 const npcDimension = npcEntity.dimension;

 cleanupNPCAttachments(npcDimension, npcId, npcLocation, npcType?.name);
 npcEntity.remove();
 system.runTimeout(() => cleanupNPCAttachments(npcDimension, npcId, npcLocation, npcType?.name), 1);
 showMsg(player, "success", "NPC removed successfully!");
 } catch (e) {
 console.warn("[NPC] Remove error:", e);
 showMsg(player, "error", "Failed to remove NPC: " + e.message);
 }
}
async function editRandomTeleportSettings(player) {
 try {
 await new Promise(resolve => system.runTimeout(resolve, 2));
 configureRandomTeleport(player);
 } catch (e) {
 console.warn("[RTP Settings] Error:", e);
 showMsg(player, "error", "Unable to open Random Teleport settings.");
 }
}
function showQuestMenu(player) {
 const quests = [MiningQuest, CombatQuest, FarmingQuest];
 new ActionFormData().simpleUi()
 .title("Quest Menu")
 .body("§eSelect a quest type:")
 .button("Mining Quests\n§8Mine ores and minerals", "textures/blocks/emerald_ore")
 .button("Combat Quests\n§8Defeat monsters", "textures/ui/sword")
 .button("Farming Quests\n§8Harvest crops", "textures/blocks/beetroots_stage_3")
 .button("§cExit", "textures/ui/redX1")
 .show(player)
 .then(res => !res.canceled && res.selection < 3 && quests[res.selection].showMenu(player));
}
const setupNPCEntity = (npc, selected) => {
 if (!isEntityUsable(npc)) return;
 npc.nameTag = "§r";
 npc.addTag(selected.name);
 npc.addTag("fixed_position");
 npc.addTag("from_menu");
 let idTag = getEntityTagsSafe(npc).find(t => t.startsWith("npc_id:"));
 let id;
 if (idTag) {
 id = idTag.replace("npc_id:", "");
 } else {
 id = Math.floor(Math.random() * 1e9).toString();
 npc.addTag("npc_id:" + id);
 }
 const pos = npc.location;
 const rot = npc.getRotation();
 const npcDimension = npc.dimension;
 npc.setDynamicProperty("npc:position", JSON.stringify({ ...pos, ry: rot.y }));
 system.runTimeout(() => {
 try {
 createNPCText(npcDimension, { x: pos.x, y: pos.y + 3, z: pos.z }, selected.fullName, id);
 } catch (e) { console.warn("[NPC] Text error:", e); }
 }, 5);
};
const NPC_ENTITY_TYPES = ["minecraft:npc", "kiwo:npc"];
const NPC_DIMENSION_IDS = ["overworld", "nether", "the_end"];
const isCustomEggNPC = entity => {
 const typeId = getEntityTypeId(entity);
 return typeId.startsWith("enchanted:") || typeId.startsWith("sr:");
};
const NPC_TYPE_BY_TAG = new Map();
for (const type of NPC_TYPES) {
 NPC_TYPE_BY_TAG.set(type.name, type);
 for (const legacyName of type.legacyNames || []) {
  NPC_TYPE_BY_TAG.set(legacyName, type);
 }
}
const getNPCTypeFromTags = tags => {
 for (const tag of tags) {
 const npcType = NPC_TYPE_BY_TAG.get(tag);
 if (npcType) return npcType;
 }
 return undefined;
};
const isConfiguredNPC = entity => {
 const tags = getEntityTagsSafe(entity);
 return tags.includes("from_menu") || !!getNPCTypeFromTags(tags);
};
function getNPCInteractionTarget(entity) {
 if (!isEntityUsable(entity)) return undefined;
 const tags = getEntityTagsSafe(entity);
 if (!isEntityUsable(entity)) return undefined;
 if (!tags.includes("npc_model")) return entity;
 const modelId = tags.find(tag => tag.startsWith("model_id:"));
 if (!modelId) return entity;
 try {
 const linkedNPC = entity.dimension
 .getEntities({ tags: [`npc_id:${modelId.replace("model_id:", "")}`] })
 .find(isEntityUsable);
 return linkedNPC || (isEntityUsable(entity) ? entity : undefined);
 } catch {
 return isEntityUsable(entity) ? entity : undefined;
 }
}
function resetNPCSystem(player) {
 let count = 0;
 NPC_DIMENSION_IDS.forEach(dimName => {
 const dim = world.getDimension(dimName);
 if (!dim) return;
 NPC_ENTITY_TYPES.forEach(entityType => {
 dim.getEntities({ type: entityType, tags: ["fixed_position"] }).forEach(n => {
 if (!isEntityUsable(n)) return;
 try { n.remove(); count++; } catch { }
 });
 });
 dim.getEntities({ tags: ["fixed_position"] })
 .filter(entity => isCustomEggNPC(entity) && !entityHasTag(entity, "npc_model"))
 .forEach(entity => { try { entity.remove(); count++; } catch { } });
 dim.getEntities({ tags: ["npc_model"] }).forEach(m => { try { m.remove(); count++; } catch { } });
 getRecords().filter(record => record.type === "npc" && record.dim === dim.id).forEach(record => { deleteRecord(record.id); count++; });
 });
 showMsg(player, "success", `Removed ${count} system entities (NPCs + Models + Text).`);
}
function showMaintenanceMenu(player) {
 new ActionFormData().simpleUi()
 .title("NPC Maintenance")
 .body("§7Options to clean up or reset the NPC system.")
 .button("§cClean All NPCs & Texts", "textures/ui/trash_default")
 .button("Back", "textures/ui/arrow_left")
 .show(player)
 .then(res => !res.canceled && (res.selection === 0 ? resetNPCSystem(player) : npc_system(player)));
}
async function showNPCTypeMenu(player, selected) {
 const canUseCustomModel = hasVipAccess(player);
 const form = new ActionFormData().simpleUi()
 .title(selected.name)
 .body(Lang.t(player, "npc.appearance.body"))
 .button(Lang.t(player, "npc.appearance.normal"), "textures/ui/icon_steve")
 .button(
 Lang.t(player, canUseCustomModel ? "npc.appearance.custom" : "npc.appearance.custom.vip_locked"),
 "textures/ui/dressing_room_skins",
 )
 .button(Lang.t(player, "npc.appearance.cancel"), "textures/ui/cancel");
 const res = await form.show(player);
 if (res.canceled || res.selection === 2) return;
 if (res.selection === 0) {
 spawnNPCWithType(player, selected, false, null);
 } else {
 if (!canUseCustomModel) {
 showMsg(player, "warning", Lang.t(player, "npc.custom.vip_only"));
 return showNPCTypeMenu(player, selected);
 }
 showModelSelectionMenu(player, selected);
 }
}
async function configureCustomEggNPC(player, npcEntity) {
 if (!isEntityUsable(player) || !isEntityUsable(npcEntity)) return;
 const form = new ActionFormData().simpleUi()
 .title("Configure Custom NPC")
 .body(`§7${getEntityTypeId(npcEntity)}\n§eSelect this NPC's function.`);
 NPC_TYPES.forEach(npc => form.button(`${npc.name}\n§8${npc.desc}`, npc.icon));
 form.button("Cancel", "textures/ui/cancel");
 const response = await form.show(player);
 if (response.canceled || response.selection >= NPC_TYPES.length) return;
 const selected = NPC_TYPES[response.selection];
 try {
 if (!isEntityUsable(npcEntity)) {
 showMsg(player, "error", "This NPC is no longer available.");
 return;
 }
 setupNPCEntity(npcEntity, selected);
 ensureCustomNPCProtected(npcEntity);
 showMsg(player, "success", `${getEntityTypeId(npcEntity)} configured as ${selected.name}.`);
 } catch (error) {
 console.warn("[NPC] Custom egg configuration failed:", error);
 showMsg(player, "error", "Could not configure this custom NPC.");
 }
}
function ensureNPCTypeProtected(typeId, location, dimensionId) {
 const lobbyConfig = getLobbyConfig();
 if (!lobbyConfig.excludedEntities?.includes(typeId)) {
 lobbyConfig.excludedEntities = [...(lobbyConfig.excludedEntities || []), typeId];
 saveLobbyConfig(lobbyConfig);
 }
 const region = isInProtectedRegion(location, dimensionId);
 if (!region) return;
 const regionConfig = getRegionConfig(region.id);
 if (!regionConfig.excludedEntities?.includes(typeId)) {
 regionConfig.excludedEntities = [...(regionConfig.excludedEntities || []), typeId];
 saveRegionConfig(region.id, regionConfig);
 }
}
function ensureCustomNPCProtected(npcEntity) {
 ensureNPCTypeProtected(npcEntity.typeId, npcEntity.location, npcEntity.dimension.id);
}
const NPC_CUSTOM_MODELS = [
 { id: "adventurer", entityType: "sr:adventurer", name: "Adventurer", icon: "textures/items/compass_item" },
 { id: "archer", entityType: "sr:archer", name: "Archer", icon: "textures/items/bow_standby" },
 { id: "badut", entityType: "sr:badut", name: "Badut", icon: "textures/items/dye_powder_magenta" },
 { id: "backpack", entityType: "sr:backpack", name: "Backpack", icon: "textures/items/bundle" },
 { id: "bard", entityType: "sr:bard", name: "Bard", icon: "textures/items/record_13" },
 { id: "blacksmith", entityType: "sr:blacksmith", name: "Blacksmith", icon: "textures/items/iron_ingot" },
 { id: "butcher", entityType: "sr:butcher", name: "Butcher", icon: "textures/items/beef_raw" },
 { id: "farmer", entityType: "sr:farmer", name: "Farmer", icon: "textures/items/wheat" },
 { id: "guard", entityType: "sr:guard", name: "Guard", icon: "textures/items/iron_sword" },
 { id: "king", entityType: "sr:king", name: "King", icon: "textures/items/gold_ingot" },
 { id: "klause", entityType: "sr:klause", name: "Klause", icon: "textures/items/emerald" },
 { id: "lumberjack", entityType: "sr:lumberjack", name: "Lumberjack", icon: "textures/items/iron_axe" },
 { id: "miners", entityType: "sr:miners", name: "Miners", icon: "textures/items/iron_pickaxe" },
 { id: "pirate", entityType: "sr:pirate", name: "Pirate", icon: "textures/items/compass_item" },
 { id: "pvp", entityType: "sr:pvp", name: "PvP", icon: "textures/items/diamond_sword" },
 { id: "queen", entityType: "sr:queen", name: "Queen", icon: "textures/items/diamond" },
 { id: "soldier", entityType: "sr:soldier", name: "Soldier", icon: "textures/items/iron_sword" },
 { id: "tavern", entityType: "sr:tavern", name: "Tavern", icon: "textures/items/potion_bottle_drinkable" },
 { id: "npc_merchant_general", name: "Merchant General", icon: "textures/ui/trade_icon" },
 { id: "npc_merchant_blacksmith", name: "Blacksmith", icon: "textures/ui/anvil_icon" },
 { id: "npc_merchant_farming", name: "Farmer Merchant", icon: "textures/blocks/wheat_stage_7" },
 { id: "npc_merchant_mining", name: "Miner Merchant", icon: "textures/blocks/iron_ore" },
 { id: "npc_merchant_food", name: "Food Merchant", icon: "textures/items/apple" },
 { id: "npc_merchant_enchant", name: "Enchant Merchant", icon: "textures/items/book_enchanted" },
 { id: "npc_merchant_grinding", name: "Grinding Merchant", icon: "textures/items/diamond" },
 { id: "npc_merchant_shady", name: "Shady Merchant", icon: "textures/items/diamond" },
 { id: "npc_farmer_male", name: "Farmer (Male)", icon: "textures/items/wheat" },
 { id: "npc_farmer_female", name: "Farmer (Female)", icon: "textures/items/carrot" },
 { id: "npc_miner_male", name: "Miner (Male)", icon: "textures/items/iron_pickaxe" },
 { id: "npc_miner_female", name: "Miner (Female)", icon: "textures/items/diamond_pickaxe" },
 { id: "npc_warrior_male", name: "Warrior (Male)", icon: "textures/items/iron_sword" },
 { id: "npc_warrior_female", name: "Warrior (Female)", icon: "textures/items/diamond_sword" },
 { id: "npc_archer", name: "Archer", icon: "textures/items/bow_standby" },
 { id: "npc_swordsman", name: "Swordsman", icon: "textures/ui/sword" },
 { id: "npc_lumberjack", name: "Lumberjack", icon: "textures/items/iron_axe" },
 { id: "npc_martial_artist", name: "Martial Artist", icon: "textures/ui/strength_effect" },
 { id: "npc_mage_general", name: "Mage General", icon: "textures/items/blaze_rod" },
 { id: "npc_mage_combat", name: "Combat Mage", icon: "textures/ui/strength_effect" },
 { id: "npc_mage_farming", name: "Farming Mage", icon: "textures/blocks/wheat_stage_7" },
 { id: "npc_mage_mining", name: "Mining Mage", icon: "textures/blocks/diamond_ore" },
 { id: "npc_mage_skyblock", name: "Skyblock Mage", icon: "textures/ui/dressing_room_capes" },
 { id: "npc_old_mage", name: "Old Mage", icon: "textures/items/book_enchanted" },
 { id: "npc_tamer_regular", name: "Tamer Regular", icon: "textures/items/lead" },
 { id: "npc_tamer_combat", name: "Combat Tamer", icon: "textures/items/iron_sword" },
 { id: "npc_tamer_farming", name: "Farming Tamer", icon: "textures/items/wheat" },
 { id: "npc_tamer_mining", name: "Mining Tamer", icon: "textures/items/iron_pickaxe" },
 { id: "npc_fancy_man", name: "Fancy Man", icon: "textures/ui/icon_alex" },
 { id: "npc_fancy_lady", name: "Fancy Lady", icon: "textures/ui/dressing_room_skins" },
 { id: "npc_pretty_lady", name: "Pretty Lady", icon: "textures/ui/dressing_room_skins" },
 { id: "npc_blond_guy", name: "Blond Guy", icon: "textures/ui/icon_steve" },
 { id: "npc_architect", name: "Architect", icon: "textures/ui/icon_recipe_construction" },
 { id: "npc_seer", name: "Seer", icon: "textures/items/ender_eye" },
 { id: "npc_death", name: "Death", icon: "textures/items/bone" },
 { id: "npc_evil_overlord", name: "Evil Overlord", icon: "textures/items/blaze_rod" },
 { id: "npc_wacky_salesman", name: "Wacky Salesman", icon: "textures/ui/icon_deals" },
 { id: "npc_baby_phoenix", name: "Baby Phoenix", icon: "textures/items/blaze_powder" },
 { id: "npc_skyblock_phoenix", name: "Skyblock Phoenix", icon: "textures/items/magma_cream" },
 { id: "npc_whale_balloon", name: "Whale Balloon", icon: "textures/ui/dressing_room_capes" },
];
const getCustomModelType = model => model.entityType || `enchanted:${model.id}`;
function getNPCLinkId(npcEntity) {
 return getEntityTagsSafe(npcEntity).find(tag => tag.startsWith("npc_id:"))?.replace("npc_id:", "") || null;
}
function getLinkedNPCModels(npcEntity) {
 const npcId = getNPCLinkId(npcEntity);
 if (!npcId || !isEntityUsable(npcEntity)) return [];
 try {
 return npcEntity.dimension.getEntities({ tags: [`model_id:${npcId}`] });
 } catch {
 return [];
 }
}
function configureLinkedNPCModel(modelEntity, npcEntity) {
 const npcId = getNPCLinkId(npcEntity);
 if (!npcId) throw new Error("NPC link ID is missing");
 const location = { ...npcEntity.location };
 const rotation = npcEntity.getRotation();
 modelEntity.addTag(`model_id:${npcId}`);
 modelEntity.addTag("npc_model");
 modelEntity.addTag("fixed_position");
 modelEntity.setRotation(rotation);
 modelEntity.setDynamicProperty("npc:position", JSON.stringify({ ...location, ry: rotation.y }));
 npcEntity.setDynamicProperty("npc:model_type", modelEntity.typeId);
}
function replaceLinkedNPCModel(player, npcEntity, selectedModel) {
 if (!isEntityUsable(npcEntity) || npcEntity.typeId !== "kiwo:npc") {
 showMsg(player, "error", Lang.t(player, "npc.model.change.error"));
 return;
 }
 const modelType = getCustomModelType(selectedModel);
 const oldModels = getLinkedNPCModels(npcEntity);
 if (oldModels.length === 1 && oldModels[0].typeId === modelType) {
 npcEntity.setDynamicProperty("npc:model_type", modelType);
 showMsg(player, "info", Lang.t(player, "npc.model.change.same", selectedModel.name));
 return;
 }
 let newModel;
 try {
 const location = { ...npcEntity.location };
 ensureNPCTypeProtected(modelType, location, npcEntity.dimension.id);
 newModel = npcEntity.dimension.spawnEntity(modelType, location);
 configureLinkedNPCModel(newModel, npcEntity);
 oldModels.forEach(model => {
 if (isEntityUsable(model)) {
 try { model.remove(); } catch { }
 }
 });
 showMsg(player, "success", Lang.t(player, "npc.model.change.success", selectedModel.name));
 } catch (error) {
 if (isEntityUsable(newModel)) {
 try { newModel.remove(); } catch { }
 }
 console.warn("[NPC] Model replacement failed:", error);
 showMsg(player, "error", Lang.t(player, "npc.model.change.error"));
 }
}
async function showModelSelectionMenu(player, selected, existingNPC = null) {
 if (!hasVipAccess(player)) {
 showMsg(player, "warning", Lang.t(player, "npc.custom.vip_only"));
 return showNPCTypeMenu(player, selected);
 }
 const isChangingModel = isEntityUsable(existingNPC) && existingNPC.typeId === "kiwo:npc";
 const currentModelType = isChangingModel
 ? existingNPC.getDynamicProperty("npc:model_type") || getLinkedNPCModels(existingNPC)[0]?.typeId
 : null;
 const currentModel = NPC_CUSTOM_MODELS.find(model => getCustomModelType(model) === currentModelType);
 const form = new ActionFormData().simpleUi()
 .title(`${Lang.t(player, isChangingModel ? "npc.model.change.title" : "npc.model.title")} (${NPC_CUSTOM_MODELS.length})`)
 .body(isChangingModel
 ? Lang.t(player, "npc.model.change.body", currentModel?.name || currentModelType || "Unknown")
 : Lang.t(player, "npc.model.body", selected.name));
 NPC_CUSTOM_MODELS.forEach(model => {
 const modelType = getCustomModelType(model);
 const isCurrent = modelType === currentModelType;
 form.button(`${isCurrent ? "§a" : "§f"}${model.name}\n${isCurrent ? "§aCurrent model" : `§8${modelType}`}`, model.icon);
 });
 form.button(Lang.t(player, "npc.model.custom.button"), "textures/ui/anvil_icon");
 form.button(Lang.t(player, "npc.appearance.cancel"), "textures/ui/cancel");
 const res = await form.show(player);
 if (res.canceled) return;
 if (res.selection === NPC_CUSTOM_MODELS.length) {
 return showCustomModelIdForm(player, selected, existingNPC);
 }
 if (res.selection > NPC_CUSTOM_MODELS.length) {
 return isChangingModel
 ? showUniversalNPCCustomization(player, selected, existingNPC)
 : showNPCTypeMenu(player, selected);
 }
 const selectedModel = NPC_CUSTOM_MODELS[res.selection];
 if (isChangingModel) replaceLinkedNPCModel(player, existingNPC, selectedModel);
 else spawnNPCWithType(player, selected, true, selectedModel);
}
function validateEntityType(player, typeId) {
 let probe;
 try {
 probe = player.dimension.spawnEntity(typeId, player.location);
 } catch {
 return false;
 }
 try { probe.remove(); } catch { }
 return true;
}
async function showCustomModelIdForm(player, selected, existingNPC = null) {
 if (!hasVipAccess(player)) {
 showMsg(player, "warning", Lang.t(player, "npc.custom.vip_only"));
 return showNPCTypeMenu(player, selected);
 }
 const res = await new ModalFormData()
 .title(Lang.t(player, "npc.model.custom.title"))
 .textField(Lang.t(player, "npc.model.custom.label"), Lang.t(player, "npc.model.custom.placeholder"), { defaultValue: "" })
 .show(player);
 if (res.canceled) return showModelSelectionMenu(player, selected, existingNPC);
 const typeId = String(res.formValues[0] || "").trim().toLowerCase();
 if (!/^[a-z0-9_]+:[a-z0-9_]+$/.test(typeId) || !validateEntityType(player, typeId)) {
 showMsg(player, "error", Lang.t(player, "npc.model.custom.err.invalid"));
 return showCustomModelIdForm(player, selected, existingNPC);
 }
 const customModel = { id: typeId.split(":")[1], entityType: typeId, name: typeId };
 if (isEntityUsable(existingNPC) && existingNPC.typeId === "kiwo:npc") replaceLinkedNPCModel(player, existingNPC, customModel);
 else spawnNPCWithType(player, selected, true, customModel);
}
function spawnNPCWithType(src, selected, isInvisible, customModel) {
 if (isInvisible && !hasVipAccess(src)) {
 return showMsg(src, "warning", Lang.t(src, "npc.custom.vip_only"));
 }
 const entityType = isInvisible ? "kiwo:npc" : "minecraft:npc";
 const playerRot = src.getRotation();
 try {
 const region = isInProtectedRegion(src.location);
 if (region) {
 const rc = getRegionConfig(region.id);
 const entitiesToExclude = ["minecraft:npc", "kiwo:npc"];
 entitiesToExclude.forEach(e => {
 if (!rc.excludedEntities?.includes(e)) {
 rc.excludedEntities = [...(rc.excludedEntities || []), e];
 }
 });
 saveRegionConfig(region.id, rc);
 }
 const lc = getLobbyConfig();
 const entitiesToExclude = ["minecraft:npc", "kiwo:npc"];
 entitiesToExclude.forEach(e => {
 if (!lc.excludedEntities?.includes(e)) {
 lc.excludedEntities = [...(lc.excludedEntities || []), e];
 }
 });
 saveLobbyConfig(lc);
 if (isInvisible) {
 src.runCommand(`summon kiwo:npc ~~~`);
 if (customModel) {
  const modelType = getCustomModelType(customModel);
 ensureNPCTypeProtected(modelType, src.location, src.dimension.id);
 src.runCommand(`summon ${modelType} ~~~`);
 }
 } else {
 src.runCommand(`summon minecraft:npc ~~~`);
 }
 } catch (e) {
 console.warn("[NPC] Summon failed:", e);
 return showMsg(src, "error", "Failed to spawn NPC.");
 }
 system.runTimeout(() => {
 if (!isEntityUsable(src)) return;
 const sourceSnapshot = getEntityWorldSnapshot(src);
 if (!sourceSnapshot) return;
 const entities = sourceSnapshot.dimension.getEntities({ type: entityType, location: sourceSnapshot.location, maxDistance: 3 });
 const npcEntity = entities.find(e => isEntityUsable(e) && !entityHasTag(e, "fixed_position") && !entityHasTag(e, "from_menu"));
 if (npcEntity) {
 npcEntity.setRotation(playerRot);
 setupNPCEntity(npcEntity, selected);
 if (isInvisible && customModel) {
  const modelType = getCustomModelType(customModel);
 const modelEntities = sourceSnapshot.dimension.getEntities({
 type: modelType,
 location: sourceSnapshot.location,
 maxDistance: 3
 });
  const modelEntity = modelEntities.find(e => isEntityUsable(e) && !entityHasTag(e, "fixed_position") && !entityHasTag(e, "npc_model"));
  if (modelEntity) {
  configureLinkedNPCModel(modelEntity, npcEntity);
  }
 showMsg(src, "success", Lang.t(src, "npc.spawn.custom_success", selected.name, customModel.name));
 } else {
 const typeText = isInvisible ? " (Invisible - kiwo:npc)" : "";
 showMsg(src, "success", Lang.t(src, "npc.spawn.success", `${selected.name}${typeText}`));
 }
 } else {
 showMsg(src, "error", Lang.t(src, "npc.spawn.err.not_found"));
 }
 }, 10);
}
export function npc_system(src) {
 try {
 const form = new ActionFormData().simpleUi().title(Lang.t(src, "npc.system.title")).body(Lang.t(src, "npc.system.body"));
 NPC_TYPES.forEach(n => form.button(`${n.name}\n§r${n.desc}`, n.icon));
 form.button(Lang.t(src, "npc.system.maintenance"), "textures/ui/automation_glyph_color");
 form.button(Lang.t(src, "common.back"), "textures/ui/arrow_left");
 form.show(src).then(res => {
 if (res.canceled) return;
 if (res.selection === NPC_TYPES.length) return showMaintenanceMenu(src);
 if (res.selection === NPC_TYPES.length + 1) return showMainMenu(src);
 const selected = NPC_TYPES[res.selection];
 showNPCTypeMenu(src, selected);
 });
 } catch (e) { console.warn("[NPC] Menu error:", e); showMsg(src, "error", "An error occurred in the NPC menu."); }
}
const handleNPCInteraction = (player, npcEntity) => {
 const initialTags = getEntityTagsSafe(npcEntity);
 if (!initialTags.includes("from_menu") && !getNPCTypeFromTags(initialTags)) return;
 system.run(() => {
 if (!isEntityUsable(player) || !isEntityUsable(npcEntity)) return;
 const currentTags = getEntityTagsSafe(npcEntity);
 const npcType = getNPCTypeFromTags(currentTags);
 if (!currentTags.includes("from_menu") && !npcType) return;
 const isAdmin = entityHasTag(player, "admin");
 if (getEntityTypeId(npcEntity) === "kiwo:npc" && !isAdmin && !hasVipAccess(player)) {
 showMsg(player, "warning", Lang.t(player, "npc.custom.vip_only"));
 return;
 }
 if (isAdmin) {
 if (npcType) showUniversalNPCCustomization(player, npcType, npcEntity);
 } else if (npcType) {
 if (!canUseNPCFeature(player, npcType)) return;
 const st = getNpcScheduleState(npcEntity);
 if (st.enabled && !st.isOpen) {
  const remaining = formatDuration(st.remainingSec, player);
  const msg = (()=>{ try{ const t=Lang.t(player,"npc.schedule.blocked", remaining); return t && t!=="npc.schedule.blocked"?t:`§cNPC tertutup! Buka dalam: §e${remaining}`;}catch{return `§cNPC tertutup! Buka dalam: §e${remaining}`;}})();
  showMsg(player, "warning", msg);
  try { player.runCommand("playsound note.bass @s ~~~ 1 0.5"); } catch {}
  return;
 }
 npcType.fn(player, npcEntity);
 try { player.runCommand("playsound random.pop @s ~~~ 1 1"); } catch { }
 }
 });
};
world.beforeEvents.playerInteractWithEntity.subscribe(e => {
 try {
 const npcTarget = getNPCInteractionTarget(e.target);
 const targetTypeId = getEntityTypeId(npcTarget);
 if (isConfiguredNPC(npcTarget) && (NPC_ENTITY_TYPES.includes(targetTypeId) || isCustomEggNPC(npcTarget))) {
 e.cancel = true;
 handleNPCInteraction(e.player, npcTarget);
 } else if (entityHasTag(e.player, "admin") && isCustomEggNPC(e.target) && !entityHasTag(e.target, "npc_model")) {
 e.cancel = true;
 const player = e.player;
 const target = e.target;
 system.run(() => {
 if (isEntityUsable(player) && isEntityUsable(target)) configureCustomEggNPC(player, target);
 });
 }
 } catch { }
});
world.beforeEvents.entityHurt.subscribe(e => {
 try {
 const npcEntity = e.hurtEntity;
 queueFixedPositionRestore(npcEntity);
 if (isCustomEggNPC(npcEntity) && (entityHasTag(npcEntity, "npc_model") || isConfiguredNPC(npcEntity))) {
 e.cancel = true;
 }
 } catch { }
});
world.afterEvents.entityHitEntity.subscribe(e => {
 try {
 const damagingEntity = e.damagingEntity;
 const hitEntity = e.hitEntity;
 queueFixedPositionRestore(hitEntity);
 const hitSnapshot = getEntityWorldSnapshot(hitEntity);
 if (hitSnapshot && isMaceAttack(damagingEntity)) {
 restoreFixedEntitiesNear(hitSnapshot.dimension, hitSnapshot.location, MACE_RECOVERY_RADIUS);
 }
 if (getEntityTypeId(damagingEntity) !== "minecraft:player" || !isEntityUsable(damagingEntity)) return;
 const npcTarget = getNPCInteractionTarget(hitEntity);
 const targetTypeId = getEntityTypeId(npcTarget);
 if (isConfiguredNPC(npcTarget) && (NPC_ENTITY_TYPES.includes(targetTypeId) || isCustomEggNPC(npcTarget))) {
 handleNPCInteraction(damagingEntity, npcTarget);
 } else if (entityHasTag(damagingEntity, "admin") && isCustomEggNPC(hitEntity) && !entityHasTag(hitEntity, "npc_model")) {
 if (isEntityUsable(hitEntity)) configureCustomEggNPC(damagingEntity, hitEntity);
 }
 } catch { }
});
world.afterEvents.projectileHitEntity.subscribe(e => {
 if (getEntityTypeId(e.projectile) !== "minecraft:fishing_hook") return;
 try {
 const hitEntity = e.getEntityHit()?.entity;
 const hitSnapshot = getEntityWorldSnapshot(hitEntity);
 if (hitSnapshot) restoreFixedEntitiesNear(hitSnapshot.dimension, hitSnapshot.location, 4);
 } catch { }
});
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
 if (itemStack.typeId !== "minecraft:fishing_rod") return;
 const sourceSnapshot = getEntityWorldSnapshot(source);
 if (sourceSnapshot) restoreFixedEntitiesNear(sourceSnapshot.dimension, sourceSnapshot.location, FISHING_RECOVERY_RADIUS);
});

const NPC_DEFAULT_TEXTS = new Set();
for (const _t of NPC_TYPES) {
 if (_t.fullName) NPC_DEFAULT_TEXTS.add(_t.fullName);
 for (const _l of _t.legacyFullNames || []) NPC_DEFAULT_TEXTS.add(_l);
}
function stripScheduleSuffix(text) {
 return String(text ?? "").replace(/\n§c\[[^\]]*\] §7• §e.*$/, "");
}
function isCustomNPCText(text) {
 if (!text) return false;
 if (NPC_DEFAULT_TEXTS.has(text)) return false;
 return !NPC_DEFAULT_TEXTS.has(stripScheduleSuffix(text));
}

function syncNPCTextRecord(dimension, npc, type) {
 const tags = getEntityTagsSafe(npc);
 const id = tags.find(tag => tag.startsWith("npc_id:"))?.replace("npc_id:", "");
 const location = getEntityLocationSafe(npc);
 if (!id || !location) return;
 const position = { x: location.x, y: location.y + 3, z: location.z };
 const scheduleState = getNpcScheduleState(npc);
 let desiredBase = type ? type.fullName : null;
 let desiredText = desiredBase;
 let scheduleSuffix = null;
 if (desiredBase && scheduleState.enabled && !scheduleState.isOpen) {
  let nearby = null;
  try {
   nearby = world.getPlayers().find(p=>{
    try{
     const pl=p.location;
     return p.dimension.id===dimension.id && Math.abs(pl.x-location.x) < 16 && Math.abs(pl.z-location.z) < 16;
    }catch{return false;}
   });
  } catch {}
  const rem = formatCompact(scheduleState.remainingSec);
  scheduleSuffix = `§c[TERTUTUP] §7• §e${rem}`;
  try {
   if (nearby) {
    const t = Lang.t(nearby, "npc.schedule.floating.closed", rem);
    if (t && t !== "npc.schedule.floating.closed") scheduleSuffix = t;
   }
  } catch {}
  desiredText = `${type.fullName}\n${scheduleSuffix}`;
 }
 const text = findNpcRecord(id);
 if (text) {
  if (type?.legacyFullNames?.includes(text.text) && desiredBase) {
   setRecordText(text.id, type.fullName);
   if (desiredText !== type.fullName) {
    try { setTextOnly(text.id, desiredText); } catch {}
   }
  } else if (isCustomNPCText(text.text)) {
   const customBase = stripScheduleSuffix(text.text);
   if (scheduleSuffix) {
    const desiredCustom = `${customBase}\n${scheduleSuffix}`;
    if (text.text !== desiredCustom) {
     try { setTextOnly(text.id, desiredCustom); } catch {}
    }
   } else if (text.text !== customBase) {
    try { setTextOnly(text.id, customBase); } catch {}
   }
  } else if (desiredText && text.text !== desiredText) {
   if (scheduleState.enabled && !scheduleState.isOpen) {
    try { setTextOnly(text.id, desiredText); } catch { setRecordText(text.id, desiredText); }
   } else {
    if (text.text.includes("§c[TERTUTUP]")) {
     try { setTextOnly(text.id, desiredText); } catch { setRecordText(text.id, desiredText); }
    } else {
     setRecordText(text.id, desiredText);
    }
   }
  }
  if (text.dim !== dimension.id || Math.abs(text.x - position.x) > 0.01 || Math.abs(text.y - position.y) > 0.01 || Math.abs(text.z - position.z) > 0.01) {
   moveRecord(text.id, dimension, position);
  }
 } else if (type && desiredText) {
  try {
   if (scheduleState.enabled && !scheduleState.isOpen) {
    const rec = createNPCText(dimension, position, type.fullName, id);
    if (rec) try { setTextOnly(rec.id, desiredText); } catch {}
   } else {
    createNPCText(dimension, position, desiredText, id);
   }
  } catch { }
 }
}

function maintainNPCDimension(dimension, playerLocations) {
 const handled = new Set();
 for (const playerLocation of playerLocations) {
  let nearby;
  try {
   nearby = dimension.getEntities({ location: playerLocation, maxDistance: NPC_ACTIVE_RADIUS, tags: ["fixed_position"] });
  } catch { continue; }
  for (const npc of nearby) {
   if (!isEntityUsable(npc)) continue;
   if (handled.has(npc.id)) continue;
   handled.add(npc.id);
   const typeId = getEntityTypeId(npc);
   if (!NPC_ENTITY_TYPES.includes(typeId) && !(isCustomEggNPC(npc) && !entityHasTag(npc, "npc_model"))) continue;
   syncNPCTextRecord(dimension, npc, getNPCTypeFromTags(getEntityTagsSafe(npc)));
  }
 }
}

system.runInterval(() => {
 const playerLocationsByDimension = new Map();
 for (const player of world.getAllPlayers()) {
  try {
   const location = getEntityLocationSafe(player);
   if (!location) continue;
   const dimensionId = player.dimension.id.split(":").pop();
   const locations = playerLocationsByDimension.get(dimensionId);
   if (locations) locations.push(location);
   else playerLocationsByDimension.set(dimensionId, [location]);
  } catch { }
 }
 if (!playerLocationsByDimension.size) return;
 for (const dimensionId of NPC_DIMENSION_IDS) {
  const playerLocations = playerLocationsByDimension.get(dimensionId);
  if (!playerLocations) continue;
  try {
   maintainNPCDimension(world.getDimension(dimensionId), playerLocations);
  } catch { }
 }
}, 200);

const SCHEDULE_TICK_MS = 1000;
let lastScheduleTick = 0;
system.runInterval(() => {
 const now = Date.now();
 if (now - lastScheduleTick < SCHEDULE_TICK_MS - 50) return;
 lastScheduleTick = now;
 const seen = new Set();
 for (const player of world.getAllPlayers()) {
  let loc; try { loc = getEntityLocationSafe(player); if (!loc) continue; } catch { continue; }
  let nearby;
  try { nearby = player.dimension.getEntities({ location: loc, maxDistance: 32, tags: ["fixed_position"] }); } catch { continue; }
  for (const npc of nearby) {
   if (!isEntityUsable(npc)) continue;
   if (seen.has(npc.id)) continue;
   seen.add(npc.id);
   const typeId = getEntityTypeId(npc);
   if (!NPC_ENTITY_TYPES.includes(typeId) && !(isCustomEggNPC(npc) && !entityHasTag(npc, "npc_model"))) continue;
   const schedState = getNpcScheduleState(npc);
   if (!schedState.enabled) continue;
   const type = getNPCTypeFromTags(getEntityTagsSafe(npc));
   if (!type) continue;
   const tags = getEntityTagsSafe(npc);
   const nid = tags.find(t=>t.startsWith("npc_id:"))?.replace("npc_id:","");
   if (!nid) continue;
   const rec = findNpcRecord(nid);
   if (!rec) continue;
   const recBase = isCustomNPCText(rec.text) ? stripScheduleSuffix(rec.text) : type.fullName;
   let desired = recBase;
   if (!schedState.isOpen) {
    const rem = formatCompact(schedState.remainingSec);
    let suffix = `§c[TERTUTUP] §7• §e${rem}`;
    try {
     const t = Lang.t(player, "npc.schedule.floating.closed", rem);
     if (t && t !== "npc.schedule.floating.closed") suffix = t;
    } catch {}
    desired = `${recBase}\n${suffix}`;
   }
   if (rec.text !== desired) {
    try { setTextOnly(rec.id, desired); } catch {}
   }
  }
 }
}, 20);
