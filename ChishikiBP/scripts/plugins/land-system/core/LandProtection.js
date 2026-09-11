import { system, world } from '../../../core.js';
import { LandDatabase } from "./LandDatabase.js"
import { LandParticles } from "./LandParticles.js"
import { LandConfig } from "../admin/LandConfig.js"
import { findIndexedClaim, getRevisionAwareClaimIndex } from "./ClaimSpatialIndex.js"
import { isMemberFeatureEnabled, onMemberFeatureStatusChange } from "../../../function/memberFeatureState.js"
import { clanDB } from "../../../function/getClan.js"
const CFG = { CLEANUP: 6e4, MAX_CACHE: 2e3, NOTIFY_CD: 500, PERM_TTL: 15e3, REV_TTL: 1000, TTL: 6e4, BATCH: 10, SCAN_TICKS: 200, MOB_SCAN_TTL: 5000 }
let _protEnabled = true, _protTime = 0, _featureEnabled = true, _featureTime = 0, _lastDbCleanup = 0
onMemberFeatureStatusChange((feature, enabled) => {
 if (feature !== "claimLand") return
 _featureEnabled = enabled !== false
 _featureTime = Date.now()
})
const isLandSystemEnabled = (now = Date.now()) => {
 if (now - _featureTime > CFG.PERM_TTL) {
  _featureEnabled = isMemberFeatureEnabled("claimLand")
  _featureTime = now
 }
 return _featureEnabled
}
const isProtectionEnabled = () => {
 const now = Date.now()
 if (!isLandSystemEnabled(now)) return false
 if (now - _protTime > CFG.PERM_TTL) { _protEnabled = LandConfig.getConfig().protectionEnabled !== false; _protTime = now }
 return _protEnabled
}
const CACHE = {
 sneakStates: new Map(), lastPos: new Map(), safePos: new Map(), landInfo: new Map(),
 lastNotify: new Map(), claim: new Map(), notify: new Map(), perm: new Map(),
 effects: new Map(), allClaims: new Map(), spatialIndex: null, claimsTime: 0, claimsRevision: null, revisionTime: 0,
 claimsLoaded: false, priority: new Set(), mobAreaScan: new Map(), idx: 0
}
const MSG = { PROT: a => `§c§l! §r§7${a}`, FRAME: "§c§l! §r§7You cannot interact with item frames", FLUID: "§c§l! §r§7You cannot place fluids here" }
const toBlock = l => ({ x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) })
const DIM_NAMES = new Map()
const dimName = d => {
 const id = d?.id || "minecraft:overworld"
 let name = DIM_NAMES.get(id)
 if (name === undefined) { name = id.split(":")[1] || id; DIM_NAMES.set(id, name) }
 return name
}
const MOB_SCAN_EXCLUDE = ['minecraft:player', 'item', 'arrow']
const isProtDim = (c, d) => c.settings?.protectedDimensions?.includes(d)
const cmd = (p, c) => { try { p?.id && p.runCommand(c) } catch { } }
function clearProtectionEffects() {
 if (!CACHE.effects.size) return
 const affected = new Set(CACHE.effects.keys())
 for (const player of world.getAllPlayers()) {
 if (affected.has(player.id)) cmd(player, "effect @s weakness 0")
 }
 CACHE.effects.clear()
}
function notify(p, type, msg, sound = "note.bass") {
 const now = Date.now(), key = `${p.id}_${type}`
 if (CACHE.lastNotify.get(key) && now - CACHE.lastNotify.get(key) < CFG.NOTIFY_CD) return
 CACHE.lastNotify.set(key, now)
 system.run(() => { try { p?.onScreenDisplay?.setActionBar(msg) } catch { try { p?.sendMessage(msg) } catch { } } if (sound) cmd(p, `playsound ${sound} @s`) })
}
function isMember(p, c) { return c?.members?.some(m => m.id === p.id || m.name === p.name) }
function memberPvp(p, c) { return c?.members?.find(m => m.id === p.id || m.name === p.name)?.permissions?.pvp === true }
function isClanMember(p, c) {
 if (!p || !c?.clanId) return false
 try {
 const playerClan = clanDB.get(`player_${p.name}`)?.clanId
 if (playerClan !== c.clanId) return false
 const clan = clanDB.get(`clan_${c.clanId}`)
 return Array.isArray(clan?.members) && clan.members.includes(p.name)
 } catch { return false }
}
function isOwner(p, c) {
 if (!p || !c?.owner) return false
 if (c.owner === p.id) return true
 return LandDatabase.getPlayerName(c.owner) === p.name || isClanMember(p, c)
}
export class LandProtection {
 static claimCache = CACHE.claim
 static notificationCache = CACHE.notify
 static permissionCache = CACHE.perm
 static init() {
 system.runInterval(() => {
 if (!isProtectionEnabled()) {
 clearProtectionEffects()
 CACHE.idx = 0
 return
 }
 const now = Date.now(), players = world.getAllPlayers()
 if (!players.length) { CACHE.idx = 0; return }
 const protEnabled = isProtectionEnabled()
 const max = Math.min(CFG.BATCH, players.length)
 const start = CACHE.idx % players.length, end = Math.min(start + max, players.length)
 for (let i = start; i < end; i++) {
 const p = players[i]
 if (!p?.location || !p?.id) continue
 const dim = dimName(p.dimension)
 const pos = toBlock(p.location), claim = this.getClaimFromCache(pos, dim)
 if (claim) {
 CACHE.priority.add(p.id)
 this.processPlayer(p, pos, claim)
 this.handleEntry(p, claim)
 if (protEnabled && claim.settings?.mobSpawning === false && isProtDim(claim, dim)) {
 const areaKey = `${p.dimension.id}:${claim.claimId}:${Math.floor(pos.x / 32)}:${Math.floor(pos.z / 32)}`
 const lastScan = CACHE.mobAreaScan.get(areaKey) || 0
 if (now - lastScan >= CFG.MOB_SCAN_TTL) {
 CACHE.mobAreaScan.set(areaKey, now)
 p.dimension.getEntities({ location: p.location, maxDistance: 32, excludeTypes: ["minecraft:player", "minecraft:item"] }).forEach(e => {
 if (MOB_SCAN_EXCLUDE.some(t => e.typeId.includes(t))) return
  const ec = this.getClaimFromCache(toBlock(e.location), dimName(e.dimension))
 if (ec?.claimId === claim.claimId) e.remove()
 })
 }
 }
 } else {
 CACHE.safePos.set(p.id, { location: p.location, dimension: p.dimension })
 CACHE.priority.delete(p.id)
 if (CACHE.effects.has(p.id)) { CACHE.effects.delete(p.id); cmd(p, `effect @s weakness 0`) }
 }
 CACHE.lastPos.set(p.id, pos)
 if (p.isSneaking) {
 if (claim) {
 const owner = LandDatabase.getPlayerName(claim.owner)
 const display = (owner && !owner.startsWith("-")) ? owner : "Unknown"
 try { p.onScreenDisplay.setActionBar(`§e${claim.name || "Unnamed"} §7- §f${display}'s Land`) } catch { }
 const lastPt = CACHE.landInfo.get(p.id + "_pt") || 0
 if (now - lastPt > 1000) { LandParticles.showLandOutline(claim.pos1, claim.pos2); CACHE.landInfo.set(p.id + "_pt", now) }
 }
 }
 }
 CACHE.idx = (CACHE.idx + max) % players.length
 if (CACHE.claim.size > CFG.MAX_CACHE) {
 let toDelete = Math.floor(CFG.MAX_CACHE / 2);
 for (const [k] of CACHE.claim) {
  CACHE.claim.delete(k);
  if (--toDelete <= 0) break;
 }
 }
 if (CACHE.claimsLoaded && now - _lastDbCleanup > 60000) { _lastDbCleanup = now; LandDatabase.cleanupCache() }
 for (const [k, t] of CACHE.notify) if (now - t > CFG.NOTIFY_CD) CACHE.notify.delete(k)
 for (const [k, t] of CACHE.lastNotify) if (now - t > CFG.NOTIFY_CD) CACHE.lastNotify.delete(k)
 for (const [k, t] of CACHE.landInfo) if (now - t > CFG.TTL) CACHE.landInfo.delete(k)
 for (const [k, t] of CACHE.mobAreaScan) if (now - t > CFG.MOB_SCAN_TTL) CACHE.mobAreaScan.delete(k)
 for (const [k, d] of CACHE.perm) if (now - d.timestamp > CFG.PERM_TTL) CACHE.perm.delete(k)
 }, CFG.SCAN_TICKS)
 system.run(() => this.getAllClaims())
 world.afterEvents.playerLeave.subscribe(({ playerId: id }) => {
 ['effects', 'lastPos', 'safePos', 'landInfo', 'priority'].forEach(k => CACHE[k].delete?.(id))
 CACHE.landInfo.delete(`${id}_pt`)
 })
 world.afterEvents.playerSpawn.subscribe(({ player }) => {
 if (player?.isValid) LandDatabase.updatePlayerName(player.id, player.name)
 })
 system.run(() => world.getAllPlayers().forEach(p => p?.isValid && LandDatabase.updatePlayerName(p.id, p.name)))
 world.beforeEvents.explosion.subscribe(e => {
 try {
 if (!isProtectionEnabled()) return
 const dim = dimName(e.dimension)
 if (e.source?.location) {
  const sc = this.getClaimFromCache(toBlock(e.source.location), dim)
 if (sc && sc.settings?.explosions !== true && isProtDim(sc, dim)) { e.cancel = true; return }
 }
 const blocks = e.getImpactedBlocks()
 if (!blocks.length) return
 let [minX, minZ, maxX, maxZ] = [Infinity, Infinity, -Infinity, -Infinity]
 blocks.forEach(b => { minX = Math.min(minX, b.location.x); maxX = Math.max(maxX, b.location.x); minZ = Math.min(minZ, b.location.z); maxZ = Math.max(maxZ, b.location.z) })
 const claims = this.getAllClaims()
 const relevant = claims.filter(c => c.pos1 && c.pos2 && Math.floor(minX) <= Math.max(c.pos1.x, c.pos2.x) && Math.floor(maxX) >= Math.min(c.pos1.x, c.pos2.x) && Math.floor(minZ) <= Math.max(c.pos1.z, c.pos2.z) && Math.floor(maxZ) >= Math.min(c.pos1.z, c.pos2.z))
 if (relevant.length) {
 const allowed = blocks.filter(b => {
 const x = Math.floor(b.location.x), z = Math.floor(b.location.z)
 return !relevant.some(c => x >= Math.min(c.pos1.x, c.pos2.x) && x <= Math.max(c.pos1.x, c.pos2.x) && z >= Math.min(c.pos1.z, c.pos2.z) && z <= Math.max(c.pos1.z, c.pos2.z) && c.settings?.explosions !== true && isProtDim(c, dim))
 })
 if (allowed.length !== blocks.length) e.setImpactedBlocks(allowed)
 }
 } catch { }
 })
 const handleAction = (e, type, msg, check = () => true) => {
 try {
 if (!isProtectionEnabled()) return
  const { player: p, block: b } = e, pos = toBlock(b.location), c = this.getClaimFromCache(pos, dimName(p.dimension))
 if (c && isProtDim(c, dimName(p.dimension)) && check(p, b, c) && !this.hasPermission(p, c, type)) {
 e.cancel = true; notify(p, "PROTECTION", MSG.PROT(msg), "note.bass")
 }
 } catch { }
 }
 world.beforeEvents.playerBreakBlock.subscribe(e => handleAction(e, "break", "You cannot break blocks", (p, b, c) => {
 if (b.typeId.includes("frame")) {
 const f = b.dimension.getEntities({ location: b.location, type: b.typeId.includes("glow") ? "minecraft:glow_frame" : "minecraft:frame" })[0]
 if (f?.getComponent("minecraft:item_container")?.container?.size > 0) { e.cancel = true; notify(p, "PROTECTION", MSG.FRAME, "note.bass"); return false }
 }
 return true
 }))
 world.beforeEvents.playerPlaceBlock.subscribe(e => {
 const { player: p, block: b } = e, inv = p?.getComponent("minecraft:inventory")
 const isFluid = inv?.container?.getItem(p.selectedSlotIndex ?? p.selectedSlot)?.typeId?.toLowerCase().includes("bucket")
 handleAction(e, isFluid ? "interact" : "place", isFluid ? "You cannot place fluids" : "You cannot place blocks", (p, b, c) => !isOwner(p, c))
 })
 world.beforeEvents.playerInteractWithEntity.subscribe(e => {
 if (!isProtectionEnabled()) return
 if (e.target?.typeId?.includes("sign")) {
  const c = this.getClaimFromCache(toBlock(e.target.location), dimName(e.player.dimension))
 if (c && !isOwner(e.player, c) && !this.hasPermission(e.player, c, "interact")) { e.cancel = true; notify(e.player, "PROTECTION", MSG.PROT("You cannot edit signs"), "note.bass") }
 }
 })
 world.beforeEvents.playerInteractWithBlock.subscribe(e => {
 if (!isProtectionEnabled()) return
  const { player: p, block: b } = e, c = this.getClaimFromCache(toBlock(b.location), dimName(p.dimension))
 if (c && !isOwner(p, c) && !p.hasTag("admin") && isProtDim(c, dimName(p.dimension)) && !this.hasPermission(p, c, "interact") && !this.isInteractAllowed(c, b)) {
  e.cancel = true
  notify(p, "PROTECTION", MSG.PROT("You cannot interact with blocks here"), "note.bass")
 }
 })
 const onDamage = e => {
 try {
 if (!isProtectionEnabled()) return
 const t = e.hurtEntity || e.entity, s = e.damageSource
 if (!t || !s) return
  const c = this.getClaimFromCache(toBlock(t.location), dimName(t.dimension))
 if (!c || !isProtDim(c, dimName(t.dimension))) return
 if ((s.cause === "entity_explosion" || s.cause === "block_explosion") && c.settings?.explosions !== true) { e.cancel = true; return }
 if (t.typeId !== "minecraft:player" && s.damagingEntity?.typeId === "minecraft:player" && !this.hasPermission(s.damagingEntity, c, "interact")) {
 e.cancel = true; notify(s.damagingEntity, "PROTECTION", "You cannot hurt entities here", "note.bass")
 }
 } catch { }
 }
 const be = world.beforeEvents
 if (be.entityHurt) be.entityHurt.subscribe(onDamage)
 else if (be.entityDamage) be.entityDamage.subscribe(onDamage)
 world.beforeEvents.fluidPlaceEvent?.subscribe?.(e => {
 if (!isProtectionEnabled()) return
  const p = e.source, loc = toBlock(e.block?.location || p.location), c = this.getClaimFromCache(loc, dimName(p.dimension))
 if (c && !isOwner(p, c) && !this.hasPermission(p, c, "interact")) { e.cancel = true; notify(p, "PROTECTION", MSG.FLUID, "note.bass") }
 })
 }
 static handleEntry(p, c) {
 if (!isProtectionEnabled()) return
 if (!isProtDim(c, dimName(p.dimension)) || c.allowEntry || isOwner(p, c) || p.hasTag("admin")) return
 if (c.members?.find(m => m.id === p.id || m.name === p.name)?.permissions?.entry) return
 const safe = CACHE.safePos.get(p.id), deny = () => notify(p, "ENTRY_DENIED", MSG.PROT("You cannot enter this land"), "note.bass")
 try {
 if (safe && p.dimension.id === safe.dimension.id) { p.teleport(safe.location); deny() }
 else { const v = p.getViewDirection(), m = safe ? 1 : 2; p.teleport({ x: p.location.x - v.x * m, y: p.location.y, z: p.location.z - v.z * m }); deny() }
 } catch { }
 }
 static processPlayer(p, pos, c) {
 if (!isProtectionEnabled() || isOwner(p, c) || !isProtDim(c, dimName(p.dimension))) { if (CACHE.effects.has(p.id)) { CACHE.effects.delete(p.id); cmd(p, `effect @s weakness 0`) }; return }
 const canPvp = p.hasTag("admin") || memberPvp(p, c)
 if (c.settings?.pvp === false && !canPvp) {
 const ed = CACHE.effects.get(p.id)
 if (!ed || Date.now() - (ed.appliedAt || 0) > 980000) {
 if (ed) CACHE.effects.delete(p.id)
 cmd(p, `effect @s weakness 999 255 true`); CACHE.effects.set(p.id, { claimId: c.claimId, appliedAt: Date.now() })
 }
 } else if (CACHE.effects.has(p.id)) { CACHE.effects.delete(p.id); cmd(p, `effect @s weakness 0`) }
 }
 static getDefaultPermissions() { return { break: false, place: false, interact: false, entry: false, pvp: false } }
 static async isPlayerInClaim(p) { return p?.location ? this.getClaimFromCache(toBlock(p.location), dimName(p.dimension)) : null }
 static invalidateClaimCaches(revision = LandDatabase.getRevision()) {
 CACHE.claim.clear()
 CACHE.allClaims.clear()
 CACHE.spatialIndex = null
 CACHE.claimsTime = 0
 CACHE.claimsLoaded = false
 CACHE.claimsRevision = revision
 CACHE.revisionTime = Date.now()
 }
 static syncClaimRevision() {
 const now = Date.now()
 if (CACHE.claimsRevision !== null && now - CACHE.revisionTime < CFG.REV_TTL) return CACHE.claimsRevision
 const revision = LandDatabase.getRevision()
 CACHE.revisionTime = now
 if (CACHE.claimsRevision !== revision) this.invalidateClaimCaches(revision)
 return revision
 }
 static clearClaimCache() { this.invalidateClaimCaches() }
 static updateClaimInCache() { this.invalidateClaimCaches() }
 static hasPermission(p, c, action) {
 if (p.hasTag("admin") || isOwner(p, c) || !isProtDim(c, dimName(p.dimension))) return true
 return c.members?.find(m => m.id === p.id || m.name === p.name)?.permissions?.[action] === true
 }
 static checkBlockInteraction(p, b, c) {
 if (!b || !p || !c || isOwner(p, c)) return false
 if (b.typeId.toLowerCase().includes("sign") && !this.hasPermission(p, c, "interact")) { notify(p, "PROTECTION", MSG.PROT("You cannot edit signs"), "note.bass"); return true }
 return false
 }
 static isInteractAllowed(c, b) {
 if (!c || !b) return false
 const list = c.interactBlocks || []
 if (!list.length) return false
 const id = b.typeId.toLowerCase().replace(/^minecraft:/, "")
 for (let i = 0; i < list.length; i++) {
  const entry = String(list[i]).toLowerCase().replace(/^minecraft:/, "")
  if (entry === id) return true
 }
 return false
 }
  static getAllClaims() {
    const now = Date.now(), revision = this.syncClaimRevision()
    if (CACHE.claimsLoaded) {
      const claims = Array.from(CACHE.allClaims.values())
      CACHE.spatialIndex = getRevisionAwareClaimIndex(CACHE.spatialIndex, claims, revision)
      return claims
    }
    try {
      const claims = []
      const props = world.getDynamicPropertyIds() ?? []
      for (const id of props) {
        if (!LandDatabase.isPlayerClaimKey(id)) continue
        try {
          const parsed = JSON.parse(world.getDynamicProperty(id) || "[]")
          if (Array.isArray(parsed)) claims.push(...parsed)
        } catch { }
      }
      CACHE.allClaims.clear()
      claims.forEach(c => {
        if (c?.claimId && c.pos1 && c.pos2) {
          c._minX = Math.min(c.pos1.x, c.pos2.x)
          c._maxX = Math.max(c.pos1.x, c.pos2.x)
          c._minZ = Math.min(c.pos1.z, c.pos2.z)
          c._maxZ = Math.max(c.pos1.z, c.pos2.z)
          c._dim = c.pos1.dimension || "overworld"
          CACHE.allClaims.set(c.claimId, c)
        }
      })
      CACHE.claimsTime = now
      CACHE.claimsRevision = revision
      CACHE.claimsLoaded = true
      CACHE.spatialIndex = getRevisionAwareClaimIndex(CACHE.spatialIndex, claims, revision)
      return claims
    } catch {
      CACHE.allClaims.clear(); CACHE.spatialIndex = null; CACHE.claimsTime = 0; CACHE.claimsLoaded = false
      return []
    }
  }
  static getClaimFromCache(loc, dimension) {
    if (!loc || typeof loc.x !== "number") return null
    const revision = this.syncClaimRevision()
    if (CACHE.claimsLoaded && CACHE.allClaims.size === 0) return null
    const now = Date.now()
    const key = `${dimension || "overworld"}:${Math.floor(loc.x)},${Math.floor(loc.z)}`, cached = CACHE.claim.get(key)
    if (cached && cached.revision === revision && now - cached.time < CFG.TTL) return cached.claim
    try {
      const claims = this.getAllClaims(); if (!claims.length) { CACHE.claim.set(key, { claim: null, time: now, revision }); return null }
      const targetDim = dimension || "overworld"
      CACHE.spatialIndex = getRevisionAwareClaimIndex(CACHE.spatialIndex, claims, revision)
      const claim = findIndexedClaim(CACHE.spatialIndex, loc, targetDim)
      CACHE.claim.set(key, { claim: claim || null, time: now, revision })
      return claim || null
    } catch { return null }
  }
 static revokeAccess(p, c, mId) {
 return this.modifyClaim(c.owner, c.claimId, cl => {
 cl.members = cl.members?.filter(m => m.id !== mId && m.name !== LandDatabase.getPlayerName(mId)) || []
 cl.accessHistory = [...(cl.accessHistory || []), { playerName: LandDatabase.getPlayerName(mId), action: "revoked", timestamp: Date.now() }]
 this.clearClaimCache(c.claimId)
 })
 }
 static setMemberPermissions(id, name, perms) {
 let owner = null
 const claims = this.getAllClaims()
 for (let i = 0; i < claims.length; i++) {
 if (claims[i]?.claimId === id && claims[i].owner) { owner = claims[i].owner; break }
 }
 if (!owner) try { owner = LandDatabase.playerIdFromClaimKey(world.getDynamicPropertyIds().find(k => LandDatabase.isPlayerClaimKey(k) && JSON.parse(world.getDynamicProperty(k) || "[]").some(c => c.claimId === id))) } catch { }
 return owner ? this.modifyClaim(owner, id, cl => { if (!cl.members) cl.members = []; const m = cl.members.find(m => m.name === name); m ? m.permissions = perms : cl.members.push({ name, permissions: perms }) }) : false
 }
 static modifyClaim(ownerId, claimId, modifier) {
 try {
 const key = LandDatabase.getPlayerClaimKey(ownerId), data = world.getDynamicProperty(key)
 if (!data) return false
 const claims = JSON.parse(data), idx = claims.findIndex(c => c.claimId === claimId)
 if (idx === -1) return false
 modifier(claims[idx])
 LandDatabase._persistClaims(ownerId, claims)
 this.invalidateClaimCaches()
 return true
 } catch { return false }
 }
 static sendProtectionMessage(p, m, o) { notify(p, "PROTECTION", `§c${m} (Owner: ${o})`, "note.bass") }
 static getBlockCategory(id) { return id.toLowerCase().includes("sign") ? "sign" : null }
 static getProtectionMessage() { return "You cannot interact with this block" }
 static sendSuccessMessage(p, m) { p.sendMessage(`§a§l\u2713 §r§7${m}`); cmd(p, `playsound random.levelup @s`) }
 static sendErrorMessage(p, m) { p.sendMessage(`§c§l! §r§7${m}`); cmd(p, `playsound note.bass @s`) }
}
export { isMember as isClaimMember, memberPvp as isMemberAllowPvp }
