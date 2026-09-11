import { ModalFormData, world, ActionFormData, ItemStack, system, EquipmentSlot } from '../../core';
import { GlobalConfig } from '../../function/GlobalConfig.js';

let bannedItems = [];
let bannedItemsSet = new Set();
let autoClearEnabled = false;
let isInitialized = false;

// --- Utility ---
function formatItemName(typeId) {
    return typeId.replace(/^minecraft:/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeItemId(typeId) {
    if (!typeId || typeof typeId !== 'string') return '';
    return typeId.trim().toLowerCase();
}

function collectInventoryItems(player) {
    try {
        const container = player.getComponent("minecraft:inventory")?.container;
        if (!container) return [];
        const seen = new Set();
        const out = [];
        for (let i = 0; i < container.size; i++) {
            const stack = container.getItem(i);
            if (!stack?.typeId || stack.typeId === "minecraft:air") continue;
            const normId = normalizeItemId(stack.typeId);
            if (seen.has(normId)) continue;
            seen.add(normId);
            out.push({ typeId: normId, name: stack.nameTag?.trim() || formatItemName(normId) });
        }
        return out;
    } catch { return []; }
}

// --- Config ---
function saveBannedItems() {
    try { 
        bannedItems = Array.from(bannedItemsSet);
        GlobalConfig.set('bannedItems', bannedItems); 
    }
    catch (e) { console.warn("[BanItem] Error saving:", e); }
}

function loadBannedItems() {
    try {
        const data = GlobalConfig.get('bannedItems');
        if (data) {
            const parsed = typeof data === 'string' && data.length ? JSON.parse(data) : data;
            bannedItems = Array.isArray(parsed) ? parsed.map(normalizeItemId).filter(Boolean) : [];
            bannedItemsSet = new Set(bannedItems);
        } else { bannedItems = []; bannedItemsSet = new Set(); }
    } catch (e) { console.warn("[BanItem] Error loading:", e); bannedItems = []; bannedItemsSet = new Set(); }
}

function syncBannedItems() { loadBannedItems(); saveBannedItems(); }

function loadAutoClearStatus() {
    try {
        const val = GlobalConfig.get('banItemAutoClearEnabled');
        if (val !== undefined && val !== null) autoClearEnabled = Boolean(val);
    } catch (e) { console.warn("[BanItem] Error loading autoClear:", e); }
}

function saveAutoClearStatus() {
    try { GlobalConfig.set('banItemAutoClearEnabled', autoClearEnabled); }
    catch (e) { console.warn("[BanItem] Error saving autoClear:", e); }
}

function initializeBanItem() {
    loadBannedItems();
    loadAutoClearStatus();
    isInitialized = true;

}

// --- Core Logic ---
const EQUIPMENT_SLOTS = [
    EquipmentSlot?.Offhand ?? "Offhand",
    EquipmentSlot?.Head ?? "Head",
    EquipmentSlot?.Chest ?? "Chest",
    EquipmentSlot?.Legs ?? "Legs",
    EquipmentSlot?.Feet ?? "Feet"
];

function checkAndRemoveBannedItems(player) {
    if (!bannedItemsSet.size) return;
    try {
        const clearedTypes = new Set();

        // 1. Check main inventory
        const inv = player.getComponent('minecraft:inventory')?.container;
        if (inv) {
            for (let i = 0; i < inv.size; i++) {
                const item = inv.getItem(i);
                if (item) {
                    const normId = normalizeItemId(item.typeId);
                    if (bannedItemsSet.has(normId) && !clearedTypes.has(normId)) {
                        clearedTypes.add(normId);
                    }
                }
            }
        }

        // 2. Check equippable / offhand / armor
        const equippable = player.getComponent('minecraft:equippable');
        if (equippable) {
            for (const slot of EQUIPMENT_SLOTS) {
                try {
                    const eqItem = equippable.getEquipment(slot);
                    if (eqItem) {
                        const normId = normalizeItemId(eqItem.typeId);
                        if (bannedItemsSet.has(normId) && !clearedTypes.has(normId)) {
                            clearedTypes.add(normId);
                        }
                    }
                } catch {}
            }
        }

        // Clear detected banned items
        for (const normId of clearedTypes) {
            player.runCommand(`clear @s ${normId}`);
            player.sendMessage(`§c§lBan §r§e${normId} §chas been removed from your inventory!`);
        }
    } catch {}
}

// Destroy banned item entities on ground
function destroyBannedItemEntities() {
    if (!bannedItemsSet.size) return;
    for (const player of world.getPlayers()) {
        try {
            const nearbyItems = player.dimension.getEntities({
                type: "minecraft:item",
                location: player.location,
                maxDistance: 16
            });
            for (const entity of nearbyItems) {
                try {
                    const itemComp = entity.getComponent("minecraft:item");
                    if (itemComp?.itemStack) {
                        const normId = normalizeItemId(itemComp.itemStack.typeId);
                        if (bannedItemsSet.has(normId)) {
                            entity.kill();
                        }
                    }
                } catch {}
            }
        } catch {}
    }
}

// --- Realtime Event Interceptions ---
world.afterEvents.playerInventoryItemChange?.subscribe?.((event) => {
    if (!isInitialized || !autoClearEnabled || !bannedItemsSet.size) return;
    const stack = event.itemStack;
    if (stack) {
        const normId = normalizeItemId(stack.typeId);
        if (bannedItemsSet.has(normId)) {
            const player = event.player;
            if (player) {
                system.run(() => checkAndRemoveBannedItems(player));
            }
        }
    }
});

world.beforeEvents.itemUse?.subscribe?.((event) => {
    if (!isInitialized || !autoClearEnabled || !bannedItemsSet.size) return;
    const item = event.itemStack;
    if (item && bannedItemsSet.has(normalizeItemId(item.typeId))) {
        event.cancel = true;
        const player = event.source;
        if (player) {
            system.run(() => checkAndRemoveBannedItems(player));
        }
    }
});

world.beforeEvents.itemUseOn?.subscribe?.((event) => {
    if (!isInitialized || !autoClearEnabled || !bannedItemsSet.size) return;
    const item = event.itemStack;
    if (item && bannedItemsSet.has(normalizeItemId(item.typeId))) {
        event.cancel = true;
        const player = event.source;
        if (player) {
            system.run(() => checkAndRemoveBannedItems(player));
        }
    }
});

world.beforeEvents.playerInteractWithBlock?.subscribe?.((event) => {
    if (!isInitialized || !autoClearEnabled || !bannedItemsSet.size) return;
    const item = event.itemStack;
    if (item && bannedItemsSet.has(normalizeItemId(item.typeId))) {
        event.cancel = true;
        const player = event.player;
        if (player) {
            system.run(() => checkAndRemoveBannedItems(player));
        }
    }
});

world.beforeEvents.playerInteractWithEntity?.subscribe?.((event) => {
    if (!isInitialized || !autoClearEnabled || !bannedItemsSet.size) return;
    const item = event.itemStack;
    if (item && bannedItemsSet.has(normalizeItemId(item.typeId))) {
        event.cancel = true;
        const player = event.player;
        if (player) {
            system.run(() => checkAndRemoveBannedItems(player));
        }
    }
});

world.afterEvents.entitySpawn?.subscribe?.((event) => {
    if (!isInitialized || !autoClearEnabled || !bannedItemsSet.size) return;
    const entity = event.entity;
    if (entity?.typeId === "minecraft:item") {
        try {
            const itemComp = entity.getComponent("minecraft:item");
            if (itemComp?.itemStack && bannedItemsSet.has(normalizeItemId(itemComp.itemStack.typeId))) {
                entity.kill();
            }
        } catch {}
    }
});

world.afterEvents.playerSpawn?.subscribe?.((event) => {
    if (!isInitialized || !autoClearEnabled || !bannedItemsSet.size) return;
    if (event.initialSpawn && event.player) {
        system.run(() => checkAndRemoveBannedItems(event.player));
    }
});

// --- Menus ---
function openBanItemMenu(player) {
    loadBannedItems();
    loadAutoClearStatus();
    const bodyText = `§7Banned items: §c${bannedItems.length}§r\n§7Auto clear: ${autoClearEnabled ? '§aON' : '§cOFF'}\n\n§eBanned items will be removed from player inventories and destroyed on ground.`;
    new ActionFormData()
        .simpleUi()
        .title("Ban Item System")
        .body(bodyText)
        .button("Ban Item", "textures/ui/lock_color")
        .button("Ban from Inventory", "textures/ui/inventory_icon")
        .button("Unban Item", "textures/ui/trash")
        .button("Show Banned Items", "textures/ui/magnifying_glass")
        .button(`${autoClearEnabled ? 'Disable' : 'Enable'} Auto Clear`, autoClearEnabled ? "textures/ui/toggle_on" : "textures/ui/toggle_off")
        .button("Back", "textures/ui/arrow_left")
        .show(player)
        .then(res => {
            if (!res || res.canceled || res.selection === undefined) return;
            if (res.selection === 0) showBanItemModal(player);
            else if (res.selection === 1) showBanFromInventory(player);
            else if (res.selection === 2) openUnbanMenu(player);
            else if (res.selection === 3) showBannedItemsList(player);
            else if (res.selection === 4) toggleAutoClear(player);
        });
}

function showBanItemModal(player) {
    loadBannedItems();
    new ModalFormData()
        .title("Ban Item")
        .textField("Item ID to ban", "e.g. minecraft:diamond_sword")
        .show(player)
        .then(async res => {
            if (!res || res.canceled || !res.formValues) return;
            let itemId = res.formValues[0]?.trim();
            if (!itemId) { player.sendMessage("§c§lError: §rItem ID cannot be empty!"); return; }
            if (!itemId.includes(':')) itemId = `minecraft:${itemId}`;
            itemId = normalizeItemId(itemId);

            // Confirm dialog
            const confirm = await new ActionFormData()
                .simpleUi()
                .title("Confirm Ban")
                .body(`§eAre you sure you want to ban this item?\n§f${itemId}`)
                .button("Yes, Ban", "textures/ui/check")
                .button("Cancel", "textures/ui/cancel")
                .show(player);
            if (confirm.canceled || confirm.selection !== 0) { player.sendMessage("§7Ban cancelled."); return; }

            loadBannedItems();
            if (bannedItemsSet.has(itemId)) { player.sendMessage(`§c§lError: §r${itemId} is already banned!`); return; }
            bannedItemsSet.add(itemId);
            saveBannedItems();
            player.sendMessage(`§a§lBan Success: §r§e${itemId} §ahas been banned!`);
            checkAndRemoveBannedItems(player);
        });
}

function showBanFromInventory(player) {
    loadBannedItems();
    const items = collectInventoryItems(player);
    if (!items.length) { player.sendMessage("§c§lError: §rYour inventory is empty!"); return; }

    const form = new ModalFormData()
        .title("Ban Item from Inventory")
        .dropdown(
            "Select item to ban from your inventory",
            items.map(it => `${it.name} (${it.typeId})`),
            { defaultValueIndex: 0 }
        );

    form.show(player).then(async res => {
        if (res.canceled || !res.formValues) return;
        const selected = items[res.formValues[0]];
        if (!selected) return;
        const itemId = normalizeItemId(selected.typeId);

        const confirm = await new ActionFormData()
            .simpleUi()
            .title("Confirm Ban")
            .body(`§eAre you sure you want to ban this item?\n§f${selected.name}\n§7ID: ${itemId}`)
            .button("Yes, Ban", "textures/ui/check")
            .button("Cancel", "textures/ui/cancel")
            .show(player);
        if (confirm.canceled || confirm.selection !== 0) { player.sendMessage("§7Ban cancelled."); return; }

        loadBannedItems();
        if (bannedItemsSet.has(itemId)) { player.sendMessage(`§c§lError: §r${itemId} is already banned!`); return; }
        bannedItemsSet.add(itemId);
        saveBannedItems();
        player.sendMessage(`§a§lBan Success: §r§e${selected.name} §a(${itemId}) has been banned!`);
        checkAndRemoveBannedItems(player);
    });
}

function openUnbanMenu(player) {
    loadBannedItems();
    if (!bannedItems.length) { player.sendMessage("§7No banned items to unban."); return; }

    const form = new ModalFormData()
        .title("Unban Item")
        .dropdown("Select item to unban", bannedItems.map(id => `${formatItemName(id)} (${id})`), { defaultValueIndex: 0 });

    form.show(player).then(async res => {
        if (res.canceled || !res.formValues) return;
        const idx = res.formValues[0];
        loadBannedItems();
        const itemId = bannedItems[idx];
        if (!itemId) return;

        const confirm = await new ActionFormData()
            .simpleUi()
            .title("Confirm Unban")
            .body(`§eAre you sure you want to unban this item?\n§f${itemId}`)
            .button("Yes, Unban", "textures/ui/check")
            .button("Cancel", "textures/ui/cancel")
            .show(player);
        if (confirm.canceled || confirm.selection !== 0) { player.sendMessage("§7Unban cancelled."); return; }

        bannedItemsSet.delete(itemId);
        saveBannedItems();
        player.sendMessage(`§a§lUnban: §r§e${itemId} §ahas been unbanned!`);
    });
}

function showBannedItemsList(player) {
    loadBannedItems();
    if (!bannedItems.length) { player.sendMessage("§7No banned items yet."); return; }

    let msg = `§e§lBanned Items (${bannedItems.length}):\n`;
    bannedItems.forEach((id, i) => { msg += `§f${i + 1}. §c${id}\n`; });
    player.sendMessage(msg);
}

function toggleAutoClear(player) {
    loadAutoClearStatus();
    autoClearEnabled = !autoClearEnabled;
    saveAutoClearStatus();
    player.sendMessage(`§eAuto Clear Banned Item is now ${autoClearEnabled ? '§a§lENABLED' : '§c§lDISABLED'}`);
    openBanItemMenu(player);
}

// --- Events ---
system.runTimeout(() => { initializeBanItem(); }, 60);

export { openBanItemMenu, bannedItems, checkAndRemoveBannedItems, destroyBannedItemEntities, loadBannedItems, saveBannedItems, syncBannedItems };
