import { world, system } from "../../core.js";
import { Lang } from "../../lib/Lang.js";
import { metricNumbers } from "../../lib/game.js";
import { getBankConfig, DAY_MS } from "./bank_config.js";
import { isMemberFeatureEnabled } from "../../function/memberFeatureState.js";
import { getStoreLoan, setStoreLoan } from "./bank_store.js";

const SWEEP_INTERVAL_TICKS = 200;
const HOUR_MS = 3600000;
const lastEffectAt = new Map();
let overdueSweepRunId;

export function getLoanDueAt(loan, cfg = getBankConfig()) {
 if (!loan) return 0;
 if (loan.dueAt > 0) return loan.dueAt;
 // Pinjaman yang dibuat sebelum fitur jatuh tempo ada: hitung dari tanggal pinjam.
 const borrowedAt = loan.borrowedAt || Date.now();
 return borrowedAt + cfg.loan.dueDays * DAY_MS;
}

export function getLoanStatus(player, cfg = getBankConfig()) {
 syncOverdueSweep();
 const loan = getStoreLoan(player);
 if (!loan) return null;
 const dueAt = getLoanDueAt(loan, cfg);
 const now = Date.now();
 return {
  loan,
  dueAt,
  overdue: now > dueAt,
  msRemaining: Math.max(0, dueAt - now),
  msOverdue: Math.max(0, now - dueAt),
 };
}

export function isLoanOverdue(player, cfg = getBankConfig()) {
 if (!cfg.realMode || !cfg.loan.enabled) return false;
 const status = getLoanStatus(player, cfg);
 return !!status?.overdue;
}

export function formatDuration(player, ms) {
 const total = Math.max(0, Math.floor(ms / 1000));
 const days = Math.floor(total / 86400);
 const hours = Math.floor((total % 86400) / 3600);
 const minutes = Math.floor((total % 3600) / 60);
 if (days > 0) return Lang.t(player, "bank.loan.dur.dh", days, hours);
 if (hours > 0) return Lang.t(player, "bank.loan.dur.hm", hours, minutes);
 return Lang.t(player, "bank.loan.dur.m", Math.max(1, minutes));
}

/**
 * Denda berbasis waktu nyata, dihitung saat dibutuhkan (join / buka bank / sweep).
 * Mengembalikan jumlah denda yang baru ditambahkan.
 */
export function applyPendingLoanFines(player, cfg = getBankConfig()) {
 if (!cfg.realMode || !cfg.loan.enabled) return 0n;
 const overdueCfg = cfg.loan.overdue;
 if (!overdueCfg.enabled || overdueCfg.finePercent <= 0) return 0n;

 const loan = getStoreLoan(player);
 if (!loan) return 0n;

 const dueAt = getLoanDueAt(loan, cfg);
 const now = Date.now();
 if (now <= dueAt) return 0n;

 const intervalMs = overdueCfg.fineIntervalHours * HOUR_MS;
 if (intervalMs <= 0) return 0n;

 const since = Math.max(dueAt, loan.lastFineAt || 0);
 const rounds = Math.floor((now - since) / intervalMs);
 if (rounds <= 0) return 0n;

 const applied = Number(loan.finePercentApplied) || 0;
 const remainingCap = Math.max(0, overdueCfg.maxTotalFinePercent - applied);
 if (remainingCap <= 0) {
  setStoreLoan(player, { ...loan, dueAt, lastFineAt: since + rounds * intervalMs });
  return 0n;
 }

 const allowedRounds = Math.min(rounds, Math.floor(remainingCap / overdueCfg.finePercent) || 0);
 if (allowedRounds <= 0) return 0n;

 const rate = BigInt(overdueCfg.finePercent);
 let owed = loan.owed;
 let added = 0n;
 for (let i = 0; i < allowedRounds; i++) {
  const fine = (owed * rate) / 100n;
  if (fine <= 0n) break;
  owed += fine;
  added += fine;
 }
 if (added <= 0n) return 0n;

 setStoreLoan(player, {
  ...loan,
  owed,
  dueAt,
  lastFineAt: since + allowedRounds * intervalMs,
  finePercentApplied: applied + allowedRounds * overdueCfg.finePercent,
 });
 return added;
}

