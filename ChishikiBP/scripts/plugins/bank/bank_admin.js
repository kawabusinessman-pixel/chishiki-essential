import { ActionFormData, ModalFormData } from "../../core.js";
import { Lang } from "../../lib/Lang.js";
import { metricNumbers } from "../../lib/game.js";
import {
 DEFAULT_BANK_CONFIG,
 getBankConfig,
 saveBankConfig,
 formatIntervalLabel,
 INTEREST_INTERVAL_OPTIONS,
} from "./bank_config.js";
import { showResetBankMenu } from "./resetBank.js";

function onOff(player, enabled) {
 return enabled ? Lang.t(player, "common.enabled") : Lang.t(player, "common.disabled");
}

function statusLine(player, cfg) {
 return Lang.t(
  player,
  "bank.cfg.body",
  cfg.realMode ? Lang.t(player, "bank.cfg.status.on") : Lang.t(player, "bank.cfg.status.off"),
  cfg.interest.enabled ? onOff(player, true) : onOff(player, false),
  cfg.interest.ratePercent,
  formatIntervalLabel(cfg.interest.intervalSeconds),
  cfg.fees.depositPercent,
  cfg.fees.withdrawPercent,
  cfg.fees.transferPercent,
  cfg.limits.dailyWithdrawEnabled
   ? metricNumbers(cfg.limits.dailyWithdrawLimit)
   : onOff(player, false),
  cfg.limits.minBalanceEnabled ? metricNumbers(cfg.limits.minBalance) : onOff(player, false),
  cfg.loan.enabled ? onOff(player, true) : onOff(player, false),
 );
}

/**
 * Admin > Member Set > Advanced Config > Bank
 */
export function showBankAdminMenu(player, onBack) {
 const live = getBankConfig();
 const form = new ActionFormData()
  .title(Lang.t(player, "bank.cfg.title"))
  .body(statusLine(player, live))
  .button(Lang.t(player, "bank.cfg.btn.toggle", live.realMode ? Lang.t(player, "bank.cfg.status.on") : Lang.t(player, "bank.cfg.status.off")), live.realMode ? "textures/ui/toggle_on" : "textures/ui/toggle_off")
  .button(Lang.t(player, "bank.cfg.btn.interest"), "textures/ui/invite_base")
  .button(Lang.t(player, "bank.cfg.btn.fees"), "textures/ui/icon_deals")
  .button(Lang.t(player, "bank.cfg.btn.limits"), "textures/ui/lock_color")
  .button(Lang.t(player, "bank.cfg.btn.loan"), "textures/ui/MCoin")
  .button(Lang.t(player, "bank.cfg.btn.help"), "textures/ui/icon_book_writable")
  .button(Lang.t(player, "bank.cfg.btn.reset_player"), "textures/ui/icon_trash")
  .button(Lang.t(player, "bank.cfg.btn.reset_defaults"), "textures/ui/refresh_light")
  .button(Lang.t(player, "bank.cfg.btn.back"), "textures/ui/arrow_left");

 form.show(player).then((res) => {
  if (res.canceled) {
   if (typeof onBack === "function") onBack();
   return;
  }
  switch (res.selection) {
   case 0: {
    const cfg = getBankConfig();
    const next = {
     ...cfg,
     interest: { ...cfg.interest },
     fees: { ...cfg.fees },
     limits: { ...cfg.limits },
     loan: { ...cfg.loan },
     realMode: !cfg.realMode,
    };
    saveBankConfig(next);
    player.sendMessage(
     next.realMode ? Lang.t(player, "bank.cfg.msg.real_on") : Lang.t(player, "bank.cfg.msg.real_off"),
    );
    player.playSound("random.click");
    showBankAdminMenu(player, onBack);
    break;
   }
   case 1:
    showInterestSettings(player, onBack);
    break;
   case 2:
    showFeeSettings(player, onBack);
    break;
   case 3:
    showLimitSettings(player, onBack);
    break;
   case 4:
    showLoanMenu(player, onBack);
    break;
   case 5:
    showBankHelp(player, onBack);
    break;
   case 6:
    showResetBankMenu(player, () => showBankAdminMenu(player, onBack));
    break;
   case 7:
    confirmResetDefaults(player, onBack);
    break;
   default:
    if (typeof onBack === "function") onBack();
    break;
  }
 });
}

