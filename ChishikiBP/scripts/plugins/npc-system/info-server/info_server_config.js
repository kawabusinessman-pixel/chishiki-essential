import { GlobalConfig } from "../../../function/GlobalConfig.js";

const CONFIG_KEY = "serverInfo";

const SECTIONS = ["staff", "rules", "guide"];

const DEFAULT_CONFIG = {
 staff: [
  "§eOwner §7- KiworaID",
 ],
 rules: [
  "§e1. §7No cheating or hacking",
  "§e2. §7No toxic behavior or swearing",
  "§e3. §7Respect all players",
  "§e4. §7No spamming chat/commands",
  "§e5. §7No scamming other players",
 ],
 guide: [
  "§7Buka §f/menu §7untuk membuka menu member",
  "§7Gunakan §f/warp §7untuk berpindah lokasi",
  "§7Butuh bantuan? Ketik §f/helps",
 ],
};

function normalizeLines(value) {
 if (!Array.isArray(value)) return [];
 return value.filter(line => typeof line === "string" && line.trim().length > 0);
}

function seedConfig() {
 const seed = { ...DEFAULT_CONFIG };
 const legacyRules = GlobalConfig.get("serverRules");
 if (legacyRules && typeof legacyRules === "object" && Array.isArray(legacyRules.rules)) {
  seed.rules = normalizeLines(legacyRules.rules);
 }
 GlobalConfig.set(CONFIG_KEY, seed);
 return seed;
}

export function getInfoConfig() {
 try {
  const config = GlobalConfig.get(CONFIG_KEY);
  if (!config || typeof config !== "object") return seedConfig();
  const merged = { ...DEFAULT_CONFIG };
  for (const section of SECTIONS) {
  merged[section] = normalizeLines(config[section]);
  }
  return merged;
 } catch (error) {
  console.warn("Error getting server info config:", error);
  return { ...DEFAULT_CONFIG };
 }
}

export function saveInfoConfig(config) {
 try {
  const normalized = { ...DEFAULT_CONFIG };
  for (const section of SECTIONS) {
  normalized[section] = normalizeLines(config[section]);
  }
  return GlobalConfig.set(CONFIG_KEY, normalized);
 } catch (error) {
  console.warn("Error saving server info config:", error);
  return false;
 }
}

export function getInfoSection(section) {
 const config = getInfoConfig();
 return SECTIONS.includes(section) ? config[section] : [];
}

export function saveInfoSection(section, lines) {
 if (!SECTIONS.includes(section)) return false;
 const config = getInfoConfig();
 config[section] = normalizeLines(lines);
 return saveInfoConfig(config);
}