function applyOverdueEffects(player, overdueCfg) {
 if (overdueCfg.blindnessSeconds > 0) {
  try {
   player.addEffect("blindness", overdueCfg.blindnessSeconds * 20, {
    amplifier: 0,
    showParticles: false,
   });
  } catch {}
 }
 const supportEffects = [
  [overdueCfg.slowness, "slowness"],
  [overdueCfg.nausea, "nausea"],
  [overdueCfg.weakness, "weakness"],
 ];
 for (const [enabled, effectId] of supportEffects) {
  if (!enabled) continue;
  try {
   player.addEffect(effectId, Math.max(20, overdueCfg.blindnessSeconds * 20), {
    amplifier: 0,
    showParticles: false,
   });
  } catch {}
 }
}

function warnOverdue(player, status, currency) {
 try {
  player.onScreenDisplay.setActionBar(
   Lang.t(
    player,
    "bank.loan.overdue.actionbar",
    `${currency}${metricNumbers(status.loan.owed.toString())}`,
    formatDuration(player, status.msOverdue),
   ),
  );
 } catch {}
}

function isOverdueSweepEnabled() {
 const cfg = getBankConfig();
 return isMemberFeatureEnabled("bank") && cfg.realMode && cfg.loan.enabled && cfg.loan.overdue.enabled;
}

export function syncOverdueSweep() {
	if (isOverdueSweepEnabled()) {
		if (overdueSweepRunId === undefined) overdueSweepRunId = system.runInterval(sweepOverduePlayers, SWEEP_INTERVAL_TICKS);
		return;
	}
	if (overdueSweepRunId !== undefined) {
		system.clearRun(overdueSweepRunId);
		overdueSweepRunId = undefined;
	}
}

system.run(() => syncOverdueSweep());

function sweepOverduePlayers() {
 if (!isOverdueSweepEnabled()) {
  syncOverdueSweep();
  return;
 }
 const cfg = getBankConfig();
 if (!cfg.realMode || !cfg.loan.enabled) return;
 const overdueCfg = cfg.loan.overdue;
 if (!overdueCfg.enabled) return;

 const players = world.getAllPlayers();
 if (!players.length) return;

 const now = Date.now();
 const effectIntervalMs = overdueCfg.effectIntervalSeconds * 1000;
 const currency = getCurrencySymbol();

 for (const player of players) {
  try {
   const status = getLoanStatus(player, cfg);
   if (!status?.overdue) {
    lastEffectAt.delete(player.id);
    continue;
   }
   applyPendingLoanFines(player, cfg);
   const last = lastEffectAt.get(player.id) || 0;
   if (now - last < effectIntervalMs) continue;
   lastEffectAt.set(player.id, now);
   applyOverdueEffects(player, overdueCfg);
   if (overdueCfg.warn) {
    const fresh = getLoanStatus(player, cfg);
    if (fresh) {
     warnOverdue(player, fresh, currency);
     player.sendMessage(
      Lang.t(
       player,
       "bank.loan.overdue.warn",
       `${currency}${metricNumbers(fresh.loan.owed.toString())}`,
       formatDuration(player, fresh.msOverdue),
      ),
     );
    }
   }
  } catch {}
 }
}

let currencyResolver = () => "$";

export function setLoanCurrencyResolver(resolver) {
 if (typeof resolver === "function") currencyResolver = resolver;
}

function getCurrencySymbol() {
 try {
  return currencyResolver() || "$";
 } catch {
  return "$";
 }
}

world.afterEvents.playerLeave?.subscribe(({ playerId }) => {
 lastEffectAt.delete(playerId);
});

system.run(syncOverdueSweep);
