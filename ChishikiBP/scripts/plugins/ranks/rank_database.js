import { world } from "../../core.js"
import { ScoreboardDB } from "../../board/data.js"
import { GlobalConfig } from "../../function/GlobalConfig.js"


const CUSTOM_RANK_LIST_KEY = "customRankList"
const CUSTOM_RANKS_KEY = "customRanks"
const DEFAULT_RANK_KEY = "defaultRank"
const FALLBACK_DEFAULT_RANK = "\uE802"

function parseJson(raw, fallback) {
 try {
 if (raw === undefined || raw === null || raw === "") return fallback
 return typeof raw === "string" ? JSON.parse(raw) : raw
 } catch {
 return fallback
 }
}

function readMigratedValue(key, fallback) {
 const current = GlobalConfig.get(key)
 if (current !== undefined && current !== null) return current
 try {
 const legacy = world.getDynamicProperty(key)
 if (legacy === undefined || legacy === null) return fallback
 const parsed = Array.isArray(fallback) || typeof fallback === "object"
 ? parseJson(legacy, fallback)
 : legacy
 GlobalConfig.set(key, parsed)
 world.setDynamicProperty(key, undefined)
 return parsed
 } catch {
 return fallback
 }
}

export class RankDatabase {
 static getPlayerRank(player) {
 const tag = player.getTags().find(t => t.startsWith("rank:"))
 return tag || null
 }

 static setPlayerRank(player, rank) {
 const currentRank = this.getPlayerRank(player)
 if (currentRank) player.removeTag(currentRank)
 if (rank) player.addTag(rank)
 ScoreboardDB?.set(`player_rank_${player.name}`, rank || "")
 }

 static loadPlayerRank(player) {
 const savedRank = ScoreboardDB?.get(`player_rank_${player.name}`)
 if (savedRank) {
 const currentRank = this.getPlayerRank(player)
 if (currentRank !== savedRank) {
 if (currentRank) player.removeTag(currentRank)
 player.addTag(savedRank)
 }
 }
 }

 static getAllPlayersWithRank(rank) {
 return world.getAllPlayers().filter(p => p.hasTag(rank))
 }

 static getCustomRankList() {
 const list = readMigratedValue(CUSTOM_RANK_LIST_KEY, [])
 return Array.isArray(list) ? list : []
 }

 static saveCustomRankList(rankList) {
 const list = Array.isArray(rankList)
 ? [...new Set(rankList.map(rank => String(rank).trim()).filter(Boolean))]
 : []
 const ok = GlobalConfig.set(CUSTOM_RANK_LIST_KEY, list) === true
 try { world.setDynamicProperty(CUSTOM_RANK_LIST_KEY, undefined) } catch {}
 return ok
 }

 static loadCustomRankList(callback) {
 const list = this.getCustomRankList()
 if (callback) callback(list)
 return list
 }

 static getCustomRanks() {
 const ranks = readMigratedValue(CUSTOM_RANKS_KEY, {})
 return ranks && typeof ranks === "object" && !Array.isArray(ranks) ? ranks : {}
 }

 static saveCustomRanks(ranks) {
 const safeRanks = ranks && typeof ranks === "object" && !Array.isArray(ranks) ? ranks : {}
 const ok = GlobalConfig.set(CUSTOM_RANKS_KEY, safeRanks) === true
 try { world.setDynamicProperty(CUSTOM_RANKS_KEY, undefined) } catch {}
 return ok
 }

 static saveDefaultRank(rank) {
 const ok = GlobalConfig.set(DEFAULT_RANK_KEY, rank || FALLBACK_DEFAULT_RANK) === true
 try { world.setDynamicProperty(DEFAULT_RANK_KEY, undefined) } catch {}
 return ok
 }

 static loadDefaultRank() {
 return readMigratedValue(DEFAULT_RANK_KEY, FALLBACK_DEFAULT_RANK) || FALLBACK_DEFAULT_RANK
 }
}
