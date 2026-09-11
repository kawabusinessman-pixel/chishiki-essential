import { world, system } from "../../core.js"
import { createLeaderboardRenderContext, renderLeaderboardRecord } from "./leaderboard.js"
import { floatingTextMenu } from "./forms/floatingTextMenus.js"
import { setupPlayerBreakBlockEvent } from "./events/playerBreakBlock.js"
import {
  getRecords,
  saveRecords,
  setTextOnly,
  isRecordDirty,
  restoreRecords,
  clearRegistryCache,
  migrateLegacyEntities,
  subscribeRecordChanges,
  syncPrimitiveVisibility,
} from "./registry.js"

function safeSave() {
  try {
    saveRecords()
  } catch (e) {
    console.warn("[FloatingText] failed to persist records:", e)
  }
}

function updateLeaderboards() {
  if (!world.getAllPlayers().length) return
  const context = createLeaderboardRenderContext()
  let dirty = false
  for (const record of getRecords()) {
    if (record.type !== "leaderboard") continue
    const result = renderLeaderboardRecord(record, context)
    if (!result) continue
    if (isRecordDirty(record.id, result.text)) {
      setTextOnly(record.id, result.text)
      dirty = true
    }
    if (result.cacheChanged) dirty = true
  }
  if (dirty) safeSave()
}

function renderCountdown(record) {
  const cd = record.data
  if (!cd) return
  const tz = parseInt((world.getDynamicProperty("time:timezone") || "UTC+7").replace("UTC", "")) || 7
  if (cd.timezone !== tz) {
    cd.targetTime -= (tz - cd.timezone) * 36e5
    cd.timezone = tz
    safeSave()
  }
  const left = cd.targetTime - Date.now()
  let nextText
  if (left <= 0) {
    nextText = `${cd.titleColor}${cd.title}\n§r${cd.timeColor}Time's up!`
  } else {
    const s = Math.floor(left / 1e3) % 60
    const m = Math.floor(left / 6e4) % 60
    const h = Math.floor(left / 36e5) % 24
    const dy = Math.floor(left / 864e5)
    const ts = cd.formatIndex === 1 ? `${dy}d ${h}h ${m}m` : cd.formatIndex === 2 ? `${h + dy * 24}h ${m}m ${s}s` : cd.formatIndex === 3 ? `${h + dy * 24}h ${m}m` : `${dy}d ${h}h ${m}m ${s}s`
    nextText = `${cd.titleColor}${cd.title}\n§r${cd.timeColor}${ts}`
  }
  if (isRecordDirty(record.id, nextText)) setTextOnly(record.id, nextText)
}

function updateCountdowns() {
  if (!world.getAllPlayers().length) return
  for (const record of getRecords()) {
    if (record.type === "countdown") renderCountdown(record)
  }
}
// ponytail: countdown text sengaja TIDAK di-persist (derivable dari record.data.targetTime),
// jadi setTextOnly tanpa saveRecords = nol DP write per tick. Upgrade path kalau mau persist:
// tambah dirty flag di updateCountdowns + saveRecords sekali per interval.

let countdownRunId = null
let leaderboardRunId = null
let schedulerReady = false

function refreshFloatingTextSchedulers() {
  if (!schedulerReady) return
  let hasCountdown = false
  let hasLeaderboard = false
  for (const record of getRecords()) {
    if (record.type === "countdown") hasCountdown = true
    else if (record.type === "leaderboard") hasLeaderboard = true
    if (hasCountdown && hasLeaderboard) break
  }

  if (hasCountdown) {
    if (countdownRunId === null) countdownRunId = system.runInterval(updateCountdowns, 40)
  } else if (countdownRunId !== null) {
    system.clearRun(countdownRunId)
    countdownRunId = null
  }

  if (hasLeaderboard) {
    if (leaderboardRunId === null) leaderboardRunId = system.runInterval(updateLeaderboards, 200)
  } else if (leaderboardRunId !== null) {
    system.clearRun(leaderboardRunId)
    leaderboardRunId = null
  }
}

function stopFloatingTextSchedulers() {
  if (countdownRunId !== null) {
    system.clearRun(countdownRunId)
    countdownRunId = null
  }
  if (leaderboardRunId !== null) {
    system.clearRun(leaderboardRunId)
    leaderboardRunId = null
  }
}

export function initFloatingText() {
  setupPlayerBreakBlockEvent()
  subscribeRecordChanges(refreshFloatingTextSchedulers)
  world.afterEvents.playerDimensionChange?.subscribe?.(() => syncPrimitiveVisibility())
  world.afterEvents.playerSpawn?.subscribe(() => syncPrimitiveVisibility())
  world.afterEvents.playerLeave?.subscribe(() => system.run(syncPrimitiveVisibility))
  world.afterEvents.worldLoad.subscribe(() => {
    schedulerReady = false
    stopFloatingTextSchedulers()
    clearRegistryCache()
    system.run(() => {
      try {
        migrateLegacyEntities()
      } catch (e) {
        console.warn("[FloatingText] legacy migration failed:", e)
      }
      restoreRecords()
      syncPrimitiveVisibility()
      schedulerReady = true
      refreshFloatingTextSchedulers()
    })
  })
}

export { floatingTextMenu }

initFloatingText()
