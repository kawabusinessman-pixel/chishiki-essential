import { world, system } from "../../core";
import { vanishForm } from "../../forms";
import { showMainMenu } from "../../kiwora";
export async function showVanishMenu(source) {
 const response = await vanishForm().show(source);
 if (response.canceled) return;
 if (response.selection === 3) {
 showMainMenu(source);
 return;
 }
 const cmds = {
 0: [
 "effect @s invisibility 999999 1 true",
 "effect @s night_vision 999999 1 true",
 "tag @s add vanished",
 `tellraw @s {"rawtext":[{"text":"§b▶ §aYou are now invisible!\\n§e⚠ §7Note: Items you hold will still be visible"}]}`
 ],
 1: [
 "effect @s clear",
 "tag @s remove vanished",
 "tag @s remove hideItems",
 `tellraw @s {"rawtext":[{"text":"§b▶ §aAll effects cleared! You are now visible"}]}`
 ],
 2: [
 "effect @s clear",
 "gamemode spectator @s",
 "effect @s night_vision 999999 1 true",
 `tellraw @a {"rawtext":[{"translate":"multiplayer.player.left","with":["§e${source.name}"]}]}`,
 `tellraw @s {"rawtext":[{"text":"§b▶ §aSpectator Mode!\\n§7Use /gamemode c or Clear Effects to return"}]}`,
 "tag @s add vanished",
 "tag @s add hideItems"
 ]
 };
 try {
 if (cmds[response.selection]) {
 cmds[response.selection].forEach(c => source.runCommand(c));
 source.runCommand("playsound note.pling @s ~~~ 1 1.5");
 }
 } catch (error) {
 }
}
system.runInterval(() => {
	const players = world.getAllPlayers();
	for (const p of players) {
		if (!p.hasTag("vanished") || !p.hasTag("hideItems")) continue;
		try {
			const isSpectator = p.getGameMode?.() === "spectator" || p.matches?.({ gameMode: "spectator" });
			if (!isSpectator) {
				p.removeTag("vanished");
				p.removeTag("hideItems");
			}
		} catch { }
	}
}, 60);
