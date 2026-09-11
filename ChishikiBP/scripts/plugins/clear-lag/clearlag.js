import { world, system, ActionFormData, ModalFormData } from "../../core"
import { showMainMenu } from "../../kiwora.js"
import { clearAllFloatingItemTexts } from "../floating-text/floating-item.js"
import { GlobalConfig } from "../../function/GlobalConfig.js"
import {
  isItemEntity,
  isNameProtected,
  getItemUnitCount,
  getStackerMobTotal,
  releaseStackerMetadata,
} from "../all-stacker/stack-info.js"

const CLEAR_EXEMPT_TAG = "no_clear"
const NEARBY_MOB_SCAN_RADIUS = 24
const MAX_MOB_TYPES = 64
const DIMENSION_IDS = ["overworld", "nether", "the_end"]

const trackedItems = new Map()
let trackedItemsReady = false
let activeClearJob = false

/** Default hostile mob types; the menu can extend or replace this list. */
const DEFAULT_MOB_TYPES = [
  "minecraft:zombie",
  "minecraft:husk",
  "minecraft:drowned",
  "minecraft:zombie_villager_v2",
  "minecraft:skeleton",
  "minecraft:stray",
  "minecraft:bogged",
  "minecraft:wither_skeleton",
  "minecraft:creeper",
  "minecraft:spider",
  "minecraft:cave_spider",
  "minecraft:silverfish",
  "minecraft:enderman",
  "minecraft:endermite",
  "minecraft:witch",
  "minecraft:slime",
  "minecraft:magma_cube",
  "minecraft:blaze",
  "minecraft:zombie_pigman",
  "minecraft:piglin",
  "minecraft:hoglin",
  "minecraft:ghast",
  "minecraft:phantom",
  "minecraft:guardian",
  "minecraft:pillager",
  "minecraft:vindicator",
  "minecraft:evocation_illager",
  "minecraft:ravager",
  "minecraft:vex",
]

/** Entity types that ClearLag never removes. */
const PROTECTED_TYPE_IDS = new Set([
  "minecraft:player",
  "minecraft:wither",
  "minecraft:ender_dragon",
  "minecraft:warden",
  "minecraft:elder_guardian",
  "minecraft:villager",
  "minecraft:villager_v2",
  "minecraft:wandering_trader",
  "minecraft:iron_golem",
  "minecraft:snow_golem",
  "minecraft:armor_stand",
  "minecraft:npc",
  "kiwo:npc",
  "add:floating_text",
  "qidb:storage",
])

const PROTECTED_TYPE_PREFIXES = ["enchanted:", "sr:", "r4isen1920_invsee:"]

const DEFAULT_MESSAGES = {
  start: "Clearing lag in {time} seconds",
  countdown: "{time} seconds until clear",
  success: "Removed {count} dropped items ({amount} total)",
  noEntities: "No items found to clear",
  mobSuccess: "Removed {count} mobs ({amount} total)",
  noMobs: "No clearable mobs found",
}

const DEFAULT_CONFIG = {
  enabled: false,
  interval: 300,
  warningTimes: [60, 30, 15, 10, 5],
  prefix: "[CLEAR LAG]",
  itemEnabled: true,
  mobEnabled: true,
  protectNamed: true,
  mobTypes: DEFAULT_MOB_TYPES,
  messages: DEFAULT_MESSAGES,
}

let currentConfig = null

function normalizeMobTypes(value, fallback) {
  if (!Array.isArray(value)) return [...fallback]
  const cleaned = value
    .filter(entry => typeof entry === "string")
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0 && entry.length <= 128 && !isProtectedTypeId(entry))
  return [...new Set(cleaned)].slice(0, MAX_MOB_TYPES)
}

