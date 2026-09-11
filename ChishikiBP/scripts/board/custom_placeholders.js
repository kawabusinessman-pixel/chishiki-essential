import {
 ActionFormData,
 ModalFormData,
 MessageFormData,
} from "../core.js";
import { ForceOpen } from "../function/ForceOpen.js";
import { PlaceholderDB } from "./data.js";
import { notifyConfigChange } from "./_config.js";
import {
 UI_TEXTURES,
 sendSuccessMessage,
 sendErrorMessage,
 sendNoChangesMessage,
} from "./ui_common.js";
const DEFAULT_PLACEHOLDERS = [
 "NAME",
 "CURRENCY",
 "MONEY",
 "BANK",
 "COIN",
 "RANK",
 "CLAN",
 "GENDER",
 "HEALTH",
 "LEVEL",
 "XP",
 "KILL",
 "DEATH",
 "PLAYTIME",
 "CLEARLAG",
 "PING",
 "ONLINE",
 "MAXON",
 "HOMES",
 "MAXHOMES",
 "HOMESMAX",
 "LANDS",
 "MAXLANDS",
 "LANDSMAX",
 "HOUR",
 "MINUTE",
 "DAY",
 "MONTH",
 "YEAR",
 "TIMEZONE",
 "DIMENSION",
 "X",
 "Y",
 "Z",
 "TPS",
 "BLANK",
];
async function handleCustomPlaceholders(player, onBack) {
 const UI = new ActionFormData()
 .title("Custom Placeholders")
 .body("Create and manage custom placeholders (e.g. @DISCORD)")
 .button("Add New Placeholder", UI_TEXTURES.TOGGLE_ON)
 .button("Manage Existing", UI_TEXTURES.SETTING);
 const result = await ForceOpen(player, UI);
 if (result.canceled) return onBack?.(player);
 if (result.selection === 0) {
 await handleAddPlaceholder(player, onBack);
 } else {
 await handleManagePlaceholders(player, onBack);
 }
}
async function handleAddPlaceholder(player, onBack) {
 const UI = new ModalFormData()
 .title("Add Placeholder")
 .textField("Key (without @)", "e.g. DISCORD")
 .textField("Value", "e.g. discord.gg/example");
 const result = await ForceOpen(player, UI);
 if (result.canceled) return handleCustomPlaceholders(player, onBack);
 let [key, value] = result.formValues;
 if (!key || !value) {
 sendErrorMessage(player, "§c Key and Value are required");
 return handleAddPlaceholder(player, onBack);
 }
 key = key.trim().replace(/^@/, "").toUpperCase();
 PlaceholderDB.set(key, value);
 notifyConfigChange();
 sendSuccessMessage(player, `§a Added placeholder @${key}`);
 handleCustomPlaceholders(player, onBack);
}
async function handleManagePlaceholders(player, onBack) {
 const dbKeys = Array.from(PlaceholderDB.keys());
 const allKeys = [...new Set([...DEFAULT_PLACEHOLDERS, ...dbKeys])].sort();
 const UI = new ActionFormData()
 .title("Manage Placeholders")
 .button("§cReset All Placeholders", UI_TEXTURES.REFRESH);
 for (const key of allKeys) {
 const isDefault = DEFAULT_PLACEHOLDERS.includes(key);
 const isOverridden = PlaceholderDB.has(key);
 let status = "";
 let val = "";
 if (isOverridden) {
 val = PlaceholderDB.get(key);
 status = "§a[Custom]";
 if (isDefault) status = "§e[Overridden]";
 } else {
 status = "§7[Default]";
 val = "Dynamic Value";
 }
 const displayVal = val.length > 20 ? val.substring(0, 20) + "..." : val;
 UI.button(`@${key}\n${status} §r${displayVal}`);
 }
 const result = await ForceOpen(player, UI);
 if (result.canceled) return handleCustomPlaceholders(player, onBack);
 if (result.selection === 0) {
 await handleResetAllPlaceholders(player, onBack);
 return;
 }
 const selectedKey = allKeys[result.selection - 1];
 await handleEditPlaceholder(player, selectedKey, onBack);
}
async function handleResetAllPlaceholders(player, onBack) {
 const UI = new MessageFormData()
 .title("Reset All Placeholders")
 .body("Are you sure you want to delete all custom placeholders and reset all overrides?")
 .button1("Reset All")
 .button2("Cancel");
 const result = await ForceOpen(player, UI);
 if (result.canceled || result.selection === 1)
 return handleManagePlaceholders(player, onBack);
 PlaceholderDB.clear();
 notifyConfigChange();
 sendSuccessMessage(player, "§a All custom placeholders have been reset.");
 handleManagePlaceholders(player, onBack);
}
async function handleEditPlaceholder(player, key, onBack) {
 const currentVal = PlaceholderDB.get(key);
 const isDefault = DEFAULT_PLACEHOLDERS.includes(key);
 let placeholderText = "Enter new value";
 if (isDefault && !currentVal) {
 placeholderText = "Enter value to override default";
 }
 const UI = new ModalFormData().title(`Edit @${key}`);
 if (!isDefault) {
 UI.textField("Key (without @)", "e.g. DISCORD", {defaultValue: key});
 }
 UI.textField("Value", placeholderText, {defaultValue: currentVal});
 if (currentVal !== undefined) {
 UI.toggle(isDefault ? "§eReset to Default" : "§cDelete Placeholder", {defaultValue: false});
 }
 const result = await ForceOpen(player, UI);
 if (result.canceled) return handleManagePlaceholders(player, onBack);
 const formValues = result.formValues;
 let newKey = key;
 let newValue;
 let deleteFlag = false;
 if (!isDefault) {
 newKey = formValues[0].trim().replace(/^@/, "").toUpperCase();
 newValue = formValues[1];
 if (formValues.length > 2) deleteFlag = formValues[2];
 } else {
 newValue = formValues[0];
 if (formValues.length > 1) deleteFlag = formValues[1];
 }
 if (deleteFlag) {
 PlaceholderDB.delete(key);
 notifyConfigChange();
 sendSuccessMessage(
 player,
 isDefault ? `§a Reset @${key} to default` : `§a Deleted @${key}`,
 );
 } else {
 if (!isDefault && newKey !== key) {
 if (newKey.length === 0) {
 sendErrorMessage(player, "§c Key cannot be empty");
 return handleEditPlaceholder(player, key, onBack);
 }
 if (PlaceholderDB.has(newKey) || DEFAULT_PLACEHOLDERS.includes(newKey)) {
 sendErrorMessage(player, `§c Placeholder @${newKey} already exists`);
 return handleEditPlaceholder(player, key, onBack);
 }
 PlaceholderDB.delete(key);
 PlaceholderDB.set(newKey, newValue);
 notifyConfigChange();
 sendSuccessMessage(player, `§a Renamed @${key} to @${newKey}`);
 return handleManagePlaceholders(player, onBack);
 }
 if (newValue !== currentVal) {
 PlaceholderDB.set(key, newValue);
 notifyConfigChange();
 sendSuccessMessage(player, `§a Updated @${key}`);
 } else {
 sendNoChangesMessage(player);
 }
 }
 handleManagePlaceholders(player, onBack);
}
export { handleCustomPlaceholders };
