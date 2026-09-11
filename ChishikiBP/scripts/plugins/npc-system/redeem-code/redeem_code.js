import { world, ActionFormData, ModalFormData } from '../../../core.js';
import { addMoney } from "../../../function/moneySystem.js";
import { setRank, getAllRanks, reloadRanksFromStorage, getPlayerRank } from "../../ranks/rank.js";
import { addPlayerSubscription, clearPlayerSubscription, SUBSCRIPTION_PERIODS, PERIOD_NAMES, formatDuration } from "../../ranks/rank_subscription.js";
import { RankDatabase } from "../../ranks/rank_database.js";
import { Lang } from "../../../lib/Lang.js";

const S = "§";
const t = (player, key, ...args) => Lang.t(player, key, ...args);
const CONFIG = {
	DEFAULT: { redeemCodes: { codes: {} } },
	SOUND: {
		error: { prefix: S + "c", sound: "note.bass", pitch: 0.5 },
		warning: { prefix: S + "e", sound: "random.pop", pitch: 0.7 },
		success: { prefix: S + "a", sound: "random.levelup", pitch: 1.0 },
		info: { prefix: S + "b", sound: "random.pop", pitch: 1.0 },
	},
};

const Util = {
	showMsg: (player, type, msg) => {
		const { prefix, sound, pitch } = CONFIG.SOUND[type] || CONFIG.SOUND.info;
		player.sendMessage(`${prefix} ${msg}`);
		try { player.runCommand(`playsound ${sound} @s ~~~ 1 ${pitch}`); } catch { }
	},
	getConfig: () => {
		try { return JSON.parse(world.getDynamicProperty("npcConfig")) || CONFIG.DEFAULT; }
		catch { return CONFIG.DEFAULT; }
	},
	saveConfig: (cfg) => {
		try { world.setDynamicProperty("npcConfig", JSON.stringify(cfg)); return true; }
		catch (e) { console.warn("[NPC] Save failed:", e); return false; }
	},
	parseItems: (str, prefix = "minecraft:") => {
		if (!str?.trim()) return [];
		return str.split(";").map(p => p.trim()).filter(p => p.includes(",")).map(p => {
			const [id, amt] = p.split(",");
			return { item: id.trim().includes(":") ? id.trim() : prefix + id.trim(), amount: parseInt(amt) || 1 };
		});
	},
	stripPrefix: (item, prefix = "minecraft:") => item.replace(prefix, ""),
	particle: (player) => { try { player.runCommand("particle minecraft:totem_particle ~~~"); } catch { } }
};

function findCodeKey(codes, input) {
	if (!codes || !input) return null;
	if (codes[input]) return input;
	const lower = input.toLowerCase();
	return Object.keys(codes).find(k => k.toLowerCase() === lower) || null;
}

function ensureRedeemRank(rankName) {
	const name = String(rankName || "").trim();
	if (!name) return null;
	const all = getAllRanks();
	const existing = all.find(r => r === name || r.toLowerCase() === name.toLowerCase());
	if (existing) return existing;
	const list = RankDatabase.getCustomRankList();
	if (!list.some(r => r.toLowerCase() === name.toLowerCase())) {
		list.push(name);
		RankDatabase.saveCustomRankList(list);
	}
	const ranks = RankDatabase.getCustomRanks();
	const rankId = `rank:${name.toLowerCase()}`;
	if (!ranks[rankId]) {
		ranks[rankId] = { name, color: S + "f", prefix: `${S}7[${name}${S}7]`, commands: {} };
		RankDatabase.saveCustomRanks(ranks);
	}
	reloadRanksFromStorage();
	return name;
}

function getDurationDisplayName(player, durationKey, durationMs) {
	if (durationKey) {
		const langKey = `redeem.period.${durationKey}`;
		const translated = t(player, langKey);
		if (translated !== langKey) return translated;
		if (PERIOD_NAMES[durationKey]) return PERIOD_NAMES[durationKey];
	}
	if (typeof durationMs === "number" && durationMs > 0) {
		return formatDuration(durationMs);
	}
	return "1 Month";
}

