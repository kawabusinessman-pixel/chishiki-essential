
import { world, system, ActionFormData, ModalFormData, MessageFormData } from "../../core.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { ForceOpen } from "../../function/ForceOpen.js";
import { Lang } from "../../lib/Lang.js";
import {
 GENDER_ENABLED_KEY,
 GENDER_REQUIRED_KEY,
 getGenderOptionById,
 getGenderOptionIcon,
 getGenderOptions,
 getPlayerGender,
 hasPlayerGender,
 isGenderEnabled,
 isGenderRequired,
 setGenderOptions,
 setPlayerGender,
 clearPlayerGender,
 getGenderStoreStats,
} from "../../function/playerGender.js";

export { getPlayerGender };

const SERVER_LOGS = [];
const ACTIVE_UIS = new Set();
const NEXT_PROMPT_TICK = new Map();
const INVALID_ACCOUNT_PLAYERS = new Set();
const pendingAuth = new Set();
const pendingGender = new Set();
let authCursor = 0;
let genderCursor = 0;
const PROMPT_RETRY_TICKS = 20;
const SPAWN_PROMPT_DELAY_TICKS = 30;
const AUTH_TITLE_MARKER = "§a§u§t§h";
const AUTH_REGISTER_MARKER = "[[auth_register]]";
const AUTH_LOGIN_MARKER = "[[auth_login]]";
const TOGGLE_ON_TEXTURE = "textures/ui/toggle_on";
const TOGGLE_OFF_TEXTURE = "textures/ui/toggle_off";
const GENDER_MENU_TEXTURE = "textures/ui/dressing_room_skins";
const UI_BACK = "textures/ui/arrow_left";
const UI_PLUS = "textures/ui/plus";
const UI_LOCK = "textures/ui/icon_lock";
const UI_PLAYER = "textures/ui/FriendsIcon";

const getAppConfig = () => ({
 adminTag: GlobalConfig.get("cfg:admin_tag") ?? "admin",
 systemDB: GlobalConfig.get("cfg:sys_db") ?? "sys:auth_enabled",
 playerDB: GlobalConfig.get("cfg:plr_db") ?? "player:auth_data",
 sessionDB: GlobalConfig.get("cfg:ses_db") ?? "player:is_logged_in",
});

const getPlayerKey = (player) => player?.id ?? player?.name ?? null;
const buildAuthTitle = (player, modeMarker) => `${AUTH_TITLE_MARKER}${modeMarker}${player.name}`;

function clearPlayerUiState(playerOrId) {
 const key = typeof playerOrId === "string" ? playerOrId : getPlayerKey(playerOrId);
 if (!key) return;
 ACTIVE_UIS.delete(key);
 NEXT_PROMPT_TICK.delete(key);
 INVALID_ACCOUNT_PLAYERS.delete(key);
 pendingAuth.delete(key);
 pendingGender.delete(key);
}

function isLoginActive() {
 return GlobalConfig.get(getAppConfig().systemDB) ?? false;
}

function markPendingGender(player) {
 const key = getPlayerKey(player);
 if (key) pendingGender.add(key);
 wakeLoginHub();
}

function markPendingAuth(player) {
 const key = getPlayerKey(player);
 if (key) pendingAuth.add(key);
 wakeLoginHub();
}

function resolvePendingAuthPlayer(key) {
 for (const player of world.getPlayers()) {
 if (getPlayerKey(player) === key) return player;
 }
 return undefined;
}

