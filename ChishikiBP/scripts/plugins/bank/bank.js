import { world, ActionFormData, ModalFormData, MessageFormData } from "../../core.js";
import { ScoreboardDB } from "../../board/data.js";
import {
 getFullMoney,
 addMoney,
 removeMoney,
 formatMoneyValue,
} from "../../function/moneySystem.js";
import { metricNumbers } from "../../lib/game.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { isMemberFeatureEnabled } from "../../function/memberFeatureState.js";
import { Lang } from "../../lib/Lang.js";
import {
 getBankConfig,
 isRealBankMode,
 calcPercentFee,
 getMinBalanceRequired,
 getRemainingDailyWithdraw,
 addDailyWithdrawn,
 getLoan,
 setLoan,
 calcLoanOwed,
 applyPendingInterest,
 formatIntervalLabel,
 DAY_MS,
} from "./bank_config.js";
import {
 getStoreBalance,
 setStoreBalance,
 getStoreTimestamp,
 getStoreTransactions,
 pushStoreTransaction,
} from "./bank_store.js";
import {
 getLoanStatus,
 isLoanOverdue,
 applyPendingLoanFines,
 formatDuration,
 setLoanCurrencyResolver,
} from "./bank_loan.js";

const CURRENCY_DEFAULT = "$";
let currencySymbol = CURRENCY_DEFAULT;
let userTimezone = "+7";

/** Lazy refresh — no runInterval (docs: prefer events over polling). */
function refreshBankMeta() {
 try {
  currencySymbol =
   ScoreboardDB.get("ScoreboardDBConfig-currency") ?? CURRENCY_DEFAULT;
  const timezone = GlobalConfig.get("time:timezone");
  if (timezone) {
   userTimezone = String(timezone).replace("UTC", "");
  } else {
   userTimezone =
    ScoreboardDB.get("ScoreboardDBConfig-offset-timezone") ?? "+7";
  }
 } catch {
  currencySymbol = CURRENCY_DEFAULT;
  userTimezone = "+7";
 }
}

setLoanCurrencyResolver(() => {
 refreshBankMeta();
 return currencySymbol;
});

function notifyLoanFine(player, added) {
 if (added <= 0n) return;
 refreshBankMeta();
 player.sendMessage(
  Lang.t(player, "bank.loan.fine.msg", `${currencySymbol}${metricNumbers(added.toString())}`),
 );
 try {
  player.playSound("note.bass");
 } catch {}
}

function tryApplyLoanFines(player, notify = false) {
 try {
  const added = applyPendingLoanFines(player);
  if (notify) notifyLoanFine(player, added);
  return added;
 } catch {
  return 0n;
 }
}

function notifyInterest(player, gained) {
 if (gained <= 0n) return;
 try {
  refreshBankMeta();
  player.sendMessage(
   Lang.t(
    player,
    "bank.msg.interest",
    `${currencySymbol}${metricNumbers(gained.toString())}`,
   ),
  );
 } catch {}
}

function tryApplyInterest(player, notify = false) {
 try {
  const cfg = getBankConfig();
  if (!cfg.realMode || !cfg.interest.enabled) return 0n;
  const gained = applyPendingInterest(player, getBank, setBank, addTransaction);
  if (notify) notifyInterest(player, gained);
  return gained;
 } catch {
  return 0n;
 }
}

function getBankPropertyKey(player) {
 return `bank_balance_${player.name}`;
}
function migrateBankIfNeeded(player) {
 // Already on unified DP?
 try {
  if (player.getDynamicProperty("kiw_bank") !== undefined) return;
 } catch {}
 // Legacy named balance key already handled by bank_store migrate.
 // Scoreboard → store only if both missing.
 if (getStoreBalance(player) > 0n) return;
 const key = getBankPropertyKey(player);
 if (player.getDynamicProperty(key) !== undefined) return;
 let base = 0,
  billion = 0,
  trillion = 0;
 try {
  base =
   world.scoreboard
    .getObjective("bank")
    ?.getScore(player.scoreboardIdentity) || 0;
  billion =
   world.scoreboard
    .getObjective("bank_billion")
    ?.getScore(player.scoreboardIdentity) || 0;
  trillion =
   world.scoreboard
    .getObjective("bank_trillion")
    ?.getScore(player.scoreboardIdentity) || 0;
 } catch {}
 const total =
  BigInt(base) +
  BigInt(billion) * 1000000000n +
  BigInt(trillion) * 1000000000000n;
 if (total > 0n) {
  setStoreBalance(player, total);
  try {
   world
    .getDimension("overworld")
    .runCommand(`scoreboard players set "${player.name}" bank 0`);
   world
    .getDimension("overworld")
    .runCommand(`scoreboard players set "${player.name}" bank_billion 0`);
   world
    .getDimension("overworld")
    .runCommand(`scoreboard players set "${player.name}" bank_trillion 0`);
  } catch {}
 }
}
export function getBank(player) {
 migrateBankIfNeeded(player);
 return getStoreBalance(player);
}
export function setBank(player, amount) {
 migrateBankIfNeeded(player);
 setStoreBalance(player, amount);
}
export function addBank(player, amount) {
 migrateBankIfNeeded(player);
 setBank(player, getBank(player) + BigInt(amount));
}
export function getBankTimestamp(player) {
 return getStoreTimestamp(player);
}
function removeBank(player, amount) {
 migrateBankIfNeeded(player);
 const current = getBank(player);
 const amt = BigInt(amount);
 if (amt > current) return false;
 setBank(player, current - amt);
 return true;
}

