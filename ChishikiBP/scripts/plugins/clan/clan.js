import {
 system,
 world,
 ActionFormData,
 ModalFormData,
 MessageFormData,
} from "../../core.js";
import { getMaxClanMembers, getMaxModInvites, getClanCreationCost, getClanCreationEnabled, getClanCreationCurrency } from "./admin.js";
import { getFullMoney, removeMoney, formatMoneyValue } from "../../function/moneySystem.js";
import { getScore } from "../../function/getScore.js";
import { clanDB } from "../../function/getClan.js";
import { showClanChatUI } from "./chat_clan.js";
import { showClanInfoMenu } from "./clan_info.js";
import "./friendly_fire.js";
import { Lang } from "../../lib/Lang.js";
import { recalcClanLevel, getNextLevelRequirement } from "./clan_level.js";
const MAX_CLAN_NAME_LENGTH = 32;
const MAX_DISPLAY_NAME_LENGTH = 16;
function genClanId() {
 const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
 let id = "";
 for (let i = 0; i < 6; i++)
 id += chars[Math.floor(Math.random() * chars.length)];
 return id;
}
function stripColorCodes(text) {
 return text.replace(/§[0-9a-fklmnor]/g, "");
}
function hasValidColorCodes(text) {
 const colorCodePattern = /§[0-9a-fklmnor]/g;
 const matches = text.match(colorCodePattern);
 if (!matches) return true;
 for (let i = 0; i < text.length - 1; i++) {
 if (text[i] === "§") {
 const nextChar = text[i + 1];
 if (!/[0-9a-fklmnor]/.test(nextChar)) {
 return false;
 }
 }
 }
 return true;
}
function isValidClanName(name) {
 if (!name) return false;
 if (!hasValidColorCodes(name)) return false;
 const strippedName = stripColorCodes(name);
 if (strippedName.length < 3 || strippedName.length > MAX_DISPLAY_NAME_LENGTH)
 return false;
 if (name.length > MAX_CLAN_NAME_LENGTH) return false;
 if (!/^[a-zA-Z0-9 _§-]+$/.test(name)) return false;
 if (strippedName.trim() !== strippedName) return false;
 return true;
}
function getClanData(clanId) {
 const data = clanDB.get(`clan_${clanId}`);
 if (!data || !Array.isArray(data.members)) return null;
 return data;
}
export function joinClan(player, clanId) {
 const clan = getClanData(clanId);
 if (!clan) return false;
 if (clan.members.includes(player.name)) return false;
 if (clan.members.length >= getMaxClanMembers()) {
 if (typeof player.sendMessage === "function") {
 player.sendMessage(Lang.t(player, "clan.join.full"));
 }
 return false;
 }
 clan.members.push(player.name);
 clanDB.set(`clan_${clanId}`, clan);
 clanDB.set(`player_${player.name}`, {
 clanId,
 rank: "member",
 inviteCount: 0,
 });
 for (const key of clanDB.keys()) {
 if (key.startsWith(`join_request_`) && key.endsWith(`_${player.name}`)) {
 clanDB.delete(key);
 }
 }
 recalcClanLevel(clanId);
 return true;
}
export function leaveClan(player) {
 const playerData = clanDB.get(`player_${player.name}`);
 const clanId = playerData?.clanId;
 if (!clanId) return false;
 const clan = getClanData(clanId);
 if (!clan) return false;
 if (playerData.rank === "owner") {
 player.sendMessage(
 Lang.t(player, "clan.leave.owner_block"),
 );
 return false;
 }
 clan.members = clan.members.filter((name) => name !== player.name);
 if (clan.members.length === 0) {
 clanDB.delete(`clan_${clanId}`);
 clanDB.delete(`clan_${clanId}_settings`);
 } else {
 clanDB.set(`clan_${clanId}`, clan);
 recalcClanLevel(clanId, { notify: false });
 }
 clanDB.delete(`player_${player.name}`);
 return true;
}
const statusDismissed = new Set();
function getPendingJoinRequests(playerName) {
 const requests = [];
 for (const key of clanDB.keys()) {
 if (key.startsWith(`join_request_`) && key.endsWith(`_${playerName}`)) {
 const request = clanDB.get(key);
 if (request && request.status === "pending") {
 requests.push(request);
 }
 }
 }
 return requests.sort((a, b) => a.timestamp - b.timestamp);
}
export function showClanMenu(player, opts = {}) {
 const playerData = clanDB.get(`player_${player.name}`);
 const clanId = playerData?.clanId;
 const inviteData = clanDB.get(`invite_${player.name}`);
 if (inviteData) {
 showInviteApprovalMenu(player, inviteData);
 return;
 }
 if (!clanId) {
 const pendingRequests = getPendingJoinRequests(player.name);
 const hasPending = pendingRequests.length > 0;
 if (hasPending && !opts.skipStatusCheck && !statusDismissed.has(player.name)) {
 showJoinRequestStatusMenu(player, pendingRequests);
 return;
 }
 const menu = new ActionFormData()
 .title(Lang.t(player, "clan.menu.title"))
 .body(Lang.t(player, "clan.menu.body"))
 .button(Lang.t(player, "clan.menu.btn.join"), "textures/ui/icon_multiplayer")
 .button(Lang.t(player, "clan.menu.btn.create"), "textures/ui/color_plus");
 if (hasPending) {
 menu.button(
 Lang.t(player, "clan.menu.btn.my_requests", pendingRequests.length),
 "textures/ui/icon_setting",
 );
 }
 menu.button(Lang.t(player, "clan.menu.btn.back"), "textures/ui/arrow_left");
 menu.show(player).then((res) => {
 if (res.canceled) return;
 const backIndex = hasPending ? 3 : 2;
 if (res.selection === backIndex) return;
 if (res.selection === 0) joinClanForm(player);
 else if (res.selection === 1) createClanForm(player);
 else if (res.selection === 2) showJoinRequestStatusMenu(player, pendingRequests);
 });
 return;
 }
 const clan = getClanData(clanId);
 if (!clan) {
 player.sendMessage(Lang.t(player, "clan.menu.not_found"));
 clanDB.delete(`player_${player.name}`);
 showClanMenu(player);
 return;
 }
 const isOwner = playerData.rank === "owner";
 const isMod = playerData.rank === "mod";
 const pendingRequestsCount = getPendingJoinRequestsCount(clanId);
 const friendlyFire = clanDB.get(`clan_${clanId}_settings`)?.friendlyFire === true;
 const form = new ActionFormData()
 .title(Lang.t(player, "clan.menu.clan_title", clan.name || clanId))
 .body(
 isOwner && pendingRequestsCount > 0
 ? Lang.t(player, "clan.menu.pending_body", pendingRequestsCount)
 : "",
 )
 .button(Lang.t(player, "clan.menu.btn.info"), "textures/ui/creative_icon")
 .button(Lang.t(player, "clan.menu.btn.members"), "textures/ui/icon_multiplayer");
 if (isOwner || isMod) form.button(Lang.t(player, "clan.menu.btn.invite"), "textures/ui/icon_panda");
 form.button(Lang.t(player, "clan.menu.btn.chat"), "textures/ui/chat_send");
 form.button(Lang.t(player, "clan.menu.btn.leave"), "textures/ui/cancel");
 if (isOwner) {
 form.button(
 Lang.t(player, "clan.menu.btn.requests") +
 (pendingRequestsCount > 0 ? ` §e(${pendingRequestsCount})` : ""),
 "textures/ui/icon_panda",
 );
 form.button(Lang.t(player, "clan.menu.btn.disband"), "textures/ui/icon_lock");
 form.button(
 Lang.t(player, "clan.menu.btn.transfer"),
 "textures/ui/dressing_room_customization",
 );
 form.button(
 Lang.t(player, "clan.menu.btn.settings"),
 "textures/ui/automation_glyph_color",
 );
 form.button(
 Lang.t(player, "clan.menu.btn.ff", friendlyFire
 ? Lang.t(player, "clan.ff.state_on")
 : Lang.t(player, "clan.ff.state_off")),
 "textures/ui/icon_setting",
 );
 form.button(
 Lang.t(player, "clan.menu.btn.promote"),
 "textures/ui/filledStar",
 );
 form.button(Lang.t(player, "clan.menu.btn.kick"), "textures/ui/ErrorGlyph_small");
 form.button(Lang.t(player, "clan.menu.btn.color"), "textures/ui/color_plus");
 form.button(Lang.t(player, "clan.menu.btn.docs"), "textures/ui/creative_icon");
 } else {
 form.button(Lang.t(player, "clan.menu.btn.color"), "textures/ui/color_plus");
 }
 form.show(player).then((res) => {
 if (res.canceled) return;
 const hasInvite = isOwner || isMod;
 switch (res.selection) {
 case 0:
 showClanInfo(player, clan);
 break;
 case 1:
 showMemberList(player, clan);
 break;
 case 2:
 if (hasInvite) {
 inviteMemberForm(player, clanId);
 } else {
 showClanChatUI(player);
 }
 break;
 case 3:
 if (hasInvite) {
 showClanChatUI(player);
 } else {
 handleLeaveClan(player);
 }
 break;
 case 4:
 if (hasInvite) {
 handleLeaveClan(player);
 } else if (isOwner) {
 showJoinRequestsMenu(player, clan);
 }
 break;
 default:
 if (isOwner) {
 const ownerOffset = hasInvite ? 5 : 4;
 if (res.selection === ownerOffset) showJoinRequestsMenu(player, clan);
 else if (res.selection === ownerOffset + 1) handleDisbandClan(player);
 else if (res.selection === ownerOffset + 2)
 transferOwnershipForm(player, clan);
 else if (res.selection === ownerOffset + 3)
 clanSettingsForm(player, clan);
 else if (res.selection === ownerOffset + 4)
 showFriendlyFireMenu(player);
 else if (res.selection === ownerOffset + 5)
 promoteDemoteMemberForm(player, clan);
 else if (res.selection === ownerOffset + 6)
 kickMemberForm(player, clan);
 else if (res.selection === ownerOffset + 7) showColorGuide(player);
 else if (res.selection === ownerOffset + 8) showClanInfoMenu(player);
 } else {
 const nonOwnerOffset = hasInvite ? 5 : 4;
 if (res.selection === nonOwnerOffset) showColorGuide(player);
 }
 break;
 }
 });
}
function showClanInfo(player, clan) {
 const nextReq = getNextLevelRequirement(clan.level || 1);
 const xp = clan.xp || 0;
 const xpText =
 nextReq === null
 ? Lang.t(player, "clan.info.xp_max", xp)
 : Lang.t(player, "clan.info.xp_next", xp, Math.max(0, nextReq - xp));
 new MessageFormData()
 .title(Lang.t(player, "clan.info.title"))
 .body(
 Lang.t(
 player,
 "clan.info.body",
 clan.name,
 clan.desc || "-",
 clan.level || 1,
 xpText,
 clan.members.length,
 getMaxClanMembers(),
 ),
 )
 .button1(Lang.t(player, "clan.common.close"))
 .button2(Lang.t(player, "clan.common.back"))
 .show(player)
 .then(({ selection }) => {
 if (selection === 1) showClanMenu(player);
 });
}
function showMemberList(player, clan) {
 const max = getMaxClanMembers();
 let owners = [];
 let mods = [];
 let members = [];
 for (const member of clan.members) {
 const pdata = clanDB.get(`player_${member}`);
 const rank = pdata?.rank || "member";
 if (rank === "owner") owners.push(member);
 else if (rank === "mod") mods.push(member);
 else members.push(member);
 }
 const memberList = [];
 if (owners.length > 0) {
 memberList.push(Lang.t(player, "clan.members.owners"));
 memberList.push(...owners.map((n) => `§f- ${n}`));
 }
 if (mods.length > 0) {
 memberList.push("\n" + Lang.t(player, "clan.members.mods"));
 memberList.push(...mods.map((n) => `§f- ${n}`));
 }
 if (members.length > 0) {
 memberList.push("\n" + Lang.t(player, "clan.members.members"));
 memberList.push(...members.map((n) => `§f- ${n}`));
 }
 const listText =
 memberList.length > 0 ? memberList.join("\n") : Lang.t(player, "clan.members.empty");
 new MessageFormData()
 .title(Lang.t(player, "clan.members.title"))
 .body(
 Lang.t(player, "clan.members.body", clan.members.length, max, listText),
 )
 .button1(Lang.t(player, "clan.common.close"))
 .button2(Lang.t(player, "clan.common.back"))
 .show(player)
 .then(({ selection }) => {
 if (selection === 1) showClanMenu(player);
 });
}
function inviteMemberForm(player, clanId) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData.rank === "mod") {
 const maxInvites = getMaxModInvites();
 if (playerData.inviteCount >= maxInvites) {
 player.sendMessage(
 Lang.t(player, "clan.invite.limit", maxInvites),
 );
 showClanMenu(player);
 return;
 }
 }
 const onlinePlayers = world.getPlayers();
 const candidates = onlinePlayers.filter((p) => {
 const pdata = clanDB.get(`player_${p.name}`);
 return !pdata || !pdata.clanId;
 });
 if (candidates.length === 0) {
 new MessageFormData()
 .title(Lang.t(player, "clan.invite.title"))
 .body(Lang.t(player, "clan.invite.no_candidates"))
 .button1(Lang.t(player, "clan.common.close"))
 .button2(Lang.t(player, "clan.common.back"))
 .show(player)
 .then(({ selection }) => {
 if (selection === 1) showClanMenu(player);
 });
 return;
 }
 const inviteForm = new ActionFormData().title(Lang.t(player, "clan.invite.title"));
 for (const p of candidates) {
 inviteForm.button(p.name, "textures/ui/friend1_black_outline_2x");
 }
 inviteForm.button(Lang.t(player, "clan.common.cancel"), "textures/ui/cancel");
 inviteForm.show(player).then((res) => {
 if (res.canceled || res.selection === candidates.length) {
 showClanMenu(player);
 return;
 }
 const targetPlayer = candidates[res.selection];
 if (!targetPlayer) {
 player.sendMessage(Lang.t(player, "clan.invite.not_found"));
 showClanMenu(player);
 return;
 }
 clanDB.set(`invite_${targetPlayer.name}`, {
 inviter: player.name,
 clanId: clanId,
 });
 player.sendMessage(Lang.t(player, "clan.invite.sent", targetPlayer.name));
 targetPlayer.sendMessage(
 Lang.t(targetPlayer, "clan.invite.received", player.name),
 );
 showClanMenu(player);
 });
 if (playerData.rank === "mod") {
 playerData.inviteCount = (playerData.inviteCount || 0) + 1;
 clanDB.set(`player_${player.name}`, playerData);
 }
}
function createClanForm(player, errorMsg = "", errorField = "") {
 const isEnabled = getClanCreationEnabled();
 const cost = getClanCreationCost();
 const currency = getClanCreationCurrency();
 let costLabel = "";
 if (isEnabled && cost > 0) {
 if (currency === "money") {
 try {
 costLabel = Lang.t(player, "clan.cost.money", formatMoneyValue(BigInt(cost)));
 } catch {
 costLabel = Lang.t(player, "clan.cost.money", cost);
 }
 } else {
 costLabel = Lang.t(player, "clan.cost.score", cost, currency);
 }
 }
 const nameError =
 errorField === "name" && errorMsg ? ` §c(${errorMsg})` : "";
 const descError =
 errorField === "desc" && errorMsg ? ` §c(${errorMsg})` : "";
 const form = new ModalFormData()
 .title(Lang.t(player, "clan.create.title"))
 .textField(
 Lang.t(player, "clan.create.name_label") + costLabel + nameError,
 Lang.t(player, "clan.create.name_placeholder"),
 )
 .textField(
 Lang.t(player, "clan.create.desc_label") + descError,
 Lang.t(player, "clan.create.desc_placeholder"),
 )
 .submitButton(Lang.t(player, "clan.create.submit"));
 form.show(player).then((res) => {
 if (res.canceled) return;
 const [clanName, desc] = res.formValues;
 if (!isValidClanName(clanName)) {
 const strippedLength = stripColorCodes(clanName).length;
 createClanForm(
 player,
 Lang.t(player, "clan.create.err_length", MAX_DISPLAY_NAME_LENGTH, strippedLength),
 "name",
 );
 return;
 }
 if (isEnabled && cost > 0) {
 if (currency === "money") {
 try {
 if (getFullMoney(player) < BigInt(cost)) {
 createClanForm(player, Lang.t(player, "clan.create.err_money"), "name");
 return;
 }
 } catch {
 createClanForm(player, Lang.t(player, "clan.create.err_money_check"), "name");
 return;
 }
 } else {
 const val = getScore(player, currency) || 0;
 if (val < cost) {
 createClanForm(player, Lang.t(player, "clan.create.err_score", currency), "name");
 return;
 }
 }
 }
 const ok = createClan(player, clanName, desc || "");
 if (!ok) {
 createClanForm(
 player,
 Lang.t(player, "clan.create.failed"),
 "name",
 );
 return;
 }
 if (isEnabled && cost > 0) {
 if (currency === "money") {
 removeMoney(player, cost);
 } else {
 try {
 player.runCommand(`scoreboard players remove @s "${currency}" ${cost}`);
 } catch { }
 }
 }
 player.sendMessage(Lang.t(player, "clan.create.success", clanName));
 showClanMenu(player);
 });
}
function createClan(player, clanName, desc) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData?.clanId) return false;
 for (const key of clanDB.keys()) {
 if (!key.startsWith("clan_")) continue;
 const data = clanDB.get(key);
 if (
 data &&
 data.name &&
 data.name.trim().toLowerCase() === clanName.trim().toLowerCase()
 ) {
 return false;
 }
 }
 let clanId;
 do {
 clanId = genClanId();
 } while (clanDB.get(`clan_${clanId}`));
 const clanData = {
 name: clanName.trim(),
 desc: desc,
 members: [player.name],
 level: 1,
 xp: 0,
 };
 clanDB.set(`clan_${clanId}`, clanData);
 recalcClanLevel(clanId, { notify: false });
 clanDB.set(`player_${player.name}`, {
 clanId,
 rank: "owner",
 inviteCount: 0,
 });
 return true;
}
export function getClanLeaderboardData() {
 const clans = [];
 for (const key of clanDB.keys()) {
 if (key.startsWith("clan_") && !key.endsWith("_settings")) {
 const clanId = key.slice("clan_".length);
 const clan = clanDB.get(key);
 if (!clan || !Array.isArray(clan.members)) continue;
 const members = clan.members || [];
 const online = members.filter((n) =>
 world.getPlayers().some((p) => p.name === n),
 );
 clans.push({
 clanId,
 name: clan.name || clanId,
 tag: clanId,
 level: clan.level || 1,
 xp: clan.xp || 0,
 memberCount: members.length,
 onlineCount: online.length,
 });
 }
 }
 return clans.sort(
 (a, b) => b.level - a.level || b.memberCount - a.memberCount,
 );
}
function joinClanForm(player) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData?.clanId) {
 player.sendMessage(Lang.t(player, "clan.join.already"));
 showClanMenu(player);
 return;
 }
 const clans = [];
 for (const key of clanDB.keys()) {
 if (key.startsWith("clan_") && !key.endsWith("_settings")) {
 const clanId = key.slice("clan_".length);
 const clan = clanDB.get(key);
 if (!clan || !Array.isArray(clan.members)) continue;
 if (clan.members.length >= getMaxClanMembers()) continue;
 if (clan.members.includes(player.name)) continue;
 const existingRequest = clanDB.get(
 `join_request_${clanId}_${player.name}`,
 );
 if (existingRequest) continue;
 let owner = "-";
 for (const member of clan.members) {
 const pdata = clanDB.get(`player_${member}`);
 if (pdata?.clanId === clanId && pdata.rank === "owner") {
 owner = member;
 break;
 }
 }
 clans.push({
 clanId,
 name: clan.name || clanId,
 owner,
 memberCount: clan.members.length,
 });
 }
 }
 if (clans.length === 0) {
 player.sendMessage(Lang.t(player, "clan.join.none_available"));
 showClanMenu(player);
 return;
 }
 const form = new ActionFormData()
 .title(Lang.t(player, "clan.join.title"))
 .body(Lang.t(player, "clan.join.select"));
 for (const c of clans) {
 form.button(
 Lang.t(player, "clan.join.entry", c.name, c.owner, c.memberCount),
 );
 }
 form.button(Lang.t(player, "clan.common.cancel"));
 form.show(player).then((res) => {
 if (res.canceled || res.selection === clans.length)
 return showClanMenu(player);
 const selected = clans[res.selection];
 requestToJoinClan(player, selected.clanId, selected.name);
 });
}
function requestToJoinClan(player, clanId, clanName) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData?.clanId) {
 player.sendMessage(Lang.t(player, "clan.join.already"));
 showClanMenu(player);
 return;
 }
 const clan = getClanData(clanId);
 if (!clan) {
 player.sendMessage(Lang.t(player, "clan.join.not_found"));
 showClanMenu(player);
 return;
 }
 if (clan.members.length >= getMaxClanMembers()) {
 player.sendMessage(Lang.t(player, "clan.join.full"));
 showClanMenu(player);
 return;
 }
 const existingRequest = clanDB.get(`join_request_${clanId}_${player.name}`);
 if (existingRequest) {
 player.sendMessage(Lang.t(player, "clan.join.duplicate"));
 showClanMenu(player);
 return;
 }
 clanDB.set(`join_request_${clanId}_${player.name}`, {
 playerName: player.name,
 clanId: clanId,
 clanName: clanName,
 timestamp: Date.now(),
 status: "pending",
 });
 player.sendMessage(Lang.t(player, "clan.join.sent", clanName));
 const ownerName = getClanOwner(clanId);
 if (ownerName) {
 const ownerPlayer = world.getPlayers().find((p) => p.name === ownerName);
 if (ownerPlayer) {
 ownerPlayer.sendMessage(
 Lang.t(ownerPlayer, "clan.join.owner_notify", player.name, clanName),
 );
 }
 }
 showClanMenu(player);
}
function getClanOwner(clanId) {
 const clan = getClanData(clanId);
 if (!clan) return null;
 for (const member of clan.members) {
 const pdata = clanDB.get(`player_${member}`);
 if (pdata?.clanId === clanId && pdata.rank === "owner") {
 return member;
 }
 }
 return null;
}
function getPendingJoinRequestsCount(clanId) {
 let count = 0;
 for (const key of clanDB.keys()) {
 if (key.startsWith(`join_request_${clanId}_`)) {
 const request = clanDB.get(key);
 if (request && request.status === "pending") {
 count++;
 }
 }
 }
 return count;
}
function getAllPendingJoinRequests(clanId) {
 const requests = [];
 for (const key of clanDB.keys()) {
 if (key.startsWith(`join_request_${clanId}_`)) {
 const request = clanDB.get(key);
 if (request && request.status === "pending") {
 const playerData = clanDB.get(`player_${request.playerName}`);
 if (playerData?.clanId) {
 clanDB.delete(key);
 continue;
 }
 const clan = getClanData(clanId);
 if (!clan) {
 clanDB.delete(key);
 continue;
 }
 if (clan.members.includes(request.playerName)) {
 clanDB.delete(key);
 continue;
 }
 if (clan.members.length >= getMaxClanMembers()) {
 clanDB.delete(key);
 continue;
 }
 requests.push({
 key: key,
 ...request,
 });
 }
 }
 }
 return requests.sort((a, b) => a.timestamp - b.timestamp);
}
function showJoinRequestStatusMenu(player, requests) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData?.clanId) {
 for (const req of requests || []) {
 clanDB.delete(`join_request_${req.clanId}_${player.name}`);
 }
 statusDismissed.delete(player.name);
 showClanMenu(player);
 return;
 }
 requests = (requests || getPendingJoinRequests(player.name)).filter((req) => {
 if (!req?.clanId) return false;
 if (!getClanData(req.clanId)) {
 clanDB.delete(`join_request_${req.clanId}_${player.name}`);
 return false;
 }
 return true;
 });
 if (requests.length === 0) {
 statusDismissed.delete(player.name);
 showClanMenu(player);
 return;
 }
 const form = new ActionFormData()
 .title(Lang.t(player, "clan.req.title"))
 .body(Lang.t(player, "clan.req.list_body", requests.length));
 for (const req of requests) {
 form.button(
 `${req.clanName || req.clanId}§r\n§7${Lang.t(player, "clan.req.status_pending")}`,
 "textures/ui/icon_setting",
 );
 }
 form.button(Lang.t(player, "clan.req.hide"), "textures/ui/arrow_left");
 form.show(player).then((res) => {
 if (res.canceled) return;
 if (res.selection === requests.length) {
 statusDismissed.add(player.name);
 showClanMenu(player, { skipStatusCheck: true });
 return;
 }
 const selected = requests[res.selection];
 if (!selected) return;
 new MessageFormData()
 .title(Lang.t(player, "clan.req.confirm_title"))
 .body(
 Lang.t(player, "clan.req.confirm_body", selected.clanName || selected.clanId),
 )
 .button1(Lang.t(player, "clan.req.confirm_btn"))
 .button2(Lang.t(player, "clan.common.back"))
 .show(player)
 .then(({ selection }) => {
 if (selection === 0) {
 cancelJoinRequest(player, selected.clanId);
 const remaining = getPendingJoinRequests(player.name);
 if (remaining.length === 0) {
 statusDismissed.delete(player.name);
 showClanMenu(player);
 } else {
 showJoinRequestStatusMenu(player, remaining);
 }
 } else if (selection === 1) {
 showJoinRequestStatusMenu(player, requests);
 }
 });
 });
}
function cancelJoinRequest(player, clanId) {
 const requestKey = `join_request_${clanId}_${player.name}`;
 const request = clanDB.get(requestKey);
 if (request) {
 clanDB.delete(requestKey);
 player.sendMessage(Lang.t(player, "clan.req.cancelled"));
 }
}
function showJoinRequestsMenu(player, clan) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData.rank !== "owner") {
 player.sendMessage(Lang.t(player, "clan.req.owner_only"));
 showClanMenu(player);
 return;
 }
 const requests = getAllPendingJoinRequests(
 clanDB.get(`player_${player.name}`).clanId,
 );
 if (requests.length === 0) {
 new MessageFormData()
 .title(Lang.t(player, "clan.req.title"))
 .body(Lang.t(player, "clan.req.empty"))
 .button1(Lang.t(player, "clan.common.close"))
 .button2(Lang.t(player, "clan.common.back"))
 .show(player)
 .then(({ selection }) => {
 if (selection === 1) showClanMenu(player);
 });
 return;
 }
 const form = new ActionFormData()
 .title(Lang.t(player, "clan.req.title"))
 .body(Lang.t(player, "clan.req.count_body", requests.length));
 for (const req of requests) {
 const isOnline = world.getPlayers().some((p) => p.name === req.playerName);
 form.button(
 Lang.t(player, "clan.req.entry", req.playerName, isOnline
 ? Lang.t(player, "clan.req.status_online")
 : Lang.t(player, "clan.req.status_offline")),
 "textures/ui/friend1_black_outline_2x",
 );
 }
 form.button(Lang.t(player, "clan.common.back"), "textures/ui/arrow_left");
 form.show(player).then((res) => {
 if (res.canceled || res.selection === requests.length) {
 showClanMenu(player);
 return;
 }
 const selectedRequest = requests[res.selection];
 if (selectedRequest) {
 showJoinRequestActionMenu(player, selectedRequest, clan);
 }
 });
}
function showJoinRequestActionMenu(player, request, clan) {
 const isOnline = world
 .getPlayers()
 .some((p) => p.name === request.playerName);
 new MessageFormData()
 .title(Lang.t(player, "clan.review.title"))
 .body(
 Lang.t(
 player,
 "clan.review.body",
 request.playerName,
 isOnline
 ? Lang.t(player, "clan.req.status_online")
 : Lang.t(player, "clan.req.status_offline"),
 ),
 )
 .button1(Lang.t(player, "clan.review.approve"))
 .button2(Lang.t(player, "clan.review.reject"))
 .show(player)
 .then(({ selection }) => {
 if (selection === 0) {
 approveJoinRequest(player, request, clan);
 } else if (selection === 1) {
 rejectJoinRequest(player, request);
 } else {
 showJoinRequestsMenu(player, clan);
 }
 });
}
function approveJoinRequest(owner, request, clan) {
 const clanId = request.clanId;
 const playerName = request.playerName;
 const player = world.getPlayers().find((p) => p.name === playerName);
 const playerData = clanDB.get(`player_${playerName}`);
 if (playerData?.clanId) {
 owner.sendMessage(
 Lang.t(owner, "clan.review.err_in_clan", playerName),
 );
 clanDB.delete(`join_request_${clanId}_${playerName}`);
 showJoinRequestsMenu(owner, clan);
 return;
 }
 const currentClan = getClanData(clanId);
 if (!currentClan) {
 owner.sendMessage(Lang.t(owner, "clan.review.err_not_found"));
 clanDB.delete(`join_request_${clanId}_${playerName}`);
 showJoinRequestsMenu(owner, clan);
 return;
 }
 if (currentClan.members.length >= getMaxClanMembers()) {
 owner.sendMessage(Lang.t(owner, "clan.review.err_full"));
 if (player) {
 player.sendMessage(
 Lang.t(player, "clan.review.full_notify", request.clanName),
 );
 }
 clanDB.delete(`join_request_${clanId}_${playerName}`);
 showJoinRequestsMenu(owner, clan);
 return;
 }
 if (joinClan(player || { name: playerName }, clanId)) {
 owner.sendMessage(Lang.t(owner, "clan.review.approved", playerName));
 if (player) {
 player.sendMessage(
 Lang.t(player, "clan.review.approved_notify", request.clanName),
 );
 } else {
 clanDB.set(`clan_notify_${playerName}`, {
 clanId,
 clanName: request.clanName,
 });
 }
 clanDB.delete(`join_request_${clanId}_${playerName}`);
 } else {
 owner.sendMessage(Lang.t(owner, "clan.review.failed", playerName));
 }
 showJoinRequestsMenu(owner, clan);
}
function rejectJoinRequest(owner, request) {
 const clanId = request.clanId;
 const playerName = request.playerName;
 const player = world.getPlayers().find((p) => p.name === playerName);
 clanDB.delete(`join_request_${clanId}_${playerName}`);
 owner.sendMessage(Lang.t(owner, "clan.review.rejected", playerName));
 if (player) {
 player.sendMessage(
 Lang.t(player, "clan.review.rejected_notify", request.clanName),
 );
 }
 const clan = getClanData(clanId);
 if (clan) {
 showJoinRequestsMenu(owner, clan);
 } else {
 showClanMenu(owner);
 }
}
function transferOwnershipForm(player, clan) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData.rank !== "owner")
 return player.sendMessage(Lang.t(player, "clan.transfer.owner_only"));
 const candidates = clan.members.filter((n) => n !== player.name);
 if (candidates.length === 0)
 return player.sendMessage(Lang.t(player, "clan.transfer.no_members"));
 const form = new ActionFormData()
 .title(Lang.t(player, "clan.transfer.title"))
 .body(Lang.t(player, "clan.transfer.select"));
 for (const n of candidates) {
 form.button(n);
 }
 form.button(Lang.t(player, "clan.common.cancel"));
 form.show(player).then((res) => {
 if (res.canceled || res.selection === candidates.length)
 return showClanMenu(player);
 const newOwner = candidates[res.selection];
 for (const member of clan.members) {
 if (member === player.name) {
 clanDB.set(`player_${member}`, {
 clanId: clanDB.get(`player_${member}`).clanId,
 rank: "member",
 });
 } else if (member === newOwner) {
 clanDB.set(`player_${member}`, {
 clanId: clanDB.get(`player_${member}`).clanId,
 rank: "owner",
 });
 }
 }
 player.sendMessage(Lang.t(player, "clan.transfer.done", newOwner));
 showClanMenu(player);
 });
}
function showFriendlyFireMenu(player) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData?.rank !== "owner")
 return player.sendMessage(Lang.t(player, "clan.settings.owner_only"));
 const settingsKey = `clan_${playerData.clanId}_settings`;
 const clanSettings = clanDB.get(settingsKey) || { nameChangeCount: 0 };
 const friendlyFire = clanSettings.friendlyFire === true;
 new MessageFormData()
 .title(Lang.t(player, "clan.ff.title"))
 .body(
 Lang.t(
 player,
 "clan.ff.body",
 friendlyFire
 ? Lang.t(player, "clan.ff.state_on")
 : Lang.t(player, "clan.ff.state_off"),
 ),
 )
 .button1(
 friendlyFire
 ? Lang.t(player, "clan.ff.turn_off")
 : Lang.t(player, "clan.ff.turn_on"),
 )
 .button2(Lang.t(player, "clan.common.back"))
 .show(player)
 .then(({ selection }) => {
 if (selection === 0) {
 clanSettings.friendlyFire = !friendlyFire;
 clanDB.set(settingsKey, clanSettings);
 player.sendMessage(
 Lang.t(player, !friendlyFire ? "clan.ff.enabled" : "clan.ff.disabled"),
 );
 }
 showClanMenu(player);
 });
}
function clanSettingsForm(player, clan) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData?.rank !== "owner")
 return player.sendMessage(Lang.t(player, "clan.settings.owner_only"));
 const clanId = playerData.clanId;
 const settingsKey = `clan_${clanId}_settings`;
 const clanSettings = clanDB.get(settingsKey) || { nameChangeCount: 0 };
 const form = new ModalFormData()
 .title(Lang.t(player, "clan.settings.title"))
 .textField(
 Lang.t(player, "clan.settings.name_label"),
 clan.name,
 )
 .textField(Lang.t(player, "clan.settings.desc_label"), clan.desc || "");
 form.show(player).then((res) => {
 if (res.canceled) return showClanMenu(player);
 const [name, desc] = res.formValues;
 if (!isValidClanName(name)) {
 const strippedLength = stripColorCodes(name).length;
 player.sendMessage(
 Lang.t(player, "clan.create.err_length", MAX_DISPLAY_NAME_LENGTH, strippedLength),
 );
 clanSettingsForm(player, clan);
 return;
 }
 const oldStripped = stripColorCodes(clan.name);
 const newStripped = stripColorCodes(name.trim());
 if (oldStripped !== newStripped) {
 if (clanSettings.nameChangeCount >= 1) {
 player.sendMessage(
 Lang.t(player, "clan.settings.name_locked"),
 );
 clanSettingsForm(player, clan);
 return;
 }
 clanSettings.nameChangeCount += 1;
 clanDB.set(settingsKey, clanSettings);
 }
 clan.name = name.trim();
 clan.desc = desc;
 clanDB.set(`clan_${clanId}`, clan);
 player.sendMessage(Lang.t(player, "clan.settings.updated"));
 showClanMenu(player);
 });
}
function promoteDemoteMemberForm(player, clan) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData.rank !== "owner")
 return player.sendMessage(Lang.t(player, "clan.promote.owner_only"));
 const candidates = clan.members.filter((n) => n !== player.name);
 if (candidates.length === 0)
 return player.sendMessage(Lang.t(player, "clan.promote.no_members"));
 const form = new ActionFormData().title(Lang.t(player, "clan.promote.title"));
 for (const n of candidates) {
 const pdata = clanDB.get(`player_${n}`);
 form.button(Lang.t(player, "clan.promote.entry", n, pdata?.rank || "member"));
 }
 form.button(Lang.t(player, "clan.common.cancel"));
 form.show(player).then((res) => {
 if (res.canceled || res.selection === candidates.length)
 return showClanMenu(player);
 const target = candidates[res.selection];
 const pdata = clanDB.get(`player_${target}`);
 const isMod = pdata.rank === "mod";
 const promoteForm = new MessageFormData()
 .title(
 isMod
 ? Lang.t(player, "clan.promote.demote_title")
 : Lang.t(player, "clan.promote.promote_title"),
 )
 .body(
 isMod
 ? Lang.t(player, "clan.promote.demote_body", target)
 : Lang.t(player, "clan.promote.promote_body", target),
 )
 .button1(Lang.t(player, "clan.common.yes"))
 .button2(Lang.t(player, "clan.common.no"));
 promoteForm.show(player).then((r) => {
 if (r.canceled || r.selection === 1) return showClanMenu(player);
 clanDB.set(`player_${target}`, {
 clanId: pdata.clanId,
 rank: isMod ? "member" : "mod",
 });
 player.sendMessage(
 isMod
 ? Lang.t(player, "clan.promote.demoted", target)
 : Lang.t(player, "clan.promote.promoted", target),
 );
 showClanMenu(player);
 });
 });
}
function kickMemberForm(player, clan) {
 const playerData = clanDB.get(`player_${player.name}`);
 if (playerData.rank !== "owner")
 return player.sendMessage(Lang.t(player, "clan.kick.owner_only"));
 const candidates = clan.members.filter((n) => n !== player.name);
 if (candidates.length === 0)
 return player.sendMessage(Lang.t(player, "clan.kick.no_members"));
 const form = new ActionFormData().title(Lang.t(player, "clan.kick.title"));
 for (const n of candidates) {
 form.button(n);
 }
 form.button(Lang.t(player, "clan.common.cancel"));
 form.show(player).then((res) => {
 if (res.canceled || res.selection === candidates.length)
 return showClanMenu(player);
 const target = candidates[res.selection];
 const clanId = clanDB.get(`player_${target}`)?.clanId;
 if (!clanId) return player.sendMessage(Lang.t(player, "clan.kick.not_found"));
 clan.members = clan.members.filter((n) => n !== target);
 clanDB.set(`clan_${clanId}`, clan);
 clanDB.delete(`player_${target}`);
 recalcClanLevel(clanId, { notify: false });
 player.sendMessage(Lang.t(player, "clan.kick.done", target));
 showClanMenu(player);
 });
}
function showInviteApprovalMenu(player, inviteData) {
 const inviter = inviteData.inviter;
 const clanId = inviteData.clanId;
 const clan = getClanData(clanId);
 if (!clan) {
 player.sendMessage(Lang.t(player, "clan.invite.data_missing"));
 clanDB.delete(`invite_${player.name}`);
 showClanMenu(player);
 return;
 }
 new MessageFormData()
 .title(Lang.t(player, "clan.invite.form_title"))
 .body(
 Lang.t(player, "clan.invite.form_body", clan.name, inviter),
 )
 .button1(Lang.t(player, "clan.invite.accept"))
 .button2(Lang.t(player, "clan.invite.decline"))
 .show(player)
 .then((r) => {
 if (r.canceled) {
 showClanMenu(player);
 return;
 }
 if (r.selection === 0) {
 if (joinClan(player, clanId)) {
 player.sendMessage(Lang.t(player, "clan.invite.accepted", clan.name));
 const inviterPlayer = world
 .getPlayers()
 .find((p) => p.name === inviter);
 if (inviterPlayer) {
 inviterPlayer.sendMessage(
 Lang.t(inviterPlayer, "clan.invite.accept_notify", player.name),
 );
 }
 } else {
 player.sendMessage(
 Lang.t(player, "clan.invite.failed"),
 );
 }
 } else {
 player.sendMessage(Lang.t(player, "clan.invite.declined"));
 const inviterPlayer = world
 .getPlayers()
 .find((p) => p.name === inviter);
 if (inviterPlayer) {
 inviterPlayer.sendMessage(
 Lang.t(inviterPlayer, "clan.invite.decline_notify", player.name),
 );
 }
 }
 clanDB.delete(`invite_${player.name}`);
 showClanMenu(player);
 });
}
function handleLeaveClan(player) {
 const firstConfirm = new MessageFormData()
 .title(Lang.t(player, "clan.leave.title"))
 .body(Lang.t(player, "clan.leave.confirm_body"))
 .button1(Lang.t(player, "clan.leave.continue"))
 .button2(Lang.t(player, "clan.common.cancel"));
 firstConfirm.show(player).then((firstRes) => {
 if (firstRes.canceled || firstRes.selection === 1) {
 showClanMenu(player);
 return;
 }
 const secondConfirm = new MessageFormData()
 .title(Lang.t(player, "clan.leave.final_title"))
 .body(Lang.t(player, "clan.leave.final_body"))
 .button1(Lang.t(player, "clan.leave.final_yes"))
 .button2(Lang.t(player, "clan.common.back"));
 secondConfirm.show(player).then((secondRes) => {
 if (secondRes.canceled || secondRes.selection === 1) {
 showClanMenu(player);
 return;
 }
 const ok = leaveClan(player);
 if (ok) {
 player.sendMessage(Lang.t(player, "clan.leave.done"));
 } else {
 player.sendMessage(Lang.t(player, "clan.leave.failed"));
 }
 showClanMenu(player);
 });
 });
}
function showColorGuide(player) {
 const colorGuide = [
 "§0§l■§r §0Black (§0)",
 "§1§l■§r §1Dark Blue (§1)",
 "§2§l■§r §2Dark Green (§2)",
 "§3§l■§r §3Dark Aqua (§3)",
 "§4§l■§r §4Dark Red (§4)",
 "§5§l■§r §5Dark Purple (§5)",
 "§6§l■§r §6Gold (§6)",
 "§7§l■§r §7Gray (§7)",
 "§8§l■§r §8Dark Gray (§8)",
 "§9§l■§r §9Blue (§9)",
 "§a§l■§r §aGreen (§a)",
 "§b§l■§r §bAqua (§b)",
 "§c§l■§r §cRed (§c)",
 "§d§l■§r §dLight Purple (§d)",
 "§e§l■§r §eYellow (§e)",
 "§f§l■§r §fWhite (§f)",
 "",
 "§lFormatting Codes:",
 "§k§lObfuscated§r (§k)",
 "§l§lBold§r (§l)",
 "§m§lStrikethrough§r (§m)",
 "§n§lUnderline§r (§n)",
 "§o§lItalic§r (§o)",
 "§r§lReset§r (§r)",
 "",
 "§eExample: §b§lMy§a§lClan§r = §b§lMy§a§lClan",
 ];
 new MessageFormData()
 .title(Lang.t(player, "clan.guide.title"))
 .body(colorGuide.join("\n"))
 .button1(Lang.t(player, "clan.common.close"))
 .button2(Lang.t(player, "clan.common.back"))
 .show(player)
 .then(({ selection }) => {
 if (selection === 1) showClanMenu(player);
 });
}
function handleDisbandClan(player) {
 const playerData = clanDB.get(`player_${player.name}`);
 const clanId = playerData?.clanId;
 if (!clanId) {
 player.sendMessage(Lang.t(player, "clan.disband.not_found"));
 showClanMenu(player);
 return;
 }
 const clan = getClanData(clanId);
 if (!clan) {
 player.sendMessage(Lang.t(player, "clan.disband.data_missing"));
 showClanMenu(player);
 return;
 }
 const form = new MessageFormData()
 .title(Lang.t(player, "clan.disband.title"))
 .body(
 Lang.t(player, "clan.disband.confirm_body", clan.name),
 )
 .button1(Lang.t(player, "clan.common.yes"))
 .button2(Lang.t(player, "clan.common.no"));
 form.show(player).then((res) => {
 if (res.canceled || res.selection === 1) {
 showClanMenu(player);
 return;
 }
 clanDB.delete(`clan_${clanId}`);
 clanDB.delete(`clan_${clanId}_settings`);
 for (const key of clanDB.keys()) {
 if (key.startsWith(`join_request_${clanId}_`)) {
 clanDB.delete(key);
 }
 }
 for (const member of clan.members) {
 clanDB.delete(`player_${member}`);
 clanDB.delete(`clan_notify_${member}`);
 const p = world.getPlayers().find((pl) => pl.name === member);
 if (p)
 p.sendMessage(
 Lang.t(p, "clan.disband.notify", clan.name),
 );
 }
 player.sendMessage(Lang.t(player, "clan.disband.done"));
 showClanMenu(player);
 });
}
world.afterEvents.playerSpawn?.subscribe?.(({ player, initialSpawn }) => {
 if (!initialSpawn || !player?.name) return;
 system.run(() => {
 try {
 const key = `clan_notify_${player.name}`;
 const notify = clanDB.get(key);
 if (!notify) return;
 clanDB.delete(key);
 if (getClanData(notify.clanId)) {
 player.sendMessage(
 Lang.t(player, "clan.join.offline_approved", notify.clanName || notify.clanId),
 );
 }
 } catch { }
 });
});
