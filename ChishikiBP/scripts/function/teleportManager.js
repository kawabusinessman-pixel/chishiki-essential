import { system, world } from "../core.js";
import { GlobalConfig } from "./GlobalConfig.js";
import { Lang } from "../lib/Lang.js";
import { sendAnnounce } from "./announceTitle.js";

/**
 * Visual character definitions for rendering action bar progress indicators.
 * @readonly
 * @enum {string|string[]}
 */
export const PROGRESS_CHARS = {
  FULL: "█",
  EMPTY: " ",
  TRANSITIONS: ["▏", "▎", "▍", "▌", "▋", "▊", "▉"],
};

/**
 * Standard Bedrock audio identifiers for teleportation stages.
 * @readonly
 * @enum {string}
 */
export const SOUNDS = {
  TICK: "note.harp",
  SUCCESS: "random.levelup",
  CANCEL: "note.bass",
  PORTAL: "mob.endermen.portal",
};

/**
 * Default countdown durations (in seconds) mapped by teleportation type.
 * @type {Record<string, number>}
 */
export const TELEPORT_DELAYS = {
  warp: 3,
  home: 3,
  sethome: 3,
  rtp: 3,
  tpa: 3,
  pwarp: 3,
  spawn: 3,
  default: 3,
};

/**
 * General configuration defaults for teleport mechanics.
 * @readonly
 */
export const TELEPORT_DEFAULT_CONFIG = {
  DEFAULT_DELAY: 3,
  MOVEMENT_TOLERANCE: 0.1,
  PROGRESS_BAR_LENGTH: 10,
  COOLDOWN_MS: 3000,
};

/**
 * Retrieves the effective countdown duration for a given teleport type.
 * Evaluates dynamic server configuration overrides before falling back to defaults.
 *
 * @param {string} [type="default"] - The category of teleportation.
 * @returns {number} The countdown delay in seconds.
 */
export function getTeleportDelay(type = "default") {
  try {
    if (type === "rtp") {
      const rtpCfg = GlobalConfig.get("rtpConfig");
      if (rtpCfg && typeof rtpCfg === "object" && Number.isFinite(Number(rtpCfg.teleportDelay))) {
        return Math.max(0, Math.floor(Number(rtpCfg.teleportDelay)));
      }
    } else if (type === "home" || type === "sethome") {
      const homeCfg = GlobalConfig.get("homeConfig");
      if (homeCfg && typeof homeCfg === "object" && Number.isFinite(Number(homeCfg.teleportDelay))) {
        return Math.max(0, Math.floor(Number(homeCfg.teleportDelay)));
      }
    } else if (type === "warp") {
      const warpCfg = GlobalConfig.get("warpConfig");
      if (warpCfg && typeof warpCfg === "object" && Number.isFinite(Number(warpCfg.teleportDelay))) {
        return Math.max(0, Math.floor(Number(warpCfg.teleportDelay)));
      }
    } else if (type === "tpa") {
      const tpaCfg = GlobalConfig.get("tpaConfig");
      if (tpaCfg && typeof tpaCfg === "object" && Number.isFinite(Number(tpaCfg.teleportDelay))) {
        return Math.max(0, Math.floor(Number(tpaCfg.teleportDelay)));
      }
    }
  } catch {}
  return TELEPORT_DELAYS[type] ?? TELEPORT_DEFAULT_CONFIG.DEFAULT_DELAY;
}

/** Label title kedatangan per tipe teleport. @type {Record<string, string>} */
export const TELEPORT_ARRIVAL_LABELS = {
  warp: "WARP",
  home: "HOME",
  sethome: "HOME",
  rtp: "RANDOM TP",
  tpa: "TELEPORT",
  pwarp: "PLAYER WARP",
  spawn: "SPAWN",
  default: "TELEPORT",
};

