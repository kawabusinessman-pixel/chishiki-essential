import { system, world, ActionFormData, ModalFormData, MessageFormData } from "../../core.js"
import { showMainMenu } from "../../kiwora.js"
import { showRankCustomizeMenu } from "./rank_customize.js"
import { showRankBenefitsMenu } from "./rank_benefits.js"
import { rankDefault } from "./rank_default.js"
import { showRankSubscriptionAdminMenu } from "./rank_subscription.js"
import { showRankColorChatMenu } from "./rank_color_chat.js"
import { RankDatabase } from "./rank_database.js"
import { rankForm } from "../../forms.js"
import { isRankRepairSkill, runRankRepairSkill } from "./rank_skill_presets.js"

export const uuidRanks = [
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
 "", 
]
export const RANK_PREFIX = "rank:"
let defaultRank = ""
let customRankList = []
let allRanksCache = []
let isRanksLoaded = false
function getStoredCustomRanks() {
 return RankDatabase.getCustomRanks()
}
function saveStoredCustomRanks(ranks) {
 RankDatabase.saveCustomRanks(ranks)
}
function getCustomRankId(rankName) {
 return `${RANK_PREFIX}${String(rankName || "").trim().toLowerCase()}`
}
function createDefaultRankDefinition(rankName) {
 return {
 name: rankName,
 color: "§f",
 prefix: `§7[${rankName}§7]`,
 commands: {}
 }
}
function ensureCustomRankDefinitions() {
 let ranks = getStoredCustomRanks()
 let changed = false
 for (const rankName of customRankList) {
 const rankId = getCustomRankId(rankName)
 if (!rankName || ranks[rankId]) continue
 ranks[rankId] = createDefaultRankDefinition(rankName)
 changed = true
 }
 if (changed) saveStoredCustomRanks(ranks)
 return ranks
}
const loadRanks = () => {
 if (isRanksLoaded) return
 try {
 customRankList = RankDatabase.getCustomRankList()
 defaultRank = RankDatabase.loadDefaultRank()
 ensureCustomRankDefinitions()
 updateAllRanksCache()
 isRanksLoaded = true
 } catch (e) {
 console.warn("Error loading customRankList:", e)
 }
}
export function reloadRanksFromStorage() {
 try {
 customRankList = RankDatabase.getCustomRankList()
 defaultRank = RankDatabase.loadDefaultRank()
 ensureCustomRankDefinitions()
 updateAllRanksCache()
 isRanksLoaded = true
 } catch (e) {
 console.warn("Error reloading ranks:", e)
 }
}
system.run(loadRanks)
const updateAllRanksCache = () => {
 allRanksCache = customRankList.length ? customRankList.concat(uuidRanks) : uuidRanks
}
const getPlayers = () => [...world.getPlayers()]
export function isPlayerValid(player) {
 if (!player) return false
 try {
 if (typeof player.isValid === "function") return player.isValid()
 if (player.isValid === false) return false
 player.getTags()
 return true
 } catch {
 return false
 }
}
export const setRank = (player, rank) => {
 const cleanRank = String(rank || "").startsWith(RANK_PREFIX) ? rank.slice(RANK_PREFIX.length) : rank
 const rankTags = player.getTags().filter(t => t.startsWith(RANK_PREFIX))
 for (const tag of rankTags) {
 player.removeTag(tag)
 }
 player.addTag(`${RANK_PREFIX}${cleanRank}`)
 player.sendMessage(`§aRank set: ${cleanRank}`)
 player.playSound("random.levelup")
}
const removeRank = player => {
 const tags = player.getTags().filter(t => t.startsWith(RANK_PREFIX))
 if (tags.length) {
 for (const tag of tags) {
 player.removeTag(tag)
 }
 setRank(player, defaultRank)
 player.sendMessage(`§aRank removed. Default rank '${defaultRank}' assigned.`)
 player.playSound("random.pop")
 } else {
 player.sendMessage("§cNo rank to remove")
 }
}
export const checkPlayerRank = player => {
 if (!isRanksLoaded) loadRanks()
 const tags = player.getTags().filter(t => t.startsWith(RANK_PREFIX))
 if (!tags.length || tags.includes(RANK_PREFIX)) {
 for (const tag of tags) player.removeTag(tag)
 setRank(player, defaultRank)
 console.warn(`Set default rank '${defaultRank}' for ${player.name}`)
 return defaultRank
 }
 const currentTag = tags[0]
 const rankName = currentTag.slice(RANK_PREFIX.length)
 const allRanks = getAllRanks()
 const isValid = allRanks.some(r => r === rankName || r.toLowerCase() === rankName.toLowerCase())
 if (!isValid) {
 player.removeTag(currentTag)
 setRank(player, defaultRank)
 player.sendMessage(`§eYour rank '${rankName}' is no longer valid. You have been reset to '${defaultRank}'.`)
 return defaultRank
 }
 return rankName
}
export const getPlayerRank = player => {
 if (!isPlayerValid(player)) return defaultRank
 try {
  const rankTag = player.getTags().find(t => t.startsWith(RANK_PREFIX))
  return rankTag ? rankTag.slice(RANK_PREFIX.length) : checkPlayerRank(player)
 } catch {
  return defaultRank
 }
}
export function getEffectiveRanks() {
 const merged = {}
 for (const [key, val] of Object.entries(rankDefault.ranks || {})) {
  if (val && typeof val === "object") {
   merged[key] = {
    name: val.name,
    color: val.color,
    prefix: val.prefix,
    commands: { ...(val.commands || {}) }
   }
  }
 }
 try {
  const customRanks = getStoredCustomRanks() || {}
  for (const [key, val] of Object.entries(customRanks)) {
   if (val && typeof val === "object" && val.name) {
    merged[key] = {
     name: val.name,
     color: val.color || "§f",
     prefix: val.prefix || `§7[${val.name}§7]`,
     commands: { ...(val.commands || {}) }
    }
   }
  }
 } catch (e) { }
 return merged
}
export const getRankInfo = rank => {
 const raw = String(rank || "").trim()
 if (!raw) return null
 const rankKey = raw.startsWith(RANK_PREFIX) ? raw : `${RANK_PREFIX}${raw}`
 const cleanRaw = raw.startsWith(RANK_PREFIX) ? raw.slice(RANK_PREFIX.length) : raw
 try {
  const customRanks = getStoredCustomRanks() || {}
  if (customRanks[rankKey]) return customRanks[rankKey]
  if (customRanks[rankKey.toLowerCase()]) return customRanks[rankKey.toLowerCase()]
  if (customRanks[raw]) return customRanks[raw]
  if (customRanks[cleanRaw]) return customRanks[cleanRaw]
  for (const [k, v] of Object.entries(customRanks)) {
   if (v?.name && (v.name.toLowerCase() === raw.toLowerCase() || v.name.toLowerCase() === cleanRaw.toLowerCase())) {
    return v
   }
  }
 } catch (e) { }
 if (rankDefault.ranks[rankKey]) return rankDefault.ranks[rankKey]
 if (rankDefault.ranks[rankKey.toLowerCase()]) return rankDefault.ranks[rankKey.toLowerCase()]
 if (rankDefault.ranks[raw]) return rankDefault.ranks[raw]
 if (rankDefault.ranks[cleanRaw]) return rankDefault.ranks[cleanRaw]
 for (const [k, v] of Object.entries(rankDefault.ranks || {})) {
  if (v?.name && (v.name.toLowerCase() === raw.toLowerCase() || v.name.toLowerCase() === cleanRaw.toLowerCase())) {
   return v
  }
 }
 return null
}
export const executeRankCommand = (player, cmd) => {
 const rank = getPlayerRank(player)
 const rankInfo = getRankInfo(rank)
 if (!rankInfo) return false
 const command = rankInfo.commands[cmd]
 if (!command) return false
 try {
  if (isRankRepairSkill(cmd, command)) {
   runRankRepairSkill(player, command.msg)
  } else {
   player.runCommand(command.cmd)
   player.sendMessage(command.msg)
  }
 } catch (error) {
  if (String(error).includes('Unexpected "ability"')) {
   player.sendMessage("§c[System] Failed: You must enable 'Education Edition' in World Settings to use this ability!")
   player.playSound("random.break")
  } else {
   console.warn(`Error executing rank command '${command.cmd}': ${error}`)
  }
 }
 return true
}
world.afterEvents.playerSpawn.subscribe(({ player }) => {
 system.run(() => {
 checkPlayerRank(player)
 })
})
system.runTimeout(() => {
 const players = getPlayers()
 for (const player of players) {
 checkPlayerRank(player)
 }
}, 20)
export const openAdminPanel = player =>
 rankForm()
 .show(player)
 .then(({ canceled, cancelationReason, selection }) => {
 if (canceled) {
 if (cancelationReason === "UserBusy") return
 showMainMenu(player)
 return
 }
 ;[openPlayerSelectionForRank, openPlayerSelectionForRemoval, addCustomRank, listAllRank, setDefaultRankMenu, showRankCustomizeMenu, showRankBenefitsMenu, showRankSubscriptionAdminMenu, showRankColorChatMenu, showMainMenu][selection](player)
 })
 .catch(e => {
 player.sendMessage(`§cForm error: ${e.message}`)
 console.warn(`Form error in openAdminPanel: ${e}`)
 })