async function showInterestSettings(player, onBack) {
 const cfg = getBankConfig();
 const intervalIdx = Math.max(
  0,
  INTEREST_INTERVAL_OPTIONS.findIndex((o) => o.seconds === cfg.interest.intervalSeconds),
 );
 const labels = INTEREST_INTERVAL_OPTIONS.map((o) => Lang.t(player, o.labelKey));
 const form = new ModalFormData()
  .title(Lang.t(player, "bank.cfg.interest.title"))
  .toggle(Lang.t(player, "bank.cfg.interest.toggle"), { defaultValue: cfg.interest.enabled })
  .slider(Lang.t(player, "bank.cfg.interest.rate"), 1, 20, {
   defaultValue: cfg.interest.ratePercent,
   valueStep: 1,
  })
  .dropdown(Lang.t(player, "bank.cfg.interest.interval"), labels, {
   defaultValueIndex: intervalIdx >= 0 ? intervalIdx : 2,
  })
  .slider(Lang.t(player, "bank.cfg.interest.max_missed"), 1, 72, {
   defaultValue: cfg.interest.maxMissedIntervals,
   valueStep: 1,
  })
  .submitButton(Lang.t(player, "bank.cfg.btn.apply"));

 const res = await form.show(player);
 if (res.canceled) return showBankAdminMenu(player, onBack);
 const [enabled, rate, intervalIndex, maxMissed] = res.formValues;
 saveBankConfig({
  ...cfg,
  interest: {
   enabled: !!enabled,
   ratePercent: rate,
   intervalSeconds:
    INTEREST_INTERVAL_OPTIONS[intervalIndex]?.seconds ??
    DEFAULT_BANK_CONFIG.interest.intervalSeconds,
   maxMissedIntervals: maxMissed,
  },
  fees: { ...cfg.fees },
  limits: { ...cfg.limits },
  loan: { ...cfg.loan },
 });
 player.sendMessage(Lang.t(player, "bank.cfg.msg.saved"));
 player.playSound("random.levelup");
 showBankAdminMenu(player, onBack);
}

async function showFeeSettings(player, onBack) {
 const cfg = getBankConfig();
 const form = new ModalFormData()
  .title(Lang.t(player, "bank.cfg.fees.title"))
  .slider(Lang.t(player, "bank.cfg.fees.deposit"), 0, 50, {
   defaultValue: cfg.fees.depositPercent,
   valueStep: 1,
  })
  .slider(Lang.t(player, "bank.cfg.fees.withdraw"), 0, 50, {
   defaultValue: cfg.fees.withdrawPercent,
   valueStep: 1,
  })
  .slider(Lang.t(player, "bank.cfg.fees.transfer"), 0, 50, {
   defaultValue: cfg.fees.transferPercent,
   valueStep: 1,
  })
  .submitButton(Lang.t(player, "bank.cfg.btn.apply"));

 const res = await form.show(player);
 if (res.canceled) return showBankAdminMenu(player, onBack);
 const [deposit, withdraw, transfer] = res.formValues;
 saveBankConfig({
  ...cfg,
  interest: { ...cfg.interest },
  fees: {
   depositPercent: deposit,
   withdrawPercent: withdraw,
   transferPercent: transfer,
  },
  limits: { ...cfg.limits },
  loan: { ...cfg.loan },
 });
 player.sendMessage(Lang.t(player, "bank.cfg.msg.saved"));
 player.playSound("random.levelup");
 showBankAdminMenu(player, onBack);
}

async function showLimitSettings(player, onBack) {
 const cfg = getBankConfig();
 const form = new ModalFormData()
  .title(Lang.t(player, "bank.cfg.limits.title"))
  .toggle(Lang.t(player, "bank.cfg.limits.daily_toggle"), {
   defaultValue: cfg.limits.dailyWithdrawEnabled,
  })
  .textField(Lang.t(player, "bank.cfg.limits.daily_amount"), "100000", {
   defaultValue: String(cfg.limits.dailyWithdrawLimit),
  })
  .toggle(Lang.t(player, "bank.cfg.limits.min_toggle"), {
   defaultValue: cfg.limits.minBalanceEnabled,
  })
  .textField(Lang.t(player, "bank.cfg.limits.min_amount"), "0", {
   defaultValue: String(cfg.limits.minBalance),
  })
  .submitButton(Lang.t(player, "bank.cfg.btn.apply"));

 const res = await form.show(player);
 if (res.canceled) return showBankAdminMenu(player, onBack);
 const [dailyOn, dailyAmtRaw, minOn, minAmtRaw] = res.formValues;
 const dailyAmt = Math.floor(Number(String(dailyAmtRaw || "").replace(/,/g, "")));
 const minAmt = Math.floor(Number(String(minAmtRaw || "").replace(/,/g, "")));
 if (!Number.isFinite(dailyAmt) || dailyAmt < 1 || !Number.isFinite(minAmt) || minAmt < 0) {
  player.sendMessage(Lang.t(player, "bank.cfg.msg.invalid_number"));
  player.playSound("note.bass");
  return showLimitSettings(player, onBack);
 }
 saveBankConfig({
  ...cfg,
  interest: { ...cfg.interest },
  fees: { ...cfg.fees },
  limits: {
   dailyWithdrawEnabled: !!dailyOn,
   dailyWithdrawLimit: dailyAmt,
   minBalanceEnabled: !!minOn,
   minBalance: minAmt,
  },
  loan: { ...cfg.loan },
 });
 player.sendMessage(Lang.t(player, "bank.cfg.msg.saved"));
 player.playSound("random.levelup");
 showBankAdminMenu(player, onBack);
}