function buildRewardBody(player, code, data) {
	const parts = [];
	if (data.items?.enabled && data.items.list?.length) {
		const lines = data.items.list.map(i => t(player, "redeem.confirm.item_line", Util.stripPrefix(i.item), i.amount)).join("\n");
		parts.push(t(player, "redeem.confirm.items", lines));
	}
	if (data.money?.enabled) parts.push(t(player, "redeem.confirm.money", data.money.amount));
	if (data.rank?.enabled && data.rank.name) {
		if (data.rank.isSubscription) {
			const durText = getDurationDisplayName(player, data.rank.durationKey, data.rank.durationMs);
			parts.push(t(player, "redeem.confirm.rank_subscription", data.rank.name, durText));
		} else {
			parts.push(t(player, "redeem.confirm.rank_permanent", data.rank.name));
		}
	}
	return t(player, "redeem.confirm.body", code, parts.join("\n\n") || t(player, "redeem.confirm.none"));
}

async function grantRewards(player, code, data) {
	if (data.items?.enabled && Array.isArray(data.items.list)) {
		data.items.list.forEach(i => {
			try { player.runCommand(`give @s ${i.item} ${i.amount}`); } catch { }
		});
	}
	if (data.money?.enabled && data.money.amount) {
		addMoney(player, data.money.amount);
	}
	if (data.rank?.enabled && data.rank.name) {
		const rank = ensureRedeemRank(data.rank.name);
		if (rank) {
			if (data.rank.isSubscription) {
				const durationKey = data.rank.durationKey || "1_month";
				await addPlayerSubscription(player, rank, durationKey, `Redeem: ${code}`);
			} else {
				clearPlayerSubscription(player);
				setRank(player, rank);
			}
		}
	}
}

export async function processRedeemCode(player, rawCode, opts = {}) {
	const codeInput = String(rawCode || "").trim();
	if (!codeInput) return Util.showMsg(player, "warning", t(player, "redeem.msg.no_code"));
	const cfg = Util.getConfig();
	const code = findCodeKey(cfg.redeemCodes?.codes, codeInput);
	if (!code) return Util.showMsg(player, "warning", t(player, "redeem.msg.invalid"));
	const data = cfg.redeemCodes.codes[code];
	if (data.expiryTime && Date.now() > data.expiryTime) return Util.showMsg(player, "warning", t(player, "redeem.msg.expired"));
	if ((data.redeemedBy || []).includes(player.name)) return Util.showMsg(player, "warning", t(player, "redeem.msg.already"));
	if (data.maxRedemptions && (data.redeemedBy || []).length >= data.maxRedemptions) return Util.showMsg(player, "warning", t(player, "redeem.msg.limit"));
	if (data.allowedRank) {
		const playerRank = getPlayerRank(player);
		if (String(playerRank).toLowerCase() !== String(data.allowedRank).toLowerCase()) {
			return Util.showMsg(player, "warning", t(player, "redeem.msg.rank_not_allowed", data.allowedRank));
		}
	}

	if (!opts.skipConfirm) {
		const confirm = await new ActionFormData()
			.title(t(player, "redeem.confirm.title"))
			.body(buildRewardBody(player, code, data))
			.button(t(player, "redeem.confirm.ok"), "textures/ui/confirm")
			.button(t(player, "redeem.confirm.cancel"), "textures/ui/cancel")
			.show(player);
		if (confirm.canceled || confirm.selection !== 0) return;
	}

	await grantRewards(player, code, data);
	if (!data.redeemedBy) data.redeemedBy = [];
	data.redeemedBy.push(player.name);
	cfg.redeemCodes.codes[code] = data;
	Util.saveConfig(cfg);
	Util.showMsg(player, "success", t(player, "redeem.msg.success"));
	Util.particle(player);
}