function getCurrentTimeWithOffset() {
 const now = new Date();
 const offsetMatch = userTimezone.match(/([+-])(\d+)/);
 if (offsetMatch) {
  const sign = offsetMatch[1] === "+" ? 1 : -1;
  const hours = parseInt(offsetMatch[2]);
  const offset = sign * hours * 60;
  const userTime = new Date(
   now.getTime() + (offset - now.getTimezoneOffset()) * 60000,
  );
  return userTime.toLocaleTimeString();
 }
 return now.toLocaleTimeString();
}

const getMoney = (player) => getFullMoney(player);

export function addTransaction(player, text) {
 pushStoreTransaction(player, text);
}
export function getTransactions(player) {
 return getStoreTransactions(player);
}

function buildStatusBody(player) {
 const money = getMoney(player);
 const bank = getBank(player);
 let body = Lang.t(
  player,
  "bank.body",
  `${currencySymbol}${formatMoneyValue(money)}`,
  `${currencySymbol}${formatMoneyValue(bank)}`,
 );
 if (!isRealBankMode()) return body;

 const cfg = getBankConfig();
 const parts = [];
 if (cfg.interest.enabled) {
  parts.push(
   Lang.t(
    player,
    "bank.body.interest",
    `${cfg.interest.ratePercent}%`,
    formatIntervalShort(cfg.interest.intervalSeconds),
   ),
  );
 }
 if (cfg.fees.depositPercent > 0 || cfg.fees.withdrawPercent > 0 || cfg.fees.transferPercent > 0) {
  parts.push(
   Lang.t(
    player,
    "bank.body.fees",
    `${cfg.fees.depositPercent}%`,
    `${cfg.fees.withdrawPercent}%`,
    `${cfg.fees.transferPercent}%`,
   ),
  );
 }
 const dailyLeft = getRemainingDailyWithdraw(player);
 if (dailyLeft !== null) {
  parts.push(
   Lang.t(
    player,
    "bank.body.daily_left",
    `${currencySymbol}${metricNumbers(dailyLeft.toString())}`,
   ),
  );
 }
 if (cfg.limits.minBalanceEnabled) {
  parts.push(
   Lang.t(
    player,
    "bank.body.min_balance",
    `${currencySymbol}${metricNumbers(String(cfg.limits.minBalance))}`,
   ),
  );
 }
 const loan = getLoan(player);
 if (cfg.loan.enabled) {
  if (loan) {
   parts.push(
    Lang.t(
     player,
     "bank.body.loan_owed",
     `${currencySymbol}${metricNumbers(loan.owed.toString())}`,
    ),
   );
   const status = getLoanStatus(player, cfg);
   if (status) {
    parts.push(
     status.overdue
      ? Lang.t(player, "bank.body.loan_overdue", formatDuration(player, status.msOverdue))
      : Lang.t(player, "bank.body.loan_due", formatDuration(player, status.msRemaining)),
    );
   }
  } else {
   parts.push(Lang.t(player, "bank.body.loan_available"));
  }
 }
 if (parts.length) body += `\n\n${parts.join("\n")}`;
 return body;
}

/** Blokir aksi tertentu selama pinjaman lewat jatuh tempo, sesuai pengaturan admin. */
function blockedByOverdue(player, action) {
 const cfg = getBankConfig();
 if (!cfg.realMode || !cfg.loan.enabled || !cfg.loan.overdue.enabled) return false;
 if (action === "withdraw" && !cfg.loan.overdue.blockWithdraw) return false;
 if (action === "transfer" && !cfg.loan.overdue.blockTransfer) return false;
 if (!isLoanOverdue(player, cfg)) return false;
 refreshBankMeta();
 const status = getLoanStatus(player, cfg);
 player.sendMessage(
  Lang.t(
   player,
   action === "withdraw" ? "bank.loan.err.blocked_withdraw" : "bank.loan.err.blocked_transfer",
   `${currencySymbol}${metricNumbers(status ? status.loan.owed.toString() : "0")}`,
  ),
 );
 try {
  player.playSound("note.bass");
 } catch {}
 return true;
}

function formatIntervalShort(seconds) {
 if (seconds < 60) return `${seconds}s`;
 if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
 return `${Math.floor(seconds / 3600)}h`;
}

function parseAmountInput(raw) {
 if (!raw || !/^[0-9]+$/.test(String(raw).replace(/,/g, ""))) return null;
 const amount = BigInt(String(raw).replace(/,/g, ""));
 if (amount <= 0n) return null;
 return amount;
}