function processPendingAuthPlayer(player) {
 const config = getAppConfig();
 const key = getPlayerKey(player);
 if (!player.name || !key) return;

 const isAuthenticated = player.getDynamicProperty(config.sessionDB) ?? false;
 if (isAuthenticated) {
 pendingAuth.delete(key);
 NEXT_PROMPT_TICK.delete(key);
 if (isGenderEnabled() && isGenderRequired() && !hasPlayerGender(player) && canPromptPlayer(player)) {
 promptGenderIfNeeded(player);
 }
 return;
 }

 enforceSecurity(player);
 if (!canPromptPlayer(player)) return;

 const rawAccountData = player.getDynamicProperty(config.playerDB);
 const accountData = parseAccountData(rawAccountData);
 if (rawAccountData && !accountData) {
 if (!INVALID_ACCOUNT_PLAYERS.has(key)) {
 INVALID_ACCOUNT_PLAYERS.add(key);
 addLog(`[AUTH] Invalid account data for ${player.name}, redirecting to register.`);
 }
 } else {
 INVALID_ACCOUNT_PLAYERS.delete(key);
 }

 if (accountData) {
 LoginUI(player, accountData);
 } else {
 RegisterUI(player);
 }
}

function setPromptCooldown(player, ticks = PROMPT_RETRY_TICKS) {
 const key = getPlayerKey(player);
 if (!key) return;
 NEXT_PROMPT_TICK.set(key, system.currentTick + ticks);
}

function canPromptPlayer(player) {
 const key = getPlayerKey(player);
 if (!key || ACTIVE_UIS.has(key)) return false;
 return (NEXT_PROMPT_TICK.get(key) ?? 0) <= system.currentTick;
}

function parseAccountData(raw) {
 if (typeof raw !== "string" || !raw.trim()) return null;
 try {
 const parsed = JSON.parse(raw);
 if (!parsed || typeof parsed.u !== "string" || typeof parsed.p !== "string") {
 return null;
 }
 return {
 u: parsed.u,
 p: parsed.p,
 date: typeof parsed.date === "string" ? parsed.date : "",
 };
 } catch {
 return null;
 }
}

function savePlayerGender(player, choice) {
 setPlayerGender(player, choice === "none" ? "none" : choice);
}

function shouldPromptStandaloneGender(player) {
 if (!isGenderEnabled() || !player?.isValid) return false;
 if (hasPlayerGender(player)) return false;
 return !isLoginActive();
}

function processPendingGenderPlayer(player) {
 const key = getPlayerKey(player);
 if (!key || !player?.isValid) {
 if (key) pendingGender.delete(key);
 return;
 }
 if (!shouldPromptStandaloneGender(player)) {
 pendingGender.delete(key);
 return;
 }
 if (!canPromptPlayer(player)) return;
 promptGenderIfNeeded(player, { standalone: true });
}

function processPendingAuthBatch(keys, batchSize) {
 for (let i = 0; i < batchSize; i++) {
 const key = keys[(authCursor + i) % keys.length];
 const player = resolvePendingAuthPlayer(key);
 if (!player) {
 pendingAuth.delete(key);
 continue;
 }
 processPendingAuthPlayer(player);
 }
 return keys.length ? (authCursor + batchSize) % keys.length : 0;
}

function processPendingGenderBatch(keys, batchSize) {
 for (let i = 0; i < batchSize; i++) {
 const key = keys[(genderCursor + i) % keys.length];
 const player = resolvePendingAuthPlayer(key);
 if (!player) {
 pendingGender.delete(key);
 continue;
 }
 processPendingGenderPlayer(player);
 }
 return keys.length ? (genderCursor + batchSize) % keys.length : 0;
}

function refreshAllGenderDisplays() {}

function getGenderOptionButtonIcon(id) {
 return getGenderOptionIcon(id) ?? UI_PLAYER;
}

async function promptGenderIfNeeded(player, options = {}) {
 if (!isGenderEnabled() || !player?.isValid || hasPlayerGender(player)) return;
 await GenderUI(player, options);
}

function notify(player, message) {
 try {
 player.onScreenDisplay.setActionBar(`§b[auth]§r ${message}`);
 } catch {
 try {
 player.sendMessage(`[auth] ${message.replace(/§./g, "")}`);
 } catch {}
 }
}

function playSound(player, sound) {
 try {
 player.playSound(sound);
 } catch {}
}

function addLog(message) {
 const time = new Date().toLocaleTimeString("en-US", { hour12: false });
 SERVER_LOGS.push(`§8[${time}]§r ${message}`);
}