async function showLoanMenu(player, onBack) {
 const cfg = getBankConfig();
 const od = cfg.loan.overdue;
 const form = new ActionFormData()
  .title(Lang.t(player, "bank.cfg.loan.menu.title"))
  .body(
   Lang.t(
    player,
    "bank.cfg.loan.menu.body",
    onOff(player, cfg.loan.enabled),
    metricNumbers(cfg.loan.maxAmount),
    `${cfg.loan.interestPercent}%`,
    String(cfg.loan.dueDays),
    onOff(player, od.enabled),
    `${od.finePercent}%`,
    String(od.fineIntervalHours),
   ),
  )
  .button(Lang.t(player, "bank.cfg.loan.btn.basic"), "textures/ui/MCoin")
  .button(Lang.t(player, "bank.cfg.loan.btn.overdue"), "textures/ui/hammer_l")
  .button(Lang.t(player, "bank.cfg.loan.btn.help"), "textures/ui/icon_book_writable")
  .button(Lang.t(player, "bank.cfg.btn.back"), "textures/ui/arrow_left");

 const res = await form.show(player);
 if (res.canceled) return showBankAdminMenu(player, onBack);
 if (res.selection === 0) return showLoanSettings(player, onBack);
 if (res.selection === 1) return showLoanOverdueSettings(player, onBack);
 if (res.selection === 2) return showLoanHelp(player, onBack);
 return showBankAdminMenu(player, onBack);
}

async function showLoanSettings(player, onBack) {
 const cfg = getBankConfig();
 const form = new ModalFormData()
  .title(Lang.t(player, "bank.cfg.loan.title"))
  .toggle(Lang.t(player, "bank.cfg.loan.toggle"), { defaultValue: cfg.loan.enabled })
  .textField(Lang.t(player, "bank.cfg.loan.max"), "50000", {
   defaultValue: String(cfg.loan.maxAmount),
  })
  .slider(Lang.t(player, "bank.cfg.loan.interest"), 0, 100, {
   defaultValue: cfg.loan.interestPercent,
   valueStep: 1,
  })
  .slider(Lang.t(player, "bank.cfg.loan.due_days"), 1, 90, {
   defaultValue: cfg.loan.dueDays,
   valueStep: 1,
  })
  .submitButton(Lang.t(player, "bank.cfg.btn.apply"));

 const res = await form.show(player);
 if (res.canceled) return showLoanMenu(player, onBack);
 const [enabled, maxRaw, interest, dueDays] = res.formValues;
 const maxAmount = Math.floor(Number(String(maxRaw || "").replace(/,/g, "")));
 if (!Number.isFinite(maxAmount) || maxAmount < 1) {
  player.sendMessage(Lang.t(player, "bank.cfg.msg.invalid_number"));
  player.playSound("note.bass");
  return showLoanSettings(player, onBack);
 }
 saveBankConfig({
  ...cfg,
  interest: { ...cfg.interest },
  fees: { ...cfg.fees },
  limits: { ...cfg.limits },
  loan: {
   ...cfg.loan,
   enabled: !!enabled,
   maxAmount,
   interestPercent: interest,
   dueDays,
   overdue: { ...cfg.loan.overdue },
  },
 });
 player.sendMessage(Lang.t(player, "bank.cfg.msg.saved"));
 player.playSound("random.levelup");
 showLoanMenu(player, onBack);
}

