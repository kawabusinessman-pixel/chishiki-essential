import { world, system } from '../core.js';

const PREFIX = "kiw:cfg:";
const LEGACY_PROP = "kiw_essentials:config";
const MIGRATED_FLAG = "kiw:cfg_migrated";
const CONFIG_READY_FLAG = "kiw:cfg_ready";
const CHUNK_META_SUFFIX = "#chunks";
const CHUNK_PART_SUFFIX = "#c:";
const MAX_PROP_CHARS = 30000;

const LEGACY_KEYS = [
 "currency:config", "reports", "antinuker_config", "chat_settings",
 "time:timezone", "time:enabled", "time:displayTime",
 "scoreboard_lines", "nametag_settings", "afkConfig", "bannedItems",
 "banItemAutoClearEnabled", "bankResetTimestamp", "backpack_config",
 "bp_version", "customRanks", "customRankList", "defaultRank", "sft:theme",
 "sft:timerEnabled", "sft:radarEnabled", "sft:displayEnabled",
 "sft:moneyDisplayMode", "moneySystem:config", "homeConfig",
 "clearlagConfig", "xpShopConfig", "npcConfig", "dailyRewardConfig",
 "custom_shop_config", "starterKitConfig", "rare_shop_config",
 "totalServerVotes", "voteRewards", "cfg:admin_tag", "cfg:sys_db",
 "cfg:plr_db", "cfg:ses_db", "sys:auth_enabled", "bounty:minAmount",
 "bounty:refundPercent", "bounty:cooldown", "bounty:expire",
 "transferConfig", "rare_shop:stock_mode", "rare_shop:restock_interval",
 "rank_benefits", "shop_dp_config", "shop_dp_counters", "bank_config"
];

function encodeValue(value) {
 if (value === null || value === undefined) return undefined;
 if (typeof value === "boolean" || typeof value === "number") return String(value);
 if (typeof value === "string") return value;
 return JSON.stringify(value);
}

function decodeValue(raw) {
 if (raw === undefined || raw === null) return undefined;
 if (typeof raw !== "string") return raw;
 if (raw === "true") return true;
 if (raw === "false") return false;
 if (raw.startsWith("{") || raw.startsWith("[")) {
  try { return JSON.parse(raw); } catch { }
 }
 const num = Number(raw);
 if (!isNaN(num) && raw.trim() !== "") return num;
 return raw;
}

class GlobalConfig {
	static _migrated = false;
	static _ready = false;
	static _memoryCache = new Map();

	static _migrateOnce() {
		if (this._migrated) return;
		this._migrated = true;

		try {
			if (world.getDynamicProperty(MIGRATED_FLAG)) {
				this._ready = true;
				return;
			}
		} catch (e) {
			console.warn("[GlobalConfig] Error checking migration flag:", e);
			this._migrated = false;
			return;
		}

		let count = 0;

		try {
			const rawGlobal = world.getDynamicProperty(LEGACY_PROP);
			if (rawGlobal) {
				try {
					const parsed = JSON.parse(rawGlobal);
					for (const [k, v] of Object.entries(parsed)) {
						if (v !== undefined && v !== null) {
							try {
								world.setDynamicProperty(PREFIX + k, encodeValue(v));
								count++;
							} catch (e) {
								console.warn(`[GlobalConfig] Failed to migrate key "${k}":`, e);
							}
						}
					}
				} catch (e) {
					console.warn("[GlobalConfig] Failed to parse legacy config:", e);
				}
				try { world.setDynamicProperty(LEGACY_PROP, undefined); } catch { }
			}
		} catch (e) {
			console.warn("[GlobalConfig] Error reading legacy prop:", e);
		}

		for (const key of LEGACY_KEYS) {
			try {
				const raw = world.getDynamicProperty(key);
				if (raw !== undefined) {
					try {
						world.setDynamicProperty(PREFIX + key, typeof raw === "string" ? raw : encodeValue(raw));
						world.setDynamicProperty(key, undefined);
						count++;
					} catch (e) {
						console.warn(`[GlobalConfig] Failed to migrate legacy key "${key}":`, e);
					}
				}
			} catch { }
		}

		try {
			world.setDynamicProperty(MIGRATED_FLAG, true);
		} catch (e) {
			console.warn("[GlobalConfig] Failed to set migration flag:", e);
		}

		this._ready = true;
		if (count > 0) console.warn(`[GlobalConfig] Migrasi selesai: ${count} key dipindahkan ke format baru.`);
	}

