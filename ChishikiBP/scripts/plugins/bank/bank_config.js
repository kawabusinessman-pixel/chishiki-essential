import { GlobalConfig } from "../../function/GlobalConfig.js";
import {
 getStoreDailyWithdrawn,
 addStoreDailyWithdrawn,
 getStoreInterestTs,
 setStoreInterestTs,
 getStoreLoan,
 setStoreLoan,
} from "./bank_store.js";

const BANK_CONFIG_KEY = "bank_config";

export const DEFAULT_BANK_CONFIG = {
 realMode: false,
 interest: {
  enabled: false,
  ratePercent: 1,
  intervalSeconds: 3600,
  maxMissedIntervals: 24,
 },
 fees: {
  depositPercent: 0,
  withdrawPercent: 0,
  transferPercent: 0,
 },
 limits: {
  dailyWithdrawEnabled: false,
  dailyWithdrawLimit: 100000,
  minBalanceEnabled: false,
  minBalance: 0,
 },
 loan: {
  enabled: false,
  maxAmount: 50000,
  interestPercent: 10,
  dueDays: 7,
  overdue: {
   enabled: true,
   finePercent: 5,
   fineIntervalHours: 24,
   maxTotalFinePercent: 200,
   blockWithdraw: true,
   blockTransfer: true,
   blockLoan: true,
   effectIntervalSeconds: 300,
   blindnessSeconds: 5,
   slowness: false,
   nausea: false,
   weakness: false,
   warn: true,
  },
 },
};

export const DAY_MS = 86400000;

function defaultOverdue() {
 return { ...DEFAULT_BANK_CONFIG.loan.overdue };
}

let cachedConfig = null;

function clampInt(value, min, max, fallback) {
 const n = Math.floor(Number(value));
 if (!Number.isFinite(n)) return fallback;
 return Math.min(max, Math.max(min, n));
}

function cloneDefaultConfig() {
 return {
  realMode: false,
  interest: {
   enabled: false,
   ratePercent: DEFAULT_BANK_CONFIG.interest.ratePercent,
   intervalSeconds: DEFAULT_BANK_CONFIG.interest.intervalSeconds,
   maxMissedIntervals: DEFAULT_BANK_CONFIG.interest.maxMissedIntervals,
  },
  fees: { depositPercent: 0, withdrawPercent: 0, transferPercent: 0 },
  limits: {
   dailyWithdrawEnabled: false,
   dailyWithdrawLimit: DEFAULT_BANK_CONFIG.limits.dailyWithdrawLimit,
   minBalanceEnabled: false,
   minBalance: 0,
  },
  loan: {
   enabled: false,
   maxAmount: DEFAULT_BANK_CONFIG.loan.maxAmount,
   interestPercent: DEFAULT_BANK_CONFIG.loan.interestPercent,
   dueDays: DEFAULT_BANK_CONFIG.loan.dueDays,
   overdue: defaultOverdue(),
  },
 };
}

function normalizeBankConfig(raw = {}) {
 const src = typeof raw === "object" && raw ? raw : {};
 const interest = src.interest && typeof src.interest === "object" ? src.interest : {};
 const fees = src.fees && typeof src.fees === "object" ? src.fees : {};
 const limits = src.limits && typeof src.limits === "object" ? src.limits : {};
 const loan = src.loan && typeof src.loan === "object" ? src.loan : {};
 return {
  realMode: !!src.realMode,
  interest: {
   enabled: !!interest.enabled,
   ratePercent: clampInt(interest.ratePercent, 1, 20, DEFAULT_BANK_CONFIG.interest.ratePercent),
   intervalSeconds: clampInt(
    interest.intervalSeconds,
    60,
    86400,
    DEFAULT_BANK_CONFIG.interest.intervalSeconds,
   ),
   maxMissedIntervals: clampInt(
    interest.maxMissedIntervals,
    1,
    168,
    DEFAULT_BANK_CONFIG.interest.maxMissedIntervals,
   ),
  },
  fees: {
   depositPercent: clampInt(fees.depositPercent, 0, 50, 0),
   withdrawPercent: clampInt(fees.withdrawPercent, 0, 50, 0),
   transferPercent: clampInt(fees.transferPercent, 0, 50, 0),
  },
  limits: {
   dailyWithdrawEnabled: !!limits.dailyWithdrawEnabled,
   dailyWithdrawLimit: clampInt(
    limits.dailyWithdrawLimit,
    1,
    1e12,
    DEFAULT_BANK_CONFIG.limits.dailyWithdrawLimit,
   ),
   minBalanceEnabled: !!limits.minBalanceEnabled,
   minBalance: clampInt(limits.minBalance, 0, 1e12, 0),
  },
  loan: {
   enabled: !!loan.enabled,
   maxAmount: clampInt(loan.maxAmount, 1, 1e12, DEFAULT_BANK_CONFIG.loan.maxAmount),
   interestPercent: clampInt(loan.interestPercent, 0, 100, DEFAULT_BANK_CONFIG.loan.interestPercent),
   dueDays: clampInt(loan.dueDays, 1, 90, DEFAULT_BANK_CONFIG.loan.dueDays),
   overdue: normalizeOverdue(loan.overdue),
  },
 };
}

