import { ActionFormData, ModalFormData, MessageFormData } from './core.js';
import { world, system } from "./core.js";
import { metricNumbers } from "./lib/game.js";
import { Lang } from "./lib/Lang.js";
import { GlobalConfig } from "./function/GlobalConfig.js";
import { getFullMoney, setMoney, addMoney, removeMoney } from "./function/moneySystem.js";

const CURRENCY_CONFIG = {
 money: { icon: "textures/ui/icon_book_writable", prefix: "$", objective: "money", property: "money_balance_string" },
 coin: { icon: "textures/ui/icon_book_writable", prefix: "¤", objective: "coin", property: "coin_balance_string" }
};

const getCurrencyConfig = () => {
 try {
 const cfg = GlobalConfig.get("currency:config");
 return cfg ? { ...CURRENCY_CONFIG, ...(typeof cfg === 'string' ? JSON.parse(cfg) : cfg) } : CURRENCY_CONFIG;
 } catch { return CURRENCY_CONFIG; }
};

const saveCurrencyConfig = (cfg) => GlobalConfig.set("currency:config", cfg);

const getCurrencyKeys = () => Object.keys(getCurrencyConfig());

const getFullCurrency = (player, key) => {
 const cfg = getCurrencyConfig()[key];
 if (!cfg) return 0n;
 if (key === "money") return getFullMoney(player);
 const prop = player.getDynamicProperty(cfg.property);
 if (prop !== undefined) return BigInt(prop);
 try {
 const score = world.scoreboard.getObjective(cfg.objective)?.getScore(player.scoreboardIdentity) || 0;
 const amount = BigInt(Math.max(score, 0));
 if (amount > 0n) player.setDynamicProperty(cfg.property, amount.toString());
 return amount;
 } catch {
 return 0n;
 }
};

const setCurrency = (player, key, amount) => {
 const cfg = getCurrencyConfig()[key];
 if (!cfg || amount < 0n) return false;
 if (key === "money") return setMoney(player, amount);
 player.setDynamicProperty(cfg.property, amount.toString());

 try {
 const obj = world.scoreboard.getObjective(cfg.objective) ?? world.scoreboard.addObjective(cfg.objective, cfg.objective);
 const scoreAmount = amount > BigInt(2e9) ? 2e9 : Number(amount);
 obj.setScore(player, scoreAmount);
 } catch (e) { console.warn(`[CURRENCY] Failed to sync ${key} to scoreboard:`, e); }
 return true;
};

const addCurrency = (player, key, amount) => {
 if (amount <= 0n) return false;
 if (key === "money") return addMoney(player, amount);
 return setCurrency(player, key, getFullCurrency(player, key) + amount);
};

const removeCurrency = (player, key, amount) => {
 if (amount <= 0n) return false;
 if (key === "money") return removeMoney(player, amount);
 const current = getFullCurrency(player, key);
 if (current < amount) return false;
 return setCurrency(player, key, current - amount);
};

