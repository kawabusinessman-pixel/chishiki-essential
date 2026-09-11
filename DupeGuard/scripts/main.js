import { world, system, CommandPermissionLevel, ItemStack } from "@minecraft/server";

console.warn("[DupeGuard] Script loading...");

/* ================================================================== *
 * Compatibility + logging helpers
 * ================================================================== */

/**
 * @minecraft/server 2.x turned Entity.isValid() into a plain property.
 * This pack targets 2.4.0, but accept both shapes so an engine update
 * cannot silently disable the checks that depend on it.
 */
function isValid(entity) {
    if (!entity) return false;
    try {
        const v = entity.isValid;
        return typeof v === "function" ? entity.isValid() : v !== false;
    } catch (e) {
        return false;
    }
}

const warnedAt = new Map();

/** console.warn that collapses repeats, so one bad farm cannot flood the console. */
function warnThrottled(key, message, cooldownMs = 10000) {
    const now = Date.now();
    if (now - (warnedAt.get(key) ?? 0) < cooldownMs) return;
    warnedAt.set(key, now);
    console.warn(message);
    if (warnedAt.size > 256) {
        for (const [k, t] of warnedAt) {
            if (now - t > 60000) warnedAt.delete(k);
        }
    }
}

/** Players with this tag are never touched by the inventory checks. */
const BYPASS_TAG = "dupeguard_bypass";

function hasBypass(player) {
    try {
        return player.hasTag(BYPASS_TAG);
    } catch (e) {
        return false;
    }
}

/* ================================================================== *
 * Settings
 * ================================================================== */

const BUNDLE_BLOCK_PROPERTY = "cheats:blockBundles";
const INVENTORY_SYNC_PROPERTY = "cheats:inventorySync";
const INVENTORY_ENFORCE_PROPERTY = "cheats:inventoryEnforce";
const CRASH_DROP_PROPERTY = "cheats:antiCrashDrop";
const TNT_PROTECT_PROPERTY = "cheats:tntProtect";
const PORTAL_PROTECT_PROPERTY = "cheats:portalProtect";
const ILLEGAL_PLACE_PROPERTY = "cheats:illegalPlace";

function getBundleBlockingSetting() { return world.getDynamicProperty(BUNDLE_BLOCK_PROPERTY) ?? true; }
function setBundleBlockingSetting(value) { world.setDynamicProperty(BUNDLE_BLOCK_PROPERTY, value); }

function getCrashDropSetting() { return world.getDynamicProperty(CRASH_DROP_PROPERTY) ?? true; }
function setCrashDropSetting(value) { world.setDynamicProperty(CRASH_DROP_PROPERTY, value); }

function getInventorySyncSetting() { return world.getDynamicProperty(INVENTORY_SYNC_PROPERTY) ?? false; }
function setInventorySyncSetting(value) { world.setDynamicProperty(INVENTORY_SYNC_PROPERTY, value); }

/**
 * Inventory Sync defaults to report-only. Removing items from a live player on a
 * heuristic is destructive and every known heuristic has false positives, so
 * deleting has to be turned on deliberately with /cheats:invenforce.
 */
function getInventoryEnforceSetting() { return world.getDynamicProperty(INVENTORY_ENFORCE_PROPERTY) ?? false; }
function setInventoryEnforceSetting(value) { world.setDynamicProperty(INVENTORY_ENFORCE_PROPERTY, value); }

function getTntProtectSetting() { return world.getDynamicProperty(TNT_PROTECT_PROPERTY) ?? true; }
function setTntProtectSetting(value) { world.setDynamicProperty(TNT_PROTECT_PROPERTY, value); }

function getPortalProtectSetting() { return world.getDynamicProperty(PORTAL_PROTECT_PROPERTY) ?? true; }
function setPortalProtectSetting(value) { world.setDynamicProperty(PORTAL_PROTECT_PROPERTY, value); }

function getIllegalPlaceSetting() { return world.getDynamicProperty(ILLEGAL_PLACE_PROPERTY) ?? true; }
function setIllegalPlaceSetting(value) { world.setDynamicProperty(ILLEGAL_PLACE_PROPERTY, value); }

