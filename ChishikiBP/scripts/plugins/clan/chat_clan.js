import { world, system, CustomForm, ObservableString } from "../../core.js";
import { clanDB } from "../../function/getClan.js";
import { Lang } from "../../lib/Lang.js";

const MAX_HISTORY = 50;
const MAX_MESSAGE_LENGTH = 200;
const PAGE_SIZE = 10;
const SCROLL_LATEST = -1;
const SESSION_CACHE = new Map();
const REFRESH_INTERVAL = 60;

const getChatKey = (clanId) => `chat_${clanId}`;

const getNow = () => {
 const d = new Date();
 const dd = d.getDate().toString().padStart(2, "0");
 const mm = (d.getMonth() + 1).toString().padStart(2, "0");
 const H = d.getHours().toString().padStart(2, "0");
 const M = d.getMinutes().toString().padStart(2, "0");
 return { t: `${H}:${M}`, d: `${dd}/${mm}` };
};

const loadChatHistory = (clanId) => {
 if (SESSION_CACHE.has(clanId)) return SESSION_CACHE.get(clanId);
 const raw = clanDB.get(getChatKey(clanId));
 const history = Array.isArray(raw) ? raw : [];
 SESSION_CACHE.set(clanId, history);
 return history;
};

const saveChatHistory = (clanId, history) => {
 const trimmed = history.slice(-MAX_HISTORY);
 SESSION_CACHE.set(clanId, trimmed);
 clanDB.set(getChatKey(clanId), trimmed);
};

const addMessage = (clanId, sender, message, isOwner = false) => {
 const history = loadChatHistory(clanId);
 const now = getNow();
 history.push({
 s: sender.slice(0, 16),
 m: message.slice(0, MAX_MESSAGE_LENGTH),
 t: now.t,
 d: now.d,
 o: isOwner,
 });
 saveChatHistory(clanId, history);
 return history;
};

const broadcastToClan = (clanId, senderName, message, excludePlayer = null) => {
 const clan = clanDB.get(`clan_${clanId}`);
 if (!clan?.members) return;
 clan.members.forEach(name => {
 if (name === excludePlayer?.name) return;
 const p = world.getPlayers().find(pl => pl.name === name);
 p?.sendMessage(Lang.t(p, "clan.chat.broadcast", senderName, message));
 });
};

const formatChatBody = (history, scrollOffset, pageSize, player) => {
 const recentMsgs = history.slice(-MAX_HISTORY);
 const msgCount = recentMsgs.length;
 const maxScroll = Math.max(0, msgCount - pageSize);
 const currentScroll = scrollOffset === SCROLL_LATEST
 ? maxScroll
 : Math.min(Math.max(0, scrollOffset), maxScroll);
 const visibleMsgs = recentMsgs.slice(currentScroll, currentScroll + pageSize);

 const lines = [];
 if (msgCount === 0) {
 lines.push(Lang.t(player, "clan.chat.no_messages"));
 } else {
 for (const msg of visibleMsgs) {
 const nameColor = msg.o ? "§6" : "§b";
 lines.push(`§7${msg.t} ${nameColor}${msg.s}§7: §f${msg.m}`);
 }
 }
 while (lines.length < pageSize) lines.push("");
 return { lines, currentScroll, maxScroll };
};

