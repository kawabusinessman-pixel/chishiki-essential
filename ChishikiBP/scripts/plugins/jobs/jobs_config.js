export const JOBS_ADDON_CONFIG = {
    menu: {
        // Set to true if you ever want the old clock opener back.
        enableClockMenu: false,
        requireSneakForClockMenu: true,
        command: {
            name: 'kiw:job',
            description: 'Open the Jobs GUI.',
            permissionLevel: 'Any',
            cheatsRequired: false
        }
    },

    leaderboard: {
        // Sidebar still tracks the default score objective. Set true if you want a classic scoreboard sidebar.
        enableSidebarMoney: false,
        guiEntries: 10
    },

    currency: {
        // Initial objective used until an admin changes it in-game.
        // Runtime command: /kiw:job_currency <objective> [copy|move|empty].
        // Objective validation is strict on purpose: 1-16 letters, numbers, or underscores.
        defaultObjective: 'money',
        displayName: 'Money',
        dynamicProperty: 'jobs_currency_objective_v1'
    },

    history: {
        // Rolling log size kept in player dynamic properties.
        maxEntries: 30,
        guiEntries: 12
    },

    notifications: {
        defaults: {
            rewardChat: true,
            rewardActionBar: true,
            questMessages: true,
            achievementMessages: true,
            levelUpMessages: true,
            salaryMessages: true,
            systemTips: true
        }
    },

    rewards: {
        // Backward-compatible default. Runtime changes use currency.defaultObjective + /kiw:job_currency.
        defaultScoreObjective: 'money',

        // Job activity rewards.
        // Score = economy money. XP = vanilla experience via player.addExperience().
        // Use just XP for economy-free servers, or combine both to award money + XP together.
        activity: [
            { type: 'score', objective: 'default', amountSource: 'computed' }
            // Example vanilla XP reward:
            // ,{ type: 'xp', amountSource: 'computed', multiplier: 0.2, round: 'round', min: 1 }
        ],

        // Quest completion rewards.
        quest: [
            { type: 'score', objective: 'default', amountSource: 'configured' }
            // ,{ type: 'xp', amountSource: 'configured', multiplier: 0.25, round: 'round', min: 1 }
        ],

        // Achievement unlock rewards.
        achievement: [
            { type: 'score', objective: 'default', amountSource: 'configured' }
        ],

        // Salary payouts.
        salary: [
            { type: 'score', objective: 'default', amountSource: 'computed' }
        ],

        // Per-job rewards are appended to the defaults above.
        perJob: {
            // miner: {
            //     activity: [
            //         { type: 'item', itemId: 'minecraft:raw_iron', amount: 1 },
            //         { type: 'xp', amount: 2 }
            //     ]
            // }
        }
    }
};