system.beforeEvents.startup.subscribe((init) => {
    const registry = init.customCommandRegistry;
    if (!registry) {
        console.warn("[DupeGuard] No custom command registry available - commands disabled.");
        return;
    }

    /** Wraps a toggle command so every one of them handles origin the same way. */
    function registerToggle(name, description, label, get, set) {
        registry.registerCommand(
            {
                name,
                description,
                permissionLevel: CommandPermissionLevel.GameDirectors,
                cheatsRequired: false
            },
            (origin) => {
                const player = origin.sourceEntity;
                if (!player || player.typeId !== "minecraft:player") return { status: 0 };
                system.run(() => {
                    const next = !get();
                    set(next);
                    player.sendMessage(`§e[DupeGuard]§r ${label}: ${next ? "§aENABLED" : "§cDISABLED"}`);
                });
                return { status: 0 };
            }
        );
    }

    registerToggle("cheats:bundles", "Toggle whether bundles can be placed in hoppers (prevents dupe exploits)",
        "Bundle blocking", getBundleBlockingSetting, setBundleBlockingSetting);

    registerToggle("cheats:invcheck", "Toggle Strict Inventory Synchronization",
        "Inventory Sync", getInventorySyncSetting, setInventorySyncSetting);

    registerToggle("cheats:invenforce", "Toggle whether Inventory Sync removes items or only reports them",
        "Inventory Enforcement (item removal)", getInventoryEnforceSetting, setInventoryEnforceSetting);

    registerToggle("cheats:coursedrop", "Toggle Anti-Crash/Disconnect Drop protection",
        "Anti-Crash Drop", getCrashDropSetting, setCrashDropSetting);

    registerToggle("cheats:explosions", "Toggle TNT container protection",
        "TNT Protection", getTntProtectSetting, setTntProtectSetting);

    registerToggle("cheats:portals", "Toggle Nether Portal item protection",
        "Portal Protection", getPortalProtectSetting, setPortalProtectSetting);

    registerToggle("cheats:placement", "Toggle illegal block placement protection",
        "Illegal Placement", getIllegalPlaceSetting, setIllegalPlaceSetting);

    registry.registerCommand(
        {
            name: "cheats:status",
            description: "Check the current status of all cheat prevention features",
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false
        },
        (origin) => {
            const player = origin.sourceEntity;
            if (!player || player.typeId !== "minecraft:player") return { status: 0 };
            system.run(() => {
                const invSync = getInventorySyncSetting();
                const invEnforce = getInventoryEnforceSetting();
                player.sendMessage(
                    `§e[DupeGuard] Status:§r\n` +
                    `  Bundle Blocking: ${getBundleBlockingSetting() ? "§aENABLED" : "§cDISABLED"}§r\n` +
                    `  Inventory Sync: ${invSync ? "§aENABLED" : "§cDISABLED"}§r\n` +
                    `  └ Mode: ${invSync ? (invEnforce ? "§cREMOVE ITEMS" : "§eREPORT ONLY") : "§7n/a"}§r\n` +
                    `  Anti-Crash Drop: ${getCrashDropSetting() ? "§aENABLED" : "§cDISABLED"}§r\n` +
                    `  TNT Protection: ${getTntProtectSetting() ? "§aENABLED" : "§cDISABLED"}§r\n` +
                    `  Portal Protection: ${getPortalProtectSetting() ? "§aENABLED" : "§cDISABLED"}§r\n` +
                    `  Illegal Placement: ${getIllegalPlaceSetting() ? "§aENABLED" : "§cDISABLED"}§r\n` +
                    `§7Players tagged "${BYPASS_TAG}" are exempt from inventory checks.`
                );
            });
            return { status: 0 };
        }
    );

    console.warn("[DupeGuard] Commands registered.");
});

/* ================================================================== *
 * Shared direction helpers
 * ================================================================== */

/** facing_direction states: 0 down, 1 up, 2 north, 3 south, 4 west, 5 east. */
const FACE_TO_DIRECTION = {
    "Down": 0,
    "Up": 1,
    "North": 2,
    "South": 3,
    "West": 4,
    "East": 5
};

function getDirectionOffset(direction, multiplier) {
    const offset = { x: 0, y: 0, z: 0 };
    if (direction === 0) offset.y = -multiplier;
    if (direction === 1) offset.y = multiplier;
    if (direction === 2) offset.z = -multiplier;
    if (direction === 3) offset.z = multiplier;
    if (direction === 4) offset.x = -multiplier;
    if (direction === 5) offset.x = multiplier;
    return offset;
}

const TRANSFER_BLOCKS = ["minecraft:hopper", "minecraft:dropper", "minecraft:dispenser"];
const BUNDLE_TRAP_BLOCKS = ["minecraft:hopper", "minecraft:dispenser", "minecraft:dropper", "minecraft:crafter"];

/* ================================================================== *
 * Bundle-in-hopper dupe blocking
 * ================================================================== */

const trackedContainers = new Map();
let containerScanIntervalId = null;

