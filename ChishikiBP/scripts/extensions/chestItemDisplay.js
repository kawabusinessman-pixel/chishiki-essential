import { ItemComponentTypes } from "../core.js";

function hasChestTexture(typeId) {
  return typeof typeId === "string" && typeId.length > 0;
}

const POTION_BASE_TYPES = new Set([
 "minecraft:potion",
 "minecraft:splash_potion",
 "minecraft:lingering_potion",
]);

const POTION_EFFECT_TEXTURE_NAMES = {
 speed: "swiftness",
 swiftness: "swiftness",
 jumpboost: "leaping",
 jump_boost: "leaping",
 leaping: "leaping",
 instanthealth: "healing",
 instant_health: "healing",
 healing: "healing",
 instantdamage: "harming",
 instant_damage: "harming",
 harming: "harming",
 nightvision: "night_vision",
 night_vision: "night_vision",
 invisibility: "invisibility",
 fireresistance: "fire_resistance",
 fire_resistance: "fire_resistance",
 waterbreathing: "water_breathing",
 water_breathing: "water_breathing",
 regeneration: "regeneration",
 strength: "strength",
 weakness: "weakness",
 poison: "poison",
 slowness: "slowness",
 turtlemaster: "turtle_master",
 turtle_master: "turtle_master",
 slowfalling: "slow_falling",
 slow_falling: "slow_falling",
 decay: "decay",
 mundane: "mundane",
 thick: "thick",
 awkward: "awkward",
 windcharged: "wind_charged",
 wind_charged: "wind_charged",
 wind_charging: "wind_charged",
 weaving: "weaving",
 oozing: "oozing",
 infested: "infested",
 infestation: "infested",
};

const POTION_DISPLAY_NAMES = {
 swiftness: "Swiftness",
 leaping: "Leaping",
 healing: "Healing",
 harming: "Harming",
 night_vision: "Night Vision",
 invisibility: "Invisibility",
 fire_resistance: "Fire Resistance",
 water_breathing: "Water Breathing",
 regeneration: "Regeneration",
 strength: "Strength",
 weakness: "Weakness",
 poison: "Poison",
 slowness: "Slowness",
 turtle_master: "Turtle Master",
 slow_falling: "Slow Falling",
 decay: "Decay",
 mundane: "Mundane",
 thick: "Thick",
 awkward: "Awkward",
 wind_charged: "Wind Charging",
 weaving: "Weaving",
 oozing: "Oozing",
 infested: "Infestation",
};


const POTION_AUX_TO_EFFECT = new Map([
 [1, "mundane"], [2, "mundane"], [3, "thick"], [4, "awkward"],
 [5, "night_vision"], [6, "night_vision"], [7, "invisibility"], [8, "invisibility"],
 [9, "leaping"], [10, "leaping"], [11, "leaping"],
 [12, "fire_resistance"], [13, "fire_resistance"],
 [14, "swiftness"], [15, "swiftness"], [16, "swiftness"],
 [17, "slowness"], [18, "slowness"], [42, "slowness"],
 [19, "water_breathing"], [20, "water_breathing"],
 [21, "healing"], [22, "healing"], [23, "harming"], [24, "harming"],
 [25, "poison"], [26, "poison"], [27, "poison"],
 [28, "regeneration"], [29, "regeneration"], [30, "regeneration"],
 [31, "strength"], [32, "strength"], [33, "strength"],
 [34, "weakness"], [35, "weakness"],
 [36, "decay"],
 [37, "turtle_master"], [38, "turtle_master"], [39, "turtle_master"],
 [40, "slow_falling"], [41, "slow_falling"],
 [43, "wind_charged"], [44, "weaving"], [45, "oozing"], [46, "infested"],
]);


const BED_LANG_TO_COLOR = {
 white: "white", orange: "orange", magenta: "magenta", lightblue: "light_blue",
 yellow: "yellow", lime: "lime", pink: "pink", gray: "gray", silver: "light_gray",
 lightgray: "light_gray", cyan: "cyan", purple: "purple", blue: "blue",
 brown: "brown", green: "green", red: "red", black: "black",
};