export async function showRedeemCodeMenu(player) {
	const res = await new ActionFormData()
		.title(t(player, "redeem.menu.title"))
		.body(t(player, "redeem.menu.body"))
		.button(t(player, "redeem.menu.enter"), "textures/ui/gift_square")
		.button(t(player, "redeem.menu.back"), "textures/ui/cancel")
		.show(player);
	if (res.canceled || res.selection !== 0) return;
	const input = await new ModalFormData()
		.title(t(player, "redeem.input.title"))
		.textField(t(player, "redeem.input.field"), t(player, "redeem.input.placeholder"))
		.show(player);
	if (input.canceled || !input.formValues[0]) return Util.showMsg(player, "warning", t(player, "redeem.msg.no_code"));
	await processRedeemCode(player, input.formValues[0].trim());
}

export async function showRedeemCodeAdminMenu(player) {
	const actions = [createRedeemCode, manageRedeemCodes, viewRedemptionHistory];
	const res = await new ActionFormData()
		.title(t(player, "redeem.admin.title"))
		.button(t(player, "redeem.admin.create"), "textures/ui/color_plus")
		.button(t(player, "redeem.admin.manage"), "textures/ui/debug_glyph_color")
		.button(t(player, "redeem.admin.history"), "textures/ui/bang_icon")
		.button(t(player, "redeem.admin.back"), "textures/ui/cancel")
		.show(player);
	if (!res.canceled && actions[res.selection]) actions[res.selection](player);
}

