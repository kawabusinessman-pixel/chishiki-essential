import { PROGRESS_CHARS as TM_PROGRESS_CHARS, SOUNDS as TM_SOUNDS } from "./function/teleportManager.js";

export const MINECRAFT = {
  TICKS_PER_SECOND: 20,
  secondsToTicks: (seconds) => seconds * 20,
  ticksToSeconds: (ticks) => ticks / 20,
  secondsToMs: (seconds) => seconds * 1000,
  msToSeconds: (ms) => ms / 1000,
  ticksToMs: (ticks) => (ticks / 20) * 1000,
  msToTicks: (ms) => (ms / 1000) * 20,
};

export const PROGRESS_CHARS = TM_PROGRESS_CHARS;
export const SOUNDS = TM_SOUNDS;

export const PERMISSIONS = {
  ADMIN_TAG: "admin",
  MODERATOR_TAG: "moderator",
  VIP_TAG: "vip",
};

export function delay(ticks) {
  return new Promise((resolve) => {
    import("./core.js").then(({ system }) => {
      system.runTimeout(resolve, ticks);
    });
  });
}

export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function isValidCoords(coords) {
  if (typeof coords !== "string") return false;
  const parts = coords.trim().split(/\s+/);
  return parts.length === 3 && parts.every((p) => !isNaN(parseFloat(p)));
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default {
  MINECRAFT,
  PROGRESS_CHARS,
  SOUNDS,
  PERMISSIONS,
  delay,
  chunkArray,
  formatTime,
  isValidCoords,
  clamp,
};