export function bedColorTypeId(item) {
 try {
 const key = item?.localizationKey;
 const m = typeof key === "string" && key.match(/(?:item|tile)\.bed\.([a-z_]+)\.name/i);
 if (!m) return null;
 const color = BED_LANG_TO_COLOR[m[1].toLowerCase().replace(/_/g, "")];
 return color ? `minecraft:${color}_bed` : null;
 } catch {
 return null;
 }
}

export function formatTypeIdName(typeId) {
  return String(typeId || "")
    .replace(/.*(?<=:)/, "")
    .replace(/_/g, " ")
    .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
}

function getPotionComponent(item) {
 if (!item || typeof item.getComponent !== "function") return null;
 try {
 return item.getComponent(ItemComponentTypes.Potion ?? "minecraft:potion");
 } catch {
 try {
 return item.getComponent("minecraft:potion");
 } catch {
 return null;
 }
 }
}

export function normalizePotionEffectId(effectType) {
 const raw =
 typeof effectType === "string"
 ? effectType
 : effectType?.id || effectType?.typeId || effectType?.identifier || "";
 const id = String(raw)
 .replace(/^minecraft:/, "")
 .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
 .replace(/[^A-Za-z0-9_]+/g, "_")
 .toLowerCase();
 if (POTION_EFFECT_TEXTURE_NAMES[id]) return POTION_EFFECT_TEXTURE_NAMES[id];
 const compact = id.replace(/_/g, "");
 if (POTION_EFFECT_TEXTURE_NAMES[compact]) return POTION_EFFECT_TEXTURE_NAMES[compact];
 if (compact.includes("invis")) return "invisibility";
 if (compact.includes("night") && compact.includes("vision")) return "night_vision";
 if (compact.includes("fire") && compact.includes("resistance")) return "fire_resistance";
 if (compact.includes("water") && compact.includes("breathing")) return "water_breathing";
 if (compact.includes("slow") && compact.includes("fall")) return "slow_falling";
 if (compact.includes("turtle")) return "turtle_master";
 if (compact.includes("jump") || compact.includes("leap")) return "leaping";
 if (compact.includes("speed") || compact.includes("swift")) return "swiftness";
 if (compact.includes("heal") || compact.includes("health")) return "healing";
 if (compact.includes("harm") || compact.includes("damage")) return "harming";
 if (compact.includes("regen")) return "regeneration";
 if (compact.includes("strength")) return "strength";
 if (compact.includes("weak")) return "weakness";
 if (compact.includes("poison")) return "poison";
 if (compact.includes("slowness")) return "slowness";
 if (compact.includes("decay")) return "decay";
 if (compact.includes("mundane")) return "mundane";
 if (compact.includes("thick")) return "thick";
 if (compact.includes("awkward")) return "awkward";
 if (compact.includes("wind")) return "wind_charged";
 if (compact.includes("weav")) return "weaving";
 if (compact.includes("ooz")) return "oozing";
 if (compact.includes("infest")) return "infested";
 return "";
}

export function toRomanLevel(level) {
 const n = Math.max(1, Math.min(10, Number(level) || 1));
 return ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] || String(n);
}

