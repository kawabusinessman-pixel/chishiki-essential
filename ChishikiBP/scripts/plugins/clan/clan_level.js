import { world } from "../../core.js";
import { clanDB } from "../../function/getClan.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { Lang } from "../../lib/Lang.js";

export const DEFAULT_THRESHOLDS = [0, 5, 10, 20, 35, 50];

export const getClanLevelThresholds = () => {
	const raw = GlobalConfig.get("clanLevelThresholds");
	if (!raw) return [...DEFAULT_THRESHOLDS];
	try {
		const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
		if (Array.isArray(arr)) return [...arr];
	} catch { }
	return [...DEFAULT_THRESHOLDS];
};

export const getLevelForMemberCount = (
	memberCount,
	thresholds = getClanLevelThresholds(),
) => {
	let level = 1;
	for (let i = 1; i < thresholds.length; i++) {
		if (memberCount >= thresholds[i]) level = i + 1;
	}
	return level;
};

export const getNextLevelRequirement = (level, thresholds = getClanLevelThresholds()) =>
	level < thresholds.length ? thresholds[level] : null;

const notifyLevelUp = (clan) => {
	for (const name of clan.members) {
		const p = world.getPlayers().find((pl) => pl.name === name);
		if (!p) continue;
		try {
			p.sendMessage(
				Lang.t(p, "clan.level.up", clan.name || "", clan.level || 1),
			);
		} catch { }
	}
};

export const recalcClanLevel = (clanId, { notify = true } = {}) => {
	const clan = clanDB.get(`clan_${clanId}`);
	if (!clan || !Array.isArray(clan.members)) return null;
	const previous = clan.level || 1;
	clan.xp = clan.members.length;
	clan.level = getLevelForMemberCount(clan.members.length);
	clanDB.set(`clan_${clanId}`, clan);
	if (notify && clan.level > previous) notifyLevelUp(clan);
	return { level: clan.level, previous, xp: clan.xp };
};

export const recalcAllClanLevels = () => {
	for (const key of clanDB.keys()) {
		if (key.startsWith("clan_") && !key.endsWith("_settings")) {
			recalcClanLevel(key.slice("clan_".length));
		}
	}
};
