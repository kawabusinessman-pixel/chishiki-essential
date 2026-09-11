import { system, world } from "../../core.js";
import { clanDB } from "../../function/getClan.js";
import { Lang } from "../../lib/Lang.js";

const MSG_COOLDOWN_MS = 2000;
const msgCooldowns = new Map();

const getClanSettings = (clanId) => {
	const settings = clanDB.get(`clan_${clanId}_settings`);
	return settings && typeof settings === "object" ? settings : null;
};

export const isClanFriendlyFireEnabled = (clanId) =>
	getClanSettings(clanId)?.friendlyFire === true;

const getPlayerClanId = (player) => {
	const data = clanDB.get(`player_${player.name}`);
	return data?.clanId || null;
};

const isEntityUsable = (entity) => {
	try {
		const valid = entity?.isValid;
		return typeof valid === "function" ? valid.call(entity) : valid !== false;
	} catch {
		return false;
	}
};

const resolveAttacker = (damagingEntity) => {
	if (!damagingEntity) return null;
	if (damagingEntity.typeId === "minecraft:player") return damagingEntity;
	try {
		const owner = damagingEntity.getComponent("minecraft:projectile")?.owner;
		return owner?.typeId === "minecraft:player" ? owner : null;
	} catch {
		return null;
	}
};

const notifyBlocked = (attacker) => {
	const now = Date.now();
	if (now - (msgCooldowns.get(attacker.id) || 0) < MSG_COOLDOWN_MS) return;
	msgCooldowns.set(attacker.id, now);
	system.run(() => {
		try {
			if (isEntityUsable(attacker))
				attacker.sendMessage(Lang.t(attacker, "clan.ff.blocked"));
		} catch { }
	});
};

world.beforeEvents.entityHurt.subscribe((e) => {
	try {
		const target = e.hurtEntity || e.entity;
		const attacker = resolveAttacker(e.damageSource?.damagingEntity);
		if (target?.typeId !== "minecraft:player" || !attacker) return;
		if (attacker.id === target.id) return;
		const attackerClanId = getPlayerClanId(attacker);
		if (!attackerClanId || attackerClanId !== getPlayerClanId(target)) return;
		if (isClanFriendlyFireEnabled(attackerClanId)) return;
		e.cancel = true;
		notifyBlocked(attacker);
	} catch { }
});
