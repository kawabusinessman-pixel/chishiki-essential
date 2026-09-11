import { world, system, ActionFormData, ModalFormData } from "../../core.js"
import { Database } from "../../function/Database.js"
import { formatScoreboardDateTime, getScoreboardTimestamp } from "../../function/timeSystem.js"
import { getAllRanks, RANK_PREFIX, setDefaultRank, isPlayerValid } from "./rank.js"

const CREDIT = "KiworaID"
const SUBSCRIPTION_PREFIX = "subscription:"
const CACHE_DURATION = 5000
const subscriptionDB = Database.getDatabase("rankSubscriptions")
const playerDB = Database.getDatabase("players")

let subscribedPlayersCache = null
let lastCacheUpdate = 0

export const SUBSCRIPTION_PERIODS = {
 "10_seconds": 10 * 1000,
 "30_seconds": 30 * 1000,
 "1_minute": 60 * 1000,
 "5_minutes": 5 * 60 * 1000,
 "1_day": 24 * 60 * 60 * 1000,
 "3_days": 3 * 24 * 60 * 60 * 1000,
 "1_week": 7 * 24 * 60 * 60 * 1000,
 "2_weeks": 14 * 24 * 60 * 60 * 1000,
 "1_month": 30 * 24 * 60 * 60 * 1000,
 "3_months": 90 * 24 * 60 * 60 * 1000,
 "6_months": 180 * 24 * 60 * 60 * 1000,
 "1_year": 365 * 24 * 60 * 60 * 1000,
}

export const PERIOD_NAMES = {
 "10_seconds": "10 Seconds",
 "30_seconds": "30 Seconds",
 "1_minute": "1 Minute",
 "5_minutes": "5 Minutes",
 "1_day": "1 Day",
 "3_days": "3 Days",
 "1_week": "1 Week",
 "2_weeks": "2 Weeks",
 "1_month": "1 Month",
 "3_months": "3 Months",
 "6_months": "6 Months",
 "1_year": "1 Year",
}

function isReady() {
 return subscriptionDB.isInitialized && playerDB.isInitialized
}

async function waitReady() {
 await subscriptionDB.ready()
 await playerDB.ready()
}

function getStoredPlayers() {
 try {
 const players = playerDB.get("playerList", [])
 return Array.isArray(players) ? players : []
 } catch {
 return []
 }
}

function saveStoredPlayers(players) {
 playerDB.set("playerList", [...new Set(players.filter(Boolean))])
}

function addStoredPlayer(playerName) {
 if (!playerName) return
 const players = getStoredPlayers()
 if (players.includes(playerName)) return
 players.push(playerName)
 saveStoredPlayers(players)
}

function getSubscriptions() {
 const now = Date.now()
 if (subscribedPlayersCache && now - lastCacheUpdate < CACHE_DURATION) {
 return subscribedPlayersCache
 }

 try {
 const subscriptions = subscriptionDB.get("subscriptions", {})
 subscribedPlayersCache = subscriptions && typeof subscriptions === "object" ? subscriptions : {}
 lastCacheUpdate = now
 return subscribedPlayersCache
 } catch {
 return {}
 }
}

function saveSubscriptions(subscriptions) {
 try {
 subscriptionDB.set("subscriptions", subscriptions)
 subscribedPlayersCache = subscriptions
 lastCacheUpdate = Date.now()
 return true
 } catch {
 return false
 }
}

function getOnlinePlayers() {
 return [...world.getPlayers()]
}

function getOnlinePlayer(playerName) {
 return getOnlinePlayers().find(player => player.name === playerName)
}

async function getPlayerList() {
 await waitReady()
 const onlinePlayers = getOnlinePlayers()
 const onlineNames = onlinePlayers.map(player => player.name)

 for (const playerName of onlineNames) {
 addStoredPlayer(playerName)
 }

 const allPlayers = [...new Set([...onlineNames, ...getStoredPlayers()])]
 return allPlayers.map(name => {
 const isOnline = onlineNames.includes(name)
 return {
 name,
 isOnline,
 display: `${name} [${isOnline ? "§aONLINE" : "§4OFFLINE"}§f]`,
 }
 })
}

export function formatDuration(ms) {
 const seconds = Math.max(0, Math.floor(ms / 1000))
 const days = Math.floor(seconds / 86400)
 const hours = Math.floor((seconds % 86400) / 3600)
 const minutes = Math.floor((seconds % 3600) / 60)
 const secs = seconds % 60
 const parts = []

 if (days) parts.push(`${days}d`)
 if (hours) parts.push(`${hours}h`)
 if (minutes) parts.push(`${minutes}m`)
 if (secs || !parts.length) parts.push(`${secs}s`)

 return parts.join(" ")
}