function enforceSecurity(player) {
 try {
 player.addEffect("slowness", 45, { amplifier: 255, showParticles: false });
 player.addEffect("blindness", 45, { amplifier: 255, showParticles: false });
 player.addEffect("weakness", 45, { amplifier: 255, showParticles: false });
 } catch {}
}

function sendWelcomeMessage(player, user, pass) {
 player.sendMessage(
 `\n§b======================================\n§f${Lang.t(player, "login.register.welcome.title")}\n\n§7${Lang.t(player, "login.register.welcome.id")}: §f${user}\n§7${Lang.t(player, "login.register.welcome.pass")}: §f${pass}\n\n§c${Lang.t(player, "login.register.welcome.safe")}\n§b======================================\n`,
 );
}

async function showLockedForm(player, form) {
 const key = getPlayerKey(player);
 if (!key || !player?.isValid) return null;

 ACTIVE_UIS.add(key);
 try {
 return await ForceOpen(player, form);
 } catch (error) {
 console.warn("Auth UI error:", error);
 notify(player, "§cFailed to open auth UI. Retrying...");
 return null;
 } finally {
 ACTIVE_UIS.delete(key);
 setPromptCooldown(player);
 }
}

async function RegisterUI(player) {
 const result = await showLockedForm(
 player,
 new ModalFormData()
 .title(buildAuthTitle(player, AUTH_REGISTER_MARKER))
 .textField(
 Lang.t(player, "login.register.step1"),
 Lang.t(player, "login.register.ph.user"),
 )
 .textField(
 Lang.t(player, "login.register.step2"),
 Lang.t(player, "login.register.ph.pass"),
 )
 .toggle(Lang.t(player, "login.register.agree"), { defaultValue: false })
 .submitButton(Lang.t(player, "login.register.btn")),
 );

 if (!result || result.canceled) return;

 const [rawUser, rawPass, agreed] = result.formValues ?? [];
 const user = typeof rawUser === "string" ? rawUser.trim() : "";
 const pass = typeof rawPass === "string" ? rawPass.trim() : "";

 if (!agreed || !user || !pass) {
 notify(player, Lang.t(player, "login.notify.register_fail"));
 playSound(player, "mob.villager.no");
 setPromptCooldown(player, 10);
 return;
 }

 const config = getAppConfig();
 const account = { u: user, p: pass, date: new Date().toLocaleDateString() };

 system.run(() => {
 try {
 player.setDynamicProperty(config.playerDB, JSON.stringify(account));
 player.setDynamicProperty(config.sessionDB, true);
 pendingAuth.delete(getPlayerKey(player));
 notify(player, Lang.t(player, "login.notify.register_ok"));
 playSound(player, "random.levelup");
 sendWelcomeMessage(player, user, pass);
 addLog(`[REGISTER] ${player.name} as ${user}`);
 } catch (error) {
 console.warn("Registration save error:", error);
 notify(player, Lang.t(player, "login.notify.save_fail"));
 }
 });
 await promptGenderIfNeeded(player);
}

async function LoginUI(player, accountData) {
 const description = Lang.t(
 player,
 "login.prompt.body",
 player.name,
 accountData.u,
 );

 const result = await showLockedForm(
 player,
 new ModalFormData()
 .title(buildAuthTitle(player, AUTH_LOGIN_MARKER))
 .textField(description, Lang.t(player, "login.prompt.ph"))
 .submitButton(Lang.t(player, "login.prompt.btn")),
 );

 if (!result || result.canceled) return;

 const [rawPass] = result.formValues ?? [];
 const pass = typeof rawPass === "string" ? rawPass.trim() : "";

 if (!pass) {
 notify(player, Lang.t(player, "login.notify.pass_empty"));
 playSound(player, "mob.villager.no");
 setPromptCooldown(player, 10);
 return;
 }

 if (pass === accountData.p) {
 const config = getAppConfig();
 system.run(() => {
 try {
 player.setDynamicProperty(config.sessionDB, true);
 pendingAuth.delete(getPlayerKey(player));
 notify(player, Lang.t(player, "login.notify.login_ok"));
 playSound(player, "random.orb");
 addLog(`[LOGIN] ${player.name} verified.`);
 } catch (error) {
 console.warn("Login completion error:", error);
 notify(player, Lang.t(player, "login.notify.login_fail"));
 }
 });
 await promptGenderIfNeeded(player);
 return;
 }

 notify(player, Lang.t(player, "login.notify.pass_wrong"));
 playSound(player, "mob.villager.no");
 setPromptCooldown(player, 10);
}

