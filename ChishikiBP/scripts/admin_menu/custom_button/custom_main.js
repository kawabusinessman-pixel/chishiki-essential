import { system, world, ActionFormData, ModalFormData } from "../../core.js";
import {
 getAllButtons,
 addButton,
 removeButton,
 updateButton,
 saveAllButtons,
} from "./custom_database.js";
import { featureStatus, setMemberFeatureEnabled } from "../../function/memberFeatureState.js";

const DEFAULT_ICON = "textures/ui/button_custom/buku_enchanted";
const SOUND_EFFECTS = [
 "random.orb",
 "random.levelup",
 "random.pop",
 "random.pop2",
 "random.click",
];

const messages = {
 noPermission: (action) =>
 `§c⚠ You don't have permission to ${action} buttons!`,
 noButtons: (action) => `§c❌ No buttons to ${action}!`,
 invalidName: "§c❌ Invalid or duplicate button name!",
 success: (action, name) => `§a✔ Button "${name}" ${action} successfully!`,
 genericFail: (what) => `§c❌ Failed to ${what}!`,
};

function isNameDuplicate(name, buttons, excludeName) {
 if (!name) return false;
 const n = name.trim().toLowerCase();
 return buttons.some(
 (b) => b.name.toLowerCase() === n && b.name !== excludeName,
 );
}
export function showButtonMenu(player) {
 if (!player.hasTag("admin")) {
 player.sendMessage(messages.noPermission("manage"));
 return;
 }
 const buttons = getAllButtons();
 const form = new ActionFormData().simpleUi()
 .title("§bcustom button menu")
 .body("§emanage your custom buttons for member menu");
 form
 .button("create new button\n§8[ add ]", DEFAULT_ICON)
 .button("delete buttons\n§8[ remove ]", "textures/ui/trash");
 buttons.forEach((btn) => {
 form.button(
 `§l${btn.name}§r\n§8${btn.description || "No description"}`,
 btn.icon || DEFAULT_ICON,
 );
 });
 form.show(player).then((response) => {
 if (!response || response.canceled) return;
 const selectedOptionIndex = response.selection;
 if (selectedOptionIndex === 0) {
 createButton(player);
 } else if (selectedOptionIndex === 1) {
 removeButtons(player);
 } else {
 editButton(player, buttons[selectedOptionIndex - 2]);
 }
 });
}
function createButton(player) {
 const form = new ActionFormData().simpleUi()
 .title("§bcreate button")
 .body("§eselect creation mode")
 .button(
 "§abasic create\n§8simple & fast",
 "textures/ui/button_custom/air-block_128-63725",
 )
 .button(
 "§dadvanced create\n§8more options",
 "textures/ui/button_custom/air-block_128-63725",
 );
 form.show(player).then((response) => {
 if (!response || response.canceled) return;
 if (response.selection === 0) {
 createBasicButton(player);
 } else {
 createAdvancedButton(player);
 }
 });
}
function createBasicButton(player) {
 const UI = new ModalFormData().title("basic create");
 UI.textField("button name", "enter button name", {
 defaultValue: "",
 placeholder: "example: shop, home",
 });
 UI.textField("command", "enter command", {
 defaultValue: "",
 placeholder: "example: /give @s diamond",
 });
 UI.toggle("use custom icon", {
 defaultValue: false,
 });
 UI.textField("icon path", "enter icon path", {
 defaultValue: DEFAULT_ICON,
 placeholder: "textures/ui/button_custom/...",
 });
 UI.show(player).then((response) => {
 try {
 if (!response || response.canceled) return;
 const [name, cmd, useCustomIcon, iconPath] = response.formValues;
 if (!name?.trim()) {
 player.sendMessage(messages.invalidName);
 return;
 }
 const buttons = getAllButtons();
 if (isNameDuplicate(name, buttons)) {
 player.sendMessage(messages.invalidName);
 return;
 }
 addButton({
 name: name.trim(),
 icon: useCustomIcon ? iconPath?.trim() || DEFAULT_ICON : DEFAULT_ICON,
 command: cmd?.trim() || "",
 });
 const featureKey = `custom_${name}`;
 setMemberFeatureEnabled(featureKey, true);
 player.sendMessage(messages.success("created", name));
 player.runCommand(`playsound random.levelup @s`);
 } catch (error) {
 console.warn("Error creating button:", error);
 player.sendMessage("§c❌ Failed to create button!");
 }
 });
}
function createAdvancedButton(player) {
 const UI = new ModalFormData().title("advanced create");
 UI.textField("button name", "enter button name", {
 defaultValue: "",
 placeholder: "example: shop, home",
 });
 UI.textField("description", "enter description", {
 defaultValue: "",
 placeholder: "example: main spawn area",
 });
 UI.textField("icon path", "enter icon path", {
 defaultValue: DEFAULT_ICON,
 placeholder: "textures/ui/button_custom/...",
 });
 UI.textField("command", "enter command", {
 defaultValue: "",
 placeholder: "example: /give @s diamond",
 });
 UI.toggle("enable sound", {
 defaultValue: true,
 });
 UI.dropdown(
 "sound effect",
 [
 "random.orb",
 "random.levelup",
 "random.pop",
 "random.pop2",
 "random.click",
 ],
 {
 defaultValueIndex: 0,
 },
 );
 UI.toggle("show particles", {
 defaultValue: false,
 });
 UI.toggle("require permission", {
 defaultValue: false,
 });
 UI.textField("permission tag", "enter permission tag", {
 defaultValue: "",
 placeholder: "example: custom_perm",
 });
 UI.toggle("hide command feedback", {
 defaultValue: false,
 });
 UI.show(player).then((response) => {
 try {
 if (!response || response.canceled) return;
 const [
 name,
 desc,
 icon,
 cmd,
 enableSound,
 soundIndex,
 showParticles,
 requirePerm,
 permTag,
 hideFeedback,
 ] = response.formValues;
 if (!name?.trim()) {
 player.sendMessage(messages.invalidName);
 return;
 }
 const buttons = getAllButtons();
 if (isNameDuplicate(name, buttons)) {
 player.sendMessage(messages.invalidName);
 return;
 }
 addButton({
 name: name.trim(),
 description: desc?.trim(),
 icon: icon?.trim() || DEFAULT_ICON,
 command: cmd?.trim() || "",
 settings: {
 sound: enableSound ? SOUND_EFFECTS[soundIndex] : undefined,
 particles: showParticles,
 requirePermission: requirePerm,
 permissionTag: requirePerm ? permTag?.trim() || undefined : undefined,
 hideFeedback: hideFeedback,
 },
 });
 const featureKey = `custom_${name}`;
 setMemberFeatureEnabled(featureKey, true);
 player.sendMessage(messages.success("created", name));
 player.runCommand(`playsound random.levelup @s`);
 } catch (error) {
 console.warn("Error creating advanced button:", error);
 player.sendMessage("§c❌ Failed to create button!");
 }
 });
}
function removeButtons(player) {
 const buttons = getAllButtons();
 if (!buttons.length) {
 player.sendMessage(messages.noButtons("remove"));
 return;
 }
 new ActionFormData().simpleUi()
 .title("§cremove buttons")
 .body("§eselect buttons to remove\n§7this action cannot be undone!")
 .button("§cremove single button", "textures/ui/trash")
 .button("§4remove all buttons", "textures/ui/icon_trash")
 .show(player)
 .then((response) => {
 try {
 if (!response || response.canceled) return;
 if (response.selection === 0) {
 new ModalFormData()
 .title("§cremove button")
 .dropdown(
 "select button",
 buttons.map((b) => b.name),
 )
 .show(player)
 .then((resp) => {
 if (!resp || resp.canceled) return;
 const index = resp.formValues[0];
 const btnName = buttons[index].name;
 removeButton(index);
 player.sendMessage(messages.success("removed", btnName));
 player.runCommand(`playsound random.break @s`);
 });
 } else {
 buttons.length = 0;
 saveAllButtons(buttons);
 player.sendMessage("§a✔ All buttons have been removed!");
 player.runCommand(`playsound random.break @s`);
 }
 } catch (error) {
 console.warn("Error removing button:", error);
 player.sendMessage("§c❌ Failed to remove button!");
 }
 });
}
function editButton(player, button) {
 new ModalFormData()
 .title("§bedit button")
 .textField("button name", "enter new button name", {
 defaultValue: button.name,
 placeholder: "example: shop, home",
 })
 .textField("description", "add details about this button", {
 defaultValue: button.description || "",
 placeholder: "optional: button description",
 })
 .textField("icon path", "enter icon path", {
 defaultValue: button.icon || DEFAULT_ICON,
 placeholder: "example: textures/ui/button_custom/buku_enchanted",
 })
 .textField("command", "enter command", {
 defaultValue: button.command || "",
 placeholder: "command to execute when clicked",
 })
 .show(player)
 .then((response) => {
 try {
 if (!response || response.canceled) return;
 const [name, desc, icon, cmd] = response.formValues;
 const buttons = getAllButtons();
 const index = buttons.findIndex((b) => b.name === button.name);
 if (!name?.trim()) {
 player.sendMessage(messages.invalidName);
 return;
 }
 if (isNameDuplicate(name, buttons, button.name)) {
 player.sendMessage(messages.invalidName);
 return;
 }
 updateButton(index, {
 name,
 description: desc?.trim() || undefined,
 icon: icon?.trim() || DEFAULT_ICON,
 command: cmd?.trim() || "",
 });
 player.sendMessage(messages.success("updated", name));
 player.runCommand(`playsound random.levelup @s`);
 } catch (error) {
 console.warn("Error editing button:", error);
 player.sendMessage("§c❌ Failed to edit button!");
 }
 });
}
export function executeButtonCommand(player, button) {
 if (!button || !button.command) return;
 try {
 if (button.settings?.hideFeedback) {
 player.runCommand("gamerule sendcommandfeedback false");
 player.runCommand(button.command);
 player.runCommand("gamerule sendcommandfeedback true");
 } else {
 player.runCommand(button.command);
 }
 if (button.settings?.sound) {
 player.runCommand(`playsound ${button.settings.sound} @s`);
 }
 } catch (error) {
 console.warn("Error executing button command:", error);
 player.sendMessage("§c❌ Failed to execute command!");
 }
}