function normalizeConfig(value) {
  const input = value && typeof value === "object" ? value : {}
  const interval = Math.max(5, parseInt(input.interval) || DEFAULT_CONFIG.interval)
  const warningTimes = Array.isArray(input.warningTimes)
    ? input.warningTimes.map(t => parseInt(t)).filter(t => !isNaN(t) && t > 0 && t < interval).sort((a, b) => b - a)
    : [...DEFAULT_CONFIG.warningTimes].filter(t => t < interval)
  return {
    enabled: !!input.enabled,
    interval,
    warningTimes,
    prefix: typeof input.prefix === "string" && input.prefix.length > 0 ? input.prefix : DEFAULT_CONFIG.prefix,
    itemEnabled: input.itemEnabled === undefined ? DEFAULT_CONFIG.itemEnabled : !!input.itemEnabled,
    mobEnabled: input.mobEnabled === undefined ? DEFAULT_CONFIG.mobEnabled : !!input.mobEnabled,
    protectNamed: input.protectNamed === undefined ? DEFAULT_CONFIG.protectNamed : !!input.protectNamed,
    mobTypes: normalizeMobTypes(input.mobTypes, DEFAULT_MOB_TYPES),
    messages: { ...DEFAULT_MESSAGES, ...(input.messages && typeof input.messages === "object" ? input.messages : {}) },
  }
}

function getConfig() {
  if (currentConfig) return currentConfig
  try {
    const saved = GlobalConfig.get("clearlagConfig")
    const parsed = typeof saved === "string" ? JSON.parse(saved) : saved
    currentConfig = normalizeConfig(parsed)
    return currentConfig
  } catch {
    currentConfig = currentConfig || normalizeConfig(null)
    return currentConfig
  }
}

function saveConfig(config) {
  try {
    const normalized = normalizeConfig(config)
    GlobalConfig.set("clearlagConfig", normalized)
    currentConfig = normalized
    return true
  } catch {
    return false
  }
}

function isProtectedTypeId(typeId) {
  if (PROTECTED_TYPE_IDS.has(typeId)) return true
  return PROTECTED_TYPE_PREFIXES.some(prefix => typeId.startsWith(prefix))
}

function isEntityValid(entity) {
  try {
    if (!entity) return false
    if (typeof entity.isValid === "function") return !!entity.isValid()
    return entity.isValid !== false
  } catch {
    return false
  }
}

function hasTag(entity, tag) {
  try {
    return entity?.hasTag?.(tag) === true
  } catch {
    return false
  }
}

function isTamedOrLeashed(entity) {
  try {
    if (entity.hasComponent("minecraft:is_tamed") || entity.hasComponent("minecraft:tameable")) return true
    return !!entity.getComponent("minecraft:leashable")?.leashHolder
  } catch {
    return false
  }
}

function normalizeDimensionId(id) {
  return String(id || "").replace(/^minecraft:/, "")
}

function getActiveDimensionIds() {
  const activeDimensionIds = new Set()
  try {
    for (const player of world.getPlayers()) {
      activeDimensionIds.add(normalizeDimensionId(player.dimension.id))
    }
  } catch {
  }
  return activeDimensionIds
}

function getDimensions(activeDimensionIds = null) {
  const dimensions = []
  for (const id of DIMENSION_IDS) {
    if (activeDimensionIds && !activeDimensionIds.has(normalizeDimensionId(id))) continue
    try {
      dimensions.push(world.getDimension(id))
    } catch {
    }
  }
  return dimensions
}

function getLoadedEntities(dimension, typeId) {
  try {
    return dimension.getEntities(typeId
      ? { type: typeId }
      : { excludeTypes: ["minecraft:player"] })
  } catch {
    return []
  }
}

function trackItemEntity(entity) {
  try {
    if (entity?.typeId === "minecraft:item" && entity.isValid !== false) {
      trackedItems.set(entity.id, entity)
    }
  } catch {
  }
}

function untrackItemEntity(entityId) {
  if (entityId) trackedItems.delete(entityId)
}

function getTrackedItemEntities() {
  const items = []
  for (const [entityId, entity] of trackedItems) {
    if (!isEntityValid(entity)) {
      trackedItems.delete(entityId)
      continue
    }
    items.push(entity)
  }
  return items
}

function getItemEntitiesForClear(activeDimensionIds = null) {
  const items = []
  const sourceItems = trackedItemsReady ? getTrackedItemEntities() : getDimensions(activeDimensionIds).flatMap(dimension => getLoadedEntities(dimension, "minecraft:item"))
  for (const entity of sourceItems) {
    try {
      if (activeDimensionIds && !activeDimensionIds.has(normalizeDimensionId(entity.dimension?.id))) continue
      trackItemEntity(entity)
      items.push(entity)
    } catch {
      untrackItemEntity(entity?.id)
    }
  }
  return items
}