function getGenderStatusLabel(player) {
 if (!isGenderEnabled()) return Lang.t(player, "login.admin.gender.off");
 return isGenderRequired()
 ? Lang.t(player, "login.admin.gender.on_required")
 : Lang.t(player, "login.admin.gender.on_optional");
}

function buildGenderBody(player) {
 const required = isGenderRequired();
 const status = hasPlayerGender(player)
 ? Lang.t(player, "login.gender.status.current", getPlayerGender(player))
 : Lang.t(player, "login.gender.status.none");

 return [
 Lang.t(player, "login.gender.welcome", player.name),
 "",
 Lang.t(player, required ? "login.gender.body.required" : "login.gender.body.optional"),
 "",
 Lang.t(player, "login.gender.status.label"),
 status,
 ].join("\n");
}

function getGenderButtonText(player, option, index) {
 const key = `login.gender.btn.${option.id}`;
 const text = Lang.t(player, key);
 if (text !== key) return text.replace(/\[\d+]/, `[${index + 1}]`);
 return Lang.t(player, "login.gender.btn.format", option.id.toUpperCase(), index + 1, option.label.replace(/§./g, ""));
}

function buildGenderForm(player) {
 const required = isGenderRequired();
 const options = getGenderOptions();
 const form = new ActionFormData()
 .title(Lang.t(player, "login.gender.title"))
 .body(buildGenderBody(player))
 .divider();

 options.forEach((option, index) => {
 form.divider().button(getGenderButtonText(player, option, index), getGenderOptionButtonIcon(option.id));
 });

 if (!required) {
 form.divider().button(Lang.t(player, "login.gender.btn.skip"), "textures/ui/cancel");
 }

 return form;
}

async function GenderUI(player, options = {}) {
 const required = isGenderRequired();
 const standalone = options.standalone === true || !isLoginActive();
 const choices = [...getGenderOptions().map((entry) => entry.id)];
 if (!required) choices.push("none");

 while (player?.isValid) {
 const result = await showLockedForm(player, buildGenderForm(player));
 if (!result) return;

 if (result.canceled) {
 if (!required) {
 system.run(() => savePlayerGender(player, "none"));
 pendingGender.delete(getPlayerKey(player));
 return;
 }
 notify(player, Lang.t(player, "login.gender.required"));
 playSound(player, "mob.villager.no");
 if (!standalone) enforceSecurity(player);
 continue;
 }

 const choice = choices[result.selection];
 if (!choice) continue;

 system.run(() => {
 try {
 savePlayerGender(player, choice);
 pendingGender.delete(getPlayerKey(player));
 notify(player, Lang.t(player, "login.gender.saved"));
 playSound(player, "random.orb");
 addLog(`[GENDER] ${player.name} -> ${choice}`);
 } catch (error) {
 console.warn("Gender save error:", error);
 notify(player, Lang.t(player, "login.notify.save_fail"));
 }
 });
 return;
 }
}

