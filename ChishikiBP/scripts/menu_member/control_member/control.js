import { ModalFormData, ActionFormData, world, system } from '../../core.js';
import { featureStatus, setMemberFeatureEnabled } from "../../function/memberFeatureState.js"
import { invalidateHomeCache } from "../../plugins/sethome/Set Home.js"
import { metricNumbers } from "../../lib/game.js"
import { openBattlepassAdmin } from "../../admin_menu/battlepass_admin.js"
import { getAllButtons } from "../../admin_menu/custom_button/custom_database.js"
import { AdminLandConfig } from "../../plugins/land-system/index.js"
import { showBankAdminMenu } from "../../plugins/bank/bank_admin.js"
import { showClanAdminMenu } from "../../plugins/clan/admin.js"
import { ShowAdminPwarpSettings } from "../../admin_menu/pwarp_settings/index.js"
import { configureBackpackSystem } from "../../plugins/backpack/menu.js"
import { showShopConfigMenu } from "../../admin_menu/shopConfig.js"
import { showChestShopAdminMenu } from "../../plugins/chest-shop/index.js"
import { GlobalConfig } from "../../function/GlobalConfig.js"
import { Lang } from "../../lib/Lang.js"
const DEFAULT_RTP_CONFIG = {
 maxUses: 3,
 cooldownTime: 5 * 60,
 maxDistance: 2000,
 teleportDelay: 3,
 allowOverworld: true,
 allowNether: true,
 allowTheEnd: false
}
const rtpConfig = { ...DEFAULT_RTP_CONFIG }
const clanConfig = {
 minMembers: 2,
 inactivityDays: 30,
 maxInactivePlayers: 5,
 autoCleanupEnabled: false,
}
const homeConfig = {
 maxHomes: 5,
 minY: -64,
 teleportDelay: 3,
}
const transferConfig = {
 minTransfer: 1000,
 maxTransfer: 1000000,
 enabled: true,
}
export const pwarpConfig = {
 maxPlayerWarps: 5,
}
const buttonTextures = {
 teleport: "textures/ui/conduit_power_effect",
 randomTeleport: "textures/ui/broadcast_glyph_color",
 warp: "textures/ui/icon_recipe_construction",
 pwarp: "textures/ui/glyph_realms",
 setHome: "textures/ui/icon_bell",
 claimLand: "textures/ui/icon_map",
 transferMoney: "textures/ui/invite_base",
 bank: "textures/ui/icon_book_writable",
 clan: "textures/ui/button_custom/clan",
 shop: "textures/ui/button_custom/shop",
 playerShop: "textures/icon_custom/my_characters",
 reportPlayer: "textures/items/trial_key",
 barter: "textures/ui/icon_book_writable",
 backpack: "textures/items/bundle",
 battlepass: "textures/ui/icon_book_writable",
 emotes: "textures/emotes/dance/dance_1",
 job: "textures/items/diamond_pickaxe",

 language: "textures/ui/language_glyph",
}
const textureSettings = {
 useCustomPath: {},
}
const defaultIcons = {
 teleport: "textures/ui/conduit_power_effect",
 randomTeleport: "textures/ui/broadcast_glyph_color",
 warp: "textures/ui/icon_recipe_construction",
 pwarp: "textures/ui/glyph_realms",
 setHome: "textures/ui/icon_bell",
 claimLand: "textures/ui/icon_map",
 transferMoney: "textures/ui/invite_base",
 bank: "textures/ui/icon_book_writable",
 clan: "textures/ui/button_custom/clan",
 shop: "textures/ui/button_custom/shop",
 playerShop: "textures/icon_custom/my_characters",
 reportPlayer: "textures/items/trial_key",
 barter: "textures/ui/icon_book_writable",
 backpack: "textures/items/bundle",
 battlepass: "textures/ui/icon_book_writable",
 emotes: "textures/emotes/dance/dance_1",
 job: "textures/items/diamond_pickaxe",

 language: "textures/ui/language_glyph",
}
const iconSuggestions = ["textures/ui/icon_bell", "textures/ui/creative_icon", "textures/ui/csb_faq_fox", "textures/ui/fire_resistance_effect", "textures/ui/hanging_sign_bamboo", "textures/ui/icon_deals", "textures/ui/icon_balloon", "textures/ui/icon_recipe_nature", "textures/ui/icon_multiplayer", "textures/ui/icon_book_writable", "textures/ui/icon_recipe_item", "textures/ui/icon_recipe_construction", "textures/ui/icon_recipe_nature", "textures/ui/icon_recipe_equipment"]
const messages = {
 success: JSON.stringify({ rawtext: [{ text: "§a✔ Feature status updated successfully!" }] }),
 error: JSON.stringify({ rawtext: [{ text: "§c✘ Failed to update feature status!" }] }),
 configSaved: JSON.stringify({ rawtext: [{ text: "§a✔ Configuration saved successfully!" }] }),
 clanDeleted: JSON.stringify({ rawtext: [{ text: "§a✔ Clan has been deleted successfully!" }] }),
 cleanupStarted: JSON.stringify({ rawtext: [{ text: "§a✔ Clan cleanup process started!" }] }),
}
function parseSavedRTPConfig(saved) {
 if (!saved) return {}
 if (typeof saved === "string") {
 try {
 return JSON.parse(saved)
 } catch {
 return {}
 }
 }
 return typeof saved === "object" ? saved : {}
}
function normalizeInteger(value, fallback, min) {
 const number = Number(value)
 if (!Number.isFinite(number)) return fallback
 const integer = Math.floor(number)
 if (!Number.isSafeInteger(integer) || integer < min) return fallback
 return integer
}
function normalizeRTPConfig(config = {}) {
 const source = parseSavedRTPConfig(config)
 return {
 maxUses: normalizeInteger(source.maxUses, DEFAULT_RTP_CONFIG.maxUses, 1),
 cooldownTime: normalizeInteger(source.cooldownTime, DEFAULT_RTP_CONFIG.cooldownTime, 0),
 maxDistance: normalizeInteger(source.maxDistance, DEFAULT_RTP_CONFIG.maxDistance, 1),
 teleportDelay: normalizeInteger(source.teleportDelay, DEFAULT_RTP_CONFIG.teleportDelay, 0),
 allowOverworld: typeof source.allowOverworld === "boolean" ? source.allowOverworld : DEFAULT_RTP_CONFIG.allowOverworld,
 allowNether: typeof source.allowNether === "boolean" ? source.allowNether : DEFAULT_RTP_CONFIG.allowNether,
 allowTheEnd: typeof source.allowTheEnd === "boolean" ? source.allowTheEnd : DEFAULT_RTP_CONFIG.allowTheEnd,
 }
}
function syncRTPConfig(config) {
 Object.assign(rtpConfig, normalizeRTPConfig(config))
 return rtpConfig
}
function saveRTPConfig(config = rtpConfig) {
 syncRTPConfig(config)
 return GlobalConfig.set("rtpConfig", { ...rtpConfig })
}
function rtpText(player, key, ...args) {
 return Lang.t(player, `rtp.config.${key}`, ...args)
}
function parseRTPNumberInput(player, rawValue, labelKey, min) {
 const raw = String(rawValue ?? "").trim()
 const label = rtpText(player, labelKey)
 if (!/^\d+$/.test(raw)) {
 return { error: rtpText(player, "err.whole", label) }
 }
 const value = Number(raw)
 if (!Number.isSafeInteger(value) || value < min) {
 return { error: rtpText(player, "err.min", label, min) }
 }
 return { value }
}
function formatRTPMinutes(seconds) {
 const minutes = seconds / 60
 return Number.isInteger(minutes) ? `${minutes}` : minutes.toFixed(2)
}
function dimensionStatus(player, enabled) {
 return enabled ? rtpText(player, "status.on") : rtpText(player, "status.off")
}
const features = {
 teleport: { desc: "Teleport to other players" },
 randomTeleport: { desc: "Teleport to random locations" },
 warp: { desc: "Teleport to preset locations" },
 pwarp: { desc: "Teleport to player warps" },
 setHome: { desc: "Set and teleport to home" },
 transferMoney: { desc: "Send money to other players" },
 bank: { desc: "Access banking features" },
 clan: { desc: "Manage clans and members" },
 shop: { desc: "Buy and sell items" },
 playerShop: { desc: "Buy and sell items" },
 reportPlayer: { desc: "Report rule violations" },
 claimLand: { desc: "Claim and manage lands" },
 barter: { desc: "Trade items with other players" },
 backpack: { desc: "Access your backpack" },
 battlepass: { desc: "View battlepass progress" },
 emotes: { desc: "Access emote animations and poses" },
 job: { desc: "Jobs, rewards, quests, and salaries" },

 language: { desc: "Change interface language" },
}
export function control_member(player) {
 showMainMenu(player)
}
function showMainMenu(player) {
 const form = new ActionFormData().title("CONTROL PANEL").body("§eServer Features Settings\n§fManage and configure server features").button("Toggle Features\n§8Enable/Disable Features", "textures/ui/toggle_on").button("Features Status\n§8View All Features Status", "textures/ui/creative_icon").button("Advanced Config\n§8Configure Feature Settings", "textures/ui/creator_glyph_color").button("Custom Textures\n§8Change Button Icons", "textures/ui/icon_setting")
 if (player.name === "admin") form.button("Clan Admin Menu", "textures/ui/button_custom/clan")
 form.button("Back", "textures/ui/arrow_left")
 form.show(player).then(response => {
 if (response.canceled) return
 switch (response.selection) {
 case 0:
 showToggleMenu(player)
 break
 case 1:
 showStatus(player)
 break
 case 2:
 showAdvancedConfig(player)
 break
 case 3:
 configureButtonTextures(player)
 break
 case 4:
 if (player.name === "admin") {
 import("../../plugins/clan/admin.js").then(mod => mod.showAllClansMenu(player))
 } else {
 import("../../kiwora.js").then(mod => mod.showMainMenu(player));
 }
 break
 case 5:
 if (player.name === "admin") {
 import("../../kiwora.js").then(mod => mod.showMainMenu(player));
 }
 break
 }
 })
}
async function showToggleMenu(player) {
 const form = new ActionFormData().title("TOGGLE FEATURES").body("§eFeature Status Settings\n§fClick to enable or disable features")
 for (const [feature, status] of Object.entries(featureStatus)) {
 if (!feature.startsWith("custom_")) {
 const { desc } = features[feature] || { desc: "Unknown feature" }
 form.button(`${feature}\n${status ? "§a[ENABLED]" : "§c[DISABLED]"}\n§7${desc}`, status ? "textures/ui/toggle_on" : "textures/ui/toggle_off")
 }
 }
 const customButtons = getAllButtons()
 for (const btn of customButtons) {
 const feature = `custom_${btn.name}`
 const status = featureStatus[feature] || false
 form.button(`${btn.name}\n${status ? "§a[ENABLED]" : "§c[DISABLED]"}\n§7Custom Button`, status ? "textures/ui/toggle_on" : "textures/ui/toggle_off")
 }
 form.button("Back", "textures/ui/arrow_left")
 try {
 const response = await form.show(player)
 if (response.canceled) return
 const allFeatures = [...Object.keys(featureStatus).filter(f => !f.startsWith("custom_")), ...customButtons.map(b => `custom_${b.name}`)]
 if (response.selection < allFeatures.length) {
 const feature = allFeatures[response.selection]
 setMemberFeatureEnabled(feature, !featureStatus[feature])
 await saveFeatureSettings()
 player.runCommand(`titleraw @s actionbar ${messages.success}`)
 player.runCommand("playsound random.levelup @s")
 showToggleMenu(player)
 } else {
 showMainMenu(player)
 }
 } catch (error) {
 console.warn("Toggle menu error:", error)
 player.runCommand(`titleraw @s actionbar ${messages.error}`)
 }
}
function showStatus(player) {
 const form = new ActionFormData()
 .title("FEATURES STATUS")
 .body(
 "§eFeatures Status List\n§fHere are all available features status:\n\n" +
 Object.entries(featureStatus)
 .map(([feature, status]) => {
 const { desc } = features[feature] || { desc: "Unknown feature" }
 return `${feature}\n§7${desc}\n${status ? "§a✔ ENABLED" : "§c✘ DISABLED"}`
 })
 .join("\n\n")
 )
 .button("Back", "textures/ui/arrow_left")
 form.show(player).then(response => {
 if (response.canceled) return
 showMainMenu(player)
 })
}
function showAdvancedConfig(player) {
 const form = new ActionFormData()
 .title("ADVANCED CONFIGURATION")
 .body("§l§eFEATURE CONFIGURATIONS\n§r§fSelect a feature to configure:")
 .button("Random Teleport\n§r§8Configure RTP Settings", "textures/ui/icon_winter")
 .button("Set Home\n§r§8Configure Home Settings", "textures/ui/icon_recipe_item")
 .button("Transfer Money\n§r§8Configure Transfer Settings", "textures/ui/invite_base")
 .button("Land System\n§r§8Configure Land Claims", "textures/ui/icon_map")
 .button("Shop Config\n§r§8Configure shop items", "textures/ui/icon_blackfriday")
 .button("Backpack System\n§r§8Configure Storage Settings", "textures/ui/realmsStoriesIcon")
 .button("Battlepass\n§r§8Configure Battlepass Settings", "textures/ui/icon_book_writable")
 .button("Clan Admin Menu\n§r§8Configure Clan Settings", "textures/ui/button_custom/clan")
 .button(Lang.t(player, "bank.cfg.adv_btn"), "textures/ui/icon_book_writable")
 .button("PWarp Config\n§r§8Configure Player Warp", "textures/ui/glyph_realms")
 .button("Chest Shop\n§r§8Enable/Disable & Limit", "textures/items/minecart_chest")
 .button("Button Textures\n§r§8Customize Button Icons", "textures/ui/icon_setting")
 .button("BACK", "textures/ui/arrow_left")
 form.show(player).then(response => {
 if (response.canceled) return
 switch (response.selection) {
 case 0:
 configureRandomTeleport(player)
 break
 case 1:
 configureSetHome(player)
 break
 case 2:
 configureTransferMoney(player)
 break
 case 3:
 configureLandSystem(player)
 break
 case 4:
 configureCustomShop(player)
 break
 case 5:
 configureBackpackSystem(player)
 break
 case 6:
 openBattlepassAdmin(player)
 break
 case 7:
 showClanAdminMenu(player)
 break
 case 8:
 showBankAdminMenu(player, () => showAdvancedConfig(player))
 break
 case 9:
 ShowAdminPwarpSettings(player)
 break
 case 10:
 showChestShopAdminMenu(player, () => showAdvancedConfig(player))
 break
 case 11:
 configureButtonTextures(player)
 break
 case 12:
 showMainMenu(player)
 break
 }
 })
}
export function configureRandomTeleport(player) {
 showRTPConfigMenu(player)
}
async function showRTPConfigMenu(player) {
 loadRTPConfig()
 const overworldStatus = dimensionStatus(player, rtpConfig.allowOverworld)
 const netherStatus = dimensionStatus(player, rtpConfig.allowNether)
 const endStatus = dimensionStatus(player, rtpConfig.allowTheEnd)
 const form = new ActionFormData()
 .title(rtpText(player, "title"))
 .body(
 rtpText(
 player,
 "body",
 rtpConfig.maxUses,
 formatRTPMinutes(rtpConfig.cooldownTime),
 rtpConfig.maxDistance,
 rtpConfig.teleportDelay,
 overworldStatus,
 netherStatus,
 endStatus
 )
 )
 .button(rtpText(player, "btn.numbers"), "textures/ui/editIcon")
 .button(rtpText(player, "btn.overworld", overworldStatus), rtpConfig.allowOverworld ? "textures/ui/toggle_on" : "textures/ui/toggle_off")
 .button(rtpText(player, "btn.nether", netherStatus), rtpConfig.allowNether ? "textures/ui/toggle_on" : "textures/ui/toggle_off")
 .button(rtpText(player, "btn.end", endStatus), rtpConfig.allowTheEnd ? "textures/ui/toggle_on" : "textures/ui/toggle_off")
 .button(rtpText(player, "btn.reset"), "textures/ui/refresh_light")
 .button(rtpText(player, "btn.back_adv"), "textures/ui/arrow_left")
 const response = await form.show(player)
 if (response.canceled) {
 showAdvancedConfig(player)
 return
 }
 switch (response.selection) {
 case 0:
 showRTPNumberInput(player)
 break
 case 1:
 toggleRTPDimension(player, "allowOverworld")
 break
 case 2:
 toggleRTPDimension(player, "allowNether")
 break
 case 3:
 toggleRTPDimension(player, "allowTheEnd")
 break
 case 4:
 confirmResetRTPConfig(player)
 break
 default:
 showAdvancedConfig(player)
 break
 }
}
async function showRTPNumberInput(player) {
 loadRTPConfig()
 const form = new ModalFormData()
 .title(rtpText(player, "input.title"))
 .textField(rtpText(player, "input.max_uses"), rtpText(player, "input.max_uses.placeholder"), { defaultValue: String(rtpConfig.maxUses) })
 .textField(rtpText(player, "input.cooldown"), rtpText(player, "input.cooldown.placeholder"), { defaultValue: String(Math.floor(rtpConfig.cooldownTime / 60)) })
 .textField(rtpText(player, "input.range"), rtpText(player, "input.range.placeholder"), { defaultValue: String(rtpConfig.maxDistance) })
 .textField(rtpText(player, "input.delay"), rtpText(player, "input.delay.placeholder"), { defaultValue: String(rtpConfig.teleportDelay) })
 const response = await form.show(player)
 if (response.canceled) {
 showRTPConfigMenu(player)
 return
 }
 const [maxUsesRaw, cooldownMinutesRaw, maxDistanceRaw, teleportDelayRaw] = response.formValues
 const maxUses = parseRTPNumberInput(player, maxUsesRaw, "field.max_uses", 1)
 const cooldownMinutes = parseRTPNumberInput(player, cooldownMinutesRaw, "field.cooldown", 0)
 const maxDistance = parseRTPNumberInput(player, maxDistanceRaw, "field.range", 1)
 const teleportDelay = parseRTPNumberInput(player, teleportDelayRaw, "field.delay", 0)
 const error = maxUses.error || cooldownMinutes.error || maxDistance.error || teleportDelay.error
 if (error) {
 showRTPInputError(player, error)
 return
 }
 const cooldownTime = cooldownMinutes.value * 60
 if (!Number.isSafeInteger(cooldownTime)) {
 showRTPInputError(player, rtpText(player, "err.cooldown_big"))
 return
 }
 const nextConfig = {
 ...rtpConfig,
 maxUses: maxUses.value,
 cooldownTime,
 maxDistance: maxDistance.value,
 teleportDelay: teleportDelay.value,
 }
 if (!saveRTPConfig(nextConfig)) {
 player.runCommand(`titleraw @s actionbar ${messages.error}`)
 player.runCommand("playsound note.bass @s")
 showRTPConfigMenu(player)
 return
 }
 player.runCommand(`titleraw @s actionbar ${messages.configSaved}`)
 player.runCommand("playsound random.levelup @s")
 showRTPSavedSummary(player)
}
async function showRTPInputError(player, error) {
 const response = await new ActionFormData()
 .title(rtpText(player, "invalid.title"))
 .body(`${error}\n\n${rtpText(player, "invalid.body")}`)
 .button(rtpText(player, "btn.edit_again"), "textures/ui/editIcon")
 .button(rtpText(player, "btn.back_rtp"), "textures/ui/arrow_left")
 .show(player)
 if (!response.canceled && response.selection === 0) {
 showRTPNumberInput(player)
 } else {
 showRTPConfigMenu(player)
 }
}
function toggleRTPDimension(player, key) {
 loadRTPConfig()
 rtpConfig[key] = !rtpConfig[key]
 if (saveRTPConfig(rtpConfig)) {
 player.runCommand(`titleraw @s actionbar ${messages.configSaved}`)
 player.runCommand("playsound random.levelup @s")
 } else {
 player.runCommand(`titleraw @s actionbar ${messages.error}`)
 player.runCommand("playsound note.bass @s")
 }
 showRTPConfigMenu(player)
}
async function confirmResetRTPConfig(player) {
 const response = await new ActionFormData()
 .title(rtpText(player, "reset.title"))
 .body(rtpText(player, "reset.body"))
 .button(rtpText(player, "reset.confirm"), "textures/ui/refresh_light")
 .button(rtpText(player, "btn.back_rtp"), "textures/ui/arrow_left")
 .show(player)
 if (!response.canceled && response.selection === 0) {
 if (saveRTPConfig(DEFAULT_RTP_CONFIG)) {
 player.runCommand(`titleraw @s actionbar ${messages.configSaved}`)
 player.runCommand("playsound random.levelup @s")
 } else {
 player.runCommand(`titleraw @s actionbar ${messages.error}`)
 player.runCommand("playsound note.bass @s")
 }
 }
 showRTPConfigMenu(player)
}
async function showRTPSavedSummary(player) {
 loadRTPConfig()
 await new ActionFormData()
 .title(rtpText(player, "saved.title"))
 .body(
 rtpText(
 player,
 "saved.body",
 rtpConfig.maxUses,
 formatRTPMinutes(rtpConfig.cooldownTime),
 rtpConfig.maxDistance,
 rtpConfig.teleportDelay
 )
 )
 .button(rtpText(player, "btn.back_rtp"), "textures/ui/arrow_left")
 .show(player)
 showRTPConfigMenu(player)
}
function configureSetHome(player) {
 const form = new ActionFormData()
 .title("SET HOME CONFIGURATION")
 .body("§eMANAGE SET HOME SYSTEM\n§fConfigure settings or view player homes")
 .button("§eGeneral Settings\n§7Max homes, teleport delay, etc.", "textures/ui/icon_setting")
 .button("§bView Player Homes\n§7See and manage player homes", "textures/ui/icon_bell")
 .button("BACK", "textures/ui/arrow_left")
 form.show(player).then(response => {
 if (response.canceled) {
 showAdvancedConfig(player)
 return
 }
 switch (response.selection) {
 case 0:
 configureSetHomeSettings(player)
 break
 case 1:
 showPlayerHomeList(player)
 break
 case 2:
 showAdvancedConfig(player)
 break
 }
 })
}
function configureSetHomeSettings(player) {
 loadHomeConfig()
 const form = new ModalFormData()
 .title("Set Home Configuration")
 .slider("§eMaximum Homes Per Player", 1, 10, {
 defaultValue: homeConfig.maxHomes,
 valueStep: 1,
 tooltip: "Maximum number of homes per player",
 })
 .slider("§eMinimum Y Level", -64, 0, {
 defaultValue: homeConfig.minY,
 valueStep: 1,
 tooltip: "Minimum Y level for setting home",
 })
 .slider("§eTeleport Delay (seconds)", 1, 10, {
 defaultValue: homeConfig.teleportDelay,
 valueStep: 1,
 tooltip: "Delay before teleporting to home",
 })
 form.show(player).then(async response => {
 if (response.canceled) {
 configureSetHome(player)
 return
 }
 const [maxHomes, minY, teleportDelay] = response.formValues
 homeConfig.maxHomes = maxHomes
 homeConfig.minY = minY
 homeConfig.teleportDelay = teleportDelay
 try {
 GlobalConfig.set("homeConfig", homeConfig)
 try { await world.setDynamicProperty("homeConfig", undefined) } catch { }
 player.runCommand(`titleraw @s actionbar ${messages.configSaved}`)
 player.runCommand("playsound random.levelup @s")
 new ActionFormData()
 .title("Configuration Saved")
 .body("§eSet Home Settings Updated:\n\n" + `§r§fMaximum Homes: §b${maxHomes}\n` + `§fMinimum Y Level: §b${minY}\n` + `§fTeleport Delay: §b${teleportDelay} seconds\n\n` + "§7Changes will take effect immediately.")
 .button("BACK", "textures/ui/arrow_left")
 .show(player)
 .then(() => configureSetHome(player))
 } catch (error) {
 console.warn("Failed to save home config:", error)
 player.runCommand(`titleraw @s actionbar ${messages.error}`)
 player.runCommand("playsound note.bass @s")
 }
 })
}
const HOME_DP_PREFIX = "sethome:"
function parseStoredHomes(rawHomes) {
 if (rawHomes === undefined || rawHomes === null) return []
 try {
 const parsed = typeof rawHomes === "string" ? JSON.parse(rawHomes) : rawHomes
 if (!Array.isArray(parsed)) return []
 return parsed.filter(home => home && typeof home === "object" && typeof home.Name === "string")
 } catch {
 return []
 }
}
function getPlayerHomesFromTags(pl) {
 const homes = []
 const tags = pl.getTags()
 for (const tag of tags) {
 if (!tag.startsWith('{"Home":{')) continue
 try {
 const parsed = JSON.parse(tag)
 if (parsed?.Home) homes.push({ ...parsed.Home, rawTag: tag })
 } catch { }
 }
 return homes
}
function getPlayerHomesFromStorage(playerName) {
 if (!playerName) return []
 return parseStoredHomes(world.getDynamicProperty(HOME_DP_PREFIX + playerName))
}
function mergeHomes(baseHomes, extraHomes) {
 const merged = []
 const seen = new Set()
 const add = (home) => {
 if (!home || typeof home !== "object") return
 const key = home.UUID || `${home.Name || "unknown"}|${home.Dimension || "unknown"}|${home.Pos || "unknown"}`
 if (seen.has(key)) return
 seen.add(key)
 merged.push(home)
 }
 for (const home of baseHomes || []) add(home)
 for (const home of extraHomes || []) add(home)
 return merged
}
function getOnlinePlayerByName(playerName) {
 const lower = String(playerName || "").toLowerCase()
 if (!lower) return null
 return world.getAllPlayers().find(pl => pl.name.toLowerCase() === lower) || null
}
function resolvePlayerHomeEntry(playerName, storageName) {
 const onlinePlayer = getOnlinePlayerByName(playerName) || getOnlinePlayerByName(storageName)
 const resolvedPlayerName = onlinePlayer ? onlinePlayer.name : playerName
 const resolvedStorageName = storageName || resolvedPlayerName
 let homes = getPlayerHomesFromStorage(resolvedStorageName)
 if (resolvedPlayerName !== resolvedStorageName) {
 homes = mergeHomes(homes, getPlayerHomesFromStorage(resolvedPlayerName))
 }
 if (onlinePlayer) {
 homes = mergeHomes(homes, getPlayerHomesFromTags(onlinePlayer))
 }
 return {
 playerName: resolvedPlayerName,
 storageName: resolvedStorageName,
 onlinePlayer,
 homes,
 }
}
function getAllPlayersWithHomes() {
 const candidates = new Map()
 let propIds = []
 try {
 if (typeof world.getDynamicPropertyIds === "function") {
 propIds = world.getDynamicPropertyIds()
 }
 } catch { }
 for (const propId of propIds) {
 if (!propId.startsWith(HOME_DP_PREFIX)) continue
 const storageName = propId.slice(HOME_DP_PREFIX.length).trim()
 if (!storageName) continue
 const lower = storageName.toLowerCase()
 const existing = candidates.get(lower) || {}
 candidates.set(lower, {
 playerName: existing.playerName || storageName,
 storageName,
 })
 }
 for (const pl of world.getAllPlayers()) {
 const lower = pl.name.toLowerCase()
 const existing = candidates.get(lower) || {}
 candidates.set(lower, {
 playerName: pl.name,
 storageName: existing.storageName || pl.name,
 })
 }
 const playersWithHomes = []
 for (const entry of candidates.values()) {
 const resolved = resolvePlayerHomeEntry(entry.playerName, entry.storageName)
 if (resolved.homes.length > 0) {
 playersWithHomes.push(resolved)
 }
 }
 playersWithHomes.sort((a, b) => {
 if (b.homes.length !== a.homes.length) return b.homes.length - a.homes.length
 return a.playerName.localeCompare(b.playerName)
 })
 return playersWithHomes
}
function showPlayerHomeList(player) {
 const playersWithHomes = getAllPlayersWithHomes()
 const totalHomes = playersWithHomes.reduce((sum, entry) => sum + entry.homes.length, 0)
 const form = new ActionFormData()
 .title("PLAYER HOMES")
 .body(`§eALL PLAYERS WITH HOMES\n§fPlayers: §b${playersWithHomes.length}\n§fTotal Homes: §b${totalHomes}\n§7Click a player to view/manage homes`)
 if (playersWithHomes.length === 0) {
 form.body("§cNo players with homes found!")
 }
 for (const entry of playersWithHomes) {
 form.button(
 `${entry.onlinePlayer ? "§aONLINE" : "§8OFFLINE"} §e${entry.playerName}\n§7${entry.homes.length} home${entry.homes.length > 1 ? 's' : ''} set`,
 "textures/ui/icon_bell"
 )
 }
 form.button("BACK", "textures/ui/arrow_left")
 form.show(player).then(response => {
 if (response.canceled) {
 configureSetHome(player)
 return
 }
 if (response.selection < playersWithHomes.length) {
 showPlayerHomeDetails(player, playersWithHomes[response.selection])
 } else {
 configureSetHome(player)
 }
 })
}
function showPlayerHomeDetails(admin, targetEntry) {
 const freshEntry = resolvePlayerHomeEntry(targetEntry.playerName, targetEntry.storageName)
 const homes = freshEntry.homes
 if (homes.length === 0) {
 admin.sendMessage(`§cNo homes found for ${freshEntry.playerName}.`)
 showPlayerHomeList(admin)
 return
 }
 const form = new ActionFormData()
 .title(`§e${freshEntry.playerName}'s HOMES`)
 .body(
 `§eMANAGE PLAYER HOMES\n` +
 `§fPlayer: §e${freshEntry.playerName} ${freshEntry.onlinePlayer ? "§a(ONLINE)" : "§8(OFFLINE)"}\n` +
 `§fTotal: §b${homes.length} home${homes.length > 1 ? 's' : ''}`
 )
 for (const home of homes) {
 const homeName = home.Name || "Unnamed Home"
 const dimension = home.Dimension || "unknown"
 const dimColor = dimension === 'nether' ? '§c' : dimension === 'the_end' ? '§d' : '§a'
 form.button(
 `§e${homeName}\n§7${dimColor}${dimension} §8| ${home.Pos || "N/A"}`,
 home.Icon || "textures/ui/icon_bell"
 )
 }
 form.button("BACK", "textures/ui/arrow_left")
 form.show(admin).then(response => {
 if (response.canceled) {
 showPlayerHomeList(admin)
 return
 }
 if (response.selection < homes.length) {
 const selectedHome = homes[response.selection]
 showHomeActionMenu(admin, freshEntry, selectedHome)
 } else {
 showPlayerHomeList(admin)
 }
 })
}
function showHomeActionMenu(admin, targetEntry, home) {
 const homeName = home.Name || "Unnamed Home"
 const homeDim = home.Dimension || "unknown"
 const form = new ActionFormData()
 .title(`§e${homeName}`)
 .body(
 `§eHOME DETAILS\n\n` +
 `§fName: §e${homeName}\n` +
 `§fDescription: §7${home.Description || 'None'}\n` +
 `§fPosition: §b${home.Pos || "N/A"}\n` +
 `§fDimension: §a${homeDim}\n` +
 `§fWelcome Message: §7${home.WelcomeMessage || 'None'}\n\n` +
 `§fPlayer: §e${targetEntry.playerName}`
 )
 .button("§eTeleport to Home", "textures/ui/conduit_power_effect")
 .button("§cDelete Home", "textures/ui/icon_trash")
 .button("BACK", "textures/ui/arrow_left")
 form.show(admin).then(response => {
 if (response.canceled) {
 showPlayerHomeDetails(admin, targetEntry)
 return
 }
 switch (response.selection) {
 case 0:
 const coords = String(home.Pos || "").split(" ")
 if (coords.length === 3 && homeDim !== "unknown") {
 admin.runCommand(`execute in ${homeDim} run tp @s ${coords[0]} ${coords[1]} ${coords[2]}`)
 admin.runCommand(`titleraw @s actionbar {"rawtext":[{"text":"§a✔ Teleported to ${homeName}"}]}`)
 admin.runCommand("playsound random.levelup @s")
 } else {
 admin.sendMessage("§cInvalid home data. Cannot teleport.")
 }
 break
 case 1:
 deletePlayerHome(admin, targetEntry, home)
 break
 case 2:
 showPlayerHomeDetails(admin, targetEntry)
 break
 }
 })
}
function savePlayerHomes(targetEntry, homes) {
 const safeHomes = Array.isArray(homes) ? homes : []
 const namesToWrite = new Set([
 targetEntry.storageName,
 targetEntry.playerName,
 ].filter(Boolean))
 const payload = JSON.stringify(safeHomes)
 for (const name of namesToWrite) {
 world.setDynamicProperty(HOME_DP_PREFIX + name, payload)
 }
}
function deletePlayerHome(admin, targetEntry, home) {
 const homeName = home.Name || "Unnamed Home"
 const form = new ActionFormData()
 .title("§cDELETE HOME")
 .body(`§e⚠ CONFIRM DELETION\n\n§fAre you sure you want to delete:\n§e${homeName}\n\n§fPlayer: §e${targetEntry.playerName}\n\n§cThis action cannot be undone!`)
 .button("§c✘ DELETE", "textures/ui/icon_trash")
 .button("§aCANCEL", "textures/ui/cancel")
 form.show(admin).then(response => {
 if (response.canceled || response.selection !== 0) {
 showHomeActionMenu(admin, targetEntry, home)
 return
 }
 try {
 const freshEntry = resolvePlayerHomeEntry(targetEntry.playerName, targetEntry.storageName)
 const identity = home.UUID || `${home.Name || "unknown"}|${home.Dimension || "unknown"}|${home.Pos || "unknown"}`
 const updatedHomes = freshEntry.homes.filter(h => {
 const key = h.UUID || `${h.Name || "unknown"}|${h.Dimension || "unknown"}|${h.Pos || "unknown"}`
 return key !== identity
 })
 if (updatedHomes.length === freshEntry.homes.length) {
 admin.sendMessage("§c⚠ Home not found. It may have already been deleted.")
 showPlayerHomeDetails(admin, freshEntry)
 return
 }
 savePlayerHomes(freshEntry, updatedHomes)
 const targetOnline = freshEntry.onlinePlayer
 if (targetOnline?.isValid === true) {
 try {
 const tags = targetOnline.getTags()
 const tagToRemove = tags.find(t => home.UUID ? t.includes(`"UUID":"${home.UUID}"`) : t.includes(`"Name":"${home.Name}"`))
 if (tagToRemove) {
 targetOnline.removeTag(tagToRemove)
 }
 } catch { }
 try {
 if (typeof invalidateHomeCache === 'function') {
 invalidateHomeCache(targetOnline)
 }
 } catch (e) {
 console.warn("Failed to invalidate home cache:", e)
 }
 targetOnline.sendMessage(`§c⚠ Your home '${homeName}' has been deleted by an admin.`)
 }
 admin.runCommand(`titleraw @s actionbar {"rawtext":[{"text":"§a✔ Home '${homeName}' deleted!"}]}`)
 admin.runCommand("playsound random.break @s")
 if (updatedHomes.length > 0) {
 showPlayerHomeDetails(admin, freshEntry)
 } else {
 showPlayerHomeList(admin)
 }
 } catch (error) {
 console.warn("Failed to delete player home:", error)
 admin.sendMessage("§c⚠ Failed to delete home due to an internal error.")
 showPlayerHomeDetails(admin, targetEntry)
 }
 })
}
function configureTransferMoney(player) {
 const form = new ModalFormData()
 .title("Transfer Money Configuration")
 .slider("§eMinimum Transfer Amount", 1000, 100000, {
 defaultValue: transferConfig.minTransfer,
 valueStep: 1000,
 tooltip: "Minimum amount that can be transferred",
 })
 .slider("§eMaximum Transfer Amount", 10000, 10000000, {
 defaultValue: transferConfig.maxTransfer,
 valueStep: 10000,
 tooltip: "Maximum amount that can be transferred",
 })
 .toggle("§eEnable Transfer System", {
 defaultValue: transferConfig.enabled,
 tooltip: "Enable or disable money transfers",
 })
 form.show(player).then(async response => {
 if (response.canceled) {
 showAdvancedConfig(player)
 return
 }
 const [minTransfer, maxTransfer, enabled] = response.formValues
 transferConfig.minTransfer = minTransfer
 transferConfig.maxTransfer = maxTransfer
 transferConfig.enabled = enabled
 try {
 await world.setDynamicProperty("transferConfig", JSON.stringify(transferConfig))
 player.runCommand(`titleraw @s actionbar ${messages.configSaved}`)
 player.runCommand("playsound random.levelup @s")
 new ActionFormData()
 .title("Transfer Configuration Saved")
 .body("§eTRANSFER MONEY SETTINGS UPDATED:\n" + `§8▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` + `§fMinimum Transfer: §a$${metricNumbers(minTransfer)}\n` + `§fMaximum Transfer: §a$${metricNumbers(maxTransfer)}\n` + `§fTransfer System: ${enabled ? "§aEnabled" : "§cDisabled"}\n\n` + `§8▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` + "§7Changes will take effect immediately.")
 .button("BACK TO CONFIG\n§8» §fReturn to settings", "textures/ui/arrow_left")
 .show(player)
 .then(() => showAdvancedConfig(player))
 } catch (error) {
 console.warn("Failed to save transfer config:", error)
 player.runCommand(`titleraw @s actionbar ${messages.error}`)
 player.runCommand("playsound note.bass @s")
 }
 })
}
function configureButtonTextures(player) {
 const form = new ActionFormData().title("BUTTON TEXTURES").body("§eCUSTOMIZE BUTTON ICONS\n§fSelect a feature to change its icon:")
 const categories = {
 TELEPORT: ["teleport", "randomTeleport", "warp", "pwarp", "setHome"],
 ECONOMY: ["transferMoney", "bank", "shop", "playerShop", "barter"],
 SOCIAL: ["clan", "reportPlayer"],
 UTILITY: ["claimLand", "backpack", "battlepass", "language"],
 }
 for (const [category, features] of Object.entries(categories)) {
 form.button(`${category} BUTTONS\n§8Configure ${category.toLowerCase()} feature icons`, "textures/ui/icon_setting")
 }
 form.button("§cRESET ALL TEXTURES\n§8Restore default icons", "textures/ui/icon_trash")
 form.button("BACK", "textures/ui/arrow_left")
 form.show(player).then(response => {
 if (response.canceled) {
 showMainMenu(player)
 return
 }
 const categoryList = Object.keys(categories)
 if (response.selection < categoryList.length) {
 const selectedCategory = categoryList[response.selection]
 showCategoryTextures(player, selectedCategory, categories[selectedCategory])
 } else if (response.selection === categoryList.length) {
 resetButtonTextures(player)
 } else {
 showMainMenu(player)
 }
 })
}
function showCategoryTextures(player, category, features) {
 const form = new ActionFormData().title(`§e${category} TEXTURES`).body(`§e${category} BUTTON ICONS\n§fSelect a feature to change its icon:`)
 for (const feature of features) {
 form.button(`${feature}\n§7Current: ${buttonTextures[feature]}`, buttonTextures[feature])
 }
 form.button("BACK", "textures/ui/arrow_left")
 form.show(player).then(response => {
 if (response.canceled) {
 configureButtonTextures(player)
 return
 }
 if (response.selection < features.length) {
 const feature = features[response.selection]
 showTextureInput(player, feature, category, features)
 } else {
 configureButtonTextures(player)
 }
 })
}
function showTextureInput(player, feature, category, features) {
 const form = new ModalFormData()
 .title(`EDIT ${feature.toUpperCase()}`)
 .toggle("§eUse Custom Path", {
 defaultValue: textureSettings.useCustomPath[feature] || false,
 tooltip: "Use custom texture path instead of preset",
 })
 .dropdown("§eSelect from Presets", iconSuggestions, {
 defaultValue: iconSuggestions.indexOf(buttonTextures[feature]) || 0,
 tooltip: "Choose from predefined textures",
 })
 .textField("§eCustom Texture Path", "textures/ui/...", {
 defaultValue: buttonTextures[feature],
 placeholder: "Enter custom texture path",
 })
 form.show(player).then(async response => {
 if (response.canceled) {
 showCategoryTextures(player, category, features)
 return
 }
 const [useCustom, suggestionIndex, customPath] = response.formValues
 textureSettings.useCustomPath[feature] = useCustom
 let newTexturePath
 if (useCustom) {
 if (!customPath) {
 player.runCommand(`titleraw @s actionbar ${messages.error}`)
 return
 }
 newTexturePath = customPath
 } else {
 newTexturePath = iconSuggestions[suggestionIndex]
 }
 buttonTextures[feature] = newTexturePath
 try {
 await saveButtonTextures()
 player.runCommand(`titleraw @s actionbar ${messages.configSaved}`)
 player.runCommand("playsound random.levelup @s")
 showCategoryTextures(player, category, features)
 } catch (error) {
 console.warn("Failed to save button textures:", error)
 player.runCommand(`titleraw @s actionbar ${messages.error}`)
 player.runCommand("playsound note.bass @s")
 }
 })
}
function resetButtonTextures(player) {
 const form = new ActionFormData().title("RESET TEXTURES").body("§e⚠ RESET ALL BUTTON TEXTURES\n\n§fAre you sure you want to reset all button textures to default?\n§cThis action cannot be undone!").button("§c✘ RESET ALL\n§8Click to confirm", "textures/ui/icon_trash").button("BACK", "textures/ui/arrow_left")
 form.show(player).then(response => {
 if (response.canceled || response.selection !== 0) {
 showMainMenu(player)
 } else {
 Object.assign(buttonTextures, defaultIcons)
 saveButtonTextures()
 showMainMenu(player)
 }
 })
}
function loadButtonTextures() {
 try {
 const saved = world.getDynamicProperty("buttonTextures")
 const savedSettings = world.getDynamicProperty("textureSettings")
 if (!saved) {
 Object.assign(buttonTextures, defaultIcons)
 saveButtonTextures()
 return
 }
 if (savedSettings) {
 Object.assign(textureSettings, JSON.parse(savedSettings))
 }
 const savedTextures = JSON.parse(saved)
 Object.assign(buttonTextures, defaultIcons)
 for (const [feature, texture] of Object.entries(savedTextures)) {
 if (buttonTextures.hasOwnProperty(feature)) {
 buttonTextures[feature] = texture
 }
 }
 for (const feature in buttonTextures) {
 if (!buttonTextures[feature]) {
 buttonTextures[feature] = defaultIcons[feature]
 }
 }
 saveButtonTextures()
 } catch (error) {
 console.warn("Failed to load button textures:", error)
 Object.assign(buttonTextures, defaultIcons)
 saveButtonTextures()
 }
}
async function saveButtonTextures() {
 try {
 const texturesData = {}
 for (const [feature, texture] of Object.entries(buttonTextures)) {
 if (texture !== defaultIcons[feature]) {
 texturesData[feature] = texture
 }
 }
 await world.setDynamicProperty("buttonTextures", JSON.stringify(texturesData))
 await world.setDynamicProperty("textureSettings", JSON.stringify(textureSettings))
 return true
 } catch (error) {
 console.warn("Failed to save button textures:", error)
 return false
 }
}
async function saveFeatureSettings() {
 try {
 await world.setDynamicProperty("memberFeatureStatus", JSON.stringify(featureStatus))
 } catch (error) {
 console.warn("Failed to save feature settings:", error)
 }
}
function loadFeatureSettings() {
 try {
 const saved = world.getDynamicProperty("memberFeatureStatus")
 if (saved) {
 const savedFeatures = JSON.parse(saved)
 const features = Object.entries(savedFeatures)
 for (let i = 0; i < features.length; i++) {
 const [feature, status] = features[i]
 if (feature in featureStatus) {
 featureStatus[feature] = status
 }
 }
 }
 } catch (error) {
 console.warn("Failed to load feature settings:", error)
 }
}
function loadClanConfig() {
 try {
 const saved = world.getDynamicProperty("clanConfig")
 if (saved) Object.assign(clanConfig, JSON.parse(saved))
 } catch (error) {
 console.warn("Failed to load clan config:", error)
 }
}
function loadRTPConfig() {
 try {
 const saved = GlobalConfig.get("rtpConfig")
 syncRTPConfig(saved)
 } catch (error) {
 console.warn("Failed to load RTP config:", error)
 syncRTPConfig(DEFAULT_RTP_CONFIG)
 }
}
function loadHomeConfig() {
 try {
 const legacy = world.getDynamicProperty("homeConfig")
 if (legacy) {
 const parsedLegacy = typeof legacy === "string" ? JSON.parse(legacy) : legacy
 Object.assign(homeConfig, parsedLegacy)
 GlobalConfig.set("homeConfig", homeConfig)
 try { world.setDynamicProperty("homeConfig", undefined) } catch { }
 return
 }
 const saved = GlobalConfig.get("homeConfig")
 if (saved) Object.assign(homeConfig, typeof saved === "string" ? JSON.parse(saved) : saved)
 } catch (error) {
 console.warn("Failed to load home config:", error)
 }
}
function loadTransferConfig() {
 try {
 const saved = world.getDynamicProperty("transferConfig")
 if (saved) Object.assign(transferConfig, JSON.parse(saved))
 } catch (error) {
 console.warn("Failed to load transfer config:", error)
 }
}
system.runTimeout(() => {
 try {
 loadFeatureSettings()
 loadRTPConfig()
 loadClanConfig()
 loadHomeConfig()
 loadTransferConfig()
 loadButtonTextures()
 } catch (error) {
 console.warn("Error loading configurations:", error)
 }
}, 20)
function configureLandSystem(player) {
 AdminLandConfig(player)
}
function configureCustomShop(player) {
 
 showShopConfigMenu(player, (p) => showAdvancedConfig(p))
}
export { buttonTextures }