/** Kirim title kedatangan: tujuan sebagai title, tipe teleport sebagai subtitle. */
function fireArrivalAnnounce(player, type, destination) {
  try {
    if (!isPlayerValid(player)) return;
    const label = TELEPORT_ARRIVAL_LABELS[type] || TELEPORT_ARRIVAL_LABELS.default;
    if (destination) sendAnnounce(player, destination, label);
    else sendAnnounce(player, label);
  } catch {}
}

/**
 * Converts plain text into rawtext JSON structure for command fallbacks.
 *
 * @param {string} text - Raw string message.
 * @returns {string} Serialized rawtext JSON.
 */
function rawTextJson(text) {
  return JSON.stringify({ rawtext: [{ text: String(text ?? "") }] });
}

/**
 * Dispatches an Action Bar display message to the player using native APIs with a fallback.
 *
 * @param {import("@minecraft/server").Player} player - Target player entity.
 * @param {string} text - Formatted action bar message.
 * @returns {void}
 */
export function sendActionBar(player, text) {
  if (!isPlayerValid(player)) return;
  try {
    player.onScreenDisplay.setActionBar(text);
    return;
  } catch {}
  try {
    player.runCommand(`titleraw @s actionbar ${rawTextJson(text)}`);
  } catch {}
}

/**
 * Plays a localized sound effect to the player.
 *
 * @param {import("@minecraft/server").Player} player - Target player entity.
 * @param {string} soundId - Minecraft sound identifier.
 * @param {import("@minecraft/server").WorldSoundOptions} [options={}] - Playback audio parameters.
 * @returns {void}
 */
export function playTeleportSound(player, soundId, options = {}) {
  if (!isPlayerValid(player)) return;
  try {
    player.playSound(soundId, options);
    return;
  } catch {}
  try {
    const pitch = options.pitch ?? 1;
    const volume = options.volume ?? 1;
    player.runCommand(`playsound ${soundId} @s ~ ~ ~ ${volume} ${pitch}`);
  } catch {}
}

/**
 * Verifies whether a player reference represents an active, valid entity in the world.
 *
 * @param {import("@minecraft/server").Player} player - Entity instance to validate.
 * @returns {boolean} True if the player entity is valid and ready for interaction.
 */
export function isPlayerValid(player) {
  if (!player) return false;
  try {
    if (typeof player.isValid === "function") return player.isValid();
    if (typeof player.isValid === "boolean") return player.isValid;
    return !!player.location;
  } catch {
    return false;
  }
}

/**
 * Constructs a smooth graphical progress bar string based on completion ratio.
 *
 * @param {number} progressFraction - Float between 0.0 and 1.0.
 * @param {number} [barLength=10] - Total character length of the bar.
 * @returns {string} Formatted bar string containing full, transitional, and empty blocks.
 */
export function generateProgressBar(progressFraction, barLength = TELEPORT_DEFAULT_CONFIG.PROGRESS_BAR_LENGTH) {
  const clamped = Math.max(0, Math.min(1, progressFraction));
  const total = clamped * barLength;
  const full = Math.floor(total);
  let bar = PROGRESS_CHARS.FULL.repeat(full);
  const frac = total - full;
  if (frac > 0 && full < barLength) {
    const idx = Math.floor(frac * PROGRESS_CHARS.TRANSITIONS.length);
    bar += PROGRESS_CHARS.TRANSITIONS[Math.min(idx, PROGRESS_CHARS.TRANSITIONS.length - 1)];
  }
  bar += PROGRESS_CHARS.EMPTY.repeat(Math.max(0, barLength - bar.length));
  return bar;
}