function* seedTrackedItems() {
  for (const dimension of getDimensions()) {
    for (const entity of getLoadedEntities(dimension, "minecraft:item")) {
      trackItemEntity(entity)
      yield
    }
  }
  trackedItemsReady = true
}


function canClearItem(entity, config) {
  if (hasTag(entity, CLEAR_EXEMPT_TAG)) return false
  if (config.protectNamed && isNameProtected(entity)) return false
  return true
}

function canClearMob(entity, config, mobTypes) {
  if (!mobTypes.has(entity.typeId)) return false
  if (isProtectedTypeId(entity.typeId)) return false
  if (hasTag(entity, CLEAR_EXEMPT_TAG)) return false
  if (isTamedOrLeashed(entity)) return false
  if (config.protectNamed && isNameProtected(entity)) return false
  return true
}

function createEmptyResult() {
  return { items: 0, itemUnits: 0, mobs: 0, mobUnits: 0 }
}

function* countTargetsGenerator(resolve) {
  const config = getConfig()
  const mobTypes = new Set(config.mobTypes)
  const activeDimensionIds = getActiveDimensionIds()
  const result = createEmptyResult()

  if (config.itemEnabled) {
    for (const entity of getItemEntitiesForClear(activeDimensionIds)) {
      try {
        if (!isEntityValid(entity) || !canClearItem(entity, config)) continue
        result.items++
        result.itemUnits += getItemUnitCount(entity)
      } catch {
      }
      yield
    }
  }

  if (config.mobEnabled) {
    for (const dimension of getDimensions(activeDimensionIds)) {
      for (const entity of getLoadedEntities(dimension)) {
        try {
          if (!isEntityValid(entity) || isItemEntity(entity)) continue
          if (!canClearMob(entity, config, mobTypes)) continue
          result.mobs++
          result.mobUnits += getStackerMobTotal(entity)
        } catch {
        }
        yield
      }
    }
  }
  resolve(result)
}

/** Counts targets in a yielding job so large entity sets do not block one tick. */
function countTargets() {
  return new Promise(resolve => {
    try {
      system.runJob(countTargetsGenerator(resolve))
    } catch {
      resolve(createEmptyResult())
    }
  })
}

function* clearTargetsJob(config, scope, onFinished) {
  const result = createEmptyResult()
  const mobTypes = new Set(config.mobTypes)
  const activeDimensionIds = getActiveDimensionIds()
  const clearItems = scope.items === true
  const clearMobs = scope.mobs === true && mobTypes.size > 0

  if (clearItems) {
    try {
      clearAllFloatingItemTexts()
    } catch {
    }

    for (const entity of getItemEntitiesForClear(activeDimensionIds)) {
      try {
        if (!isEntityValid(entity) || !canClearItem(entity, config)) continue
        result.items++
        result.itemUnits += getItemUnitCount(entity)
        untrackItemEntity(entity.id)
        releaseStackerMetadata(entity)
        entity.remove()
      } catch {
      }
      yield
    }
  }

  if (clearMobs) {
    for (const dimension of getDimensions(activeDimensionIds)) {
      for (const entity of getLoadedEntities(dimension)) {
        try {
          if (!isEntityValid(entity) || isItemEntity(entity) || !canClearMob(entity, config, mobTypes)) continue
          result.mobs++
          result.mobUnits += getStackerMobTotal(entity)
          releaseStackerMetadata(entity)
          entity.remove()
        } catch {
        }
        yield
      }
    }
  }

  onFinished(result)
}

function runClear(scope, onFinished) {
  const config = getConfig()
  const activeScope = {
    items: scope.items === true && config.itemEnabled,
    mobs: scope.mobs === true && config.mobEnabled,
  }
  if (activeClearJob) {
    onFinished(createEmptyResult(), { items: false, mobs: false })
    return false
  }
  if (!activeScope.items && !activeScope.mobs) {
    onFinished(createEmptyResult(), activeScope)
    return false
  }
  activeClearJob = true
  try {
    system.runJob(clearTargetsJob(config, activeScope, result => {
      activeClearJob = false
      onFinished(result, activeScope)
    }))
    return true
  } catch {
    activeClearJob = false
    onFinished(createEmptyResult(), { items: false, mobs: false })
    return false
  }
}