export async function AdminDashboardUI(player) {
 const config = getAppConfig();
 const isSystemOn = GlobalConfig.get(config.systemDB) ?? false;
 const statusText = isSystemOn
 ? Lang.t(player, "login.admin.status.on")
 : Lang.t(player, "login.admin.status.off");
 const toggleText = isSystemOn
 ? Lang.t(player, "login.admin.toggle.on")
 : Lang.t(player, "login.admin.toggle.off");
 const genderText = getGenderStatusLabel(player);
 const result = await showLockedForm(
 player,
 new ActionFormData()
 .title(Lang.t(player, "login.admin.title"))
 .body(
 `${Lang.t(player, "login.admin.body.status", statusText)}\n` +
 `${Lang.t(player, "login.admin.body.gender", genderText)}\n` +
 `${Lang.t(player, "login.admin.body.tag", config.adminTag)}`,
 )
 .button(Lang.t(player, "login.admin.btn.config"), "textures/ui/settings_glyph_color_2x")
 .button(Lang.t(player, "login.admin.btn.users"), "textures/ui/op")
 .button(Lang.t(player, "login.admin.btn.logs"), "textures/items/book_normal")
 .button(Lang.t(player, "login.admin.btn.gender_menu"), GENDER_MENU_TEXTURE)
 .button(
 Lang.t(player, "login.admin.btn.toggle", toggleText),
 isSystemOn ? TOGGLE_ON_TEXTURE : TOGGLE_OFF_TEXTURE,
 ),
 );

 if (!result || result.canceled) return;

 switch (result.selection) {
 case 0:
 await AdminConfigUI(player);
 break;
 case 1:
 await AdminResetUI(player);
 break;
 case 2:
 await AdminLogsUI(player);
 break;
 case 3:
 await AdminGenderSettingsUI(player);
 break;
 case 4:
 system.run(() => {
 GlobalConfig.set(config.systemDB, !isSystemOn);
 if (!isSystemOn) {
 for (const online of world.getPlayers()) markPendingAuth(online);
 }
 notify(
 player,
 Lang.t(
 player,
 "login.admin.notify.toggle",
 !isSystemOn ? Lang.t(player, "login.admin.status.on") : Lang.t(player, "login.admin.status.off"),
 ),
 );
 });
 break;
 }
}

async function AdminGenderSettingsUI(player) {
 const enabled = isGenderEnabled();
 const required = isGenderRequired();
 const optionCount = getGenderOptions().length;
 const stats = getGenderStoreStats();
 const result = await showLockedForm(
 player,
 new ActionFormData()
 .title(Lang.t(player, "login.gender_cfg.title"))
 .body(
 `${Lang.t(player, "login.gender_cfg.body.status", getGenderStatusLabel(player))}\n` +
 `${Lang.t(player, "login.gender_cfg.body.count", optionCount)}\n` +
 `${Lang.t(player, "login.gender_cfg.body.store", stats.count, stats.estCapacity, stats.size, stats.percent)}\n` +
 `${Lang.t(player, "login.gender_cfg.body.store_hint")}`,
 )
 .divider()
 .button(
 Lang.t(
 player,
 enabled ? "login.gender_cfg.btn.disable" : "login.gender_cfg.btn.enable",
 ),
 enabled ? TOGGLE_OFF_TEXTURE : TOGGLE_ON_TEXTURE,
 )
 .divider()
 .button(
 Lang.t(
 player,
 required ? "login.gender_cfg.btn.make_optional" : "login.gender_cfg.btn.make_required",
 ),
 required ? TOGGLE_OFF_TEXTURE : UI_LOCK,
 )
 .divider()
 .button(Lang.t(player, "login.gender_cfg.btn.manage"), GENDER_MENU_TEXTURE)
 .divider()
 .button(Lang.t(player, "login.gender_cfg.btn.players"), UI_PLAYER)
 .divider()
 .button(Lang.t(player, "common.back"), UI_BACK),
 );

 if (!result || result.canceled) return AdminDashboardUI(player);

 switch (result.selection) {
 case 0:
 GlobalConfig.set(GENDER_ENABLED_KEY, !enabled);
 refreshAllGenderDisplays();
 if (!enabled) {
 for (const online of world.getPlayers()) {
 if (!hasPlayerGender(online)) {
 if (isLoginActive()) promptGenderIfNeeded(online);
 else markPendingGender(online);
 }
 }
 }
 notify(player, Lang.t(player, "login.gender_cfg.notify.toggled", getGenderStatusLabel(player)));
 await AdminGenderSettingsUI(player);
 break;
 case 1: {
 const makeRequired = !required;
 GlobalConfig.set(GENDER_REQUIRED_KEY, makeRequired);
 if (makeRequired) {
 for (const online of world.getPlayers()) {
 if (!hasPlayerGender(online)) {
 if (isLoginActive()) promptGenderIfNeeded(online);
 else markPendingGender(online);
 }
 }
 }
 notify(
 player,
 Lang.t(
 player,
 "login.gender_cfg.notify.mode",
 makeRequired
 ? Lang.t(player, "login.admin.gender.on_required")
 : Lang.t(player, "login.admin.gender.on_optional"),
 ),
 );
 await AdminGenderSettingsUI(player);
 break;
 }
 case 2:
 await AdminGenderOptionsUI(player);
 break;
 case 3:
 await AdminGenderPlayersUI(player);
 break;
 default:
 await AdminDashboardUI(player);
 }
}