const showClanChatUI = (player) => {
 const pData = clanDB.get(`player_${player.name}`);
 const clanId = pData?.clanId;
 if (!clanId) {
 player.sendMessage(Lang.t(player, "clan.chat.not_in_clan"));
 return;
 }
 const clan = clanDB.get(`clan_${clanId}`);
 if (!clan) {
 player.sendMessage(Lang.t(player, "clan.chat.data_missing"));
 return;
 }

 const isOwner = pData?.rank === "owner";
 let scrollOffset = SCROLL_LATEST;
 let waitingClearConfirm = false;

 const headerLabel = new ObservableString(`§l§e${Lang.t(player, "clan.chat.header")} §r§8- ${clan.name || clanId}`);
 const msgSlots = Array.from({ length: PAGE_SIZE }, () => new ObservableString(""));
 const statusLabel = new ObservableString("");

 const refreshChat = () => {
 const history = loadChatHistory(clanId);
 const { lines, currentScroll, maxScroll } = formatChatBody(history, scrollOffset, PAGE_SIZE, player);
 lines.forEach((line, i) => msgSlots[i].setData(line));
 return { currentScroll, maxScroll };
 };

 let { currentScroll, maxScroll } = refreshChat();

 const intervalId = system.runInterval(() => {
 try {
 const result = refreshChat();
 currentScroll = result.currentScroll;
 maxScroll = result.maxScroll;
 } catch {
 }
 }, REFRESH_INTERVAL);

 const messageInput = new ObservableString("", { clientWritable: true });

 const form = new CustomForm(player, Lang.t(player, "clan.chat.title", clan.name || clanId))
 .label(headerLabel)
 .spacer()
 .divider()
 .spacer();

 for (const slot of msgSlots) {
 form.label(slot).spacer();
 }

 form.divider()
 .spacer()
 .textField(Lang.t(player, "clan.chat.message_label"), messageInput, { description: Lang.t(player, "clan.chat.message_hint") })
 .button(Lang.t(player, "clan.chat.send"), () => {
 const msg = messageInput.getData()?.trim();
 if (msg) {
 const pd = clanDB.get(`player_${player.name}`);
 addMessage(clanId, player.name, msg, pd?.rank === "owner");
 broadcastToClan(clanId, player.name, msg, player);
 player.sendMessage(Lang.t(player, "clan.chat.you", msg));
 messageInput.setData("");
 scrollOffset = SCROLL_LATEST;
 refreshChat();
 statusLabel.setData(Lang.t(player, "clan.chat.sent"));
 } else {
 statusLabel.setData(Lang.t(player, "clan.chat.empty"));
 }
 })
 .button(Lang.t(player, "clan.chat.refresh"), () => {
 scrollOffset = SCROLL_LATEST;
 const result = refreshChat();
 currentScroll = result.currentScroll;
 maxScroll = result.maxScroll;
 statusLabel.setData(Lang.t(player, "clan.chat.refreshed"));
 })
 .button(Lang.t(player, "clan.chat.scroll_up"), () => {
 if (currentScroll > 0) {
 scrollOffset = currentScroll - 1;
 const result = refreshChat();
 currentScroll = result.currentScroll;
 maxScroll = result.maxScroll;
 } else {
 statusLabel.setData(Lang.t(player, "clan.chat.top"));
 }
 })
 .button(Lang.t(player, "clan.chat.scroll_down"), () => {
 if (currentScroll < maxScroll) {
 scrollOffset = currentScroll + 1;
 const result = refreshChat();
 currentScroll = result.currentScroll;
 maxScroll = result.maxScroll;
 } else {
 statusLabel.setData(Lang.t(player, "clan.chat.bottom"));
 }
 })
 .spacer();

 if (isOwner) {
 form.button(Lang.t(player, "clan.chat.clear"), () => {
 if (!waitingClearConfirm) {
 waitingClearConfirm = true;
 statusLabel.setData(Lang.t(player, "clan.chat.clear_confirm"));
 } else {
 SESSION_CACHE.delete(clanId);
 clanDB.delete(getChatKey(clanId));
 scrollOffset = SCROLL_LATEST;
 refreshChat();
 waitingClearConfirm = false;
 statusLabel.setData(Lang.t(player, "clan.chat.cleared"));
 }
 });
 }

 form.spacer()
 .label(statusLabel)
 .closeButton();

 form.show()
 .then(() => {
 system.clearRun(intervalId);
 })
 .catch(() => {
 system.clearRun(intervalId);
 });
};

const sendQuickMessage = (player, message) => {
 const pData = clanDB.get(`player_${player.name}`);
 const clanId = pData?.clanId;
 if (!clanId) {
 player.sendMessage(Lang.t(player, "clan.chat.not_in_clan"));
 return false;
 }
 if (!message?.trim()) return false;

 const isOwner = pData?.rank === "owner";
 addMessage(clanId, player.name, message.trim(), isOwner);
 broadcastToClan(clanId, player.name, message.trim(), player);
 player.sendMessage(Lang.t(player, "clan.chat.you", message.trim()));
 return true;
};

export { showClanChatUI, sendQuickMessage, loadChatHistory };
