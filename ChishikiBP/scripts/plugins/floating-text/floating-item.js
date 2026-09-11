import { world, system, EntityComponentTypes, ActionFormData } from '../../core.js';
import { floatingTextMenu } from "./forms/floatingTextMenus.js";
import { getClearlagTimeRemaining } from "../clear-lag/clearlag.js";
import { getStackerItemTotal } from "../all-stacker/stack-info.js";
import { createTickSnapshotCache } from "../../lib/tick-snapshot-cache.js";
const trackedItems = new Map();
const itemSpawnTimes = new Map();
const lastRadarMessage = new Map();
const orphanedItemTexts = new Map();
const playerSnapshotCache = createTickSnapshotCache();
const rainbowColors = ['§c', '§6', '§e', '§a', '§b', '§d'];
const ITEM_DESPAWN_TIME = 6000;
const GRID_SIZE = 2.5;
const ITEM_VISIBILITY_RADIUS = 64;
const RADAR_RADIUS = 100;
const PLAYER_SCAN_MERGE_DISTANCE = 32;
const DIMENSIONS = ["overworld", "nether", "the_end"];
let currentTheme = 'default';
let timerEnabled = false;
let radarEnabled = false;
let displayEnabled = false;
let lastUpdateTime = Date.now();
let rainbowIndex = 0;
let displayJobId;
let displayJobGeneration = 0;
let orphanCleanupJobId;
let displayIntervalId;
let rainbowIntervalId;
let radarIntervalId;
const RARITY = {
 COMMON: '§f', UNCOMMON: '§e', RARE: '§b', EPIC: '§d', LEGENDARY: '§6',
 NATURE: '§a', COMBAT: '§c', MAGICAL: '§9', NETHER: '§4', END: '§5'
};
const RARITY_MAP = new Map([
 ['legendary', ['dragon_egg', 'enchanted_golden_apple', 'nether_star', 'beacon', 'conduit', 'heart_of_the_sea', 'totem_of_undying', 'trident']],
 ['epic', ['netherite_sword', 'netherite_pickaxe', 'netherite_axe', 'netherite_shovel', 'netherite_hoe', 'netherite_helmet', 'netherite_chestplate', 'netherite_leggings', 'netherite_boots', 'netherite_ingot', 'netherite_block', 'netherite_scrap', 'ancient_debris', 'elytra', 'shulker_shell', 'end_crystal', 'dragon_breath', 'wither_skeleton_skull', 'music_disc', 'disc_fragment']],
 ['rare', ['diamond', 'diamond_block', 'diamond_ore', 'deepslate_diamond_ore', 'diamond_sword', 'diamond_pickaxe', 'diamond_axe', 'diamond_shovel', 'diamond_hoe', 'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots', 'emerald', 'emerald_block', 'emerald_ore', 'deepslate_emerald_ore', 'enchanted_book', 'golden_apple', 'ender_pearl', 'ender_eye', 'blaze_rod', 'ghast_tear', 'phantom_membrane', 'prismarine_shard', 'prismarine_crystals', 'nautilus_shell', 'scute', 'rabbit_foot', 'experience_bottle', 'name_tag', 'saddle', 'horse_armor', 'iron_horse_armor', 'golden_horse_armor', 'diamond_horse_armor']],
 ['magical', ['enchanting_table', 'brewing_stand', 'lapis_lazuli', 'lapis_block', 'lapis_ore', 'amethyst_shard', 'amethyst_cluster', 'amethyst_block', 'spyglass', 'recovery_compass', 'echo_shard', 'potion', 'splash_potion', 'lingering_potion', 'arrow']],
 ['combat', ['bow', 'crossbow', 'shield', 'spectral_arrow', 'tipped_arrow', 'iron_sword', 'stone_sword', 'golden_sword', 'wooden_sword', 'iron_axe', 'stone_axe', 'golden_axe', 'wooden_axe', 'turtle_helmet', 'chainmail_helmet', 'chainmail_chestplate', 'chainmail_leggings', 'chainmail_boots', 'leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'fire_charge', 'firework_rocket', 'firework_star', 'tnt']],
 ['nether', ['netherrack', 'nether_brick', 'nether_bricks', 'red_nether_bricks', 'nether_wart', 'nether_wart_block', 'warped_wart_block', 'soul_sand', 'soul_soil', 'magma_cream', 'magma_block', 'blaze_powder', 'glowstone', 'glowstone_dust', 'shroomlight', 'crying_obsidian', 'respawn_anchor', 'lodestone', 'blackstone', 'gilded_blackstone', 'basalt', 'quartz', 'nether_quartz_ore', 'crimson', 'warped', 'weeping_vines', 'twisting_vines', 'nether_gold_ore', 'gold_nugget']],
 ['end', ['end_stone', 'end_stone_bricks', 'purpur', 'end_rod', 'chorus', 'popped_chorus_fruit', 'shulker_box', 'dragon_head', 'end_portal_frame']],
 ['nature', ['sapling', 'leaves', 'azalea', 'moss', 'dripleaf', 'spore_blossom', 'glow_berries', 'sweet_berries', 'melon', 'pumpkin', 'wheat', 'carrot', 'potato', 'beetroot', 'sugar_cane', 'bamboo', 'cactus', 'kelp', 'seagrass', 'lily_pad', 'vine', 'flower', 'tulip', 'rose', 'dandelion', 'poppy', 'cornflower', 'lily', 'orchid', 'allium', 'azure', 'oxeye', 'sunflower', 'lilac', 'peony', 'fern', 'grass', 'seeds', 'bone_meal', 'cocoa_beans', 'honey', 'honeycomb', 'bee_nest', 'beehive', 'apple', 'egg', 'feather', 'leather', 'rabbit_hide', 'wool', 'string', 'slime_ball', 'ink_sac', 'glow_ink_sac', 'dye']],
 ['uncommon', ['gold_ingot', 'gold_block', 'gold_ore', 'deepslate_gold_ore', 'raw_gold', 'golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots', 'golden_pickaxe', 'golden_shovel', 'golden_hoe', 'clock', 'powered_rail', 'redstone', 'redstone_block', 'redstone_ore', 'deepslate_redstone_ore', 'observer', 'piston', 'sticky_piston', 'hopper', 'dropper', 'dispenser', 'comparator', 'repeater', 'daylight_detector', 'target', 'lever', 'button', 'pressure_plate', 'tripwire_hook', 'trapped_chest', 'iron_ingot', 'iron_block', 'iron_ore', 'deepslate_iron_ore', 'raw_iron', 'copper_ingot', 'copper_block', 'copper_ore', 'deepslate_copper_ore', 'raw_copper', 'coal', 'coal_block', 'coal_ore', 'deepslate_coal_ore', 'charcoal', 'book', 'paper', 'map', 'compass', 'bucket', 'shears', 'flint_and_steel', 'fishing_rod', 'lead', 'carrot_on_a_stick', 'warped_fungus_on_a_stick']]
]);
const RARITY_ORDER = ['legendary', 'epic', 'rare', 'magical', 'combat', 'nether', 'end', 'nature', 'uncommon'];
const RARITY_COLOR_MAP = {
 legendary: RARITY.LEGENDARY, epic: RARITY.EPIC, rare: RARITY.RARE,
 magical: RARITY.MAGICAL, combat: RARITY.COMBAT, nether: RARITY.NETHER,
 end: RARITY.END, nature: RARITY.NATURE, uncommon: RARITY.UNCOMMON
};
const themes = {
 'default': { description: "Minecraft Rarity Colors", quantity: '§7', useRarity: true },
 'classic': { description: "Original simple colors", quantity: '§e', normal: '§f', special: { diamond: '§b', netherite: '§d', gold: '§6', emerald: '§a', enchanted: '§d' } },
 'ocean': { description: "Cool ocean blues and aquas", quantity: '§b', normal: '§3', special: { diamond: '§9', netherite: '§1', gold: '§b', emerald: '§3', enchanted: '§9' } },
 'rainbow': { description: "Smooth cycling rainbow colors", quantity: '§f', normal: 'rainbow', special: { diamond: '§b', netherite: '§5', gold: '§6', emerald: '§a', enchanted: '§d' } },
 'nether': { description: "Fiery nether-themed colors", quantity: '§c', normal: '§4', special: { diamond: '§6', netherite: '§0', gold: '§e', emerald: '§2', enchanted: '§5' } },
 'end': { description: "Mysterious end-themed colors", quantity: '§5', normal: '§d', special: { diamond: '§f', netherite: '§8', gold: '§e', emerald: '§d', enchanted: '§5' } },
 'winter': { description: "Cool winter colors", quantity: '§b', normal: '§f', special: { diamond: '§9', netherite: '§8', gold: '§e', emerald: '§b', enchanted: '§f' } }
};
function loadSettings() {
 currentTheme = world.getDynamicProperty('sft:theme') ?? 'default';
 timerEnabled = world.getDynamicProperty('sft:timerEnabled') ?? false;
 radarEnabled = world.getDynamicProperty('sft:radarEnabled') ?? false;
 displayEnabled = world.getDynamicProperty('sft:displayEnabled') ?? false;
}
function ensureDisplayInterval() {
 if (displayEnabled) {
  if (displayIntervalId === undefined) displayIntervalId = system.runInterval(scheduleDisplayJob, 20);
 } else if (displayIntervalId !== undefined) {
  system.clearRun(displayIntervalId);
  displayIntervalId = undefined;
 }
}
function ensureRainbowInterval() {
 if (currentTheme === 'rainbow') {
  if (rainbowIntervalId === undefined) rainbowIntervalId = system.runInterval(updateRainbowItems, 20);
 } else if (rainbowIntervalId !== undefined) {
  system.clearRun(rainbowIntervalId);
  rainbowIntervalId = undefined;
 }
}
function ensureRadarInterval() {
 if (radarEnabled) {
  if (radarIntervalId === undefined) radarIntervalId = system.runInterval(updateRadar, 20);
 } else if (radarIntervalId !== undefined) {
  system.clearRun(radarIntervalId);
  radarIntervalId = undefined;
 }
}
function syncFeatureIntervals() {
 ensureDisplayInterval();
 ensureRainbowInterval();
 ensureRadarInterval();
}
function isEntityValid(entity) {
 if (!entity) return false;
 try { return entity.isValid === true; } catch { return false; }
}
function getPlayerSnapshots() {
 return playerSnapshotCache.get(system.currentTick, () => {
  const snapshots = [];
  for (const player of world.getPlayers()) {
   if (!isEntityValid(player)) continue;
   try {
    const location = player.location;
    const dimension = player.dimension;
    snapshots.push({
     player,
     dimension,
     location: { x: location.x, y: location.y, z: location.z },
    });
   } catch {
   }
  }
  return snapshots;
 });
}
function distanceSquared(first, second) {
 const dx = first.x - second.x;
 const dy = first.y - second.y;
 const dz = first.z - second.z;
 return dx * dx + dy * dy + dz * dz;
}
function buildPlayerScanRegions(playerSnapshots, baseRadius) {
 const regions = [];
 const mergeDistance = Math.min(PLAYER_SCAN_MERGE_DISTANCE, Math.max(16, baseRadius / 2));
 const mergeDistanceSquared = mergeDistance * mergeDistance;

 for (const snapshot of playerSnapshots) {
  let selected;
  let selectedDistance = Infinity;
  for (const region of regions) {
   if (region.dimension.id !== snapshot.dimension.id) continue;
   const distance = distanceSquared(region.anchor, snapshot.location);
   if (distance <= mergeDistanceSquared && distance < selectedDistance) {
    selected = region;
    selectedDistance = distance;
   }
  }
  if (selected) {
   selected.players.push(snapshot);
  } else {
   regions.push({
    dimension: snapshot.dimension,
    anchor: snapshot.location,
    players: [snapshot],
   });
  }
 }

 for (const region of regions) {
  const center = { x: 0, y: 0, z: 0 };
  for (const snapshot of region.players) {
   center.x += snapshot.location.x;
   center.y += snapshot.location.y;
   center.z += snapshot.location.z;
  }
  center.x /= region.players.length;
  center.y /= region.players.length;
  center.z /= region.players.length;
  let spreadSquared = 0;
  for (const snapshot of region.players) {
   spreadSquared = Math.max(spreadSquared, distanceSquared(center, snapshot.location));
  }
  region.center = center;
  region.queryRadius = baseRadius + Math.sqrt(spreadSquared);
 }
 return regions;
}
function collectItemsNearPlayers(playerSnapshots, radius) {
 const itemsById = new Map();
 const radiusSquared = radius * radius;
 for (const region of buildPlayerScanRegions(playerSnapshots, radius)) {
  let entities;
  try {
   entities = region.dimension.getEntities({
    type: "minecraft:item",
    location: region.center,
    maxDistance: region.queryRadius,
   });
  } catch {
   continue;
  }
  for (const entity of entities) {
   if (!isEntityValid(entity)) continue;
   try {
    const location = entity.location;
    if (!region.players.some((snapshot) => distanceSquared(location, snapshot.location) <= radiusSquared)) continue;
    itemsById.set(entity.id, entity);
   } catch {
   }
  }
 }
 return [...itemsById.values()];
}
function getRainbowColor() {
 const now = Date.now();
 if (now - lastUpdateTime >= 500) {
 rainbowIndex = (rainbowIndex + 1) % rainbowColors.length;
 lastUpdateTime = now;
 }
 return rainbowColors[rainbowIndex];
}
function formatTime(ticks) {
 const total = Math.floor(ticks / 20);
 return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}
function getItemAge(itemId) {
 const spawn = itemSpawnTimes.get(itemId);
 return spawn !== undefined ? Math.max(0, getDisplayTick() - spawn) : 0;
}
function getDisplayTick() {
 return Math.floor(system.currentTick / 5);
}
function getItemRarity(typeId) {
 const itemId = typeId.split(':')[1] || typeId;
 for (const tier of RARITY_ORDER) {
 if (RARITY_MAP.get(tier).some(i => itemId.includes(i))) {
 return RARITY_COLOR_MAP[tier];
 }
 }
 return RARITY.COMMON;
}
function getItemColor(itemStack, theme) {
 if (theme.useRarity) {
 let color = getItemRarity(itemStack.typeId);
 const enchants = itemStack.getComponent?.('minecraft:enchantable');
 if (enchants?.getEnchantments?.()?.length > 0) {
 if (color === RARITY.COMMON || color === RARITY.UNCOMMON || color === RARITY.NATURE) {
 color = RARITY.EPIC;
 }
 }
 return color;
 }
 if (theme.normal === 'rainbow') return getRainbowColor();
 const id = itemStack.typeId.split(':')[1];
 if (id.includes('diamond')) return theme.special.diamond;
 if (id.includes('netherite')) return theme.special.netherite;
 if (id.includes('gold')) return theme.special.gold;
 if (id.includes('emerald')) return theme.special.emerald;
 const enchants = itemStack.getComponent?.('minecraft:enchantable');
 if (enchants?.getEnchantments?.()?.length > 0) return theme.special.enchanted;
 return theme.normal;
}
function formatItemName(typeId, nameTag) {
 if (nameTag?.length > 0) return nameTag;
 const id = typeId.split(':')[1];
 if (!id) return null;
 return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
function getSimpleItemName(itemStack) {
 return formatItemName(itemStack.typeId, itemStack.nameTag) ?? "Unknown";
}
function formatItemDisplay(item, itemId, overrideCount = null) {
 if (!isEntityValid(item)) return null;
 const comp = item.getComponent(EntityComponentTypes.Item);
 if (!comp?.itemStack) return null;
 const stack = comp.itemStack;
 if (stack.amount === undefined || !stack.typeId) return null;
 const count = overrideCount ?? stack.amount;
 const name = formatItemName(stack.typeId, stack.nameTag);
 if (!name) return null;
 const theme = themes[currentTheme];
 if (!theme) return null;
 const color = getItemColor(stack, theme);
 let display = `${theme.quantity}x${count} ${color}${name}`;
 const clearlag = getClearlagTimeRemaining?.() ?? 0;
 if (clearlag > 0) {
 const m = Math.floor(clearlag / 60);
 const s = clearlag % 60;
 const urgency = clearlag <= 10 ? '§c' : clearlag <= 30 ? '§6' : clearlag <= 60 ? '§e' : '§7';
 display += ` §r${urgency}[⚠${m}:${s.toString().padStart(2, '0')}]`;
 }
 if (timerEnabled && itemId) {
 const left = Math.max(0, ITEM_DESPAWN_TIME - getItemAge(itemId));
 display += ` §r§8[${formatTime(left)}]`;
 }
 return display;
}
function updateRainbowItems() {
 if (currentTheme !== 'rainbow') return;
 system.run(() => {
 const newColor = getRainbowColor();
 for (const [, text] of trackedItems) {
 if (!isEntityValid(text)) continue;
 const tag = text.nameTag;
 const idx = tag.indexOf(' [');
 if (idx !== -1) {
 text.nameTag = tag.substring(0, idx).replace(/§[0-9a-f]/gi, newColor) + tag.substring(idx);
 } else {
 text.nameTag = tag.replace(/§[0-9a-f]/gi, newColor);
 }
 }
 });
}
function normalizeRadians(angle) {
 return Math.atan2(Math.sin(angle), Math.cos(angle));
}
function getRadarGuidance(player, target) {
 const dx = target.x - player.location.x;
 const dz = target.z - player.location.z;
 const cardinalIndex = Math.round(normalizeRadians(Math.atan2(dx, -dz)) / (Math.PI / 4));
 const cardinal = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][(cardinalIndex + 8) % 8];
 let arrow = "•";
 try {
 const view = player.getViewDirection();
 if (Math.hypot(view.x, view.z) > 0.001) {
 const targetAngle = Math.atan2(dz, dx);
 const viewAngle = Math.atan2(view.z, view.x);
 const relativeIndex = Math.round(normalizeRadians(targetAngle - viewAngle) / (Math.PI / 4));
 arrow = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"][(relativeIndex + 8) % 8];
 }
 } catch {
 }
 const height = target.y - player.location.y;
 const vertical = height > 2 ? "§b▲" : height < -2 ? "§c▼" : "§7━";
 return { arrow, cardinal, vertical };
}
function clearRadarMessages(playerSnapshots = getPlayerSnapshots()) {
 const playersById = new Map(playerSnapshots.map((snapshot) => [snapshot.player.id, snapshot.player]));
 for (const [playerId, hasMessage] of lastRadarMessage) {
  if (hasMessage) {
   try { playersById.get(playerId)?.onScreenDisplay.setActionBar(""); } catch {}
  }
 }
 lastRadarMessage.clear();
}
function collectRadarItemsByPlayer(playerSnapshots) {
 const itemsByPlayer = new Map(playerSnapshots.map((snapshot) => [snapshot.player.id, []]));
 const radiusSquared = RADAR_RADIUS * RADAR_RADIUS;
 for (const region of buildPlayerScanRegions(playerSnapshots, RADAR_RADIUS)) {
  let entities;
  try {
   entities = region.dimension.getEntities({
    type: "minecraft:item",
    location: region.center,
    maxDistance: region.queryRadius,
   });
  } catch {
   continue;
  }
  for (const item of entities) {
   if (!isEntityValid(item)) continue;
   try {
    const location = item.location;
    for (const snapshot of region.players) {
     if (distanceSquared(location, snapshot.location) <= radiusSquared) {
      itemsByPlayer.get(snapshot.player.id)?.push(item);
     }
    }
   } catch {
   }
  }
 }
 return itemsByPlayer;
}
function updateRadar() {
 if (!radarEnabled) {
  if (lastRadarMessage.size > 0) clearRadarMessages();
  return;
 }
 const playerSnapshots = getPlayerSnapshots();
 const onlineIds = new Set(playerSnapshots.map((snapshot) => snapshot.player.id));
 for (const playerId of lastRadarMessage.keys()) {
  if (!onlineIds.has(playerId)) lastRadarMessage.delete(playerId);
 }
 const itemsByPlayer = collectRadarItemsByPlayer(playerSnapshots);
 for (const { player } of playerSnapshots) {
  const items = itemsByPlayer.get(player.id) || [];
 let nearest = null;
  let minDist = Infinity;
  for (const item of items) {
  if (!isEntityValid(item)) continue;
  let comp;
  let loc;
  try {
  comp = item.getComponent(EntityComponentTypes.Item);
  loc = item.location;
  } catch {
  continue;
  }
  if (!comp?.itemStack) continue;
 const dx = loc.x - player.location.x;
 const dy = loc.y - player.location.y;
 const dz = loc.z - player.location.z;
 const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
 if (dist < minDist) {
 minDist = dist;
 nearest = { name: getSimpleItemName(comp.itemStack), dist, itemStack: comp.itemStack, location: { x: loc.x, y: loc.y, z: loc.z } };
 }
 }
 if (nearest) {
 const theme = themes[currentTheme] || themes.default;
 const color = getItemColor(nearest.itemStack, theme) || '§f';
 const distance = `${Math.floor(nearest.dist)}m`;
 const guidance = getRadarGuidance(player, nearest.location);
 player.onScreenDisplay.setActionBar(`§8━━━━ §e§lRADAR§r §8┃ §b${guidance.arrow} §f${guidance.cardinal} ${guidance.vertical} §8┃ ${color}${nearest.name} §r§8┃ §f${distance} §8━━━━`);
 lastRadarMessage.set(player.id, true);
 } else if (lastRadarMessage.get(player.id)) {
 player.onScreenDisplay.setActionBar("");
 lastRadarMessage.set(player.id, false);
 }
 }
}
function cleanupOrphanedTexts() {
 const tracked = new Set();
 for (const text of trackedItems.values()) {
 try {
 if (text?.id) tracked.add(text.id);
 } catch (e) {}
 }
 for (const dimId of DIMENSIONS) {
 const dim = world.getDimension(dimId);
 try {
 for (const text of dim.getEntities({ type: "add:floating_text", tags: ["sft:item_name"] })) {
 if (isEntityValid(text) && !tracked.has(text.id)) enqueueOrphanedItemText(text);
 }
 } catch (e) {}
 }
 scheduleOrphanCleanupJob();
}
function isFloatingItemText(entity) {
 try {
  return entity?.typeId === "add:floating_text" && entity.hasTag("sft:item_name");
 } catch {
  return false;
 }
}
function isTrackedFloatingText(entity) {
 let entityId;
 try { entityId = entity?.id; } catch { return false; }
 if (!entityId) return false;
 for (const tracked of trackedItems.values()) {
  try {
   if (tracked?.id === entityId) return true;
  } catch {
  }
 }
 return false;
}
function enqueueOrphanedItemText(entity) {
 let entityId;
 try { entityId = entity?.id; } catch { return; }
 if (!entityId || isTrackedFloatingText(entity)) return;
 orphanedItemTexts.set(entityId, entity);
}
function* removeOrphanedItemTexts() {
 try {
  while (orphanedItemTexts.size > 0) {
   const next = orphanedItemTexts.entries().next().value;
   if (!next) break;
   const [entityId, entity] = next;
   orphanedItemTexts.delete(entityId);
   if (isEntityValid(entity) && !isTrackedFloatingText(entity)) {
    try { entity.remove(); } catch {}
   }
   yield;
  }
 } finally {
  orphanCleanupJobId = undefined;
  if (orphanedItemTexts.size > 0) scheduleOrphanCleanupJob();
 }
}
function scheduleOrphanCleanupJob() {
 if (orphanCleanupJobId !== undefined || orphanedItemTexts.size === 0) return;
 try {
  orphanCleanupJobId = system.runJob(removeOrphanedItemTexts());
 } catch {
  orphanCleanupJobId = undefined;
 }
}
function isVisibleToAnyPlayer(pos, dimension, playerSnapshots) {
 for (const snapshot of playerSnapshots) {
  if (snapshot.dimension.id !== dimension.id) continue;
  const pLoc = snapshot.location;
  const dx = pos.x - pLoc.x;
  const dy = pos.y - pLoc.y;
  const dz = pos.z - pLoc.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq <= 2304) return true;
 }
 return false;
}
function* processItemsGenerator(generation, playerSnapshots) {
 if (!displayEnabled || generation !== displayJobGeneration || playerSnapshots.length === 0) return;
 try {
  const activeKeys = new Set();
  const clustersList = [];
  const items = collectItemsNearPlayers(playerSnapshots, ITEM_VISIBILITY_RADIUS);
  const clusters = new Map();
  for (const item of items) {
 let comp;
 try {
 comp = item.getComponent(EntityComponentTypes.Item);
 } catch (e) {
 continue;
 }
 if (!comp?.itemStack) continue;
  const loc = item.location;
  const dim = item.dimension;
 const typeId = comp.itemStack.typeId;
 const amount = getStackerItemTotal(item, comp.itemStack.amount);
 const gx = Math.round(loc.x / GRID_SIZE);
 const gy = Math.round(loc.y / GRID_SIZE);
 const gz = Math.round(loc.z / GRID_SIZE);
 const key = `${dim.id}:${gx},${gy},${gz}:${typeId}`;
 if (!clusters.has(key)) {
 clusters.set(key, { anchor: item, total: 0, count: 0, sum: { x: 0, y: 0, z: 0 }, dim });
 }
 const c = clusters.get(key);
 c.total += amount;
 c.count++;
 c.sum.x += loc.x;
 c.sum.y += loc.y;
 c.sum.z += loc.z;
  yield;
  if (!displayEnabled || generation !== displayJobGeneration) return;
 }
 for (const [key, c] of clusters) {
 activeKeys.add(key);
 const pos = { x: c.sum.x / c.count, y: (c.sum.y / c.count) + 0.5, z: c.sum.z / c.count };
 const display = formatItemDisplay(c.anchor, key, c.total);
 if (display) {
 clustersList.push({ key, pos, display, dim, basePos: { ...pos } });
 }
  yield;
  if (!displayEnabled || generation !== displayJobGeneration) return;
  }
  const groups = [];
  const groupBuckets = new Map();
  clustersList.sort((a, b) => a.basePos.y - b.basePos.y);
  for (const data of clustersList) {
  const cellX = Math.floor(data.basePos.x / 0.8);
  const cellY = Math.floor(data.basePos.y / 1.5);
  const cellZ = Math.floor(data.basePos.z / 0.8);
  const candidateGroups = new Set();
  for (let x = cellX - 1; x <= cellX + 1; x++) {
   for (let y = cellY - 1; y <= cellY + 1; y++) {
    for (let z = cellZ - 1; z <= cellZ + 1; z++) {
     const bucket = groupBuckets.get(`${data.dim.id}:${x},${y},${z}`);
     if (bucket) for (const groupIndex of bucket) candidateGroups.add(groupIndex);
    }
   }
  }
  let selectedGroup = -1;
  for (const groupIndex of [...candidateGroups].sort((a, b) => a - b)) {
   const anchor = groups[groupIndex][0];
   if (Math.hypot(anchor.basePos.x - data.basePos.x, anchor.basePos.z - data.basePos.z) < 0.8
    && Math.abs(anchor.basePos.y - data.basePos.y) < 1.5) {
    selectedGroup = groupIndex;
    break;
   }
  }
  if (selectedGroup >= 0) {
   groups[selectedGroup].push(data);
  } else {
   selectedGroup = groups.length;
   groups.push([data]);
   const key = `${data.dim.id}:${cellX},${cellY},${cellZ}`;
   if (!groupBuckets.has(key)) groupBuckets.set(key, []);
   groupBuckets.get(key).push(selectedGroup);
  }
  yield;
  if (!displayEnabled || generation !== displayJobGeneration) return;
  }
 for (const group of groups) {
 group.sort((a, b) => {
 const timeA = itemSpawnTimes.get(a.key) || Number.MAX_SAFE_INTEGER;
 const timeB = itemSpawnTimes.get(b.key) || Number.MAX_SAFE_INTEGER;
 if (timeA !== timeB) return timeA - timeB;
 return a.key.localeCompare(b.key);
 });
 for (let k = 0; k < group.length; k++) {
 group[k].pos.y += k * 0.35;
 }
 }
  for (const data of clustersList) {
  const { key, pos, display, dim } = data;
  let isVisible = false;
  try { isVisible = isVisibleToAnyPlayer(pos, dim, playerSnapshots); } catch {}
  if (!trackedItems.has(key)) {
  if (isVisible) {
  try {
  const text = dim.spawnEntity("add:floating_text", pos);
  text.addTag("sft:item_name");
  text.nameTag = display;
  trackedItems.set(key, text);
  itemSpawnTimes.set(key, getDisplayTick());
  } catch (e) {}
  }
  } else {
 const text = trackedItems.get(key);
 if (isEntityValid(text)) {
 try {
 if (Math.hypot(text.location.x - pos.x, text.location.y - pos.y, text.location.z - pos.z) > 0.05) {
 text.teleport(pos);
 }
  const targetTag = isVisible ? display : "";
 if (text.nameTag !== targetTag) {
 text.nameTag = targetTag;
 }
 } catch (e) {}
 } else {
 trackedItems.delete(key);
 itemSpawnTimes.delete(key);
 }
  }
  yield;
  if (!displayEnabled || generation !== displayJobGeneration) return;
  }
 const toDelete = [];
 for (const [key, text] of trackedItems) {
 if (!activeKeys.has(key)) {
 if (isEntityValid(text)) {
 try { text.remove(); } catch (e) {}
 }
 toDelete.push(key);
 }
 }
 for (const key of toDelete) {
 trackedItems.delete(key);
 itemSpawnTimes.delete(key);
 }
 } catch (e) {}
}
function stopDisplayJob() {
 displayJobGeneration++;
 const jobId = displayJobId;
 displayJobId = undefined;
 if (jobId !== undefined) {
  try { system.clearJob(jobId); } catch {}
 }
}
function* runDisplayJob(generation, playerSnapshots) {
 try {
  yield* processItemsGenerator(generation, playerSnapshots);
 } finally {
  if (generation === displayJobGeneration) displayJobId = undefined;
 }
}
function scheduleDisplayJob() {
 if (!displayEnabled || displayJobId !== undefined) return;
 const playerSnapshots = getPlayerSnapshots();
 if (playerSnapshots.length === 0) return;
 const generation = ++displayJobGeneration;
 try {
  displayJobId = system.runJob(runDisplayJob(generation, playerSnapshots));
 } catch {
  if (generation === displayJobGeneration) displayJobId = undefined;
 }
}
function clearTrackedItems() {
 for (const [, text] of trackedItems) {
  if (!isEntityValid(text)) continue;
  try { text.remove(); } catch {}
 }
 trackedItems.clear();
 itemSpawnTimes.clear();
}
function resetDisplayState(removeOrphans = false) {
 stopDisplayJob();
 clearTrackedItems();
 if (removeOrphans) system.run(cleanupOrphanedTexts);
}
export function floatingItemsMenu(viewer) {
 new ActionFormData()
 .title("Floating Items Settings")
 .body(`§fCurrent Theme: §e${currentTheme}\n§fDisplay: ${displayEnabled ? "§aON" : "§cOFF"}\n§fTimer: ${timerEnabled ? "§aON" : "§cOFF"}\n§fRadar: ${radarEnabled ? "§aON" : "§cOFF"}`)
 .button("Change Theme", "textures/ui/color_picker")
 .button(`Toggle Display: ${displayEnabled ? "§aON" : "§cOFF"}`, "textures/items/name_tag")
 .button(`Toggle Timer: ${timerEnabled ? "§aON" : "§cOFF"}`, "textures/ui/timer")
 .button(`Toggle Radar: ${radarEnabled ? "§aON" : "§cOFF"}`, "textures/ui/spyglass_flat")
 .button("Back", "textures/ui/arrow_left")
 .show(viewer).then(r => {
 if (r.canceled) return;
 if (r.selection === 0) changeThemeMenu(viewer);
 else if (r.selection === 1) {
  displayEnabled = !displayEnabled;
  world.setDynamicProperty('sft:displayEnabled', displayEnabled);
  ensureDisplayInterval();
  if (!displayEnabled) {
  resetDisplayState(true);
  } else {
  scheduleDisplayJob();
 }
 floatingItemsMenu(viewer);
 } else if (r.selection === 2) {
 timerEnabled = !timerEnabled;
 world.setDynamicProperty('sft:timerEnabled', timerEnabled);
 floatingItemsMenu(viewer);
 } else if (r.selection === 3) {
  radarEnabled = !radarEnabled;
  world.setDynamicProperty('sft:radarEnabled', radarEnabled);
  ensureRadarInterval();
  if (!radarEnabled) {
  clearRadarMessages();
 }
 floatingItemsMenu(viewer);
 } else if (r.selection === 4) {
 floatingTextMenu(viewer);
 }
 });
}
function changeThemeMenu(viewer) {
 const keys = Object.keys(themes);
 const form = new ActionFormData().title("Select Theme");
 for (const k of keys) form.button(`${k}\n${themes[k].description}`);
 form.show(viewer).then(r => {
 if (r.canceled) return floatingItemsMenu(viewer);
 if (r.selection >= 0 && r.selection < keys.length) {
  currentTheme = keys[r.selection];
  world.setDynamicProperty('sft:theme', currentTheme);
  ensureRainbowInterval();
 viewer.sendMessage(`§aTheme changed to: §f${currentTheme}`);
  resetDisplayState();
  scheduleDisplayJob();
 }
 floatingItemsMenu(viewer);
 });
}
export function clearAllFloatingItemTexts() {
 resetDisplayState(true);
}
world.afterEvents.entityLoad?.subscribe(({ entity }) => {
 if (!isFloatingItemText(entity)) return;
 enqueueOrphanedItemText(entity);
 scheduleOrphanCleanupJob();
});
world.afterEvents.playerLeave?.subscribe(({ playerId }) => {
 playerSnapshotCache.clear();
 lastRadarMessage.delete(playerId);
 system.run(() => {
  stopDisplayJob();
  if (world.getPlayers().length > 0) {
   scheduleDisplayJob();
  } else {
   clearTrackedItems();
   cleanupOrphanedTexts();
   lastRadarMessage.clear();
  }
 });
});
system.run(() => {
 loadSettings();
 syncFeatureIntervals();
 cleanupOrphanedTexts();
 if (displayEnabled) scheduleDisplayJob();
 else resetDisplayState();
 if (!radarEnabled && lastRadarMessage.size > 0) clearRadarMessages();
});
