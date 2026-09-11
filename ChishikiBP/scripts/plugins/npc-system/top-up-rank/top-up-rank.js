import { ModalFormData, world, ActionFormData, MessageFormData } from "../../../core.js"
import { uuidRanks, setRank, getAllRanks, getPlayerRank, getRankInfo, getEffectiveRanks, setDefaultRank } from "../../ranks/rank.js"
import { rankDefault } from "../../ranks/rank_default.js"
import { RankDatabase } from "../../ranks/rank_database.js"
import { getFullMoney, addMoney, removeMoney, getMoneySystemMode } from "../../../function/moneySystem.js"
import { GlobalConfig } from "../../../function/GlobalConfig.js"
function getFullMoneyCustom(player, objectiveName) {
 const mode = getMoneySystemMode()
 if (mode === "objective") {
 const obj = world.scoreboard.getObjective(objectiveName || "money")
 if (!obj) return 0n
 const score = obj.getScore(player.scoreboardIdentity) || 0
 return BigInt(Math.max(score, 0))
 } else {
 return getFullMoney(player)
 }
}
function addMoneyCustom(player, amount, objectiveName) {
 const mode = getMoneySystemMode()
 if (mode === "objective") {
  const obj = world.scoreboard.getObjective(objectiveName || "money")
  if (!obj) return false
  try {
   const newScore = BigInt(obj.getScore(player.scoreboardIdentity) || 0) + BigInt(amount)
   const value = Number(newScore)
   if (!Number.isSafeInteger(value)) return false
   obj.setScore(player.scoreboardIdentity, value)
   return true
  } catch {
   return false
  }
 } else {
 return addMoney(player, amount)
 }
}
function removeMoneyCustom(player, amount, objectiveName) {
 const mode = getMoneySystemMode()
 if (mode === "objective") {
  const obj = world.scoreboard.getObjective(objectiveName || "money")
  if (!obj) return false
  try {
   const newScore = BigInt(obj.getScore(player.scoreboardIdentity) || 0) - BigInt(amount)
   if (newScore < 0n) return false
   const value = Number(newScore)
   if (!Number.isSafeInteger(value)) return false
   obj.setScore(player.scoreboardIdentity, value)
   return true
  } catch {
   return false
  }
 } else {
 return removeMoney(player, amount)
 }
}
const RANK_LIST_KEY = "topup_rank_list"
const CURRENCY_PREFIX_KEY = "topup_currency_prefix"
const OBJECTIVE_NAME_KEY = "topup_objective_name"
const RANK_STORE_PROPERTY = "kiw:rank_store"
const RANK_STORE_TITLE = "Rank Store"
function normalizeRankId(rank) {
 const value = String(rank || "").trim()
 return value.startsWith("rank:") ? value.slice(5) : value
}
function normalizeOwnedRanks(ranks) {
 if (!Array.isArray(ranks)) return []
 const normalized = []
 for (let i = 0; i < ranks.length; i++) {
  const rank = normalizeRankId(ranks[i])
  if (!rank || normalized.some(savedRank => savedRank.toLowerCase() === rank.toLowerCase())) continue
  normalized.push(rank)
 }
 return normalized
}
function findOwnedRank(store, rank) {
 const cleanRank = normalizeRankId(rank)
 if (!cleanRank) return null
 return store.owned.find(savedRank => savedRank.toLowerCase() === cleanRank.toLowerCase()) || null
}
function getRankStore(player) {
 let stored = {}
 try {
  const raw = player.getDynamicProperty(RANK_STORE_PROPERTY)
  if (typeof raw === "string") stored = JSON.parse(raw)
 } catch { }
 const owned = normalizeOwnedRanks(stored?.owned)
 const previous = findOwnedRank({ owned }, stored?.previous)
 return { owned, previous }
}
function saveRankStore(player, store) {
 try {
  const owned = normalizeOwnedRanks(store?.owned)
  const previous = findOwnedRank({ owned }, store?.previous)
  player.setDynamicProperty(RANK_STORE_PROPERTY, JSON.stringify({ owned, previous }))
  return true
 } catch {
  return false
 }
}
function isRankAvailable(rank) {
 const cleanRank = normalizeRankId(rank)
 if (!cleanRank) return false
 return getAllRanks().some(configuredRank => normalizeRankId(configuredRank).toLowerCase() === cleanRank.toLowerCase())
}
function getRankDisplay(rank) {
 const info = getRankInfo(rank)
 return {
  name: info?.name || rank,
  prefix: info?.prefix || rank,
 }
}
function parseRankPrice(value) {
 if (typeof value === "number") {
  if (!Number.isSafeInteger(value) || value < 0) return null
  return BigInt(value)
 }
 const text = String(value ?? "").trim()
 if (!/^\d+$/.test(text)) return null
 try {
  return BigInt(text)
 } catch {
  return null
 }
}
function getRanksForSale(rankList) {
 if (!Array.isArray(rankList)) return []
 return rankList.filter(rank => rank && isRankAvailable(rank.rank))
}
function findRankForSale(rankList, rank) {
 const cleanRank = normalizeRankId(rank)
 if (!cleanRank) return null
 return getRanksForSale(rankList).find(saleRank => normalizeRankId(saleRank.rank).toLowerCase() === cleanRank.toLowerCase()) || null
}
function addOwnedRank(player, rank) {
 const store = getRankStore(player)
 const existing = findOwnedRank(store, rank)
 if (existing) return { saved: true, rank: existing, alreadyOwned: true }
 const cleanRank = normalizeRankId(rank)
 if (!cleanRank) return { saved: false, rank: null, alreadyOwned: false }
 store.owned.push(cleanRank)
 if (!saveRankStore(player, store)) return { saved: false, rank: null, alreadyOwned: false }
 return { saved: true, rank: cleanRank, alreadyOwned: false }
}
function equipOwnedRank(player, rank) {
 const store = getRankStore(player)
 const savedRank = findOwnedRank(store, rank)
 if (!savedRank || !isRankAvailable(savedRank)) return { ok: false, rank: null, alreadyEquipped: false }
 const currentRank = normalizeRankId(getPlayerRank(player))
 if (currentRank.toLowerCase() === savedRank.toLowerCase()) {
  return { ok: true, rank: savedRank, alreadyEquipped: true }
 }
 store.previous = findOwnedRank(store, currentRank)
 if (!saveRankStore(player, store)) return { ok: false, rank: null, alreadyEquipped: false }
 setRank(player, savedRank)
 return { ok: true, rank: savedRank, alreadyEquipped: false }
}
function equipDefaultRank(player) {
 const store = getRankStore(player)
 const currentRank = normalizeRankId(getPlayerRank(player))
 store.previous = findOwnedRank(store, currentRank)
 if (!saveRankStore(player, store)) return false
 setDefaultRank(player)
 return true
}
function getRankData() {
 let rankList = []
 let prefix = "$"
 let objectiveName = "money"
 try {
 const savedRanks = GlobalConfig.get(RANK_LIST_KEY)
 if (savedRanks) rankList = typeof savedRanks === "string" ? JSON.parse(savedRanks) : savedRanks;
 } catch { }
 try {
 const savedPrefix = GlobalConfig.get(CURRENCY_PREFIX_KEY)
 if (savedPrefix) prefix = savedPrefix
 } catch { }
 try {
 const savedObj = GlobalConfig.get(OBJECTIVE_NAME_KEY)
 if (savedObj) objectiveName = savedObj
 } catch { }
 return { rankList, prefix, objectiveName }
}
function saveRankData(rankList, prefix, objectiveName) {
 try {
 GlobalConfig.set(RANK_LIST_KEY, rankList)
 } catch { }
 try {
 GlobalConfig.set(CURRENCY_PREFIX_KEY, prefix)
 } catch { }
 try {
 GlobalConfig.set(OBJECTIVE_NAME_KEY, objectiveName)
 } catch { }
}
function getAllConfiguredRanks() {
 if (typeof getEffectiveRanks === "function") {
  return getEffectiveRanks()
 }
 const merged = {}
 try {
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
 } catch { }
 try {
  const customRanks = RankDatabase.getCustomRanks() || {}
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
 } catch { }
 return merged
}
function getRankList() {
 if (globalThis.ALL_RANK_LIST && Array.isArray(globalThis.ALL_RANK_LIST) && globalThis.ALL_RANK_LIST.length > 0) {
  return globalThis.ALL_RANK_LIST
 }
 const effective = getAllConfiguredRanks()
 const result = []
 for (const [key, val] of Object.entries(effective)) {
  const cleanId = key.startsWith("rank:") ? key.slice(5) : key
  result.push({
   symbol: cleanId,
   name: val.name || cleanId,
   prefix: val.prefix || cleanId,
   color: val.color || "§f"
  })
 }
 if (result.length === 0) {
  return uuidRanks.map(r => ({ symbol: r, name: r, prefix: r, color: "§f" }))
 }
 return result
}
function buildRankSkillListText() {
 let msg = "§6=== RANK SKILLS & FEATURES ===§r\n\n"
 const allRanks = getAllConfiguredRanks()
 const entries = Object.entries(allRanks)
 if (entries.length === 0) {
  return "§7No rank skills configured."
 }
 for (let i = 0; i < entries.length; i++) {
  const rank = entries[i][1]
  const prefix = rank.prefix || ""
  const name = rank.name || ""
  const color = rank.color || "§f"
  msg += `§l${prefix} ${color}${name}§r\n`
  const cmds = Object.entries(rank.commands || {})
  if (cmds.length > 0) {
   for (let j = 0; j < cmds.length; j++) {
    const [cmd, info] = cmds[j]
    const cmdMsg = info?.msg ? `: §f${info.msg}` : ""
    msg += `§7- §e${cmd}${cmdMsg}§r\n`
   }
  } else {
   msg += `§7- (No skills configured)\n`
  }
  msg += "\n"
 }
 return msg
}
export function showTopUpRankMenu(player) {
 const { rankList, prefix, objectiveName } = getRankData()
 if (player.hasTag("admin")) return showTopUpRankAdmin(player, objectiveName)
 const saleRanks = getRanksForSale(rankList)
 const store = getRankStore(player)
 const form = new ActionFormData().title(RANK_STORE_TITLE).body("Unlock new ranks or switch to your saved ranks.")
 for (let i = 0; i < saleRanks.length; i++) {
 const r = saleRanks[i]
 const info = getRankInfo(r.rank)
 const displayName = r.name || info?.name || r.rank
 const displayIcon = info?.prefix || r.rank
 const owned = Boolean(findOwnedRank(store, r.rank))
 form.button(`${displayName} (${displayIcon})\n${owned ? "§aOwned - Tap to equip" : `${prefix}${r.price}`}`, "textures/ui/dressing_room_capes")
 }
 form.button("My Ranks", "textures/ui/book_edit_default")
 form.button("View Rank Skills", "textures/ui/creative_icon")
 form.button("Close", "textures/ui/cancel")
 form.show(player).then(({ canceled, selection }) => {
 if (canceled) return
 if (selection < saleRanks.length) {
  const rank = saleRanks[selection]
  if (findOwnedRank(store, rank.rank)) {
   const result = equipOwnedRank(player, rank.rank)
   if (!result.ok) return player.sendMessage("§cThis saved rank is no longer available.")
   if (result.alreadyEquipped) return player.sendMessage("§eThis rank is already active.")
   return player.sendMessage(`§aNow using ${getRankDisplay(result.rank).name}.`)
  }
  return confirmBuyRank(player, selection, saleRanks, prefix, objectiveName)
 }
 if (selection === saleRanks.length) return showSavedRanks(player)
 if (selection === saleRanks.length + 1) return showRankSkillList(player)
 })
}
function showSavedRanks(player) {
 const store = getRankStore(player)
 const availableRanks = store.owned.filter(isRankAvailable)
 const previousRank = store.previous && isRankAvailable(store.previous) ? store.previous : null
 let body = availableRanks.length
 ? "Choose a saved rank to equip. Switching never charges you again."
 : "You have not unlocked any ranks yet."
 if (store.owned.length > availableRanks.length) body += "\n\n§7Some saved ranks are unavailable because they are no longer configured."
 const form = new ActionFormData().title("My Ranks").body(body)
 for (let i = 0; i < availableRanks.length; i++) {
  const rank = availableRanks[i]
  const display = getRankDisplay(rank)
  form.button(`${display.name} (${display.prefix})\n§7Tap to equip`, "textures/ui/dressing_room_capes")
 }
 if (previousRank) form.button(`Revert to ${getRankDisplay(previousRank).name}`, "textures/ui/undoArrow")
 form.button("Use Default Rank", "textures/ui/refresh_light")
 form.button("Back", "textures/ui/arrow_left")
 form.show(player).then(({ canceled, selection }) => {
  if (canceled) return
  if (selection < availableRanks.length) {
   const result = equipOwnedRank(player, availableRanks[selection])
   if (!result.ok) return player.sendMessage("§cThis saved rank is no longer available.")
   if (result.alreadyEquipped) return player.sendMessage("§eThis rank is already active.")
   return player.sendMessage(`§aNow using ${getRankDisplay(result.rank).name}.`)
  }
  let actionIndex = availableRanks.length
  if (previousRank) {
   if (selection === actionIndex) {
    const result = equipOwnedRank(player, previousRank)
    if (!result.ok) return player.sendMessage("§cYour previous rank is no longer available.")
    return player.sendMessage(`§aReverted to ${getRankDisplay(result.rank).name}.`)
   }
   actionIndex++
  }
  if (selection === actionIndex) {
   if (!equipDefaultRank(player)) return player.sendMessage("§cFailed to switch to the default rank.")
   return player.sendMessage("§aNow using the default rank.")
  }
  if (selection === actionIndex + 1) showTopUpRankMenu(player)
 })
}
function showRankSkillList(player) {
 const msg = buildRankSkillListText()
 new ActionFormData()
 .title("Rank Skills/Features")
 .body(msg)
 .button("Back", "textures/ui/arrow_left")
 .show(player)
 .then(() => {
 showTopUpRankMenu(player)
 })
}
function confirmBuyRank(player, idx, rankList, prefix, objectiveName) {
 const r = rankList[idx]
 if (!r || !isRankAvailable(r.rank)) {
  player.sendMessage("§cThis rank is no longer available.")
  return
 }
 const tagRank = player.getTags().find(t => t.startsWith("rank:"))
 const currentRankSymbol = tagRank ? tagRank.replace("rank:", "") : null
 let currentRankName = "None"
 let currentRankIcon = ""
 if (currentRankSymbol) {
 const found = rankList.find(x => x.rank === currentRankSymbol)
 if (found) {
 currentRankName = found.name
 currentRankIcon = found.rank + " "
 } else {
 const currentInfo = getRankInfo(currentRankSymbol)
 if (currentInfo) {
 currentRankName = currentInfo.name || currentRankSymbol
 currentRankIcon = (currentInfo.prefix || currentRankSymbol) + " "
 } else {
 currentRankName = currentRankSymbol
 currentRankIcon = currentRankSymbol + " "
 }
 }
 }
 const targetInfo = getRankInfo(r.rank)
 const targetPrefix = targetInfo?.prefix || r.rank
 const targetName = r.name || targetInfo?.name || r.rank
 let skillsMsg = ""
 if (targetInfo?.commands && Object.keys(targetInfo.commands).length > 0) {
 skillsMsg = "\n§eIncluded Skills:\n"
 for (const [cmd, info] of Object.entries(targetInfo.commands)) {
 skillsMsg += `§7- §e${cmd}: §f${info?.msg || ""}\n`
 }
 }
 let msg = `§fYou are about to unlock this rank permanently!\n\n` +
 `§7Current Rank: §f${currentRankIcon}${currentRankName} §a→ §a${targetPrefix} ${targetName}\n` +
 `§7Price: §e${prefix}${r.price}\n` +
 skillsMsg +
 `\n§6Confirm to unlock §a${targetPrefix} ${targetName}§6.\n\n` +
 `§fUnlocked ranks are saved and can be switched anytime.\n` +
 `§7Are you sure you want to proceed?`
 new MessageFormData()
 .title("Unlock Rank")
 .body(msg)
 .button1("Unlock Rank")
 .button2("Cancel")
 .show(player)
 .then(({ selection }) => {
 if (selection === 0) processBuyRank(player, idx, rankList, prefix, objectiveName)
 })
}
function processBuyRank(player, idx, rankList, prefix, objectiveName) {
 const selectedRank = rankList[idx]
 if (!selectedRank) {
  player.sendMessage("§cThis rank is no longer available.")
  return
 }
 const owned = findOwnedRank(getRankStore(player), selectedRank.rank)
 if (owned) {
  const result = equipOwnedRank(player, owned)
  if (!result.ok) return player.sendMessage("§cThis saved rank is no longer available.")
  if (result.alreadyEquipped) return player.sendMessage("§eThis rank is already active.")
  player.sendMessage(`§aNow using ${getRankDisplay(result.rank).name}.`)
  return
 }
 const latestData = getRankData()
 const r = findRankForSale(latestData.rankList, selectedRank.rank)
 if (!r) {
  player.sendMessage("§cThis rank is no longer for sale.")
  return
 }
 if (String(objectiveName) !== String(latestData.objectiveName)) {
  player.sendMessage("§eThe currency settings have changed. Please reopen Rank Store to confirm this purchase.")
  return
 }
 const shownPrice = parseRankPrice(selectedRank.price)
 const price = parseRankPrice(r.price)
 if (shownPrice === null || price === null) {
  player.sendMessage("§cThis rank has an invalid price.")
  return
 }
 if (shownPrice !== price) {
  player.sendMessage("§eThe price has changed. Please reopen Rank Store to confirm this purchase.")
  return
 }
 prefix = latestData.prefix
 objectiveName = latestData.objectiveName
 if (price > 0n) {
  const saldo = getFullMoneyCustom(player, objectiveName)
  if (saldo < price) {
   player.sendMessage(`§cInsufficient balance! You need ${prefix}${r.price} to buy this rank.`)
   player.playSound("note.bass")
   return
  }
  const removed = removeMoneyCustom(player, price, objectiveName)
  if (!removed) {
   player.sendMessage("§cFailed to deduct money. Transaction cancelled.")
   player.playSound("note.bass")
   return
  }
 }
 const unlocked = addOwnedRank(player, r.rank)
 if (!unlocked.saved) {
  const refunded = price === 0n || addMoneyCustom(player, price, objectiveName)
  player.sendMessage(refunded ? "§cFailed to save your rank. Your money has been refunded." : "§cFailed to save your rank. Please contact an admin.")
  player.playSound("note.bass")
  return
 }
 const result = equipOwnedRank(player, unlocked.rank)
 if (!result.ok) {
  player.sendMessage(`§e${r.name || unlocked.rank} was unlocked and saved. Equip it later from My Ranks.`)
  return
 }
 player.sendMessage(`§aSuccessfully unlocked ${r.name || getRankDisplay(unlocked.rank).name}. It is now saved in My Ranks.`)
 player.playSound("random.levelup")
}
function showTopUpRankAdmin(player) {
 const { rankList, prefix, objectiveName } = getRankData()
 const mode = getMoneySystemMode()
 const isObjective = mode === "objective"
 let bodyText = "Manage ranks for sale and your saved ranks:"
 bodyText += `\n§7Money System Mode: §b${mode.toUpperCase()}`
 if (!isObjective) {
 bodyText += "\n§eNote: Custom objective only works if Money System mode is set to Objective!"
 }
 const form = new ActionFormData().title("Admin Rank Store").body(bodyText)
 for (let i = 0; i < rankList.length; i++) {
 const r = rankList[i]
 const info = getRankInfo(r.rank)
 const displayName = r.name || info?.name || r.rank
 const displayIcon = info?.prefix || r.rank
 form.button(`${displayName} (${displayIcon})\n${prefix}${r.price}`, "textures/ui/dressing_room_capes")
 }
 form.button("My Ranks", "textures/ui/book_edit_default")
 form.button("Add New Rank", "textures/ui/download_backup")
 form.button("Settings", "textures/ui/dev_glyph_color")
 form.button("View Rank Skills", "textures/ui/creative_icon")
 form.button("Close", "textures/ui/cancel")
 if (player.hasTag("admin")) {
 form.button("Customize NPC Skin", "textures/ui/dressing_room_skins")
 }
 form.show(player).then(({ canceled, selection }) => {
 if (canceled) return
 if (selection === rankList.length) return showSavedRanks(player)
 if (selection === rankList.length + 1) return addNewRank(player, rankList, prefix, objectiveName)
 if (selection === rankList.length + 2) return showTopUpSettings(player, rankList, prefix, objectiveName)
 if (selection === rankList.length + 3) return showRankSkillListAdmin(player)
 if (selection === rankList.length + 4) return
 if (player.hasTag("admin") && selection === rankList.length + 5) {
 player.runCommand("dialogue open @e[type=npc,c=1,r=5] @s")
 return
 }
 editOrDeleteRank(player, selection, rankList, prefix, objectiveName)
 })
}
function addNewRank(player, rankList, prefix, objectiveName) {
 const allRanks = getRankList()
 new ModalFormData()
 .title("Add Rank For Sale")
 .dropdown(
 "Rank",
 allRanks.map(r => `${r.name} (${r.prefix || r.symbol})`),
 { defaultValue: 0 }
 )
 .textField("Rank Name (Leave blank to use default name)", "Example: VIP", { defaultValue: "" })
 .textField("Price", "Example: 10000", { defaultValue: "" })
 .show(player)
 .then(({ canceled, formValues }) => {
 if (canceled) return
 const [idx, name, price] = formValues
 const rankObj = allRanks[idx]
 if (!rankObj) return
 const parsedPrice = parseRankPrice(price)
 if (parsedPrice === null) {
  player.sendMessage("§cPrice must be a whole number.")
  return addNewRank(player, rankList, prefix, objectiveName)
 }
 rankList.push({ rank: rankObj.symbol, name: name?.trim() || rankObj.name, price: parsedPrice.toString() })
 saveRankData(rankList, prefix, objectiveName)
 player.sendMessage("Rank added successfully!")
 showTopUpRankAdmin(player)
 })
}
function showTopUpSettings(player, rankList, prefix, objectiveName) {
 const mode = getMoneySystemMode()
 const isObjective = mode === "objective"
 let form = new ModalFormData().title("Rank Store Settings").textField("Currency Prefix", "Example: $, Rp, €, etc.", { defaultValue: prefix })
 if (isObjective) {
 form = form.textField("Objective Name", "Scoreboard objective for money (default: money)", { defaultValue: objectiveName || "money" })
 } else {
 form = form.textField("Objective Name (only works in Objective mode)", "Switch to Objective mode in Money System settings", { defaultValue: objectiveName || "money" })
 }
 form.show(player).then(({ canceled, formValues }) => {
 if (canceled) return showTopUpRankAdmin(player)
 const [newPrefix, newObjective] = formValues
 let changed = false
 let objName = objectiveName
 if (newPrefix && newPrefix.length > 0 && newPrefix !== prefix) {
 prefix = newPrefix
 changed = true
 player.sendMessage(`Currency prefix changed to: ${prefix}`)
 }
 if (isObjective && newObjective && newObjective.length > 0 && newObjective !== objectiveName) {
 objName = newObjective
 changed = true
 player.sendMessage(`Objective name changed to: ${objName}`)
 }
 if (changed) saveRankData(rankList, prefix, objName)
 showTopUpRankAdmin(player)
 })
}
function editOrDeleteRank(player, idx, rankList, prefix, objectiveName) {
 const r = rankList[idx]
 const info = getRankInfo(r.rank)
 const displayName = r.name || info?.name || r.rank
 const displayIcon = info?.prefix || r.rank
 new ActionFormData()
 .title("Edit/Delete Rank")
 .body(`${displayName} (${displayIcon})\n${prefix}${r.price}`)
 .button("Edit")
 .button("Delete")
 .button("Back")
 .show(player)
 .then(({ canceled, selection }) => {
 if (canceled) return
 if (selection === 0) return editRank(player, idx, rankList, prefix, objectiveName)
 if (selection === 1) {
 rankList.splice(idx, 1)
 saveRankData(rankList, prefix, objectiveName)
 player.sendMessage("Rank deleted!")
 showTopUpRankAdmin(player)
 }
 if (selection === 2) showTopUpRankAdmin(player)
 })
}
function editRank(player, idx, rankList, prefix, objectiveName) {
 const r = rankList[idx]
 new ModalFormData()
 .title("Edit Rank")
 .textField("Rank Name", "", { defaultValue: r.name })
 .textField("Price", "", { defaultValue: r.price.toString() })
 .show(player)
 .then(({ canceled, formValues }) => {
 if (canceled) return
 const [name, price] = formValues
 const parsedPrice = parseRankPrice(price)
 if (parsedPrice === null) {
  player.sendMessage("§cPrice must be a whole number.")
  return editRank(player, idx, rankList, prefix, objectiveName)
 }
 r.name = name || r.name
 r.price = parsedPrice.toString()
 saveRankData(rankList, prefix, objectiveName)
 player.sendMessage("Rank updated!")
 showTopUpRankAdmin(player)
 })
}
function showRankSkillListAdmin(player) {
 const msg = buildRankSkillListText()
 new ActionFormData()
 .title("Rank Skills/Features")
 .body(msg)
 .button("Back", "textures/ui/arrow_left")
 .show(player)
 .then(() => {
 showTopUpRankAdmin(player)
 })
}