function isActive(subscription, now = getScoreboardTimestamp()) {
 return Boolean(subscription && !subscription.removedAt && Number(subscription.endTime) > now)
}

function removeTags(player, prefix) {
 for (const tag of player.getTags().filter(tag => tag.startsWith(prefix))) {
 player.removeTag(tag)
 }
}

function applySubscriptionRank(player, subscription) {
 removeTags(player, RANK_PREFIX)
 removeTags(player, SUBSCRIPTION_PREFIX)
 player.addTag(`${RANK_PREFIX}${subscription.rank}`)
 player.addTag(`${SUBSCRIPTION_PREFIX}${Math.floor(subscription.endTime)}`)
}

function resetSubscriptionRank(player) {
 removeTags(player, SUBSCRIPTION_PREFIX)
 setDefaultRank(player)
}

function getTaggedSubscriptionEnd(player) {
 const endTimes = player
 .getTags()
 .filter(tag => tag.startsWith(SUBSCRIPTION_PREFIX))
 .map(tag => Number(tag.slice(SUBSCRIPTION_PREFIX.length)))
 .filter(Number.isFinite)

 return endTimes.length ? Math.max(...endTimes) : 0
}

function notifyExpired(player) {
 player.sendMessage("§cYour rank subscription has expired!")
 player.playSound("random.break")
}

function notifyRemoved(player) {
 player.sendMessage("§cYour rank subscription has been removed!")
 player.playSound("random.break")
}

function cleanupLegacyExpiredTag(player, subscriptions, now) {
 if (subscriptions[player.name]) return false

 const taggedEndTime = getTaggedSubscriptionEnd(player)
 if (!taggedEndTime || taggedEndTime > now) return false

 resetSubscriptionRank(player)
 notifyExpired(player)
 return true
}

function handleInactiveSubscription(playerName, subscription, subscriptions, now) {
 const player = getOnlinePlayer(playerName)

 if (player) {
 resetSubscriptionRank(player)
 subscription.removedAt ? notifyRemoved(player) : notifyExpired(player)
 delete subscriptions[playerName]
 return true
 }

 if (!subscription.removedAt && !subscription.expiredAt) {
 subscription.expiredAt = now
 subscription.isOffline = true
 return true
 }

 return false
}

function checkExpiredSubscriptions() {
 if (!isReady()) return

 const now = getScoreboardTimestamp()
 const subscriptions = getSubscriptions()
 let changed = false

 for (const [playerName, subscription] of Object.entries(subscriptions)) {
 if (isActive(subscription, now)) continue
 changed = handleInactiveSubscription(playerName, subscription, subscriptions, now) || changed
 }

 for (const player of getOnlinePlayers()) {
 cleanupLegacyExpiredTag(player, subscriptions, now)
 }

 if (changed) saveSubscriptions(subscriptions)
}