export function formatTicks(ticks) {
 const totalSeconds = Math.max(0, Math.ceil(Number(ticks) / 20));
 const minutes = Math.floor(totalSeconds / 60);
 const seconds = totalSeconds % 60;
 return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function readPotionEffectInfo(item) {
 const potion = getPotionComponent(item);
 const effectName = normalizePotionEffectId(potion?.potionEffectType);
 if (!effectName) return null;
 const effectType = potion?.potionEffectType;
 const displayName = POTION_DISPLAY_NAMES[effectName] || formatTypeIdName(effectName);
 const rawLevel =
 potion?.amplifier ??
 potion?.level ??
 potion?.potionLevel ??
 effectType?.amplifier ??
 effectType?.level;
 const level = rawLevel === undefined ? undefined : Number(rawLevel) + 1;
 const rawDuration =
 effectType?.durationTicks ??
 potion?.durationTicks ??
 potion?.duration ??
 effectType?.duration;
 return {
 effectName,
 displayName,
 level,
 durationTicks: rawDuration === undefined ? undefined : Number(rawDuration),
 };
}

function getPotionKindLabel(typeId) {
 if (typeId === "minecraft:splash_potion") return "Splash Potion";
 if (typeId === "minecraft:lingering_potion") return "Lingering Potion";
 return "Potion";
}

function buildPotionVariantTypeId(baseTypeId, effectName) {
 const suffix =
 baseTypeId === "minecraft:splash_potion"
 ? "_splash_potion"
 : baseTypeId === "minecraft:lingering_potion"
 ? "_lingering_potion"
 : "_potion";
 return `minecraft:${effectName}${suffix}`;
}

export function potionEffectFromAux(data) {
 const aux = Math.floor(Number(data) || 0);
 return POTION_AUX_TO_EFFECT.get(aux) || "";
}

export function getDescriptorChestTexture(descriptor) {
 if (!descriptor?.typeId) return "minecraft:air";
 const base = descriptor.typeId;
 if (!POTION_BASE_TYPES.has(base)) return base;
 const effectName = descriptor.potionEffect || potionEffectFromAux(descriptor.data);
 if (!effectName) return base;
 const variant = buildPotionVariantTypeId(base, effectName);
 return hasChestTexture(variant) ? variant : base;
}

export function getItemChestTexture(item) {
 if (!item?.typeId) return "minecraft:air";
 if (typeof item.getComponent === "function") {
 const base = item.typeId;
 if (base === "minecraft:bed") {
 const variant = bedColorTypeId(item);
 return variant && hasChestTexture(variant) ? variant : base;
 }
 if (!POTION_BASE_TYPES.has(base)) return base;
 const potionInfo = readPotionEffectInfo(item);
 if (!potionInfo?.effectName) {
 const fromAux = potionEffectFromAux(item.data);
 if (fromAux) {
 const variant = buildPotionVariantTypeId(base, fromAux);
 if (hasChestTexture(variant)) return variant;
 }
 return base;
 }
 const variant = buildPotionVariantTypeId(base, potionInfo.effectName);
 return hasChestTexture(variant) ? variant : base;
 }
 return getDescriptorChestTexture(item);
}

export function getItemCustomName(item) {
 if (!item) return "";
 try {
 if (item.nameTag?.length) return item.nameTag;
 if (typeof item.getComponent === "function") {
 const nameComp = item.getComponent("minecraft:custom_name");
 if (nameComp?.name?.length) return nameComp.name;
 }
 if (typeof item.name === "string" && item.name.length) return item.name;
 } catch { }
 return "";
}

export function getItemDisplayName(item) {
 const name = getItemCustomName(item);
 if (name) return `§f${name}`;
 if (item?.typeId === "minecraft:bed") {
 const variant = bedColorTypeId(item);
 if (variant) return `§f${formatTypeIdName(variant)}`;
 }
 const typeId = item?.typeId;
 const potionInfo =
 typeof item?.getComponent === "function"
 ? readPotionEffectInfo(item)
 : item?.potionEffect
 ? {
 effectName: item.potionEffect,
 displayName: POTION_DISPLAY_NAMES[item.potionEffect] || formatTypeIdName(item.potionEffect),
 level: item.potionLevel,
 }
 : null;
 if (potionInfo && typeId) {
 const levelText = potionInfo.level && potionInfo.level > 1 ? ` ${toRomanLevel(potionInfo.level)}` : "";
 return `§f${getPotionKindLabel(typeId)} of ${potionInfo.displayName}${levelText}`;
 }
 return `§f${formatTypeIdName(typeId || "air")}`;
}

export function appendPotionLore(lines, item) {
 const potionInfo =
 typeof item?.getComponent === "function"
 ? readPotionEffectInfo(item)
 : item?.potionEffect
 ? {
 displayName: POTION_DISPLAY_NAMES[item.potionEffect] || formatTypeIdName(item.potionEffect),
 level: item.potionLevel,
 durationTicks: item.potionDurationTicks,
 }
 : null;
 if (!potionInfo) return;
 const levelText = potionInfo.level ? ` ${toRomanLevel(potionInfo.level)}` : "";
 const durationText =
 potionInfo.durationTicks !== undefined && potionInfo.durationTicks > 0
 ? ` (${formatTicks(potionInfo.durationTicks)})`
 : "";
 lines.push(`§9${potionInfo.displayName}${levelText}${durationText}`);
}