async function createRedeemCode(player, existingData = {}, codeEdit = "") {
	const isEdit = !!codeEdit;
	const itemsDefault = (existingData.items?.list || []).map(i => `${Util.stripPrefix(i.item)},${i.amount}`).join(";");
	const expiryDefault = existingData.expiryTime ? Math.max(0, Math.round((existingData.expiryTime - Date.now()) / 3600000)) : 0;
	const rankData = existingData.rank || {};
	const availableRanks = getAllRanks();
	const rankDropdownOptions = [t(player, "redeem.create.rank_none") || "No Rank", ...availableRanks, t(player, "redeem.create.rank_custom") || "Custom Rank"];
	let defaultRankIndex = 0;
	const currentRankName = String(rankData.name || "").trim();
	if (rankData.enabled && currentRankName) {
		const idx = availableRanks.indexOf(currentRankName);
		if (idx >= 0) defaultRankIndex = idx + 1;
		else {
			const found = availableRanks.findIndex(r => String(r).toLowerCase() === currentRankName.toLowerCase());
			if (found >= 0) defaultRankIndex = found + 1;
			else defaultRankIndex = rankDropdownOptions.length - 1;
		}
	}
	const defaultCustomRank = (() => {
		if (rankData.enabled && currentRankName && !availableRanks.includes(currentRankName) && !availableRanks.some(r => String(r).toLowerCase() === currentRankName.toLowerCase())) return currentRankName;
		return "";
	})();
	const periodKeys = Object.keys(SUBSCRIPTION_PERIODS);
	const periodDropdownLabels = periodKeys.map(k => {
		const trans = t(player, `redeem.period.${k}`);
		return trans !== `redeem.period.${k}` ? trans : (PERIOD_NAMES[k] || k);
	});
	const combinedRankDurationOptions = [t(player, "redeem.type.permanent"), ...periodDropdownLabels];
	let defaultCombinedIndex = 0;
	if (rankData.isSubscription) {
		const idx = periodKeys.indexOf(rankData.durationKey || "1_month");
		defaultCombinedIndex = idx >= 0 ? idx + 1 : 9;
	}
	const restrictRankOptions = [t(player, "redeem.create.rank_restriction_all") || "All Ranks", ...availableRanks];
	let defaultRestrictEnabled = !!existingData.allowedRank;
	let defaultAllowedRankIndex = 0;
	if (existingData.allowedRank) {
		const idx = availableRanks.indexOf(existingData.allowedRank);
		if (idx >= 0) defaultAllowedRankIndex = idx + 1;
		else {
			const lower = String(existingData.allowedRank).toLowerCase();
			const found = availableRanks.findIndex(r => String(r).toLowerCase() === lower);
			if (found >= 0) defaultAllowedRankIndex = found + 1;
		}
	}

	const res = await new ModalFormData()
		.title(isEdit ? t(player, "redeem.create.title_edit", codeEdit) : t(player, "redeem.create.title_new"))
		.textField(t(player, "redeem.create.code"), "SUMMER2025", codeEdit ? { defaultValue: codeEdit } : undefined)
		.slider(t(player, "redeem.create.money_amount"), 0, 50000, { defaultValue: existingData.money?.amount ?? 0, step: 500 })
		.textField(t(player, "redeem.create.items"), "diamond,5", itemsDefault ? { defaultValue: itemsDefault } : undefined)
		.dropdown(t(player, "redeem.create.rank"), rankDropdownOptions, { defaultValueIndex: defaultRankIndex })
		.textField(t(player, "redeem.create.rank_custom_name"), "VIP", defaultCustomRank ? { defaultValue: defaultCustomRank } : undefined)
		.dropdown(t(player, "redeem.create.rank_duration_combined"), combinedRankDurationOptions, { defaultValueIndex: defaultCombinedIndex })
		.toggle(t(player, "redeem.create.rank_restriction_toggle"), { defaultValue: defaultRestrictEnabled })
		.dropdown(t(player, "redeem.create.rank_restriction"), restrictRankOptions, { defaultValueIndex: defaultAllowedRankIndex })
		.slider(t(player, "redeem.create.limit"), 0, 100, { defaultValue: existingData.maxRedemptions || 0, step: 1 })
		.slider(t(player, "redeem.create.expires"), 0, 720, { defaultValue: expiryDefault, step: 1 })
		.show(player);

	if (res.canceled) return;
	const [code, moneyAmt, itemsStr, rankIndex, customRankInput, combinedDurationIndex, restrictEnabled, allowedRankIndex, maxRedeem, expiryHrs] = res.formValues;
	if (!code) return Util.showMsg(player, "warning", t(player, "redeem.msg.name_required"));

	let rankEnabled = false;
	let rankName = "";
	if (rankIndex === 0) {
		rankEnabled = false;
	} else if (rankIndex === rankDropdownOptions.length - 1) {
		rankEnabled = true;
		rankName = String(customRankInput || "").trim();
		if (!rankName) return Util.showMsg(player, "warning", t(player, "redeem.msg.rank_required"));
	} else {
		rankEnabled = true;
		rankName = availableRanks[rankIndex - 1] || "";
		if (!rankName) return Util.showMsg(player, "warning", t(player, "redeem.msg.rank_selected_required"));
	}

	const cfg = Util.getConfig();
	if (!cfg.redeemCodes) cfg.redeemCodes = { codes: {} };
	if (!isEdit && cfg.redeemCodes.codes[code]) return Util.showMsg(player, "warning", t(player, "redeem.msg.exists"));
	if (isEdit && code !== codeEdit) delete cfg.redeemCodes.codes[codeEdit];

	if (rankEnabled && rankName) ensureRedeemRank(rankName);

	const isSub = rankEnabled && combinedDurationIndex !== 0;
	const durationKey = isSub ? (periodKeys[combinedDurationIndex - 1] || "1_month") : null;

	let allowedRank = null;
	if (restrictEnabled) {
		const idx = allowedRankIndex - 1;
		if (idx >= 0 && idx < availableRanks.length) allowedRank = availableRanks[idx];
	}

	const enMoney = moneyAmt > 0;
	const enItems = !!(itemsStr && String(itemsStr).trim());

	cfg.redeemCodes.codes[code] = {
		allowedRank: allowedRank,
		money: { enabled: enMoney, amount: moneyAmt },
		items: { enabled: enItems, list: Util.parseItems(itemsStr) },
		rank: {
			enabled: !!rankEnabled,
			name: rankName,
			isSubscription: isSub,
			durationKey: isSub ? durationKey : null,
			durationMs: isSub ? SUBSCRIPTION_PERIODS[durationKey] : null
		},
		maxRedemptions: maxRedeem > 0 ? maxRedeem : null,
		expiryTime: expiryHrs > 0 ? Date.now() + expiryHrs * 3600000 : null,
		redeemedBy: existingData.redeemedBy || []
	};

	Util.saveConfig(cfg)
		? Util.showMsg(player, "success", t(player, isEdit ? "redeem.msg.updated" : "redeem.msg.created"))
		: Util.showMsg(player, "error", t(player, "redeem.msg.save_failed"));
}

