export const DEFAULT_BATTLEPASS_SETTINGS = Object.freeze({
 seasonName: "Season 1",
 seasonDescription: "Complete rewards and increase your tier.",
 maxTier: 1000,
 premiumEnabled: false,
 premiumTag: "battlepass:premium",
});

export const DEFAULT_BATTLEPASS_REWARDS = Object.freeze([
  Object.freeze({
    name: "Starter Bread",
    levelRequired: 5,
    texture: "textures/items/bread",
    command: "give @s bread 16",
    tag: "bp:free_1",
    track: "free",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Iron Ingot Bundle",
    levelRequired: 10,
    texture: "textures/items/iron_ingot",
    command: "give @s iron_ingot 8",
    tag: "bp:free_2",
    track: "free",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Iron Sword",
    levelRequired: 20,
    texture: "textures/items/iron_sword",
    command: "give @s iron_sword 1",
    tag: "bp:free_3",
    track: "free",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Golden Carrots",
    levelRequired: 35,
    texture: "textures/items/carrot_golden",
    command: "give @s golden_carrot 12",
    tag: "bp:free_4",
    track: "free",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Diamonds",
    levelRequired: 50,
    texture: "textures/items/diamond",
    command: "give @s diamond 4",
    tag: "bp:free_5",
    track: "free",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Experience Bottles",
    levelRequired: 75,
    texture: "textures/items/experience_bottle",
    command: "give @s experience_bottle 16",
    tag: "bp:free_6",
    track: "free",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Golden Apple",
    levelRequired: 100,
    texture: "textures/items/apple_golden",
    command: "give @s golden_apple 2",
    tag: "bp:free_7",
    track: "free",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Netherite Ingot",
    levelRequired: 150,
    texture: "textures/items/netherite_ingot",
    command: "give @s netherite_ingot 1",
    tag: "bp:free_8",
    track: "free",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Golden Apples",
    levelRequired: 5,
    texture: "textures/items/apple_golden",
    command: "give @s golden_apple 4",
    tag: "bp:prem_1",
    track: "premium",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Diamond Pickaxe",
    levelRequired: 10,
    texture: "textures/items/diamond_pickaxe",
    command: "give @s diamond_pickaxe 1",
    tag: "bp:prem_2",
    track: "premium",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Emerald Stash",
    levelRequired: 20,
    texture: "textures/items/emerald",
    command: "give @s emerald 16",
    tag: "bp:prem_3",
    track: "premium",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Diamond Chestplate",
    levelRequired: 35,
    texture: "textures/items/diamond_chestplate",
    command: "give @s diamond_chestplate 1",
    tag: "bp:prem_4",
    track: "premium",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Totem of Undying",
    levelRequired: 50,
    texture: "textures/items/totem",
    command: "give @s totem_of_undying 1",
    tag: "bp:prem_5",
    track: "premium",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Diamond Stash",
    levelRequired: 75,
    texture: "textures/items/diamond",
    command: "give @s diamond 12",
    tag: "bp:prem_6",
    track: "premium",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Enchanted Golden Apple",
    levelRequired: 100,
    texture: "textures/items/apple_golden",
    command: "give @s enchanted_golden_apple 1",
    tag: "bp:prem_7",
    track: "premium",
    isRankReward: false,
    rankName: null,
  }),
  Object.freeze({
    name: "Netherite Scrap Bundle",
    levelRequired: 150,
    texture: "textures/items/netherite_scrap",
    command: "give @s netherite_scrap 4",
    tag: "bp:prem_8",
    track: "premium",
    isRankReward: false,
    rankName: null,
  }),
]);

function normalizePlainText(value, fallback, maxLength) {
 const text = String(value ?? "")
 .replace(/§[0-9a-fk-or]/gi, "")
 .replace(/[\u0000-\u001f\u007f]+/g, " ")
 .replace(/\s+/g, " ")
 .trim();
 return (text || fallback).slice(0, maxLength);
}

export function isValidBattlepassTag(value) {
 return /^[A-Za-z0-9:_-]{1,64}$/.test(String(value ?? "").trim());
}

export function normalizeBattlepassSettings(value) {
 const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
 const numericTier = Number(source.maxTier);
 const maxTier = Number.isFinite(numericTier)
 ? Math.min(1000, Math.max(1, Math.trunc(numericTier)))
 : DEFAULT_BATTLEPASS_SETTINGS.maxTier;
 const premiumTag = String(source.premiumTag ?? "").trim();
 return {
 seasonName: normalizePlainText(source.seasonName, DEFAULT_BATTLEPASS_SETTINGS.seasonName, 40),
 seasonDescription: normalizePlainText(
 source.seasonDescription,
 DEFAULT_BATTLEPASS_SETTINGS.seasonDescription,
 120,
 ),
 maxTier,
 premiumEnabled: source.premiumEnabled === true,
 premiumTag: isValidBattlepassTag(premiumTag)
 ? premiumTag
 : DEFAULT_BATTLEPASS_SETTINGS.premiumTag,
 };
}
