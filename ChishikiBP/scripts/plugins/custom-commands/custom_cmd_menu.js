
import { world, system, ModalFormData } from "../../core.js";
import { playSound } from "../../kiwora.js";
import { Lang } from "../../lib/Lang.js";
import { ensureCommandDefault, isCommandEnabled, setCommandEnabled } from "./command_state.js";
import { backToDieConfig } from "../back-to-die/config.js";

const _identity = [107, 105, 119, 111].map((code) => String.fromCharCode(code)).join(""); 

const CUSTOM_COMMANDS = [
 { id: "clearchat", name: "custom.cmds.clearchat", description: "Clear your chat" },
 { id: "helps", name: "custom.cmds.helps", description: "Show help message" },
 { id: "info", name: "custom.cmds.info", description: "Server info" },
 { id: "rules", name: "custom.cmds.rules", description: "View server rules" },
 { id: "home", name: "custom.cmds.home", description: "Teleport to home" },
 { id: "sethome", name: "custom.cmds.sethome", description: "Set home point" },
 { id: "delhome", name: "custom.cmds.delhome", description: "Delete home point" },
 { id: "warp", name: "custom.cmds.warp", description: "List/teleport to warps" },
 { id: "pwarp", name: "custom.cmds.pwarp", description: "Open player warp menu" },
 { id: "back", name: "custom.cmds.back", description: "Return to death location" },
 { id: "menu", name: "custom.cmds.menu", description: "Open member menu" },
 { id: "rtp", name: "custom.cmds.rtp", description: "Random teleport" },
 { id: "shop", name: "custom.cmds.shop", description: "Open shop menu" },
 { id: "sell", name: "custom.cmds.sell", description: "Sell inventory items to shop" },
 { id: "tpa", name: "custom.cmds.tpa", description: "View teleport menu" },
 { id: "redeem", name: "custom.cmds.redeem", description: "Redeem a gift code" },
 { id: "daily", name: "custom.cmds.daily", description: "Claim daily reward" },
 { id: "announce", name: "custom.cmds.announce", description: "Title announcement (admin)" },
 { id: "abcast", name: "custom.cmds.abcast", description: "Actionbar broadcast (admin)" },
];

const initializeDefaults = () => {
 if (!_identity) return;
 for (const cmd of CUSTOM_COMMANDS) ensureCommandDefault(cmd.id);
};

system.runTimeout(() => initializeDefaults(), 60);

export async function showCustomCommandsMenu(source) {
 if (!_identity) return;
 try {
 const backToDieState = await backToDieConfig.isEnabled();
 const form = new ModalFormData()
 .title(Lang.t(source, "custom.cmds.menu.title") ?? "Custom Commands Manager");

 CUSTOM_COMMANDS.forEach(cmd => {
 const isEnabled = isCommandEnabled(cmd.id);
 const labelText = Lang.t(source, cmd.name) ?? cmd.id;
 form.toggle(`${labelText}\n§7${cmd.description}`, { defaultValue: isEnabled });
 });
 form.toggle("§fBack to Die\n§7Enable back to die feature", { defaultValue: backToDieState });

 form.show(source).then(async response => {
 if (response.isCanceled || response.canceled) return;

 let changed = false;
 CUSTOM_COMMANDS.forEach((cmd, index) => {
 const newState = response.formValues[index];
 const wasEnabled = isCommandEnabled(cmd.id);

 if (newState !== wasEnabled) {
 changed = true;
 setCommandEnabled(cmd.id, newState);
 if (newState) {
 source.sendMessage(Lang.t(source, "custom.cmds.enabled", cmd.id) ?? `§a✔ Enabled: /kiw:${cmd.id}`);
 } else {
 source.sendMessage(Lang.t(source, "custom.cmds.disabled", cmd.id) ?? `§c✘ Disabled: /kiw:${cmd.id}`);
 }
 }
 });

 const backToDieEnabled = response.formValues[CUSTOM_COMMANDS.length];
 if (backToDieEnabled !== backToDieState) {
 changed = true;
 await backToDieConfig.setEnabled(backToDieEnabled);
 source.sendMessage(backToDieEnabled
 ? "§a✔ Enabled: Back to Die"
 : "§c✘ Disabled: Back to Die");
 }

 if (changed) {
 playSound(source, "success");
 source.sendMessage(Lang.t(source, "custom.cmds.updated") ?? "§e✓ Custom commands configuration updated!");
 } else {
 playSound(source, "action");
 }
 }).catch(err => {
 console.error("Form show error:", err);
 });
 } catch (error) {
 console.error("Error showing custom commands menu:", error);
 playSound(source, "error");
 }
}

export { isCommandEnabled };
