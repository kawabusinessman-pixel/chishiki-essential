
import { world } from "../core.js";
import { GlobalConfig } from "./GlobalConfig.js";
import { Lang } from "../lib/Lang.js";

const stripColors = (text) => text.replace(/§./g, "").trim();
const LEGACY_NONE = new Set(["", "-", "none", "belum dipilih", "not selected yet"]);


export const GENDER_DB = "player:gender";

export const GENDER_STORE_KEY = "gender:db";
export const GENDER_ENABLED_KEY = "cfg:gender_enabled";
export const GENDER_REQUIRED_KEY = "cfg:gender_required";
export const GENDER_OPTIONS_KEY = "cfg:gender_options";


const DP_SOFT_LIMIT = 30000;
const STORE_VERSION = 2;

const DEFAULT_OPTIONS = [
 { id: "male", label: "§9\u2642 Male" },
 { id: "female", label: "§d\u2640 Female" },
];

const DEFAULT_ICONS = {
 male: "textures/ui/icon_steve",
 female: "textures/ui/icon_alex",
};

const VALUE_ENCODE = Object.freeze({ male: "m", female: "f", none: "n" });
const VALUE_DECODE = Object.freeze({ m: "male", f: "female", n: "none" });

let cacheMap = null;
let cacheDirty = false;

export function getGenderOptionIcon(id) {
 return DEFAULT_ICONS[id];
}

function normalizeOption(entry) {
 if (!entry || typeof entry.id !== "string" || typeof entry.label !== "string") return null;
 const id = entry.id.trim().toLowerCase().replace(/\s+/g, "_");
 const label = entry.label.trim();
 if (!id || !label) return null;
 return { id, label };
}

export function getGenderOptions() {
 const raw = GlobalConfig.get(GENDER_OPTIONS_KEY);
 if (!raw) return DEFAULT_OPTIONS.map((entry) => ({ ...entry }));

 let parsed = raw;
 if (typeof raw === "string") {
 try {
 parsed = JSON.parse(raw);
 } catch {
 return DEFAULT_OPTIONS.map((entry) => ({ ...entry }));
 }
 }

 if (!Array.isArray(parsed)) return DEFAULT_OPTIONS.map((entry) => ({ ...entry }));

 const options = parsed.map(normalizeOption).filter(Boolean);
 return options.length ? options : DEFAULT_OPTIONS.map((entry) => ({ ...entry }));
}

export function setGenderOptions(options) {
 const normalized = options.map(normalizeOption).filter(Boolean);
 GlobalConfig.set(GENDER_OPTIONS_KEY, JSON.stringify(normalized.length ? normalized : DEFAULT_OPTIONS));
}

export function getGenderOptionById(id) {
 return getGenderOptions().find((entry) => entry.id === id);
}

export function isGenderEnabled() {
 return GlobalConfig.get(GENDER_ENABLED_KEY) ?? true;
}

export function isGenderRequired() {
 return GlobalConfig.get(GENDER_REQUIRED_KEY) ?? true;
}


export function playerGenderKey(playerOrId) {
 const s = String(typeof playerOrId === "string" ? playerOrId : playerOrId?.id ?? "");
 let h = 2166136261;
 for (let i = 0; i < s.length; i++) {
 h ^= s.charCodeAt(i);
 h = Math.imul(h, 16777619);
 }
 return (h >>> 0).toString(16).padStart(8, "0");
}

function encodeValue(choice) {
 const raw = String(choice ?? "").trim();
 if (!raw) return "";
 if (VALUE_ENCODE[raw]) return VALUE_ENCODE[raw];
 if (VALUE_DECODE[raw]) return raw;
 const id = raw.toLowerCase().replace(/\s+/g, "_");
 return id.length <= 8 ? id : id.slice(0, 8);
}

function decodeValue(code) {
 const c = String(code ?? "").trim();
 if (!c) return "";
 if (VALUE_DECODE[c]) return VALUE_DECODE[c];
 return c;
}

function migrateLegacyStore(parsed) {
 const map = {};
 if (parsed?.byId && typeof parsed.byId === "object") {
 for (const [id, val] of Object.entries(parsed.byId)) {
 const encoded = encodeValue(val);
 if (encoded) map[playerGenderKey(id)] = encoded;
 }
 }
 if (parsed?.byName && typeof parsed.byName === "object") {
 for (const [name, val] of Object.entries(parsed.byName)) {
 try {
 const online = [...world.getPlayers()].find((p) => p.name === name);
 if (online) {
 const encoded = encodeValue(val);
 if (encoded) map[playerGenderKey(online)] = encoded;
 }
 } catch { }
 }
 }
 if (parsed?.m && typeof parsed.m === "object") {
 Object.assign(map, parsed.m);
 }
 return map;
}