export function Bank(player) {
 refreshBankMeta();
 tryApplyInterest(player, true);
 tryApplyLoanFines(player, true);

 const cfg = getBankConfig();
 const menu = new ActionFormData()
  .title(Lang.t(player, "bank.title"))
  .body(buildStatusBody(player))
  .button(Lang.t(player, "bank.btn.deposit"), "textures/ui/icon_map.png")
  .button(Lang.t(player, "bank.btn.withdraw"), "textures/ui/icon_book_writable.png")
  .button(Lang.t(player, "bank.btn.transactions"), "textures/ui/lock_color.png")
  .button(Lang.t(player, "bank.btn.transfer"), "textures/ui/FriendsIcon.png");

 const showLoanBtn = cfg.realMode && cfg.loan.enabled;
 if (showLoanBtn) {
  menu.button(Lang.t(player, "bank.btn.loan"), "textures/ui/MCoin");
 }
 menu.button(Lang.t(player, "bank.btn.help"), "textures/ui/icon_book_writable.png");
 menu.button(Lang.t(player, "bank.btn.exit"), "textures/ui/cancel.png");

 menu
  .show(player)
  .then((res) => {
   if (res.canceled) return;
   let idx = 0;
   const depositIdx = idx++;
   const withdrawIdx = idx++;
   const txIdx = idx++;
   const transferIdx = idx++;
   const loanIdx = showLoanBtn ? idx++ : -1;
   const helpIdx = idx++;
   const exitIdx = idx++;

   switch (res.selection) {
    case depositIdx:
     handleDeposit(player);
     break;
    case withdrawIdx:
     handleWithdraw(player);
     break;
    case txIdx:
     showTransactions(player);
     break;
    case transferIdx:
     handleBankTransfer(player);
     break;
    case loanIdx:
     handleLoanMenu(player);
     break;
    case helpIdx:
     showPlayerBankHelp(player);
     break;
    case exitIdx:
     player.playSound("note.bass");
     break;
   }
  })
  .catch(() => {
   player.sendMessage(Lang.t(player, "bank.err.menu"));
  });
}

function buildMemberBankHelpBody(player) {
 const cfg = getBankConfig();
 if (!cfg.realMode) {
  return Lang.t(player, "bank.help.body.basic");
 }
 const on = Lang.t(player, "common.enabled");
 const off = Lang.t(player, "common.disabled");
 return Lang.t(
  player,
  "bank.help.body.real",
  cfg.interest.enabled ? on : off,
  `${cfg.interest.ratePercent}%`,
  formatIntervalLabel(cfg.interest.intervalSeconds),
  `${cfg.fees.depositPercent}%`,
  `${cfg.fees.withdrawPercent}%`,
  `${cfg.fees.transferPercent}%`,
  cfg.limits.dailyWithdrawEnabled
   ? `${currencySymbol}${metricNumbers(cfg.limits.dailyWithdrawLimit)}`
   : off,
  cfg.limits.minBalanceEnabled
   ? `${currencySymbol}${metricNumbers(cfg.limits.minBalance)}`
   : off,
  cfg.loan.enabled ? on : off,
  `${currencySymbol}${metricNumbers(cfg.loan.maxAmount)}`,
  `${cfg.loan.interestPercent}%`,
 );
}

function showPlayerBankHelp(player) {
 refreshBankMeta();
 const form = new MessageFormData()
  .title(Lang.t(player, "bank.help.title"))
  .body(buildMemberBankHelpBody(player))
  .button1(Lang.t(player, "bank.help.btn.ok"))
  .button2(Lang.t(player, "bank.help.btn.back"));
 form
  .show(player)
  .then(() => Bank(player))
  .catch(() => Bank(player));
}

function handleBankTransfer(player) {
 if (blockedByOverdue(player, "transfer")) return Bank(player);
 const onlinePlayers = world
  .getPlayers()
  .filter((p) => p.name !== player.name);
 if (onlinePlayers.length === 0) {
  player.sendMessage(Lang.t(player, "bank.transfer.err.no_players"));
  player.playSound("note.bass");
  return;
 }
 const form = new ActionFormData()
  .title(Lang.t(player, "bank.transfer.title"))
  .body(Lang.t(player, "bank.transfer.body"));
 onlinePlayers.forEach((p) => {
  form.button(p.name, "textures/ui/FriendsIcon.png");
 });
 form.button(Lang.t(player, "bank.transfer.btn.back"), "textures/ui/arrow_left.png");
 form.show(player).then((res) => {
  if (res.canceled) return;
  if (res.selection === onlinePlayers.length) {
   Bank(player);
   return;
  }
  const target = onlinePlayers[res.selection];
  handleBankTransferAmount(player, target);
 });
}