/**
 * @typedef {Object} TeleportSession
 * @property {import("@minecraft/server").Player} player - Target player instance.
 * @property {string} type - Teleport type identifier.
 * @property {number} totalDurationSeconds - Total countdown length in seconds.
 * @property {number} remainingSeconds - Remaining seconds counter.
 * @property {number} currentFrame - Frame ticker within the current second (0-19).
 * @property {import("@minecraft/server").Vector3} startLocation - Initial player coordinates.
 * @property {string} startDimension - Initial player dimension ID.
 * @property {number} tolerance - Allowed coordinate drift before cancellation.
 * @property {boolean} allowMove - Whether movement triggers cancellation.
 * @property {number} barLength - Action bar visual length.
 * @property {string} title - Teleport destination or action title.
 * @property {boolean} playTickSound - Whether to emit tick audio.
 * @property {boolean} playSuccessSound - Whether to emit arrival audio.
 * @property {string} [customCancelMsg] - Override cancellation message.
 * @property {Function} [customActionBarBuilder] - Custom callback to format action bar text.
 * @property {Function} onComplete - Completion handler upon countdown expiry.
 * @property {Function} [onCancel] - Cancellation handler.
 */

/**
 * Active player teleport sessions indexed by playerId.
 * @type {Map<string, TeleportSession>}
 */
const activeSessions = new Map();

/**
 * Single runner interval handle id.
 * @type {number|null}
 */
let centralRunnerId = null;

/**
 * Applies a smooth camera fade effect to the player if supported.
 *
 * @param {import("@minecraft/server").Player} player - Target player entity.
 * @param {Object} [options={}] - Fade configuration parameters.
 * @returns {void}
 */
export function fadeCamera(player, options = {}) {
  if (!isPlayerValid(player)) return;
  try {
    player.camera?.fade?.({
      fadeColor: options.color || { red: 0, green: 0, blue: 0 },
      fadeTime: {
        fadeInTime: options.fadeIn ?? 0.35,
        holdTime: options.hold ?? 0.3,
        fadeOutTime: options.fadeOut ?? 0.35,
      },
    });
  } catch {}
}

/**
 * Starts the central scheduling loop when active sessions exist.
 * Throttles actionbar rendering to reduce per-tick string and packet allocations by 75%.
 * @returns {void}
 */