async function AdminGenderPlayersUI(admin) {
 const players = [...world.getPlayers()];
 if (!players.length) {
 notify(admin, Lang.t(admin, "login.gender_players.err.none"));
 return AdminGenderSettingsUI(admin);
 }

 const form = new ActionFormData()
 .title(Lang.t(admin, "login.gender_players.title"))
 .body(Lang.t(admin, "login.gender_players.body"))
 .divider();

 for (const target of players) {
 const status = hasPlayerGender(target)
 ? getPlayerGender(target)
 : Lang.t(admin, "login.gender.status.none");
 form.button(`${target.name}\n§7${String(status).replace(/§./g, "")}`, UI_PLAYER).divider();
 }
 form.button(Lang.t(admin, "common.back"), UI_BACK);

 const result = await showLockedForm(admin, form);
 if (!result || result.canceled) return AdminGenderSettingsUI(admin);
 if (result.selection === players.length) return AdminGenderSettingsUI(admin);

 const target = players[result.selection];
 if (target) await AdminGenderPlayerEditUI(admin, target);
}

async function AdminGenderPlayerEditUI(admin, target) {
 const options = getGenderOptions();
 const current = hasPlayerGender(target)
 ? getPlayerGender(target)
 : Lang.t(admin, "login.gender.status.none");

 const form = new ActionFormData()
 .title(Lang.t(admin, "login.gender_players.edit.title", target.name))
 .body(Lang.t(admin, "login.gender_players.edit.body", current))
 .divider();

 for (const option of options) {
 form.button(option.label, getGenderOptionButtonIcon(option.id)).divider();
 }
 form
 .button(Lang.t(admin, "login.gender_players.edit.clear"), "textures/ui/trash")
 .divider()
 .button(Lang.t(admin, "common.back"), UI_BACK);

 const result = await showLockedForm(admin, form);
 if (!result || result.canceled) return AdminGenderPlayersUI(admin);

 const clearIndex = options.length;
 const backIndex = options.length + 1;

 if (result.selection === backIndex) return AdminGenderPlayersUI(admin);

 if (result.selection === clearIndex) {
 clearPlayerGender(target);
 notify(admin, Lang.t(admin, "login.gender_players.notify.cleared", target.name));
 notify(target, Lang.t(target, "login.gender_players.notify.cleared_self"));
 addLog(`[GENDER] Admin ${admin.name} cleared gender of ${target.name}`);
 if (isGenderEnabled() && !hasPlayerGender(target)) {
 if (isLoginActive()) promptGenderIfNeeded(target);
 else markPendingGender(target);
 }
 return AdminGenderPlayersUI(admin);
 }

 const option = options[result.selection];
 if (!option) return AdminGenderPlayersUI(admin);

 setPlayerGender(target, option.id);
 notify(admin, Lang.t(admin, "login.gender_players.notify.set", target.name, option.label));
 notify(target, Lang.t(target, "login.gender_players.notify.set_self", option.label));
 addLog(`[GENDER] Admin ${admin.name} set ${target.name} -> ${option.id}`);
 return AdminGenderPlayersUI(admin);
}

