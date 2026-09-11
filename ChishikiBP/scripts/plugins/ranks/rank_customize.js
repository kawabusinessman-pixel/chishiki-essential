import { world } from "../../core.js"
import { ActionFormData, ModalFormData } from "../../core.js"
import { rankDefault } from "./rank_default.js"
import { uuidRanks, openAdminPanel, deleteRankByName, reloadRanksFromStorage } from "./rank.js"
import { RankDatabase } from "./rank_database.js"
import { RANK_SKILL_PRESETS, normalizeSkillKey } from "./rank_skill_presets.js"

function cloneCommands(commands) {
  const out = {}
  for (const [key, value] of Object.entries(commands || {})) {
    out[key] = { ...(value || {}) }
  }
  return out
}

function cloneRankDef(def) {
  if (!def || typeof def !== "object") return def
  return {
    name: def.name,
    color: def.color,
    prefix: def.prefix,
    commands: cloneCommands(def.commands),
  }
}

function extractCustomRanks(mergedRanks) {
  const custom = {}
  for (const [id, def] of Object.entries(mergedRanks || {})) {
    if (!def || typeof def !== "object") continue
    const base = rankDefault.ranks[id]
    const cloned = cloneRankDef(def)
    if (!base) {
      custom[id] = cloned
      continue
    }
    const commandsChanged = JSON.stringify(cloned.commands || {}) !== JSON.stringify(base.commands || {})
    const metaChanged = cloned.name !== base.name || cloned.color !== base.color || cloned.prefix !== base.prefix
    if (commandsChanged || metaChanged) {
      custom[id] = cloned
    }
  }
  return custom
}

function saveRanks(mergedRanks) {
  try {
    return RankDatabase.saveCustomRanks(extractCustomRanks(mergedRanks)) === true
  } catch (error) {
    console.warn("Error saving ranks:", error)
    return false
  }
}

function getRanks() {
  try {
    const customRanks = RankDatabase.getCustomRanks()
    const merged = {}
    for (const [key, val] of Object.entries(rankDefault.ranks)) {
      merged[key] = cloneRankDef(val)
    }
    for (const [key, val] of Object.entries(customRanks)) {
      if (val && typeof val === "object" && val.name) merged[key] = cloneRankDef(val)
    }
    return merged
  } catch (error) {
    console.warn("Error loading ranks:", error)
    const fallback = {}
    for (const [key, val] of Object.entries(rankDefault.ranks)) {
      fallback[key] = cloneRankDef(val)
    }
    return fallback
  }
}

function getSimpleRanks() {
  try {
    return RankDatabase.getCustomRankList()
  } catch (error) {
    return []
  }
}

function getRankButtonDisplay(rank, rankId) {
  const name = rank?.name || rankId.replace("rank:", "")
  const color = rank?.color || "§f"
  const prefix = rank?.prefix || ""
  if (prefix.startsWith("textures/")) {
    return { label: `${color}${name}`, icon: prefix }
  }
  const uuidIcon = uuidRanks.find((icon) => icon && prefix.includes(icon))
  if (uuidIcon) {
    const iconPart = prefix.includes("§") ? prefix : `${color}${uuidIcon}`
    return { label: `${iconPart}\n${color}${name}` }
  }
  if (prefix) {
    return { label: prefix.includes("§") ? prefix : `${color}${prefix}` }
  }
  return { label: `${color}${name}` }
}

