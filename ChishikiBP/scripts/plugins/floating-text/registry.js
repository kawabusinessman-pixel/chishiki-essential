import { system, world, TextPrimitive } from "../../core.js"

const RECORDS_KEY = "sft:ft_records"
const CHUNKS_KEY = "sft:ft_records_n"
const CHUNK_SIZE = 30000
const BACKUP_KEY = "sft:ft_migration_backup"
// chunk 0 stays on the legacy key so pre-chunking data loads as-is, no migration needed
const chunkKey = i => (i === 0 ? RECORDS_KEY : `${RECORDS_KEY}_${i}`)
const LEGACY_ENTITY = "add:floating_text"
const DIMS = ["overworld", "nether", "the_end"]
const getDim = n => world.getDimension(n)

let records = null
const prims = new Map()
const lastRendered = new Map()
const recordChangeListeners = new Set()

function notifyRecordChanges() {
  for (const listener of recordChangeListeners) {
    try {
      listener()
    } catch {}
  }
}

/**
 * Subscribes to record lifecycle changes that can alter dynamic update workers.
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeRecordChanges(listener) {
  if (typeof listener !== "function") return () => {}
  recordChangeListeners.add(listener)
  return () => recordChangeListeners.delete(listener)
}

function loadRecords() {
  if (records !== null) return records
  let parsed = []
  try {
    const count = world.getDynamicProperty(CHUNKS_KEY)
    let raw = ""
    if (typeof count === "number") {
      for (let i = 0; i < count; i++) raw += world.getDynamicProperty(chunkKey(i)) ?? ""
    } else {
      raw = world.getDynamicProperty(RECORDS_KEY) ?? "[]"
    }
    parsed = JSON.parse(raw || "[]")
  } catch {}
  records = Array.isArray(parsed) ? parsed : []
  return records
}

export function saveRecords() {
  // engine caps a single dynamic property at 32767 chars, so the blob is split across chunks
  const json = records.length ? JSON.stringify(records) : ""
  const chunkCount = Math.ceil(json.length / CHUNK_SIZE)
  const prevCount = world.getDynamicProperty(CHUNKS_KEY)
  const staleFrom = typeof prevCount === "number" ? prevCount : world.getDynamicProperty(RECORDS_KEY) !== undefined ? 1 : 0
  for (let i = 0; i < chunkCount; i++) world.setDynamicProperty(chunkKey(i), json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))
  for (let i = chunkCount; i < staleFrom; i++) world.setDynamicProperty(chunkKey(i), undefined)
  world.setDynamicProperty(CHUNKS_KEY, chunkCount ? chunkCount : undefined)
}

export function getRecords() {
  return loadRecords()
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

const normalizeDim = v => String(v ?? "").replace("minecraft:", "")

function applyVisibility(prim, dimId) {
  try {
    prim.visibleTo = world.getPlayers().filter(p => normalizeDim(p.dimension?.id) === normalizeDim(dimId))
  } catch (e) {}
}

function addPrim(record) {
  if (prims.has(record.id)) return prims.get(record.id)
  try {
    const dim = getDim(record.dim || "minecraft:overworld")
    const prim = new TextPrimitive(
      { dimension: dim, x: record.x, y: record.y, z: record.z },
      record.text ?? ""
    )
    world.primitiveShapesManager.addText(prim)
    applyVisibility(prim, record.dim || "minecraft:overworld")
    prims.set(record.id, prim)
    return prim
  } catch (e) {
    return null
  }
}

function removePrim(id) {
  const prim = prims.get(id)
  if (prim) {
    try {
      world.primitiveShapesManager.removeText(prim)
    } catch (e) {}
    prims.delete(id)
  }
  lastRendered.delete(id)
}

export function createRecord(partial) {
  const record = {
    id: makeId(),
    dim: "minecraft:overworld",
    x: 0,
    y: 0,
    z: 0,
    type: "text",
    text: "",
    npcId: null,
    parentId: null,
    data: null,
    ...partial,
  }
  loadRecords().push(record)
  addPrim(record)
  notifyRecordChanges()
  try {
    saveRecords()
  } catch (e) {
    world.sendMessage("§c[FloatingText] Text is shown but NOT saved, it will be gone after reload: " + e.message)
    throw e
  }
  return record
}

export function deleteRecord(id) {
  removePrim(id)
  const list = loadRecords()
  for (const orphan of list.filter(r => r.parentId === id)) removePrim(orphan.id)
  records = list.filter(r => r.id !== id && r.parentId !== id)
  saveRecords()
  notifyRecordChanges()
}

export function deleteAllRecords() {
  for (const prim of prims.values()) {
    try {
      world.primitiveShapesManager.removeText(prim)
    } catch (e) {}
  }
  prims.clear()
  lastRendered.clear()
  records = []
  saveRecords()
  notifyRecordChanges()
}

export function setRecordText(id, text) {
  const record = loadRecords().find(r => r.id === id)
  if (!record) return
  record.text = String(text ?? "")
  saveRecords()
  const prim = prims.get(id)
  if (prim) {
    try {
      prim.setText(record.text)
    } catch (e) {
      removePrim(id)
      addPrim(record)
    }
  } else {
    addPrim(record)
  }
  notifyRecordChanges()
}

export function setTextOnly(id, text) {
  const record = loadRecords().find(r => r.id === id)
  if (!record) return
  record.text = String(text ?? "")
  const prim = prims.get(id)
  if (prim) {
    try {
      prim.setText(record.text)
    } catch (e) {
      removePrim(id)
      addPrim(record)
    }
  } else {
    addPrim(record)
  }
}

export function moveRecord(id, dim, pos) {
  const record = loadRecords().find(r => r.id === id)
  if (!record) return
  record.dim = dim.id ?? dim
  record.x = pos.x
  record.y = pos.y
  record.z = pos.z
  saveRecords()
  removePrim(id)
  addPrim(record)
}

export function findNpcRecord(npcId) {
  return loadRecords().find(r => r.npcId === npcId) ?? null
}

export function createNPCText(dimension, position, text, npcId = null) {
  const existing = npcId ? findNpcRecord(npcId) : null
  if (existing) {
    setRecordText(existing.id, text)
    moveRecord(existing.id, dimension, position)
    return existing
  }
  return createRecord({
    dim: dimension.id,
    x: position.x,
    y: position.y,
    z: position.z,
    type: "npc",
    text,
    npcId,
  })
}

export function isRecordDirty(id, text) {
  if (lastRendered.get(id) === text) return false
  lastRendered.set(id, text)
  return true
}

export function restoreRecords() {
  loadRecords()
  for (const record of records) addPrim(record)
}

/**
 * Restricts every registered primitive to players currently in the record's dimension.
 * @returns {void}
 */
