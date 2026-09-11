import { world, system, ItemStack, ItemComponentTypes, EnchantmentTypes } from '../../core.js';
import { QIDB } from '../../function/QIDB.js';

const MIGRATION_FLAG = "backpack_struct_migrated"
const OLD_PLAYER_PREFIX = "bp_player_"
const OLD_PLAYERS_LIST_KEY = "bp_players_list"
const OLD_QIDB_PLAYERS_KEY = "backpack_qidb_players"
const OLD_QIDB_PREFIX = "backpack:"

function sanitizeKey(name) {
 return name.replace(/[^A-Za-z0-9_]/g, '_').substring(0, 20)
}

class BackpackDatabase {
 constructor() {
 this.qidb = new QIDB("bp", 30, 1)
 this.qidb.logs = { startUp: false, save: false, load: false, set: false, get: false, has: false, delete: false, clear: false, values: false, keys: false }
 this.nameMap = new Map()
 this.isInitialized = false
 this.unreadableKeys = new Set()
 this._init()
 }

 _init() {
 system.runTimeout(() => {
 this._loadNameMap()
 this._migrate()
 this.isInitialized = true
 }, 40)
 }

 _loadNameMap() {
 try {
 const raw = world.getDynamicProperty("bp_name_map")
 if (raw) {
 const parsed = JSON.parse(raw)
 for (const [k, v] of Object.entries(parsed)) this.nameMap.set(k, v)
 }
 } catch { }
 }

 _saveNameMap() {
 const obj = {}
 for (const [k, v] of this.nameMap) obj[k] = v
 world.setDynamicProperty("bp_name_map", JSON.stringify(obj))
 }

 _getKey(playerName) {
 if (this.nameMap.has(playerName)) return this.nameMap.get(playerName)
 const key = sanitizeKey(playerName)
 this.nameMap.set(playerName, key)
 this._saveNameMap()
 return key
 }

  get(playerName) {
    let key
    try {
      key = this._getKey(playerName)
      if (!this.qidb.has(key)) {
        this.unreadableKeys.delete(key)
        return []
      }
      const result = this.qidb.get(key)
      this.unreadableKeys.delete(key)
      if (!result) return []
      const list = Array.isArray(result) ? result : [result]
      return list.filter(i => i && i.typeId && i.typeId !== "minecraft:air")
    } catch (error) {
      console.warn(`[Backpack] Gagal membaca backpack ${playerName}: ${error}`)
      if (key) this.unreadableKeys.delete(key)
      return []
    }
  }

  canWrite(playerName) {
    if (!playerName) return false
    try {
      return !this.unreadableKeys.has(this._getKey(playerName))
    } catch {
      return true
    }
  }

 // Setiap penulisan di sini adalah penggantian penuh, jadi selama pembacaan terakhir gagal
 // tidak ada penulisan yang boleh lewat: isi lama di disk masih satu-satunya salinan yang benar.
 set(playerName, items) {
 if (!playerName || !Array.isArray(items)) return false
 const key = this._getKey(playerName)
 if (this.unreadableKeys.has(key)) {
 console.warn(`[Backpack] Tolak penulisan ${playerName}: pembacaan terakhir gagal, isi lama dipertahankan.`)
 return false
 }
 const filtered = items.filter(i => i && i.typeId)
 if (filtered.length === 0) {
 if (this.qidb.has(key)) this.qidb.delete(key)
 return true
 }
 try {
 this.qidb.set(key, filtered)
 return true
 } catch (error) {
 console.warn(`[Backpack] Gagal menyimpan backpack ${playerName}: ${error}`)
 return false
 }
 }

 delete(playerName) {
 try {
 const key = this._getKey(playerName)
 if (this.qidb.has(key)) this.qidb.delete(key)
 } catch { }
 }

 _migrate() {
 if (world.getDynamicProperty(MIGRATION_FLAG)) return

 this._migrateOldChunked()
 this._migrateOldQidb()

 world.setDynamicProperty(MIGRATION_FLAG, "true")
 }

 _migrateOldChunked() {
 const oldListStr = world.getDynamicProperty(OLD_PLAYERS_LIST_KEY)
 if (!oldListStr) return
 try {
 const oldList = JSON.parse(oldListStr)
 if (!Array.isArray(oldList)) return
 for (const player of oldList) {
 const oldItems = this._loadOldChunkedPlayer(player)
 if (oldItems.length === 0) continue
 const stacks = this._jsonToItemStacks(oldItems)
 if (stacks.length > 0) {
 const key = this._getKey(player)
 // Idempoten: jangan pernah menimpa backpack yang sudah terisi kalau migrasi terulang.
 if (this.qidb.has(key)) continue
 this.qidb.set(key, stacks)
 }
 }
 } catch { }
 }

 _migrateOldQidb() {
 const oldListStr = world.getDynamicProperty(OLD_QIDB_PLAYERS_KEY)
 if (!oldListStr) return
 try {
 const oldList = JSON.parse(oldListStr)
 if (!Array.isArray(oldList)) return
 for (const player of oldList) {
 const raw = world.getDynamicProperty(OLD_QIDB_PREFIX + player)
 if (!raw) continue
 const oldItems = JSON.parse(raw)
 if (!Array.isArray(oldItems) || oldItems.length === 0) continue
 const key = this._getKey(player)
 if (this.qidb.has(key)) continue
 const stacks = this._jsonToItemStacks(oldItems)
 if (stacks.length > 0) this.qidb.set(key, stacks)
 }
 } catch { }
 }

 _jsonToItemStacks(items) {
 const stacks = []
 for (const data of items) {
 try {
 if (!data || !data.typeId || data.typeId === "minecraft:air") continue
 const item = new ItemStack(data.typeId, Math.max(1, Number(data.amount) || 1))
 if (data.name) item.nameTag = data.name
 if (data.lore?.length) item.setLore(data.lore)
 if (data.durability && typeof data.durability === 'object') {
 const dur = item.getComponent(ItemComponentTypes.Durability)
 if (dur) {
 const dmg = data.durability.damage ?? data.durability.currentDamage ?? 0
 dur.damage = Math.min(dmg, dur.maxDurability)
 }
 }
 if (data.enchantments?.length) {
 const enc = item.getComponent(ItemComponentTypes.Enchantable)
 if (enc) {
 for (const e of data.enchantments) {
 try {
 const type = EnchantmentTypes.get(e.id)
 if (type) enc.addEnchantment({ type, level: e.level || 1 })
 } catch { }
 }
 }
 }
 stacks.push(item)
 } catch { }
 }
 return stacks
 }

 _loadOldChunkedPlayer(player) {
 try {
 const chunkInfoStr = world.getDynamicProperty(OLD_PLAYER_PREFIX + player + "_info")
 if (chunkInfoStr) {
 const chunkInfo = JSON.parse(chunkInfoStr)
 if (chunkInfo.isChunked) {
 let combined = ""
 for (let i = 0; i < chunkInfo.count; i++) {
 const chunk = world.getDynamicProperty(OLD_PLAYER_PREFIX + player + "_chunk_" + i)
 if (!chunk) return []
 combined += chunk
 }
 return JSON.parse(combined)
 }
 }
 const data = world.getDynamicProperty(OLD_PLAYER_PREFIX + player)
 return data ? JSON.parse(data) : []
 } catch { return [] }
 }
}

export { BackpackDatabase }