async function showLoanOverdueSettings(player, onBack) {
 const cfg = getBankConfig();
 const od = cfg.loan.overdue;
 const form = new ModalFormData()
  .title(Lang.t(player, "bank.cfg.overdue.title"))
  .toggle(Lang.t(player, "bank.cfg.overdue.toggle"), { defaultValue: od.enabled })
  .slider(Lang.t(player, "bank.cfg.overdue.fine"), 0, 100, {
   defaultValue: od.finePercent,
   valueStep: 1,
  })
  .slider(Lang.t(player, "bank.cfg.overdue.fine_interval"), 1, 168, {
   defaultValue: od.fineIntervalHours,
   valueStep: 1,
  })
  .slider(Lang.t(player, "bank.cfg.overdue.fine_cap"), 0, 1000, {
   defaultValue: Math.min(1000, od.maxTotalFinePercent),
   valueStep: 25,
  })
  .slider(Lang.t(player, "bank.cfg.overdue.effect_interval"), 1, 60, {
   defaultValue: Math.max(1, Math.round(od.effectIntervalSeconds / 60)),
   valueStep: 1,
  })
  .slider(Lang.t(player, "bank.cfg.overdue.blindness"), 0, 30, {
   defaultValue: od.blindnessSeconds,
   valueStep: 1,
  })
  .toggle(Lang.t(player, "bank.cfg.overdue.slowness"), { defaultValue: od.slowness })
  .toggle(Lang.t(player, "bank.cfg.overdue.nausea"), { defaultValue: od.nausea })
  .toggle(Lang.t(player, "bank.cfg.overdue.weakness"), { defaultValue: od.weakness })
  .toggle(Lang.t(player, "bank.cfg.overdue.block_withdraw"), { defaultValue: od.blockWithdraw })
  .toggle(Lang.t(player, "bank.cfg.overdue.block_transfer"), { defaultValue: od.blockTransfer })
  .toggle(Lang.t(player, "bank.cfg.overdue.warn"), { defaultValue: od.warn })
  .submitButton(Lang.t(player, "bank.cfg.btn.apply"));

 const res = await form.show(player);
 if (res.canceled) return showLoanMenu(player, onBack);
 const [
  enabled,
  finePercent,
  fineIntervalHours,
  fineCap,
  effectMinutes,
  blindnessSeconds,
  slowness,
  nausea,
  weakness,
  blockWithdraw,
  blockTransfer,
  warn,
 ] = res.formValues;

 saveBankConfig({
  ...cfg,
  interest: { ...cfg.interest },
  fees: { ...cfg.fees },
  limits: { ...cfg.limits },
  loan: {
   ...cfg.loan,
   overdue: {
    enabled: !!enabled,
    finePercent,
    fineIntervalHours,
    maxTotalFinePercent: fineCap,
    effectIntervalSeconds: Math.max(30, effectMinutes * 60),
    blindnessSeconds,
    slowness: !!slowness,
    nausea: !!nausea,
    weakness: !!weakness,
    blockWithdraw: !!blockWithdraw,
    blockTransfer: !!blockTransfer,
    blockLoan: cfg.loan.overdue.blockLoan,
    warn: !!warn,
   },
  },
 });
 player.sendMessage(Lang.t(player, "bank.cfg.msg.saved"));
 player.playSound("random.levelup");
 showLoanMenu(player, onBack);
}

async function showLoanHelp(player, onBack) {
 const cfg = getBankConfig();
 const od = cfg.loan.overdue;
 const form = new ActionFormData()
  .title(Lang.t(player, "bank.cfg.loan.help.title"))
  .body(
   Lang.t(
    player,
    "bank.cfg.loan.help.body",
    String(cfg.loan.dueDays),
    `${cfg.loan.interestPercent}%`,
    `${od.finePercent}%`,
    String(od.fineIntervalHours),
    `${od.maxTotalFinePercent}%`,
    String(Math.floor(od.effectIntervalSeconds / 60)),
    String(od.blindnessSeconds),
   ),
  )
  .button(Lang.t(player, "bank.cfg.btn.back"), "textures/ui/arrow_left");
 await form.show(player);
 showLoanMenu(player, onBack);
}

async function showBankHelp(player, onBack) {
 const form = new ActionFormData()
  .title(Lang.t(player, "bank.cfg.help.title"))
  .body(Lang.t(player, "bank.cfg.help.full"))
  .button(Lang.t(player, "bank.cfg.help.close"), "textures/ui/arrow_left");
 await form.show(player);
 showBankAdminMenu(player, onBack);
}

async function confirmResetDefaults(player, onBack) {
 const form = new ActionFormData()
  .title(Lang.t(player, "bank.cfg.reset_defaults.title"))
  .body(Lang.t(player, "bank.cfg.reset_defaults.body"))
  .button(Lang.t(player, "bank.cfg.reset_defaults.confirm"), "textures/ui/refresh_light")
  .button(Lang.t(player, "bank.cfg.btn.back"), "textures/ui/arrow_left");
 const res = await form.show(player);
 if (!res.canceled && res.selection === 0) {
  saveBankConfig(DEFAULT_BANK_CONFIG);
  player.sendMessage(Lang.t(player, "bank.cfg.msg.reset_defaults"));
  player.playSound("random.levelup");
 }
 showBankAdminMenu(player, onBack);
}
