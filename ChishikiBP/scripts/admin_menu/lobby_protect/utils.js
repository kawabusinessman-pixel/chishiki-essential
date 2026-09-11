import { system, world } from "../../core.js";
import { getLobbyConfig, getRegionConfig, isInProtectedRegion } from "./config.js";
export const playerAreas = new Map();
const msgCooldowns = new Map();
const msgQueue = [];
const isEntityUsable = (entity) => {
	try { return entity?.isValid === true; } catch { return false; }
};
export const isAuthorizedAdmin = (p, rId, config = null) => {
	const regionConfig = config || (rId ? getRegionConfig(rId) : null);
	if (regionConfig?.adminBypassEnabled === false) return false;
	const tag = regionConfig?.adminTag || getLobbyConfig().adminTag || "admin";
	const player = typeof p === 'string' ? world.getPlayers().find(pl => pl.id === p) : p;
	return player?.hasTag(tag) ?? false;
};
export const isTeleportBlockedByAntiFly = (player, targetPos, dimensionId) => {
	try {
		if (!player || player.isFlying !== true) return false;
		const region = isInProtectedRegion(targetPos, dimensionId);
		if (!region) return false;
		const conf = getRegionConfig(region.id);
		if (conf?.antiFly !== true) return false;
		return !isAuthorizedAdmin(player, region.id);
	} catch {
		return false;
	}
};
export const sendProtectionMessage = (p, msg) => {
 if (!isEntityUsable(p)) return;
 const conf = getLobbyConfig();
 if (conf.antiSpamEnabled) {
 const now = Date.now(), last = msgCooldowns.get(p.id) || 0;
 if (now - last < (conf.antiSpamCooldown || 2) * 1000) return;
 msgCooldowns.set(p.id, now);
 }
 msgQueue.push({ p, msg });
 ensureMessageRunner();
};
let messageRun;
const stopMessageRunnerIfIdle = () => {
 if (msgQueue.length || messageRun === undefined) return;
 system.clearRun(messageRun);
 messageRun = undefined;
};
const runProtectionMessages = () => {
 const playSounds = getLobbyConfig().playSounds;
 const batch = msgQueue.splice(0, 25);
 for (let i = 0; i < batch.length; i++) {
  const { p, msg } = batch[i];
  try {
   if (!isEntityUsable(p)) continue;
   p.sendMessage(msg);
   if (playSounds) p.runCommand("playsound note.bass @s ~ ~ ~ 1 0.5");
  } catch { }
 }
 stopMessageRunnerIfIdle();
};
const ensureMessageRunner = () => {
 if (messageRun !== undefined) return;
 messageRun = system.runInterval(runProtectionMessages, 20);
};
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
 msgCooldowns.delete(playerId);
 playerAreas.delete(playerId);
});
