import { ActionFormData, ModalFormData } from "../../core.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";

const toSliderNumber = (value, fallback, min, max) => {
 const parsed = Number(value);
 if (!Number.isFinite(parsed)) return fallback;
 if (parsed < min) return min;
 if (parsed > max) return max;
 return parsed;
};

const parseItemRewards = (enabled, itemIdValue, itemCountValue) => {
 if (!enabled) return [];

 const id = String(itemIdValue ?? "").trim();
 if (!id) return [];

 const parsedCount = Number.parseInt(String(itemCountValue ?? ""), 10);
 const count = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;
 return [{ id, count }];
};

const getFirstItemReward = (items) => {
 if (!Array.isArray(items)) return { id: "", count: "1" };
 const first = items.find(item => item && typeof item === "object" && typeof item.id === "string" && item.id.trim());
 if (!first) return { id: "", count: "1" };

 const parsedCount = Number.parseInt(String(first.count ?? "1"), 10);
 return {
 id: first.id.trim(),
 count: Number.isFinite(parsedCount) && parsedCount > 0 ? String(parsedCount) : "1"
 };
};

function getCustomQuests() {
 return GlobalConfig.get("custom_quests", []);
}

function saveCustomQuests(quests) {
 GlobalConfig.set("custom_quests", quests);
}

export async function showCustomQuestMenu(player) {
 try {
 const quests = getCustomQuests();
 const form = new ActionFormData()
 .title("§6Custom Quests")
 .body("§eManage your custom dynamic quests here:")
 .button("§a+ Create New Quest\n§8Add a custom quest", "textures/ui/color_plus");

 quests.forEach((q, i) => {
 const typeText = q.type === "combat" ? "⚔ Combat" : q.type === "mining" ? "⛏ Mining" : "🌾 Farming";
 const itemPreview = getFirstItemReward(q.items);
 const itemText = itemPreview.id ? ` | Item: ${itemPreview.id} x${itemPreview.count}` : "";
 form.button(`${q.name}\n§8${typeText} | Target: ${q.target} | Reward: $${q.money}, XP ${q.xp ?? 100}${itemText}`, q.icon || "textures/items/book_enchanted");
 });

 form.button("§cBack\n§8Return to Quest Admin", "textures/ui/arrow_left");

 const response = await form.show(player);
 if (response.canceled) return;

 if (response.selection === 0) {
 await showCreateCustomQuest(player);
 } else if (response.selection === quests.length + 1) {
 const { showQuestAdminMenu } = await import("./quest_admin.js");
 showQuestAdminMenu(player);
 } else {
 await showEditCustomQuest(player, response.selection - 1);
 }
 } catch (e) {
 console.warn("Error in custom quest menu:", e);
 }
}

async function showCreateCustomQuest(player) {
 const form = new ModalFormData()
 .title("§2Create Custom Quest")
 .dropdown("§eQuest Type", ["Combat (Kill)", "Mining (Break)", "Farming (Harvest)"], { defaultValueIndex: 0 })
 .textField("§eQuest ID (Unique)\n§8e.g., custom_zombie_1", "custom_zombie_1")
 .textField("§eQuest Title\n§8e.g., Ultimate Zombie Slayer", "Ultimate Zombie Slayer")
 .textField("§eTarget ID\n§8e.g., minecraft:zombie or minecraft:dirt", "minecraft:zombie")
 .slider("§eTarget Amount\n§8How many to kill/mine", 1, 500, { valueStep: 1, defaultValue: 10 })
 .slider("§eMoney Reward", 0, 50000, { valueStep: 100, defaultValue: 1000 })
 .slider("§eXP Reward", 0, 1000, { valueStep: 10, defaultValue: 100 })
 .toggle("§eEnable Item Reward", { defaultValue: false })
 .textField("§eItem ID\n§8e.g., minecraft:stick or kiwora:token", "")
 .textField("§eItem Count", "1")
 .slider("§eCooldown (Hours)", 1, 168, { valueStep: 1, defaultValue: 24 })
 .textField("§eIcon Path\n§8e.g., textures/items/diamond_sword", "textures/items/diamond_sword");

 const response = await form.show(player);
 if (response.canceled) return showCustomQuestMenu(player);

 const [typeIndex, idValue, nameValue, targetIdValue, target, money, xp, itemEnabled, itemIdValue, itemCountValue, cooldown, iconValue] = response.formValues;

 const id = String(idValue ?? "").trim();
 const name = String(nameValue ?? "").trim();
 const targetId = String(targetIdValue ?? "").trim();
 const icon = String(iconValue ?? "").trim();
 const itemRewards = parseItemRewards(itemEnabled, itemIdValue, itemCountValue);

 if (!id || !name || !targetId) {
 player.sendMessage("§c⚠ ID, Title, and Target ID cannot be empty!");
 return showCustomQuestMenu(player);
 }

 const typeStr = ["combat", "mining", "farming"][typeIndex];
 const quests = getCustomQuests();

 if (quests.find(q => q.id === id)) {
 player.sendMessage(`§c⚠ A quest with ID '${id}' already exists!`);
 return showCustomQuestMenu(player);
 }

 quests.push({
 id,
 type: typeStr,
 name,
 targetId,
 target: toSliderNumber(target, 10, 1, 500),
 money: toSliderNumber(money, 1000, 0, 50000),
 xp: toSliderNumber(xp, 100, 0, 1000),
 items: itemRewards,
 cooldown: toSliderNumber(cooldown, 24, 1, 168),
 icon,
 tier: 1
 });

 saveCustomQuests(quests);
 player.sendMessage(`§a✔ Custom quest '${name}' created successfully!`);
 showCustomQuestMenu(player);
}

