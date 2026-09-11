import { world } from "../core.js";

/** Prefix announce; tidak dipakai render (announce = actionbar), disimpan buat kompatibilitas. */
export const ANNOUNCE_PREFIX = "§a§n§n§c";

/**
 * Teks announce untuk actionbar; subtitle inline abu-abu setelah title.
 * @param {string} title
 * @param {string} [subtitle=""]
 * @returns {string}
 */
export function buildAnnounceMessage(title, subtitle = "") {
  const cleanTitle = String(title ?? "").slice(0, 200);
  const cleanSubtitle = String(subtitle ?? "").slice(0, 200);
  return subtitle ? `${cleanTitle}  §7${cleanSubtitle}` : cleanTitle;
}

/**
 * Tampilkan announce di actionbar (jalur yang terbukti tampil di semua device).
 * @param {import("@minecraft/server").Player[]|import("@minecraft/server").Player|"all"} targets
 * @param {string} title
 * @param {string} [subtitle=""]
 */
export function sendAnnounce(targets, title, subtitle = "") {
  const list =
    targets === "all"
      ? world.getAllPlayers()
      : Array.isArray(targets)
        ? targets
        : [targets];
  const text = buildAnnounceMessage(title, subtitle);
  for (const target of list) {
    try {
      target?.onScreenDisplay?.setActionBar(text);
    } catch {}
  }
}
