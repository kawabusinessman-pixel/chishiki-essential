import { system, world, ActionFormData, ModalFormData } from "../../core.js"
import { Database } from "../../function/Database.js"
import { getTimeData } from "../../function/timeSystem.js"
import { GlobalConfig } from "../../function/GlobalConfig.js"
const db = Database.getDatabase("PlayerTracker")
const cache = new Map()
const CACHE_DURATION = 30000
const UPDATE_INTERVAL = 5000
const MAX_LOGS = 50
const PLAYER_LOG_KEY = "join_leave_logs"
function getCurrentTime() {
 const timezone = GlobalConfig.get("time:timezone") ?? "UTC+7"
 const offset = parseInt(timezone.replace("UTC", "")) * 3600000
 return Date.now() + offset
}
function logPlayerJoin(player) {
 const time = getCurrentTime()
 const timeData = getTimeData()
 const timestamp = `${timeData.day}/${timeData.month}/${timeData.year} ${timeData.hour}:${timeData.minute}`
 const key = `player_${player.name}`
 const data = { name: player.name, status: "online", joinTime: time, lastSeen: time, sessionStart: time }
 db.set(key, JSON.stringify(data))
 cache.set(player.name, { ...data, cached: Date.now() })
 addPlayerLog(player.name, "join", timestamp)
}
function logPlayerLeave(player) {
 const time = getCurrentTime()
 const timeData = getTimeData()
 const timestamp = `${timeData.day}/${timeData.month}/${timeData.year} ${timeData.hour}:${timeData.minute}`
 const key = `player_${player.name}`
 const existing = getPlayerData(player.name)
 if (existing) {
 const data = { ...existing, status: "offline", lastSeen: time, sessionDuration: time - existing.sessionStart }
 db.set(key, JSON.stringify(data))
 cache.set(player.name, { ...data, cached: Date.now() })
 addPlayerLog(player.name, "leave", timestamp)
 }
}
function updatePlayerLastSeen(player) {
 const time = getCurrentTime()
 const key = `player_${player.name}`
 const existing = getPlayerData(player.name)
 if (existing?.status === "online") {
 const data = { ...existing, lastSeen: time }
 db.set(key, JSON.stringify(data))
 cache.set(player.name, { ...data, cached: Date.now() })
 }
}
function getPlayerData(playerName) {
 const cached = cache.get(playerName)
 if (cached && Date.now() - cached.cached < CACHE_DURATION) return cached
 const key = `player_${playerName}`
 const raw = db.get(key)
 if (raw) {
 try {
 const data = JSON.parse(raw)
 cache.set(playerName, { ...data, cached: Date.now() })
 return data
 } catch {
 return null
 }
 }
 return null
}
function formatDuration(ms) {
 const s = Math.floor(ms / 1000)
 const m = Math.floor(s / 60)
 const h = Math.floor(m / 60)
 const d = Math.floor(h / 24)
 if (d > 0) return `${d}d ${h % 24}h`
 if (h > 0) return `${h}h ${m % 60}m`
 if (m > 0) return `${m}m`
 return `${s}s`
}
export function getPlayerStatus(playerName) {
 const data = getPlayerData(playerName)
 if (!data) return { status: "never_joined", message: "Player has never joined" }
 const currentTime = getCurrentTime()
 return {
 status: data.status,
 name: data.name,
 lastSeen: data.lastSeen,
 timeSince: formatDuration(currentTime - data.lastSeen),
 sessionDuration: data.sessionDuration ? formatDuration(data.sessionDuration) : null,
 isOnline: data.status === "online",
 }
}
export function getOnlinePlayers() {
 const onlinePlayers = []
 for (const player of world.getPlayers()) {
 const data = getPlayerData(player.name)
 if (data?.status === "online") {
 onlinePlayers.push({ name: player.name, sessionDuration: formatDuration(getCurrentTime() - data.sessionStart) })
 }
 }
 return onlinePlayers
}
export function getAllPlayersHistory(limit = 10) {
 const history = []
 for (const key of db.keys()) {
 if (key.startsWith("player_")) {
 const raw = db.get(key)
 if (raw) {
 try {
 history.push(JSON.parse(raw))
 } catch {
 continue
 }
 }
 }
 }
 return history
 .sort((a, b) => b.lastSeen - a.lastSeen)
 .slice(0, limit)
 .map(data => ({ name: data.name, status: data.status, lastSeen: data.lastSeen, timeSince: formatDuration(getCurrentTime() - data.lastSeen) }))
}
export function getCurrentSessionDuration(playerName) {
 const data = getPlayerData(playerName)
 return data?.status === "online" ? formatDuration(getCurrentTime() - data.sessionStart) : null
}
function addPlayerLog(playerName, action, timestamp) {
 const logs = getPlayerLogs()
 logs.push({ player: playerName, action, timestamp })
 if (logs.length > MAX_LOGS) {
 logs.splice(0, logs.length - MAX_LOGS)
 }
 db.set(PLAYER_LOG_KEY, JSON.stringify(logs))
}
function getPlayerLogs() {
 let raw = db.get(PLAYER_LOG_KEY)
 if (!raw) {
 const legacy = GlobalConfig.get("PlayerLog:logs")
 if (legacy) {
 const migrated = typeof legacy === "string" ? JSON.parse(legacy) : legacy
 db.set(PLAYER_LOG_KEY, JSON.stringify(migrated))
 GlobalConfig.set("PlayerLog:logs", undefined)
 return migrated
 }
 return []
 }
 try {
 return typeof raw === "string" ? JSON.parse(raw) : raw
 } catch {
 return []
 }
}
function clearPlayerLogs() {
 db.set(PLAYER_LOG_KEY, JSON.stringify([]))
}
export function showPlayerLogMenu(player) {
 const form = new ActionFormData().title("§6Player Log System").body("§7Manage player join/leave logs").button("§2View Recent Logs", "textures/ui/book_edit_default").button("§eFilter by Player", "textures/ui/magnifyingGlass").button("§cClear All Logs", "textures/ui/trash_default").button("§8Close", "textures/ui/cancel")
 form.show(player).then(result => {
 if (result.canceled) return
 switch (result.selection) {
 case 0:
 showRecentLogs(player)
 break
 case 1:
 showPlayerFilter(player)
 break
 case 2:
 confirmClearLogs(player)
 break
 }
 })
}
function showRecentLogs(player) {
 const logs = getPlayerLogs().slice(-15).reverse()
 let body = "§7Last 15 logs:\n\n"
 if (logs.length === 0) {
 body += "§cNo logs available"
 } else {
 for (let i = 0; i < logs.length; i++) {
 const log = logs[i]
 const actionColor = log.action === "join" ? "§a" : "§c"
 const actionText = log.action === "join" ? "Joined" : "Left"
 body += `${actionColor}${log.player} §7- ${actionText} §8(${log.timestamp})\n`
 }
 }
 const form = new ActionFormData().title("§6Recent Player Logs").body(body).button("§8Back")
 form.show(player).then(result => {
 if (!result.canceled) showPlayerLogMenu(player)
 })
}
function showPlayerFilter(player) {
 const form = new ModalFormData().title("§6Filter Log by Player").textField("§7Player Name:", "Enter player name...", { defaultValue: "" })
 form.show(player).then(result => {
 if (result.canceled) return showPlayerLogMenu(player)
 const playerName = result.formValues[0]
 if (!playerName) {
 player.sendMessage("§cPlayer name cannot be empty!")
 return showPlayerLogMenu(player)
 }
 showPlayerSpecificLogs(player, playerName)
 })
}
function showPlayerSpecificLogs(player, targetPlayer) {
 const logs = getPlayerLogs()
 .filter(log => log.player.toLowerCase().includes(targetPlayer.toLowerCase()))
 .slice(-10)
 .reverse()
 let body = `§7Logs for: §e${targetPlayer}\n\n`
 if (logs.length === 0) {
 body += "§cNo logs found"
 } else {
 for (let i = 0; i < logs.length; i++) {
 const log = logs[i]
 const actionColor = log.action === "join" ? "§a" : "§c"
 const actionText = log.action === "join" ? "Joined" : "Left"
 body += `${actionColor}${actionText} §8(${log.timestamp})\n`
 }
 }
 const form = new ActionFormData().title("§6Player Logs").body(body).button("§8Back")
 form.show(player).then(result => {
 if (!result.canceled) showPlayerLogMenu(player)
 })
}
function confirmClearLogs(player) {
 const form = new ModalFormData().title("§cConfirm Clear Logs").toggle("§7Confirm delete all logs", false)
 form.show(player).then(result => {
 if (result.canceled) return showPlayerLogMenu(player)
 if (result.formValues[0]) {
 clearPlayerLogs()
 player.sendMessage("§aLogs cleared!")
 } else {
 player.sendMessage("§cCancelled")
 }
 showPlayerLogMenu(player)
 })
}
export { getCurrentTime, formatDuration, getPlayerLogs, clearPlayerLogs }
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
 if (!initialSpawn) return
 logPlayerJoin(player)
})
world.beforeEvents.playerLeave.subscribe(({ player }) => logPlayerLeave(player))
system.runInterval(() => {
 const players = world.getPlayers()
 for (let i = 0; i < players.length; i++) {
 updatePlayerLastSeen(players[i])
 }
}, UPDATE_INTERVAL)
