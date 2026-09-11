import { custom_content } from "../extensions/constants.js";
import { getItemChestTexture } from "../extensions/chestItemDisplay.js";
import {
 ITEM_TYPE_TO_ICON,
 TEXTURE_ATLAS,
 VANILLA_ITEM_ATLAS,
 VANILLA_TERRAIN_ATLAS,
} from "./itemIconRegistry.generated.js";

const FALLBACK_ICON = "textures/ui/trade_icon";

const BED_COLORS = [
 "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
 "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
];


const ITEM_TEXTURE_ALIASES = {
  "minecraft:beef": "textures/items/beef_raw",
  "minecraft:cooked_beef": "textures/items/beef_cooked",
  "minecraft:porkchop": "textures/items/porkchop_raw",
  "minecraft:cooked_porkchop": "textures/items/porkchop_cooked",
  "minecraft:mutton": "textures/items/mutton_raw",
  "minecraft:cooked_mutton": "textures/items/mutton_cooked",
  "minecraft:chicken": "textures/items/chicken_raw",
  "minecraft:cooked_chicken": "textures/items/chicken_cooked",
  "minecraft:rabbit": "textures/items/rabbit_raw",
  "minecraft:cooked_rabbit": "textures/items/rabbit_cooked",
  "minecraft:cod": "textures/items/fish_raw",
  "minecraft:cooked_cod": "textures/items/fish_cooked",
  "minecraft:salmon": "textures/items/fish_salmon_raw",
  "minecraft:cooked_salmon": "textures/items/fish_salmon_cooked",
  "minecraft:tropical_fish": "textures/items/fish_clownfish_raw",
  "minecraft:pufferfish": "textures/items/fish_pufferfish_raw",
  "minecraft:wooden_sword": "textures/items/wood_sword",
  "minecraft:wooden_shovel": "textures/items/wood_shovel",
  "minecraft:wooden_pickaxe": "textures/items/wood_pickaxe",
  "minecraft:wooden_axe": "textures/items/wood_axe",
  "minecraft:wooden_hoe": "textures/items/wood_hoe",
  "minecraft:golden_sword": "textures/items/gold_sword",
  "minecraft:golden_shovel": "textures/items/gold_shovel",
  "minecraft:golden_pickaxe": "textures/items/gold_pickaxe",
  "minecraft:golden_axe": "textures/items/gold_axe",
  "minecraft:golden_hoe": "textures/items/gold_hoe",
  "minecraft:golden_helmet": "textures/items/gold_helmet",
  "minecraft:golden_chestplate": "textures/items/gold_chestplate",
  "minecraft:golden_leggings": "textures/items/gold_leggings",
  "minecraft:golden_boots": "textures/items/gold_boots",
  "minecraft:golden_horse_armor": "textures/items/gold_horse_armor",
  "minecraft:diamond_horse_armor": "textures/items/diamond_horse_armor",
  "minecraft:iron_horse_armor": "textures/items/iron_horse_armor",
  "minecraft:leather_horse_armor": "textures/items/leather_horse_armor",
  "minecraft:sugar_cane": "textures/items/reeds",
  "minecraft:melon_slice": "textures/items/melon",
  "minecraft:totem_of_undying": "textures/items/totem",
  "minecraft:firework_rocket": "textures/items/fireworks",
  "minecraft:firework_star": "textures/items/fireworks_charge",
  "minecraft:fire_charge": "textures/items/fireball",
  "minecraft:book": "textures/items/book_normal",
  "minecraft:enchanted_book": "textures/items/book_enchanted",
  "minecraft:writable_book": "textures/items/book_writable",
  "minecraft:written_book": "textures/items/book_written",
  "minecraft:knowledge_book": "textures/items/book_knowledge",
  "minecraft:map": "textures/items/map_empty",
  "minecraft:empty_map": "textures/items/map_empty",
  "minecraft:filled_map": "textures/items/map_filled",
  "minecraft:locator_map": "textures/items/map_locator_empty",
  "minecraft:lead": "textures/items/lead",
  "minecraft:name_tag": "textures/items/name_tag",
  "minecraft:saddle": "textures/items/saddle",
  "minecraft:snowball": "textures/items/snowball",
  "minecraft:egg": "textures/items/egg",
  "minecraft:glistering_melon_slice": "textures/items/melon_speckled",
  "minecraft:turtle_scute": "textures/items/turtle_shell_piece",
  "minecraft:scute": "textures/items/turtle_shell_piece",
  "minecraft:lapis_lazuli": "textures/items/dye_powder_blue",
  "minecraft:redstone": "textures/items/redstone_dust",
  "minecraft:gunpowder": "textures/items/gunpowder",
  "minecraft:slime_ball": "textures/items/slimeball",
  "minecraft:magma_cream": "textures/items/magma_cream",
  "minecraft:fermented_spider_eye": "textures/items/spider_eye_fermented",
  "minecraft:netherbrick": "textures/items/netherbrick",
  "minecraft:nether_brick": "textures/items/netherbrick",
  "minecraft:carrot_on_a_stick": "textures/items/carrot_on_a_stick",
  "minecraft:warped_fungus_on_a_stick": "textures/items/fungus_on_a_stick",
  "minecraft:bow": "textures/items/bow_standby",
  "minecraft:crossbow": "textures/items/crossbow_standby",
  "minecraft:fishing_rod": "textures/items/fishing_rod_uncast",
  "minecraft:clock": "textures/items/clock_item",
  "minecraft:compass": "textures/items/compass_item",
  "minecraft:recovery_compass": "textures/items/recovery_compass_atlas",
  "minecraft:sweet_berries": "textures/items/sweet_berries",
  "minecraft:glow_berries": "textures/items/glow_berries",
  "minecraft:wheat_seeds": "textures/items/seeds_wheat",
  "minecraft:pumpkin_seeds": "textures/items/seeds_pumpkin",
  "minecraft:melon_seeds": "textures/items/seeds_melon",
  "minecraft:beetroot_seeds": "textures/items/seeds_beetroot",
  "minecraft:torchflower_seeds": "textures/items/seeds_torchflower",
  "minecraft:pitcher_pod": "textures/items/pitcher_pod",
  "minecraft:shears": "textures/items/shears",
  "minecraft:flint_and_steel": "textures/items/flint_and_steel",
  "minecraft:potion": "textures/items/potion_bottle_drinkable",
  "minecraft:splash_potion": "textures/items/potion_bottle_splash",
  "minecraft:lingering_potion": "textures/items/potion_bottle_lingering",
  "minecraft:glass_bottle": "textures/items/potion_bottle_empty",
  "minecraft:honey_bottle": "textures/items/honey_bottle",
  "minecraft:experience_bottle": "textures/items/experience_bottle",
  "minecraft:dragon_breath": "textures/items/dragon_breath",
  "minecraft:ominous_bottle": "textures/items/ominous_bottle",
  "minecraft:tipped_arrow": "textures/items/tipped_arrow",
  "minecraft:nautilus_shell": "textures/items/nautilus",
  "minecraft:heart_of_the_sea": "textures/items/heartofthesea_closed",
  "minecraft:sulfur_cube_bucket": "textures/items/bucket_sulfur_cube",
};

