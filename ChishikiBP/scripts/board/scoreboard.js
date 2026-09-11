import { system, world } from "../core.js";
import { board, subscribeToConfig } from "../board/_config.js";
import { ScoreboardDB, PlaceholderDB } from "../board/data.js";
import { GlobalConfig } from "../function/GlobalConfig.js";
import { getClan } from "../function/getClan.js";
import { getPlaceholder } from "../function/getPlaceholder.js";
import { getRank } from "../function/getRank.js";
import { getScore } from "../function/getScore.js";
import { metricNumbers, getPlayerPing } from "../lib/game.js";
import { forgetRenderedValue, shouldApplyRenderedValue } from "./render-cache.js";
import { getFullMoney, formatMoneyValue } from "../function/moneySystem.js";
import { getCurrency, getDefaultCurrency } from "../function/getCurrency.js";
import { clanDB } from "../function/getClan.js";
import { getBank } from "../plugins/bank/bank.js";
import { getScoreboardDate, getScoreboardTimestamp } from "../function/timeSystem.js";
import { getPlayerGender } from "../function/playerGender.js";
import { getClearlagTimeRemaining } from "../plugins/clear-lag/clearlag.js";

const UPDATE_INTERVAL = 20; // 1 second (20 ticks)
const SCOREBOARD_STAY_DURATION = 24000;
const PLAYTIME_SCORE_SECONDS = 1;
const OBJECTIVES = ["money", "death", "kill", "playtime", "online_time", "coin"];
const DEFAULT_MAX_ONLINE = "10";
const LOGO_HIDDEN_MARKER = "§s§c§b§o§f§f";
const TEXT_LOGO_MARKER = "§s§c§b§t§x§t";

export const sharedPlayerPlaceholders = new Map();

let lastTick = system.currentTick ?? 0;
let lastTime = Date.now();
let currentTps = 20.0;
let displayTps = "20.0";

const cache = {
	currency: "§6$",
	moneyObjective: "money",
	maxOnline: DEFAULT_MAX_ONLINE,
	logoEnabled: true,
	useTextLogo: false,
	textLogo: "Chishiki Essential",
	defaultClan: "None",
	placeholders: {},
};

const activePlayers = new Set();
const renderedTitles = new Map();
const playerDimensionCache = new Map();

function setupScoreboards() {
	const sb = world.scoreboard;
	for (const obj of OBJECTIVES) {
		if (!sb.getObjective(obj)) {
			try { sb.addObjective(obj, obj); } catch (e) { }
		}
	}
}

let objCache = {
	playtime: null,
	onlineTime: null,
	coin: null,
	kill: null,
	death: null,
	lastRefresh: -1,
};

function getScoreboardObjectives() {
	const tick = system.currentTick ?? 0;
	if (tick - objCache.lastRefresh > 200 || !objCache.playtime) {
		const sb = world.scoreboard;
		try {
			objCache.playtime = sb.getObjective("playtime");
			objCache.onlineTime = sb.getObjective("online_time");
			objCache.coin = sb.getObjective("coin");
			objCache.kill = sb.getObjective("kill");
			objCache.death = sb.getObjective("death");
			objCache.lastRefresh = tick;
		} catch { }
	}
	return objCache;
}

let cachedLineSource = null;
let cachedTemplate = "";
let neededKeys = new Set();

const ALL_PLACEHOLDER_KEYS = [
	"NAME", "FULL_NAME", "CURRENCY", "MONEY", "BANK", "COIN", "RANK", "CLAN",
	"GENDER", "PING", "HEALTH", "LEVEL", "XP", "KILL", "DEATH", "PLAYTIME",
	"DIMENSION", "X", "Y", "Z", "HOUR", "MINUTE", "DAY", "MONTH", "YEAR",
	"TPS", "ONLINE", "MAXON", "TIMEZONE", "BLANK", "CLEARLAG"
];