async function showCreateSubscriptionMenu(player) {
 try {
 const players = await getPlayerList()
 if (!players.length) {
 players.push({
 name: player.name,
 isOnline: true,
 display: `${player.name} [§aONLINE§f]`,
 })
 }

  const ranks = getAllRanks().filter(rank => rank.trim())
 if (!ranks.length) {
 player.sendMessage("§cNo ranks available!")
 return showRankSubscriptionAdminMenu(player)
 }

 const periodKeys = Object.keys(SUBSCRIPTION_PERIODS)
 const periodNames = periodKeys.map(key => PERIOD_NAMES[key])
 const form = new ModalFormData()
 .title("Create Rank Subscription")
 .dropdown("§fSelect Player\n§6Choose player to set rank", players.map(item => item.display), {
 defaultValueIndex: 0,
 tooltip: "§6Select player to give subscription rank",
 })
 .dropdown("§fSelect Rank\n§6Choose rank to give", ranks, {
 defaultValueIndex: 0,
 tooltip: "§6Select rank to give to player",
 })
 .dropdown("§fSelect Duration\n§6Choose subscription duration", periodNames, {
 defaultValueIndex: 0,
 tooltip: "§6Select how long the rank will be active",
 })
 .toggle("§fConfirm\n§6Confirm subscription settings", {
 defaultValue: true,
 tooltip: "§6Confirm to set rank subscription",
 })

 const response = await form.show(player)
 if (response.canceled || !response.formValues?.[3]) return showRankSubscriptionAdminMenu(player)

 const [playerIndex, rankIndex, periodIndex] = response.formValues
 const selectedPlayer = players[playerIndex]
 const selectedRank = ranks[rankIndex]
 const selectedPeriodKey = periodKeys[periodIndex]

 if (!selectedPlayer || !selectedRank || !selectedPeriodKey) {
 player.sendMessage("§cInvalid subscription data!")
 return showRankSubscriptionAdminMenu(player)
 }

 const now = getScoreboardTimestamp()
 const onlinePlayer = getOnlinePlayer(selectedPlayer.name)
 const subscription = {
 rank: selectedRank,
 startTime: now,
 endTime: now + SUBSCRIPTION_PERIODS[selectedPeriodKey],
 durationKey: selectedPeriodKey,
 issuedBy: player.name,
 isOffline: !onlinePlayer,
 credit: CREDIT,
 }

 const subscriptions = getSubscriptions()
 subscriptions[selectedPlayer.name] = subscription

 if (!saveSubscriptions(subscriptions)) {
 player.sendMessage("§cFailed to save subscription data!")
 return showRankSubscriptionAdminMenu(player)
 }

 if (onlinePlayer) {
 applySubscriptionRank(onlinePlayer, subscription)
 onlinePlayer.sendMessage(`§aSubscription rank §6${selectedRank} §ahas been activated!`)
 onlinePlayer.sendMessage(`§aValid until: §f${formatScoreboardDateTime(subscription.endTime)}`)
 onlinePlayer.playSound("random.levelup")
 }

 player.sendMessage(`§aSubscription rank §6${selectedRank} §ahas been set for §f${selectedPlayer.name}§a!`)
 world.sendMessage(`[RANK SYSTEM]\n§f${selectedPlayer.name} §ahas received rank §6${selectedRank} §afor §f${PERIOD_NAMES[selectedPeriodKey]}`)
 return showRankSubscriptionAdminMenu(player)
 } catch {
 player.sendMessage("§cError creating subscription!")
 return showRankSubscriptionAdminMenu(player)
 }
}

async function showRemoveSubscriptionMenu(player) {
 try {
 await waitReady()

 const subscriptions = getSubscriptions()
 const now = getScoreboardTimestamp()
 const activeSubscriptions = Object.entries(subscriptions)
 .filter(([, subscription]) => isActive(subscription, now))
 .map(([playerName, subscription]) => ({
 name: playerName,
 display: `${playerName} - ${subscription.rank} (${formatDuration(subscription.endTime - now)})${subscription.isOffline ? " [OFFLINE]" : ""}`,
 }))

 if (!activeSubscriptions.length) {
 const form = new ActionFormData().title("Error").body("§cNo active subscriptions!").button("OK")
 await form.show(player)
 return showRankSubscriptionAdminMenu(player)
 }

 const form = new ModalFormData()
 .title("Remove Subscription")
 .dropdown("§fSelect Subscription\n§6Choose subscription to remove", activeSubscriptions.map(item => item.display), {
 defaultValueIndex: 0,
 tooltip: "§6Select subscription to remove",
 })
 .toggle("§fConfirm\n§6Confirm subscription removal", {
 defaultValue: true,
 tooltip: "§6Confirm to remove subscription",
 })

 const response = await form.show(player)
 if (response.canceled || !response.formValues?.[1]) return showRankSubscriptionAdminMenu(player)

 const selectedSubscription = activeSubscriptions[response.formValues[0]]
 const subscription = subscriptions[selectedSubscription.name]
 const onlinePlayer = getOnlinePlayer(selectedSubscription.name)

 if (onlinePlayer) {
 resetSubscriptionRank(onlinePlayer)
 notifyRemoved(onlinePlayer)
 delete subscriptions[selectedSubscription.name]
 } else {
 subscription.removedAt = now
 subscription.isOffline = true
 }

 if (!saveSubscriptions(subscriptions)) {
 player.sendMessage("§cFailed to remove subscription!")
 return showRankSubscriptionAdminMenu(player)
 }

 player.sendMessage(`§aSubscription for §f${selectedSubscription.name} §ahas been removed!`)
 return showRankSubscriptionAdminMenu(player)
 } catch {
 player.sendMessage("§cError removing subscription!")
 return showRankSubscriptionAdminMenu(player)
 }
}