async function AdminGenderOptionsUI(player) {
 const options = getGenderOptions();
 const form = new ActionFormData()
 .title(Lang.t(player, "login.gender_cfg.options.title"))
 .body(Lang.t(player, "login.gender_cfg.options.body"))
 .divider()
 .button(Lang.t(player, "login.gender_cfg.options.btn.add"), UI_PLUS);

 for (const option of options) {
 form.divider().button(`${option.label}\n§8${option.id}`, getGenderOptionButtonIcon(option.id));
 }

 form.divider().button(Lang.t(player, "common.back"), UI_BACK);

 const result = await showLockedForm(player, form);
 if (!result || result.canceled) return AdminGenderSettingsUI(player);

 if (result.selection === 0) {
 await AdminGenderAddUI(player);
 return;
 }

 const backIndex = options.length + 1;
 if (result.selection === backIndex) return AdminGenderSettingsUI(player);

 const option = options[result.selection - 1];
 if (option) await AdminGenderEditUI(player, option);
}

async function AdminGenderAddUI(player) {
 const result = await showLockedForm(
 player,
 new ModalFormData()
 .title(Lang.t(player, "login.gender_cfg.add.title"))
 .textField(Lang.t(player, "login.gender_cfg.field.id"), "male")
 .textField(Lang.t(player, "login.gender_cfg.field.label"), "§9\u2642 Cowok"),
 );

 if (!result || result.canceled) return AdminGenderOptionsUI(player);

 const [rawId, rawLabel] = result.formValues ?? [];
 const id = typeof rawId === "string" ? rawId.trim().toLowerCase().replace(/\s+/g, "_") : "";
 const label = typeof rawLabel === "string" ? rawLabel.trim() : "";

 if (!id || !label) {
 notify(player, Lang.t(player, "login.gender_cfg.err.empty"));
 return AdminGenderAddUI(player);
 }

 const options = getGenderOptions();
 if (options.some((entry) => entry.id === id)) {
 notify(player, Lang.t(player, "login.gender_cfg.err.duplicate", id));
 return AdminGenderAddUI(player);
 }

 setGenderOptions([...options, { id, label }]);
 refreshAllGenderDisplays();
 notify(player, Lang.t(player, "login.gender_cfg.notify.added", label));
 await AdminGenderOptionsUI(player);
}

async function AdminGenderEditUI(player, option) {
 const result = await showLockedForm(
 player,
 new ModalFormData()
 .title(Lang.t(player, "login.gender_cfg.edit.title", option.id))
 .textField(Lang.t(player, "login.gender_cfg.field.label"), option.label, { defaultValue: option.label })
 .toggle(Lang.t(player, "login.gender_cfg.field.delete"), { defaultValue: false }),
 );

 if (!result || result.canceled) return AdminGenderOptionsUI(player);

 const [rawLabel, shouldDelete] = result.formValues ?? [];
 const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
 const options = getGenderOptions();

 if (shouldDelete) {
 if (options.length <= 1) {
 notify(player, Lang.t(player, "login.gender_cfg.err.min_one"));
 return AdminGenderEditUI(player, option);
 }
 setGenderOptions(options.filter((entry) => entry.id !== option.id));
 refreshAllGenderDisplays();
 notify(player, Lang.t(player, "login.gender_cfg.notify.deleted", option.label));
 return AdminGenderOptionsUI(player);
 }

 if (!label) {
 notify(player, Lang.t(player, "login.gender_cfg.err.empty"));
 return AdminGenderEditUI(player, option);
 }

 setGenderOptions(options.map((entry) => (entry.id === option.id ? { ...entry, label } : entry)));
 refreshAllGenderDisplays();
 notify(player, Lang.t(player, "login.gender_cfg.notify.edited", label));
 await AdminGenderOptionsUI(player);
}

