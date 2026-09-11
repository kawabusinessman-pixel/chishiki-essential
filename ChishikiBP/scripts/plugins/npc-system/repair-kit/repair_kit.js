import { ActionFormData, ModalFormData, ItemComponentTypes, EquipmentSlot, EntityComponentTypes } from "../../../core.js";
import { GlobalConfig } from "../../../function/GlobalConfig.js";
import { getFullMoney, removeMoney, addMoney, formatMoneyValue } from "../../../function/moneySystem.js";
import { getPlayerCoins, removePlayerCoins, addPlayerCoins } from "../../../plugins/tf-money/tf-money.js";
import { metricNumbers } from "../../../lib/game.js";
import { Lang } from "../../../lib/Lang.js";
import { resolveActionFormItemIcon } from "../../../lib/itemIconTexture.js";

const t = (player, key, ...args) => Lang.t(player, key, ...args);
const CONFIG_KEY = "repairKitConfig";
const CURRENCY_OPTIONS = ["Money", "Coin", "XP"];
const ARMOR_EQUIP_SLOTS = [
    { slot: EquipmentSlot.Head, name: "Head" },
    { slot: EquipmentSlot.Chest, name: "Chest" },
    { slot: EquipmentSlot.Legs, name: "Legs" },
    { slot: EquipmentSlot.Feet, name: "Feet" },
    { slot: EquipmentSlot.Offhand, name: "Offhand" },
];

const DEFAULT_CONFIG = {
    enabled: true,
    currencyType: "money",
    pricePerItem: 50,
};

function normalizeConfig(raw) {
    const cfg = raw && typeof raw === "object" ? raw : {};
    const currency = String(cfg.currencyType || "money").toLowerCase();
    return {
        enabled: cfg.enabled !== false,
        currencyType: currency === "coin" ? "coin" : currency === "xp" ? "xp" : "money",
        pricePerItem: Math.max(0, Math.floor(Number(cfg.pricePerItem) || DEFAULT_CONFIG.pricePerItem)),
    };
}

