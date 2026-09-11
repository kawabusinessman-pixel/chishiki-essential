import { system, world } from "../../core.js"
import { ActionFormData, ModalFormData } from "../../core.js"
import { addMoney, formatMoneyValue } from "../../function/moneySystem.js"
import { getScoreboardDate } from "../../function/timeSystem.js"
import { GlobalConfig } from "../../function/GlobalConfig.js"
import { getAllRanks, getPlayerRank, isPlayerValid, openAdminPanel, reloadRanksFromStorage } from "./rank.js"
import { rankDefault } from "./rank_default.js"

const BENEFITS_KEY = "rank_benefits"
const RANK_DAILY_BONUS_KEY = "kiw:rank_daily_bonus"

function saveRankBenefits(benefits) {
  try {
    if (!GlobalConfig.set(BENEFITS_KEY, benefits)) {
      console.warn("Error saving rank benefits: GlobalConfig.set failed")
      return false
    }
    try { world.setDynamicProperty(BENEFITS_KEY, undefined) } catch { }
    return true
  } catch (error) {
    console.warn("Error saving rank benefits:", error)
    return false
  }
}

function getRankBenefits() {
  try {
    const fromConfig = GlobalConfig.get(BENEFITS_KEY)
    if (fromConfig && typeof fromConfig === "object" && !Array.isArray(fromConfig)) {
      return fromConfig
    }
    const savedBenefits = world.getDynamicProperty(BENEFITS_KEY)
    if (!savedBenefits) return {}
    const parsed = typeof savedBenefits === "string" ? JSON.parse(savedBenefits) : savedBenefits
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      GlobalConfig.set(BENEFITS_KEY, parsed)
      try { world.setDynamicProperty(BENEFITS_KEY, undefined) } catch { }
      return parsed
    }
    return {}
  } catch (error) {
    console.warn("Error loading rank benefits:", error)
    return {}
  }
}

function getRankDisplayLabel(rank) {
  const id = String(rank || "").startsWith("rank:") ? String(rank) : `rank:${rank}`
  const def = rankDefault.ranks[id]
  if (def?.name) return `${def.prefix || rank} §f${def.name}`
  return String(rank)
}

function resolveBenefitsEntry(benefits, rank) {
  if (!benefits || typeof benefits !== "object") return {}
  const raw = String(rank || "")
  const candidates = [
    raw,
    raw.startsWith("rank:") ? raw.slice(5) : `rank:${raw}`,
  ]
  const def = rankDefault.ranks[raw.startsWith("rank:") ? raw : `rank:${raw}`]
  if (def?.name) candidates.push(def.name)
  for (const key of candidates) {
    if (key && benefits[key] && typeof benefits[key] === "object") return benefits[key]
  }
  for (const [id, info] of Object.entries(rankDefault.ranks)) {
    const icon = id.slice(5)
    if (icon === raw || info.name === raw || id === raw) {
      if (benefits[icon]) return benefits[icon]
      if (benefits[id]) return benefits[id]
      if (benefits[info.name]) return benefits[info.name]
    }
  }
  return {}
}