function formatResultLines(config, result, scope) {
  const lines = []
  if (scope.items) {
    lines.push(result.items > 0
      ? config.messages.success.replace("{count}", result.items).replace("{amount}", result.itemUnits)
      : config.messages.noEntities)
  }
  if (scope.mobs) {
    lines.push(result.mobs > 0
      ? config.messages.mobSuccess.replace("{count}", result.mobs).replace("{amount}", result.mobUnits)
      : config.messages.noMobs)
  }
  return lines
}

function broadcastResult(config, result, scope) {
  const lines = formatResultLines(config, result, scope)
  if (!lines.length) return
  world.sendMessage(`${config.prefix} ${lines.join("\n")}`)
}

function scopeLabel(config) {
  if (config.itemEnabled && config.mobEnabled) return "Items + Mobs"
  if (config.itemEnabled) return "Items only"
  if (config.mobEnabled) return "Mobs only"
  return "Nothing selected"
}

function formatIdentifier(typeId) {
  const raw = String(typeId || "").split(":").pop() || ""
  return raw.split("_").filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || typeId
}

export async function clearlag(source) {
  try {
    const config = getConfig()
    const targets = await countTargets()
    const form = new ActionFormData()
      .title("Clear Lag")
      .body(
        `Items on ground: ${targets.items} (${targets.itemUnits} total)\n` +
        `Clearable mobs: ${targets.mobs} (${targets.mobUnits} total)\n` +
        `Auto clear: ${config.enabled ? "Enabled" : "Disabled"}\n` +
        `Interval: ${config.interval}s\n` +
        `Target: ${scopeLabel(config)}`
      )
      .button("Clear Now", "textures/ui/trash")
      .button("Auto Clear Settings", "textures/ui/immersive_reader")
      .button("Mob Clear Settings", "textures/items/spawn_eggs/spawn_egg_zombie")
      .button("Message Settings", "textures/ui/ic_send_white_48dp")
      .button("Back", "textures/ui/arrow_left")
    const res = await form.show(source)
    if (res.canceled) return
    const actions = [
      () => clearWithConfirm(source),
      () => showAutoSettings(source),
      () => showMobSettings(source),
      () => showMsgSettings(source),
      () => showMainMenu(source),
    ]
    actions[res.selection]?.()
  } catch {
    source.sendMessage("Failed to open clear lag menu")
  }
}

async function clearWithConfirm(source) {
  try {
    const config = getConfig()
    const targets = await countTargets()
    const form = new ActionFormData()
      .title("Confirm Clear")
      .body(
        `Items: ${targets.items} (${targets.itemUnits} total)\n` +
        `Mobs: ${targets.mobs} (${targets.mobUnits} total)\n\n` +
        `Named items and mobs are ${config.protectNamed ? "protected" : "NOT protected"}.\nThis cannot be undone!`
      )
      .button("Clear Items", "textures/ui/trash")
      .button("Clear Mobs", "textures/items/spawn_eggs/spawn_egg_zombie")
      .button("Clear Items + Mobs", "textures/ui/icon_deals")
      .button("Cancel", "textures/ui/arrow_left")
    const res = await form.show(source)
    if (res.canceled || res.selection === 3) return
    const scopes = [{ items: true, mobs: false }, { items: false, mobs: true }, { items: true, mobs: true }]
    const requested = scopes[res.selection]
    if (!requested) return
    if (requested.items && !config.itemEnabled) {
      source.sendMessage("Item clearing is disabled in Auto Clear Settings")
    }
    if (requested.mobs && !config.mobEnabled) {
      source.sendMessage("Mob clearing is disabled in Mob Clear Settings")
    }
    runClear(requested, (result, scope) => {
      if (!scope.items && !scope.mobs) return
      try {
        source.runCommand("playsound random.levelup @s ~~~ 1 1")
      } catch {
      }
      broadcastResult(config, result, scope)
    })
  } catch {
    source.sendMessage("Error clearing entities!")
  }
}