const BLOCK_TEXTURE_ALIASES = {
  "minecraft:grass_block": "textures/blocks/grass_side_carried",
  "minecraft:dirt": "textures/blocks/dirt",
  "minecraft:coarse_dirt": "textures/blocks/coarse_dirt",
  "minecraft:stone": "textures/blocks/stone",
  "minecraft:cobblestone": "textures/blocks/cobblestone",
  "minecraft:mossy_cobblestone": "textures/blocks/cobblestone_mossy",
  "minecraft:stone_bricks": "textures/blocks/stonebrick",
  "minecraft:stonebrick": "textures/blocks/stonebrick",
  "minecraft:oak_planks": "textures/blocks/planks_oak",
  "minecraft:spruce_planks": "textures/blocks/planks_spruce",
  "minecraft:birch_planks": "textures/blocks/planks_birch",
  "minecraft:jungle_planks": "textures/blocks/planks_jungle",
  "minecraft:acacia_planks": "textures/blocks/planks_acacia",
  "minecraft:dark_oak_planks": "textures/blocks/planks_big_oak",
  "minecraft:mangrove_planks": "textures/blocks/mangrove_planks",
  "minecraft:cherry_planks": "textures/blocks/cherry_planks",
  "minecraft:bamboo_planks": "textures/blocks/bamboo_planks",
  "minecraft:crimson_planks": "textures/blocks/planks_crimson",
  "minecraft:warped_planks": "textures/blocks/planks_warped",
  "minecraft:planks": "textures/blocks/planks_oak",
  "minecraft:oak_log": "textures/blocks/log_oak",
  "minecraft:birch_log": "textures/blocks/log_birch",
  "minecraft:spruce_log": "textures/blocks/log_spruce",
  "minecraft:jungle_log": "textures/blocks/log_jungle",
  "minecraft:acacia_log": "textures/blocks/log_acacia",
  "minecraft:dark_oak_log": "textures/blocks/log_big_oak",
  "minecraft:mangrove_log": "textures/blocks/mangrove_log_side",
  "minecraft:cherry_log": "textures/blocks/cherry_log_side",
  "minecraft:log": "textures/blocks/log_oak",
  "minecraft:crafting_table": "textures/blocks/crafting_table_front",
  "minecraft:furnace": "textures/blocks/furnace_front_off",
  "minecraft:blast_furnace": "textures/blocks/blast_furnace_front_off",
  "minecraft:smoker": "textures/blocks/smoker_front_off",
  "minecraft:chest": "textures/blocks/chest_front",
  "minecraft:ender_chest": "textures/blocks/ender_chest_front",
  "minecraft:trapped_chest": "textures/blocks/trapped_chest_front",
  "minecraft:barrel": "textures/blocks/barrel_top",
  "minecraft:bookshelf": "textures/blocks/bookshelf",
  "minecraft:tnt": "textures/blocks/tnt_side",
  "minecraft:sponge": "textures/blocks/sponge",
  "minecraft:wet_sponge": "textures/blocks/sponge_wet",
  "minecraft:glass": "textures/blocks/glass",
  "minecraft:glass_pane": "textures/blocks/glass_pane_top",
  "minecraft:sand": "textures/blocks/sand",
  "minecraft:red_sand": "textures/blocks/sand_red",
  "minecraft:gravel": "textures/blocks/gravel",
  "minecraft:sandstone": "textures/blocks/sandstone_normal",
  "minecraft:red_sandstone": "textures/blocks/red_sandstone_normal",
  "minecraft:obsidian": "textures/blocks/obsidian",
  "minecraft:crying_obsidian": "textures/blocks/crying_obsidian",
  "minecraft:glowstone": "textures/blocks/glowstone",
  "minecraft:sea_lantern": "textures/blocks/sea_lantern",
  "minecraft:magma_block": "textures/blocks/magma",
  "minecraft:magma": "textures/blocks/magma",
  "minecraft:soul_sand": "textures/blocks/soul_sand",
  "minecraft:soul_soil": "textures/blocks/soul_soil",
  "minecraft:netherrack": "textures/blocks/netherrack",
  "minecraft:end_stone": "textures/blocks/end_stone",
  "minecraft:purpur_block": "textures/blocks/purpur_block",
  "minecraft:bricks": "textures/blocks/brick",
  "minecraft:brick_block": "textures/blocks/brick",
  "minecraft:smooth_stone": "textures/blocks/stone_slab_top",
  "minecraft:bedrock": "textures/blocks/bedrock",
  "minecraft:barrier": "textures/blocks/barrier",
  "minecraft:ice": "textures/blocks/ice",
  "minecraft:packed_ice": "textures/blocks/ice_packed",
  "minecraft:blue_ice": "textures/blocks/ice_blue",
  "minecraft:snow_block": "textures/blocks/snow",
  "minecraft:clay": "textures/blocks/clay",
  "minecraft:hay_block": "textures/blocks/hay_block_side",
  "minecraft:target": "textures/blocks/target_top",
  "minecraft:beehive": "textures/blocks/beehive_front",
  "minecraft:bee_nest": "textures/blocks/bee_nest_front",
  "minecraft:bell": "textures/blocks/bell_top",
  "minecraft:torch": "textures/blocks/torch_on",
  "minecraft:soul_torch": "textures/blocks/soul_torch",
  "minecraft:redstone_torch": "textures/blocks/redstone_torch_on",
  "minecraft:redstone_lamp": "textures/blocks/redstone_lamp_off",
  "minecraft:lever": "textures/blocks/lever",
  "minecraft:piston": "textures/blocks/piston_side",
  "minecraft:sticky_piston": "textures/blocks/piston_top_sticky",
  "minecraft:slime_block": "textures/blocks/slime",
  "minecraft:honey_block": "textures/blocks/honey_side",
  "minecraft:honeycomb_block": "textures/blocks/honeycomb",
  "minecraft:iron_block": "textures/blocks/iron_block",
  "minecraft:gold_block": "textures/blocks/gold_block",
  "minecraft:diamond_block": "textures/blocks/diamond_block",
  "minecraft:emerald_block": "textures/blocks/emerald_block",
  "minecraft:lapis_block": "textures/blocks/lapis_block",
  "minecraft:redstone_block": "textures/blocks/redstone_block",
  "minecraft:netherite_block": "textures/blocks/netherite_block",
  "minecraft:coal_block": "textures/blocks/coal_block",
  "minecraft:copper_block": "textures/blocks/copper_block",
  "minecraft:raw_iron_block": "textures/blocks/raw_iron_block",
  "minecraft:raw_gold_block": "textures/blocks/raw_gold_block",
  "minecraft:raw_copper_block": "textures/blocks/raw_copper_block",
  "minecraft:amethyst_block": "textures/blocks/amethyst_block",
  "minecraft:coal_ore": "textures/blocks/coal_ore",
  "minecraft:iron_ore": "textures/blocks/iron_ore",
  "minecraft:gold_ore": "textures/blocks/gold_ore",
  "minecraft:diamond_ore": "textures/blocks/diamond_ore",
  "minecraft:emerald_ore": "textures/blocks/emerald_ore",
  "minecraft:lapis_ore": "textures/blocks/lapis_ore",
  "minecraft:redstone_ore": "textures/blocks/redstone_ore",
  "minecraft:copper_ore": "textures/blocks/copper_ore",
  "minecraft:deepslate_coal_ore": "textures/blocks/deepslate_coal_ore",
  "minecraft:deepslate_iron_ore": "textures/blocks/deepslate_iron_ore",
  "minecraft:deepslate_gold_ore": "textures/blocks/deepslate_gold_ore",
  "minecraft:deepslate_diamond_ore": "textures/blocks/deepslate_diamond_ore",
  "minecraft:deepslate_emerald_ore": "textures/blocks/deepslate_emerald_ore",
  "minecraft:deepslate_lapis_ore": "textures/blocks/deepslate_lapis_ore",
  "minecraft:deepslate_redstone_ore": "textures/blocks/deepslate_redstone_ore",
  "minecraft:deepslate_copper_ore": "textures/blocks/deepslate_copper_ore",
  "minecraft:deepslate": "textures/blocks/deepslate",
  "minecraft:cobbled_deepslate": "textures/blocks/cobbled_deepslate",
  "minecraft:polished_deepslate": "textures/blocks/deepslate_polished",
  "minecraft:deepslate_bricks": "textures/blocks/deepslate_bricks",
  "minecraft:deepslate_tiles": "textures/blocks/deepslate_tiles",
  "minecraft:tuff": "textures/blocks/tuff",
  "minecraft:calcite": "textures/blocks/calcite",
  "minecraft:dripstone_block": "textures/blocks/dripstone_block",
  "minecraft:andesite": "textures/blocks/stone_andesite",
  "minecraft:polished_andesite": "textures/blocks/stone_andesite_smooth",
  "minecraft:diorite": "textures/blocks/stone_diorite",
  "minecraft:polished_diorite": "textures/blocks/stone_diorite_smooth",
  "minecraft:granite": "textures/blocks/stone_granite",
  "minecraft:polished_granite": "textures/blocks/stone_granite_smooth",
  "minecraft:prismarine": "textures/blocks/prismarine_rough",
  "minecraft:prismarine_bricks": "textures/blocks/prismarine_bricks",
  "minecraft:dark_prismarine": "textures/blocks/prismarine_dark",
  "minecraft:terracotta": "textures/blocks/hardened_clay",
  "minecraft:white_terracotta": "textures/blocks/hardened_clay_stained_white",
  "minecraft:orange_terracotta": "textures/blocks/hardened_clay_stained_orange",
  "minecraft:magenta_terracotta": "textures/blocks/hardened_clay_stained_magenta",
  "minecraft:light_blue_terracotta": "textures/blocks/hardened_clay_stained_light_blue",
  "minecraft:yellow_terracotta": "textures/blocks/hardened_clay_stained_yellow",
  "minecraft:lime_terracotta": "textures/blocks/hardened_clay_stained_lime",
  "minecraft:pink_terracotta": "textures/blocks/hardened_clay_stained_pink",
  "minecraft:gray_terracotta": "textures/blocks/hardened_clay_stained_gray",
  "minecraft:light_gray_terracotta": "textures/blocks/hardened_clay_stained_silver",
  "minecraft:cyan_terracotta": "textures/blocks/hardened_clay_stained_cyan",
  "minecraft:purple_terracotta": "textures/blocks/hardened_clay_stained_purple",
  "minecraft:blue_terracotta": "textures/blocks/hardened_clay_stained_blue",
  "minecraft:brown_terracotta": "textures/blocks/hardened_clay_stained_brown",
  "minecraft:green_terracotta": "textures/blocks/hardened_clay_stained_green",
  "minecraft:red_terracotta": "textures/blocks/hardened_clay_stained_red",
  "minecraft:black_terracotta": "textures/blocks/hardened_clay_stained_black",
  "minecraft:white_wool": "textures/blocks/wool_colored_white",
  "minecraft:orange_wool": "textures/blocks/wool_colored_orange",
  "minecraft:magenta_wool": "textures/blocks/wool_colored_magenta",
  "minecraft:light_blue_wool": "textures/blocks/wool_colored_light_blue",
  "minecraft:yellow_wool": "textures/blocks/wool_colored_yellow",
  "minecraft:lime_wool": "textures/blocks/wool_colored_lime",
  "minecraft:pink_wool": "textures/blocks/wool_colored_pink",
  "minecraft:gray_wool": "textures/blocks/wool_colored_gray",
  "minecraft:light_gray_wool": "textures/blocks/wool_colored_silver",
  "minecraft:cyan_wool": "textures/blocks/wool_colored_cyan",
  "minecraft:purple_wool": "textures/blocks/wool_colored_purple",
  "minecraft:blue_wool": "textures/blocks/wool_colored_blue",
  "minecraft:brown_wool": "textures/blocks/wool_colored_brown",
  "minecraft:green_wool": "textures/blocks/wool_colored_green",
  "minecraft:red_wool": "textures/blocks/wool_colored_red",
  "minecraft:black_wool": "textures/blocks/wool_colored_black",
  "minecraft:wool": "textures/blocks/wool_colored_white",
  "minecraft:white_concrete": "textures/blocks/concrete_white",
  "minecraft:orange_concrete": "textures/blocks/concrete_orange",
  "minecraft:magenta_concrete": "textures/blocks/concrete_magenta",
  "minecraft:light_blue_concrete": "textures/blocks/concrete_light_blue",
  "minecraft:yellow_concrete": "textures/blocks/concrete_yellow",
  "minecraft:lime_concrete": "textures/blocks/concrete_lime",
  "minecraft:pink_concrete": "textures/blocks/concrete_pink",
  "minecraft:gray_concrete": "textures/blocks/concrete_gray",
  "minecraft:light_gray_concrete": "textures/blocks/concrete_silver",
  "minecraft:cyan_concrete": "textures/blocks/concrete_cyan",
  "minecraft:purple_concrete": "textures/blocks/concrete_purple",
  "minecraft:blue_concrete": "textures/blocks/concrete_blue",
  "minecraft:brown_concrete": "textures/blocks/concrete_brown",
  "minecraft:green_concrete": "textures/blocks/concrete_green",
  "minecraft:red_concrete": "textures/blocks/concrete_red",
  "minecraft:black_concrete": "textures/blocks/concrete_black",
  "minecraft:concrete": "textures/blocks/concrete_white",
  "minecraft:oak_stairs": "textures/blocks/planks_oak",
  "minecraft:spruce_stairs": "textures/blocks/planks_spruce",
  "minecraft:birch_stairs": "textures/blocks/planks_birch",
  "minecraft:jungle_stairs": "textures/blocks/planks_jungle",
  "minecraft:acacia_stairs": "textures/blocks/planks_acacia",
  "minecraft:dark_oak_stairs": "textures/blocks/planks_big_oak",
  "minecraft:stone_stairs": "textures/blocks/stone",
  "minecraft:cobblestone_stairs": "textures/blocks/cobblestone",
  "minecraft:stone_brick_stairs": "textures/blocks/stonebrick",
  "minecraft:oak_slab": "textures/blocks/planks_oak",
  "minecraft:spruce_slab": "textures/blocks/planks_spruce",
  "minecraft:birch_slab": "textures/blocks/planks_birch",
  "minecraft:jungle_slab": "textures/blocks/planks_jungle",
  "minecraft:acacia_slab": "textures/blocks/planks_acacia",
  "minecraft:dark_oak_slab": "textures/blocks/planks_big_oak",
  "minecraft:stone_slab": "textures/blocks/stone_slab_top",
  "minecraft:oak_fence": "textures/blocks/planks_oak",
  "minecraft:spruce_fence": "textures/blocks/planks_spruce",
  "minecraft:birch_fence": "textures/blocks/planks_birch",
  "minecraft:jungle_fence": "textures/blocks/planks_jungle",
  "minecraft:acacia_fence": "textures/blocks/planks_acacia",
  "minecraft:dark_oak_fence": "textures/blocks/planks_big_oak",
  "minecraft:fence": "textures/blocks/planks_oak",
  "minecraft:oak_fence_gate": "textures/blocks/planks_oak",
  "minecraft:fence_gate": "textures/blocks/planks_oak",
  "minecraft:oak_door": "textures/items/door_wood",
  "minecraft:wooden_door": "textures/items/door_wood",
  "minecraft:iron_door": "textures/items/door_iron",
  "minecraft:spruce_door": "textures/items/door_spruce",
  "minecraft:birch_door": "textures/items/door_birch",
  "minecraft:jungle_door": "textures/items/door_jungle",
  "minecraft:acacia_door": "textures/items/door_acacia",
  "minecraft:dark_oak_door": "textures/items/door_dark_oak",
  "minecraft:oak_trapdoor": "textures/blocks/trapdoor",
  "minecraft:trapdoor": "textures/blocks/trapdoor",
  "minecraft:iron_trapdoor": "textures/blocks/iron_trapdoor",
  "minecraft:oak_pressure_plate": "textures/blocks/planks_oak",
  "minecraft:wooden_pressure_plate": "textures/blocks/planks_oak",
  "minecraft:stone_pressure_plate": "textures/blocks/stone",
  "minecraft:light_weighted_pressure_plate": "textures/blocks/gold_block",
  "minecraft:heavy_weighted_pressure_plate": "textures/blocks/iron_block",
  "minecraft:oak_button": "textures/blocks/planks_oak",
  "minecraft:wooden_button": "textures/blocks/planks_oak",
  "minecraft:stone_button": "textures/blocks/stone",
  "minecraft:oak_sign": "textures/items/sign",
  "minecraft:sign": "textures/items/sign",
  "minecraft:spruce_sign": "textures/items/sign_spruce",
  "minecraft:birch_sign": "textures/items/sign_birch",
  "minecraft:jungle_sign": "textures/items/sign_jungle",
  "minecraft:acacia_sign": "textures/items/sign_acacia",
  "minecraft:dark_oak_sign": "textures/items/sign_darkoak",
  "minecraft:bed": "textures/items/bed_white",
};