export function showRankCustomizeMenu(player) {
  reloadRanksFromStorage()
  const form = new ActionFormData().title("§6Rank Customization").body("§7Select a rank to customize")
  const ranks = getRanks()
  const customRanks = Object.keys(ranks).filter(id => !rankDefault.ranks[id])
  const defaultRanks = Object.keys(rankDefault.ranks)
  const rankIds = customRanks.concat(defaultRanks)
  form.button("§aAdd New Rank", "textures/ui/plus")
  for (const rankId of rankIds) {
    const rank = ranks[rankId] || rankDefault.ranks[rankId]
    if (rank) {
      const { label, icon } = getRankButtonDisplay(rank, rankId)
      if (icon) form.button(label, icon)
      else form.button(label)
    } else {
      const name = rankId.replace("rank:", "")
      form.button(name)
    }
  }
  form.show(player).then(response => {
    if (response.canceled) {
      openAdminPanel(player)
      return
    }
    if (response.selection === 0) {
      showAddRankMenu(player)
    } else {
      const rankId = rankIds[response.selection - 1]
      showRankEditMenu(player, rankId)
    }
  })
}

function showAddRankMenu(player) {
  const ranks = getRanks()
  const textRanks = Object.keys(ranks)
    .filter(id => id.startsWith("rank:") && !uuidRanks.includes(ranks[id].prefix))
    .map(id => ranks[id].name)
    .concat(getSimpleRanks())
  const availableTextRanks = [...new Set(textRanks)].filter(r => r)
  const form = new ModalFormData()
    .title("§6Add New Rank")
    .textField("§eRank Name\n§8Enter rank name here (e.g. KiworaID)", "Enter rank name...", { defaultValue: "", placeholder: "Enter rank name" })
    .dropdown(
      "§eSelect Icon\n§8Select icon/prefix display",
      uuidRanks.filter(r => r).concat(availableTextRanks),
      { defaultValue: 0 }
    )
    .dropdown("§eSelect Color\n§8Choose color for the rank", ["§4Dark Red", "§cRed", "§6Gold", "§eYellow", "§2Dark Green", "§aGreen", "§bAqua", "§3Dark Aqua", "§1Dark Blue", "§9Blue", "§dLight Purple", "§5Dark Purple", "§fWhite", "§7Gray", "§8Dark Gray", "§0Black"], { defaultValue: 0 })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankCustomizeMenu(player)
      return
    }
    const [name, iconIndex, colorIndex] = response.formValues
    if (!name) {
      player.sendMessage("§cRank name cannot be empty")
      return showAddRankMenu(player)
    }
    const colors = ["§4", "§c", "§6", "§e", "§2", "§a", "§b", "§3", "§1", "§9", "§d", "§5", "§f", "§7", "§8", "§0"]
    const icons = uuidRanks.filter(r => r).concat(availableTextRanks)
    let selectedIcon = icons[iconIndex]
    if (availableTextRanks.includes(selectedIcon)) {
      selectedIcon = `[${selectedIcon}]`
    } else if (!selectedIcon) {
      selectedIcon = "textures/ui/accessibility_glyph_color"
    }
    const selectedColor = colors[colorIndex]
    const newRankId = `rank:${name.toLowerCase()}`
    ranks[newRankId] = {
      name: name,
      color: selectedColor,
      prefix: `${selectedColor}${selectedIcon}`,
      commands: {},
    }
    const simpleList = getSimpleRanks()
    if (!simpleList.includes(name) && !RankDatabase.saveCustomRankList([...simpleList, name])) {
      player.sendMessage("§cFailed to save rank list — try again")
      return showAddRankMenu(player)
    }
    if (!saveRanks(ranks)) {
      if (!simpleList.includes(name)) {
        RankDatabase.saveCustomRankList(simpleList)
      }
      player.sendMessage("§cFailed to save rank definition — try again")
      return showAddRankMenu(player)
    }
    reloadRanksFromStorage()
    player.sendMessage(`§aNew rank created: ${selectedColor}${selectedIcon} ${name}`)
    showRankCustomizeMenu(player)
  })
}

