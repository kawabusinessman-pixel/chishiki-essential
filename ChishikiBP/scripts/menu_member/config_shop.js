const configshop = {
 gui: {
 name: {
 title: "§6SHOP UI",
 },
 },
}
function createItem(texture, name, cost, sell, data, item, notsold = false, enchantments = null) {
 return {
 textures: texture,
 name: name,
 cost: cost,
 sell: sell,
 data: data,
 item: item,
 ...(notsold && { notsold: true }),
 ...(enchantments && { enchantments }),
 }
}
const itemBlock = [
 createItem("textures/blocks/grass_side_carried.png", "Grass", 80, 15, 0, "grass_block"),
 createItem("textures/blocks/moss_block.png", "Moss", 109, 20, 0, "moss_block"),
 createItem("textures/blocks/dirt_with_roots.png", "Rooted Dirt", 62, 15, 0, "dirt_with_roots"),
 createItem("textures/blocks/dirt.png", "Dirt", 62, 10, 0, "dirt"),
 createItem("textures/blocks/sand.png", "Sand", 62, 10, 0, "sand"),
 createItem("textures/blocks/red_sand.png", "Red Sand", 62, 10, 0, "red_sand"),
 createItem("textures/blocks/gravel.png", "Gravel", 62, 10, 0, "gravel"),
 createItem("textures/blocks/clay.png", "Clay", 62, 10, 0, "clay"),
 createItem("textures/blocks/cobblestone.png", "Cobblestone", 93, 15, 0, "cobblestone"),
 createItem("textures/blocks/stone.png", "Stone", 109, 20, 0, "stone"),
 createItem("textures/blocks/stone_granite.png", "Granite", 109, 20, 1, "granite"),
 createItem("textures/blocks/stone_granite_smooth.png", "Polished Granite", 109, 20, 2, "polished_granite"),
 createItem("textures/blocks/stone_diorite.png", "Diorite", 109, 20, 3, "diorite"),
 createItem("textures/blocks/stone_diorite_smooth.png", "Polished Diorite", 109, 20, 4, "polished_diorite"),
 createItem("textures/blocks/stone_andesite.png", "Andesite", 109, 20, 5, "andesite"),
 createItem("textures/blocks/stone_andesite_smooth.png", "Polished Andesite", 109, 20, 6, "polished_andesite"),
 createItem("textures/blocks/blackstone.png", "Blackstone", 109, 20, 0, "blackstone"),
 createItem("textures/blocks/polished_blackstone.png", "Polished Blackstone", 109, 20, 0, "polished_blackstone"),
 createItem("textures/blocks/deepslate/deepslate.png", "Deepslate", 109, 20, 0, "deepslate"),
 createItem("textures/blocks/deepslate/polished_deepslate.png", "Polished Deepslate", 109, 20, 0, "polished_deepslate"),
 createItem("textures/blocks/prismarine_rough.png", "Prismarine", 109, 20, 0, "prismarine"),
 createItem("textures/blocks/prismarine_bricks.png", "Prismarine Bricks", 109, 20, 2, "prismarine"),
 createItem("textures/blocks/prismarine_dark.png", "Prismarine Dark", 109, 20, 1, "prismarine"),
 createItem("textures/blocks/end_stone.png", "End Stone", 109, 20, 0, "end_stone"),
 createItem("textures/blocks/end_bricks.png", "End Bricks", 109, 20, 0, "end_bricks"),
 createItem("textures/blocks/sandstone_normal.png", "Sandstone", 109, 20, 0, "sandstone"),
]
const itemBlockColor = Array.from({ length: 16 }, (_, i) => createItem(`textures/blocks/wool_colored_${["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "silver", "cyan", "purple", "blue", "brown", "green", "red", "black"][i]}.png`, "Wool", 50, 7, i, "wool"))
const itemLog = [
 createItem("textures/blocks/log_oak.png", "Oak Log", 45, 5, 0, "oak_log"),
 createItem("textures/blocks/log_birch.png", "Birch Log", 45, 5, 0, "birch_log"),
 createItem("textures/blocks/log_spruce.png", "Spruce Log", 45, 5, 0, "spruce_log"),
 createItem("textures/blocks/log_jungle.png", "Jungle Log", 45, 5, 0, "jungle_log"),
 createItem("textures/blocks/log_acacia.png", "Acacia Log", 45, 5, 0, "acacia_log"),
 createItem("textures/blocks/log_big_oak.png", "Dark Oak Log", 45, 5, 0, "dark_oak_log"),
 createItem("textures/blocks/mangrove_log_side.png", "Mangrove Log", 45, 5, 0, "mangrove_log"),
 createItem("textures/blocks/cherry_log_side.png", "Cherry Log", 45, 5, 0, "cherry_log"),
]
const itemFurniture = [
 createItem("textures/blocks/crafting_table_front.png", "Crafting Table", 60, 5, 0, "crafting_table"),
 createItem("textures/blocks/furnace_front_off.png", "Furnace", 156, 10, 0, "furnace"),
 createItem("textures/blocks/cauldron_side.png", "Cauldron", 7500, 250, 0, "cauldron"),
 createItem("textures/blocks/anvil_top_damaged_0.png", "Anvil", 32000, 500, 0, "anvil"),
 createItem("textures/blocks/bookshelf.png", "Bookshelf", 1500, 150, 0, "bookshelf"),
 createItem("textures/blocks/noteblock.png", "Noteblock", 156, 10, 0, "noteblock"),
 createItem("textures/blocks/enchanting_table_side.png", "Enchanting Table", 12000, 1200, 0, "enchanting_table"),
 createItem("textures/blocks/chest_front.png", "Chest", 200, 20, 0, "chest"),
 createItem("textures/blocks/shulker_top_white.png", "Shulker Box", 30000, 0, 0, "shulker_box", true),
 createItem("textures/blocks/torch_on.png", "Torch", 200, 5, 0, "torch"),
 createItem("textures/blocks/end_rod.png", "End Rod", 100, 5, 0, "end_rod"),
]
const itemGlass = [
 createItem("textures/blocks/glass.png", "Glass", 100, 5, 0, "glass"),
 createItem("textures/blocks/glass_white.png", "White Stained Glass", 100, 5, 0, "white_stained_glass"),
 createItem("textures/blocks/glass_orange.png", "Orange Stained Glass", 100, 5, 0, "orange_stained_glass"),
 createItem("textures/blocks/glass_magenta.png", "Magenta Stained Glass", 100, 5, 0, "magenta_stained_glass"),
 createItem("textures/blocks/glass_light_blue.png", "Light Blue Stained Glass", 100, 5, 0, "light_blue_stained_glass"),
 createItem("textures/blocks/glass_yellow.png", "Yellow Stained Glass", 100, 5, 0, "yellow_stained_glass"),
 createItem("textures/blocks/glass_lime.png", "Lime Stained Glass", 100, 5, 0, "lime_stained_glass"),
 createItem("textures/blocks/glass_pink.png", "Pink Stained Glass", 100, 5, 0, "pink_stained_glass"),
 createItem("textures/blocks/glass_gray.png", "Gray Stained Glass", 100, 5, 0, "gray_stained_glass"),
 createItem("textures/blocks/glass_silver.png", "Light Gray Stained Glass", 100, 5, 0, "light_gray_stained_glass"),
 createItem("textures/blocks/glass_cyan.png", "Cyan Stained Glass", 100, 5, 0, "cyan_stained_glass"),
 createItem("textures/blocks/glass_purple.png", "Purple Stained Glass", 100, 5, 0, "purple_stained_glass"),
 createItem("textures/blocks/glass_blue.png", "Blue Stained Glass", 100, 5, 0, "blue_stained_glass"),
 createItem("textures/blocks/glass_brown.png", "Brown Stained Glass", 100, 5, 0, "brown_stained_glass"),
 createItem("textures/blocks/glass_green.png", "Green Stained Glass", 100, 5, 0, "green_stained_glass"),
 createItem("textures/blocks/glass_red.png", "Red Stained Glass", 100, 5, 0, "red_stained_glass"),
 createItem("textures/blocks/glass_black.png", "Black Stained Glass", 100, 5, 0, "black_stained_glass"),
]
const itemSword = [createItem("textures/items/iron_sword.png", "Sword", 2000, 0, 0, "iron_sword", true), createItem("textures/items/gold_sword.png", "Sword", 4000, 0, 0, "gold_sword", true), createItem("textures/items/diamond_sword.png", "Sword", 6000, 0, 0, "diamond_sword", true)]
const itemAxe = [createItem("textures/items/iron_axe", "Iron Axe", 3000, 0, 0, "iron_axe", true), createItem("textures/items/gold_axe.png", "Gold Axe", 6000, 0, 0, "gold_axe", true), createItem("textures/items/diamond_axe.png", "Diamond Axe", 9000, 0, 0, "diamond_axe", true)]
const itemPickaxe = [createItem("textures/items/iron_pickaxe.png", "Iron Pickaxe", 3000, 0, 0, "iron_pickaxe", true), createItem("textures/items/gold_pickaxe.png", "Gold Pickaxe", 6000, 0, 0, "gold_pickaxe", true), createItem("textures/items/diamond_pickaxe.png", "Diamond Pickaxe", 9000, 0, 0, "diamond_pickaxe", true)]
const itemShovel = [createItem("textures/items/iron_shovel.png", "Iron Shovel", 1000, 0, 0, "iron_shovel", true), createItem("textures/items/gold_shovel.png", "Gold Shovel", 2000, 0, 0, "gold_shovel", true), createItem("textures/items/diamond_shovel.png", "Diamond Shovel", 3000, 0, 0, "diamond_shovel", true)]
const itemHelmet = [
 createItem("textures/items/leather_helmet.png", "Leather Helmet", 1000, 0, 0, "leather_helmet", true),
 createItem("textures/items/chainmail_helmet.png", "Chainmail Helmet", 2000, 0, 0, "chainmail_helmet", true),
 createItem("textures/items/iron_helmet.png", "Iron Helmet", 3000, 0, 0, "iron_helmet", true),
 createItem("textures/items/gold_helmet.png", "Gold Helmet", 4000, 0, 0, "golden_helmet", true),
 createItem("textures/items/diamond_helmet.png", "Diamond Helmet", 5000, 0, 0, "diamond_helmet", true),
 createItem("textures/items/netherite_helmet.png", "Netherite Helmet", 10000, 0, 0, "netherite_helmet", true),
]
const itemChestplate = [
 createItem("textures/items/leather_chestplate.png", "Leather Chestplate", 1600, 0, 0, "leather_chestplate", true),
 createItem("textures/items/chainmail_chestplate.png", "Chainmail Chestplate", 3200, 0, 0, "chainmail_chestplate", true),
 createItem("textures/items/iron_chestplate.png", "Iron Chestplate", 4800, 0, 0, "iron_chestplate", true),
 createItem("textures/items/gold_chestplate.png", "Gold Chestplate", 6400, 0, 0, "golden_chestplate", true),
 createItem("textures/items/diamond_chestplate.png", "Diamond Chestplate", 8000, 0, 0, "diamond_chestplate", true),
 createItem("textures/items/netherite_chestplate.png", "Netherite Chestplate", 16000, 0, 0, "netherite_chestplate", true),
]
const itemLeggings = [
 createItem("textures/items/leather_leggings.png", "Leather Leggings", 1400, 0, 0, "leather_leggings", true),
 createItem("textures/items/chainmail_leggings.png", "Chainmail Leggings", 2800, 0, 0, "chainmail_leggings", true),
 createItem("textures/items/iron_leggings.png", "Iron Leggings", 4200, 0, 0, "iron_leggings", true),
 createItem("textures/items/gold_leggings.png", "Gold Leggings", 5600, 0, 0, "golden_leggings", true),
 createItem("textures/items/diamond_leggings.png", "Diamond Leggings", 7000, 0, 0, "diamond_leggings", true),
 createItem("textures/items/netherite_leggings.png", "Netherite Leggings", 14000, 0, 0, "netherite_leggings", true),
]
const itemBoots = [
 createItem("textures/items/leather_boots.png", "Leather Boots", 800, 0, 0, "leather_boots", true),
 createItem("textures/items/chainmail_boots.png", "Chainmail Boots", 1600, 0, 0, "chainmail_boots", true),
 createItem("textures/items/iron_boots.png", "Iron Boots", 2400, 0, 0, "iron_boots", true),
 createItem("textures/items/gold_boots.png", "Gold Boots", 3200, 0, 0, "golden_boots", true),
 createItem("textures/items/diamond_boots.png", "Diamond Boots", 4000, 0, 0, "diamond_boots", true),
 createItem("textures/items/netherite_boots.png", "Netherite Boots", 8000, 0, 0, "netherite_boots", true),
]
const itemFarm = [
 createItem("textures/items/stone_hoe.png", "Stone Hoe", 500, 2, 0, "stone_hoe"),
 createItem("textures/items/seeds_wheat.png", "Wheat Seeds", 50, 2, 0, "wheat_seeds"),
 createItem("textures/items/seeds_melon.png", "Melon Seeds", 50, 2, 0, "melon_seeds"),
 createItem("textures/items/seeds_beetroot.png", "Beetroot Seeds", 50, 2, 0, "beetroot_seeds"),
 createItem("textures/items/wheat.png", "Wheat", 250, 5, 0, "wheat"),
 createItem("textures/items/beetroot.png", "Beetroot", 250, 5, 0, "beetroot"),
 createItem("textures/items/carrot.png", "Carrot", 250, 5, 0, "carrot"),
 createItem("textures/items/potato.png", "Potato", 250, 5, 0, "potato"),
 createItem("textures/items/reeds.png", "Sugar Cane", 400, 10, 0, "sugar_cane"),
 createItem("textures/items/dye_powder_white.png", "Bone Meal", 250, 5, 0, "bone_meal"),
]
const itemFood = [
 createItem("textures/items/bread.png", "Bread", 100, 3, 0, "bread"),
 createItem("textures/items/beef_cooked.png", "Cooked Beef", 156, 5, 0, "cooked_beef"),
 createItem("textures/items/porkchop_cooked.png", "Cooked Porkchop", 156, 5, 0, "cooked_porkchop"),
 createItem("textures/items/chicken_cooked.png", "Cooked Chicken", 156, 5, 0, "cooked_chicken"),
 createItem("textures/items/mutton_cooked.png", "Cooked Mutton", 156, 5, 0, "cooked_mutton"),
 createItem("textures/items/apple.png", "Apple", 150, 3, 0, "apple"),
 createItem("textures/items/apple_golden.png", "Golden Apple", 15000, 500, 0, "golden_apple"),
 createItem("textures/items/apple_golden.png", "Enchanted Golden Apple", 100000, 5000, 0, "enchanted_golden_apple"),
]
const itemOres = [
 createItem("textures/items/coal.png", "Coal", 50, 5, 0, "coal"),
 createItem("textures/items/copper_ingot.png", "Copper Ingot", 100, 10, 0, "copper_ingot"),
 createItem("textures/items/iron_ingot", "Iron Ingot", 1000, 50, 0, "iron_ingot"),
 createItem("textures/items/gold_ingot.png", "Gold Ingot", 2000, 75, 0, "gold_ingot"),
 createItem("textures/items/emerald.png", "Emerald", 5000, 150, 0, "emerald"),
 createItem("textures/items/diamond.png", "Diamond", 3000, 300, 0, "diamond"),
 createItem("textures/items/netherite_ingot.png", "Netherite", 50000, 2000, 0, "netherite_ingot"),
]
const itemSpawner = [
 createItem("textures/blocks/mob_spawner.png", "Mob Spawner", 500000, 0, 0, "mob_spawner", true),
 createItem("textures/items/egg_zombie.png", "Zombie Spawn Egg", 1000000, 0, 0, "zombie_spawn_egg", true),
 createItem("textures/items/egg_skeleton.png", "Skeleton Spawn Egg", 1000000, 0, 0, "skeleton_spawn_egg", true),
 createItem("textures/items/egg_spider.png", "Spider Spawn Egg", 1000000, 0, 0, "spider_spawn_egg", true),
 createItem("textures/items/egg_creeper.png", "Creeper Spawn Egg", 1000000, 0, 0, "creeper_spawn_egg", true),
 createItem("textures/items/egg_enderman.png", "Enderman Spawn Egg", 1500000, 0, 0, "enderman_spawn_egg", true),
]
const itemEnchantedBook = [
 createItem("textures/items/book_enchanted.png", "Sharpness V", 10000, 0, 0, "enchanted_book", true, "minecraft:sharpness:5"),
 createItem("textures/items/book_enchanted.png", "Protection IV", 8000, 0, 0, "enchanted_book", true, "minecraft:protection:4"),
 createItem("textures/items/book_enchanted.png", "Efficiency V", 10000, 0, 0, "enchanted_book", true, "minecraft:efficiency:5"),
 createItem("textures/items/book_enchanted.png", "Unbreaking III", 5000, 0, 0, "enchanted_book", true, "minecraft:unbreaking:3"),
 createItem("textures/items/book_enchanted.png", "Mending", 20000, 0, 0, "enchanted_book", true, "minecraft:mending:1"),
 createItem("textures/items/book_enchanted.png", "Fortune III", 15000, 0, 0, "enchanted_book", true, "minecraft:fortune:3"),
 createItem("textures/items/book_enchanted.png", "Silk Touch", 10000, 0, 0, "enchanted_book", true, "minecraft:silk_touch:1"),
]
const itemArmor = [...itemHelmet, ...itemChestplate, ...itemLeggings, ...itemBoots]

