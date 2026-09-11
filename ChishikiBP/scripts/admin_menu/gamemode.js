import { gamemodeForm } from "../forms.js";
import { showMainMenu } from "../kiwora.js";
export function showGamemodeMenu(source) {
 gamemodeForm().show(source).then((res) => {
 if (!res || res.canceled) return;
 if (res.selection === 4) {
 showMainMenu(source);
 return;
 }
 try {
 source.runCommand("gamerule sendcommandfeedback false");
 const gms = ["survival", "creative", "adventure", "spectator"];
 const sm = gms[res.selection];
 if (sm) {
 source.runCommand(`gamemode ${sm} @s`);
 source.runCommand("playsound item.trident.riptide_1 @s");
 source.sendMessage(`§eGamemode changed to ${sm}.`);
 if (res.selection === 3) source.sendMessage("§eTo exit spectator mode, simply use /gamemode c/s");
 }
 } finally {
 source.runCommand("gamerule sendcommandfeedback true");
 }
 }).catch(e => console.warn("Gamemode error:", e));
}