async function showSubscriptionList(player) {
 try {
 await waitReady()

 const subscriptions = getSubscriptions()
 const now = getScoreboardTimestamp()
 const activeSubscriptions = Object.entries(subscriptions)
 .filter(([, subscription]) => isActive(subscription, now))
 .map(([playerName, subscription]) => ({
 name: playerName,
 rank: subscription.rank,
 timeLeft: formatDuration(subscription.endTime - now),
 issuedBy: subscription.issuedBy,
 startDate: formatScoreboardDateTime(subscription.startTime),
 endDate: formatScoreboardDateTime(subscription.endTime),
 isOffline: !getOnlinePlayer(playerName),
 }))

 const body = activeSubscriptions.length
 ? activeSubscriptions.map(subscription => [
 `§fPlayer: §e${subscription.name} ${subscription.isOffline ? "§7[OFFLINE]§f" : "§a[ONLINE]§f"}`,
 `§fRank: §6${subscription.rank}`,
 `§fTime Left: §a${subscription.timeLeft}`,
 `§fIssued by: §e${subscription.issuedBy}`,
 `§fStart: §7${subscription.startDate}`,
 `§fEnd: §7${subscription.endDate}`,
 ].join("\n")).join("\n\n")
 : "§cNo active subscriptions."

 const form = new ActionFormData()
 .title("Subscription List")
 .body(body)
 .button("Back")

 await form.show(player)
 return showRankSubscriptionAdminMenu(player)
 } catch {
 player.sendMessage("§cError displaying subscription list!")
 return showRankSubscriptionAdminMenu(player)
 }
}

export async function showRankSubscriptionAdminMenu(player) {
 try {
 await waitReady()

 const form = new ActionFormData()
 .title("Rank Subscription Admin")
 .body(`§7Credit: §e${CREDIT}\n\n§eManage player rank subscriptions:`)
 .button("§fCreate Subscription\n§8Add new subscription", "textures/ui/icon_recipe_item")
 .button("§fRemove Subscription\n§8Remove existing subscription", "textures/ui/trash_default")
 .button("§fSubscription List\n§8View all subscriptions", "textures/ui/copy")
 .button("§fBack\n§8Return to main menu", "textures/ui/arrow_left")

 const response = await form.show(player)
 if (response.canceled) return

 switch (response.selection) {
 case 0:
 return showCreateSubscriptionMenu(player)
 case 1:
 return showRemoveSubscriptionMenu(player)
 case 2:
 return showSubscriptionList(player)
 default:
 return
 }
 } catch {
 player.sendMessage("§cError displaying admin rank subscription menu!")
 }
}

export async function showRankSubscriptionStatusMenu(player) {
 try {
 await waitReady()

 const subscriptions = getSubscriptions()
 const subscription = subscriptions[player.name]
 const now = getScoreboardTimestamp()
 const body = isActive(subscription, now)
 ? [
 "§fYour active subscription:",
 "",
 `§fRank: §6${subscription.rank}`,
 `§fTime Left: §a${formatDuration(subscription.endTime - now)}`,
 `§fIssued by: §e${subscription.issuedBy}`,
 `§fStart: §7${formatScoreboardDateTime(subscription.startTime)}`,
 `§fEnd: §7${formatScoreboardDateTime(subscription.endTime)}`,
 ].join("\n")
 : "§cYou don't have any active rank subscription."

 const form = new ActionFormData()
 .title("Rank Subscription Status")
 .body(body)
 .button("Back")

 await form.show(player)
 } catch {
 player.sendMessage("§cError displaying subscription status!")
 }
}

function syncPlayerSubscription(player) {
 if (!isReady()) {
 system.runTimeout(() => syncPlayerSubscription(player), 20)
 return
 }

 addStoredPlayer(player.name)

 const subscriptions = getSubscriptions()
 const subscription = subscriptions[player.name]
 const now = getScoreboardTimestamp()

 if (!subscription) {
 cleanupLegacyExpiredTag(player, subscriptions, now)
 return
 }

 if (!isActive(subscription, now)) {
 resetSubscriptionRank(player)
 subscription.removedAt ? notifyRemoved(player) : notifyExpired(player)
 delete subscriptions[player.name]
 saveSubscriptions(subscriptions)
 return
 }

 subscription.isOffline = false
 saveSubscriptions(subscriptions)
 applySubscriptionRank(player, subscription)
 player.sendMessage(`§aRank subscription §6${subscription.rank} §ais still active!`)
 player.sendMessage(`§aValid until: §f${formatScoreboardDateTime(subscription.endTime)}`)
 player.playSound("random.levelup")
}

world.afterEvents.playerSpawn.subscribe(event => {
 if (event.initialSpawn === false) return
 syncPlayerSubscription(event.player)
})