function handleBankTransferAmount(player, target, errorMsg = "") {
 const bank = getBank(player);
 if (bank <= 0n) {
  player.sendMessage(Lang.t(player, "bank.transfer.err.empty"));
  player.playSound("note.bass");
  return;
 }
 const cfg = getBankConfig();
 const feePct = isRealBankMode() ? cfg.fees.transferPercent : 0;
 const feeHint =
  feePct > 0
   ? `\n${Lang.t(player, "bank.transfer.fee_hint", `${feePct}%`)}`
   : "";
 const infoText = `${Lang.t(player, "bank.transfer.to", target.name)}\n${Lang.t(player, "bank.transfer.your_bank", `${currencySymbol}${metricNumbers(bank.toString())}`)}${feeHint}`;
 const form = new ModalFormData()
  .title(Lang.t(player, "bank.transfer.title"))
  .textField("Info", infoText + (errorMsg ? `\n§c${errorMsg}` : ""), {
   defaultValue: infoText + (errorMsg ? `\n§c${errorMsg}` : ""),
   placeholder: "Info",
   disabled: true,
  })
  .textField(Lang.t(player, "bank.transfer.amount"), Lang.t(player, "bank.transfer.amount.ph"), {
   defaultValue: "",
   placeholder: Lang.t(player, "bank.transfer.amount.ph"),
  })
  .toggle(Lang.t(player, "bank.transfer.confirm"), { defaultValue: true });
 form.show(player).then((result) => {
  if (!result || result.canceled) {
   Bank(player);
   return;
  }
  const amount = parseAmountInput(result.formValues[1]);
  if (amount === null) {
   handleBankTransferAmount(player, target, Lang.t(player, "bank.err.invalid_amount"));
   return;
  }
  const fee = calcPercentFee(amount, feePct);
  const total = amount + fee;
  if (total > bank) {
   handleBankTransferAmount(
    player,
    target,
    Lang.t(
     player,
     "bank.transfer.err.insufficient",
     `${currencySymbol}${metricNumbers(bank.toString())}`,
     fee > 0n ? `${currencySymbol}${metricNumbers(fee.toString())}` : "0",
    ),
   );
   return;
  }
  const minBal = getMinBalanceRequired();
  if (bank - total < minBal) {
   handleBankTransferAmount(
    player,
    target,
    Lang.t(player, "bank.err.min_balance", `${currencySymbol}${metricNumbers(minBal.toString())}`),
   );
   return;
  }
  const stillOnline = world.getPlayers().find((p) => p.name === target.name);
  if (!stillOnline) {
   player.sendMessage(Lang.t(player, "bank.transfer.err.offline"));
   Bank(player);
   return;
  }
  removeBank(player, total);
  addBank(stillOnline, amount);
  addTransaction(
   player,
   `- ${currencySymbol}${metricNumbers(amount.toString())} to ${target.name}${fee > 0n ? ` (fee ${metricNumbers(fee.toString())})` : ""} | ${getCurrentTimeWithOffset()}`,
  );
  addTransaction(
   stillOnline,
   `+ ${currencySymbol}${metricNumbers(amount.toString())} from ${player.name} | ${getCurrentTimeWithOffset()}`,
  );
  player.sendMessage(
   Lang.t(
    player,
    "bank.transfer.success",
    `${currencySymbol}${metricNumbers(amount.toString())}`,
    target.name,
    fee > 0n ? `${currencySymbol}${metricNumbers(fee.toString())}` : "0",
   ),
  );
  stillOnline.sendMessage(
   Lang.t(
    stillOnline,
    "bank.transfer.received",
    `${currencySymbol}${metricNumbers(amount.toString())}`,
    player.name,
   ),
  );
  player.playSound("random.levelup");
  stillOnline.playSound("random.levelup");
  Bank(player);
 });
}

function doDeposit(player, amount) {
 const money = getMoney(player);
 const cfg = getBankConfig();
 const feePct = isRealBankMode() ? cfg.fees.depositPercent : 0;
 const fee = calcPercentFee(amount, feePct);
 const total = amount + fee;
 if (total > money) {
  player.sendMessage(
   Lang.t(
    player,
    "bank.deposit.err.insufficient",
    `${currencySymbol}${metricNumbers(money.toString())}`,
    fee > 0n ? `${currencySymbol}${metricNumbers(fee.toString())}` : "0",
   ),
  );
  return false;
 }
 if (!removeMoney(player, total)) {
  player.sendMessage(Lang.t(player, "bank.err.payment_failed"));
  return false;
 }
 addBank(player, amount);
 player.sendMessage(
  Lang.t(
   player,
   "bank.deposit.success",
   `${currencySymbol}${metricNumbers(amount.toString())}`,
   fee > 0n ? `${currencySymbol}${metricNumbers(fee.toString())}` : "0",
  ),
 );
 addTransaction(
  player,
  `+ ${currencySymbol}${metricNumbers(amount.toString())}${fee > 0n ? ` (fee ${metricNumbers(fee.toString())})` : ""} | ${getCurrentTimeWithOffset()}`,
 );
 player.playSound("random.levelup");
 return true;
}