function ensureBenefitsBucket(benefits, rank) {
  if (!benefits[rank] || typeof benefits[rank] !== "object") {
    const existing = resolveBenefitsEntry(benefits, rank)
    benefits[rank] = { ...existing }
  }
  return benefits[rank]
}
export function showRankBenefitsMenu(player) {
  reloadRanksFromStorage()
  const form = new ActionFormData()
    .title("§6Rank Benefits Manager")
    .body("§7Select a rank to configure benefits\n\nif the logo doesn't appear, please go to the set rank menu first")
  const ranks = getAllRanks()
  const benefits = getRankBenefits()
  for (const rank of ranks) {
    const rankBenefits = resolveBenefitsEntry(benefits, rank)
    const benefitCount = Object.keys(rankBenefits).length
    form.button(`${getRankDisplayLabel(rank)}\n§7${benefitCount} benefits configured`)
  }
  form.button("§aBack to Admin Panel", "textures/ui/arrow_left")
  form.show(player).then(response => {
    if (response.canceled) return
    if (response.selection === ranks.length) {
      openAdminPanel(player)
    } else {
      const selectedRank = ranks[response.selection]
      showRankBenefitDetails(player, selectedRank)
    }
  })
}
function showRankBenefitDetails(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = resolveBenefitsEntry(benefits, rank)
  const form = new ActionFormData()
    .title(`§6Benefits for ${getRankDisplayLabel(rank)}`)
    .body("§7Configure benefits for this rank")
  const landBenefits = rankBenefits.land || {}
  const maxClaims = landBenefits.maxClaims || "Default"
  const claimSize = landBenefits.maxClaimSize || "Default"
  form.button(`§aLand Benefits\n§7Max Claims: ${maxClaims} | Max Size: ${claimSize} `, "textures/ui/icon_best3")
  const economyBenefits = rankBenefits.economy || {}
  const dailyBonus = economyBenefits.dailyBonus || "None"
  const discount = economyBenefits.discount || "0%"
  form.button(`§6Economy Benefits\n§7Daily: ${dailyBonus} | Discount: ${discount} `, "textures/ui/free_download_symbol")
  const pwarpBenefits = rankBenefits.pwarps || {}
  const personalLimit = pwarpBenefits.personal_limit || "Default"
  const publicLimit = pwarpBenefits.public_limit || "Default"
  form.button(`§dPlayer Warps\n§7Personal: ${personalLimit} | Public: ${publicLimit} `, "textures/ui/icon_recipe_construction")
  const sethomeBenefits = rankBenefits.sethome || {}
  const maxHomes = sethomeBenefits.maxHomes || "Default"
  form.button(`§bSet Home Benefits\n§7Max Homes: ${maxHomes}`, "textures/ui/icon_recipe_item")
  const warpAccess = rankBenefits.warpAccess || {}
  const warpAccessText = warpAccess.allWarps ? "All Warps" : (warpAccess.allowedWarps?.length || 0) + " allowed"
  form.button(`§9Warp Access\n§7${warpAccessText}`, "textures/ui/icon_map")
  form.button("§cBack", "textures/ui/arrow_left")
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitsMenu(player)
      return
    }
    switch (response.selection) {
      case 0:
        showLandBenefits(player, rank)
        break
      case 1:
        showEconomyBenefits(player, rank)
        break
      case 2:
        showPwarpBenefits(player, rank)
        break
      case 3:
        showSethomeBenefits(player, rank)
        break
      case 4:
        showWarpAccessBenefits(player, rank)
        break
      case 5:
        showRankBenefitsMenu(player)
        break
    }
  })
}
function showLandBenefits(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = resolveBenefitsEntry(benefits, rank)
  const landBenefits = rankBenefits.land || {}
  const form = new ModalFormData()
    .title(`§6Land Benefits for ${getRankDisplayLabel(rank)}`)
    .textField("Max Claims\n§7Number of land claims allowed (0 = default)", "Enter number...", {
      defaultValue: String(landBenefits.maxClaims || "0")
    })
    .textField("Max Claim Size\n§7Maximum blocks per claim (0 = default)", "Enter number...", {
      defaultValue: String(landBenefits.maxClaimSize || "0")
    })
    .toggle("Free Claims\n§7Allow free land claims", {
      defaultValue: landBenefits.freeClaims || false
    })
    .toggle("Extended Protection\n§7Allow protection in The End", {
      defaultValue: landBenefits.endProtection || false
    })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitDetails(player, rank)
      return
    }
    const [maxClaims, maxClaimSize, freeClaims, endProtection] = response.formValues
    const next = getRankBenefits()
    const bucket = ensureBenefitsBucket(next, rank)
    bucket.land = {
      maxClaims: parseInt(maxClaims) || 0,
      maxClaimSize: parseInt(maxClaimSize) || 0,
      freeClaims: freeClaims,
      endProtection: endProtection
    }
    if (!saveRankBenefits(next)) {
      player.sendMessage("§cFailed to save land benefits!")
      return showLandBenefits(player, rank)
    }
    player.sendMessage("§aLand benefits updated!")
    showRankBenefitDetails(player, rank)
  })
}
function showEconomyBenefits(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = resolveBenefitsEntry(benefits, rank)
  const economyBenefits = rankBenefits.economy || {}
  const form = new ModalFormData()
    .title(`§6Economy Benefits for ${getRankDisplayLabel(rank)}`)
    .textField("Daily Bonus\n§7Money given daily (0 = none)", "Enter amount...", {
      defaultValue: String(economyBenefits.dailyBonus || "0")
    })
    .slider("Shop Discount\n§7Percentage discount in shops", 0, 100, {
      defaultValue: economyBenefits.discount || 0,
      valueStep: 5
    })
    .toggle("Reduced Teleport Cost\n§7Lower warp teleport costs", {
      defaultValue: economyBenefits.reducedTeleportCost || false
    })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitDetails(player, rank)
      return
    }
    const [dailyBonus, discount, reducedTeleportCost] = response.formValues
    const next = getRankBenefits()
    const bucket = ensureBenefitsBucket(next, rank)
    bucket.economy = {
      dailyBonus: parseInt(dailyBonus) || 0,
      discount: discount,
      reducedTeleportCost: reducedTeleportCost
    }
    if (!saveRankBenefits(next)) {
      player.sendMessage("§cFailed to save economy benefits!")
      return showEconomyBenefits(player, rank)
    }
    player.sendMessage("§aEconomy benefits updated!")
    showRankBenefitDetails(player, rank)
  })
}
function showSethomeBenefits(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = resolveBenefitsEntry(benefits, rank)
  const sethomeBenefits = rankBenefits.sethome || {}
  const form = new ModalFormData()
    .title(`§6Set Home Benefits for ${getRankDisplayLabel(rank)}`)
    .textField("Max Homes\n§7Maximum number of homes (0 = default)", "Enter number...", {
      defaultValue: String(sethomeBenefits.maxHomes || "0")
    })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitDetails(player, rank)
      return
    }
    const [maxHomes] = response.formValues
    const next = getRankBenefits()
    const bucket = ensureBenefitsBucket(next, rank)
    bucket.sethome = {
      maxHomes: parseInt(maxHomes) || 0
    }
    if (!saveRankBenefits(next)) {
      player.sendMessage("§cFailed to save set home benefits!")
      return showSethomeBenefits(player, rank)
    }
    player.sendMessage("§aSet Home benefits updated!")
    showRankBenefitDetails(player, rank)
  })
}
function showPwarpBenefits(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = resolveBenefitsEntry(benefits, rank)
  const pwarpBenefits = rankBenefits.pwarps || {}
  const form = new ModalFormData()
    .title(`§6PWarps for ${getRankDisplayLabel(rank)}`)
    .textField("Max Personal Warps\n§7(0 = default)", "Enter number...", {
      defaultValue: String(pwarpBenefits.personal_limit || "0")
    })
    .textField("Max Public Warps\n§7(0 = default)", "Enter number...", {
      defaultValue: String(pwarpBenefits.public_limit || "0")
    })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitDetails(player, rank)
      return
    }
    const [personalLimit, publicLimit] = response.formValues
    const next = getRankBenefits()
    const bucket = ensureBenefitsBucket(next, rank)
    bucket.pwarps = {
      personal_limit: parseInt(personalLimit) || 0,
      public_limit: parseInt(publicLimit) || 0
    }
    if (!saveRankBenefits(next)) {
      player.sendMessage("§cFailed to save pwarp benefits!")
      return showPwarpBenefits(player, rank)
    }
    player.sendMessage("§aPWarp benefits updated!")
    showRankBenefitDetails(player, rank)
  })
}
export function getRankBenefit(rank, benefitType) {
  const benefits = getRankBenefits()
  const rankBenefits = resolveBenefitsEntry(benefits, rank)
  return rankBenefits[benefitType]
}
export function hasWarpAccess(player, warpName) {
  const rank = getPlayerRank(player)
  const warpPermissions = getRankBenefit(rank, "warpAccess") || {}
  if (warpPermissions.allWarps) return true
  if (warpPermissions.deniedWarps && Array.isArray(warpPermissions.deniedWarps)) {
    if (warpPermissions.deniedWarps.includes(warpName)) return false
  }
  if (warpPermissions.allowedWarps && Array.isArray(warpPermissions.allowedWarps)) {
    return warpPermissions.allowedWarps.includes(warpName)
  }
  return true
}
export function getLandBenefits(player) {
  const rank = getPlayerRank(player)
  return getRankBenefit(rank, "land") || {}
}
export function getEconomyBenefits(player) {
  const rank = getPlayerRank(player)
  return getRankBenefit(rank, "economy") || {}
}
function getEconomyPwarpDiscount(economyBenefits) {
  const discount = Number(economyBenefits?.pwarpDiscount)
  if (Number.isFinite(discount)) return Math.min(100, Math.max(0, Math.floor(discount)))
  return economyBenefits?.reducedTeleportCost ? 50 : 0
}
export function getPwarpCostDiscount(player) {
  return getEconomyPwarpDiscount(getEconomyBenefits(player))
}
function getDailyDateKey() {
  const date = getScoreboardDate()
  return `${date.year}-${date.month}-${date.day}`
}
function getRankDailyClaimKey() {
  return getDailyDateKey()
}
export function getRankDailyBonus(player) {
  const economyBenefits = getEconomyBenefits(player)
  return Math.max(0, Number(economyBenefits.dailyBonus) || 0)
}
export function canClaimRankDailyBonus(player) {
  if (!isPlayerValid(player)) return false
  const dailyBonus = getRankDailyBonus(player)
  if (dailyBonus <= 0) return false
  return player.getDynamicProperty(RANK_DAILY_BONUS_KEY) !== getRankDailyClaimKey()
}
export function claimRankDailyBonus(player) {
  if (!isPlayerValid(player)) return { claimed: false, amount: 0, reason: "invalid" }
  const dailyBonus = getRankDailyBonus(player)
  if (dailyBonus <= 0) {
    return { claimed: false, amount: 0, reason: "none" }
  }
  const claimKey = getRankDailyClaimKey()
  if (player.getDynamicProperty(RANK_DAILY_BONUS_KEY) === claimKey) {
    return { claimed: false, amount: dailyBonus, reason: "claimed" }
  }
  if (!addMoney(player, dailyBonus)) {
    return { claimed: false, amount: dailyBonus, reason: "failed" }
  }
  player.setDynamicProperty(RANK_DAILY_BONUS_KEY, claimKey)
  return { claimed: true, amount: dailyBonus, reason: "ok" }
}
export function tryAutoClaimRankDailyBonus(player) {
  if (!isPlayerValid(player)) return { claimed: false, amount: 0, reason: "invalid" }
  const result = claimRankDailyBonus(player)
  if (result.claimed) {
    player.sendMessage(`§a+ $${formatMoneyValue(BigInt(result.amount))} §7Rank daily bonus`)
  }
  return result
}
export function getRankDailyBonusText(player) {
  const amount = getRankDailyBonus(player)
  if (amount <= 0) return ""
  const status = canClaimRankDailyBonus(player) ? "Ready" : "Claimed"
  return `Rank Bonus:\n- $${formatMoneyValue(BigInt(amount))} ${status}`
}
export function hasPermission(player, permission) {
  const rank = getPlayerRank(player)
  const permissions = getRankBenefit(rank, "permissions") || []
  return permissions.includes(permission)
}
export function getPwarpBenefits(player) {
  const rank = getPlayerRank(player)
  return getRankBenefit(rank, "pwarps") || {}
}
function showWarpAccessBenefits(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = resolveBenefitsEntry(benefits, rank)
  const warpAccess = rankBenefits.warpAccess || {}
  const form = new ModalFormData()
    .title(`§6Warp Access for ${getRankDisplayLabel(rank)}`)
    .toggle("Allow All Warps\n§7Access to all server warps", {
      defaultValue: warpAccess.allWarps || false
    })
    .textField("Allowed Warps (comma-separated)\n§7Specific warps this rank can access", "warp1, warp2, ...", {
      defaultValue: (warpAccess.allowedWarps || []).join(", ")
    })
    .textField("Denied Warps (comma-separated)\n§7Warps this rank cannot access", "warp1, warp2, ...", {
      defaultValue: (warpAccess.deniedWarps || []).join(", ")
    })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitDetails(player, rank)
      return
    }
    const [allWarps, allowedWarpsStr, deniedWarpsStr] = response.formValues
    const allowedWarps = allowedWarpsStr.split(",").map(s => s.trim()).filter(s => s)
    const deniedWarps = deniedWarpsStr.split(",").map(s => s.trim()).filter(s => s)
    const next = getRankBenefits()
    const bucket = ensureBenefitsBucket(next, rank)
    bucket.warpAccess = {
      allWarps: allWarps,
      allowedWarps: allowedWarps,
      deniedWarps: deniedWarps
    }
    if (!saveRankBenefits(next)) {
      player.sendMessage("§cFailed to save warp access benefits!")
      return showWarpAccessBenefits(player, rank)
    }
    player.sendMessage("§aWarp access benefits updated!")
    showRankBenefitDetails(player, rank)
  })
}

export function getSethomeBenefits(player) {
  const rank = getPlayerRank(player)
  return getRankBenefit(rank, "sethome") || {}
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return
  system.runTimeout(() => tryAutoClaimRankDailyBonus(player), 80)
})
