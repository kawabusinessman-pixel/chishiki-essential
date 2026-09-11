import { ModalFormData, ActionFormData, MessageFormData, world } from "../core.js"
import { getAllRanks } from "../plugins/ranks/rank.js"
import { ChatDB } from "../board/chat.js"
import { getPlaceholder } from "../function/getPlaceholder.js"
import { Lang } from "../lib/Lang.js"
const DEVICE_ICONS = {
 Mobile: "§e[MOBILE]§r",
 Console: "§b[CONSOLE]§r",
 Desktop: "§a[DESKTOP]§r",
}
const DEFAULT_FORMAT = "§8[§r@RANK§8] §8[§r@CLAN§8] §f@DEVICE §7@NAME >>§r @MSG"
function getChatFormat() {
 try {
 const raw = world.getDynamicProperty("chat_settings")
 if (raw) {
 const obj = JSON.parse(raw)
 if (obj && obj.format) return obj.format
 }
 } catch {}
 return ChatDB.get("ChatDBDisplay-chat") || DEFAULT_FORMAT
}
function getShowTime() {
 try {
 const raw = world.getDynamicProperty("chat_settings")
 if (raw) {
 const obj = JSON.parse(raw)
 if (obj && typeof obj.showTime === "boolean") return obj.showTime
 }
 } catch {}
 return Boolean(ChatDB.get("ChatDBDisplay-showTime"))
}
function getMultiLine() {
 try {
 const raw = world.getDynamicProperty("chat_settings")
 if (raw) {
 const obj = JSON.parse(raw)
 if (obj && typeof obj.multiLine === "boolean") return obj.multiLine
 }
 } catch {}
 return Boolean(ChatDB.get("ChatDBDisplay-multiLine"))
}
function getDefaultClan() {
 try {
 const clanDB = world.getDynamicProperty("ClanDBConfig-default")
 if (clanDB) return clanDB
 } catch {}
 return "None"
}
function getDeviceIcon(source) {
 const type = source?.clientSystemInfo?.platformType
 return DEVICE_ICONS[type] || ""
}
function getTimeString() {
 const timezone = world.getDynamicProperty("time:timezone") || "UTC+7"
 const offsetHours = parseInt(timezone.replace("UTC", "")) || 7
 const now = new Date()
 now.setHours(now.getHours() + offsetHours)
 const hours = now.getHours().toString().padStart(2, "0")
 const minutes = now.getMinutes().toString().padStart(2, "0")
 return `${hours}:${minutes}`
}
function getChatHistory() {
 const history = world.getDynamicProperty("chatHistory")
 return history ? JSON.parse(history) : []
}
function saveChatHistory(history) {
 world.setDynamicProperty("chatHistory", JSON.stringify(history))
}
function createMainForm(player) {
 return new ActionFormData().simpleUi().title(Lang.t(player, "admin.fakechat.title")).body(Lang.t(player, "admin.fakechat.body")).button(Lang.t(player, "admin.fakechat.btn.send"), "textures/items/book_writable").button(Lang.t(player, "admin.fakechat.btn.history"), "textures/items/book_enchanted")
}
function createChatForm(player, message = "", name = "", clan = "") {
 return new ModalFormData().title(Lang.t(player, "admin.fakechat.send.title")).textField("Enter your fake message", "Message", { defaultValue: message }).textField("Enter your fake name", "Name", { defaultValue: name }).textField("Enter your clan", "Clan", { defaultValue: clan }).dropdown("Select your rank", getAllRanks()).toggle("Enable rank", { defaultValue: true })
}
function createHistoryForm(player, history) {
 const historyMessage = history.length > 0 ? history.join("\n\n") : "No chat history available."
 return new MessageFormData().title(Lang.t(player, "admin.fakechat.history.title")).body(historyMessage).button1(Lang.t(player, "admin.fakechat.history.btn.clear")).button2(Lang.t(player, "admin.fakechat.history.btn.back"))
}
async function fakechat(source, message, name, clan) {
 try {
 const mainResponse = await createMainForm(source).show(source)
 if (mainResponse.canceled) return
 if (mainResponse.selection === 0) {
 const chatResponse = await createChatForm(source, message, name, clan).show(source)
 if (chatResponse.canceled) {
 source.sendMessage("§cYou canceled the fake chat.")
 return
 }
 const [fakeMessage, fakeName, fakeClan, rankIndex, enableRank] = chatResponse.formValues
 if (!fakeMessage || !fakeName) {
 source.sendMessage("§cError: Message and name fields must be filled.")
 return
 }
 const ranks = getAllRanks()
 const fakeRank = enableRank ? ranks[rankIndex] : ""
 let format = getChatFormat()
 let showTime = getShowTime()
 let multiLine = getMultiLine()
 let timeValue = ""
 if (showTime) {
 timeValue = getTimeString()
 if (!format.includes("@TIME")) {
 format = `§7[${timeValue}]§r ` + format
 }
 } else {
 format = format.replace(/@TIME/g, "")
 format = format
 .replace(/\s*\[\]\s*/g, " ")
 .replace(/\s*:\s*:/g, ":")
 .replace(/\s{2,}/g, " ")
 .trim()
 }
 let msg = fakeMessage
 if (!multiLine) msg = msg.replace(/\n/g, " ")
 const device = getDeviceIcon(source)
 const clanVal = fakeClan || getDefaultClan()
 const placeholderObj = {
 NAME: fakeName,
 DEVICE: device,
 RANK: fakeRank,
 CLAN: clanVal,
 MSG: msg,
 NL: "\n",
 TIME: timeValue,
 HEALTH: 20,
 LEVEL: 1,
 MONEY: 0,
 DIMENSION: "overworld",
 }
 const chatMessage = getPlaceholder(format, [placeholderObj])
 const chatHistory = getChatHistory()
 chatHistory.push(chatMessage)
 saveChatHistory(chatHistory)
 world.getPlayers().forEach(player => player.sendMessage(chatMessage))
 } else if (mainResponse.selection === 1) {
 const chatHistory = getChatHistory()
 const historyResponse = await createHistoryForm(source, chatHistory).show(source)
 if (historyResponse.selection === 0) {
 saveChatHistory([])
 source.sendMessage("§aChat history cleared.")
 }
 }
 } catch (error) {
 console.warn("Error in fake chat:", error)
 source.sendMessage("§cAn error occurred while executing fake chat.")
 }
}
export { fakechat }
