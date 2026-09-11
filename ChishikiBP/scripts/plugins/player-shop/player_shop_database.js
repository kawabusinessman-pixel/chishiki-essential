import { world, system, ItemStack, ItemComponentTypes, EnchantmentTypes } from "../../core.js"
import { QIDB } from "../../function/QIDB.js"

const META_KEY = "player_shop_db_meta"
const MIGRATED_KEY = "player_shop_qidb_migrated"
const LEGACY_LISTINGS_KEY = "marketListings"
const LEGACY_LAST_ID_KEY = "lastListingId"
const LEGACY_RETURNS_KEY = "player_shop_returns\uE812items"

function readJsonProp(key, fallback) {
 try {
 const raw = world.getDynamicProperty(key)
 if (!raw) return fallback
 try {
 return JSON.parse(String(raw))
 } catch {
 return JSON.parse(String(raw).replace(/\\"/g, '"').replace(/\\\\/g, "\\"))
 }
 } catch {
 return fallback
 }
}

function writeJsonProp(key, value) {
 try {
 world.setDynamicProperty(key, JSON.stringify(value))
 return true
 } catch {
 return false
 }
}

function stackFromData(data) {
 try {
 const typeId = data.itemTypeId || data.typeId
 const amount = Math.max(1, Number(data.itemAmount || data.amount) || 1)
 const item = new ItemStack(typeId, amount)
 const name = data.name || ""
 const lore = Array.isArray(data.lore) ? data.lore : []
 const durability = data.durabilityData || data.durability
 if (name) item.nameTag = name
 if (lore.length) item.setLore(lore)
 if (durability?.currentDamage !== undefined || durability?.damage !== undefined) {
 const dur = item.getComponent(ItemComponentTypes.Durability)
 if (dur) dur.damage = Math.min(Number(durability.currentDamage ?? durability.damage) || 0, dur.maxDurability)
 }
 const enchantable = item.getComponent(ItemComponentTypes.Enchantable)
 if (enchantable && Array.isArray(data.enchantments)) {
 for (const enchant of data.enchantments) {
 try {
 const type = EnchantmentTypes.get(enchant.id || enchant.type)
 if (type) enchantable.addEnchantment({ type, level: enchant.level || 1 })
 } catch {}
 }
 }
 return item
 } catch {
 return null
 }
}

export class PlayerShopDatabase {
 constructor() {
 this.qidb = new QIDB("pshop", 120, 2)
 this.qidb.logs = { startUp: false, save: false, load: false, set: false, get: false, has: false, delete: false, clear: false, values: false, keys: false }
 this.meta = { listings: [], returns: {}, lastListingId: 0 }
 this.isInitialized = false
 system.runTimeout(() => this.init(), 60)
 }

 init() {
 this.meta = { ...this.meta, ...readJsonProp(META_KEY, {}) }
 this.migrate()
 this.isInitialized = true
 }

 save() {
 writeJsonProp(META_KEY, this.meta)
 }

 getListings() {
 return Array.isArray(this.meta.listings) ? this.meta.listings : []
 }

 setListings(listings) {
 this.meta.listings = Array.isArray(listings) ? listings : []
 this.save()
 }

 getLastListingId() {
 return Number(this.meta.lastListingId) || 0
 }

 setLastListingId(id) {
 this.meta.lastListingId = Number(id) || 0
 this.save()
 }

 setListingItem(id, item) {
  const stack = item?.clone ? item.clone() : stackFromData(item)
  if (!stack) return false
  this.qidb.set(`l_${id}`, stack)
  return true
 }

 getListingItem(id) {
 try {
 return this.qidb.get(`l_${id}`)
 } catch {
 return null
 }
 }

 deleteListingItem(id) {
 try {
 if (this.qidb.has(`l_${id}`)) this.qidb.delete(`l_${id}`)
 } catch {}
 }

 getReturns(playerName) {
 const list = this.meta.returns?.[playerName]
 return Array.isArray(list) ? list : []
 }

 addReturn(playerName, item, stack) {
 const returns = this.meta.returns || {}
 const list = Array.isArray(returns[playerName]) ? returns[playerName] : []
 if (!list.some(entry => entry.id === item.id)) list.push(item)
 returns[playerName] = list
 this.meta.returns = returns
 this.setReturnItem(item.id, stack || stackFromData(item))
 this.save()
 }

 removeReturn(playerName, id) {
 const returns = this.meta.returns || {}
 const list = Array.isArray(returns[playerName]) ? returns[playerName].filter(item => item.id !== id) : []
 if (list.length) returns[playerName] = list
 else delete returns[playerName]
 this.meta.returns = returns
 this.deleteReturnItem(id)
 this.save()
 }

 setReturnItem(id, item) {
  const stack = item?.clone ? item.clone() : stackFromData(item)
  if (!stack) return false
  this.qidb.set(`r_${id}`, stack)
  return true
 }

 getReturnItem(id) {
 try {
 return this.qidb.get(`r_${id}`)
 } catch {
 return null
 }
 }

 deleteReturnItem(id) {
 try {
 if (this.qidb.has(`r_${id}`)) this.qidb.delete(`r_${id}`)
 } catch {}
 }

 migrate() {
 if (world.getDynamicProperty(MIGRATED_KEY)) return
 const listings = readJsonProp(LEGACY_LISTINGS_KEY, [])
 const returns = readJsonProp(LEGACY_RETURNS_KEY, {})
 if (Array.isArray(listings) && !this.getListings().length) {
 this.meta.listings = listings
 for (const listing of listings) this.setListingItem(listing.id, listing)
 }
 if (returns && typeof returns === "object" && !Object.keys(this.meta.returns || {}).length) {
 this.meta.returns = returns
 for (const items of Object.values(returns)) {
 if (!Array.isArray(items)) continue
 for (const item of items) this.setReturnItem(item.id, item)
 }
 }
 this.meta.lastListingId = Math.max(this.getLastListingId(), Number(world.getDynamicProperty(LEGACY_LAST_ID_KEY)) || 0)
 this.save()
 world.setDynamicProperty(MIGRATED_KEY, "true")
 }
}