function showRankEditMenu(player, rankId) {
  const ranks = getRanks()
  let rank = ranks[rankId]
  if (!rank) {
    const name = rankId.replace("rank:", "")
    rank = {
      name: name,
      color: "§f",
      prefix: `§7[${name}§7]`,
      commands: {}
    }
    ranks[rankId] = rank
    saveRanks(ranks)
  }
  const form = new ActionFormData().title(`§6Edit ${rank.name}`).body("§7Select what to edit").button("§eEdit Name").button("§eEdit Color").button("§eEdit Prefix").button("§eEdit Skills")
  if (!rankDefault.ranks[rankId]) {
    form.button("§cDelete Rank")
  }
  form.show(player).then(response => {
    if (response.canceled) {
      showRankCustomizeMenu(player)
      return
    }
    switch (response.selection) {
      case 0:
        showNameEditMenu(player, rankId)
        break
      case 1:
        showColorEditMenu(player, rankId)
        break
      case 2:
        showPrefixEditMenu(player, rankId)
        break
      case 3:
        showSkillsEditMenu(player, rankId)
        break
      case 4:
        showDeleteConfirmMenu(player, rankId)
        break
    }
  })
}

function showDeleteConfirmMenu(player, rankId) {
  const rankName = rankId.replace("rank:", "")
  new ActionFormData()
    .title(`§cDelete ${rankName}?`)
    .body("§cAre you sure you want to delete this rank?\n§7This action cannot be undone.")
    .button("§cYes, Delete", "textures/ui/check")
    .button("§7Cancel", "textures/ui/cancel")
    .show(player)
    .then(response => {
      if (response.canceled || response.selection === 1) {
        showRankEditMenu(player, rankId)
        return
      }
      const simpleRanks = getSimpleRanks()
      let realName = simpleRanks.find(n => `rank:${n.toLowerCase()}` === rankId)
      if (!realName) {
        realName = rankId.replace("rank:", "")
      }
      if (realName) {
        deleteRankByName(player, realName)
        showRankCustomizeMenu(player)
      } else {
        player.sendMessage("§cError: Rank not found in list.")
        showRankCustomizeMenu(player)
      }
    })
}

function showNameEditMenu(player, rankId) {
  const ranks = getRanks()
  const rank = ranks[rankId]
  const form = new ModalFormData().title(`§6Edit ${rank.name} Name`).textField("§eNew Name\n§8Enter new name for the rank", "Enter name...", { defaultValue: rank.name, placeholder: "Enter new name" })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankEditMenu(player, rankId)
      return
    }
    ranks[rankId].name = response.formValues[0]
    if (!saveRanks(ranks)) {
      player.sendMessage("§cFailed to save rank name")
      return showNameEditMenu(player, rankId)
    }
    reloadRanksFromStorage()
    player.sendMessage(`§aName updated to: ${response.formValues[0]}`)
    showRankEditMenu(player, rankId)
  })
}

function showColorEditMenu(player, rankId) {
  const ranks = getRanks()
  const rank = ranks[rankId]
  const colors = {
    "§4": "Dark Red",
    "§c": "Red",
    "§6": "Gold",
    "§e": "Yellow",
    "§2": "Dark Green",
    "§a": "Green",
    "§b": "Aqua",
    "§3": "Dark Aqua",
    "§1": "Dark Blue",
    "§9": "Blue",
    "§d": "Light Purple",
    "§5": "Dark Purple",
    "§f": "White",
    "§7": "Gray",
    "§8": "Dark Gray",
    "§0": "Black",
  }
  const form = new ActionFormData().title(`§6Edit ${rank.name} Color`).body("§7Select a color")
  for (const [code, name] of Object.entries(colors)) {
    form.button(`${code}${name}`)
  }
  form.show(player).then(response => {
    if (response.canceled) {
      showRankEditMenu(player, rankId)
      return
    }
    const [code, name] = Object.entries(colors)[response.selection]
    ranks[rankId].color = code
    ranks[rankId].prefix = `§8[${code}${rank.name}§8]`
    if (!saveRanks(ranks)) {
      player.sendMessage("§cFailed to save rank color")
      return showColorEditMenu(player, rankId)
    }
    reloadRanksFromStorage()
    player.sendMessage(`§aColor updated to: ${name}`)
    showRankEditMenu(player, rankId)
  })
}