function loadMapFromWorld() {
 try {
 const raw = world.getDynamicProperty(GENDER_STORE_KEY);
 if (!raw) return {};
 const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
 if (!parsed || typeof parsed !== "object") return {};

 if (parsed.v === STORE_VERSION && parsed.m && typeof parsed.m === "object") {
 return { ...parsed.m };
 }
 return migrateLegacyStore(parsed);
 } catch {
 return {};
 }
}

function getMap() {
 if (!cacheMap) cacheMap = loadMapFromWorld();
 return cacheMap;
}

function persistMap(map) {
 const payload = JSON.stringify({ v: STORE_VERSION, m: map });
 if (payload.length > DP_SOFT_LIMIT) {
 console.warn(`[GENDER] Store near/over limit: ${payload.length}/${DP_SOFT_LIMIT} bytes`);
 }
 world.setDynamicProperty(GENDER_STORE_KEY, payload);
 cacheMap = map;
 cacheDirty = false;
 return payload.length;
}


export function getGenderStoreStats() {
 const map = getMap();
 const count = Object.keys(map).length;
 const packed = JSON.stringify({ v: STORE_VERSION, m: map });
 const size = packed.length;
 const avg = count > 0 ? size / count : 18;
 const estCapacity = Math.max(count, Math.floor(DP_SOFT_LIMIT / Math.max(12, avg)));
 return {
 count,
 size,
 limit: DP_SOFT_LIMIT,
 estCapacity: Math.min(2000, estCapacity),
 free: Math.max(0, estCapacity - count),
 percent: Math.min(100, Math.round((size / DP_SOFT_LIMIT) * 100)),
 };
}

export function getGenderStore() {
 return { m: { ...getMap() }, v: STORE_VERSION };
}

export function saveGenderStore() {
 return persistMap(getMap());
}

function getRawPlayerGender(player) {
 if (!player) return "";
 const key = playerGenderKey(player);
 const map = getMap();
 if (Object.prototype.hasOwnProperty.call(map, key)) {
 return decodeValue(map[key]);
 }

 try {
 const legacy = player.getDynamicProperty?.(GENDER_DB);
 if (typeof legacy === "string" && legacy.trim()) {
 setPlayerGender(player, legacy.trim());
 try {
 player.setDynamicProperty(GENDER_DB, undefined);
 } catch { }
 return legacy.trim();
 }
 } catch { }

 return "";
}

export function isValidPlayerGender(raw) {
 if (typeof raw !== "string" || !raw.trim()) return false;
 const plain = stripColors(raw).toLowerCase();
 if (LEGACY_NONE.has(plain)) return false;
 return getGenderOptions().some(
 (option) =>
 option.id === plain ||
 option.label === raw ||
 stripColors(option.label).toLowerCase() === plain,
 );
}

export function hasPlayerGender(player) {
 if (!isGenderEnabled()) return false;
 const raw = getRawPlayerGender(player);
 if (raw === "none") return true;
 return isValidPlayerGender(raw);
}

export function getPlayerGender(player) {
 if (!isGenderEnabled()) return "";
 const raw = getRawPlayerGender(player);
 if (!raw || raw === "none" || LEGACY_NONE.has(stripColors(raw).toLowerCase())) {
  const lbl = Lang.t(player, "login.gender.label.none");
  return (lbl && lbl !== "login.gender.label.none") ? lbl : "None";
 }
 const byId = getGenderOptionById(raw.toLowerCase());
 if (byId) return byId.label;
 const byLabel = getGenderOptions().find((option) => option.label === raw);
 return byLabel?.label ?? raw;
}

export function setPlayerGender(player, choice) {
 if (!player?.id) return false;
 const value = choice === "none" ? "none" : String(choice ?? "").trim();
 if (!value) return clearPlayerGender(player);

 const encoded = encodeValue(value);
 if (!encoded) return false;

 const map = getMap();
 map[playerGenderKey(player)] = encoded;
 persistMap(map);

 try {
 player.setDynamicProperty?.(GENDER_DB, undefined);
 } catch { }
 return true;
}

export function clearPlayerGender(player) {
 if (!player?.id) return false;
 const map = getMap();
 const key = playerGenderKey(player);
 if (!Object.prototype.hasOwnProperty.call(map, key)) {
 try {
 player.setDynamicProperty?.(GENDER_DB, undefined);
 } catch { }
 return true;
 }
 delete map[key];
 persistMap(map);
 try {
 player.setDynamicProperty?.(GENDER_DB, undefined);
 } catch { }
 return true;
}

export function setGenderByName(playerName, choice) {
 const name = String(playerName ?? "").trim();
 if (!name) return false;
 const online = [...world.getPlayers()].find((p) => p.name === name);
 if (!online) return false;
 return setPlayerGender(online, choice);
}

export function clearGenderByName(playerName) {
 return setGenderByName(playerName, "");
}