async function manageRedeemCodes
(player) {
	const cfg = Util.getConfig();
	const codes = Object.keys(cfg.redeemCodes?.codes || {});
	if (!codes.length) return Util.showMsg(player, "info", t(player, "redeem.manage.none"));
	const form = new ActionFormData().title(t(player, "redeem.manage.title"));
	codes.forEach(c => {
		const d = cfg.redeemCodes.codes[c];
		let rankBadge = "";
		if (d.rank?.enabled && d.rank.name) {
			if (d.rank.isSubscription) {
				const durLabel = PERIOD_NAMES[d.rank.durationKey] || d.rank.durationKey || "Sub";
				rankBadge = `\n${S}b[Sub: ${d.rank.name} (${durLabel})]`;
			} else {
				rankBadge = `\n${S}6[Perm: ${d.rank.name}]`;
			}
		}
		let allowedBadge = "";
		if (d.allowedRank) allowedBadge = `\n${S}e[Only: ${d.allowedRank}]`;
		form.button(`${c}\n${S}7(${d.redeemedBy?.length || 0}/${d.maxRedemptions || "∞"})${rankBadge}${allowedBadge}`);
	});
	const res = await form.show(player);
	if (res.canceled) return;
	const selected = codes[res.selection];
	const edit = await new ActionFormData()
		.title(t(player, "redeem.manage.edit_title", selected))
		.button(t(player, "redeem.manage.edit"), "textures/ui/gear")
		.button(t(player, "redeem.manage.delete"), "textures/ui/redX1")
		.button(t(player, "redeem.admin.back"))
		.show(player);
	if (edit.canceled || edit.selection === 2) return manageRedeemCodes(player);
	if (edit.selection === 0) await createRedeemCode(player, cfg.redeemCodes.codes[selected], selected);
	else if (edit.selection === 1) {
		delete cfg.redeemCodes.codes[selected];
		Util.saveConfig(cfg);
		Util.showMsg(player, "success", t(player, "redeem.msg.deleted"));
	}
}

async function viewRedemptionHistory(player) {
	const cfg = Util.getConfig();
	const codes = Object.keys(cfg.redeemCodes?.codes || {});
	if (!codes.length) return Util.showMsg(player, "info", t(player, "redeem.history.none"));
	const form = new ActionFormData().title(t(player, "redeem.history.title"));
	codes.forEach(c => {
		const d = cfg.redeemCodes.codes[c];
		form.button(`${c}\n${S}7${(d.redeemedBy || []).length} redeemed`);
	});
	const res = await form.show(player);
	if (res.canceled) return;
	const selected = codes[res.selection];
	const d = cfg.redeemCodes.codes[selected];
	const list = d.redeemedBy?.length ? d.redeemedBy.join(`\n${S}7- `) : t(player, "redeem.history.empty");
	const rewardSummary = [];
	if (d.money?.enabled) rewardSummary.push(`$${d.money.amount}`);
	if (d.items?.enabled && d.items.list?.length) rewardSummary.push(`${d.items.list.length} items`);
	if (d.rank?.enabled && d.rank.name) {
		rewardSummary.push(d.rank.isSubscription ? `Sub: ${d.rank.name} (${PERIOD_NAMES[d.rank.durationKey] || "1M"})` : `Perm: ${d.rank.name}`);
	}
	if (d.allowedRank) rewardSummary.push(`Only: ${d.allowedRank}`);
	const summaryText = rewardSummary.length ? `§eRewards: §f${rewardSummary.join(", ")}\n\n` : "";
	await new ActionFormData()
		.title(t(player, "redeem.history.detail", selected))
		.body(`${summaryText}${t(player, "redeem.history.body", list)}`)
		.button(t(player, "redeem.admin.back"))
		.show(player);
	viewRedemptionHistory(player);
}
