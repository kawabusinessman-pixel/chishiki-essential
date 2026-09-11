import { world, system, Player, ActionFormData, ModalFormData } from '../../core.js';
import { GlobalConfig } from "../../function/GlobalConfig.js";
let config = {
 adminTag: "admin",
 requiredItem: "minecraft:stick",
 needSneak: true,
 systemEnabled: true
};
const openForms = new Set();
const getLocId = (loc) => `lp_${Math.floor(loc.x)}_${Math.floor(loc.y)}_${Math.floor(loc.z)}`;
function loadGlobalconfig() {
 system.run(() => {
 const saved = GlobalConfig.get("global_config");
 if (saved) {
 try {
 config = typeof saved === 'string' ? JSON.parse(saved) : saved;
 } catch (e) {
 console.warn("Failed to parse config, using defaults.");
 }
 }
 });
}
function openHelpMenu(player) {
 new ActionFormData()
 .title("OPERATIONAL GUIDE")
 .body(
 "§l§6QUICK START GUIDE§r\n\n" +
 "§e1. Setup:§r Hold §b" + config.requiredItem + "§r & tag §a" + config.adminTag + "§r.\n" +
 "§e2. Access:§r Use item on plate " + (config.needSneak ? "§c(while sneaking)§r" : "") + ".\n" +
 "§e3. Power:§r Adjust slider for launch distance.\n" +
 "§e4. Global:§r Manage system via System Core.\n\n" +
 "§8Purging data resets the plate to vanilla."
 )
 .button("§8BACK TO MENU", "textures/icon/icons/back")
 .show(player).then(() => {
 openForms.delete(player.id);
 system.run(() => openMainMenu(player, null, true));
 });
}
function openGlobalconfigMenu(player) {
 const globalForm = new ModalFormData()
 .title("GLOBAL SYSTEM CORE")
 .toggle(
 "§eMASTER SWITCH§r\n" +
 "§7Enable/Disable the entire launchpad system.§r",
 {
 defaultValue: config.systemEnabled
 })
 .textField(
 "§eADMIN TAG§r\n" +
 "§7Required tag for configuration access.§r",
 "admin", {
 defaultValue: config.adminTag
 })
 .textField(
 "§eACTIVATION ITEM§r\n" +
 "§7Namespace ID (e.g., minecraft:stick).§r",
 "minecraft:stick", {
 defaultValue: config.requiredItem
 })
 .toggle(
 "§eSNEAK PROTOCOL§r\n" +
 "§7Require sneaking to open the menu.§r", {
 defaultValue: config.needSneak
 })
 .show(player).then((res) => {
 openForms.delete(player.id);
 if (res.canceled) return;
 config.systemEnabled = res.formValues[0];
 config.adminTag = res.formValues[1];
 config.requiredItem = res.formValues[2];
 config.needSneak = res.formValues[3];
 GlobalConfig.set("global_config", config);
 player.sendMessage("§bAstravia §l>>§r §r§7Global parameters synchronized successfully.");
 player.runCommand(`playsound random.levelup @s ~ ~ ~ 1 1.5`);
 });
}
function openMainMenu(player, block, isComingFromHelp = false) {
 const locId = block ? getLocId(block.location) : "N/A";
 const currentPower = block ? (GlobalConfig.get(locId) ?? 0) : 0;
 const mainForm = new ActionFormData()
 .title("LAUNCHPAD CONFIGURATOR")
 .body(
 "§7CENTRALIZED MANAGEMENT SYSTEM§r\n" +
 "§8------------------------------------------§r\n" +
 "§8NETWORK: §a" + (config.systemEnabled ? "ONLINE" : "OFFLINE") + "\n" +
 "§8ADMIN TAG: §e" + config.adminTag + "\n" +
 "§8UNIT COORDINATE: §f" + locId + "\n" +
 "§8CURRENT VELOCITY: §b" + currentPower + "\n" +
 "§8------------------------------------------§r\n\n" +
 "§7Manage unit power or global settings here.§r"
 )
 .button("§2CALIBRATE POWER\n§8Adjust launch intensity", "textures/ui/editIcon")
 .button("§1SYSTEM CORE\n§8Global configuration", "textures/items/book_writable")
 .button("§6GUIDE\n§8How to use", "textures/items/book_portfolio")
 .button("§4PURGE DATA\n§8Reset this unit", "textures/ui/wysiwyg_reset")
 .button("§8CLOSE", "textures/icon/icons/back");
 mainForm.show(player).then((res) => {
 if (res.canceled || res.selection === 4) {
 openForms.delete(player.id);
 return;
 }
 if (res.selection === 0) {
 system.run(() => {
 new ModalFormData()
 .title("VELOCITY CALIBRATION")
 .slider(
 "§lLaunch Power§r\n§7Set horizontal impulse intensity.§r",
 0, 100, {
 valueStep: 1,
 defaultValue: currentPower
 })
 .show(player).then((pRes) => {
 openForms.delete(player.id);
 if (pRes.canceled) return;
 const val = Number(pRes.formValues[0]);
 if (block) GlobalConfig.set(locId, val);
 player.sendMessage(`§bAstravia §l>>§r §aIntensity Set to ${val}`);
 });
 });
 } else if (res.selection === 1) {
 system.run(() => openGlobalconfigMenu(player));
 } else if (res.selection === 2) {
 system.run(() => openHelpMenu(player));
 } else if (res.selection === 3) {
 openForms.delete(player.id);
 if (block) GlobalConfig.set(locId, undefined);
 player.sendMessage("§bAstravia §l>>§r §cUnit data purged.");
 }
 });
}
world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
 let player = e.player;
 let block = e.block;
 let itemStack = e.itemStack;
 if (!player.hasTag(config.adminTag)) return;
 if (config.needSneak && !player.isSneaking) return;
 if (!itemStack || itemStack.typeId !== config.requiredItem) return;
 if (block.typeId.includes("pressure_plate")) {
 if (openForms.has(player.id)) return;
 openForms.add(player.id);
 system.run(() => openMainMenu(player, block));
 e.cancel = true;
 }
});
world.afterEvents.pressurePlatePush.subscribe((e) => {
 if (!config.systemEnabled) return;
 let player = e.source;
 let block = e.block;
 const locId = getLocId(block.location);
 if (!player || player.typeId !== "minecraft:player") return;
 system.run(() => {
 const power = GlobalConfig.get(locId);
 if (typeof power === "number" && power > 0) {
 const viewDir = player.getViewDirection();
 const horizontalDist = Math.sqrt(viewDir.x ** 2 + viewDir.z ** 2);
 if (horizontalDist > 0) {
 const multiplier = 0.12;
 const force = power * multiplier;
 const impulse = {
 x: (viewDir.x / horizontalDist) * force,
 y: 0.45,
 z: (viewDir.z / horizontalDist) * force
 };
 try {
 player.applyImpulse(impulse);
 const { x, y, z } = player.location;
 player.dimension.runCommand(`playsound random.explode @a ${x} ${y} ${z} 0.5 1.6`);
 player.dimension.runCommand(`particle minecraft:huge_explosion_emitter ${x} ${y} ${z}`);
 } catch (e) { }
 }
 }
 });
});
loadGlobalconfig();
