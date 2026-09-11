import { world, ActionFormData, ModalFormData, ItemStack } from "../../../core";
import { QIDB } from "../../../function/QIDB.js";
import { GlobalConfig } from "../../../function/GlobalConfig.js";
import { Lang } from "../../../lib/Lang.js";
import { getPlayerRank, getRankInfo, getAllRanks } from "../../ranks/rank.js";

const starterKitStorage = new QIDB("starterkit", 20, 1);
const STARTER_KIT_CONFIG_KEY = "starterKitConfig";
const RANK_KIT_CONFIG_KEY = "starterKitRankConfig";
const DEFAULT_STARTER_KIT = {
 items: [
 { item: "diamond_sword", amount: 1 },
 { item: "diamond_pickaxe", amount: 1 },
 { item: "bread", amount: 16 },
 { item: "iron_helmet", amount: 1 },
 { item: "iron_chestplate", amount: 1 },
 { item: "iron_leggings", amount: 1 },
 { item: "iron_boots", amount: 1 }
 ],
 commands: [],
 allowCustomItems: true,
 allowCommands: true,
 cooldown: 24 * 60 * 60 * 1000,
 once: true
};
const AVAILABLE_RANKS = ["Member", "VIP", "Diamond", "Iron", "Gold", "Stone", "Noob"];

function resolveItemId(raw) {
 let id = String(raw ?? "").trim();
 if (!id) return null;
 if (id.includes(":")) {
  const [ns, ...rest] = id.split(":");
  let path = rest.join(":").trim();
  if (!path) return null;
  if (path.endsWith("_plank")) path = `${path}s`;
  return `${ns.trim() || "minecraft"}:${path}`;
 }
 if (id.endsWith("_plank")) id = `${id}s`;
 return `minecraft:${id}`;
}

function isCustomItemId(id) {
 const s = String(id ?? "");
 if (s.includes(":")) return !s.startsWith("minecraft:");
 return false;
}

function parseKitItemsString(str, allowCustom = true) {
 if (!str || typeof str !== "string") return [];
 const items = [];
 for (const part of str.split(";")) {
  const seg = part.trim();
  if (!seg) continue;
  const idx = seg.lastIndexOf(",");
  let id;
  let amount = 1;
  if (idx >= 0) {
   id = seg.slice(0, idx).trim();
   amount = parseInt(seg.slice(idx + 1).trim()) || 1;
  } else {
   id = seg;
  }
  const resolved = resolveItemId(id);
  if (!resolved) continue;
  if (!allowCustom && isCustomItemId(resolved)) continue;
  items.push({ item: resolved, amount: Math.max(1, Math.floor(amount)) });
 }
 return items;
}

function normalizeKitItem(raw, allowCustom = true) {
 if (!raw || typeof raw.item !== "string" || !raw.item.trim()) return null;
 const resolved = resolveItemId(raw.item);
 if (!resolved) return null;
 if (!allowCustom && isCustomItemId(resolved)) return null;
 return { item: resolved, amount: Math.max(1, Math.floor(Number(raw.amount) || 1)) };
}

function normalizeKitCommands(raw) {
 if (Array.isArray(raw)) {
  const out = [];
  for (const c of raw) {
   const s = String(c ?? "").trim();
   if (s) out.push(s);
  }
  return out;
 }
 if (typeof raw === "string" && raw.trim()) return parseKitCommandsString(raw);
 return [];
}

