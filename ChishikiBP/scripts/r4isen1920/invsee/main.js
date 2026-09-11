import { system as E, Player as b, EquipmentSlot as c, ItemStack as d, world as f, system, world, Player, ActionFormData, ModalFormData as q, ActionFormData as v } from '../../core.js';
import { getCustomItemConfig } from "../../admin_menu/customitem.js"
import { hasSnapshotChanged, isSessionParticipantMissing } from "./session-state.js"
import "../../board/_load.js"
import "../../function/_load.js"
import { hasPermission, showMainMenu } from "../../kiwora.js"
import { showMemberMenu } from "../../member.js"
import "../../plugins/launchpad/launchpad.js"
import "../../plugins/chest-shop/index.js"
import "../../plugins/emotes/index.js"
const INVSEE_USE_COOLDOWN_TICKS = 15
const USE_INVSEE_CUSTOM_UI = !0
const invseeUseCooldowns = new Map()
const activeInvseeSessions = new Map()
let invseeSyncRun
function isEntityValid(e) {
 try {
 const valid = e?.isValid
 return typeof valid === "function" ? valid.call(e) : valid !== false
 } catch {
 return false
 }
}
function setDynamicPropertyIfChanged(entity, key, previousValue, nextValue) {
 if (!hasSnapshotChanged(previousValue, nextValue)) return !1
 entity.setDynamicProperty(key, nextValue)
 return !0
}
function stopInvseeSyncIfIdle() {
 if (activeInvseeSessions.size || invseeSyncRun === undefined) return
 E.clearRun(invseeSyncRun)
 invseeSyncRun = undefined
}
function forgetInvseeSession(e) {
 if (e) activeInvseeSessions.delete(e.id)
 stopInvseeSyncIfIdle()
}
function removeInvseeSession(e) {
 forgetInvseeSession(e)
 try { if (isEntityValid(e)) e.remove() } catch { }
}
function syncActiveInvseeSessions() {
 for (const [id, entity] of activeInvseeSessions) {
 if (!isEntityValid(entity)) {
 activeInvseeSessions.delete(id)
 continue
 }
 try { C(entity) } catch {
 if (!isEntityValid(entity)) activeInvseeSessions.delete(id)
 }
 }
 stopInvseeSyncIfIdle()
}
function trackInvseeSession(entity) {
 if (!isEntityValid(entity)) return
 activeInvseeSessions.set(entity.id, entity)
 if (invseeSyncRun === undefined) invseeSyncRun = E.runInterval(syncActiveInvseeSessions, 2)
}
function cleanupInvseeSessionsForPlayer(playerId) {
 invseeUseCooldowns.delete(playerId)
 for (const [id, entity] of activeInvseeSessions) {
 if (!isEntityValid(entity)) {
 activeInvseeSessions.delete(id)
 continue
 }
 try {
 if (entity.getDynamicProperty("r4isen1920_invsee:target") === playerId || entity.getDynamicProperty("r4isen1920_invsee:viewer") === playerId) removeInvseeSession(entity)
 } catch {
 removeInvseeSession(entity)
 }
 }
 stopInvseeSyncIfIdle()
}
function getEntitySafe(e) {
 if (typeof e != "string" || !e) return
 try {
 return f.getEntity(e)
 } catch {
 return
 }
}
function canOpenInvseeFromItem(e) {
 let n = system.currentTick,
 t = invseeUseCooldowns.get(e.id) ?? 0
 if (n < t) return !1
 return invseeUseCooldowns.set(e.id, n + INVSEE_USE_COOLDOWN_TICKS), !0
}
function openInvseeFromItem(e) {
 if (!(e instanceof Player) || !canOpenInvseeFromItem(e)) return
 system.run(() => {
 try {
 e.hasTag("admin") ? m(e) : showNoPermissionMessage(e, "admin")
 } catch (n) {
 console.warn("[InvSee] Failed to open viewer:", n)
 }
 })
}
function l(e) {
 let n = e.getComponent("inventory").container,
 t = Array.from({ length: n.size }, (i, o) => n.getItem(o) || { typeId: "air" })
 return e instanceof b ? t.slice(9).concat(t.slice(0, 9)) : t
}
function p(e) {
 return JSON.stringify(e.map(n => ({ typeId: n?.typeId || "air", amount: n?.amount || 0 })))
}
function h(e) {
 let n = e.getComponent("equippable")
 return [n.getEquipment(c.Head), n.getEquipment(c.Chest), n.getEquipment(c.Legs), n.getEquipment(c.Feet), n.getEquipment(c.Offhand)]
}
function w(e) {
 return e
 .map(n => (n?.typeId && n.typeId !== "air" ? "a" : "b"))
 .join("")
 .replace(/[\[\],"]/g, "")
}
function A(e, n, t = []) {
 let i = USE_INVSEE_CUSTOM_UI ? `_r4ui:inventory:${w(t.slice(0, 5))}:${n}` : `InvSee | ${n}`
 if (e.nameTag !== i) e.nameTag = i
}
function getEnderInventorySafe(e) {
 try {
 return e.getComponent("minecraft:ender_inventory")?.container
 } catch {
 return
 }
}
function showEnderChest(e, n) {
 let t = getEnderInventorySafe(n)
 if (!t) {
 e.sendMessage(`§cUnable to read ${n.name}'s Ender Chest.`)
 return
 }
 e.runCommand("ride @s stop_riding")
 let i = e.dimension.spawnEntity("r4isen1920_invsee:ender_chest", e.location),
 o = i.getComponent("inventory").container
 i.nameTag = `Ender Chest | ${n.name}`
 for (let s = 0; s < t.size; s++) {
 let r = t.getItem(s)
 if (r) o.setItem(s, r)
 }
 i.addTag("invsee")
 i.setDynamicProperty("r4isen1920_invsee:target", n.id)
 i.setDynamicProperty("r4isen1920_invsee:viewer", e.id)
 i.setDynamicProperty("r4isen1920_invsee:mode", "ender")
 n.setDynamicProperty("r4isen1920_invsee:old_log", p(Array.from({ length: t.size }, (s, r) => t.getItem(r))))
 i.setDynamicProperty("r4isen1920_invsee:old_log", p(l(i)))
 e.runCommand("ride @s start_riding @e[type=r4isen1920_invsee:ender_chest,tag=invsee,c=1] teleport_ride")
 trackInvseeSession(i)
}
function showViewTypeSelector(e, n) {
 new v().simpleUi()
 .title(n.name)
 .body("Choose what to view.")
 .button("Inventory", "textures/ui/inventory_icon")
 .button("Ender Chest", "textures/blocks/ender_chest_front")
 .button("Back", "textures/ui/arrow_left")
 .show(e)
 .then(t => {
 if (t.canceled) return
 t.selection === 0 ? I(n, e) : t.selection === 1 ? showEnderChest(e, n) : m(e)
 })
 .catch(() => { })
}
function I(e, n) {
 n.runCommand("ride @s stop_riding")
 let t = l(e),
 i = h(e),
 o = n.dimension.spawnEntity("r4isen1920_invsee:inventory", n.location),
 s = o.getComponent("inventory").container
 A(o, e.name, i)
 for (let r = 0; r < 36; r++)
 if (t[r].typeId !== "air") s.setItem(r, t[r])
 else continue
 for (let r = 45; r < 53; r++)
 if (i[r - 45]?.typeId !== "air") s.setItem(r, i[r - 45])
 else continue
 o.addTag("invsee"), o.setDynamicProperty("r4isen1920_invsee:target", e.id), o.setDynamicProperty("r4isen1920_invsee:viewer", n.id), e.setDynamicProperty("r4isen1920_invsee:old_log", p(t.concat(i))), o.setDynamicProperty("r4isen1920_invsee:old_log", p(l(o))), n.runCommand("ride @s start_riding @e[type=r4isen1920_invsee:inventory,tag=invsee,c=1] teleport_ride"), trackInvseeSession(o)
}
function y(e) {
 let n = f.getDimension(e)
 return n.getEntities({ type: "r4isen1920_invsee:inventory", tags: ["invsee"] }).concat(n.getEntities({ type: "r4isen1920_invsee:ender_chest", tags: ["invsee"] }))
}
function C(e) {
 let n = getEntitySafe(e.getDynamicProperty("r4isen1920_invsee:target"))
 let t = getEntitySafe(e.getDynamicProperty("r4isen1920_invsee:viewer"))
 if (isSessionParticipantMissing(n instanceof b, t instanceof b)) {
 removeInvseeSession(e)
 return
 }
 if (e.getDynamicProperty("r4isen1920_invsee:mode") === "ender") {
 syncEnderChest(e, n)
 return
 }
 A(e, n.name, h(n))
 let i = p(l(n).concat(h(n))),
 o = p(l(e)),
 s = n.getDynamicProperty("r4isen1920_invsee:old_log"),
 r = e.getDynamicProperty("r4isen1920_invsee:old_log")
 if (hasSnapshotChanged(s, i)) {
 if (!D(e, n)) {
 e.removeTag("updating")
 return
 }
 o = p(l(e))
 } else if (hasSnapshotChanged(r, o)) {
 if (!T(e, n)) {
 e.removeTag("updating")
 return
 }
 i = p(l(n).concat(h(n)))
 }
 setDynamicPropertyIfChanged(n, "r4isen1920_invsee:old_log", s, i)
 setDynamicPropertyIfChanged(e, "r4isen1920_invsee:old_log", r, o)
 e.removeTag("updating")
}
function syncEnderChest(e, n) {
 if (e.hasTag("updating")) return
 let t = getEnderInventorySafe(n)
 if (!t) {
 removeInvseeSession(e)
 return
 }
 let i = p(Array.from({ length: t.size }, (o, s) => t.getItem(s))),
 o = p(l(e)),
 s = n.getDynamicProperty("r4isen1920_invsee:old_log"),
 r = e.getDynamicProperty("r4isen1920_invsee:old_log")
 if (hasSnapshotChanged(s, i)) {
 e.addTag("updating")
 let u = e.getComponent("inventory").container
 u.clearAll()
 for (let a = 0; a < t.size; a++) {
 let g = t.getItem(a)
 if (g) u.setItem(a, g)
 }
 o = p(l(e))
 } else if (hasSnapshotChanged(r, o)) {
 e.addTag("updating")
 t.clearAll()
 let u = e.getComponent("inventory").container
 for (let a = 0; a < t.size; a++) {
 let g = u.getItem(a)
 if (g) t.setItem(a, g)
 }
 i = p(Array.from({ length: t.size }, (a, g) => t.getItem(g)))
 }
 setDynamicPropertyIfChanged(n, "r4isen1920_invsee:old_log", s, i)
 setDynamicPropertyIfChanged(e, "r4isen1920_invsee:old_log", r, o)
 e.removeTag("updating")
}
function D(e, n) {
 if (e.hasTag("updating")) return !1
 e.addTag("updating")
 let t = l(n),
 i = h(n),
 o = e.getComponent("inventory").container
 ; (A(e, n.name, i), o.clearAll())
 for (let s = 0; s < 36; s++)
 if (t[s].typeId !== "air") o.setItem(s, t[s])
 else continue
 for (let s = 45; s < 53; s++)
 if (i[s - 45]?.typeId !== "air") o.setItem(s, i[s - 45])
 else continue
 return !0
}
function T(e, n) {
 if (e.hasTag("updating")) return !1
 e.addTag("updating")
 let t = n.getComponent("inventory").container,
 i = n.getComponent("equippable"),
 o = l(e).slice(0, 36),
 s = [...o.slice(-9), ...o.slice(0, -9)],
 r = l(e).slice(45, 53),
 u = [[45, c.Head], [46, c.Chest], [47, c.Legs], [48, c.Feet], [49, c.Offhand]]
 A(e, n.name, r)
 t.clearAll(), i.setEquipment(c.Head, new d("air")), i.setEquipment(c.Chest, new d("air")), i.setEquipment(c.Legs, new d("air")), i.setEquipment(c.Feet, new d("air")), i.setEquipment(c.Offhand, new d("air"))
 for (let a = 0; a < 36; a++)
 if (s[a].typeId !== "air") t.setItem(a, s[a])
 else continue
 for (let [a, g] of u)
 if (r[a - 45]?.typeId !== "air") i.setEquipment(g, r[a - 45])
 else continue
 return !0
}
function m(e) {
 let n = new v().simpleUi().title("Inventory Viewer").body("Select a player to view their inventory.").button("Search player by name", "textures/ui/icon_multiplayer"),
 t = f.getAllPlayers()
 for (let i of t) n.button(i.name, "textures/ui/button_custom/kepala_player")
 n.show(e).then(i => {
 if (i.canceled) return
 if (i.selection === 0) {
 S(e)
 return
 }
 let o = t[i.selection - 1]
 o ? showViewTypeSelector(e, o) : m(e)
 }).catch(() => { })
}
function S(e) {
 new q()
 .title("Search player")
 .textField("Player name", e.name)
 .show(e)
 .then(t => {
 if (t.canceled) {
 m(e)
 return
 }
 let i = f.getAllPlayers(),
 o = `${t.formValues?.[0] ?? ""}`.toLowerCase(),
 s = i.filter(u => u.name.toLowerCase().includes(o)),
 r = new v().simpleUi().title("Inventory Search")
 if (s.length === 0) r.body(`No player found: ${o}`).button("Search again", "textures/ui/icon_multiplayer")
 else {
 r.body(`Found ${s.length} player${s.length === 1 ? "" : "s"}.`)
 s.forEach(u => r.button(u.name, "textures/ui/button_custom/kepala_player"))
 }
 r.show(e).then(u => {
 if (u.canceled) {
 m(e)
 return
 }
 if (s.length === 0) {
 S(e)
 return
 }
 s[u.selection] ? showViewTypeSelector(e, s[u.selection]) : m(e)
 }).catch(() => { })
 }).catch(() => { })
}
world.beforeEvents.itemUse.subscribe(e => {
 let { itemStack: n, source: t } = e
 if (n?.typeId !== "r4isen1920_invsee:inventory") return
 e.cancel = !0
 openInvseeFromItem(t)
})
world.beforeEvents.playerInteractWithEntity.subscribe(e => {
 let { player: n, target: t } = e
 if (t.typeId !== "r4isen1920_invsee:inventory" && t.typeId !== "r4isen1920_invsee:ender_chest") return
 if (t.getDynamicProperty("r4isen1920_invsee:viewer") !== n.id) e.cancel = !0
})
world.afterEvents.playerLeave?.subscribe?.(({ playerId }) => {
 cleanupInvseeSessionsForPlayer(playerId)
})
E.run(() => {
 for (const dimensionId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
 try { y(dimensionId).forEach(trackInvseeSession) } catch { }
 }
})
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
 const config = getCustomItemConfig(),
 itemId = itemStack.typeId
 const playSound = () =>
 system.run(() => {
 try { source.runCommand("playsound random.enderchestopen @s ~ ~ ~ 1 1") } catch { }
 })
 if (config.useCustomItems) {
 if (itemId === config.adminItem && hasPermission(source, "admin")) playSound(), showMainMenu(source)
 else if (itemId === config.memberItem) playSound(), showMemberMenu(source)
 else if (itemId === config.adminItem && !hasPermission(source, "admin")) showNoPermissionMessage(source, "admin")
 } else {
 if (itemId === "kwd:item01" && hasPermission(source, "admin")) playSound(), showMainMenu(source)
 else if (itemId === "kwd:member01") playSound(), showMemberMenu(source)
 else if (itemId === "kwd:item01" && !hasPermission(source, "admin")) showNoPermissionMessage(source, "admin")
 }
})
const showNoPermissionMessage = (source, requiredTag) => {
 const messages = [`§8§l[§r§c§lACCESS DENIED§r§8§l]§r`, `§7You don't have permission to use this menu!`, ``, `§fRequired Tag:`]
 if (requiredTag === "admin") messages.push(`§8• §cAdmin §7- Full access`, ``, `§7Type §e/tag @s add admin §7to access the Admin menu.`)
 else messages.push(`§8• §eMember §7- Basic access`, ``, `§7Type §e/tag @s add member §7to access the Member menu.`)
 source.onScreenDisplay.setActionBar("§c✖ §7Insufficient permissions §c✖")
 source.sendMessage(messages.join("\n") + "\n")
}
