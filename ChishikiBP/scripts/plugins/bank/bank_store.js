/**
 * Single player Dynamic Property for all bank data.
 * Key: kiw_bank  (on player entity — no per-player name in key)
 *
 * Shape: { b, t, x, d, i, l }
 *  b = balance string
 *  t = last bank write timestamp
 *  x = transaction strings (max 10)
 *  d = daily withdraw { day, a } | null
 *  i = last interest timestamp
 *  l = loan { p, o, at, due, lf, fp } | null
 *      due = due timestamp, lf = last fine timestamp, fp = total fine percent applied
 */

const BANK_DP = "kiw_bank";
const TX_LIMIT = 10;

function emptyData() {
 return { b: "0", t: 0, x: [], d: null, i: 0, l: null };
}

function legacyKeys(name) {
 return [
  `bank_balance_${name}`,
  `bank_timestamp_${name}`,
  `bank_transactions_${name}`,
  `bank_daily_wd_${name}`,
  `bank_interest_ts_${name}`,
  `bank_loan_${name}`,
 ];
}

function clearLegacy(player) {
 const keys = legacyKeys(player.name);
 for (let i = 0; i < keys.length; i++) {
  try {
   player.setDynamicProperty(keys[i], undefined);
  } catch {}
 }
}

function migrateLegacy(player) {
 const name = player.name;
 const data = emptyData();
 let found = false;

 try {
  const bal = player.getDynamicProperty(`bank_balance_${name}`);
  if (bal !== undefined && bal !== null) {
   data.b = String(bal);
   found = true;
  }
 } catch {}

 try {
  const ts = player.getDynamicProperty(`bank_timestamp_${name}`);
  if (ts !== undefined && ts !== null) {
   data.t = Number(ts) || 0;
   found = true;
  }
 } catch {}

 try {
  const txRaw = player.getDynamicProperty(`bank_transactions_${name}`);
  if (txRaw) {
   const arr = typeof txRaw === "string" ? JSON.parse(txRaw) : txRaw;
   if (Array.isArray(arr)) {
    data.x = arr.slice(-TX_LIMIT);
    found = true;
   }
  }
 } catch {}

 try {
  const dailyRaw = player.getDynamicProperty(`bank_daily_wd_${name}`);
  if (dailyRaw) {
   const parsed = typeof dailyRaw === "string" ? JSON.parse(dailyRaw) : dailyRaw;
   if (parsed && parsed.day !== undefined) {
    data.d = { day: parsed.day, a: String(parsed.amount ?? "0") };
    found = true;
   }
  }
 } catch {}

 try {
  const interest = player.getDynamicProperty(`bank_interest_ts_${name}`);
  if (interest !== undefined && interest !== null) {
   data.i = Number(interest) || 0;
   found = true;
  }
 } catch {}

 try {
  const loanRaw = player.getDynamicProperty(`bank_loan_${name}`);
  if (loanRaw) {
   const parsed = typeof loanRaw === "string" ? JSON.parse(loanRaw) : loanRaw;
   if (parsed && parsed.owed !== undefined) {
    data.l = {
     p: String(parsed.principal ?? "0"),
     o: String(parsed.owed),
     at: Number(parsed.borrowedAt || 0),
    };
    found = true;
   }
  }
 } catch {}

 if (!found) return null;
 saveBankData(player, data);
 clearLegacy(player);
 return data;
}

export function loadBankData(player) {
 try {
  const raw = player.getDynamicProperty(BANK_DP);
  if (raw !== undefined && raw !== null) {
   const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
   if (parsed && typeof parsed === "object") {
    return {
     b: parsed.b !== undefined ? String(parsed.b) : "0",
     t: Number(parsed.t) || 0,
     x: Array.isArray(parsed.x) ? parsed.x : [],
     d: parsed.d && typeof parsed.d === "object" ? parsed.d : null,
     i: Number(parsed.i) || 0,
     l: parsed.l && typeof parsed.l === "object" ? parsed.l : null,
    };
   }
  }
 } catch {}

 const migrated = migrateLegacy(player);
 if (migrated) return migrated;
 return emptyData();
}

export function saveBankData(player, data) {
 const payload = {
  b: String(data.b ?? "0"),
  t: Number(data.t) || 0,
  x: Array.isArray(data.x) ? data.x.slice(-TX_LIMIT) : [],
  d: data.d || null,
  i: Number(data.i) || 0,
  l: data.l || null,
 };
 player.setDynamicProperty(BANK_DP, JSON.stringify(payload));
}

export function getStoreBalance(player) {
 return BigInt(loadBankData(player).b || "0");
}

export function setStoreBalance(player, amount, touchTs = true) {
 const data = loadBankData(player);
 data.b = BigInt(amount).toString();
 if (touchTs) data.t = Date.now();
 saveBankData(player, data);
}

export function getStoreTimestamp(player) {
 return BigInt(loadBankData(player).t || 0);
}

export function getStoreTransactions(player) {
 const x = loadBankData(player).x;
 return Array.isArray(x) ? x : [];
}

export function pushStoreTransaction(player, text) {
 const data = loadBankData(player);
 if (!Array.isArray(data.x)) data.x = [];
 data.x.push(text);
 if (data.x.length > TX_LIMIT) data.x = data.x.slice(-TX_LIMIT);
 saveBankData(player, data);
}

export function dayKey(ts = Date.now()) {
 const d = new Date(ts);
 return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export function getStoreDailyWithdrawn(player) {
 const data = loadBankData(player);
 const today = dayKey();
 if (!data.d || data.d.day !== today) return { day: today, amount: 0n };
 return { day: data.d.day, amount: BigInt(data.d.a || 0) };
}

export function addStoreDailyWithdrawn(player, amount) {
 const data = loadBankData(player);
 const today = dayKey();
 const current =
  data.d && data.d.day === today ? BigInt(data.d.a || 0) : 0n;
 const next = current + BigInt(amount);
 data.d = { day: today, a: next.toString() };
 saveBankData(player, data);
 return next;
}

export function getStoreInterestTs(player) {
 return Number(loadBankData(player).i) || 0;
}

export function setStoreInterestTs(player, ts) {
 const data = loadBankData(player);
 data.i = Number(ts) || Date.now();
 saveBankData(player, data);
}

export function getStoreLoan(player) {
 const data = loadBankData(player);
 if (!data.l || data.l.o === undefined || data.l.o === null) return null;
 try {
  const owed = BigInt(data.l.o);
  if (owed <= 0n) return null;
  return {
   principal: BigInt(data.l.p || 0),
   owed,
   borrowedAt: Number(data.l.at || 0),
   // Pinjaman lama belum punya field ini; 0 berarti "belum diberi jatuh tempo".
   dueAt: Number(data.l.due || 0),
   lastFineAt: Number(data.l.lf || 0),
   finePercentApplied: Number(data.l.fp || 0),
  };
 } catch {
  return null;
 }
}

export function setStoreLoan(player, loan) {
 const data = loadBankData(player);
 if (!loan) {
  data.l = null;
 } else {
  data.l = {
   p: loan.principal.toString(),
   o: loan.owed.toString(),
   at: loan.borrowedAt || Date.now(),
   due: Number(loan.dueAt) || 0,
   lf: Number(loan.lastFineAt) || 0,
   fp: Number(loan.finePercentApplied) || 0,
  };
 }
 saveBankData(player, data);
}