function getRepairKitConfig() {
    try {
        const raw = GlobalConfig.get(CONFIG_KEY);
        if (!raw) return { ...DEFAULT_CONFIG };
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return normalizeConfig(parsed);
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

function saveRepairKitConfig(config) {
    return GlobalConfig.set(CONFIG_KEY, normalizeConfig(config));
}

function formatTypeIdName(typeId) {
    return String(typeId).replace(/^.*:/, "").replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function itemDisplayName(stack) {
    const tag = stack?.nameTag?.trim();
    return tag || formatTypeIdName(stack?.typeId || "item");
}

function getInventoryContainer(player) {
    return player.getComponent(EntityComponentTypes.Inventory)?.container
        ?? player.getComponent("minecraft:inventory")?.container
        ?? player.getComponent("inventory")?.container;
}

function getEquippable(player) {
    return player.getComponent("minecraft:equippable")
        ?? player.getComponent("equippable")
        ?? player.getComponent(EntityComponentTypes.Equippable);
}

function getDurabilityComp(stack) {
    if (!stack?.getComponent) return null;
    return stack.getComponent(ItemComponentTypes.Durability)
        ?? stack.getComponent("minecraft:durability")
        ?? stack.getComponent("durability");
}

function getEquippedStack(eq, entry) {
    if (!eq) return undefined;
    try {
        return eq.getEquipment(entry.slot) ?? eq.getEquipment(entry.name);
    } catch {
        try { return eq.getEquipment(entry.name); } catch { return undefined; }
    }
}

function getDurabilityState(stack) {
    if (!stack?.typeId || stack.typeId === "minecraft:air") return null;
    const dur = getDurabilityComp(stack);
    if (!dur || dur.maxDurability <= 0 || dur.damage <= 0) return null;
    const remaining = dur.maxDurability - dur.damage;
    return {
        damage: dur.damage,
        max: dur.maxDurability,
        remaining,
        pct: Math.max(0, Math.floor((remaining / dur.maxDurability) * 100)),
    };
}

function hasWornArmor(player) {
    const eq = getEquippable(player);
    if (!eq) return false;
    for (const entry of ARMOR_EQUIP_SLOTS.slice(0, 4)) {
        const stack = getEquippedStack(eq, entry);
        if (stack?.typeId && stack.typeId !== "minecraft:air") return true;
    }
    return false;
}

function needsRepair(stack) {
    return getDurabilityState(stack) != null;
}

function collectRepairableItems(player) {
    const out = [];
    const inv = getInventoryContainer(player);
    if (inv) {
        for (let slot = 0; slot < inv.size; slot++) {
            const stack = inv.getItem(slot);
            if (!needsRepair(stack)) continue;
            out.push({ source: "inventory", slot, typeId: stack.typeId });
        }
    }
    const eq = getEquippable(player);
    if (eq) {
        for (const entry of ARMOR_EQUIP_SLOTS) {
            const stack = getEquippedStack(eq, entry);
            if (!needsRepair(stack)) continue;
            out.push({ source: "equipment", slot: entry.slot, slotName: entry.name, typeId: stack.typeId });
        }
    }
    return out;
}

function getStackForEntry(player, entry) {
    if (entry.source === "inventory") {
        return getInventoryContainer(player)?.getItem(entry.slot);
    }
    const eq = getEquippable(player);
    if (!eq) return undefined;
    return getEquippedStack(eq, { slot: entry.slot, name: entry.slotName ?? entry.slot });
}

function repairEntry(player, entry) {
    const stack = getStackForEntry(player, entry);
    if (!stack) return false;
    const dur = getDurabilityComp(stack);
    if (!dur || dur.damage <= 0) return false;
    dur.damage = 0;
    if (entry.source === "inventory") {
        getInventoryContainer(player)?.setItem(entry.slot, stack);
    } else {
        const eq = getEquippable(player);
        if (!eq) return false;
        try {
            eq.setEquipment(entry.slot, stack);
        } catch {
            eq.setEquipment(entry.slotName ?? entry.slot, stack);
        }
    }
    return true;
}

/** Free repair for rank +repair — same durability logic as repair kit NPC. */
export function repairDamagedItemsFree(player) {
    const entries = collectRepairableItems(player);
    let repaired = 0;
    for (const entry of entries) {
        if (repairEntry(player, entry)) repaired++;
    }
    return repaired;
}

const REPAIR_COOLDOWN_MS = 3000
const repairCooldowns = new Map()

export function applyRankRepairSkill(player, successMsg = "§aItems repaired§f") {
  const now = Date.now()
  const lastUsed = repairCooldowns.get(player.id) || 0
  if (now - lastUsed < REPAIR_COOLDOWN_MS) {
    const remaining = Math.ceil((REPAIR_COOLDOWN_MS - (now - lastUsed)) / 1000)
    player.sendMessage(`§cRepair cooldown! Wait ${remaining}s`)
    return false
  }
  const inv = getInventoryContainer(player)
  if (!inv) {
    player.sendMessage("§cCannot access inventory")
    return false
  }
  const heldItem = inv.getItem(player.selectedSlotIndex)
  if (!heldItem || !heldItem.typeId || heldItem.typeId === "minecraft:air") {
    player.sendMessage("§cHold an item to repair!")
    return false
  }
  const dur = getDurabilityComp(heldItem)
  if (!dur || dur.damage <= 0) {
    player.sendMessage("§cItem doesn't need repair!")
    return false
  }
  dur.damage = 0
  inv.setItem(player.selectedSlotIndex, heldItem)
  repairCooldowns.set(player.id, now)
  player.sendMessage(successMsg)
  try {
    player.runCommand("playsound random.anvil_use @s ~~~ 1 1")
    player.runCommand("particle minecraft:villager_happy ~~~")
  } catch { }
  return true
}

function priceTag(player, amount, currencyType) {
    const price = metricNumbers(amount);
    if (currencyType === "coin") return t(player, "repairkit.currency.coin_tag", price);
    if (currencyType === "xp") return t(player, "repairkit.currency.xp_tag", price);
    return t(player, "repairkit.currency.money_tag", price);
}

function getBalance(player, currencyType) {
    if (currencyType === "coin") return BigInt(getPlayerCoins(player));
    if (currencyType === "xp") return BigInt(player.level || 0);
    return getFullMoney(player);
}

function formatBalance(player, currencyType) {
    if (currencyType === "coin") return metricNumbers(String(getPlayerCoins(player)));
    if (currencyType === "xp") return metricNumbers(String(player.level || 0));
    return formatMoneyValue(getFullMoney(player));
}

function chargePlayer(player, amount, currencyType) {
    const cost = Math.max(0, Math.floor(Number(amount) || 0));
    if (cost <= 0) return true;
    if (currencyType === "coin") return removePlayerCoins(player, cost);
    if (currencyType === "xp") {
        if ((player.level || 0) < cost) return false;
        try {
            player.runCommand(`xp -${cost}L @s`);
            return true;
        } catch {
            return false;
        }
    }
    return removeMoney(player, BigInt(cost));
}

function refundPlayer(player, amount, currencyType) {
    const cost = Math.max(0, Math.floor(Number(amount) || 0));
    if (cost <= 0) return;
    if (currencyType === "coin") {
        addPlayerCoins(player, cost);
        return;
    }
    if (currencyType === "xp") {
        try { player.runCommand(`xp ${cost}L @s`); } catch { }
        return;
    }
    addMoney(player, BigInt(cost));
}

function repairItems(player, entries, config) {
    const totalCost = entries.length * config.pricePerItem;
    if (totalCost > 0 && getBalance(player, config.currencyType) < BigInt(totalCost)) {
        player.sendMessage(t(player, "repairkit.msg.insufficient"));
        player.runCommand("playsound note.bass @s ~~~ 1 1");
        return showRepairKitMenu(player);
    }
    if (totalCost > 0 && !chargePlayer(player, totalCost, config.currencyType)) {
        player.sendMessage(t(player, "repairkit.msg.payment_failed"));
        return showRepairKitMenu(player);
    }

    let repaired = 0;
    for (const entry of entries) {
        if (repairEntry(player, entry)) repaired++;
    }

    if (repaired < entries.length && totalCost > 0) {
        const refund = (entries.length - repaired) * config.pricePerItem;
        refundPlayer(player, refund, config.currencyType);
    }

    if (repaired > 0) {
        player.sendMessage(t(player, "repairkit.msg.success", repaired, priceTag(player, repaired * config.pricePerItem, config.currencyType)));
        player.runCommand("playsound random.anvil_use @s ~~~ 1 1");
        player.runCommand("particle minecraft:villager_happy ~~~");
    } else {
        player.sendMessage(t(player, "repairkit.msg.nothing_repaired"));
    }
    return showRepairKitMenu(player);
}

export async function showRepairKitMenu(player) {
    const config = getRepairKitConfig();
    if (!config.enabled) {
        player.sendMessage(t(player, "repairkit.msg.disabled"));
        return;
    }

    const entries = collectRepairableItems(player);
    if (!entries.length) {
        if (hasWornArmor(player)) {
            player.sendMessage(t(player, "repairkit.msg.armor_full"));
        } else {
            player.sendMessage(t(player, "repairkit.msg.nothing_to_repair"));
        }
        return;
    }

    const totalCost = entries.length * config.pricePerItem;
    const armorHint = hasWornArmor(player) && !entries.some((e) => e.source === "equipment")
        ? `\n\n${t(player, "repairkit.hint.armor_full")}`
        : "";
    const form = new ActionFormData()
        .title(t(player, "repairkit.title"))
        .body(t(
            player,
            "repairkit.body",
            entries.length,
            priceTag(player, config.pricePerItem, config.currencyType),
            priceTag(player, totalCost, config.currencyType),
            formatBalance(player, config.currencyType),
        ) + armorHint);

    for (const entry of entries) {
        const stack = getStackForEntry(player, entry);
        const state = getDurabilityState(stack);
        const label = t(
            player,
            "repairkit.item.btn",
            itemDisplayName(stack),
            state?.pct ?? 0,
            priceTag(player, config.pricePerItem, config.currencyType),
        );
        form.button(label, resolveActionFormItemIcon(stack?.typeId));
    }

    form.button(t(player, "repairkit.btn.repair_all", priceTag(player, totalCost, config.currencyType)), "textures/ui/anvil_icon");
    form.button(t(player, "repairkit.btn.close"), "textures/ui/cancel");

    const res = await form.show(player);
    if (res.canceled || res.selection === entries.length + 1) return;
    if (res.selection === entries.length) {
        return repairItems(player, entries, config);
    }
    return repairItems(player, [entries[res.selection]], config);
}

export async function showRepairKitAdmin(player) {
    const config = getRepairKitConfig();
    const currencyIndex = config.currencyType === "coin" ? 1 : config.currencyType === "xp" ? 2 : 0;
    const res = await new ModalFormData()
        .title(t(player, "repairkit.admin.title"))
        .toggle(t(player, "repairkit.admin.toggle.enabled"), { defaultValue: config.enabled })
        .dropdown(t(player, "repairkit.admin.field.currency"), CURRENCY_OPTIONS, { defaultValueIndex: currencyIndex })
        .textField(t(player, "repairkit.admin.field.price"), "50", { defaultValue: String(config.pricePerItem) })
        .show(player);
    if (res.canceled) return;

    const next = normalizeConfig({
        enabled: res.formValues[0],
        currencyType: res.formValues[1] === 2 ? "xp" : res.formValues[1] === 1 ? "coin" : "money",
        pricePerItem: res.formValues[2],
    });

    if (saveRepairKitConfig(next)) {
        player.sendMessage(t(player, "repairkit.admin.msg.saved"));
        player.runCommand("playsound random.levelup @s ~~~ 1 1");
    } else {
        player.sendMessage(t(player, "repairkit.admin.msg.failed"));
    }
}
