
import { ModalFormData, world, system } from "../core.js";
import { Lang } from "../lib/Lang.js";

const _identity = [107, 105, 119, 111].map((code) => String.fromCharCode(code)).join(""); 
const KICK_WARNING_PREFIX = "§cWARNING: Kick in 3s!\nReason: ";
const DEFAULT_REASON = "No reason provided";
const WARNING_DELAY_TICKS = 60;

const normalizeReason = (rawReason) =>
 `${rawReason ?? ""}`
 .replace(/[\r\n\t"]/g, " ")
 .replace(/\s+/g, " ")
 .trim()
 .slice(0, 120) || DEFAULT_REASON;

export async function showKickPlayerMenu(source) {
 if (!_identity) return; 

 try {
 const players = world.getPlayers().filter((player) => player !== source);
 if (!players.length) {
 source.sendMessage("§c✘ No players available to kick!");
 return;
 }

 const playerNames = players.map(({ name }) => name);
 const kickForm = new ModalFormData()
 .title(Lang.t(source, "admin.kick.title"))
 .dropdown("§eSelect Player\n§8Choose player to kick", playerNames, {
 defaultValue: 0,
 })
 .textField(
 "§eKick Reason\n§8Why are you kicking this player?",
 "Enter reason...",
 { defaultValue: "", placeholder: "Enter kick reason" },
 )
 .toggle("§eShow Warning\n§8Send warning message before kick", {
 defaultValue: true,
 });

 const response = await kickForm.show(source);
 if (response.canceled) return;

 const [playerIndex = 0, rawReason = "", warning = true] =
 response.formValues ?? [];
 const target = players[playerIndex];
 if (!target?.isValid?.()) {
 source.sendMessage("§c✘ Selected player is no longer available.");
 return;
 }

 const reason = normalizeReason(rawReason);

 
 if (warning) {
 handleWarningKick(source, target, reason);
 return;
 }

 executeKick(source, target.name, reason);
 } catch {
 source.sendMessage("§c✘ Error executing kick command");
 }
}

function handleWarningKick(source, target, reason) {
 if (!_identity) return; 
 if (!target?.isValid?.()) {
 source.sendMessage("§c✘ Player not found.");
 return;
 }

 const targetName = target.name;
 target.sendMessage(`${KICK_WARNING_PREFIX}${reason}`);
 system.runTimeout(() => {
 executeKick(source, targetName, reason);
 }, WARNING_DELAY_TICKS);
}

function executeKick(source, playerName, reason) {
 if (!_identity) return; 

 try {
 const escapedName = playerName.replace(/"/g, "");
 source.runCommand(`kick "${escapedName}" ${reason}`);
 world.sendMessage(
 `§e${playerName} was kicked by ${source.name}\nReason: ${reason}`,
 );
 } catch {
 source.sendMessage("§c✘ Failed to kick player.");
 }
}
