import { system } from "../core.js";

const waitTicks = (ticks = 2) => new Promise((resolve) => system.runTimeout(resolve, ticks));

/**
 * @param {import("@minecraft/server").Player} player
 * @param {any} form
 * @param {number} [maxAttempts=10]
 * @returns {Promise<any>}
 */
async function ForceOpen(player, form, maxAttempts = 10) {
 for (let i = 0; i < maxAttempts; i++) {
  try {
   if (player?.isValid === false) return { canceled: true, cancelationReason: "UserBusy" };
   const res = await form.show(player);
   if (res?.cancelationReason !== "UserBusy") return res;
   await waitTicks(2);
  } catch {
   return { canceled: true };
  }
 }
 return { canceled: true, cancelationReason: "UserBusy" };
}

export { ForceOpen };