const shopSettings = {
 currency: "money",
 currencySymbol: "$",
 currencyName: "Money",
 currencyMode: "money",
}

const shopConfig = {
 categories: [
 { id: "blocks", name: "§l§0(§1§lBLOCKS§l§0)", icon: "textures/blocks/cobblestone.png", enabled: true },
 { id: "wool", name: "§l§0(§2§lWOOL§l§0)", icon: "textures/blocks/wool_colored_white.png", enabled: true },
 { id: "wood", name: "§l§0(§3§lWOOD§l§0)", icon: "textures/blocks/log_oak.png", enabled: true },
 { id: "furniture", name: "§l§0(§4§lFURNITURE§l§0)", icon: "textures/blocks/crafting_table_front.png", enabled: true },
 { id: "glass", name: "§l§0(§6§lGLASS§l§0)", icon: "textures/blocks/glass_black.png", enabled: true },
 { id: "tools", name: "§l§0(§8§lTOOLS§l§0)", icon: "textures/items/diamond_sword.png", enabled: true },
 { id: "helmet", name: "§l§0(§a§lHELMET§l§0)", icon: "textures/items/diamond_helmet.png", enabled: true },
 { id: "chestplate", name: "§l§0(§a§lCHESTPLATE§l§0)", icon: "textures/items/diamond_chestplate.png", enabled: true },
 { id: "leggings", name: "§l§0(§a§lLEGGINGS§l§0)", icon: "textures/items/diamond_leggings.png", enabled: true },
 { id: "boots", name: "§l§0(§a§lBOOTS§l§0)", icon: "textures/items/diamond_boots.png", enabled: true },
 { id: "farming", name: "§l§0(§b§lFARMING§l§0)", icon: "textures/items/carrot.png", enabled: true },
 { id: "food", name: "§l§0(§e§lFOOD§l§0)", icon: "textures/items/beef_cooked.png", enabled: true },
 { id: "ores", name: "§l§0(§f§lORES§l§0)", icon: "textures/items/diamond.png", enabled: true },
 { id: "spawner", name: "§l§0(§g§lSPAWNER§l§0)", icon: "textures/blocks/mob_spawner.png", enabled: true },
 { id: "enchanted_books", name: "§l§0(§d§lENCHANTED BOOKS§l§0)", icon: "textures/items/book_enchanted.png", enabled: true },
 ],
 items: {
 blocks: itemBlock,
 wool: itemBlockColor,
 wood: itemLog,
 furniture: itemFurniture,
 glass: itemGlass,
 tools: [...itemSword, ...itemAxe, ...itemPickaxe, ...itemShovel],
 helmet: itemHelmet,
 chestplate: itemChestplate,
 leggings: itemLeggings,
 boots: itemBoots,
 farming: itemFarm,
 food: itemFood,
 ores: itemOres,
 spawner: itemSpawner,
 enchanted_books: itemEnchantedBook,
 },
}

function loadShopConfig() {
 return shopConfig
}

function getShopCurrency() {
 return shopSettings.currency
}

function getShopCurrencySymbol() {
 return shopSettings.currencySymbol
}

function getShopCurrencyName() {
 return shopSettings.currencyName
}

function getShopCurrencyMode() {
 return shopSettings.currencyMode
}

export { configshop, shopConfig, shopSettings, loadShopConfig, getShopCurrency, getShopCurrencySymbol, getShopCurrencyName, getShopCurrencyMode, itemBlock, itemBlockColor, itemLog, itemFurniture, itemGlass, itemHelmet, itemChestplate, itemLeggings, itemBoots, itemArmor, itemFarm, itemFood, itemOres, itemSpawner, itemSword, itemPickaxe, itemAxe, itemShovel, itemEnchantedBook }
