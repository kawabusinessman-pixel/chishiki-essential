import {
 world,
 ActionFormData,
 ModalFormData,
 MessageFormData,
} from "../../core.js";
import { clanDB } from "../../function/getClan.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { Lang } from "../../lib/Lang.js";
import {
 DEFAULT_THRESHOLDS,
 getClanLevelThresholds,
 recalcAllClanLevels,
} from "./clan_level.js";
const DEFAULT_MAX_MEMBERS = 20;
const DEFAULT_MAX_NAME_LENGTH = 16;
const DEFAULT_DESC = "Welcome to our clan!";
const DEFAULT_JOIN_MSG = "§a{player} has joined the clan!";
const DEFAULT_LEAVE_MSG = "§c{player} has left the clan.";
const DEFAULT_COLOR = "§f";
const DEFAULT_MAX_MOD_INVITES = 5;
const DEFAULT_CREATION_COST = 0;
const DEFAULT_CREATION_ENABLED = false;
const DEFAULT_CREATION_CURRENCY = "money";
function setClanLevelThresholds(arr) {
 GlobalConfig.set("clanLevelThresholds", arr);
}
export function getMaxClanMembers() {
 return parseInt(
 GlobalConfig.get("clanMaxMembers") ?? DEFAULT_MAX_MEMBERS,
 );
}
function setMaxClanMembers(val) {
 GlobalConfig.set("clanMaxMembers", val);
}
function getMaxClanNameLength() {
 return parseInt(
 GlobalConfig.get("clanMaxNameLength") ?? DEFAULT_MAX_NAME_LENGTH,
 );
}
function setMaxClanNameLength(val) {
 GlobalConfig.set("clanMaxNameLength", val);
}
function getDefaultClanDesc() {
 return GlobalConfig.get("clanDefaultDesc") ?? DEFAULT_DESC;
}
function setDefaultClanDesc(val) {
 GlobalConfig.set("clanDefaultDesc", val);
}
function getJoinMsg() {
 return GlobalConfig.get("clanJoinMsg") ?? DEFAULT_JOIN_MSG;
}
function setJoinMsg(val) {
 GlobalConfig.set("clanJoinMsg", val);
}
function getLeaveMsg() {
 return GlobalConfig.get("clanLeaveMsg") ?? DEFAULT_LEAVE_MSG;
}
function setLeaveMsg(val) {
 GlobalConfig.set("clanLeaveMsg", val);
}
function getClanNameColor() {
 return GlobalConfig.get("clanNameColor") ?? DEFAULT_COLOR;
}
function setClanNameColor(val) {
 GlobalConfig.set("clanNameColor", val);
}
export function getMaxModInvites() {
 return parseInt(
 GlobalConfig.get("clanMaxModInvites") ?? DEFAULT_MAX_MOD_INVITES,
 );
}
function setMaxModInvites(val) {
 GlobalConfig.set("clanMaxModInvites", val);
}
export function getClanCreationCost() {
 return parseInt(GlobalConfig.get("clanCreationCost") ?? DEFAULT_CREATION_COST);
}
function setClanCreationCost(val) {
 GlobalConfig.set("clanCreationCost", val);
}
export function getClanCreationEnabled() {
 return GlobalConfig.get("clanCreationEnabled") ?? DEFAULT_CREATION_ENABLED;
}
function setClanCreationEnabled(val) {
 GlobalConfig.set("clanCreationEnabled", val);
}
export function getClanCreationCurrency() {
 return GlobalConfig.get("clanCreationCurrency") ?? DEFAULT_CREATION_CURRENCY;
}
function setClanCreationCurrency(val) {
 GlobalConfig.set("clanCreationCurrency", val);
}
export function showClanAdminMenu(player) {
 const form = new ActionFormData()
 .title(Lang.t(player, "admin.clan.settings.title"))
 .body(Lang.t(player, "admin.clan.settings.body"))
 .button(Lang.t(player, "admin.clan.settings.btn.thresholds"), "textures/ui/icon_setting")
 .button(Lang.t(player, "admin.clan.settings.btn.max_members"), "textures/ui/icon_setting")
 .button(Lang.t(player, "admin.clan.settings.btn.name_length"), "textures/ui/icon_setting")
 .button(Lang.t(player, "admin.clan.settings.btn.default_desc"), "textures/ui/icon_setting")
 .button(Lang.t(player, "admin.clan.settings.btn.join_leave_msg"), "textures/ui/icon_setting")
 .button(Lang.t(player, "admin.clan.settings.btn.name_color"), "textures/ui/icon_setting")
 .button(Lang.t(player, "admin.clan.settings.btn.max_invites"), "textures/ui/icon_setting")
 .button(Lang.t(player, "admin.clan.settings.btn.creation_cost"), "textures/ui/icon_setting")
 .button(Lang.t(player, "admin.clan.settings.btn.stats"), "textures/ui/icon_setting")
 .button(Lang.t(player, "admin.clan.settings.btn.delete"), "textures/ui/icon_trash")
 .button(Lang.t(player, "clan.common.close"), "textures/ui/arrow_left");
 form.show(player).then((res) => {
 if (res.canceled || res.selection === 10) return;
 switch (res.selection) {
 case 0:
 showEditThresholdsMenu(player, getClanLevelThresholds());
 break;
 case 1:
 showSetMaxMembersMenu(player);
 break;
 case 2:
 showSetMaxNameLengthMenu(player);
 break;
 case 3:
 showSetDefaultDescMenu(player);
 break;
 case 4:
 showSetJoinLeaveMsgMenu(player);
 break;
 case 5:
 showSetNameColorMenu(player);
 break;
 case 6:
 showSetMaxModInvitesMenu(player);
 break;
 case 7:
 showSetCreationCostMenu(player);
 break;
 case 8:
 showClanStatsMenu(player);
 break;
 case 9:
 showDeleteClanMenu(player);
 break;
 }
 });
}
function showEditThresholdsMenu(player, thresholds) {
 let form = new ModalFormData().title(Lang.t(player, "admin.clan.settings.thresholds.title"));
 for (let i = 1; i < thresholds.length; i++) {
 form = form.textField(
 Lang.t(player, "admin.clan.settings.thresholds.label", i + 1),
 Lang.t(player, "admin.clan.settings.thresholds.placeholder"),
 { defaultValue: thresholds[i].toString() },
 );
 }
 form.submitButton(Lang.t(player, "clan.common.save"));
 form.show(player).then((res) => {
 if (res.canceled) {
 showClanAdminMenu(player);
 return;
 }
 let newThresholds = [0];
 for (let i = 0; i < thresholds.length - 1; i++) {
 const val = parseInt(res.formValues[i]);
 if (isNaN(val) || val < 0) {
 player.sendMessage(
 Lang.t(player, "admin.clan.settings.thresholds.invalid", i + 2),
 );
 showEditThresholdsMenu(player, thresholds);
 return;
 }
 if (val <= newThresholds[i]) {
 player.sendMessage(
 Lang.t(player, "admin.clan.settings.thresholds.not_increasing", i + 2),
 );
 showEditThresholdsMenu(player, thresholds);
 return;
 }
 newThresholds.push(val);
 }
 setClanLevelThresholds(newThresholds);
 recalcAllClanLevels();
 player.sendMessage(Lang.t(player, "admin.clan.settings.thresholds.updated"));
 showClanAdminMenu(player);
 });
}
function showSetMaxMembersMenu(player) {
 new ModalFormData()
 .title(Lang.t(player, "admin.clan.settings.max_members.title"))
 .textField(Lang.t(player, "admin.clan.settings.max_members.label"), Lang.t(player, "clan.common.number"), {
 defaultValue: getMaxClanMembers().toString(),
 })
 .submitButton(Lang.t(player, "clan.common.save"))
 .show(player)
 .then((res) => {
 if (res.canceled) return showClanAdminMenu(player);
 const val = parseInt(res.formValues[0]);
 if (isNaN(val) || val < 1) {
 player.sendMessage(Lang.t(player, "admin.clan.settings.err_positive"));
 return showSetMaxMembersMenu(player);
 }
 setMaxClanMembers(val);
 player.sendMessage(Lang.t(player, "admin.clan.settings.max_members.updated"));
 showClanAdminMenu(player);
 });
}
function showSetMaxNameLengthMenu(player) {
 new ModalFormData()
 .title(Lang.t(player, "admin.clan.settings.name_length.title"))
 .textField(Lang.t(player, "admin.clan.settings.name_length.label"), Lang.t(player, "clan.common.number"), {
 defaultValue: getMaxClanNameLength().toString(),
 })
 .submitButton(Lang.t(player, "clan.common.save"))
 .show(player)
 .then((res) => {
 if (res.canceled) return showClanAdminMenu(player);
 const val = parseInt(res.formValues[0]);
 if (isNaN(val) || val < 3) {
 player.sendMessage(Lang.t(player, "admin.clan.settings.err_min3"));
 return showSetMaxNameLengthMenu(player);
 }
 setMaxClanNameLength(val);
 player.sendMessage(Lang.t(player, "admin.clan.settings.name_length.updated"));
 showClanAdminMenu(player);
 });
}
function showSetDefaultDescMenu(player) {
 new ModalFormData()
 .title(Lang.t(player, "admin.clan.settings.default_desc.title"))
 .textField(Lang.t(player, "admin.clan.settings.default_desc.label"), Lang.t(player, "clan.common.text"), {
 defaultValue: getDefaultClanDesc(),
 })
 .submitButton(Lang.t(player, "clan.common.save"))
 .show(player)
 .then((res) => {
 if (res.canceled) return showClanAdminMenu(player);
 setDefaultClanDesc(res.formValues[0] || DEFAULT_DESC);
 player.sendMessage(Lang.t(player, "admin.clan.settings.default_desc.updated"));
 showClanAdminMenu(player);
 });
}
function showSetJoinLeaveMsgMenu(player) {
 new ModalFormData()
 .title(Lang.t(player, "admin.clan.settings.join_leave_msg.title"))
 .textField(Lang.t(player, "admin.clan.settings.join_leave_msg.join_label"), Lang.t(player, "clan.common.text"), { defaultValue: getJoinMsg() })
 .textField(Lang.t(player, "admin.clan.settings.join_leave_msg.leave_label"), Lang.t(player, "clan.common.text"), { defaultValue: getLeaveMsg() })
 .submitButton(Lang.t(player, "clan.common.save"))
 .show(player)
 .then((res) => {
 if (res.canceled) return showClanAdminMenu(player);
 setJoinMsg(res.formValues[0] || DEFAULT_JOIN_MSG);
 setLeaveMsg(res.formValues[1] || DEFAULT_LEAVE_MSG);
 player.sendMessage(Lang.t(player, "admin.clan.settings.join_leave_msg.updated"));
 showClanAdminMenu(player);
 });
}
function showSetNameColorMenu(player) {
 new ModalFormData()
 .title(Lang.t(player, "admin.clan.settings.name_color.title"))
 .textField(Lang.t(player, "admin.clan.settings.name_color.label"), Lang.t(player, "clan.common.text"), {
 defaultValue: getClanNameColor(),
 })
 .submitButton(Lang.t(player, "clan.common.save"))
 .show(player)
 .then((res) => {
 if (res.canceled) return showClanAdminMenu(player);
 setClanNameColor(res.formValues[0] || DEFAULT_COLOR);
 player.sendMessage(Lang.t(player, "admin.clan.settings.name_color.updated"));
 showClanAdminMenu(player);
 });
}
function showSetMaxModInvitesMenu(player) {
 new ModalFormData()
 .title(Lang.t(player, "admin.clan.settings.max_invites.title"))
 .textField(Lang.t(player, "admin.clan.settings.max_invites.label"), Lang.t(player, "clan.common.number"), {
 defaultValue: getMaxModInvites().toString(),
 })
 .submitButton(Lang.t(player, "clan.common.save"))
 .show(player)
 .then((res) => {
 if (res.canceled) return showClanAdminMenu(player);
 const val = parseInt(res.formValues[0]);
 if (isNaN(val) || val < 0) {
 player.sendMessage(Lang.t(player, "admin.clan.settings.err_non_negative"));
 return showSetMaxModInvitesMenu(player);
 }
 setMaxModInvites(val);
 player.sendMessage(Lang.t(player, "admin.clan.settings.max_invites.updated"));
 showClanAdminMenu(player);
 });
}
function showSetCreationCostMenu(player) {
 new ModalFormData()
 .title(Lang.t(player, "admin.clan.settings.creation_cost.title"))
 .toggle(Lang.t(player, "admin.clan.settings.creation_cost.toggle"), { defaultValue: getClanCreationEnabled() })
 .textField(Lang.t(player, "admin.clan.settings.creation_cost.amount_label"), Lang.t(player, "clan.common.number"), {
 defaultValue: getClanCreationCost().toString(),
 })
 .textField(Lang.t(player, "admin.clan.settings.creation_cost.currency_label"), Lang.t(player, "clan.common.scoreboard"), {
 defaultValue: getClanCreationCurrency(),
 })
 .submitButton(Lang.t(player, "clan.common.save"))
 .show(player)
 .then((res) => {
 if (res.canceled) return showClanAdminMenu(player);
 const [enabled, costStr, currency] = res.formValues;
 const cost = parseInt(costStr);
 if (isNaN(cost) || cost < 0) {
 player.sendMessage(Lang.t(player, "admin.clan.settings.err_non_negative"));
 return showSetCreationCostMenu(player);
 }
 setClanCreationEnabled(enabled);
 setClanCreationCost(cost);
 setClanCreationCurrency(currency || "money");
 player.sendMessage(Lang.t(player, "admin.clan.settings.creation_cost.updated"));
 showClanAdminMenu(player);
 });
}
function showClanStatsMenu(player) {
 let totalClans = 0,
 totalMembers = 0;
 for (const key of clanDB.keys()) {
 if (key.startsWith("clan_") && !key.endsWith("_settings")) {
 const clan = clanDB.get(key);
 if (clan && Array.isArray(clan.members)) {
 totalClans++;
 totalMembers += clan.members.length;
 }
 }
 }
 const avg = totalClans ? (totalMembers / totalClans).toFixed(2) : 0;
 new MessageFormData()
 .title(Lang.t(player, "admin.clan.settings.stats.title"))
 .body(
 Lang.t(player, "admin.clan.settings.stats.body", totalClans, totalMembers, avg),
 )
 .button1(Lang.t(player, "clan.common.back"))
 .show(player)
 .then(() => showClanAdminMenu(player));
}
function showDeleteClanMenu(player) {
 const clans = [];
 for (const key of clanDB.keys()) {
 if (key.startsWith("clan_") && !key.endsWith("_settings")) {
 const clan = clanDB.get(key);
 if (clan && Array.isArray(clan.members)) {
 const clanId = key.slice("clan_".length);
 clans.push({ clanId, name: clan.name || clanId, memberCount: clan.members.length });
 }
 }
 }
 if (clans.length === 0) {
 new MessageFormData()
 .title(Lang.t(player, "admin.clan.settings.delete.title"))
 .body(Lang.t(player, "admin.clan.settings.delete.empty"))
 .button1(Lang.t(player, "clan.common.back"))
 .show(player)
 .then(() => showClanAdminMenu(player));
 return;
 }
 const form = new ActionFormData()
 .title(Lang.t(player, "admin.clan.settings.delete.title"))
 .body(Lang.t(player, "admin.clan.settings.delete.select_body"));
 clans.forEach((clan) => {
 form.button(Lang.t(player, "admin.clan.settings.delete.entry", clan.name, clan.memberCount), "textures/ui/icon_trash");
 });
 form.button(Lang.t(player, "clan.common.back"), "textures/ui/arrow_left");
 form.show(player).then((res) => {
 if (res.canceled || res.selection === clans.length) {
 showClanAdminMenu(player);
 return;
 }
 const selected = clans[res.selection];
 showDeleteConfirmMenu(player, selected);
 });
}
function showDeleteConfirmMenu(player, clan) {
 new MessageFormData()
 .title(Lang.t(player, "admin.clan.settings.delete.confirm_title"))
 .body(Lang.t(player, "admin.clan.settings.delete.confirm_body", clan.name, clan.memberCount))
 .button1(Lang.t(player, "admin.clan.settings.delete.confirm_btn"))
 .button2(Lang.t(player, "clan.common.cancel"))
 .show(player)
 .then((res) => {
 if (res.canceled || res.selection === 1) {
 showDeleteClanMenu(player);
 return;
 }
 deleteClan(player, clan);
 });
}
function deleteClan(player, clan) {
 const clanData = clanDB.get(`clan_${clan.clanId}`);
 if (!clanData) {
 player.sendMessage(Lang.t(player, "clan.join.not_found"));
 showDeleteClanMenu(player);
 return;
 }
 for (const member of clanData.members) {
 clanDB.delete(`player_${member}`);
 clanDB.delete(`clan_notify_${member}`);
 }
 clanDB.delete(`clan_${clan.clanId}`);
 clanDB.delete(`clan_${clan.clanId}_settings`);
 for (const key of clanDB.keys()) {
 if (key.startsWith(`join_request_${clan.clanId}_`)) {
 clanDB.delete(key);
 }
 }
 player.sendMessage(Lang.t(player, "admin.clan.settings.delete.done", clan.name));
 showDeleteClanMenu(player);
}
export function showAllClansMenu(player) {
 const clans = [];
 for (const key of clanDB.keys()) {
 if (key.startsWith("clan_") && !key.endsWith("_settings")) {
 const clan = clanDB.get(key);
 if (clan && Array.isArray(clan.members)) {
 const clanId = key.slice("clan_".length);
 clans.push({ clanId, name: clan.name || clanId, memberCount: clan.members.length, level: clan.level || 1 });
 }
 }
 }
 if (clans.length === 0) {
 new MessageFormData()
 .title(Lang.t(player, "admin.clan.settings.all.title"))
 .body(Lang.t(player, "admin.clan.settings.all.empty"))
 .button1(Lang.t(player, "clan.common.back"))
 .show(player)
 .then(() => showClanAdminMenu(player));
 return;
 }
 const form = new ActionFormData()
 .title(Lang.t(player, "admin.clan.settings.all.title"))
 .body(Lang.t(player, "admin.clan.settings.all.body", clans.length));
 clans.forEach((clan) => {
 form.button(Lang.t(player, "admin.clan.settings.all.entry", clan.name, clan.level, clan.memberCount), "textures/ui/icon_multiplayer");
 });
 form.button(Lang.t(player, "clan.common.back"), "textures/ui/arrow_left");
 form.show(player).then((res) => {
 if (res.canceled || res.selection === clans.length) {
 showClanAdminMenu(player);
 return;
 }
 showAllClansMenu(player);
 });
}