const formatCurrency = (amount, prefix) => `${prefix}${metricNumbers(amount.toString())}`;
const formatFullCurrency = (amount, prefix) => `${prefix}${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const parseCurrencyAmount = (value) => {
 const text = String(value ?? "").trim();
 if (!/^\d+$/.test(text)) return null;
 const amount = BigInt(text);
 return amount > 0n ? amount : null;
};

const msgs = {
 err: (p, k, ...a) => `{"rawtext":[{"text":"§c✖ §7${Lang.t(p, k, ...a)}"}]}`,
 ok: (p, k, ...a) => `{"rawtext":[{"text":"§a✓ ${Lang.t(p, k, ...a)}"}]}`,
 nf: (p, k, ...a) => `{"rawtext":[{"text":"${Lang.t(p, k, ...a)}"}]}`
};

const jsonText = (text) => String(text ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const moneyMessage = {
 sent: (amount, targetName) => `{"rawtext":[{"text":"§a✓ §fSent §a${jsonText(amount)} §fto §e${jsonText(targetName)}"}]}`,
 removed: (amount, targetName) => `{"rawtext":[{"text":"§c- §fRemoved §c${jsonText(amount)} §ffrom §e${jsonText(targetName)}"}]}`,
 received: (amount, sourceName) => `{"rawtext":[{"text":"§a+ §a${jsonText(amount)} §ffrom §e${jsonText(sourceName)}"}]}`,
 deducted: (amount, sourceName) => `{"rawtext":[{"text":"§c- §c${jsonText(amount)} §fby §e${jsonText(sourceName)}"}]}`
};

const showMoneyMenu = (player) => {
 const currencies = getCurrencyKeys();
 const cfg = getCurrencyConfig();
 const form = new ActionFormData()
 .title(Lang.t(player, "money.menu.title"))
 .body(Lang.t(player, "money.menu.body"));

 currencies.forEach(k => form.button(`${cfg[k].prefix} ${k.charAt(0).toUpperCase() + k.slice(1)}`, cfg[k].icon));
 form.button(Lang.t(player, "money.btn.manage_currencies"), "textures/ui/icon_setting");

 form.show(player).then(({ selection, canceled }) => {
 if (canceled) return;
 if (selection === currencies.length) return showCurrencyManager(player);
 showCurrencyMenu(player, currencies[selection]);
 });
};

const showCurrencyMenu = (player, currencyKey) => {
 const cfg = getCurrencyConfig()[currencyKey];
 new ActionFormData()
 .title(`${cfg.prefix} ${currencyKey.charAt(0).toUpperCase() + currencyKey.slice(1)}`)
 .body(Lang.t(player, "money.menu.body"))
 .button(Lang.t(player, "money.btn.view"), "textures/ui/icon_book_writable")
 .button(Lang.t(player, "money.btn.add"), "textures/ui/color_plus")
 .button(Lang.t(player, "money.btn.remove"), "textures/ui/icon_trash")
 .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
 .show(player)
 .then(({ selection, canceled }) => {
 if (canceled) return;
 [() => showAllBalances(player, currencyKey), () => showTransactionMenu(player, currencyKey, true), () => showTransactionMenu(player, currencyKey, false), showMoneyMenu][selection]?.(player);
 });
};

const showAllBalances = (player, currencyKey) => {
 const cfg = getCurrencyConfig()[currencyKey];
 const onlinePlayers = new Map([...world.getPlayers()].map(target => [target.name, target]));
 const balances = new Map();
 try {
 const objective = world.scoreboard.getObjective(cfg.objective);
 if (objective) {
 for (const participant of objective.getParticipants()) {
 balances.set(participant.displayName, BigInt(Math.max(objective.getScore(participant) || 0, 0)));
 }
 }
 } catch { }
 for (const [name, target] of onlinePlayers) {
 balances.set(name, getFullCurrency(target, currencyKey));
 }
 if (!balances.size) return player.runCommand(`tellraw @s ${msgs.err(player, "err.no_player")}`);
 const balanceText = [...balances]
 .map(([name, amount]) => `${onlinePlayers.has(name) ? "§a●" : "§8●"} §e${name}§r: ${formatFullCurrency(amount, cfg.prefix)}`)
 .join("\n");
 new MessageFormData()
 .title(`${cfg.prefix} ${currencyKey.charAt(0).toUpperCase() + currencyKey.slice(1)} Balances`)
 .body(balanceText)
 .button1(Lang.t(player, "common.close"))
 .button2(Lang.t(player, "common.back"))
 .show(player)
 .then(({ selection }) => selection === 1 && showCurrencyMenu(player, currencyKey));
};

const showTransactionMenu = (source, currencyKey, isAdd) => {
 const players = [...world.getPlayers()];
 const names = players.map(p => p.name);
 new ModalFormData()
 .title(Lang.t(source, isAdd ? "money.add.title" : "money.remove.title"))
 .dropdown(Lang.t(source, "money.transaction.select"), names, { defaultValueIndex: 0 })
 .textField(Lang.t(source, "money.transaction.amount"), Lang.t(source, "money.transaction.amount.placeholder"), { defaultValue: "" })
 .show(source)
 .then(({ canceled, formValues }) => {
 if (canceled) return showCurrencyMenu(source, currencyKey);
 handleTransaction(source, names[formValues[0]], formValues[1], currencyKey, isAdd);
 });
};

const handleTransaction = (source, targetName, amountText, currencyKey, isAdd) => {
 const amt = parseCurrencyAmount(amountText);
 if (amt === null) {
 source.runCommand(`tellraw @s ${msgs.err(source, "err.invalid_amount")}`);
 source.runCommand("playsound note.bass @s ~~~ 1 0.5");
 return showCurrencyMenu(source, currencyKey);
 }
 const target = [...world.getPlayers()].find(p => p.name === targetName);
 if (!target) {
 source.runCommand(`tellraw @s ${msgs.err(source, "err.player_not_found")}`);
 return showCurrencyMenu(source, currencyKey);
 }
 const success = isAdd ? addCurrency(target, currencyKey, amt) : removeCurrency(target, currencyKey, amt);
 if (!success) return showCurrencyMenu(source, currencyKey);

 const cfg = getCurrencyConfig()[currencyKey];
 const fmtAmt = formatCurrency(amt, cfg.prefix);
 source.runCommand(`tellraw @s ${isAdd ? moneyMessage.sent(fmtAmt, targetName) : moneyMessage.removed(fmtAmt, targetName)}`);
 target.runCommand(`tellraw @s ${isAdd ? moneyMessage.received(fmtAmt, source.name) : moneyMessage.deducted(fmtAmt, source.name)}`);
 source.runCommand("playsound random.levelup @s ~~~ 1 2");

 system.runTimeout(() => {
 const newBal = formatCurrency(getFullCurrency(target, currencyKey), cfg.prefix);
 source.runCommand(`titleraw "${targetName}" actionbar {"rawtext":[{"text":"${cfg.prefix} ${currencyKey}: ${newBal}"}]}`);
 }, 20);
};

const showCurrencyManager = (player) => {
 const cfg = getCurrencyConfig();
 const keys = Object.keys(cfg);
 let body = Lang.t(player, "currency.manager.body");
 keys.forEach(k => body += Lang.t(player, "currency.manager.prefix", cfg[k].prefix, k, cfg[k].objective));

 new ActionFormData()
 .title(Lang.t(player, "currency.manager.title"))
 .body(body)
 .button(Lang.t(player, "currency.add.title"), "textures/ui/color_plus")
 .button(Lang.t(player, "currency.remove.title"), "textures/ui/icon_trash")
 .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
 .show(player)
 .then(({ selection, canceled }) => {
 if (canceled) return;
 [showAddCurrency, showRemoveCurrency, showMoneyMenu][selection]?.(player);
 });
};

const showAddCurrency = (player) => {
 new ModalFormData()
 .title(Lang.t(player, "currency.add.title"))
 .textField(Lang.t(player, "currency.add.id.label"), Lang.t(player, "currency.add.id.placeholder"))
 .textField(Lang.t(player, "currency.add.prefix.label"), Lang.t(player, "currency.add.prefix.placeholder"))
 .textField(Lang.t(player, "currency.add.objective.label"), Lang.t(player, "currency.add.objective.placeholder"))
 .dropdown(Lang.t(player, "currency.add.icon.label"), [
 Lang.t(player, "currency.add.icon.emerald"),
 Lang.t(player, "currency.add.icon.gold_coin"),
 Lang.t(player, "currency.add.icon.diamond"),
 Lang.t(player, "currency.add.icon.star"),
 Lang.t(player, "currency.add.icon.crown")
 ], { defaultValueIndex: 0 })
 .show(player)
 .then(({ canceled, formValues }) => {
 if (canceled) return showCurrencyManager(player);
 const [id, prefix, obj, iconIdx] = formValues;
 if (!id || !prefix || !obj) {
 player.runCommand(`tellraw @s ${msgs.err(player, "err.invalid_input")}`);
 return showCurrencyManager(player);
 }
 const icons = ["textures/ui/icon_book_writable", "textures/ui/icon_book_writable", "textures/ui/icon_book_writable", "textures/ui/icon_book_writable", "textures/ui/icon_book_writable"];
 const cfg = getCurrencyConfig();
 cfg[id.toLowerCase().trim()] = {
 icon: icons[iconIdx] || icons[0],
 prefix: prefix.trim(),
 objective: obj.trim(),
 property: `${obj.trim()}_balance_string`
 };
 saveCurrencyConfig(cfg);
 player.runCommand(`tellraw @s ${msgs.ok(player, "currency.added", id)}`);
 showCurrencyManager(player);
 });
};

const showRemoveCurrency = (player) => {
 const cfg = getCurrencyConfig();
 const keys = Object.keys(cfg);
 if (keys.length <= 1) {
 player.runCommand(`tellraw @s ${msgs.err(player, "err.min_currency")}`);
 return showCurrencyManager(player);
 }
 new ModalFormData()
 .title(Lang.t(player, "currency.remove.title"))
 .dropdown(Lang.t(player, "currency.remove.select"), keys, { defaultValueIndex: 0 })
 .show(player)
 .then(({ canceled, formValues }) => {
 if (canceled) return showCurrencyManager(player);
 const key = keys[formValues[0]];
 delete cfg[key];
 saveCurrencyConfig(cfg);
 player.runCommand(`tellraw @s ${msgs.ok(player, "currency.removed", key)}`);
 showCurrencyManager(player);
 });
};

export { showMoneyMenu };