function updateTemplateAnalysis() {
	const lines = board.Line;
	let nametagFormat = "";
	try {
		const nt = GlobalConfig.get("nametag_settings");
		if (nt) {
			const parsed = typeof nt === "string" ? JSON.parse(nt) : nt;
			if (parsed?.enabled) nametagFormat = parsed.format || "";
		}
	} catch { }
	const combinedSource = (Array.isArray(lines) ? lines.join("\n") : "") + "||" + nametagFormat;
	if (combinedSource !== cachedLineSource) {
		cachedLineSource = combinedSource;
		cachedTemplate = Array.isArray(lines) ? lines.join("\n") : "";
		neededKeys = new Set();
		const searchTarget = (cachedTemplate + " " + (cache.useTextLogo ? cache.textLogo : "") + " " + nametagFormat).toUpperCase();
		for (const p of ALL_PLACEHOLDER_KEYS) {
			if (searchTarget.includes(`@${p}`)) {
				neededKeys.add(p);
			}
		}
	}
	return cachedTemplate;
}

const TPS_ALPHA = 0.06;
const TPS_INERTIA = 1 - TPS_ALPHA;
const TPS_DISCONTINUITY_MS = 250;
let tpsDiscontinuitySamples = 0;

function refreshLocalTps() {
	const tick = system.currentTick ?? 0;
	const now = Date.now();
	const tickDelta = tick - lastTick;
	const timeDelta = now - lastTime;
	if (tickDelta > 0 && timeDelta > 0) {
		const expectedTime = tickDelta * 50;
		const isDiscontinuity = timeDelta > expectedTime + TPS_DISCONTINUITY_MS;
		if (isDiscontinuity) tpsDiscontinuitySamples++;
		else tpsDiscontinuitySamples = 0;
		if (!isDiscontinuity || tpsDiscontinuitySamples >= 2) {
			const sampleRate = Math.min(20.0, (tickDelta * 1000) / timeDelta);
			currentTps = (currentTps * TPS_INERTIA) + (sampleRate * TPS_ALPHA);
			displayTps = Math.min(20.0, currentTps).toFixed(1);
		}
	}
	lastTick = tick;
	lastTime = now;
}

