import { world, system } from '../../../core.js';
const PARTICLE_CONFIG = {
 OUTLINE_PARTICLE: "minecraft:endrod",
 PREVIEW_PARTICLE: "minecraft:endrod",
 OUTLINE_DENSITY: 3,
 PLAYER_COOLDOWN_TICKS: 20 * 5,
 CLEANUP_INTERVAL_TICKS: 20 * 60,
}
export class LandParticles {
 static playerCooldowns = new Map()
 static {
 system.runInterval(() => this.cleanupCooldowns(), PARTICLE_CONFIG.CLEANUP_INTERVAL_TICKS)
 }
 static _spawnOutlineParticles(dimension, min, max) {
 try {
 for (let y = min.y; y <= max.y; y++) {
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: min.x, y: y, z: min.z })
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: max.x, y: y, z: min.z })
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: min.x, y: y, z: max.z })
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: max.x, y: y, z: max.z })
 }
 for (let i = min.x; i <= max.x; i += PARTICLE_CONFIG.OUTLINE_DENSITY) {
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: i, y: min.y, z: min.z })
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: i, y: max.y, z: min.z })
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: i, y: min.y, z: max.z })
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: i, y: max.y, z: max.z })
 }
 for (let i = min.z; i <= max.z; i += PARTICLE_CONFIG.OUTLINE_DENSITY) {
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: min.x, y: min.y, z: i })
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: max.x, y: min.y, z: i })
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: min.x, y: max.y, z: i })
 dimension.spawnParticle(PARTICLE_CONFIG.OUTLINE_PARTICLE, { x: max.x, y: max.y, z: i })
 }
 } catch (error) {
 if (!error.toString().includes("LocationInUnloadedChunkError")) {
 console.warn("Error spawning outline particles:", error)
 }
 }
 }
 static showLandOutline(pos1, pos2) {
 if (!pos1 || !pos2 || !pos1.dimension) return
 const dimension = world.getDimension(pos1.dimension)
 if (!dimension) return
 const min = {
 x: Math.min(pos1.x, pos2.x),
 y: Math.min(pos1.y, pos2.y),
 z: Math.min(pos1.z, pos2.z),
 }
 const max = {
 x: Math.max(pos1.x, pos2.x),
 y: Math.max(pos1.y, pos2.y),
 z: Math.max(pos1.z, pos2.z),
 }
 const claimCenter = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }
 let shouldShow = false
 const nearbyPlayers = dimension.getPlayers({ location: claimCenter, maxDistance: 48 })
 for (const player of nearbyPlayers) {
 const lastUpdate = this.playerCooldowns.get(player.id) || 0
 if (system.currentTick - lastUpdate > PARTICLE_CONFIG.PLAYER_COOLDOWN_TICKS) {
 this.playerCooldowns.set(player.id, system.currentTick)
 shouldShow = true
 }
 }
 if (shouldShow) {
 this._spawnOutlineParticles(dimension, min, max)
 }
 }
 static showSelectionPreview(pos) {
 if (!pos || !pos.dimension) return
 try {
 const dimension = world.getDimension(pos.dimension)
 if (!dimension) return
 for (let i = 0; i < 15; i++) {
 dimension.spawnParticle(PARTICLE_CONFIG.PREVIEW_PARTICLE, {
 x: pos.x + 0.5,
 y: pos.y + i * 0.5,
 z: pos.z + 0.5,
 })
 }
 } catch (error) {
 if (!error.toString().includes("LocationInUnloadedChunkError")) {
 console.warn("Error spawning preview particles:", error)
 }
 }
 }
 static scheduleOutlineUpdates(pos1, pos2, duration = 5) {
 if (!pos1 || !pos2) return
 const endTime = Date.now() + duration * 1000
 const intervalId = system.runInterval(() => {
 if (Date.now() > endTime) {
 system.clearRun(intervalId)
 return
 }
 this.showLandOutline(pos1, pos2)
 }, 20)
 }
 static cleanupCooldowns() {
 for (const [playerId, lastUpdate] of this.playerCooldowns.entries()) {
 if (system.currentTick - lastUpdate > PARTICLE_CONFIG.CLEANUP_INTERVAL_TICKS * 2) {
 this.playerCooldowns.delete(playerId)
 }
 }
 }
}