world.beforeEvents.playerLeave.subscribe(({ player }) => {
 if (!isReady()) return

 const subscriptions = getSubscriptions()
 const subscription = subscriptions[player.name]

 if (!isActive(subscription)) return

 subscription.isOffline = true
 saveSubscriptions(subscriptions)
})

system.runInterval(checkExpiredSubscriptions, 100)

export async function extendSubscription(player, periodKey) {
 try {
 await waitReady()

 const subscriptions = getSubscriptions()
 const subscription = subscriptions[player.name]
 const now = getScoreboardTimestamp()

 if (!isActive(subscription, now)) {
 player.sendMessage("§cYou don't have an active subscription to extend!")
 return false
 }

 const extensionTime = SUBSCRIPTION_PERIODS[periodKey]
 if (!extensionTime) {
 player.sendMessage("§cInvalid subscription period!")
 return false
 }

 subscription.endTime += extensionTime
 subscription.removedAt = undefined
 subscription.expiredAt = undefined

 if (!saveSubscriptions(subscriptions)) {
 player.sendMessage("§cFailed to extend subscription!")
 return false
 }

 applySubscriptionRank(player, subscription)
 player.sendMessage(`§aYour §6${subscription.rank} §asubscription has been extended!`)
 player.sendMessage(`§aNew expiration date: §f${formatScoreboardDateTime(subscription.endTime)}`)
 player.playSound("random.levelup")
 return true
 } catch {
 player.sendMessage("§cError extending subscription!")
 return false
 }
}

/**
 * Grant or extend a rank subscription for a player.
 * @param {import("@minecraft/server").Player} player
 * @param {string} rankName
 * @param {string|number} durationKeyOrMs
 * @param {string} [issuedBy="Redeem Code"]
 * @returns {Promise<boolean>}
 */
export async function addPlayerSubscription(player, rankName, durationKeyOrMs, issuedBy = "Redeem Code") {
  try {
    await waitReady()
    const now = getScoreboardTimestamp()
    const subscriptions = getSubscriptions()
    const existing = subscriptions[player.name]

    let durationMs = 0
    let durationKey = null
    if (typeof durationKeyOrMs === "string" && SUBSCRIPTION_PERIODS[durationKeyOrMs]) {
      durationKey = durationKeyOrMs
      durationMs = SUBSCRIPTION_PERIODS[durationKeyOrMs]
    } else if (typeof durationKeyOrMs === "number" && Number.isFinite(durationKeyOrMs) && durationKeyOrMs > 0) {
      durationMs = durationKeyOrMs
      durationKey = Object.keys(SUBSCRIPTION_PERIODS).find(k => SUBSCRIPTION_PERIODS[k] === durationMs) || "custom"
    } else {
      durationKey = "1_month"
      durationMs = SUBSCRIPTION_PERIODS["1_month"]
    }

    let startTime = now
    let endTime = now + durationMs

    if (existing && isActive(existing, now) && String(existing.rank).toLowerCase() === String(rankName).toLowerCase()) {
      endTime = Number(existing.endTime) + durationMs
      startTime = existing.startTime || now
    }

    const subscription = {
      rank: rankName,
      startTime,
      endTime,
      durationKey,
      issuedBy,
      isOffline: false,
      credit: CREDIT,
    }

    subscriptions[player.name] = subscription
    if (!saveSubscriptions(subscriptions)) {
      console.warn("[RankSubscription] Failed to save subscription for", player.name)
      return false
    }

    applySubscriptionRank(player, subscription)
    player.sendMessage(`§aSubscription rank §6${rankName} §ahas been activated!`)
    player.sendMessage(`§aValid until: §f${formatScoreboardDateTime(subscription.endTime)}`)
    player.playSound("random.levelup")
    return true
  } catch (err) {
    console.warn("[RankSubscription] Error adding player subscription:", err)
    return false
  }
}

/**
 * Remove any active subscription data and timer tags for a player (e.g. when upgraded to permanent rank).
 * @param {import("@minecraft/server").Player|string} playerNameOrPlayer
 */
export function clearPlayerSubscription(playerNameOrPlayer) {
  const name = typeof playerNameOrPlayer === "string" ? playerNameOrPlayer : playerNameOrPlayer?.name
  if (!name) return
  const subscriptions = getSubscriptions()
  if (subscriptions[name]) {
    delete subscriptions[name]
    saveSubscriptions(subscriptions)
  }
  const player = typeof playerNameOrPlayer === "string" ? getOnlinePlayer(name) : playerNameOrPlayer
  if (player && isPlayerValid(player)) {
    removeTags(player, SUBSCRIPTION_PREFIX)
  }
}