function handleDeposit(player) {
 const money = getMoney(player);
 const bank = getBank(player);
 const cfg = getBankConfig();
 const feePct = isRealBankMode() ? cfg.fees.depositPercent : 0;
 const feeHint =
  feePct > 0 ? `\n${Lang.t(player, "bank.deposit.fee_hint", `${feePct}%`)}` : "";
 const form = new ActionFormData()
  .title(Lang.t(player, "bank.deposit.title"))
  .body(
   Lang.t(
    player,
    "bank.deposit.body",
    `${currencySymbol}${formatMoneyValue(money)}`,
    `${currencySymbol}${formatMoneyValue(bank)}`,
   ) + feeHint,
  )
  .button(Lang.t(player, "bank.deposit.btn.custom"), "textures/ui/settings_glyph_color_2x.png")
  .button(`§a${currencySymbol}100`, "textures/ui/icon_map.png")
  .button(`§a${currencySymbol}1,000`, "textures/ui/icon_map.png")
  .button(`§a${currencySymbol}10,000`, "textures/ui/icon_map.png")
  .button(`§a${currencySymbol}100,000`, "textures/ui/icon_map.png")
  .button(`§a${currencySymbol}1,000,000`, "textures/ui/icon_map.png")
  .button(Lang.t(player, "bank.deposit.btn.percent_25"), "textures/ui/book_back.png")
  .button(Lang.t(player, "bank.deposit.btn.percent_50"), "textures/ui/book_back.png")
  .button(Lang.t(player, "bank.deposit.btn.all"), "textures/ui/icon_map.png")
  .button(Lang.t(player, "bank.deposit.btn.cancel"), "textures/ui/cancel.png");
 form
  .show(player)
  .then((res) => {
   if (res.canceled || res.selection === 9) return;
   try {
    let amount = 0n;
    switch (res.selection) {
     case 0:
      handleCustomDeposit(player);
      return;
     case 1:
      amount = 100n;
      break;
     case 2:
      amount = 1000n;
      break;
     case 3:
      amount = 10000n;
      break;
     case 4:
      amount = 100000n;
      break;
     case 5:
      amount = 1000000n;
      break;
     case 6:
      amount = money / 4n;
      break;
     case 7:
      amount = money / 2n;
      break;
     case 8: {
      if (feePct > 0) {
       amount = (money * 100n) / (100n + BigInt(feePct));
      } else {
       amount = money;
      }
      break;
     }
    }
    if (amount <= 0n) {
     player.sendMessage(Lang.t(player, "bank.deposit.err.none"));
     return;
    }
    doDeposit(player, amount);
   } catch {
    player.sendMessage(Lang.t(player, "bank.err.process_deposit"));
   }
  })
  .catch(() => {
   player.sendMessage(Lang.t(player, "bank.err.deposit_menu"));
  });
}

function handleCustomDeposit(player) {
 const money = getMoney(player);
 const bank = getBank(player);
if (money <= 0n) {
  player.sendMessage(Lang.t(player, "bank.deposit.err.none"));
  return;
}
 const cfg = getBankConfig();
 const feePct = isRealBankMode() ? cfg.fees.depositPercent : 0;
 const feeHint =
  feePct > 0 ? `\n${Lang.t(player, "bank.deposit.fee_hint", `${feePct}%`)}` : "";
 const form = new ModalFormData()
  .title(Lang.t(player, "bank.deposit.custom.title"))
  .textField(
   Lang.t(
    player,
    "bank.deposit.custom.label",
    `${currencySymbol}${formatMoneyValue(money)}`,
    `${currencySymbol}${formatMoneyValue(bank)}`,
   ) + feeHint,
   Lang.t(player, "bank.deposit.custom.ph"),
   { defaultValue: "", placeholder: Lang.t(player, "bank.deposit.custom.ph") },
  )
  .toggle(Lang.t(player, "bank.deposit.custom.confirm"), { defaultValue: true });
 form.show(player).then((res) => {
  if (!res || res.canceled) {
   handleDeposit(player);
   return;
  }
  try {
   const amount = parseAmountInput(res.formValues[0]);
   if (amount === null) {
    player.sendMessage(Lang.t(player, "bank.err.invalid_amount"));
    handleDeposit(player);
    return;
   }
   doDeposit(player, amount);
   handleDeposit(player);
  } catch {
   player.sendMessage(Lang.t(player, "bank.err.invalid_amount"));
   handleDeposit(player);
  }
 });
}