function showPrefixEditMenu(player, rankId) {
  const allRanks = getRanks()
  const currentRank = allRanks[rankId]
  const rankColor = currentRank.color || "§f"
  const textRanks = Object.keys(allRanks)
    .filter(id => id.startsWith("rank:") && !uuidRanks.includes(allRanks[id].prefix))
    .map(id => allRanks[id].name)
    .concat(getSimpleRanks())
  const availableTextRanks = [...new Set(textRanks)].filter(r => r)
  const validIcons = uuidRanks.filter(icon => icon).concat(availableTextRanks)
  const form = new ModalFormData().title(`§6Edit ${currentRank.name} Prefix`).dropdown("§eSelect Icon\n§8Choose new icon for the rank", validIcons, { defaultValue: 0 })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankEditMenu(player, rankId)
      return
    }
    let selectedIcon = validIcons[response.formValues[0]]
    if (availableTextRanks.includes(selectedIcon)) {
      selectedIcon = `[${selectedIcon}]`
    }
    const newPrefix = `${rankColor}${selectedIcon}`
    allRanks[rankId].prefix = newPrefix
    if (!saveRanks(allRanks)) {
      player.sendMessage("§cFailed to save rank prefix")
      return showPrefixEditMenu(player, rankId)
    }
    reloadRanksFromStorage()
    player.sendMessage(`§aPrefix updated to: ${newPrefix}`)
    showRankEditMenu(player, rankId)
  })
}

function upsertRankSkill(player, rankId, key, cmd, msg, oldKey = "") {
  const skillKey = normalizeSkillKey(key)
  if (!skillKey) {
    player.sendMessage("§cChat command must start with +")
    return false
  }
  const execCmd = String(cmd || "").trim()
  if (!execCmd) {
    player.sendMessage("§cRun command cannot be empty")
    return false
  }
  const ranks = getRanks()
  if (!ranks[rankId]) {
    player.sendMessage("§cRank not found")
    return false
  }
  if (!ranks[rankId].commands) ranks[rankId].commands = {}
  const prevKey = normalizeSkillKey(oldKey)
  if (prevKey && prevKey !== skillKey) delete ranks[rankId].commands[prevKey]
  ranks[rankId].commands[skillKey] = {
    cmd: execCmd,
    msg: String(msg || `§aSkill ${skillKey} used§f`).trim(),
  }
  if (!saveRanks(ranks)) {
    player.sendMessage("§cFailed to save skill")
    return false
  }
  reloadRanksFromStorage()
  player.sendMessage(`§aSkill saved: ${skillKey}`)
  return true
}

function showSkillForm(player, rankId, defaults, title, onCancel) {
  const form = new ModalFormData()
    .title(title)
    .textField("§eChat Command\n§8Player types this in chat", "+fly", {
      defaultValue: defaults.key || "+skill",
      placeholder: "+fly",
    })
    .textField("§eRun Command\n§8Use @s for the player", "ability @s mayfly true", {
      defaultValue: defaults.cmd || "",
      placeholder: "effect @s speed 600 1 true",
    })
    .textField("§eSuccess Message", "§aDone!", {
      defaultValue: defaults.msg || "§aSkill used§f",
      placeholder: "§aFlight enabled",
    })
  if (defaults.allowDelete) {
    form.toggle("§cDelete Skill", { defaultValue: false })
  }
  form.show(player).then((response) => {
    if (response.canceled) {
      onCancel(player, rankId)
      return
    }
    const values = response.formValues
    const skillKey = values[0]
    const execCmd = values[1]
    const successMsg = values[2]
    const shouldDelete = defaults.allowDelete ? values[3] : false
    if (shouldDelete && defaults.oldKey) {
      const ranks = getRanks()
      if (ranks[rankId]?.commands) {
        delete ranks[rankId].commands[defaults.oldKey]
      }
      if (!saveRanks(ranks)) {
        player.sendMessage("§cFailed to delete skill")
        return
      }
      reloadRanksFromStorage()
      player.sendMessage(`§aDeleted skill: ${defaults.oldKey}`)
      showSkillsEditMenu(player, rankId)
      return
    }
    if (!upsertRankSkill(player, rankId, skillKey, execCmd, successMsg, defaults.oldKey || "")) {
      showSkillForm(player, rankId, { ...defaults, key: skillKey, cmd: execCmd, msg: successMsg }, title, onCancel)
      return
    }
    showSkillsEditMenu(player, rankId)
  })
}