function startCentralRunner() {
  if (centralRunnerId !== null) return;
  centralRunnerId = system.runInterval(() => {
    if (activeSessions.size === 0) {
      stopCentralRunner();
      return;
    }

    for (const [playerId, session] of activeSessions) {
      try {
        const player = session.player;

        if (!isPlayerValid(player)) {
          activeSessions.delete(playerId);
          continue;
        }

        const currLoc = player.location;
        const startLoc = session.startLocation;
        const currDim = player.dimension?.id;

        if (
          !session.allowMove &&
          (currDim !== session.startDimension ||
            Math.abs(currLoc.x - startLoc.x) > session.tolerance ||
            Math.abs(currLoc.y - startLoc.y) > session.tolerance ||
            Math.abs(currLoc.z - startLoc.z) > session.tolerance)
        ) {
          activeSessions.delete(playerId);
          const cancelMsg = session.customCancelMsg || Lang.t(player, "warp.cancelled") || "§cTeleport cancelled - You moved!";
          sendActionBar(player, cancelMsg);
          playTeleportSound(player, SOUNDS.CANCEL, { volume: 0.8, pitch: 0.8 });
          if (typeof session.onCancel === "function") {
            try { session.onCancel(player, "moved"); } catch (e) { console.warn("[TeleportManager] onCancel error:", e); }
          }
          continue;
        }

        const remainingSeconds = session.remainingSeconds;

        // Throttle UI update to every 4 ticks (5 FPS) for smooth visual display with 75% less overhead
        if (session.currentFrame % 4 === 0) {
          const totalTicks = session.totalDurationSeconds * 20;
          const elapsedTicks = (session.totalDurationSeconds - remainingSeconds) * 20 + session.currentFrame;
          const progressFraction = totalTicks > 0 ? (totalTicks - elapsedTicks) / totalTicks : 0;
          const progressBar = generateProgressBar(progressFraction, session.barLength);

          let actionText = "";
          if (session.customActionBarBuilder) {
            try {
              actionText = session.customActionBarBuilder(player, progressBar, remainingSeconds);
            } catch {
              actionText = `§e⚡ Teleporting [§b${progressBar}§e] §b${remainingSeconds}s`;
            }
          } else {
            const titleSuffix = session.title ? ` §7(${session.title})` : "";
            actionText = `§e⚡ Teleporting [§b${progressBar}§e] §b${remainingSeconds}s${titleSuffix}`;
          }

          sendActionBar(player, actionText);
        }

        if (session.currentFrame === 0 && remainingSeconds > 0 && session.playTickSound) {
          playTeleportSound(player, SOUNDS.TICK, { volume: 0.4, pitch: 0.8 + remainingSeconds * 0.1 });
        }

        // Trigger camera fade near completion for cinematic arrival
        if (session.remainingSeconds === 1 && session.currentFrame === 10 && session.enableCameraFade) {
          fadeCamera(player, { fadeIn: 0.4, hold: 0.3, fadeOut: 0.4 });
        }

        session.currentFrame++;
        if (session.currentFrame >= 20) {
          session.currentFrame = 0;
          session.remainingSeconds--;
        }

        if (session.remainingSeconds <= 0) {
          activeSessions.delete(playerId);
          if (session.playSuccessSound) {
            playTeleportSound(player, SOUNDS.SUCCESS, { volume: 1, pitch: 1 });
          }
          if (typeof session.onComplete === "function") {
            try {
              session.onComplete(player);
              if (session.announce !== false) fireArrivalAnnounce(player, session.type, session.title);
            } catch (e) {
              console.warn("[TeleportManager] onComplete error:", e);
              sendActionBar(player, "§cTeleport failed!");
            }
          }
        }
      } catch (playerError) {
        console.warn(`[TeleportManager] Error processing player ${playerId}:`, playerError);
        activeSessions.delete(playerId);
      }
    }

    if (activeSessions.size === 0) {
      stopCentralRunner();
    }
  }, 1);
}

/**
 * Clears the central runner interval when all sessions conclude.
 * @returns {void}
 */
function stopCentralRunner() {
  if (centralRunnerId !== null) {
    try {
      system.clearRun(centralRunnerId);
    } catch {}
    centralRunnerId = null;
  }
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  if (activeSessions.has(playerId)) {
    activeSessions.delete(playerId);
    if (activeSessions.size === 0) stopCentralRunner();
  }
});

world.afterEvents.entityDie.subscribe((event) => {
  try {
    const entity = event.deadEntity;
    if (entity && entity.typeId === "minecraft:player" && isPlayerValid(entity)) {
      if (activeSessions.has(entity.id)) {
        activeSessions.delete(entity.id);
        if (activeSessions.size === 0) stopCentralRunner();
      }
    }
  } catch {}
});

/**
 * Determines whether a player currently has an active teleport countdown session.
 *
 * @param {import("@minecraft/server").Player} player - Player entity to inspect.
 * @returns {boolean} True if a teleport session is active.
 */
export function isPlayerTeleporting(player) {
  if (!isPlayerValid(player)) return false;
  return activeSessions.has(player.id);
}

/**
 * Forcibly terminates an active teleport session for a player.
 *
 * @param {import("@minecraft/server").Player} player - Target player entity.
 * @param {string} [reason="cancelled"] - Reason for termination passed to onCancel handler.
 * @returns {boolean} True if an active session was found and cancelled.
 */
export function cancelPlayerTeleport(player, reason = "cancelled") {
  if (!isPlayerValid(player)) return false;
  const session = activeSessions.get(player.id);
  if (!session) return false;
  activeSessions.delete(player.id);
  if (activeSessions.size === 0) stopCentralRunner();

  if (typeof session.onCancel === "function") {
    try { session.onCancel(player, reason); } catch {}
  }
  return true;
}

