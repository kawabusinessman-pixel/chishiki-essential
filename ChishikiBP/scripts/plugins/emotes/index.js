import * as mc from "@minecraft/server";
import { world, system, ActionFormData } from "../../core.js";
import { CATEGORIES, EMOTES } from "./emoteData.js";

/**
 * Check if a player instance is still valid
 * @param {import("@minecraft/server").Player} player
 */
function isPlayerValid(player) {
  if (!player) return false;
  try {
    const valid = player.isValid;
    return typeof valid === "function" ? valid.call(player) : valid !== false;
  } catch {
    return false;
  }
}

/**
 * Execute command on player safely across all Script API versions
 * @param {import("@minecraft/server").Player} player
 * @param {string} cmd
 */
function executeCommand(player, cmd) {
  if (!isPlayerValid(player)) return;
  try {
    if (typeof player.runCommand === "function") {
      return player.runCommand(cmd);
    }
  } catch {}
  try {
    if (typeof player.runCommandAsync === "function") {
      return player.runCommandAsync(cmd);
    }
  } catch {}
  try {
    if (player.dimension && typeof player.dimension.runCommand === "function") {
      return player.dimension.runCommand(`execute as "${player.name}" at @s run ${cmd}`);
    }
  } catch {}
}

/**
 * Send action bar message safely
 * @param {import("@minecraft/server").Player} player
 * @param {string} text
 */
function sendActionBar(player, text) {
  if (!isPlayerValid(player)) return;
  try {
    if (player.onScreenDisplay && typeof player.onScreenDisplay.setActionBar === "function") {
      player.onScreenDisplay.setActionBar(text);
      return;
    }
  } catch {}
  try {
    executeCommand(player, `titleraw @s actionbar {"rawtext":[{"text":${JSON.stringify(text)}}]}`);
  } catch {}
}

/**
 * Play a sound on player safely
 * @param {import("@minecraft/server").Player} player
 * @param {string} soundName
 */
function playSound(player, soundName) {
  if (!isPlayerValid(player)) return;
  try {
    if (typeof player.playSound === "function") {
      player.playSound(soundName, { volume: 0.8, pitch: 1.2 });
      return;
    }
  } catch {}
  try {
    executeCommand(player, `playsound ${soundName} @s ~~~ 0.8 1.2`);
  } catch {}
}

/**
 * Play a specific emote on the player
 * @param {import("@minecraft/server").Player} player
 * @param {{ name: string, anim: string, icon: string }} emote
 */
export function playEmote(player, emote) {
  if (!isPlayerValid(player)) return;
  try {
    executeCommand(player, `playanimation @s ${emote.anim} default 0.0 false lemote_queue`);
    sendActionBar(player, `§a▶ §f${emote.name} §7(Sneak to stop)`);
    playSound(player, "random.pop");
  } catch (err) {
    console.warn("Failed to play emote:", err);
  }
}

/**
 * Stop playing any current emote animation
 * @param {import("@minecraft/server").Player} player
 */
export function stopEmote(player) {
  if (!isPlayerValid(player)) return;
  try {
    executeCommand(player, "playanimation @s animation.lemote.clear default 0.0 false lemote_queue");
    sendActionBar(player, "§c⏹ Emote stopped");
  } catch {}
}

/**
 * Main Emote Category Selection Menu
 * @param {import("@minecraft/server").Player} player
 */
export function showEmoteMenu(player) {
  if (!isPlayerValid(player)) return;

  const totalCount = EMOTES.length;

  const form = new ActionFormData()
    .simpleUi()
    .title("§fEmote Menu")
    .body(`§7Select a category (§e${totalCount} Emotes§7) • §8Credit: Levyyc`);

  for (const cat of CATEGORIES) {
    const categoryCount = EMOTES.filter((e) => e.category === cat.id).length;
    form.button(`${cat.name} Emotes\n§7${categoryCount} animations`, cat.icon);
  }

  form.button("§c⏹ Stop Emote\n§7Clear current animation", "textures/ui/cancel");
  form.button("§7⬅ Back to Member Menu", "textures/ui/arrow_left");

  form.show(player).then((response) => {
    if (response.canceled) return;

    const idx = response.selection;
    if (idx >= 0 && idx < CATEGORIES.length) {
      showCategoryEmoteMenu(player, CATEGORIES[idx].id);
      return;
    }

    if (idx === CATEGORIES.length) {
      // Stop Emote
      stopEmote(player);
      system.runTimeout(() => showEmoteMenu(player), 2);
      return;
    }

    if (idx === CATEGORIES.length + 1) {
      // Back to Member Menu (dynamic import to avoid circular dependency)
      system.runTimeout(() => {
        import("../../member.js").then((m) => m.showMemberMenu(player)).catch(() => {});
      }, 1);
      return;
    }
  }).catch(() => {});
}

/**
 * Category Emote Browser
 * @param {import("@minecraft/server").Player} player
 * @param {string} categoryId
 */
export function showCategoryEmoteMenu(player, categoryId) {
  if (!isPlayerValid(player)) return;

  const cat = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0];
  const list = EMOTES.filter((e) => e.category === categoryId);

  const form = new ActionFormData()
    .simpleUi()
    .title(`§f${cat.name} Emotes`)
    .body(`§7${cat.name} list (§e${list.length}§7) • §8Sneak to stop`);

  for (const emote of list) {
    form.button(emote.name, emote.icon);
  }

  form.button("§c⏹ Stop Emote", "textures/ui/cancel");
  form.button("§7⬅ Back to Categories", "textures/ui/arrow_left");

  form.show(player).then((response) => {
    if (response.canceled) return;

    const idx = response.selection;
    if (idx >= 0 && idx < list.length) {
      const chosen = list[idx];
      // Run on next tick after UI modal closes so animation is not canceled by UI close
      system.runTimeout(() => {
        playEmote(player, chosen);
      }, 2);
      return;
    }

    if (idx === list.length) {
      // Stop Emote
      stopEmote(player);
      system.runTimeout(() => showCategoryEmoteMenu(player, categoryId), 2);
      return;
    }

    if (idx === list.length + 1) {
      // Back to categories
      system.runTimeout(() => showEmoteMenu(player), 1);
      return;
    }
  }).catch(() => {});
}

// Sneak detector to stop emote immediately when player crouches
try {
  if (mc.world?.afterEvents?.playerButtonInput && mc.InputButton && mc.ButtonState) {
    mc.world.afterEvents.playerButtonInput.subscribe((event) => {
      if (
        event.button === mc.InputButton.Sneak &&
        event.newButtonState === mc.ButtonState.Pressed
      ) {
        if (event.player) {
          executeCommand(event.player, "playanimation @s animation.lemote.clear default 0.0 false lemote_queue");
        }
      }
    });
  }
} catch {}