async function showAutoSettings(source) {
  try {
    const config = getConfig()
    const form = new ModalFormData()
      .title("Auto Clear Settings")
      .toggle("Enable Auto Clear", { defaultValue: config.enabled })
      .toggle("Clear Dropped Items", { defaultValue: config.itemEnabled })
      .toggle("Clear Mobs", { defaultValue: config.mobEnabled })
      .toggle("Protect Named Items & Mobs", { defaultValue: config.protectNamed })
      .textField("Interval (seconds, min: 5)", "300", { defaultValue: config.interval.toString() })
      .textField("Warning Times (comma separated)", "60,30,10,5", { defaultValue: config.warningTimes.join(",") })
    const res = await form.show(source)
    if (res.canceled) return
    const [enabled, itemEnabled, mobEnabled, protectNamed, intervalStr, warningStr] = res.formValues
    const interval = Math.max(5, parseInt(intervalStr) || DEFAULT_CONFIG.interval)
    const warningTimes = String(warningStr)
      .split(",")
      .map(t => parseInt(t.trim()))
      .filter(t => !isNaN(t) && t > 0 && t < interval)
      .sort((a, b) => b - a)
    const newConfig = { ...config, enabled, itemEnabled, mobEnabled, protectNamed, interval, warningTimes }
    if (!saveConfig(newConfig)) {
      source.sendMessage("Failed to save settings")
      return
    }
    source.sendMessage("Auto clear settings saved")
    if (enabled) startAutoClearSystem()
    else stopAutoClearSystem()
  } catch {
    source.sendMessage("Error opening settings")
  }
}

async function showMobSettings(source) {
  try {
    const config = getConfig()
    const form = new ActionFormData()
      .title("Mob Clear Settings")
      .body(
        `Mob clearing: ${config.mobEnabled ? "Enabled" : "Disabled"}\n` +
        `Named & tamed mobs: ${config.protectNamed ? "Protected" : "Not protected"}\n` +
        `Mob types in list: ${config.mobTypes.length}\n\n` +
        `Mobs tagged "${CLEAR_EXEMPT_TAG}" are always kept.`
      )
      .button(config.mobEnabled ? "Disable Mob Clearing" : "Enable Mob Clearing", config.mobEnabled ? "textures/ui/toggle_on" : "textures/ui/toggle_off")
      .button("Add Mob From Nearby", "textures/ui/plus")
      .button("Add Mob By Identifier", "textures/ui/icon_book_writable")
      .button("Remove Mob Type", "textures/ui/trash")
      .button("Reset To Default Monsters", "textures/ui/refresh")
      .button("Back", "textures/ui/arrow_left")
    const res = await form.show(source)
    if (res.canceled) return
    if (res.selection === 0) {
      if (saveConfig({ ...config, mobEnabled: !config.mobEnabled })) {
        source.sendMessage(`Mob clearing ${config.mobEnabled ? "disabled" : "enabled"}`)
      }
      system.runTimeout(() => showMobSettings(source), 2)
    } else if (res.selection === 1) {
      await showAddMobFromNearby(source)
    } else if (res.selection === 2) {
      await showAddMobByIdentifier(source)
    } else if (res.selection === 3) {
      await showRemoveMobType(source)
    } else if (res.selection === 4) {
      if (saveConfig({ ...config, mobTypes: [...DEFAULT_MOB_TYPES] })) {
        source.sendMessage(`Mob list reset to ${DEFAULT_MOB_TYPES.length} default monsters`)
      }
      system.runTimeout(() => showMobSettings(source), 2)
    } else if (res.selection === 5) {
      system.runTimeout(() => clearlag(source), 2)
    }
  } catch {
    source.sendMessage("Error opening mob settings")
  }
}

function getNearbyMobTypes(source, config) {
  const types = new Set()
  try {
    for (const entity of source.dimension.getEntities({ location: source.location, maxDistance: NEARBY_MOB_SCAN_RADIUS })) {
      if (!isEntityValid(entity) || isItemEntity(entity)) continue
      if (isProtectedTypeId(entity.typeId)) continue
      if (config.mobTypes.includes(entity.typeId)) continue
      types.add(entity.typeId)
    }
  } catch {
  }
  return [...types]
}

