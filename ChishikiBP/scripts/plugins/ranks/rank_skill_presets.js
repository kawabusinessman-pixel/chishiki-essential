import { applyRankRepairSkill } from "../npc-system/repair-kit/repair_kit.js"

export const RANK_REPAIR_BUILTIN = "builtin:repair"
export const RANK_KIT_BUILTIN = "builtin:kit"

export const RANK_SKILL_PRESETS = [
  { key: "+fly", label: "Fly ON", cmd: "ability @s mayfly true", msg: "§aFlight enabled§f" },
  { key: "+fly off", label: "Fly OFF", cmd: "ability @s mayfly false", msg: "§cFlight disabled§f" },
  { key: "+feed", label: "Feed / Saturation", cmd: "effect @s saturation 30 255 true", msg: "§aHunger restored§f" },
  { key: "+heal", label: "Heal", cmd: "effect @s instant_health 1 255 true", msg: "§aHealth restored§f" },
  { key: "+nightvision", label: "Night Vision", cmd: "effect @s night_vision infinite 1 true", msg: "§aNight vision on§f" },
  { key: "+vanish", label: "Invisibility", cmd: "effect @s invisibility infinite 1 true", msg: "§aInvisibility on§f" },
  { key: "+haste", label: "Haste", cmd: "effect @s haste 600 2 true", msg: "§aHaste applied§f" },
  { key: "+speed", label: "Speed", cmd: "effect @s speed 600 2 true", msg: "§aSpeed applied§f" },
  { key: "+jump", label: "Jump Boost", cmd: "effect @s jump_boost 600 2 true", msg: "§aJump boost applied§f" },
  { key: "+clear", label: "Clear Effects", cmd: "effect @s clear", msg: "§aEffects cleared§f" },
  { key: "+gmc", label: "Creative", cmd: "gamemode c @s", msg: "§aCreative mode§f" },
  { key: "+gms", label: "Survival", cmd: "gamemode s @s", msg: "§aSurvival mode§f" },
  { key: "+gmsp", label: "Spectator", cmd: "gamemode spectator @s", msg: "§aSpectator mode§f" },
  { key: "+day", label: "Set Day", cmd: "time set day", msg: "§aTime set to day§f" },
  { key: "+weather", label: "Clear Weather", cmd: "weather clear", msg: "§aWeather cleared§f" },
  { key: "+repair", label: "Repair Items", cmd: RANK_REPAIR_BUILTIN, msg: "§aItems repaired§f" },
  { key: "+kit", label: "Starter Kit (Form NPC)", cmd: RANK_KIT_BUILTIN, msg: "" },
]

export function normalizeSkillKey(raw) {
  const key = String(raw || "").trim().toLowerCase()
  if (!key) return ""
  return key.startsWith("+") ? key : `+${key}`
}

export function findPresetByKey(key) {
  const norm = normalizeSkillKey(key)
  return RANK_SKILL_PRESETS.find((p) => p.key === norm) || null
}

export function isRankRepairSkill(message, skill) {
  const key = normalizeSkillKey(message || skill?.key || "")
  if (key === "+repair") return true
  const cmd = String(skill?.cmd || "").trim().toLowerCase()
  return cmd === RANK_REPAIR_BUILTIN || cmd === "repair @s" || cmd === "repair"
}

export function isRankKitSkill(message, skill) {
  const key = normalizeSkillKey(message || skill?.key || "")
  if (key === "+kit") return true
  const cmd = String(skill?.cmd || "").trim().toLowerCase()
  return cmd === RANK_KIT_BUILTIN || cmd === "kit" || cmd === "kit @s"
}

export function runRankRepairSkill(player, successMsg) {
  return applyRankRepairSkill(player, successMsg)
}