function doWithdraw(player, amount) {
 const bank = getBank(player);
 const cfg = getBankConfig();
 const feePct = isRealBankMode() ? cfg.fees.withdrawPercent : 0;
 const fee = calcPercentFee(amount, feePct);
 const total = amount + fee;
 if (total > bank) {
  player.sendMessage(
   Lang.t(
    player,
    "bank.withdraw.err.insufficient",
    `${currencySymbol}${metricNumbers(bank.toString())}`,
    fee > 0n ? `${currencySymbol}${metricNumbers(fee.toString())}` : "0",
   ),
  );
  return false;
 }
 const minBal = getMinBalanceRequired();
 if (bank - total < minBal) {
  player.sendMessage(
   Lang.t(player, "bank.err.min_balance", `${currencySymbol}${metricNumbers(minBal.toString())}`),
  );
  return false;
 }
 const dailyLeft = getRemainingDailyWithdraw(player);
 if (dailyLeft !== null && amount > dailyLeft) {
  player.sendMessage(
   Lang.t(
    player,
    "bank.withdraw.err.daily_limit",
    `${currencySymbol}${metricNumbers(dailyLeft.toString())}`,
   ),
  );
  return false;
 }
 if (!removeBank(player, total)) {
  player.sendMessage(Lang.t(player, "bank.withdraw.err.insufficient", `${currencySymbol}${metricNumbers(bank.toString())}`, "0"));
  return false;
 }
 addMoney(player, amount);
 if (dailyLeft !== null) addDailyWithdrawn(player, amount);
 player.sendMessage(
  Lang.t(
   player,
   "bank.withdraw.success",
   `${currencySymbol}${metricNumbers(amount.toString())}`,
   fee > 0n ? `${currencySymbol}${metricNumbers(fee.toString())}` : "0",
  ),
 );
 addTransaction(
  player,
  `- ${currencySymbol}${metricNumbers(amount.toString())}${fee > 0n ? ` (fee ${metricNumbers(fee.toString())})` : ""} | ${getCurrentTimeWithOffset()}`,
 );
 player.playSound("random.levelup");
 return true;
}

function handleWithdraw(player) {
 if (blockedByOverdue(player, "withdraw")) return Bank(player);
 const money = getMoney(player);
 const bank = getBank(player);
 if (bank <= 0n) {
  player.sendMessage(Lang.t(player, "bank.withdraw.err.empty"));
  return;
 }
 const cfg = getBankConfig();
 const feePct = isRealBankMode() ? cfg.fees.withdrawPercent : 0;
 const feeHint =
  feePct > 0 ? `\n${Lang.t(player, "bank.withdraw.fee_hint", `${feePct}%`)}` : "";
 const form = new ActionFormData()
  .title(Lang.t(player, "bank.withdraw.title"))
  .body(
   Lang.t(
    player,
    "bank.withdraw.body",
    `${currencySymbol}${formatMoneyValue(money)}`,
    `${currencySymbol}${formatMoneyValue(bank)}`,
   ) + feeHint,
  )
  .button(Lang.t(player, "bank.withdraw.btn.custom"), "textures/ui/settings_glyph_color_2x.png")
  .button(`§a${currencySymbol}100`, "textures/ui/icon_book_writable.png")
  .button(`§a${currencySymbol}1,000`, "textures/ui/icon_book_writable.png")
  .button(`§a${currencySymbol}10,000`, "textures/ui/icon_book_writable.png")
  .button(`§a${currencySymbol}100,000`, "textures/ui/icon_book_writable.png")
  .button(`§a${currencySymbol}1,000,000`, "textures/ui/icon_book_writable.png")
  .button(Lang.t(player, "bank.withdraw.btn.percent_25"), "textures/ui/book_back.png")
  .button(Lang.t(player, "bank.withdraw.btn.percent_50"), "textures/ui/book_back.png")
  .button(Lang.t(player, "bank.withdraw.btn.all"), "textures/ui/icon_book_writable.png")
  .button(Lang.t(player, "bank.withdraw.btn.cancel"), "textures/ui/cancel.png");
 form
  .show(player)
  .then((res) => {
   if (res.canceled || res.selection === 9) return;
   try {
    let amount = 0n;
    switch (res.selection) {
     case 0:
      handleCustomWithdraw(player);
      return;
     case 1:
      amount = 100n;
      break;
     case 2:
      amount = 1000n;
      break;
     case 3:
      amount = 10000n;
      break;
     case 4:
      amount = 100000n;
      break;
     case 5:
      amount = 1000000n;
      break;
     case 6:
      amount = bank / 4n;
      break;
     case 7:
      amount = bank / 2n;
      break;
     case 8: {
      const minBal = getMinBalanceRequired();
      let available = bank - minBal;
      if (available < 0n) available = 0n;
      if (feePct > 0) {
       amount = (available * 100n) / (100n + BigInt(feePct));
      } else {
       amount = available;
      }
      break;
     }
    }
    if (amount <= 0n) {
     player.sendMessage(Lang.t(player, "bank.withdraw.err.empty"));
     return;
    }
    doWithdraw(player, amount);
   } catch {
    player.sendMessage(Lang.t(player, "bank.err.process_withdraw"));
   }
  })
  .catch(() => {
   player.sendMessage(Lang.t(player, "bank.err.withdraw_menu"));
  });
}