function showSkillsEditMenu(player, rankId) {
  const ranks = getRanks()
  const rank = ranks[rankId]
  const form = new ActionFormData()
    .title(`§6Edit ${rank.name} Skills`)
    .body("§7Tap skill to edit · Quick preset or manual command")
  const cmds = Object.keys(rank.commands || {})
  for (const cmd of cmds) {
    const skill = rank.commands[cmd]
    const preview = String(skill?.cmd || "").slice(0, 36)
    form.button(`§e${cmd}\n§8${preview}`)
  }
  form.button("§aQuick Add (Fly, Heal, ...)", "textures/ui/health_boost_effect")
  form.button("§bManual Command Input", "textures/ui/icon_book_writable")
  form.button("§cBack")
  form.show(player).then((response) => {
    if (response.canceled) {
      showRankEditMenu(player, rankId)
      return
    }
    if (response.selection < cmds.length) {
      showEditSkillMenu(player, rankId, cmds[response.selection])
      return
    }
    if (response.selection === cmds.length) {
      showQuickAddSkillMenu(player, rankId)
      return
    }
    if (response.selection === cmds.length + 1) {
      showAddSkillMenu(player, rankId)
      return
    }
    showRankEditMenu(player, rankId)
  })
}

function showQuickAddSkillMenu(player, rankId) {
  const ranks = getRanks()
  const rank = ranks[rankId]
  const form = new ActionFormData()
    .title(`§6Quick Add · ${rank.name}`)
    .body("§7Pick a preset — you can still edit command before save")
  for (const preset of RANK_SKILL_PRESETS) {
    const taken = rank.commands?.[preset.key] ? "§8(already added)" : ""
    form.button(`§e${preset.label}\n§7${preset.key} ${taken}`)
  }
  form.button("§bManual Command Input", "textures/ui/icon_book_writable")
  form.button("§cBack")
  form.show(player).then((response) => {
    if (response.canceled || response.selection === RANK_SKILL_PRESETS.length + 1) {
      showSkillsEditMenu(player, rankId)
      return
    }
    if (response.selection === RANK_SKILL_PRESETS.length) {
      showAddSkillMenu(player, rankId)
      return
    }
    const preset = RANK_SKILL_PRESETS[response.selection]
    showSkillForm(
      player,
      rankId,
      { key: preset.key, cmd: preset.cmd, msg: preset.msg },
      `§6Add: ${preset.label}`,
      () => showQuickAddSkillMenu(player, rankId),
    )
  })
}

function showEditSkillMenu(player, rankId, cmd) {
  const ranks = getRanks()
  const skill = ranks[rankId]?.commands?.[cmd] || { cmd: "", msg: "" }
  showSkillForm(
    player,
    rankId,
    { key: cmd, cmd: skill.cmd, msg: skill.msg, allowDelete: true, oldKey: cmd },
    `§6Edit Skill: ${cmd}`,
    () => showSkillsEditMenu(player, rankId),
  )
}

function showAddSkillMenu(player, rankId) {
  showSkillForm(
    player,
    rankId,
    { key: "+skill", cmd: "", msg: "§aSkill used§f" },
    "§6Manual Skill Command",
    () => showSkillsEditMenu(player, rankId),
  )
}