const listAllRank = player => {
 let msg = "§6=== RANKS & PERMISSIONS ===§f\n\n"
 const allRanks = getEffectiveRanks()
 for (const [key, rank] of Object.entries(allRanks)) {
 msg += `§l${rank.prefix} ${rank.name} §r(§f${rank.color}§r):\n`
 for (const [cmd, info] of Object.entries(rank.commands || {})) {
 msg += `§7- ${cmd}: §f${info.msg}\n`
 }
 msg += "\n"
 }
 new MessageFormData()
 .title("Rank Skills")
 .body(msg)
 .button1("Back")
 .button2("Customize")
 .show(player)
 .then(({ canceled, cancelationReason, selection }) => {
 if (canceled) {
 if (cancelationReason === "UserBusy") return
 openAdminPanel(player)
 return
 }
 if (selection === 0) openAdminPanel(player)
 if (selection === 1) showRankCustomizeMenu(player)
 })
 .catch(e => {
 player.sendMessage(`§cForm error: ${e.message}`)
 console.warn(`Form error in listAllRank: ${e}`)
 })
}
const openPlayerSelectionForRank = player => {
 const players = getPlayers(),
 names = players.map(p => p.name)
 if (!names.length) {
 player.sendMessage("§cNo players available")
 openAdminPanel(player)
 return
 }
 new ModalFormData()
 .title("Set Rank")
 .dropdown("Player", names)
 .dropdown("Rank", customRankList.length ? customRankList.concat(uuidRanks) : uuidRanks)
 .show(player)
 .then(({ canceled, cancelationReason, formValues }) => {
 if (canceled) {
 if (cancelationReason === "UserBusy") return
 openAdminPanel(player)
 return
 }
 if (!formValues?.length) return
 const [idx, rankIdx] = formValues,
 selPlayer = players[idx],
 ranks = customRankList.length ? customRankList.concat(uuidRanks) : uuidRanks
 if (!selPlayer || rankIdx < 0 || rankIdx >= ranks.length) return player.sendMessage("§cInvalid selection")
 setRank(selPlayer, ranks[rankIdx])
 openAdminPanel(player)
 })
 .catch(e => player.sendMessage(`§cForm error: ${e.message}`))
}
const openPlayerSelectionForRemoval = player => {
 const players = getPlayers(),
 names = players.map(p => p.name)
 if (!names.length) {
 player.sendMessage("§cNo players available")
 openAdminPanel(player)
 return
 }
 new ModalFormData()
 .title("Remove Rank")
 .dropdown("Player", names)
 .show(player)
 .then(({ canceled, cancelationReason, formValues }) => {
 if (canceled) {
 if (cancelationReason === "UserBusy") return
 openAdminPanel(player)
 return
 }
 if (!formValues?.length) return
 const selPlayer = players.find(p => p.name === names[formValues[0]])
 if (!selPlayer) return player.sendMessage("§cPlayer not found")
 removeRank(selPlayer)
 openAdminPanel(player)
 })
 .catch(e => player.sendMessage(`§cForm error: ${e.message}`))
}
const addCustomRank = player => {
 new ActionFormData()
 .title("Manage Custom Ranks")
 .body("§7Add or remove custom text-based ranks.")
 .button("Add New Rank", "textures/ui/plus")
 .button("Delete Rank", "textures/ui/minus")
 .button("Back", "textures/ui/arrow_left")
 .show(player)
 .then(({ canceled, cancelationReason, selection }) => {
 if (canceled) {
 if (cancelationReason === "UserBusy") return
 openAdminPanel(player)
 return
 }
 if (selection === 0) showAddCustomRankForm(player)
 if (selection === 1) showDeleteCustomRankForm(player)
 if (selection === 2) openAdminPanel(player)
 })
 .catch(e => player.sendMessage(`§cForm error: ${e.message}`))
}
const showAddCustomRankForm = player => {
 new ModalFormData()
 .title("Add Custom Rank")
 .textField("Rank Name", "Enter rank name", { defaultValue: "Custom Rank" })
 .show(player)
 .then(({ canceled, cancelationReason, formValues }) => {
 if (canceled) {
 if (cancelationReason === "UserBusy") return
 addCustomRank(player)
 return
 }
 if (!formValues?.length) return
 const rank = formValues[0]?.trim()
 if (!rank) {
 player.sendMessage("§cRank name cannot be empty")
 showAddCustomRankForm(player)
 return
 }
 if (customRankList.includes(rank)) {
 player.sendMessage("§cRank already exists in custom list!")
 } else {
 customRankList.push(rank)
 updateAllRanksCache()
 RankDatabase.saveCustomRankList(customRankList)
 try {
 const ranks = getStoredCustomRanks()
 const rankId = getCustomRankId(rank)
 if (!ranks[rankId]) {
 ranks[rankId] = {
 name: rank,
 color: "§f", 
 prefix: `§7[${rank}§7]`, 
 commands: {
 "+help": {
 cmd: "say Help command executed", 
 msg: "§aHelp menu shown"
 }
 }
 }
 }
 saveStoredCustomRanks(ranks)
 } catch (e) {
 console.warn("Error auto-creating rank definition:", e)
 }
 player.sendMessage(`§aCustom rank '${rank}' has been added to the list!`)
 player.playSound("random.levelup")
 }
 addCustomRank(player)
 })
 .catch(e => player.sendMessage(`§cForm error: ${e.message}`))
}
export const deleteRankByName = (player, rankName) => {
 const index = customRankList.indexOf(rankName)
 if (index !== -1) {
 customRankList.splice(index, 1)
 updateAllRanksCache()
 RankDatabase.saveCustomRankList(customRankList)
 }
 let definitionDeleted = false
 try {
 const ranks = getStoredCustomRanks()
 if (Object.keys(ranks).length) {
 const rankId = getCustomRankId(rankName)
 if (ranks[rankId]) {
 delete ranks[rankId]
 saveStoredCustomRanks(ranks)
 definitionDeleted = true
 }
 }
 } catch (e) {
 console.warn("Error cleaning up rank definition:", e)
 }
 if (index === -1 && !definitionDeleted) {
 return false
 }
 const players = [...world.getPlayers()]
 const rankTag = `rank:${rankName}`
 for (const p of players) {
 if (p.hasTag(rankTag)) {
 p.removeTag(rankTag)
 setRank(p, defaultRank)
 p.sendMessage(`§eYour rank '${rankName}' has been deleted. You are now '${defaultRank}'.`)
 }
 }
 player.sendMessage(`§aCustom rank '${rankName}' has been fully deleted!`)
 player.playSound("random.pop")
 return true
}
const showDeleteCustomRankForm = player => {
 if (customRankList.length === 0) {
 player.sendMessage("§cNo custom ranks to delete.")
 addCustomRank(player)
 return
 }
 new ModalFormData()
 .title("Delete Custom Rank")
 .dropdown("Select Rank to Delete", customRankList)
 .show(player)
 .then(({ canceled, cancelationReason, formValues }) => {
 if (canceled) {
 if (cancelationReason === "UserBusy") return
 addCustomRank(player)
 return
 }
 if (!formValues?.length) return
 const index = formValues[0]
 const rankName = customRankList[index]
 if (rankName) {
 deleteRankByName(player, rankName)
 }
 addCustomRank(player)
 })
 .catch(e => player.sendMessage(`§cForm error: ${e.message}`))
}
export const setDefaultRank = player => {
 const tags = player.getTags().filter(t => t.startsWith(RANK_PREFIX))
 for (const tag of tags) {
 player.removeTag(tag)
 }
 player.addTag(`${RANK_PREFIX}${defaultRank}`)
 console.warn(`Set default rank '${defaultRank}' for ${player.name}`)
}
const setDefaultRankMenu = player => {
 const ranks = customRankList.length ? customRankList.concat(uuidRanks) : uuidRanks
 new ModalFormData()
 .title("Set Default Rank")
 .dropdown("Current: " + defaultRank + "\nChoose new default", ranks, {
 defaultValueIndex: ranks.indexOf(defaultRank),
 })
 .show(player)
 .then(({ canceled, formValues }) => {
 if (canceled || !formValues?.length) return
 defaultRank = ranks[formValues[0]]
 RankDatabase.saveDefaultRank(defaultRank)
 player.sendMessage("§aDefault rank updated to: " + defaultRank)
 player.playSound("random.levelup")
 })
 .catch(e => player.sendMessage("§cForm error: " + e.message))
}
export function getAllRanks() {
 if (!isRanksLoaded) loadRanks()
 return allRanksCache
}
export function isCustomRank(rank) {
 return customRankList.includes(rank)
}