async function AdminConfigUI(player) {
 const current = getAppConfig();
 const isSystemOn = GlobalConfig.get(current.systemDB) ?? false;
 const result = await showLockedForm(
 player,
 new ModalFormData()
 .title(Lang.t(player, "login.config.title"))
 .textField(Lang.t(player, "login.config.tag"), "admin", { defaultValue: current.adminTag })
 .textField(Lang.t(player, "login.config.sys"), "sys_db", { defaultValue: current.systemDB })
 .textField(Lang.t(player, "login.config.plr"), "plr_db", { defaultValue: current.playerDB })
 .textField(Lang.t(player, "login.config.ses"), "ses_db", { defaultValue: current.sessionDB })
 .toggle(Lang.t(player, "login.config.enabled"), { defaultValue: isSystemOn }),
 );

 if (!result || result.canceled) return;

 const [tag, sys, plr, ses, enabled] = result.formValues ?? [];
 system.run(() => {
 GlobalConfig.set("cfg:admin_tag", tag);
 GlobalConfig.set("cfg:sys_db", sys);
 GlobalConfig.set("cfg:plr_db", plr);
 GlobalConfig.set("cfg:ses_db", ses);
 GlobalConfig.set(sys, enabled);
 notify(player, Lang.t(player, "login.config.saved"));
 });
}

async function AdminResetUI(admin) {
 const players = world.getPlayers();
 const names = players.map((player) => player.name);
 const result = await showLockedForm(
 admin,
 new ModalFormData()
 .title(Lang.t(admin, "login.reset.title"))
 .dropdown(Lang.t(admin, "login.reset.select"), names)
 .toggle(Lang.t(admin, "login.reset.confirm"), { defaultValue: false }),
 );

 if (!result || result.canceled) return;

 const [index, confirm] = result.formValues ?? [];
 const target = players[index];
 if (!target || !confirm) return;

 system.run(() => {
 const config = getAppConfig();
 target.setDynamicProperty(config.playerDB, undefined);
 target.setDynamicProperty(config.sessionDB, false);
 clearPlayerGender(target);
 clearPlayerUiState(target);
 notify(admin, Lang.t(admin, "login.reset.done", target.name));
 notify(target, Lang.t(target, "login.reset.by_admin"));
 addLog(`[RESET] Admin ${admin.name} purged ${target.name}`);
 });
}

async function AdminLogsUI(player) {
 await showLockedForm(
 player,
 new MessageFormData()
 .title(Lang.t(player, "login.logs.title"))
 .body(SERVER_LOGS.slice(-15).join("\n") || Lang.t(player, "login.logs.empty"))
 .button1(Lang.t(player, "common.close"))
 .button2(Lang.t(player, "login.logs.refresh")),
 );
}

system.runInterval(() => {
 if (isLoginActive() && pendingAuth.size) {
 const keys = [...pendingAuth];
 authCursor = processPendingAuthBatch(keys, Math.min(3, keys.length));
 }

 if (isGenderEnabled() && pendingGender.size) {
 const keys = [...pendingGender];
 genderCursor = processPendingGenderBatch(keys, Math.min(3, keys.length));
 }
}, 40);

function wakeLoginHub() {}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
 if (!initialSpawn) return;

 system.run(() => {
 const config = getAppConfig();
 const isSystemActive = isLoginActive();
 clearPlayerUiState(player);
 setPromptCooldown(player, SPAWN_PROMPT_DELAY_TICKS);

 if (isSystemActive) {
 player.setDynamicProperty(config.sessionDB, false);
 markPendingAuth(player);
 notify(player, Lang.t(player, "login.notify.connecting"));
 return;
 }

 if (isGenderEnabled() && !hasPlayerGender(player)) {
 markPendingGender(player);
 notify(player, Lang.t(player, "login.notify.gender_only"));
 }
 });
});

world.afterEvents.playerJoin?.subscribe?.(({ player }) => {
 if (isLoginActive()) {
 markPendingAuth(player);
 return;
 }
 if (isGenderEnabled() && !hasPlayerGender(player)) {
 markPendingGender(player);
 }
});

world.beforeEvents.playerLeave.subscribe(({ playerId }) => {
 clearPlayerUiState(playerId);
});