function playerHasBundle(player) {
    try {
        const inventory = player.getComponent("inventory");
        if (inventory?.container) {
            for (let slot = 0; slot < inventory.container.size; slot++) {
                if (inventory.container.getItem(slot)?.typeId?.includes("bundle")) return true;
            }
        }
        const offhand = player.getComponent("equippable")?.getEquipment("Offhand");
        if (offhand?.typeId?.includes("bundle")) return true;
    } catch (e) {
        // Inventory can be unavailable while the player is loading.
    }
    return false;
}

function scanTrackedContainers() {
    if (!getBundleBlockingSetting()) return;

    const now = Date.now();

    for (const [key, data] of trackedContainers) {
        if (now > data.expireTime) {
            trackedContainers.delete(key);
            continue;
        }

        try {
            const dimension = world.getDimension(data.dimensionId);
            const block = dimension.getBlock(data.pos);

            if (!block || !BUNDLE_TRAP_BLOCKS.includes(block.typeId)) {
                trackedContainers.delete(key);
                continue;
            }

            const container = block.getComponent("inventory")?.container;
            if (!container) continue;

            for (let slot = 0; slot < container.size; slot++) {
                if (container.getItem(slot)?.typeId?.includes("bundle")) {
                    container.setItem(slot, undefined);
                    for (const p of dimension.getPlayers({ location: data.pos, maxDistance: 16 })) {
                        p.playSound("note.bass", { pitch: 0.5, volume: 1 });
                    }
                    trackedContainers.delete(key);
                    break;
                }
            }
        } catch (e) {
            trackedContainers.delete(key);
        }
    }

    if (trackedContainers.size === 0 && containerScanIntervalId !== null) {
        system.clearRun(containerScanIntervalId);
        containerScanIntervalId = null;
    }
}

function startContainerScanning() {
    if (containerScanIntervalId === null) {
        containerScanIntervalId = system.runInterval(scanTrackedContainers, 20);
    }
}

