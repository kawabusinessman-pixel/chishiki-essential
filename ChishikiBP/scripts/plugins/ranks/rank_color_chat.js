import { ModalFormData } from "../../core.js"
import { rankDefault } from "./rank_default.js"
import { RankDatabase } from "./rank_database.js"
import { openAdminPanel } from "./rank.js"
import { Lang } from "../../lib/Lang.js"
import { GlobalConfig } from "../../function/GlobalConfig.js"

const RANK_COLOR_CHAT_KEY = "rankColorChat"

export function isRankColorChatEnabled() {
 try {
  return GlobalConfig.get(RANK_COLOR_CHAT_KEY) === true
 } catch {
  return false
 }
}

export function setRankColorChatEnabled(enabled) {
 return GlobalConfig.set(RANK_COLOR_CHAT_KEY, Boolean(enabled)) === true
}

function findRankDefinition(rankValue) {
 const raw = String(rankValue || "")
 const rankKey = raw.startsWith("rank:") ? raw : `rank:${raw}`
 const customRanks = RankDatabase.getCustomRanks()
 if (customRanks[rankKey]) return customRanks[rankKey]
 if (customRanks[rankKey.toLowerCase()]) return customRanks[rankKey.toLowerCase()]
 if (rankDefault.ranks[rankKey]) return rankDefault.ranks[rankKey]
 return null
}

export function getRankColorForChat(player) {
 try {
  const tag = player.getTags().find(t => t.startsWith("rank:"))
  if (!tag) return null
  const def = findRankDefinition(tag.slice("rank:".length))
  const color = def?.color
  if (typeof color === "string" && color.startsWith("§")) return color
  return null
 } catch {
  return null
 }
}

export function showRankColorChatMenu(player) {
 const enabled = isRankColorChatEnabled()
 const status = Lang.t(player, enabled ? "common.enabled" : "common.disabled")
 new ModalFormData()
 .title(Lang.t(player, "rank.colorchat.title"))
 .toggle(Lang.t(player, "rank.colorchat.toggle", status), {
  defaultValue: enabled,
  tooltip: Lang.t(player, "rank.colorchat.toggle.tooltip"),
 })
 .show(player)
 .then(({ canceled, cancelationReason, formValues }) => {
  if (canceled) {
   if (cancelationReason === "UserBusy") return
   openAdminPanel(player)
   return
  }
  if (!formValues?.length) return
  if (setRankColorChatEnabled(formValues[0])) {
   player.sendMessage(Lang.t(player, formValues[0] ? "rank.colorchat.msg.enabled" : "rank.colorchat.msg.disabled"))
   player.playSound(formValues[0] ? "random.levelup" : "random.pop")
  } else {
   player.sendMessage(Lang.t(player, "rank.colorchat.msg.failed"))
   player.playSound("random.break")
  }
  openAdminPanel(player)
 })
 .catch(e => {
  player.sendMessage(`§cForm error: ${e.message}`)
  console.warn(`Form error in showRankColorChatMenu: ${e}`)
 })
}