function fmtDuration(totalSeconds) {
	const s = Math.max(0, Math.floor(totalSeconds));
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${sec}s`;
	return `${sec}s`;
}

function fmtClearlag(seconds) {
	if (seconds < 0) return "Off";
	return fmtDuration(seconds);
}

async function refreshCache() {
	await ScoreboardDB.ready();
	cache.currency = getDefaultCurrency() || ScoreboardDB.get("ScoreboardDBConfig-currency") || "§6$";
	cache.moneyObjective = ScoreboardDB.get("ScoreboardDBConfig-default-money") || "money";
	cache.maxOnline = ScoreboardDB.get("ScoreboardDBConfig-max-online") ?? GlobalConfig.get("scoreboard:maxOnline") ?? DEFAULT_MAX_ONLINE;
	cache.logoEnabled = ScoreboardDB.get("ScoreboardDBConfig-logo-enabled") ?? GlobalConfig.get("scoreboard:logoEnabled") ?? true;
	const dbTextLogo = ScoreboardDB.get("ScoreboardDBConfig-use-text-logo");
	cache.useTextLogo = (dbTextLogo === true || GlobalConfig.get("scoreboard:useTextLogo") === true);
	cache.textLogo = ScoreboardDB.get("ScoreboardDBConfig-text-logo") || GlobalConfig.get("scoreboard:textLogo") || "Chishiki Essential";
	cache.defaultClan = clanDB.get("ClanDBConfig-default") || "None";
	cache.placeholders = Object.fromEntries(PlaceholderDB.entries());
	cachedLineSource = null; // force re-analysis
}

system.run(async () => {
	setupScoreboards();
	await refreshCache();
	lastTick = system.currentTick ?? 0;
	lastTime = Date.now();
});

subscribeToConfig(refreshCache);

const DIMENSION_NAMES = {
	"minecraft:overworld": "Overworld",
	"minecraft:nether": "Nether",
	"minecraft:the_end": "The End",
	"overworld": "Overworld",
	"nether": "Nether",
	"the_end": "The End",
};

function getDimensionName(dimId) {
	if (!dimId) return "Overworld";
	return DIMENSION_NAMES[dimId] || (dimId.split(":")[1] || dimId).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function forgetScoreboardTitle(playerId) {
	forgetRenderedValue(renderedTitles, playerId);
}

function shouldRenderScoreboardTitle(playerId, text) {
	return shouldApplyRenderedValue(renderedTitles, playerId, text);
}

world.afterEvents.playerDimensionChange?.subscribe?.((event) => {
	try {
		const p = event.player;
		const toDim = event.toDimension;
		if (p?.id && toDim?.id) {
			playerDimensionCache.set(p.id, getDimensionName(toDim.id));
		}
	} catch { }
});

system.runInterval(() => {
	const players = world.getPlayers();
	if (!players.length) return;

	refreshLocalTps();
	const now = getScoreboardTimestamp();
	const template = updateTemplateAnalysis();

	const basePlaceholders = {
		...cache.placeholders,
		BLANK: " ",
	};

	if (neededKeys.has("HOUR") || neededKeys.has("MINUTE") || neededKeys.has("DAY") || neededKeys.has("MONTH") || neededKeys.has("YEAR") || neededKeys.has("TIMEZONE")) {
		const date = getScoreboardDate(now);
		basePlaceholders.HOUR = date.hour;
		basePlaceholders.MINUTE = date.minute;
		basePlaceholders.DAY = date.day;
		basePlaceholders.MONTH = date.month;
		basePlaceholders.YEAR = date.year;
		basePlaceholders.TIMEZONE = date.timezone;
	}

	if (neededKeys.has("TPS")) basePlaceholders.TPS = displayTps;
	if (neededKeys.has("ONLINE")) basePlaceholders.ONLINE = players.length;
	if (neededKeys.has("MAXON")) basePlaceholders.MAXON = cache.maxOnline;
	if (neededKeys.has("CLEARLAG")) basePlaceholders.CLEARLAG = fmtClearlag(getClearlagTimeRemaining());

	const objs = getScoreboardObjectives();
	const playtimeObj = objs.playtime;
	const onlineTimeObj = objs.onlineTime;
	const coinObj = objs.coin;
	const killObj = objs.kill;
	const deathObj = objs.death;

	for (const player of players) {
		try {
			if (playtimeObj) playtimeObj.addScore(player, 1);
			if (onlineTimeObj) onlineTimeObj.setScore(player, 1);
		} catch { }

		if (player.getDynamicProperty("personal_scoreboard_disabled")) {
			if (activePlayers.has(player.id)) {
				player.onScreenDisplay.setTitle("", { fadeInDuration: 0, stayDuration: 0, fadeOutDuration: 0 });
				player.onScreenDisplay.setSubtitle("", { fadeInDuration: 0, stayDuration: 0, fadeOutDuration: 0 });
				activePlayers.delete(player.id);
			}
			forgetScoreboardTitle(player.id);
			continue;
		}

		activePlayers.add(player.id);

		const placeholders = { ...basePlaceholders };

		if (neededKeys.has("NAME")) {
			placeholders.NAME = player.name.length > 10 ? player.name.substring(0, 10) + ".." : player.name;
		}
		if (neededKeys.has("FULL_NAME")) {
			placeholders.FULL_NAME = player.name;
		}
		if (neededKeys.has("CURRENCY")) {
			placeholders.CURRENCY = getCurrency(player) || cache.currency;
		}
		if (neededKeys.has("MONEY")) {
			placeholders.MONEY = formatMoneyValue(getFullMoney(player));
		}
		if (neededKeys.has("BANK")) {
			placeholders.BANK = metricNumbers(getBank(player));
		}
		if (neededKeys.has("COIN")) {
			const coinScore = coinObj ? (coinObj.getScore(player.scoreboardIdentity) || 0) : (getScore(player, "coin") || 0);
			placeholders.COIN = formatMoneyValue(coinScore);
		}
		if (neededKeys.has("RANK")) {
			placeholders.RANK = getRank(player);
		}
		if (neededKeys.has("CLAN")) {
			placeholders.CLAN = getClan(player) || cache.defaultClan;
		}
		if (neededKeys.has("GENDER")) {
			placeholders.GENDER = getPlayerGender(player);
		}
		if (neededKeys.has("PING")) {
			placeholders.PING = getPlayerPing(player);
		}
		if (neededKeys.has("HEALTH")) {
			const healthComponent = player.getComponent("minecraft:health");
			placeholders.HEALTH = healthComponent ? Math.ceil(healthComponent.currentValue) : 0;
		}
		if (neededKeys.has("LEVEL")) {
			placeholders.LEVEL = player.level;
		}
		if (neededKeys.has("XP")) {
			placeholders.XP = player.getTotalXp?.() ?? 0;
		}
		if (neededKeys.has("KILL")) {
			const killScore = killObj ? (killObj.getScore(player.scoreboardIdentity) || 0) : (getScore(player, "kill") || 0);
			placeholders.KILL = killScore;
		}
		if (neededKeys.has("DEATH")) {
			const deathScore = deathObj ? (deathObj.getScore(player.scoreboardIdentity) || 0) : (getScore(player, "death") || 0);
			placeholders.DEATH = deathScore;
		}
		if (neededKeys.has("PLAYTIME")) {
			const playtimeScore = playtimeObj ? (playtimeObj.getScore(player.scoreboardIdentity) || 0) : (getScore(player, "playtime") || 0);
			placeholders.PLAYTIME = fmtDuration(playtimeScore * PLAYTIME_SCORE_SECONDS);
		}
		if (neededKeys.has("DIMENSION")) {
			let dimName = playerDimensionCache.get(player.id);
			if (!dimName) {
				dimName = getDimensionName(player.dimension?.id);
				playerDimensionCache.set(player.id, dimName);
			}
			placeholders.DIMENSION = dimName;
		}
		if (neededKeys.has("X") || neededKeys.has("Y") || neededKeys.has("Z")) {
			const loc = player.location;
			if (neededKeys.has("X")) placeholders.X = Math.floor(loc.x);
			if (neededKeys.has("Y")) placeholders.Y = Math.floor(loc.y);
			if (neededKeys.has("Z")) placeholders.Z = Math.floor(loc.z);
		}

		sharedPlayerPlaceholders.set(player.id, {
			...placeholders,
			_time: now,
		});

		const scoreboardText = getPlaceholder(template, [placeholders]);
		let titleText = "";

		if (!cache.logoEnabled) {
			titleText = scoreboardText ? `${LOGO_HIDDEN_MARKER}${scoreboardText}` : "";
		} else if (cache.useTextLogo) {
			const rawLogo = getPlaceholder(cache.textLogo, [placeholders]) || "Chishiki Essential";
			const logoLine = String(rawLogo);
			titleText = `${TEXT_LOGO_MARKER}${logoLine}\n\n${scoreboardText || ""}`;
		} else {
			titleText = scoreboardText || "";
		}

		if (shouldRenderScoreboardTitle(player.id, titleText)) {
			try {
				player.onScreenDisplay.setTitle(titleText, {
					fadeInDuration: 0,
					stayDuration: SCOREBOARD_STAY_DURATION,
					fadeOutDuration: 0,
				});
			} catch {
				forgetScoreboardTitle(player.id);
			}
		}
	}
}, UPDATE_INTERVAL);

world.afterEvents.playerLeave?.subscribe?.(({ playerId }) => {
	activePlayers.delete(playerId);
	sharedPlayerPlaceholders.delete(playerId);
	playerDimensionCache.delete(playerId);
	forgetScoreboardTitle(playerId);
});

world.afterEvents.entityDie.subscribe((event) => {
	const { deadEntity, damageSource } = event;
	if (deadEntity.typeId === "minecraft:player") {
		try {
			world.scoreboard.getObjective("death")?.addScore(deadEntity, 1);
		} catch { }
		if (damageSource?.damagingEntity?.typeId === "minecraft:player") {
			try {
				world.scoreboard.getObjective("kill")?.addScore(damageSource.damagingEntity, 1);
			} catch { }
		}
	}
});

export { };