async function showAddMobFromNearby(source) {
  const config = getConfig()
  const types = getNearbyMobTypes(source, config)
  if (types.length === 0) {
    await new ActionFormData()
      .title("Add Mob From Nearby")
      .body(`No new mob types found within ${NEARBY_MOB_SCAN_RADIUS} blocks.`)
      .button("Back", "textures/ui/arrow_left")
      .show(source)
    system.runTimeout(() => showMobSettings(source), 2)
    return
  }
  const form = new ActionFormData()
    .title("Add Mob From Nearby")
    .body("Select a mob type to add to the clear list.")
  for (const typeId of types) form.button(`${formatIdentifier(typeId)}\n§7${typeId}`, "textures/ui/plus")
  form.button("Back", "textures/ui/arrow_left")
  const res = await form.show(source)
  if (res.canceled) return
  const typeId = types[res.selection]
  if (typeId) addMobType(source, typeId)
  system.runTimeout(() => showMobSettings(source), 2)
}

async function showAddMobByIdentifier(source) {
  const res = await new ModalFormData()
    .title("Add Mob By Identifier")
    .textField("Entity identifier", "minecraft:zombie")
    .show(source)
  if (res.canceled) return
  const typeId = String(res.formValues[0] || "").trim()
  if (typeId.length === 0) {
    source.sendMessage("Identifier cannot be empty")
  } else {
    addMobType(source, typeId.includes(":") ? typeId : `minecraft:${typeId}`)
  }
  system.runTimeout(() => showMobSettings(source), 2)
}

function addMobType(source, typeId) {
  const config = getConfig()
  if (isProtectedTypeId(typeId)) {
    source.sendMessage(`${formatIdentifier(typeId)} is protected and cannot be cleared`)
    return
  }
  if (config.mobTypes.includes(typeId)) {
    source.sendMessage(`${formatIdentifier(typeId)} is already in the list`)
    return
  }
  if (config.mobTypes.length >= MAX_MOB_TYPES) {
    source.sendMessage(`Mob list is full (max ${MAX_MOB_TYPES})`)
    return
  }
  if (saveConfig({ ...config, mobTypes: [...config.mobTypes, typeId] })) {
    source.sendMessage(`Added ${formatIdentifier(typeId)} to the clear list`)
  } else {
    source.sendMessage("Failed to save mob list")
  }
}

async function showRemoveMobType(source) {
  const config = getConfig()
  if (config.mobTypes.length === 0) {
    await new ActionFormData()
      .title("Remove Mob Type")
      .body("The mob clear list is empty.")
      .button("Back", "textures/ui/arrow_left")
      .show(source)
    system.runTimeout(() => showMobSettings(source), 2)
    return
  }
  const form = new ActionFormData()
    .title("Remove Mob Type")
    .body("Select a mob type to remove from the clear list.")
  for (const typeId of config.mobTypes) form.button(`${formatIdentifier(typeId)}\n§7${typeId}`, "textures/ui/trash")
  form.button("Back", "textures/ui/arrow_left")
  const res = await form.show(source)
  if (res.canceled) return
  const typeId = config.mobTypes[res.selection]
  if (typeId) {
    if (saveConfig({ ...config, mobTypes: config.mobTypes.filter(entry => entry !== typeId) })) {
      source.sendMessage(`Removed ${formatIdentifier(typeId)} from the clear list`)
    } else {
      source.sendMessage("Failed to save mob list")
    }
  }
  system.runTimeout(() => showMobSettings(source), 2)
}