async function showEditCustomQuest(player, index) {
 const quests = getCustomQuests();
 const q = quests[index];
 if (!q) return showCustomQuestMenu(player);

 const typeIdx = q.type === "combat" ? 0 : q.type === "mining" ? 1 : 2;
 const itemDefault = getFirstItemReward(q.items);
 const itemEnabledDefault = itemDefault.id.length > 0;

 const form = new ModalFormData()
 .title(`§9Edit Quest: ${q.name}`)
 .dropdown("§eQuest Type", ["Combat (Kill)", "Mining (Break)", "Farming (Harvest)"], { defaultValueIndex: typeIdx })
 .textField("§eQuest Title", q.name, { defaultValue: q.name })
 .textField("§eTarget ID", q.targetId, { defaultValue: q.targetId })
 .slider("§eTarget Amount", 1, 500, { valueStep: 1, defaultValue: toSliderNumber(q.target, 10, 1, 500) })
 .slider("§eMoney Reward", 0, 50000, { valueStep: 100, defaultValue: toSliderNumber(q.money, 1000, 0, 50000) })
 .slider("§eXP Reward", 0, 1000, { valueStep: 10, defaultValue: toSliderNumber(q.xp, 100, 0, 1000) })
 .toggle("§eEnable Item Reward", { defaultValue: itemEnabledDefault })
 .textField("§eItem ID", "minecraft:stick or kiwora:token", { defaultValue: itemDefault.id })
 .textField("§eItem Count", "1", { defaultValue: itemDefault.count })
 .slider("§eCooldown (Hours)", 1, 168, { valueStep: 1, defaultValue: toSliderNumber(q.cooldown, 24, 1, 168) })
 .textField("§eIcon Path", q.icon || "textures/items/diamond_sword", { defaultValue: q.icon || "" })
 .toggle("§cDelete this quest?", { defaultValue: false });

 const response = await form.show(player);
 if (response.canceled) return showCustomQuestMenu(player);

 const [typeIndex, nameValue, targetIdValue, target, money, xp, itemEnabled, itemIdValue, itemCountValue, cooldown, iconValue, isDelete] = response.formValues;
 const name = String(nameValue ?? "").trim();
 const targetId = String(targetIdValue ?? "").trim();
 const icon = String(iconValue ?? "").trim();
 const itemRewards = parseItemRewards(itemEnabled, itemIdValue, itemCountValue);

 if (isDelete) {
 quests.splice(index, 1);
 saveCustomQuests(quests);
 player.sendMessage(`§a✔ Quest deleted successfully!`);
 return showCustomQuestMenu(player);
 }

 if (!name || !targetId) {
 player.sendMessage("§c⚠ Title and Target ID cannot be empty!");
 return showCustomQuestMenu(player);
 }

 q.type = ["combat", "mining", "farming"][typeIndex];
 q.name = name;
 q.targetId = targetId;
 q.target = toSliderNumber(target, q.target ?? 10, 1, 500);
 q.money = toSliderNumber(money, q.money ?? 1000, 0, 50000);
 q.xp = toSliderNumber(xp, q.xp ?? 100, 0, 1000);
 q.items = itemRewards;
 q.cooldown = toSliderNumber(cooldown, q.cooldown ?? 24, 1, 168);
 q.icon = icon;

 quests[index] = q;
 saveCustomQuests(quests);
 player.sendMessage(`§a✔ Custom quest '${name}' updated successfully!`);
 showCustomQuestMenu(player);
}