	static isReady() {
		return this._ready;
	}

	static _clearChunks(key) {
		try {
			const metaRaw = world.getDynamicProperty(PREFIX + key + CHUNK_META_SUFFIX);
			const meta = metaRaw ? decodeValue(metaRaw) : null;
			const count = Number(meta?.count) || 0;
			for (let i = 0; i < count; i++) {
				try { world.setDynamicProperty(PREFIX + key + CHUNK_PART_SUFFIX + i, undefined); } catch { }
			}
			world.setDynamicProperty(PREFIX + key + CHUNK_META_SUFFIX, undefined);
		} catch { }
	}

	static _setChunked(key, encoded) {
		const chunks = [];
		for (let i = 0; i < encoded.length; i += MAX_PROP_CHARS) {
			chunks.push(encoded.slice(i, i + MAX_PROP_CHARS));
		}
		this._clearChunks(key);
		world.setDynamicProperty(PREFIX + key, undefined);
		for (let i = 0; i < chunks.length; i++) {
			world.setDynamicProperty(PREFIX + key + CHUNK_PART_SUFFIX + i, chunks[i]);
		}
		world.setDynamicProperty(PREFIX + key + CHUNK_META_SUFFIX, encodeValue({ count: chunks.length }));
		return true;
	}

	static _getChunked(key) {
		try {
			const metaRaw = world.getDynamicProperty(PREFIX + key + CHUNK_META_SUFFIX);
			if (metaRaw === undefined || metaRaw === null) return undefined;
			const meta = decodeValue(metaRaw);
			const count = Number(meta?.count) || 0;
			if (count <= 0) return undefined;
			let combined = "";
			for (let i = 0; i < count; i++) {
				const part = world.getDynamicProperty(PREFIX + key + CHUNK_PART_SUFFIX + i);
				if (typeof part !== "string") return undefined;
				combined += part;
			}
			return decodeValue(combined);
		} catch {
			return undefined;
		}
	}

	static get(key, defaultValue) {
		if (this._memoryCache.has(key)) {
			const cached = this._memoryCache.get(key);
			return cached !== undefined ? cached : defaultValue;
		}
		this._migrateOnce();
		try {
			const chunked = this._getChunked(key);
			if (chunked !== undefined) {
				this._memoryCache.set(key, chunked);
				return chunked;
			}
			const raw = world.getDynamicProperty(PREFIX + key);
			if (raw === undefined || raw === null) {
				return defaultValue;
			}
			const decoded = decodeValue(raw);
			this._memoryCache.set(key, decoded);
			return decoded;
		} catch (e) {
			console.warn(`[GlobalConfig] Error getting key "${key}":`, e);
			return defaultValue;
		}
	}

	static set(key, value) {
		this._migrateOnce();
		this._memoryCache.set(key, value);
		try {
			if (value === undefined || value === null) {
				this._memoryCache.delete(key);
				this._clearChunks(key);
				world.setDynamicProperty(PREFIX + key, undefined);
				return true;
			}
			const encoded = encodeValue(value);
			if (typeof encoded === "string" && encoded.length > MAX_PROP_CHARS) {
				return this._setChunked(key, encoded);
			}
			this._clearChunks(key);
			world.setDynamicProperty(PREFIX + key, encoded);
			return true;
		} catch (e) {
			console.warn(`[GlobalConfig] Gagal simpan key "${key}":`, e);
			return false;
		}
	}

	static delete(key) {
		this._migrateOnce();
		this._memoryCache.delete(key);
		try {
			this._clearChunks(key);
			world.setDynamicProperty(PREFIX + key, undefined);
			return true;
		} catch (e) {
			console.warn(`[GlobalConfig] Error deleting key "${key}":`, e);
			return false;
		}
	}

	static invalidate(key) {
		if (key) this._memoryCache.delete(key);
		else this._memoryCache.clear();
	}
}

system.runTimeout(() => {
 GlobalConfig._migrateOnce();
}, 10);

export { GlobalConfig };