async function showMsgSettings(source) {
  try {
    const config = getConfig()
    const form = new ModalFormData()
      .title("Message Settings")
      .textField("Prefix", "[Clear Lag]", { defaultValue: config.prefix })
      .textField("Start message ({time})", DEFAULT_MESSAGES.start, { defaultValue: config.messages.start })
      .textField("Countdown message ({time})", DEFAULT_MESSAGES.countdown, { defaultValue: config.messages.countdown })
      .textField("Item success ({count}, {amount})", DEFAULT_MESSAGES.success, { defaultValue: config.messages.success })
      .textField("No items message", DEFAULT_MESSAGES.noEntities, { defaultValue: config.messages.noEntities })
      .textField("Mob success ({count}, {amount})", DEFAULT_MESSAGES.mobSuccess, { defaultValue: config.messages.mobSuccess })
      .textField("No mobs message", DEFAULT_MESSAGES.noMobs, { defaultValue: config.messages.noMobs })
    const res = await form.show(source)
    if (res.canceled) return
    const [prefix, start, countdown, success, noEntities, mobSuccess, noMobs] = res.formValues
    const newConfig = {
      ...config,
      prefix: prefix || DEFAULT_CONFIG.prefix,
      messages: {
        start: start || DEFAULT_MESSAGES.start,
        countdown: countdown || DEFAULT_MESSAGES.countdown,
        success: success || DEFAULT_MESSAGES.success,
        noEntities: noEntities || DEFAULT_MESSAGES.noEntities,
        mobSuccess: mobSuccess || DEFAULT_MESSAGES.mobSuccess,
        noMobs: noMobs || DEFAULT_MESSAGES.noMobs,
      },
    }
    if (saveConfig(newConfig)) {
      source.sendMessage("Messages saved")
      if (currentConfig.enabled) startAutoClearSystem()
    }
  } catch {
    source.sendMessage("Error saving messages")
  }
}

let autoClearTask = null
let clearlagTimeRemaining = -1

export function getClearlagTimeRemaining() {
  if (!getConfig().enabled) return -1
  return clearlagTimeRemaining
}

function startAutoClearSystem() {
  stopAutoClearSystem()
  clearlagTimeRemaining = getConfig().interval
  resumeAutoClearSystem()
}

function pauseAutoClearSystem() {
  if (autoClearTask !== null) {
    system.clearRun(autoClearTask)
    autoClearTask = null
  }
}

function resumeAutoClearSystem() {
  const config = getConfig()
  if (!config.enabled || autoClearTask !== null) return
  if (clearlagTimeRemaining <= 0) clearlagTimeRemaining = config.interval

  autoClearTask = system.runInterval(() => {
    try {
      if (!world.getPlayers().length) {
        pauseAutoClearSystem()
        return
      }

      const activeConfig = getConfig()
      if (!activeConfig.enabled) {
        clearlagTimeRemaining = -1
        stopAutoClearSystem()
        return
      }

      clearlagTimeRemaining--

      if (activeConfig.warningTimes.includes(clearlagTimeRemaining)) {
        const msg = clearlagTimeRemaining >= 30
          ? activeConfig.messages.start
          : activeConfig.messages.countdown
        world.sendMessage(`${activeConfig.prefix} ${msg.replace("{time}", clearlagTimeRemaining)}`)
        if (clearlagTimeRemaining <= 10) {
          world.getDimension("overworld").runCommand("playsound note.pling @a ~~~ 1 0.5")
        }
      }

      if (clearlagTimeRemaining <= 0) {
        clearlagTimeRemaining = activeConfig.interval
        world.getDimension("overworld").runCommand("playsound random.levelup @a ~~~ 1 1")
        runClear({ items: true, mobs: true }, (result, scope) => {
          if (!scope.items && !scope.mobs) return
          broadcastResult(activeConfig, result, scope)
        })
      }
    } catch {}
  }, 20)
}

function stopAutoClearSystem() {
  pauseAutoClearSystem()
  clearlagTimeRemaining = -1
}

function initializeClearLag() {
  const config = getConfig()
  if (config.enabled) {
    startAutoClearSystem()

  } else {

  }
}

world.afterEvents.entitySpawn?.subscribe?.(({ entity }) => {
  if (entity?.typeId === "minecraft:item") trackItemEntity(entity)
})
world.afterEvents.entityLoad?.subscribe?.(({ entity }) => {
  if (entity?.typeId === "minecraft:item") trackItemEntity(entity)
})
world.afterEvents.entityRemove?.subscribe?.(({ removedEntityId, typeId }) => {
  if (typeId === "minecraft:item") untrackItemEntity(removedEntityId)
})
system.runTimeout(() => {
  try {
    system.runJob(seedTrackedItems())
  } catch {
    trackedItemsReady = true
  }
}, 1)

system.runTimeout(initializeClearLag, 60)
world.afterEvents.playerSpawn.subscribe(() => {
  resumeAutoClearSystem()
})
world.afterEvents.playerLeave.subscribe(() => {
  system.run(() => {
    if (!world.getPlayers().length) pauseAutoClearSystem()
  })
})