// Server owners can safely edit this file to add, remove, or rebalance jobs.
// Supported upgrade match rules:
// - match.includesAny: reward source contains any token
// - match.equalsAny: reward source exactly matches one value
export const JOB_DEFINITIONS = {
    MINER: {
        id: 'miner',
        name: '§6Miner§r',
        description: '§7Extract precious ores and minerals from the earth. Specializes in deep mining and rare ore extraction.',
        icon: 'diamond_pickaxe',
        baseSalary: 60,
        color: '§6',
        category: 'gathering',
        upgrades: [
            { level: 10, name: 'Deep Miner', bonus: '2x rewards for deepslate ores', multiplier: 2.0, match: { includesAny: ['deepslate'] } },
            { level: 25, name: 'Nether Expert', bonus: '2.5x Nether ore rewards', multiplier: 2.5, match: { includesAny: ['nether', 'quartz'] } },
            { level: 50, name: 'Ancient Excavator', bonus: '4x Ancient Debris rewards', multiplier: 4.0, match: { includesAny: ['ancient_debris'] } },
            { level: 75, name: 'Master Prospector', bonus: '1.5x all ore rewards', multiplier: 1.5 }
        ]
    },

    CRAFTER: {
        id: 'crafter',
        name: '§aCrafter§r',
        description: '§7Craft tools, weapons, and complex redstone contraptions. Essential for civilization advancement.',
        icon: 'textures/blocks/crafting_table_front',
        baseSalary: 55,
        color: '§a',
        category: 'crafting',
        upgrades: [
            { level: 10, name: 'Tool Smith', bonus: '2x tool crafting rewards', multiplier: 2.0, match: { includesAny: ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'] } },
            { level: 25, name: 'Redstone Engineer', bonus: '3x redstone component rewards', multiplier: 3.0, match: { includesAny: ['redstone', 'repeater', 'comparator', 'observer'] } },
            { level: 50, name: 'Master Artisan', bonus: '2x all crafted item rewards', multiplier: 2.0 }
        ]
    },

    FARMER: {
        id: 'farmer',
        name: '§2Farmer§r',
        description: '§7Cultivate crops, tend to animals, and harvest nature\'s bounty. The backbone of any economy.',
        icon: 'gold_hoe',
        baseSalary: 45,
        color: '§2',
        category: 'gathering',
        upgrades: [
            { level: 10, name: 'Crop Master', bonus: '2x crop harvesting rewards', multiplier: 2.0, match: { includesAny: ['wheat', 'carrots', 'potatoes', 'beetroot'] } },
            { level: 25, name: 'Animal Husband', bonus: '2x animal breeding rewards', multiplier: 2.0, match: { includesAny: ['breed'] } },
            { level: 50, name: 'Agriculturalist', bonus: '2.5x all farming rewards', multiplier: 2.5 }
        ]
    },

    FISHERMAN: {
        id: 'fisherman',
        name: '§9Fisherman§r',
        description: '§7Cast your line for aquatic treasures. From common fish to legendary enchanted books.',
        icon: 'fishing_rod_uncast',
        baseSalary: 50,
        color: '§9',
        category: 'gathering',
        upgrades: [
            { level: 10, name: 'Treasure Hunter', bonus: '2x treasure fishing rewards', multiplier: 2.0, match: { includesAny: ['bow', 'enchanted_book', 'name_tag', 'saddle', 'nautilus_shell', 'heart_of_the_sea'] } },
            { level: 25, name: 'Deep Sea Angler', bonus: '2x rare fish rewards', multiplier: 2.0, match: { includesAny: ['tropical_fish', 'pufferfish'] } },
            { level: 50, name: 'Legendary Fisher', bonus: '3x all fishing rewards', multiplier: 3.0 }
        ]
    },

    HUNTER: {
        id: 'hunter',
        name: '§cHunter§r',
        description: '§7Track and eliminate hostile mobs. Protect the realm from dangerous creatures.',
        icon: 'bow_standby',
        baseSalary: 55,
        color: '§c',
        category: 'combat',
        upgrades: [
            { level: 10, name: 'Monster Slayer', bonus: '1.5x common mob rewards', multiplier: 1.5, match: { includesAny: ['zombie', 'skeleton', 'creeper', 'spider'] } },
            { level: 25, name: 'Elite Hunter', bonus: '2x rare mob rewards', multiplier: 2.0, match: { includesAny: ['witch', 'enderman', 'phantom', 'blaze'] } },
            { level: 50, name: 'Boss Slayer', bonus: '2.5x boss rewards', multiplier: 2.5, match: { includesAny: ['ender_dragon', 'wither', 'warden', 'elder_guardian'] } }
        ]
    },

    EXPLORER: {
        id: 'explorer',
        name: '§dExplorer§r',
        description: '§7Discover new lands, chart unknown territories, and find hidden structures.',
        icon: 'map_empty',
        baseSalary: 40,
        color: '§d',
        category: 'adventure',
        upgrades: [
            { level: 10, name: 'Cartographer', bonus: '2x structure discovery rewards', multiplier: 2.0, match: { includesAny: ['structure'] } },
            { level: 25, name: 'Dimension Walker', bonus: '2.5x dimension travel rewards', multiplier: 2.5, match: { includesAny: ['dimension'] } },
            { level: 50, name: 'Legendary Explorer', bonus: '2x all exploration rewards', multiplier: 2.0 }
        ]
    },

    BUILDER: {
        id: 'builder',
        name: '§eBuilder§r',
        description: '§7Construct magnificent structures. Shape the world with your architectural vision.',
        icon: 'brick',
        baseSalary: 35,
        color: '§e',
        category: 'crafting',
        upgrades: [
            { level: 10, name: 'Architect', bonus: '2x building block placement', multiplier: 2.0, match: { includesAny: ['brick', 'stone', 'planks', 'concrete', 'terracotta', 'glass', 'wool', 'wood'] } },
            { level: 25, name: 'Decorator', bonus: '3x decoration block rewards', multiplier: 3.0, match: { includesAny: ['glass', 'wool', 'carpet', 'flower'] } },
            { level: 50, name: 'Master Builder', bonus: '2x all building rewards', multiplier: 2.0 }
        ]
    },

    ENCHANTER: {
        id: 'enchanter',
        name: '§5Enchanter§r',
        description: '§7Master the arcane arts. Imbue items with magical properties.',
        icon: 'book_enchanted',
        baseSalary: 65,
        color: '§5',
        category: 'magic',
        upgrades: [
            { level: 10, name: 'Apprentice Enchanter', bonus: '1.5x enchantment table rewards', multiplier: 1.5, match: { equalsAny: ['enchanting_table'] } },
            { level: 25, name: 'Rune Master', bonus: '2x anvil enchant rewards', multiplier: 2.0, match: { includesAny: ['anvil'] } },
            { level: 50, name: 'Archmage', bonus: '2.5x all enchanting rewards', multiplier: 2.5 }
        ]
    },

    MERCHANT: {
        id: 'merchant',
        name: '§bMerchant§r',
        description: '§7Master the art of trade. Buy low, sell high with villagers and wandering traders.',
        icon: 'emerald',
        baseSalary: 70,
        color: '§b',
        category: 'trading',
        upgrades: [
            { level: 10, name: 'Trader', bonus: '1.5x common trade rewards', multiplier: 1.5, match: { equalsAny: ['common_trade'] } },
            { level: 25, name: 'Market Master', bonus: '2x rare trade rewards', multiplier: 2.0, match: { equalsAny: ['rare_trade', 'epic_trade'] } },
            { level: 50, name: 'Trade Prince', bonus: '2.5x legendary trade rewards', multiplier: 2.5, match: { equalsAny: ['legendary_trade'], includesAny: ['enchanted_book'] } }
        ]
    },

    BLACKSMITH: {
        id: 'blacksmith',
        name: '§8Blacksmith§r',
        description: '§7Smelt ores and repair equipment. Keep the realm\'s tools sharp and armor strong.',
        icon: 'iron_ingot',
        baseSalary: 50,
        color: '§8',
        category: 'crafting',
        upgrades: [
            { level: 10, name: 'Ore Smelter', bonus: '2x smelting rewards', multiplier: 2.0, match: { includesAny: ['smelt', 'ingot'] } },
            { level: 25, name: 'Armor Smith', bonus: '2x armor crafting rewards', multiplier: 2.0, match: { includesAny: ['helmet', 'chestplate', 'leggings', 'boots'] } },
            { level: 50, name: 'Master Smith', bonus: '2x all smithing rewards', multiplier: 2.0 }
        ]
    },

    ALCHEMIST: {
        id: 'alchemist',
        name: '§dAlchemist§r',
        description: '§7Brew powerful potions. Support allies with beneficial effects or hinder enemies.',
        icon: 'potion_bottle_drinkable',
        baseSalary: 60,
        color: '§d',
        category: 'magic',
        upgrades: [
            { level: 10, name: 'Brewer', bonus: '2x potion brewing rewards', multiplier: 2.0, match: { includesAny: ['potion', 'brewing'] } },
            { level: 25, name: 'Splash Master', bonus: '2.5x splash potion rewards', multiplier: 2.5, match: { includesAny: ['splash'] } },
            { level: 50, name: 'Grand Alchemist', bonus: '2x all brewing rewards', multiplier: 2.0 }
        ]
    },

    LUMBERJACK: {
        id: 'lumberjack',
        name: '§6Lumberjack§r',
        description: '§7Harvest wood and manage forests. Essential for construction and crafting materials.',
        icon: 'iron_axe',
        baseSalary: 40,
        color: '§6',
        category: 'gathering',
        upgrades: [
            { level: 10, name: 'Woodcutter', bonus: '2x log harvesting rewards', multiplier: 2.0, match: { includesAny: ['log', 'stem'] } },
            { level: 25, name: 'Forest Steward', bonus: '2x sapling/plant rewards', multiplier: 2.0, match: { includesAny: ['sapling', 'leaves'] } },
            { level: 50, name: 'Master Lumberjack', bonus: '2x all woodcutting rewards', multiplier: 2.0 }
        ]
    }
};