const BUCKET_TEXTURE_INDEX = {
 bucket: 0,
 milk_bucket: 1,
 water_bucket: 2,
 lava_bucket: 3,
 cod_bucket: 4,
 salmon_bucket: 5,
 tropical_fish_bucket: 6,
 pufferfish_bucket: 7,
 powder_snow_bucket: 8,
 axolotl_bucket: 9,
 tadpole_bucket: 10,
 sulfur_cube_bucket: 11,
};

const POTION_EFFECT_BOTTLE = {
  mundane: "drinkable",
  thick: "drinkable",
  awkward: "drinkable",
  night_vision: "nightVision",
  nightvision: "nightVision",
  invisibility: "invisibility",
  leaping: "jump",
  jump: "jump",
  jump_boost: "jump",
  jumpboost: "jump",
  fire_resistance: "fireResistance",
  fireresistance: "fireResistance",
  swiftness: "moveSpeed",
  speed: "moveSpeed",
  movespeed: "moveSpeed",
  slowness: "moveSlowdown",
  slowdown: "moveSlowdown",
  moveslowdown: "moveSlowdown",
  water_breathing: "waterBreathing",
  waterbreathing: "waterBreathing",
  healing: "heal",
  heal: "heal",
  instant_health: "heal",
  instanthealth: "heal",
  harming: "harm",
  harm: "harm",
  instant_damage: "harm",
  instantdamage: "harm",
  poison: "poison",
  regeneration: "regeneration",
  strength: "damageBoost",
  damage_boost: "damageBoost",
  damageboost: "damageBoost",
  weakness: "weakness",
  decay: "wither",
  wither: "wither",
  turtle_master: "turtleMaster",
  turtlemaster: "turtleMaster",
  slow_falling: "slowFall",
  slowfall: "slowFall",
  slow_fall: "slowFall",
  wind_charged: "windCharged",
  windcharged: "windCharged",
  weaving: "weaving",
  oozing: "oozing",
  infested: "infested",
};