export function syncPrimitiveVisibility() {
  for (const record of getRecords()) {
    const prim = prims.get(record.id)
    if (prim) applyVisibility(prim, record.dim)
  }
}

export function clearRegistryCache() {
  records = null
  prims.clear()
  lastRendered.clear()
}

export function migrateLegacyEntities() {
  const parseLegacy = raw => {
    try { return JSON.parse(raw ?? "null") } catch { return null }
  }
  const found = []
  for (const dimId of DIMS) {
    try {
      const dim = getDim(dimId)
      const entities = dim.getEntities({ type: LEGACY_ENTITY })
      for (const e of entities) {
        if (e.hasTag("sft:item_name")) continue
        const data = { dim: dimId, location: e.location, nameTag: e.nameTag, tags: e.getTags(), entity: e }
        for (const key of ["sft:scoreboardData", "sft:countdownData", "sft:rootContent", "sft:childContent", "sft:fixedPosition"]) {
          const v = e.getDynamicProperty(key)
          if (v !== undefined) data[key] = v
        }
        found.push(data)
      }
    } catch (e) {}
  }
  if (found.length) {
    // backup is best-effort: an oversized payload must not abort the migration itself
    try {
      world.setDynamicProperty(BACKUP_KEY, JSON.stringify(found.map(({ entity, ...rest }) => rest)))
    } catch (e) {}
    const uidToRecord = new Map()
    for (const data of found) {
      const rootTag = (data.tags || []).find(t => t.startsWith("root:"))
      if (!rootTag) continue
      const record = createRecord({
        dim: "minecraft:" + data.dim,
        x: data.location.x,
        y: data.location.y,
        z: data.location.z,
        type: "root",
        text: data["sft:rootContent"] ?? data.nameTag ?? "",
      })
      uidToRecord.set(rootTag.replace("root:", ""), record.id)
    }
    for (const data of found) {
      const tags = data.tags || []
      const rootTag = tags.find(t => t.startsWith("root:"))
      if (rootTag) {
        try { data.entity.remove() } catch (e2) {}
        continue
      }
      const parentTag = tags.find(t => t.startsWith("parent:"))
      const npcId = tags.find(t => t.startsWith("text_id:"))?.replace("text_id:", "") ?? null
      let type = npcId || tags.includes("npc_text") ? "npc" : "text"
      let text = data.nameTag ?? ""
      let recordData = null
      if (tags.includes("sft:scoreboard")) {
        recordData = parseLegacy(data["sft:scoreboardData"])
        if (!Array.isArray(recordData)) continue
        type = "leaderboard"
      } else if (tags.includes("sft:countdown")) {
        recordData = parseLegacy(data["sft:countdownData"])
        if (!recordData || typeof recordData !== "object") continue
        type = "countdown"
      } else if (parentTag) {
        type = "child"
        text = data["sft:childContent"] ?? text
      }
      createRecord({
        dim: "minecraft:" + data.dim,
        x: data.location.x,
        y: data.location.y,
        z: data.location.z,
        type,
        text,
        data: recordData,
        npcId,
        parentId: parentTag ? (uidToRecord.get(parentTag.replace("parent:", "")) ?? null) : null,
      })
      try { data.entity.remove() } catch (e2) {}
    }
  }
}