function handleCustomWithdraw(player) {
 const money = getMoney(player);
 const bank = getBank(player);
 if (bank <= 0n) {
  player.sendMessage(Lang.t(player, "bank.withdraw.err.empty"));
  return;
 }
 const cfg = getBankConfig();
 const feePct = isRealBankMode() ? cfg.fees.withdrawPercent : 0;
 const feeHint =
  feePct > 0 ? `\n${Lang.t(player, "bank.withdraw.fee_hint", `${feePct}%`)}` : "";
 const form = new ModalFormData()
  .title(Lang.t(player, "bank.withdraw.custom.title"))
  .textField(
   Lang.t(
    player,
    "bank.withdraw.custom.label",
    `${currencySymbol}${formatMoneyValue(money)}`,
    `${currencySymbol}${formatMoneyValue(bank)}`,
   ) + feeHint,
   Lang.t(player, "bank.withdraw.custom.ph"),
   { defaultValue: "", placeholder: Lang.t(player, "bank.withdraw.custom.ph") },
  )
  .toggle(Lang.t(player, "bank.withdraw.custom.confirm"), { defaultValue: true });
 form.show(player).then((res) => {
  if (!res || res.canceled) {
   handleWithdraw(player);
   return;
  }
  try {
   const amount = parseAmountInput(res.formValues[0]);
   if (amount === null) {
    player.sendMessage(Lang.t(player, "bank.err.invalid_amount"));
    handleWithdraw(player);
    return;
   }
   doWithdraw(player, amount);
   handleWithdraw(player);
  } catch {
   player.sendMessage(Lang.t(player, "bank.err.invalid_amount"));
   handleWithdraw(player);
  }
 });
}

function handleLoanMenu(player) {
 const cfg = getBankConfig();
 if (!isRealBankMode() || !cfg.loan.enabled) {
  player.sendMessage(Lang.t(player, "bank.loan.err.disabled"));
  return Bank(player);
 }
 tryApplyLoanFines(player, true);
 const loan = getLoan(player);
 const money = getMoney(player);
 const form = new ActionFormData().title(Lang.t(player, "bank.loan.title"));
 if (loan) {
  const status = getLoanStatus(player, cfg);
  const dueLine = status
   ? status.overdue
     ? Lang.t(player, "bank.loan.line.overdue", formatDuration(player, status.msOverdue))
     : Lang.t(player, "bank.loan.line.due", formatDuration(player, status.msRemaining))
   : "";
  form
   .body(
    `${Lang.t(
     player,
     "bank.loan.body.active",
     `${currencySymbol}${metricNumbers(loan.principal.toString())}`,
     `${currencySymbol}${metricNumbers(loan.owed.toString())}`,
     `${currencySymbol}${formatMoneyValue(money)}`,
    )}\n${dueLine}`,
   )
   .button(Lang.t(player, "bank.loan.btn.repay"), "textures/ui/confirm")
   .button(Lang.t(player, "bank.loan.btn.help"), "textures/ui/icon_book_writable")
   .button(Lang.t(player, "bank.loan.btn.back"), "textures/ui/arrow_left");
  form.show(player).then((res) => {
   if (res.canceled || res.selection === 2) return Bank(player);
   if (res.selection === 1) return showLoanHelp(player);
   handleLoanRepay(player);
  });
  return;
 }
 form
  .body(
   Lang.t(
    player,
    "bank.loan.body.available",
    `${currencySymbol}${metricNumbers(String(cfg.loan.maxAmount))}`,
    `${cfg.loan.interestPercent}%`,
    `${currencySymbol}${formatMoneyValue(money)}`,
    String(cfg.loan.dueDays),
   ),
  )
  .button(Lang.t(player, "bank.loan.btn.borrow"), "textures/ui/MCoin")
  .button(Lang.t(player, "bank.loan.btn.help"), "textures/ui/icon_book_writable")
  .button(Lang.t(player, "bank.loan.btn.back"), "textures/ui/arrow_left");
 form.show(player).then((res) => {
  if (res.canceled || res.selection === 2) return Bank(player);
  if (res.selection === 1) return showLoanHelp(player);
  handleLoanBorrow(player);
 });
}

/** Tutorial pinjaman versi member: bahasa sederhana, angka diambil dari pengaturan aktif. */
export function buildLoanHelpBody(player) {
 const cfg = getBankConfig();
 const od = cfg.loan.overdue;
 refreshBankMeta();
 const punishments = [];
 if (od.blindnessSeconds > 0) {
  punishments.push(Lang.t(player, "bank.loan.help.punish.blind", String(od.blindnessSeconds)));
 }
 if (od.slowness) punishments.push(Lang.t(player, "bank.loan.help.punish.slow"));
 if (od.nausea) punishments.push(Lang.t(player, "bank.loan.help.punish.nausea"));
 if (od.weakness) punishments.push(Lang.t(player, "bank.loan.help.punish.weak"));
 if (od.blockWithdraw) punishments.push(Lang.t(player, "bank.loan.help.punish.no_withdraw"));
 if (od.blockTransfer) punishments.push(Lang.t(player, "bank.loan.help.punish.no_transfer"));
 if (!punishments.length) punishments.push(Lang.t(player, "bank.loan.help.punish.none"));

 return Lang.t(
  player,
  "bank.loan.help.body",
  `${currencySymbol}${metricNumbers(String(cfg.loan.maxAmount))}`,
  `${cfg.loan.interestPercent}%`,
  String(cfg.loan.dueDays),
  od.enabled ? `${od.finePercent}%` : Lang.t(player, "common.disabled"),
  String(od.fineIntervalHours),
  String(Math.floor(od.effectIntervalSeconds / 60)),
  punishments.join("\n"),
  `${od.maxTotalFinePercent}%`,
 );
}