function trackContainerAt(pos, dimensionId, ttlMs) {
    const key = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)},${dimensionId}`;
    trackedContainers.set(key, {
        pos: { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) },
        dimensionId,
        expireTime: Date.now() + ttlMs
    });
    startContainerScanning();
}

world.afterEvents.playerInteractWithBlock.subscribe((event) => {
    if (!getBundleBlockingSetting()) return;
    if (!BUNDLE_TRAP_BLOCKS.includes(event.block.typeId)) return;
    if (!playerHasBundle(event.player)) return;

    trackContainerAt(event.block.location, event.block.dimension.id, 120000);
});

// Catches bundles thrown on top of a hopper instead of inserted through the UI.
system.runInterval(() => {
    if (!getBundleBlockingSetting()) return;
    for (const player of world.getPlayers()) {
        try {
            const items = player.dimension.getEntities({
                location: player.location,
                maxDistance: 16,
                type: "minecraft:item"
            });
            for (const item of items) {
                const stack = item.getComponent("item")?.itemStack;
                if (!stack?.typeId?.includes("bundle")) continue;
                const pos = item.location;
                trackContainerAt({ x: pos.x, y: pos.y - 1, z: pos.z }, item.dimension.id, 5000);
            }
        } catch (e) {
            // Chunk may be unloaded mid-scan.
        }
    }
}, 20);

/* ================================================================== *
 * Illegal placement (hopper / dropper / dispenser loops)
 * ================================================================== */

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    if (!getIllegalPlaceSetting()) return;

    const item = event.itemStack;
    const targetBlock = event.block;
    const player = event.player;
    const blockFace = event.blockFace;

    if (item?.typeId !== "minecraft:hopper" || targetBlock.typeId !== "minecraft:hopper") return;

    const existingHopperFacing = targetBlock.permutation.getState("facing_direction");
    const placementDirection = FACE_TO_DIRECTION[blockFace];
    if (placementDirection === undefined) return;

    const existingPointsAtNew = existingHopperFacing === placementDirection;
    // A hopper placed on a side face always points back at the block clicked.
    const newPointsAtExisting = blockFace !== "Up" && blockFace !== "Down";

    if (existingPointsAtNew && newPointsAtExisting) {
        event.cancel = true;
        system.run(() => {
            player.playSound("note.bass", { pitch: 0.5, volume: 1 });
        });
    }
});

/** Breaks `block` and drops it as an item, used when an illegal loop is formed. */
function breakTransferBlock(dimension, location, typeId, types) {
    const current = dimension.getBlock(location);
    if (!current || !types.includes(current.typeId)) return;

    current.setType("minecraft:air");
    try {
        dimension.spawnItem(new ItemStack(typeId, 1), location);
    } catch (e) {
        warnThrottled(`drop:${typeId}`, `[DupeGuard] Could not drop ${typeId}: ${e}`);
    }
    dimension.playSound("note.bass", location, { pitch: 0.5, volume: 1 });
    dimension.spawnParticle("minecraft:villager_angry", location);
}

/** True when the block at `pos` and its output block point into each other. */
function formsTransferLoop(dimension, pos, types) {
    const block = dimension.getBlock(pos);
    if (!block || !types.includes(block.typeId)) return false;

    const facing = block.permutation.getState("facing_direction");
    if (facing === undefined) return false;

    const offset = getDirectionOffset(facing, 1);
    const targetPos = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };

    const targetBlock = dimension.getBlock(targetPos);
    if (!targetBlock || !types.includes(targetBlock.typeId)) return false;

    const targetFacing = targetBlock.permutation.getState("facing_direction");
    if (targetFacing === undefined) return false;

    const targetOffset = getDirectionOffset(targetFacing, 1);
    return Math.floor(targetPos.x + targetOffset.x) === Math.floor(pos.x)
        && Math.floor(targetPos.y + targetOffset.y) === Math.floor(pos.y)
        && Math.floor(targetPos.z + targetOffset.z) === Math.floor(pos.z);
}

const pistonCheckedAt = new Map();
const PISTON_CHECK_COOLDOWN_MS = 2000;

world.afterEvents.pistonActivate.subscribe((event) => {
    if (!getIllegalPlaceSetting()) return;
    if (!event.isExpanding) return;

    const piston = event.piston?.block;
    if (!piston) return;

    const dimension = piston.dimension;
    const pistonLoc = piston.location;

    // Redstone farms fire pistons continuously; without a cooldown this handler
    // is the single most expensive thing in the pack.
    const pistonKey = `${Math.floor(pistonLoc.x)},${Math.floor(pistonLoc.y)},${Math.floor(pistonLoc.z)},${dimension.id}`;
    const now = Date.now();
    if (now - (pistonCheckedAt.get(pistonKey) ?? 0) < PISTON_CHECK_COOLDOWN_MS) return;
    pistonCheckedAt.set(pistonKey, now);
    if (pistonCheckedAt.size > 512) {
        for (const [k, t] of pistonCheckedAt) {
            if (now - t > PISTON_CHECK_COOLDOWN_MS * 4) pistonCheckedAt.delete(k);
        }
    }

    // Only the blocks the piston actually moved can create a new loop. The
    // original code walked a 17x17x17 cube (4913 getBlock calls) per activation.
    let attached = [];
    try {
        attached = event.piston.getAttachedBlocks?.() ?? [];
    } catch (e) {
        attached = [];
    }

    const pistonFacing = piston.permutation.getState("facing_direction");
    const push = getDirectionOffset(pistonFacing ?? 1, 1);

    const candidates = new Map();
    function addCandidate(pos) {
        const p = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
        candidates.set(`${p.x},${p.y},${p.z}`, p);
    }

    for (const block of attached) {
        const loc = block.location;
        // Post-push destination, plus its neighbours on the push axis.
        addCandidate({ x: loc.x + push.x, y: loc.y + push.y, z: loc.z + push.z });
        addCandidate(loc);
    }
    addCandidate({ x: pistonLoc.x + push.x, y: pistonLoc.y + push.y, z: pistonLoc.z + push.z });

    if (candidates.size === 0) return;

    // Wait for the pushing animation so the blocks are at their final position.
    system.runTimeout(() => {
        for (const pos of candidates.values()) {
            try {
                if (!formsTransferLoop(dimension, pos, TRANSFER_BLOCKS)) continue;
                const block = dimension.getBlock(pos);
                if (!block) continue;
                const typeId = block.typeId;
                block.setType("minecraft:air");
                dimension.spawnParticle("minecraft:large_explosion", pos);
                dimension.playSound("note.bass", pos, { pitch: 0.5, volume: 1 });
                try {
                    dimension.spawnItem(new ItemStack(typeId, 1), pos);
                } catch (e) {
                    // Some block ids have no matching item; the block is still removed.
                }
                return;
            } catch (e) {
                // Block may have been unloaded between the event and this timeout.
            }
        }
    }, 10);
});

world.afterEvents.playerPlaceBlock.subscribe((event) => {
    if (!getIllegalPlaceSetting()) return;

    // Kept to dispenser/dropper pairs on purpose: hopper loops are common in
    // legitimate redstone, and widening this would break working farms.
    const DISPENSER_LIKE = ["minecraft:dispenser", "minecraft:dropper"];

    const block = event.block;
    if (!DISPENSER_LIKE.includes(block.typeId)) return;

    const dimension = block.dimension;
    const location = block.location;
    const typeId = block.typeId;

    if (!formsTransferLoop(dimension, location, DISPENSER_LIKE)) return;

    system.run(() => {
        try {
            breakTransferBlock(dimension, location, typeId, DISPENSER_LIKE);
        } catch (e) {
            warnThrottled("placeloop", `[DupeGuard] Failed to remove illegal placement: ${e}`);
        }
    });
});

/* ================================================================== *
 * Inventory synchronization state
 *
 * Declared here because playerLeave (below) has to clear all of it. Leaving
 * these to grow was a leak: every player who ever joined stayed in memory.
 * ================================================================== */

const pendingUpdates = new Map();
const lastCommittedCounts = new Map();
const lastWrittenJson = new Map();

/**
 * playerId -> timestamp until which an inventory gain has a known legitimate
 * cause (chest withdrawal, collecting your own death drops) and is committed
 * straight away instead of being treated as a possible dupe.
 */
const legitGainUntil = new Map();

function grantGainGrace(playerId, durationMs) {
    const until = Date.now() + durationMs;
    if (until > (legitGainUntil.get(playerId) ?? 0)) legitGainUntil.set(playerId, until);
}

/* ================================================================== *
 * Anti crash / disconnect drop
 * ================================================================== */

const recentDisconnects = [];
const recentItemSpawns = [];
const playerLocations = new Map();
const recentDeaths = new Map();

const DISCONNECT_WINDOW_MS = 3000;
const DEATH_GRACE_MS = 10000;
const MAX_TRACKED_SPAWNS = 256;

function pruneDropTracking(now) {
    while (recentDisconnects.length > 0 && now - recentDisconnects[0].time > 5000) recentDisconnects.shift();
    while (recentItemSpawns.length > 0 && now - recentItemSpawns[0].time > 5000) recentItemSpawns.shift();
    while (recentItemSpawns.length > MAX_TRACKED_SPAWNS) recentItemSpawns.shift();
    for (const [id, t] of recentDeaths) {
        if (now - t > DEATH_GRACE_MS) recentDeaths.delete(id);
    }
}

// Sampling every tick was 20 writes/second/player for a 3-block radius check.
system.runInterval(() => {
    if (!getCrashDropSetting()) return;
    for (const player of world.getPlayers()) {
        try {
            playerLocations.set(player.id, {
                location: player.location,
                dimensionId: player.dimension.id
            });
        } catch (e) {
            // Player may be mid-teleport.
        }
    }
}, 4);

// The buffers used to be trimmed only inside playerLeave, so on a server where
// nobody left they grew without bound until the script engine gave up.
system.runInterval(() => pruneDropTracking(Date.now()), 40);

world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    if (entity?.typeId !== "minecraft:player") return;
    recentDeaths.set(entity.id, Date.now());

    // Everything this player picks up for the next couple of minutes is most
    // likely their own death drop, not a dupe.
    grantGainGrace(entity.id, DEATH_GAIN_GRACE_MS);
});

world.afterEvents.playerLeave.subscribe((event) => {
    const playerId = event.playerId;
    const lastData = playerLocations.get(playerId);
    playerLocations.delete(playerId);

    // Inventory-sync bookkeeping is per-session; drop it so it cannot leak.
    pendingUpdates.delete(playerId);
    lastCommittedCounts.delete(playerId);
    lastWrittenJson.delete(playerId);
    legitGainUntil.delete(playerId);

    if (!getCrashDropSetting() || !lastData) return;

    const now = Date.now();

    // Someone who just died legitimately dropped their inventory. Removing those
    // drops would delete a dead player's items on every disconnect-after-death.
    const diedRecently = now - (recentDeaths.get(playerId) ?? 0) < DEATH_GRACE_MS;
    recentDeaths.delete(playerId);
    if (diedRecently) {
        pruneDropTracking(now);
        return;
    }

    recentDisconnects.push({
        location: lastData.location,
        dimensionId: lastData.dimensionId,
        time: now
    });

    // Items dropped by closing the UI land a few ticks *before* the leave event.
    for (const spawn of recentItemSpawns) {
        if (now - spawn.time >= DISCONNECT_WINDOW_MS) continue;
        if (spawn.dimensionId !== lastData.dimensionId) continue;

        const dx = spawn.location.x - lastData.location.x;
        const dy = spawn.location.y - lastData.location.y;
        const dz = spawn.location.z - lastData.location.z;
        if (dx * dx + dy * dy + dz * dz > 9) continue;

        try {
            if (isValid(spawn.entity)) {
                spawn.entity.remove();
                warnThrottled("crashdrop", "[DupeGuard] Removed dropped item from UI close due to disconnect.");
            }
        } catch (e) {
            // Entity already gone.
        }
    }

    pruneDropTracking(now);
});

world.afterEvents.entitySpawn.subscribe((event) => {
    if (!getCrashDropSetting()) return;

    const entity = event.entity;
    if (entity.typeId !== "minecraft:item") return;

    const spawnTime = Date.now();
    const spawnLoc = entity.location;
    const spawnDim = entity.dimension.id;

    recentItemSpawns.push({ entity, time: spawnTime, location: spawnLoc, dimensionId: spawnDim });
    if (recentItemSpawns.length > MAX_TRACKED_SPAWNS) recentItemSpawns.shift();

    const removalRadiusSq = 9;

    for (const disconnect of recentDisconnects) {
        if (spawnTime - disconnect.time > DISCONNECT_WINDOW_MS) continue;
        if (disconnect.dimensionId !== spawnDim) continue;

        const dx = spawnLoc.x - disconnect.location.x;
        const dy = spawnLoc.y - disconnect.location.y;
        const dz = spawnLoc.z - disconnect.location.z;
        if (dx * dx + dy * dy + dz * dz > removalRadiusSq) continue;

        try {
            warnThrottled(
                "crashdrop-spawn",
                `[DupeGuard] Removed dropped item near ${Math.floor(spawnLoc.x)},${Math.floor(spawnLoc.y)},${Math.floor(spawnLoc.z)} due to recent disconnect.`
            );
            entity.remove();
            return;
        } catch (e) {
            // Entity already gone.
        }
    }
});

/* ================================================================== *
 * Inventory synchronization
 * ================================================================== */

const INV_PROPERTY = "dupeguard:inv";
const LEGACY_INV_PREFIX = "dp_inv_";
const SAFE_SAVE_DELAY_MS = 15000;
const CONTAINER_GRACE_MS = 10000;
const DEATH_GAIN_GRACE_MS = 120000;
const MAX_INV_JSON_BYTES = 8000;

function getPlayerInventoryMap(player) {
    const counts = {};
    const container = player.getComponent("inventory")?.container;
    if (!container) return counts;
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item) counts[item.typeId] = (counts[item.typeId] || 0) + item.amount;
    }
    return counts;
}

function isContainerBlock(block) {
    try {
        if (block.typeId === "minecraft:ender_chest") return true;
        return !!block.getComponent("inventory");
    } catch (e) {
        return false;
    }
}

/**
 * Taking items out of a chest raises the player's inventory count in one tick.
 * That transfer is already persisted on the container side, so it can never be
 * a dupe - rolling it back would destroy items instead. Interacting with any
 * container therefore lets the next save commit immediately.
 *
 * This is the exact false positive seen as "64 -> 128, suspected inventory
 * desync": a player pulling a stack out of a chest or shulker.
 */
world.afterEvents.playerInteractWithBlock.subscribe((event) => {
    if (!getInventorySyncSetting()) return;
    if (!isContainerBlock(event.block)) return;
    grantGainGrace(event.player.id, CONTAINER_GRACE_MS);
});

/** Returns the stored snapshot, or null when this player has never been saved. */
function readStoredCounts(player) {
    try {
        const stored = player.getDynamicProperty(INV_PROPERTY);
        if (typeof stored === "string" && stored.length > 0) return JSON.parse(stored);
    } catch (e) {
        warnThrottled("invread", `[DupeGuard] Could not read stored inventory: ${e}`);
    }
    return null;
}

function writeStoredCounts(player, counts) {
    const json = JSON.stringify(counts);
    if (lastWrittenJson.get(player.id) === json) return;   // nothing changed, skip the write
    if (json.length > MAX_INV_JSON_BYTES) {
        warnThrottled("invsize", `[DupeGuard] Inventory snapshot for ${player.name} too large to store; skipping.`);
        return;
    }
    try {
        player.setDynamicProperty(INV_PROPERTY, json);
        lastWrittenJson.set(player.id, json);
    } catch (e) {
        warnThrottled("invwrite", `[DupeGuard] Could not store inventory snapshot: ${e}`);
    }
}

function savePlayerInventory(player) {
    try {
        const playerId = player.id;
        const currentCounts = getPlayerInventoryMap(player);
        const now = Date.now();

        function commit() {
            writeStoredCounts(player, currentCounts);
            lastCommittedCounts.set(playerId, currentCounts);
            pendingUpdates.delete(playerId);
        }

        if (!lastCommittedCounts.has(playerId)) {
            const stored = readStoredCounts(player);
            if (stored === null) {
                // Never saved before. Everything looks like a "gain" against an
                // empty snapshot, so take the current inventory as the baseline
                // instead of leaving the player unprotected for 15 seconds.
                commit();
                return;
            }
            lastCommittedCounts.set(playerId, stored);
        }
        const committed = lastCommittedCounts.get(playerId);

        let hasIncrease = false;
        for (const id in currentCounts) {
            if ((currentCounts[id] || 0) > (committed[id] || 0)) {
                hasIncrease = true;
                break;
            }
        }

        // Gains that have a legitimate explanation are committed straight away.
        const inGrace = now < (legitGainUntil.get(playerId) ?? 0);
        // Enum casing has changed between API versions, so compare loosely.
        const isCreative = (() => {
            try {
                const mode = String(player.getGameMode?.() ?? player.gameMode ?? "").toLowerCase();
                return mode === "creative" || mode === "spectator";
            } catch (e) {
                return false;
            }
        })();

        if (!hasIncrease || inGrace || isCreative || hasBypass(player)) {
            commit();
            return;
        }

        const pending = pendingUpdates.get(playerId);
        if (!pending) {
            pendingUpdates.set(playerId, { timestamp: now });
        } else if (now - pending.timestamp > SAFE_SAVE_DELAY_MS) {
            commit();
        }
    } catch (e) {
        warnThrottled("invsave", `[DupeGuard] Save error: ${e}`);
    }
}

system.runInterval(() => {
    if (!getInventorySyncSetting()) return;
    for (const player of world.getPlayers()) {
        savePlayerInventory(player);
    }
}, 10);

world.afterEvents.playerSpawn.subscribe((event) => {
    if (!getInventorySyncSetting()) return;

    // Only the join spawn matters. On a respawn after death the inventory is
    // empty, and re-running the check there just risks deleting what the player
    // picks back up.
    if (!event.initialSpawn) return;

    const player = event.player;
    if (hasBypass(player)) return;

    system.runTimeout(() => {
        try {
            if (!isValid(player)) return;

            const savedMap = readStoredCounts(player);
            if (!savedMap) return;   // first time this player is seen, nothing to compare

            const currentMap = getPlayerInventoryMap(player);
            const enforce = getInventoryEnforceSetting();
            const container = player.getComponent("inventory")?.container;
            if (!container) return;

            let flagged = false;

            for (const typeId in currentMap) {
                const currentCount = currentMap[typeId];
                const savedCount = savedMap[typeId] || 0;
                if (currentCount <= savedCount) continue;

                flagged = true;
                const diff = currentCount - savedCount;

                console.warn(
                    `[DupeGuard] ${enforce ? "Removing" : "Flagged (report only)"} ` +
                    `${diff}x ${typeId} for ${player.name} (has ${currentCount}, expected ${savedCount}).`
                );

                if (!enforce) continue;

                let remainingToRemove = diff;
                for (let i = 0; i < container.size && remainingToRemove > 0; i++) {
                    const item = container.getItem(i);
                    if (!item || item.typeId !== typeId) continue;
                    try {
                        if (item.amount > remainingToRemove) {
                            item.amount -= remainingToRemove;
                            container.setItem(i, item);
                            remainingToRemove = 0;
                        } else {
                            remainingToRemove -= item.amount;
                            container.setItem(i);
                        }
                    } catch (err) {
                        warnThrottled("invslot", `[DupeGuard] Error modifying slot ${i}: ${err}`);
                    }
                }
            }

            if (flagged && enforce) {
                player.playSound("note.bass", { pitch: 0.5, volume: 1 });
            }

            // Whatever the outcome, the post-check inventory becomes the new baseline.
            lastCommittedCounts.set(player.id, getPlayerInventoryMap(player));
            writeStoredCounts(player, lastCommittedCounts.get(player.id));
        } catch (e) {
            warnThrottled("invcheck", `[DupeGuard] Inventory check error: ${e.stack || e}`);
        }
    }, 10);
});

// Earlier versions kept one world property per player id and never removed them,
// which eventually filled the world's dynamic property budget.
system.run(() => {
    try {
        const ids = world.getDynamicPropertyIds?.() ?? [];
        let removed = 0;
        for (const id of ids) {
            if (!id.startsWith(LEGACY_INV_PREFIX)) continue;
            world.setDynamicProperty(id, undefined);
            removed++;
        }
        if (removed > 0) console.warn(`[DupeGuard] Cleared ${removed} legacy inventory properties.`);
    } catch (e) {
        console.warn(`[DupeGuard] Legacy cleanup skipped: ${e}`);
    }
});

/* ================================================================== *
 * TNT + container dupe
 * ================================================================== */

const EXPLOSION_CONTAINER_PARTS = ["chest", "barrel", "hopper", "dispenser", "dropper", "crafter"];

// Vanilla already drops these safely: an ender chest has no inventory to spill,
// and a shulker box drops as a single item that still holds its contents.
// Rebuilding their drops by hand created free ender chests and scattered
// shulker contents across the floor.
const EXPLOSION_EXCLUDED = ["minecraft:ender_chest", "shulker_box"];

function isExplosionProtectedContainer(typeId) {
    if (EXPLOSION_EXCLUDED.some((part) => typeId.includes(part))) return false;
    return EXPLOSION_CONTAINER_PARTS.some((part) => typeId.includes(part));
}

world.beforeEvents.explosion.subscribe((event) => {
    if (!getTntProtectSetting()) return;

    const impactedBlocks = event.getImpactedBlocks();
    const safeBlocks = [];
    const containersToBreak = [];

    for (const block of impactedBlocks) {
        if (isExplosionProtectedContainer(block.typeId)) {
            containersToBreak.push({ dimension: event.dimension, location: block.location });
        } else {
            safeBlocks.push(block);
        }
    }

    if (containersToBreak.length === 0) return;

    event.setImpactedBlocks(safeBlocks);

    system.run(() => {
        for (const c of containersToBreak) {
            try {
                const block = c.dimension.getBlock(c.location);
                if (!block) continue;

                const typeId = block.typeId;
                const container = block.getComponent("inventory")?.container;
                if (container) {
                    for (let i = 0; i < container.size; i++) {
                        const item = container.getItem(i);
                        if (!item) continue;
                        c.dimension.spawnItem(item, c.location);
                        container.setItem(i, undefined);
                    }
                }

                block.setType("minecraft:air");
                try {
                    c.dimension.spawnItem(new ItemStack(typeId, 1), c.location);
                } catch (e) {
                    // Block id with no matching item - leave no drop rather than
                    // aborting the break.
                    warnThrottled(`explodrop:${typeId}`, `[DupeGuard] No item form for ${typeId}; block removed without drop.`);
                }
            } catch (e) {
                warnThrottled("explosion", `[DupeGuard] Explosion handling error: ${e}`);
            }
        }
    });
});

/* ================================================================== *
 * Nether portal item dupe
 * ================================================================== */

const PORTAL_ESCAPE_OFFSETS = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
    { x: 0, y: 1, z: 0 }
];

/** Moves an item out of a portal block instead of handing it to a bystander. */
function rescuePortalItem(item) {
    const dimension = item.dimension;
    const loc = item.location;

    for (const offset of PORTAL_ESCAPE_OFFSETS) {
        const pos = { x: loc.x + offset.x, y: loc.y + offset.y, z: loc.z + offset.z };
        let target;
        try {
            target = dimension.getBlock(pos);
        } catch (e) {
            continue;
        }
        if (!target || target.typeId === "minecraft:portal" || !target.isAir) continue;

        try {
            item.teleport({ x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 }, { dimension });
            return true;
        } catch (e) {
            // Try the next offset.
        }
    }
    return false;
}

system.runInterval(() => {
    if (!getPortalProtectSetting()) return;

    const handled = new Set();

    for (const player of world.getPlayers()) {
        try {
            const items = player.dimension.getEntities({
                location: player.location,
                maxDistance: 10,
                type: "minecraft:item"
            });

            for (const item of items) {
                if (handled.has(item.id)) continue;
                if (!isValid(item)) continue;

                const block = item.dimension.getBlock(item.location);
                if (block?.typeId !== "minecraft:portal") continue;

                handled.add(item.id);

                if (rescuePortalItem(item)) continue;

                // No free space around the portal: hand it to the closest player
                // rather than a random one, and never void the remainder.
                const loc = item.location;
                const dx = loc.x - player.location.x;
                const dy = loc.y - player.location.y;
                const dz = loc.z - player.location.z;
                if (dx * dx + dy * dy + dz * dz > 16) continue;

                const stack = item.getComponent("item")?.itemStack;
                const container = player.getComponent("inventory")?.container;
                if (!stack || !container) continue;

                const leftover = container.addItem(stack);
                item.remove();
                if (leftover) {
                    // Inventory was full - put the rest back on the ground.
                    player.dimension.spawnItem(leftover, player.location);
                }
                player.sendMessage("§c[DupeGuard] Items cannot be dropped into portals.");
            }
        } catch (e) {
            warnThrottled("portal", `[DupeGuard] Portal protection error: ${e}`);
        }
    }
}, 20);

console.warn("[DupeGuard] Script loaded.");
