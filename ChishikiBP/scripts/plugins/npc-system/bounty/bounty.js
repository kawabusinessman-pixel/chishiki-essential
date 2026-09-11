import { system, world, ActionFormData, ModalFormData } from "../../../core.js"
import { Lang } from "../../../lib/Lang.js"
import { addMoney, removeMoney } from "../../../function/moneySystem.js"
import { addPlayerCoins, removePlayerCoins } from "../../tf-money/tf-money.js"
import { Database } from "../../../function/Database.js"
const bountyDB = Database.getDatabase("bounty")
function broadcastBountyMessage(makeMessage) {
 world.getPlayers().forEach(player => player.sendMessage(makeMessage(player)))
}
function getAllBounties() {
 return Array.from(bountyDB.values()).filter(b => b.status === "active")
}
function getPlayerBounties(name) {
 return getAllBounties().filter(b => b.target === name)
}
function getMySetBounties(name) {
 return getAllBounties().filter(b => b.setter === name)
}
function getActiveBountyBySetterAndTarget(setterName, targetName) {
 return getAllBounties().find(b => b.setter === setterName && b.target === targetName)
}
function normalizeBountyCurrency(currency) {
 return currency === "coin" ? "coin" : "money"
}
function getBountyCurrency() {
 const val = world.getDynamicProperty("bounty:currency")
 return normalizeBountyCurrency(val)
}
function setBountyCurrency(currency) {
 world.setDynamicProperty("bounty:currency", normalizeBountyCurrency(currency))
}
function getBountyCurrencyName(player, currency = getBountyCurrency()) {
 return Lang.t(player, normalizeBountyCurrency(currency) === "coin" ? "bounty.currency.coin" : "bounty.currency.money")
}
function getBountyRecordCurrency(bounty) {
 return normalizeBountyCurrency(bounty?.currency)
}
function formatBountyAmount(amount, currency = "money", player = null) {
 const value = amount?.toString ? amount.toString() : String(amount || 0)
 return normalizeBountyCurrency(currency) === "coin"
 ? Lang.t(player, "bounty.amount.coin", value)
 : Lang.t(player, "bounty.amount.money", value)
}
function removeBountyCurrency(player, amount, currency = "money") {
 return normalizeBountyCurrency(currency) === "coin" ? removePlayerCoins(player, Number(amount)) : removeMoney(player, amount)
}
function addBountyCurrency(player, amount, currency = "money") {
 if (!player) return false
 return normalizeBountyCurrency(currency) === "coin" ? addPlayerCoins(player, Number(amount)) : addMoney(player, amount)
}
function getMaxActiveBounties() {
 const val = world.getDynamicProperty("bounty:maxActive")
 const parsed = val !== undefined && val !== null ? parseInt(val) : 20
 return Number.isFinite(parsed) && parsed >= 0 ? parsed : 20
}
function setMaxActiveBounties(amount) {
 world.setDynamicProperty("bounty:maxActive", Math.max(0, amount).toString())
}
function getMinBounty() {
 const val = world.getDynamicProperty("bounty:minAmount")
 return val ? parseInt(val) : 5000
}
function setMinBounty(amount) {
 world.setDynamicProperty("bounty:minAmount", amount.toString())
}
function getRefundPercent() {
 const val = world.getDynamicProperty("bounty:refundPercent")
 return val ? parseInt(val) : 75
}
function setRefundPercent(percent) {
 world.setDynamicProperty("bounty:refundPercent", percent.toString())
}
function getBountyCooldown() {
 const val = world.getDynamicProperty("bounty:cooldown")
 return val ? parseInt(val) : 300
}
function setBountyCooldown(ms) {
 world.setDynamicProperty("bounty:cooldown", ms.toString())
}
function getBountyExpire() {
 const val = world.getDynamicProperty("bounty:expire");
 return val ? parseInt(val) : 3600000
}
function setBountyExpire(ms) {
 world.setDynamicProperty("bounty:expire", ms.toString())
}
function getLastBountyTime(player) {
 return player.getDynamicProperty("bounty:lastSet") || 0
}
function setLastBountyTime(player, time) {
 player.setDynamicProperty("bounty:lastSet", time)
}
function addBounty(setter, target, amount) {
 const minBounty = getMinBounty()
 const cooldown = getBountyCooldown()
 const expire = getBountyExpire()
 const maxActiveBounties = getMaxActiveBounties()
 const currency = getBountyCurrency()
 const now = Date.now()
 if (setter.name === target.name) return { ok: false, msg: Lang.t(setter, "bounty.err.self") }
 if (!Number.isInteger(amount) || amount < 1) return { ok: false, msg: Lang.t(setter, "bounty.err.invalid_amount") }
 if (amount < minBounty) return { ok: false, msg: Lang.t(setter, "bounty.err.min_amount", formatBountyAmount(minBounty, currency, setter)) }
 if (getActiveBountyBySetterAndTarget(setter.name, target.name)) return { ok: false, msg: Lang.t(setter, "bounty.err.already_active_target") }
 if (maxActiveBounties > 0 && getAllBounties().length >= maxActiveBounties) {
 return { ok: false, msg: Lang.t(setter, "bounty.err.max_active", maxActiveBounties) }
 }
 if (cooldown > 0) {
 const last = getLastBountyTime(setter)
 if (now - last < cooldown) {
 const left = Math.ceil((cooldown - (now - last)) / 1000)
 return { ok: false, msg: Lang.t(setter, "bounty.err.cooldown", left) }
 }
 }
 if (!removeBountyCurrency(setter, amount, currency)) return { ok: false, msg: Lang.t(setter, "bounty.err.insufficient_currency", getBountyCurrencyName(setter, currency)) }
 const id = Date.now() + "_" + Math.floor(Math.random() * 1000)
 bountyDB.set(id, {
 id,
 target: target.name,
 setter: setter.name,
 amount,
 currency,
 status: "active",
 created: now,
 expire: expire > 0 ? now + expire : 0,
 claimedBy: null
 })
 setLastBountyTime(setter, now)
 broadcastBountyMessage(player => Lang.t(player, "bounty.broadcast.set", setter.name, target.name, formatBountyAmount(amount, currency, player)))
 return { ok: true }
}
function getPlayerList(excludeName, viewer = null) {
 const onlinePlayers = world.getPlayers().map(p => p.name)
 const allPlayers = [...new Set(onlinePlayers)]
 return allPlayers
 .filter(name => name !== excludeName)
 .map(name => ({
 name,
 isOnline: onlinePlayers.includes(name),
 display: `${name} ${onlinePlayers.includes(name) ? Lang.t(viewer, "common.online") : Lang.t(viewer, "common.offline")}`
 }))
}
async function showAddBounty(player) {
 const minBounty = getMinBounty()
 const currency = getBountyCurrency()
 const players = getPlayerList(player.name, player).filter(p => p.isOnline)
 if (players.length === 0) return player.sendMessage(Lang.t(player, "bounty.err.no_other_online"))
 const form = new ModalFormData()
 .title(Lang.t(player, "bounty.add.title"))
 .dropdown(Lang.t(player, "bounty.add.target"), players.map(p => p.display), { defaultValue: 0 })
 .textField(Lang.t(player, "bounty.add.amount", getBountyCurrencyName(player, currency), formatBountyAmount(minBounty, currency, player)), minBounty.toString(), { defaultValue: minBounty.toString() })
 const res = await form.show(player)
 if (res.canceled) return
 const selected = players[res.formValues[0]]
 const targetPlayer = world.getPlayers().find(p => p.name === selected.name)
 if (!targetPlayer) {
 player.sendMessage(Lang.t(player, "bounty.err.target_offline"))
 return
 }
 if (getActiveBountyBySetterAndTarget(player.name, targetPlayer.name)) {
 player.sendMessage(Lang.t(player, "bounty.err.already_active_target"))
 return
 }
 const amount = parseInt(res.formValues[1])
 const result = addBounty(player, targetPlayer, amount)
 if (result.ok) player.sendMessage(Lang.t(player, "bounty.msg.set_success", selected.name))
 else player.sendMessage(result.msg)
}
function cancelBounty(setter, bounty) {
 if (bounty.status !== "active" || bounty.setter !== setter.name) return { ok: false, msg: Lang.t(setter, "bounty.err.cancel_denied") }
 const currency = getBountyRecordCurrency(bounty)
 bounty.status = "cancelled"
 bountyDB.set(bounty.id, bounty)
 const refund = Math.floor(bounty.amount * getRefundPercent() / 100)
 addBountyCurrency(setter, refund, currency)
 return { ok: true, refund, currency }
}
function claimBounty(killer, bounty) {
 if (bounty.status !== "active") return false
 const currency = getBountyRecordCurrency(bounty)
 bounty.status = "claimed"
 bounty.claimedBy = killer.name
 bountyDB.set(bounty.id, bounty)
 addBountyCurrency(killer, bounty.amount, currency)
 return true
}
world.afterEvents.entityDie.subscribe(ev => {
 const { deadEntity, damageSource } = ev
 if (!deadEntity || !damageSource?.damagingEntity) return
 if (deadEntity.typeId !== "minecraft:player" || damageSource.damagingEntity.typeId !== "minecraft:player") return
 const target = deadEntity.name
 const killer = damageSource.damagingEntity
 const bounties = getPlayerBounties(target)
 if (bounties.length === 0) return
 for (const bounty of bounties) {
 if (claimBounty(killer, bounty)) {
 const currency = getBountyRecordCurrency(bounty)
 killer.sendMessage(Lang.t(killer, "bounty.msg.reward", formatBountyAmount(bounty.amount, currency, killer)))
 broadcastBountyMessage(player => Lang.t(player, "bounty.broadcast.claimed", target, killer.name, formatBountyAmount(bounty.amount, currency, player)))
 }
 }
})
function checkExpiredBounties() {
 const now = Date.now()
 for (const bounty of getAllBounties()) {
 if (bounty.expire && now > bounty.expire && bounty.status === "active") {
 bounty.status = "expired"
 bountyDB.set(bounty.id, bounty)
 const setter = world.getPlayers().find(p => p.name === bounty.setter)
 const refund = Math.floor(bounty.amount * getRefundPercent() / 100)
 const currency = getBountyRecordCurrency(bounty)
 if (setter) {
 addBountyCurrency(setter, refund, currency)
 setter.sendMessage(Lang.t(setter, "bounty.msg.expired_refund", bounty.target, formatBountyAmount(refund, currency, setter)))
 }
 }
 }
}
system.runInterval(checkExpiredBounties, 100)
export async function showBountyMenu(player) {
 const isAdmin = typeof player.hasTag === 'function' && player.hasTag("admin")
 const myBounties = getMySetBounties(player.name)
 const hasActiveBounty = myBounties.length > 0
 const targetInfo = hasActiveBounty ? myBounties[0].target : null
 const maxActiveBounties = getMaxActiveBounties()
 const activeCount = getAllBounties().length
 const activeLimitText = maxActiveBounties > 0 ? `${activeCount}/${maxActiveBounties}` : `${activeCount}/${Lang.t(player, "common.unlimited")}`
 const form = new ActionFormData()
 .title(Lang.t(player, "bounty.menu.title"))
 .body(Lang.t(player, "bounty.menu.body", getBountyCurrencyName(player), activeLimitText) + (hasActiveBounty ? `\n${Lang.t(player, "bounty.menu.active_warning", targetInfo)}` : ""))
 .button(Lang.t(player, "bounty.menu.view"), "textures/ui/regeneration_effect")
 if (hasActiveBounty) {
 form.button(Lang.t(player, "bounty.menu.set_disabled"), "textures/ui/red_dot")
 } else {
 form.button(Lang.t(player, "bounty.menu.set"), "textures/ui/red_dot")
 }
 form.button(Lang.t(player, "bounty.menu.cancel"), "textures/ui/listx")
 if (isAdmin) form.button(Lang.t(player, "bounty.menu.settings"), "textures/ui/gear")
 if (isAdmin) form.button(Lang.t(player, "bounty.menu.customize_npc"), "textures/ui/dressing_room_skins")
 form.button(Lang.t(player, "common.close"), "textures/ui/cancel")
 const res = await form.show(player)
 if (res.canceled) return
 let idx = 0
 if (res.selection === idx++) return showBountyList(player)
 if (hasActiveBounty) idx++
 else if (res.selection === idx++) return showAddBounty(player)
 if (res.selection === idx++) return showCancelBounty(player)
 if (isAdmin && res.selection === idx++) return showBountySettings(player)
 if (isAdmin && res.selection === idx++) {
 player.runCommand('dialogue open @e[type=npc,c=1,r=5] @s')
 return
 }
}
async function showBountySettings(player) {
 const isAdmin = typeof player.hasTag === 'function' && player.hasTag("admin")
 if (!isAdmin) {
 showBountyMenu(player)
 return
 }
 const minBounty = getMinBounty()
 const refundPercent = getRefundPercent()
 const cooldown = getBountyCooldown()
 const expire = getBountyExpire()
 const maxActiveBounties = getMaxActiveBounties()
 const currency = getBountyCurrency()
 const form = new ModalFormData()
 .title(Lang.t(player, "bounty.settings.title"))
 .textField(Lang.t(player, "bounty.settings.min"), minBounty.toString(), { defaultValue: minBounty.toString(), tooltip: Lang.t(player, "bounty.settings.min.tooltip") })
 .textField(Lang.t(player, "bounty.settings.refund"), refundPercent.toString(), { defaultValue: refundPercent.toString(), tooltip: Lang.t(player, "bounty.settings.refund.tooltip") })
 .textField(Lang.t(player, "bounty.settings.cooldown"), (cooldown / 1000).toString(), { defaultValue: (cooldown / 1000).toString(), tooltip: Lang.t(player, "bounty.settings.cooldown.tooltip") })
 .textField(Lang.t(player, "bounty.settings.expire"), (expire / 60000).toString(), { defaultValue: (expire / 60000).toString(), tooltip: Lang.t(player, "bounty.settings.expire.tooltip") })
 .textField(Lang.t(player, "bounty.settings.max_active"), maxActiveBounties.toString(), { defaultValue: maxActiveBounties.toString(), tooltip: Lang.t(player, "bounty.settings.max_active.tooltip") })
 .dropdown(Lang.t(player, "bounty.settings.currency"), [Lang.t(player, "bounty.currency.money"), Lang.t(player, "bounty.currency.coin")], { defaultValueIndex: currency === "coin" ? 1 : 0 })
 const res = await form.show(player)
 if (res.canceled) {
 showBountyMenu(player)
 return
 }
 const newMin = parseInt(res.formValues[0])
 const newRefund = parseInt(res.formValues[1])
 const newCooldown = Math.max(0, parseInt(res.formValues[2]) || 0) * 1000
 const newExpire = Math.max(0, parseInt(res.formValues[3]) || 0) * 60000
 const newMaxActiveBounties = parseInt(res.formValues[4])
 const newCurrency = res.formValues[5] === 1 ? "coin" : "money"
 if (isNaN(newMin) || newMin < 1) {
 player.sendMessage(Lang.t(player, "bounty.err.invalid_min"))
 showBountySettings(player)
 return
 }
 if (isNaN(newRefund) || newRefund < 1 || newRefund > 100) {
 player.sendMessage(Lang.t(player, "bounty.err.invalid_refund"))
 showBountySettings(player)
 return
 }
 if (isNaN(newCooldown) || newCooldown < 0) {
 player.sendMessage(Lang.t(player, "bounty.err.invalid_cooldown"))
 showBountySettings(player)
 return
 }
 if (isNaN(newExpire) || newExpire < 0) {
 player.sendMessage(Lang.t(player, "bounty.err.invalid_expire"))
 showBountySettings(player)
 return
 }
 if (isNaN(newMaxActiveBounties) || newMaxActiveBounties < 0) {
 player.sendMessage(Lang.t(player, "bounty.err.invalid_max_active"))
 showBountySettings(player)
 return
 }
 setMinBounty(newMin)
 setRefundPercent(newRefund)
 setBountyCooldown(newCooldown)
 setBountyExpire(newExpire)
 setMaxActiveBounties(newMaxActiveBounties)
 setBountyCurrency(newCurrency)
 const maxText = newMaxActiveBounties > 0 ? newMaxActiveBounties.toString() : Lang.t(player, "common.unlimited")
 player.sendMessage(Lang.t(
 player,
 "bounty.settings.saved",
 formatBountyAmount(newMin, newCurrency, player),
 newRefund,
 newCooldown / 1000,
 newExpire / 60000,
 maxText,
 getBountyCurrencyName(player, newCurrency),
 ))
 showBountyMenu(player)
}
async function showBountyList(player) {
 const bounties = getAllBounties()
 const form = new ActionFormData().title(Lang.t(player, "bounty.list.title"))
 if (bounties.length === 0) form.body(Lang.t(player, "bounty.list.empty"))
 else bounties.forEach(b => form.button(Lang.t(player, "bounty.list.item", b.target, formatBountyAmount(b.amount, getBountyRecordCurrency(b), player), b.setter)))
 form.button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
 const res = await form.show(player)
 if (!res.canceled && res.selection === bounties.length) showBountyMenu(player)
}
async function showCancelBounty(player) {
 const myBounties = getMySetBounties(player.name)
 if (myBounties.length === 0) {
 player.sendMessage(Lang.t(player, "bounty.err.no_cancel"))
 return
 }
 const bounty = myBounties[0]
 const currency = getBountyRecordCurrency(bounty)
 const form = new ActionFormData()
 .title(Lang.t(player, "bounty.cancel.title"))
 .body(Lang.t(player, "bounty.cancel.body", bounty.target, formatBountyAmount(bounty.amount, currency, player), formatBountyAmount(Math.floor(bounty.amount * getRefundPercent() / 100), currency, player)))
 .button(Lang.t(player, "bounty.cancel.yes"), "textures/ui/realms_red_x")
 .button(Lang.t(player, "bounty.cancel.no"), "textures/ui/arrow_left")
 const res = await form.show(player)
 if (res.canceled || res.selection === 1) return showBountyMenu(player)
 const result = cancelBounty(player, bounty)
 if (result.ok) player.sendMessage(Lang.t(player, "bounty.cancel.success", formatBountyAmount(result.refund, result.currency, player)))
 else player.sendMessage(result.msg)
 showBountyMenu(player)
}