function normalizeItemId(raw) {
  const s = String(raw || "").trim().replace(/^[<>\s]+|[<>\s]+$/g, "");
  if (!s) return "";
  return s.includes(":") ? s : `minecraft:${s}`;
}

function texturePath(tex) {
  if (!tex) return "";
  return tex.replace(/\.png$/i, "");
}

function atlasEntryPath(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return texturePath(entry);
  if (Array.isArray(entry)) {
    const first = entry.find((v) => typeof v === "string" && v);
    return first ? texturePath(first) : "";
  }
  return "";
}

function bedColorName(color) {
 return color === "light_gray" ? "silver" : color;
}

function resolveIconName(iconName) {
 const key = String(iconName || "").trim();
 if (!key) return "";
 if (key.startsWith("textures/")) return texturePath(key);
 if (TEXTURE_ATLAS[key]) return texturePath(TEXTURE_ATLAS[key]);
 if (VANILLA_ITEM_ATLAS[key]) return atlasEntryPath(VANILLA_ITEM_ATLAS[key]);
 return `textures/items/${key}`;
}

function iconNameForTypeId(typeId) {
 if (ITEM_TYPE_TO_ICON[typeId]) return ITEM_TYPE_TO_ICON[typeId];
 const custom = custom_content[typeId];
 if (custom?.texture) {
 const tex = String(custom.texture);
 const base = tex.replace(/^textures\/items\//, "");
 if (base) return base;
 }
 return "";
}

function naiveVanillaItemTexture(id) {
 return texturePath(`textures/items/${id.replace(/^.*:/, "")}`);
}

function resolveBedTexture(typeId) {
 const base = typeId.replace(/^.*:/, "");
 if (base === "bed") return texturePath("textures/items/bed_white");
 const m = base.match(/^(.+)_bed$/);
 if (!m) return "";
 return texturePath(`textures/items/bed_${bedColorName(m[1])}`);
}

function resolveShulkerTexture(typeId) {
 const base = typeId.replace(/^.*:/, "");
 if (base === "shulker_box" || base === "undyed_shulker_box") {
 return texturePath("textures/blocks/shulker_top_undyed");
 }
 const m = base.match(/^(.+)_shulker_box$/);
 if (!m) return "";
 return texturePath(`textures/blocks/shulker_top_${bedColorName(m[1])}`);
}

function resolveBucketTexture(typeId) {
 const base = typeId.replace(/^.*:/, "");
 const idx = BUCKET_TEXTURE_INDEX[base];
 if (idx === undefined) return "";
 const entry = VANILLA_ITEM_ATLAS.bucket;
 if (!Array.isArray(entry)) return "";
 return atlasEntryPath(entry[idx]);
}


function resolveSpawnEggTexture(typeId) {
 const base = typeId.replace(/^.*:/, "");
 if (!base.endsWith("_spawn_egg")) return "";
 const mob = base.slice(0, -"_spawn_egg".length);
 if (!mob) return "";
 return atlasEntryPath(VANILLA_ITEM_ATLAS[`spawn_egg_${mob}`]);
}

function resolvePotionTexture(typeId) {
  const base = typeId.replace(/^.*:/, "");
  if (base === "potion") return texturePath("textures/items/potion_bottle_drinkable");
  if (base === "splash_potion") return texturePath("textures/items/potion_bottle_splash");
  if (base === "lingering_potion") return texturePath("textures/items/potion_bottle_lingering");
  if (base === "glass_bottle") return texturePath("textures/items/potion_bottle_empty");
  if (base === "experience_bottle") return texturePath("textures/items/experience_bottle");
  if (base === "honey_bottle") return texturePath("textures/items/honey_bottle");
  if (base === "dragon_breath") return texturePath("textures/items/dragon_breath");
  if (base === "ominous_bottle") return texturePath("textures/items/ominous_bottle");
  if (base === "tipped_arrow") return texturePath("textures/items/tipped_arrow");

  const m = base.match(/^(.+)_(splash_potion|lingering_potion|potion|arrow)$/);
  if (!m) return "";
  const effect = m[1];
  const kind = m[2];
  if (kind === "arrow") {
    return texturePath("textures/items/tipped_arrow");
  }
  const bottle = POTION_EFFECT_BOTTLE[effect] || effect;
  if (kind === "potion") {
    if (bottle === "drinkable") return texturePath("textures/items/potion_bottle_drinkable");
    return texturePath(`textures/items/potion_bottle_${bottle}`);
  }
  if (kind === "splash_potion") {
    if (bottle === "drinkable") return texturePath("textures/items/potion_bottle_splash");
    return texturePath(`textures/items/potion_bottle_splash_${bottle}`);
  }
  if (bottle === "drinkable") return texturePath("textures/items/potion_bottle_lingering");
  return texturePath(`textures/items/potion_bottle_lingering_${bottle}`);
}

function resolveColoredArrayTexture(typeId, atlasKey) {
 const base = typeId.replace(/^.*:/, "");
 const m = base.match(/^(.+)_(wool|carpet)$/);
 if (!m) return "";
 const idx = BED_COLORS.indexOf(m[1]);
 if (idx < 0) return "";
 const entry = VANILLA_TERRAIN_ATLAS[atlasKey] ?? VANILLA_ITEM_ATLAS[atlasKey];
 if (!entry || !Array.isArray(entry)) return "";
 return atlasEntryPath(entry[idx]);
}

function resolveTerrainTexture(typeId) {
  const base = typeId.replace(/^.*:/, "");
  const direct =
    VANILLA_TERRAIN_ATLAS[base]
    || VANILLA_TERRAIN_ATLAS[`${base}_carried`]
    || VANILLA_TERRAIN_ATLAS[`${base}_top`];
  if (direct) return atlasEntryPath(direct);

  const wool = resolveColoredArrayTexture(typeId, "wool");
  if (wool) return wool;

  const stem = base.replace(/_(wall|stairs|slab|fence|fence_gate|button|pressure_plate|trapdoor|door|sign|hanging_sign)$/, "");
  if (stem && stem !== base) {
    const stemDirect =
      VANILLA_TERRAIN_ATLAS[stem]
      || VANILLA_TERRAIN_ATLAS[`${stem}_carried`]
      || VANILLA_TERRAIN_ATLAS[`${stem}_top`]
      || BLOCK_TEXTURE_ALIASES[`minecraft:${stem}`];
    if (stemDirect) return atlasEntryPath(stemDirect);
  }

  return "";
}

function resolveVanillaItemAtlas(typeId) {
  const base = typeId.replace(/^.*:/, "");
  const entry = VANILLA_ITEM_ATLAS[base];
  if (!entry) return "";
  if (base === "bed" && Array.isArray(entry)) {
    return atlasEntryPath(entry[0]);
  }
  return atlasEntryPath(entry);
}

function guessVanillaItemTexture(id) {
  const itemAlias = ITEM_TEXTURE_ALIASES[id];
  if (itemAlias) return itemAlias;

  const alias = BLOCK_TEXTURE_ALIASES[id];
  if (alias) return alias;

  const bed = resolveBedTexture(id);
  if (bed) return bed;

  const shulker = resolveShulkerTexture(id);
  if (shulker) return shulker;

  const potion = resolvePotionTexture(id);
  if (potion) return potion;

  const bucket = resolveBucketTexture(id);
  if (bucket) return bucket;

  const spawnEgg = resolveSpawnEggTexture(id);
  if (spawnEgg) return spawnEgg;

  const itemAtlas = resolveVanillaItemAtlas(id);
  if (itemAtlas) return itemAtlas;

  const terrain = resolveTerrainTexture(id);
  if (terrain) return terrain;

  const base = id.replace(/^.*:/, "");
  const stem = base.replace(/_(wall|stairs|slab|fence|fence_gate|button|pressure_plate|trapdoor|door|sign|hanging_sign)$/, "");
  if (stem && stem !== base) {
    const stemDirect =
      VANILLA_TERRAIN_ATLAS[stem]
      || VANILLA_TERRAIN_ATLAS[`${stem}_carried`]
      || VANILLA_TERRAIN_ATLAS[`${stem}_top`]
      || BLOCK_TEXTURE_ALIASES[`minecraft:${stem}`]
      || ITEM_TEXTURE_ALIASES[`minecraft:${stem}`];
    if (stemDirect) return atlasEntryPath(stemDirect);
  }

  if (/_block$|^grass_|^dirt$|^stone$|^sand$|_planks$|_wool$|_ore$|_wall$|_stairs$|_slab$/.test(base)) {
    return `textures/blocks/${base}`;
  }
  if (/_log$/.test(base)) {
    const species = base.replace(/_log$/, "");
    return `textures/blocks/log_${species}`;
  }
  return `textures/items/${base}`;
}

function guessCustomItemTexture(id) {
 const iconName = iconNameForTypeId(id);
 if (iconName) return resolveIconName(iconName);

 const base = id.replace(/^.*:/, "");
 if (TEXTURE_ATLAS[base]) return resolveIconName(base);
 return resolveIconName(base);
}

export function resolveActionFormItemIcon(typeId, manualTexture = "") {
 const id = normalizeItemId(typeId);
 const manual = String(manualTexture || "").trim();
 if (manual.startsWith("textures/")) {
 const tex = texturePath(manual);
 if (id.startsWith("minecraft:") && tex === naiveVanillaItemTexture(id)) {
 return guessVanillaItemTexture(id);
 }
 return tex;
 }

 if (!id) return FALLBACK_ICON;

 const custom = custom_content[id];
 if (custom?.texture) return texturePath(custom.texture);

 if (id.startsWith("minecraft:")) {
 return guessVanillaItemTexture(id);
 }

 const customTex = guessCustomItemTexture(id);
 if (customTex && customTex !== FALLBACK_ICON) return customTex;

 return FALLBACK_ICON;
}

export function resolveActionFormItemIconFromStack(stack) {
 if (!stack?.typeId) return FALLBACK_ICON;
 return resolveActionFormItemIcon(getItemChestTexture(stack));
}


export function coalesceItemIconTexture(typeId, storedTexture = "") {
 const id = normalizeItemId(typeId);
 const resolved = resolveActionFormItemIcon(id);
 const stored = String(storedTexture || "").trim();
 if (!stored) return resolved;
 const storedPath = stored.startsWith("textures/") ? texturePath(stored) : stored;
 const naive = naiveVanillaItemTexture(id);
 if (storedPath === naive && resolved !== storedPath && resolved !== FALLBACK_ICON) {
 return resolved;
 }
 return storedPath.startsWith("textures/") ? texturePath(stored) : resolved;
}