function showLoanHelp(player) {
 const form = new ActionFormData()
  .title(Lang.t(player, "bank.loan.help.title"))
  .body(buildLoanHelpBody(player))
  .button(Lang.t(player, "bank.loan.btn.back"), "textures/ui/arrow_left");
 form.show(player).then(() => handleLoanMenu(player));
}

function handleLoanBorrow(player) {
 const cfg = getBankConfig();
 if (getLoan(player)) {
  player.sendMessage(Lang.t(player, "bank.loan.err.active"));
  return handleLoanMenu(player);
 }
 const form = new ModalFormData()
  .title(Lang.t(player, "bank.loan.borrow.title"))
  .textField(
   Lang.t(
    player,
    "bank.loan.borrow.label",
    `${currencySymbol}${metricNumbers(String(cfg.loan.maxAmount))}`,
    `${cfg.loan.interestPercent}%`,
   ),
   Lang.t(player, "bank.loan.borrow.ph"),
   { defaultValue: "", placeholder: Lang.t(player, "bank.loan.borrow.ph") },
  )
  .toggle(Lang.t(player, "bank.loan.borrow.confirm"), { defaultValue: true });
 form.show(player).then((res) => {
  if (!res || res.canceled) return handleLoanMenu(player);
  const amount = parseAmountInput(res.formValues[0]);
  if (amount === null) {
   player.sendMessage(Lang.t(player, "bank.err.invalid_amount"));
   return handleLoanBorrow(player);
  }
  if (amount > BigInt(cfg.loan.maxAmount)) {
   player.sendMessage(
    Lang.t(
     player,
     "bank.loan.err.max",
     `${currencySymbol}${metricNumbers(String(cfg.loan.maxAmount))}`,
    ),
   );
   return handleLoanBorrow(player);
  }
  const owed = calcLoanOwed(amount, cfg.loan.interestPercent);
  const borrowedAt = Date.now();
  setLoan(player, {
   principal: amount,
   owed,
   borrowedAt,
   dueAt: borrowedAt + cfg.loan.dueDays * DAY_MS,
   lastFineAt: 0,
   finePercentApplied: 0,
  });
  addMoney(player, amount);
  addTransaction(
   player,
   `+ LOAN ${currencySymbol}${metricNumbers(amount.toString())} (owed ${metricNumbers(owed.toString())}) | ${getCurrentTimeWithOffset()}`,
  );
  player.sendMessage(
   Lang.t(
    player,
    "bank.loan.borrow.success",
    `${currencySymbol}${metricNumbers(amount.toString())}`,
    `${currencySymbol}${metricNumbers(owed.toString())}`,
    String(cfg.loan.dueDays),
   ),
  );
  player.playSound("random.levelup");
  Bank(player);
 });
}

function handleLoanRepay(player) {
 tryApplyLoanFines(player, true);
 const loan = getLoan(player);
 if (!loan) {
  player.sendMessage(Lang.t(player, "bank.loan.err.none"));
  return Bank(player);
 }
 const money = getMoney(player);
 if (money < loan.owed) {
  player.sendMessage(
   Lang.t(
    player,
    "bank.loan.err.repay_funds",
    `${currencySymbol}${metricNumbers(loan.owed.toString())}`,
    `${currencySymbol}${formatMoneyValue(money)}`,
   ),
  );
  player.playSound("note.bass");
  return handleLoanMenu(player);
 }
 if (!removeMoney(player, loan.owed)) {
  player.sendMessage(Lang.t(player, "bank.err.payment_failed"));
  return handleLoanMenu(player);
 }
 const paid = loan.owed;
 setLoan(player, null);
 addTransaction(
  player,
  `- LOAN REPAY ${currencySymbol}${metricNumbers(paid.toString())} | ${getCurrentTimeWithOffset()}`,
 );
 player.sendMessage(
  Lang.t(player, "bank.loan.repay.success", `${currencySymbol}${metricNumbers(paid.toString())}`),
 );
 player.playSound("random.levelup");
 Bank(player);
}

function showTransactions(player) {
 const money = getMoney(player);
 const bank = getBank(player);
 const transactions = getTransactions(player);
 const form = new ActionFormData()
  .title(Lang.t(player, "bank.transactions.title"))
  .body(
   Lang.t(
    player,
    "bank.transactions.body",
    `${currencySymbol}${formatMoneyValue(money)}`,
    `${currencySymbol}${formatMoneyValue(bank)}`,
    transactions.length > 0 ? transactions.join("\n") : Lang.t(player, "bank.transactions.empty"),
   ),
  )
  .button(Lang.t(player, "bank.transactions.btn.back"), "textures/ui/arrow_dark_left_stretch.png");
 form
  .show(player)
  .then(() => Bank(player))
  .catch(() => {
   player.sendMessage(Lang.t(player, "bank.err.transactions"));
  });
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
 if (!isMemberFeatureEnabled("bank")) return;
 migrateBankIfNeeded(player);
 // Only on join (not death respawn) — lightweight + docs: prefer events
 if (initialSpawn) {
  tryApplyInterest(player, true);
  tryApplyLoanFines(player, true);
 }
});