/**
 * Registers a new teleport countdown session into the unified central runner.
 *
 * @param {import("@minecraft/server").Player} player - Target player initiating teleport.
 * @param {Object} options - Teleport configuration parameters.
 * @param {string} [options.type="default"] - Teleport type identifier.
 * @param {number} [options.duration] - Optional duration override in seconds.
 * @param {string} [options.title] - Destination label displayed in messages.
 * @param {boolean} [options.announce=true] - Show the arrival title (announce system) on success.
 * @param {number} [options.tolerance=0.1] - Distance threshold for movement detection.
 * @param {boolean} [options.allowMove=false] - If true, movement will not abort the session.
 * @param {number} [options.barLength=10] - Action bar progress indicator length.
 * @param {boolean} [options.playTickSound=true] - Whether to play periodic tick audio.
 * @param {boolean} [options.playSuccessSound=true] - Whether to play completion audio.
 * @param {string} [options.customCancelMsg] - Custom text shown when movement is detected.
 * @param {Function} [options.customActionBarBuilder] - Custom function returning action bar text.
 * @param {Function} options.onComplete - Callback executed upon countdown completion.
 * @param {Function} [options.onCancel] - Callback executed upon cancellation or movement.
 * @returns {boolean} True if the session was successfully scheduled.
 */
export function requestTeleport(player, options = {}) {
  if (!isPlayerValid(player)) return false;

  const playerId = player.id;
  if (activeSessions.has(playerId)) {
    const alreadyMsg = Lang.t(player, "warp.already_teleporting") || Lang.t(player, "sethome.tp.already") || "§cYou are already teleporting!";
    sendActionBar(player, alreadyMsg);
    playTeleportSound(player, SOUNDS.CANCEL, { volume: 0.5, pitch: 0.5 });
    return false;
  }

  const type = options.type || "default";
  const duration = typeof options.duration === "number" ? Math.max(0, Math.floor(options.duration)) : getTeleportDelay(type);

  if (duration <= 0) {
    if (options.playSuccessSound !== false) {
      playTeleportSound(player, SOUNDS.SUCCESS, { volume: 1, pitch: 1 });
    }
    if (typeof options.onComplete === "function") {
      try {
        options.onComplete(player);
        if (options.announce !== false) fireArrivalAnnounce(player, type, options.title);
      } catch (e) {
        console.warn("[TeleportManager] Instant onComplete error:", e);
      }
    }
    return true;
  }

  const session = {
    player,
    type,
    totalDurationSeconds: duration,
    remainingSeconds: duration,
    currentFrame: 0,
    startLocation: { ...player.location },
    startDimension: player.dimension.id,
    tolerance: typeof options.tolerance === "number" ? options.tolerance : TELEPORT_DEFAULT_CONFIG.MOVEMENT_TOLERANCE,
    allowMove: !!options.allowMove,
    barLength: options.barLength || TELEPORT_DEFAULT_CONFIG.PROGRESS_BAR_LENGTH,
    title: options.title || "",
    announce: options.announce !== false,
    playTickSound: options.playTickSound !== false,
    playSuccessSound: options.playSuccessSound !== false,
    enableCameraFade: options.enableCameraFade ?? true,
    customCancelMsg: options.customCancelMsg,
    customActionBarBuilder: options.customActionBarBuilder,
    onComplete: options.onComplete,
    onCancel: options.onCancel,
  };

  activeSessions.set(playerId, session);
  startCentralRunner();
  return true;
}

export default {
  PROGRESS_CHARS,
  SOUNDS,
  TELEPORT_DELAYS,
  TELEPORT_DEFAULT_CONFIG,
  getTeleportDelay,
  sendActionBar,
  playTeleportSound,
  fadeCamera,
  isPlayerValid,
  generateProgressBar,
  isPlayerTeleporting,
  cancelPlayerTeleport,
  requestTeleport,
};