function parseKitCommandsString(str) {
 if (!str || typeof str !== "string") return [];
 const out = [];
 for (const part of str.split(/\r?\n|;/)) {
  const s = part.trim().replace(/^\//, "");
  if (s) out.push(s);
 }
 return out;
}

function getKitCommands(config) {
 if (config?.allowCommands === false) return [];
 return normalizeKitCommands(config?.commands);
}

function expandKitCommand(cmd, player) {
 return String(cmd ?? "").trim().replace(/^\//, "").split("{player}").join(`"${player.name}"`);
}

function runKitCommands(player, commands, allowCommands = true) {
 if (allowCommands === false) return { ok: 0, failed: [], disabled: true };
 const list = normalizeKitCommands(commands);
 if (!list.length) return { ok: 0, failed: [] };
 const failed = [];
 let ok = 0;
 for (const raw of list) {
  const cmd = expandKitCommand(raw, player);
  if (!cmd) continue;
  try {
   player.runCommand(cmd);
   ok++;
   continue;
  } catch {}
  try {
   const fallback = cmd.split("@s").join(`"${player.name}"`);
   player.dimension.runCommand(fallback);
   ok++;
  } catch {
   failed.push(raw);
  }
 }
 return { ok, failed };
}

function getRankDisplayLabel(rank) {
 const id = String(rank || "").startsWith("rank:") ? String(rank) : `rank:${rank}`;
 const info = getRankInfo(id);
 if (info?.name) return `${info.prefix || ""} §f${info.name}`;
 return String(rank);
}

function getRankKey(rank) {
 const raw = String(rank || "");
 if (raw.startsWith("rank:")) return raw.slice(5).toLowerCase();
 return raw.toLowerCase();
}

function getKitItems(config) {
 const allowCustom = config?.allowCustomItems !== false;
 const textItems = (config.items || []).filter(i => {
  if (!i) return false;
  const id = i.typeId || i.item;
  if (allowCustom) return true;
  if (i.typeId || i.clone) return !isCustomItemId(id);
  return !isCustomItemId(resolveItemId(id));
 });
 const storageKey = config.inventoryItemsKey;
 if (!storageKey) return textItems;
 try {
 const items = starterKitStorage.get(storageKey);
 const inventoryItems = Array.isArray(items) ? items.filter(Boolean).filter(i => allowCustom || !isCustomItemId(i.typeId)) : [];
 return [...textItems, ...inventoryItems];
 } catch {
 return textItems;
 }
}

function formatKitItem(item) {
 const id = item.typeId || item.item;
 const name = item.nameTag || String(id).replace("minecraft:", "").replace(/_/g, " ");
 return `${name} x${item.amount}`;
}

function giveInventoryKit(player, items) {
 const inventory = player.getComponent("minecraft:inventory")?.container;
 if (!inventory) return false;
 for (const item of items) {
 try {
 const leftover = inventory.addItem(item.clone());
 if (leftover) player.dimension.spawnItem(leftover, player.location);
 } catch {
 return false;
 }
 }
 return true;
}

function giveKitItems(player, config) {
 const items = getKitItems(config);
 if (!items.length) return false;
 const allowCustom = config?.allowCustomItems !== false;
 const stacks = [];
 const failed = [];
 for (const item of items) {
  try {
   if (item.typeId || item.clone) {
    if (!allowCustom && isCustomItemId(item.typeId)) {
     failed.push(String(item.typeId));
     continue;
    }
    stacks.push(item.clone ? item.clone() : item);
    continue;
   }
   const resolved = resolveItemId(item.item);
   if (!resolved) {
    failed.push(String(item.item));
    continue;
   }
   if (!allowCustom && isCustomItemId(resolved)) {
    failed.push(String(resolved));
    continue;
   }
   stacks.push(new ItemStack(resolved, Math.max(1, Math.floor(Number(item.amount) || 1))));
  } catch {
   failed.push(String(item.typeId || item.item));
  }
 }
 if (!stacks.length) return false;
 const ok = giveInventoryKit(player, stacks);
 if (failed.length) {
  try { player.sendMessage(Lang.t(player, "starterkit.msg.item_failed", failed.join(", "))); } catch {}
 }
 return ok;
}

function createDefaultStarterKitConfig() {
 return { ...DEFAULT_STARTER_KIT, items: DEFAULT_STARTER_KIT.items.map(item => ({ ...item })), commands: [...DEFAULT_STARTER_KIT.commands] };
}

function normalizeStarterKitConfig(raw) {
 const defaults = createDefaultStarterKitConfig();
 if (!raw || typeof raw !== "object") return defaults;
 const cooldown = Number(raw.cooldown);
 const allowCustomItems = raw.allowCustomItems !== false;
 const allowCommands = raw.allowCommands !== false;
 const items = [];
 if (Array.isArray(raw.items)) {
 for (const item of raw.items) {
 const norm = normalizeKitItem(item, allowCustomItems);
 if (norm) items.push(norm);
 }
 }
 return {
 ...raw,
 items: Array.isArray(raw.items) ? items : defaults.items,
 commands: allowCommands ? normalizeKitCommands(raw.commands) : [],
 allowCustomItems,
 allowCommands,
 cooldown: Number.isFinite(cooldown) && cooldown > 0 ? cooldown : defaults.cooldown,
 once: typeof raw.once === "boolean" ? raw.once : defaults.once,
 };
}

function getStarterKitConfig() {
 return normalizeStarterKitConfig(GlobalConfig.get(STARTER_KIT_CONFIG_KEY));
}

function saveStarterKitConfig(config) {
 return GlobalConfig.set(STARTER_KIT_CONFIG_KEY, normalizeStarterKitConfig(config));
}

function getRankKitConfig() {
 const raw = GlobalConfig.get(RANK_KIT_CONFIG_KEY);
 if (!raw || typeof raw !== "object") return {};
 return raw;
}

function saveRankKitConfig(config) {
 const base = getStarterKitConfig();
 const out = {};
 if (config && typeof config === "object") {
  for (const [k, v] of Object.entries(config)) {
   if (!v || typeof v !== "object") continue;
   const items = [];
   if (Array.isArray(v.items)) {
    for (const it of v.items) {
     const n = normalizeKitItem(it, base.allowCustomItems !== false);
     if (n) items.push(n);
    }
   }
   out[k] = { items, commands: base.allowCommands === false ? [] : normalizeKitCommands(v.commands) };
  }
 }
 return GlobalConfig.set(RANK_KIT_CONFIG_KEY, out);
}

function getRankKitItems(rank) {
 const rankKitConfig = getRankKitConfig();
 const base = getStarterKitConfig();
 const allowCustom = base.allowCustomItems !== false;
 const rankKey = rank?.toLowerCase() || "";
 if (rankKitConfig[rankKey]) {
 const rawItems = rankKitConfig[rankKey].items || [];
 const norm = [];
 for (const it of rawItems) {
 const n = normalizeKitItem(it, allowCustom);
 if (n) norm.push(n);
 }
 return norm.length ? norm : [];
 }
 return null;
}

function getRankKitCommands(rank) {
 const rankKitConfig = getRankKitConfig();
 const rankKey = rank?.toLowerCase() || "";
 if (rankKitConfig[rankKey]) return normalizeKitCommands(rankKitConfig[rankKey].commands);
 return null;
}

function getPlayerKitConfig(player) {
 const rank = getPlayerRank(player);
 const rankKitItems = getRankKitItems(rank);
 const rankKitCommands = getRankKitCommands(rank);
 const baseConfig = getStarterKitConfig();
 if ((rankKitItems && rankKitItems.length > 0) || (rankKitCommands && rankKitCommands.length > 0)) {
  return {
   ...baseConfig,
   items: rankKitItems && rankKitItems.length > 0 ? rankKitItems : baseConfig.items,
   commands: rankKitCommands && rankKitCommands.length > 0 ? rankKitCommands : baseConfig.commands
  };
 }
 return baseConfig;
}

function isKitEmpty(config) {
 return getKitItems(config).length === 0 && getKitCommands(config).length === 0;
}

function giveFullKit(player, config) {
 const items = getKitItems(config);
 const commands = getKitCommands(config);
 if (!items.length && !commands.length) return false;
 let itemsOk = true;
 if (items.length) itemsOk = giveKitItems(player, config);
 let cmdOk = true;
 if (commands.length) {
  const res = runKitCommands(player, commands, config?.allowCommands !== false);
  cmdOk = res.ok > 0;
  if (res.failed.length) {
   try { player.sendMessage(Lang.t(player, "starterkit.msg.cmd_failed", res.failed.join("; "))); } catch {}
  }
 }
 return itemsOk || cmdOk;
}
function getCurrentTimestamp() {
 return Date.now();
}
function formatDuration(ms) {
 const seconds = Math.floor((ms / 1000) % 60);
 const minutes = Math.floor((ms / (1000 * 60)) % 60);
 const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
 const days = Math.floor(ms / (1000 * 60 * 60 * 24));
 const parts = [];
 if (days > 0) parts.push(`${days}d`);
 if (hours > 0) parts.push(`${hours}h`);
 if (minutes > 0) parts.push(`${minutes}m`);
 if (seconds > 0) parts.push(`${seconds}s`);
 return parts.length > 0 ? parts.join(" ") : "0s";
}
export async function showStarterKitMenu(player) {
 const isAdmin = player.hasTag("admin");
 const config = getStarterKitConfig();
 if (isAdmin) {
 const modeLabel = config.once ? Lang.t(player, "starterkit.mode.once") : Lang.t(player, "starterkit.mode.repeat");
 const cooldownLabel = config.once
 ? Lang.t(player, "starterkit.admin.cooldown.repeat_only", formatDuration(config.cooldown))
 : Lang.t(player, "starterkit.admin.cooldown", formatDuration(config.cooldown));
 const rankKitConfig = getRankKitConfig();
 const rankKitCount = Object.keys(rankKitConfig).filter(k => (rankKitConfig[k]?.items?.length > 0) || (normalizeKitCommands(rankKitConfig[k]?.commands).length > 0)).length;
 const cmdCount = getKitCommands(config).length;
 const onOff = (v) => v ? Lang.t(player, "common.enabled") : Lang.t(player, "common.disabled");
 const form = new ActionFormData()
 .simpleUi()
 .title(Lang.t(player, "starterkit.admin.title"))
 .body(
 Lang.t(player, "starterkit.admin.items", getKitItems(config).length) +
 `\n` + Lang.t(player, "starterkit.admin.commands", cmdCount) +
 `\n` + Lang.t(player, "starterkit.admin.mode", modeLabel) +
 `\n§7${cooldownLabel}` +
 `\n` + Lang.t(player, "starterkit.admin.ranks", rankKitCount) +
 `\n` + Lang.t(player, "starterkit.admin.custom_items", onOff(config.allowCustomItems !== false)) +
 `\n` + Lang.t(player, "starterkit.admin.custom_cmds", onOff(config.allowCommands !== false))
 )
 .button(Lang.t(player, "starterkit.btn.set_items"), "textures/ui/gift_square")
 .button(Lang.t(player, "starterkit.btn.set_commands"), "textures/ui/chat_send")
 .button(Lang.t(player, "starterkit.btn.add_inventory"), "textures/ui/inventory_icon")
 .button(
 config.once
 ? `§8${Lang.t(player, "starterkit.btn.set_cooldown")}`
 : Lang.t(player, "starterkit.btn.set_cooldown"),
 "textures/ui/timer"
 )
 .button(config.once ? Lang.t(player, "starterkit.btn.to_repeat") : Lang.t(player, "starterkit.btn.to_once"), "textures/ui/refresh")
 .button(Lang.t(player, "starterkit.admin.custom_items", onOff(config.allowCustomItems !== false)), "textures/ui/button_custom/item")
 .button(Lang.t(player, "starterkit.admin.custom_cmds", onOff(config.allowCommands !== false)), "textures/ui/chat_send")
 .button(Lang.t(player, "starterkit.btn.preview"), "textures/ui/copy")
 .button(Lang.t(player, "starterkit.btn.rank"), "textures/ui/button_custom/settings")
 .button(Lang.t(player, "starterkit.btn.npc"), "textures/ui/dressing_room_skins")
 .button(Lang.t(player, "starterkit.btn.reset_items"), "textures/ui/refresh_light")
 .button(Lang.t(player, "starterkit.btn.reset_claims"), "textures/ui/refresh_light")
 .button(Lang.t(player, "common.close"), "textures/ui/cancel");
 const res = await form.show(player);
 if (res.canceled) return;
 if (res.selection === 0) await editStarterKitItems(player);
 else if (res.selection === 1) await editStarterKitCommands(player);
 else if (res.selection === 2) await addStarterKitItemFromInventory(player);
 else if (res.selection === 3 && !config.once) await editStarterKitCooldown(player);
 else if (res.selection === 4) await toggleStarterKitOnce(player);
 else if (res.selection === 5) await toggleCustomItems(player);
 else if (res.selection === 6) await toggleCustomCommands(player);
 else if (res.selection === 7) await previewStarterKit(player);
 else if (res.selection === 8) await showRankKitSettingsMenu(player);
 else if (res.selection === 9) {
 player.runCommand('dialogue open @e[type=npc,c=1,r=5] @s');
 return;
 }
 else if (res.selection === 10) await resetStarterKitItems(player);
 else if (res.selection === 11) await resetStarterKitClaims(player);
 } else {
 await claimStarterKitMenu(player);
 }
}
async function claimStarterKitMenu(player) {
 const config = getPlayerKitConfig(player);
 const rank = getPlayerRank(player);
 const rankInfo = getRankInfo(rank);
 const rankName = rankInfo?.name || rank || "Default";
 const lastClaim = player.getDynamicProperty("starterKit:lastClaim") || 0;
 const now = getCurrentTimestamp();
 const timeLeft = config.cooldown - (now - lastClaim);
 const alreadyClaimed = player.getDynamicProperty("starterKit:claimedOnce") === true || player.getDynamicProperty("starterKit:claimedOnce") === 1;
 const modeLabel = config.once ? Lang.t(player, "starterkit.mode.once") : Lang.t(player, "starterkit.mode.repeat");
 let body = `§e${Lang.t(player, "starterkit.claim.intro")}\n\n` +
 Lang.t(player, "starterkit.claim.rank", rankName) + `\n\n` +
 getKitItems(config).map(i => `§7• ${formatKitItem(i)}`).join("\n");
 const _cmds = getKitCommands(config);
 if (_cmds.length) {
  body += (_cmds.length && getKitItems(config).length ? "\n" : "") + _cmds.map(c => `§7• §d/cmd: §f${c}`).join("\n");
 }
 body += `\n\n` + Lang.t(player, "starterkit.admin.mode", modeLabel);
 if (!config.once) {
 body += `\n§f${Lang.t(player, "starterkit.admin.cooldown", formatDuration(config.cooldown))}`;
 }
 if (config.once && alreadyClaimed) {
 body += `\n${Lang.t(player, "starterkit.claim.once_only")}`;
 }
 const form = new ActionFormData()
 .title(Lang.t(player, "starterkit.claim.title"))
 .body(body)
 .button(config.once && alreadyClaimed ? Lang.t(player, "starterkit.claim.claimed_btn") : Lang.t(player, "starterkit.claim.btn"), "textures/ui/gift_square")
 .button(Lang.t(player, "common.close"), "textures/ui/cancel");
 const res = await form.show(player);
 if (!res.canceled && res.selection === 0) {
 if (config.once && alreadyClaimed) {
 player.sendMessage(Lang.t(player, "starterkit.msg.claimed_once"));
 player.runCommand("playsound note.bass @s ~~~ 1 1");
 return;
 }
 if (timeLeft > 0 && !config.once) {
 player.sendMessage(Lang.t(player, "starterkit.msg.cooldown_wait", formatDuration(timeLeft)));
 player.runCommand("playsound note.bass @s ~~~ 1 1");
 return;
 }
 if (!giveFullKit(player, config)) {
 player.sendMessage(Lang.t(player, "starterkit.msg.empty"));
 return;
 }
 player.setDynamicProperty("starterKit:lastClaim", now);
 if (config.once) player.setDynamicProperty("starterKit:claimedOnce", true);
 player.sendMessage(Lang.t(player, "starterkit.msg.success"));
 player.runCommand("playsound random.levelup @s ~~~ 1 1");
 }
}
async function editStarterKitItems(player) {
 const config = getStarterKitConfig();
 const form = new ModalFormData()
 .title(Lang.t(player, "starterkit.edit.items_title"))
 .textField("Item list (format: item,amount;item,amount)", "diamond_sword,1;bread,16", {
 defaultValue: config.items.map(i => `${i.item},${i.amount}`).join(";")
 });
 const res = await form.show(player);
 if (res.canceled) return;
 const itemsStr = res.formValues[0];
 const items = parseKitItemsString(itemsStr, config.allowCustomItems !== false);
 if (!itemsStr?.trim() || !items.length) {
  player.sendMessage(config.allowCustomItems === false ? Lang.t(player, "starterkit.msg.custom_blocked") : Lang.t(player, "starterkit.msg.invalid_items"));
  return;
 }
 config.items = items;
 config.useInventoryItems = false;
 config.inventoryItems = false;
 config.inventoryItemsKey = undefined;
 if (saveStarterKitConfig(config)) player.sendMessage(Lang.t(player, "starterkit.msg.items_updated"));
 else player.sendMessage("§cCould not save the starter kit.");
}
async function editStarterKitCommands(player) {
 const config = getStarterKitConfig();
 if (config.allowCommands === false) {
  player.sendMessage(Lang.t(player, "starterkit.msg.cmds_disabled"));
  return;
 }
 const form = new ModalFormData()
 .title(Lang.t(player, "starterkit.edit.cmds_title"))
 .textField("Command list (pisah dengan ; atau baris baru, tanpa /). Contoh: give @s bread 16; xp 10 @s. Support {player} dan @s.", "give @s bread 16;give @s iron_ingot 9", {
 defaultValue: getKitCommands(config).join(";")
 });
 const res = await form.show(player);
 if (res.canceled) return;
 const commands = parseKitCommandsString(res.formValues[0]);
 config.commands = commands;
 if (saveStarterKitConfig(config)) player.sendMessage(Lang.t(player, "starterkit.msg.cmd_updated", commands.length));
 else player.sendMessage("§cCould not save the starter-kit commands.");
}
async function resetStarterKitItems(player) {
 const form = new ActionFormData()
 .title("Reset Kit Items")
 .body("§cThis restores the default starter-kit items and disables items added from inventory.\n\n§7Cooldown and claim mode will not change.")
 .button("§cReset Items", "textures/ui/refresh_light")
 .button("Cancel", "textures/ui/cancel");
 const response = await form.show(player);
 if (response.canceled || response.selection !== 0) return;
 const config = getStarterKitConfig();
 config.items = DEFAULT_STARTER_KIT.items.map(item => ({ ...item }));
 config.useInventoryItems = false;
 config.inventoryItems = false;
 config.inventoryItemsKey = undefined;
 if (saveStarterKitConfig(config)) player.sendMessage(Lang.t(player, "starterkit.msg.items_reset"));
 else player.sendMessage("§cCould not reset the starter kit.");
}
async function resetStarterKitClaims(player) {
 const form = new ActionFormData()
 .simpleUi()
 .title("Reset Starter-Kit Claims")
 .body("§cThis removes the claim and cooldown status for every player currently online.\n\n§7Offline players are not affected.")
 .button("§cReset Online Claims", "textures/ui/refresh_light")
 .button("Cancel", "textures/ui/cancel");
 const response = await form.show(player);
 if (response.canceled || response.selection !== 0) return;
 let resetCount = 0;
 for (const target of world.getAllPlayers()) {
 try {
 target.setDynamicProperty("starterKit:lastClaim", undefined);
 target.setDynamicProperty("starterKit:claimedOnce", undefined);
 resetCount++;
 } catch { }
 }
 player.sendMessage(Lang.t(player, "starterkit.msg.claims_reset", resetCount));
}
async function addStarterKitItemFromInventory(player) {
 const inventory = player.getComponent("minecraft:inventory")?.container;
 if (!inventory) {
 player.sendMessage("§cYour inventory is not available.");
 return;
 }
 const availableItems = [];
 for (let slot = 0; slot < inventory.size; slot++) {
 const item = inventory.getItem(slot);
 if (item) availableItems.push(item);
 }
 if (availableItems.length === 0) {
 player.sendMessage("§cPut the starter-kit items in your inventory first.");
 return;
 }
 const form = new ModalFormData()
 .title("Add Kit Item From Inventory")
 .dropdown(
 "Select the item stack to add",
 availableItems.map(item => `${item.nameTag || item.typeId} x${item.amount}`),
 { defaultValueIndex: 0 }
 );
 const response = await form.show(player);
 if (response.canceled) return;
 const selectedItem = availableItems[response.formValues[0]];
 if (!selectedItem) return;
 try {
 const config = getStarterKitConfig();
 if (config.allowCustomItems === false && isCustomItemId(selectedItem.typeId)) {
  player.sendMessage(Lang.t(player, "starterkit.msg.custom_blocked"));
  return;
 }
 const storageKey = config.inventoryItemsKey || `kit_${Date.now().toString(36)}`;
 const savedItems = starterKitStorage.get(storageKey);
 const inventoryItems = Array.isArray(savedItems) ? savedItems.filter(Boolean) : [];
 inventoryItems.push(selectedItem.clone());
 starterKitStorage.setNow(storageKey, inventoryItems);
 config.inventoryItems = true;
 config.inventoryItemsKey = storageKey;
 if (!saveStarterKitConfig(config)) throw new Error("Starter-kit config save failed");
 player.sendMessage("§aItem added to the starter kit. Shulker box contents are included.");
 } catch {
 player.sendMessage("§cCould not save the inventory starter kit.");
 }
}
async function editStarterKitCooldown(player) {
 const config = getStarterKitConfig();
 const form = new ModalFormData()
 .title("Set Starter Kit Cooldown")
 .slider("Cooldown (hours)", 1, 168, {
 defaultValue: Math.max(1, Math.floor(config.cooldown / 3600000)),
 valueStep: 1
 });
 const res = await form.show(player);
 if (res.canceled) return;
 const hours = res.formValues[0];
 config.cooldown = hours * 60 * 60 * 1000;
 if (saveStarterKitConfig(config)) player.sendMessage(Lang.t(player, "starterkit.msg.cooldown_set", hours));
 else player.sendMessage("§cCould not save the starter-kit cooldown.");
}
async function toggleStarterKitOnce(player) {
 const config = getStarterKitConfig();
 config.once = !config.once;
 const modeLabel = config.once ? Lang.t(player, "starterkit.mode.once") : Lang.t(player, "starterkit.mode.repeat");
 if (saveStarterKitConfig(config)) player.sendMessage(Lang.t(player, "starterkit.msg.mode", modeLabel));
 else player.sendMessage("§cCould not save the starter-kit mode.");
}
async function toggleCustomItems(player) {
 const config = getStarterKitConfig();
 config.allowCustomItems = !(config.allowCustomItems !== false);
 const onOff = config.allowCustomItems ? Lang.t(player, "common.enabled") : Lang.t(player, "common.disabled");
 if (saveStarterKitConfig(config)) player.sendMessage(Lang.t(player, "starterkit.msg.toggled", "Custom Items", onOff));
 else player.sendMessage("§cCould not save.");
}
async function toggleCustomCommands(player) {
 const config = getStarterKitConfig();
 config.allowCommands = !(config.allowCommands !== false);
 const onOff = config.allowCommands ? Lang.t(player, "common.enabled") : Lang.t(player, "common.disabled");
 if (saveStarterKitConfig(config)) player.sendMessage(Lang.t(player, "starterkit.msg.toggled", "Custom Commands", onOff));
 else player.sendMessage("§cCould not save.");
}
async function previewStarterKit(player) {
 const config = getStarterKitConfig();
 const items = getKitItems(config);
 const commands = getKitCommands(config);
 const form = new ActionFormData()
 .simpleUi()
 .title(Lang.t(player, "starterkit.preview.title"))
 .body(Lang.t(player, "starterkit.preview.body", items.length, commands.length));
 for (const item of items) form.button(`§f${formatKitItem(item)}`);
 for (const cmd of commands) form.button(`§d/cmd: §f${cmd}`);
 form.button(Lang.t(player, "common.back"), "textures/ui/arrow_left.png");
 await form.show(player);
}
export function giveStarterKit(player) {
 const config = getPlayerKitConfig(player);
 giveFullKit(player, config);
}

async function showRankKitSettingsMenu(player) {
 const rankKitConfig = getRankKitConfig();
 const ranks = getAllRanks();
 const form = new ActionFormData()
 .simpleUi()
 .title(Lang.t(player, "starterkit.rank.title"))
 .body(Lang.t(player, "starterkit.rank.body"));

 for (const rank of ranks) {
 const rankKey = getRankKey(rank);
 const hasKit = (rankKitConfig[rankKey]?.items?.length > 0) || (normalizeKitCommands(rankKitConfig[rankKey]?.commands).length > 0);
 const label = getRankDisplayLabel(rank);
 form.button(`${hasKit ? "§a✓" : "§7✗"} ${label}`, hasKit ? "textures/ui/button_custom/item" : "textures/ui/button_custom/cheats-icon-33f13");
 }

 form.button("§cReset All Rank Kits", "textures/ui/refresh_light")
 .button("§cBack", "textures/ui/arrow_left");

 const res = await form.show(player);
 if (res.canceled) return;

 if (res.selection === ranks.length) {
 await resetAllRankKits(player);
 } else if (res.selection === ranks.length + 1) {
 await showStarterKitMenu(player);
 } else {
 await editRankKitItems(player, ranks[res.selection]);
 }
}

async function editRankKitItems(player, rank) {
 const rankKitConfig = getRankKitConfig();
 const rankKey = getRankKey(rank);
 const rankLabel = getRankDisplayLabel(rank);
 const currentConfig = rankKitConfig[rankKey] || { items: [], commands: [] };
 const currentItems = currentConfig.items || [];
 const currentCommands = normalizeKitCommands(currentConfig.commands);

 const form = new ModalFormData()
 .title(`Set ${rankLabel} Kit Items`)
 .textField(
 `Item list (format: item,amount;item,amount)`,
 `iron_sword,1;bread,16`,
 { defaultValue: currentItems.map(i => `${i.item},${i.amount}`).join(";") }
 )
 .textField(
 `Command list (pisah ; atau baris baru, tanpa /)`,
 `give @s bread 16`,
 { defaultValue: currentCommands.join(";") }
 );

 const res = await form.show(player);
 if (res.canceled) return;

 const itemsStr = res.formValues[0];
 const base = getStarterKitConfig();
 const items = parseKitItemsString(itemsStr, base.allowCustomItems !== false);
 const commands = base.allowCommands === false ? [] : parseKitCommandsString(res.formValues[1]);

 rankKitConfig[rankKey] = { items, commands };
 saveRankKitConfig(rankKitConfig);

 player.sendMessage(Lang.t(player, "starterkit.rank.updated", rankLabel, items.length, commands.length));
}

async function resetAllRankKits(player) {
 const form = new ActionFormData()
 .simpleUi()
 .title("Reset All Rank Kits")
 .body("§cThis will remove all rank-specific kits.\n§7All ranks will use the default kit.")
 .button("§cReset All", "textures/ui/refresh_light")
 .button("Cancel", "textures/ui/cancel");

 const response = await form.show(player);
 if (response.canceled || response.selection !== 0) return;

 saveRankKitConfig({});
 player.sendMessage("§aAll rank kits have been reset. All ranks now use the default kit.");
}
