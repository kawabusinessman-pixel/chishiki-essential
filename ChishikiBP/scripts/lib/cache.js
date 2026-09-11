export class CacheManager {
 constructor(maxAge = 300000) {
 this.caches = new Map()
 this.maxAge = maxAge
 }
 set(key, value, customAge = null) {
 this.caches.set(key, {
 value,
 timestamp: Date.now(),
 maxAge: customAge || this.maxAge
 })
 }
 get(key) {
 const cached = this.caches.get(key)
 if (!cached) return null
 if (Date.now() - cached.timestamp > cached.maxAge) {
 this.caches.delete(key)
 return null
 }
 return cached.value
 }
 has(key) {
 return this.get(key) !== null
 }
 delete(key) {
 return this.caches.delete(key)
 }
 clear() {
 this.caches.clear()
 }
 cleanup() {
 const now = Date.now()
 for (const [key, cached] of this.caches.entries()) {
 if (now - cached.timestamp > cached.maxAge) {
 this.caches.delete(key)
 }
 }
 }
 size() {
 return this.caches.size
 }
 invalidate(pattern) {
 if (typeof pattern === 'string') {
 for (const key of this.caches.keys()) {
 if (key.includes(pattern)) {
 this.caches.delete(key)
 }
 }
 } else if (pattern instanceof RegExp) {
 for (const key of this.caches.keys()) {
 if (pattern.test(key)) {
 this.caches.delete(key)
 }
 }
 }
 }
}
export const globalCache = new CacheManager()
export const lineFormatCache = new CacheManager()
export const symbolListCache = new CacheManager()
export const formatLine = (symbol, text) => {
 const cacheKey = `${symbol}:${text}`
 let formatted = lineFormatCache.get(cacheKey)
 if (!formatted) {
 formatted = `§f${symbol} §f${text}`
 lineFormatCache.set(cacheKey, formatted)
 if (lineFormatCache.size() > 100) {
 lineFormatCache.clear()
 }
 }
 return formatted
}
export const getFormattedSymbolsList = (symbolCategories) => {
 let list = symbolListCache.get('symbolsList')
 if (!list) {
 list = []
 for (const [category, symbols] of Object.entries(symbolCategories)) {
 for (const [name, symbol] of Object.entries(symbols)) {
 list.push({ name: `${category}_${name}`, symbol })
 }
 }
 symbolListCache.set('symbolsList', list)
 }
 return list
}
export const clearSymbolCache = () => {
 symbolListCache.delete('symbolsList')
}