function normalizeOverdue(raw) {
 const src = raw && typeof raw === "object" ? raw : {};
 const base = DEFAULT_BANK_CONFIG.loan.overdue;
 return {
  enabled: src.enabled === undefined ? base.enabled : !!src.enabled,
  finePercent: clampInt(src.finePercent, 0, 100, base.finePercent),
  fineIntervalHours: clampInt(src.fineIntervalHours, 1, 168, base.fineIntervalHours),
  maxTotalFinePercent: clampInt(src.maxTotalFinePercent, 0, 5000, base.maxTotalFinePercent),
  blockWithdraw: src.blockWithdraw === undefined ? base.blockWithdraw : !!src.blockWithdraw,
  blockTransfer: src.blockTransfer === undefined ? base.blockTransfer : !!src.blockTransfer,
  blockLoan: src.blockLoan === undefined ? base.blockLoan : !!src.blockLoan,
  effectIntervalSeconds: clampInt(src.effectIntervalSeconds, 30, 3600, base.effectIntervalSeconds),
  blindnessSeconds: clampInt(src.blindnessSeconds, 0, 60, base.blindnessSeconds),
  slowness: !!src.slowness,
  nausea: !!src.nausea,
  weakness: !!src.weakness,
  warn: src.warn === undefined ? base.warn : !!src.warn,
 };
}

export function getBankConfig() {
 if (cachedConfig) return cachedConfig;
 try {
  const saved = GlobalConfig.get(BANK_CONFIG_KEY);
  if (saved && typeof saved === "object") {
   cachedConfig = normalizeBankConfig(saved);
   return cachedConfig;
  }
 } catch (e) {
  console.warn("[Bank] Failed to load config:", e);
 }
 cachedConfig = cloneDefaultConfig();
 return cachedConfig;
}

export function saveBankConfig(cfg) {
 const normalized = normalizeBankConfig(cfg);
 const ok = GlobalConfig.set(BANK_CONFIG_KEY, normalized);
 if (ok) cachedConfig = normalized;
 return ok;
}

export function isRealBankMode() {
 return !!getBankConfig().realMode;
}

export function calcPercentFee(amount, percent) {
 if (!percent) return 0n;
 const amt = BigInt(amount);
 const pct = BigInt(Math.max(0, Math.floor(Number(percent) || 0)));
 if (amt <= 0n || pct <= 0n) return 0n;
 return (amt * pct) / 100n;
}

export function getMinBalanceRequired() {
 const cfg = getBankConfig();
 if (!cfg.realMode || !cfg.limits.minBalanceEnabled) return 0n;
 return BigInt(cfg.limits.minBalance);
}

export function getDailyWithdrawn(player) {
 return getStoreDailyWithdrawn(player);
}

export function addDailyWithdrawn(player, amount) {
 return addStoreDailyWithdrawn(player, amount);
}

export function getRemainingDailyWithdraw(player) {
 const cfg = getBankConfig();
 if (!cfg.realMode || !cfg.limits.dailyWithdrawEnabled) return null;
 const used = getDailyWithdrawn(player).amount;
 const limit = BigInt(cfg.limits.dailyWithdrawLimit);
 const left = limit - used;
 return left > 0n ? left : 0n;
}

export function getLoan(player) {
 return getStoreLoan(player);
}

export function setLoan(player, loan) {
 setStoreLoan(player, loan);
}

export function calcLoanOwed(principal, interestPercent) {
 const p = BigInt(principal);
 const pct = BigInt(Math.max(0, Math.floor(Number(interestPercent) || 0)));
 return p + (p * pct) / 100n;
}

/**
 * Event-driven interest (call on spawn / bank open). No polling.
 * Returns interest gained (bigint).
 */
export function applyPendingInterest(player, getBank, setBank, addTransaction) {
 const cfg = getBankConfig();
 if (!cfg.realMode || !cfg.interest.enabled) return 0n;

 const intervalMs = cfg.interest.intervalSeconds * 1000;
 if (intervalMs <= 0) return 0n;

 const now = Date.now();
 const rawTs = getStoreInterestTs(player);
 if (!rawTs) {
  setStoreInterestTs(player, now);
  return 0n;
 }

 const last = rawTs;
 let intervals = Math.floor((now - last) / intervalMs);
 if (intervals <= 0) return 0n;
 intervals = Math.min(intervals, cfg.interest.maxMissedIntervals);

 let balance = getBank(player);
 if (balance <= 0n) {
  setStoreInterestTs(player, last + intervals * intervalMs);
  return 0n;
 }

 const rate = BigInt(cfg.interest.ratePercent);
 let gained = 0n;
 for (let i = 0; i < intervals; i++) {
  const gain = (balance * rate) / 100n;
  if (gain <= 0n) break;
  balance += gain;
  gained += gain;
 }

 if (gained > 0n) {
  setBank(player, balance);
  if (typeof addTransaction === "function") {
   addTransaction(player, `+ INTEREST ${gained.toString()}`);
  }
 }
 setStoreInterestTs(player, last + intervals * intervalMs);
 return gained;
}

export function formatIntervalLabel(seconds) {
 const s = Math.max(0, Math.floor(Number(seconds) || 0));
 if (s < 60) return `${s}s`;
 if (s < 3600) return `${Math.floor(s / 60)}m`;
 if (s < 86400) return `${Math.floor(s / 3600)}h`;
 return `${Math.floor(s / 86400)}d`;
}

export const INTEREST_INTERVAL_OPTIONS = [
 { seconds: 900, labelKey: "bank.cfg.interval.15m" },
 { seconds: 1800, labelKey: "bank.cfg.interval.30m" },
 { seconds: 3600, labelKey: "bank.cfg.interval.1h" },
 { seconds: 21600, labelKey: "bank.cfg.interval.6h" },
 { seconds: 86400, labelKey: "bank.cfg.interval.24h" },
];
