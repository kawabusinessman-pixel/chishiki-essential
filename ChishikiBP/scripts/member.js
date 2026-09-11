import { system, world, ActionFormData, uiTitle } from "./core.js"
import { transferMoney } from "./plugins/tf-money/tf-money.js"
import { openBackpackMenu } from "./plugins/backpack/menu.js"
import { Bank } from "./plugins/bank/bank.js"
import { BarterMenu } from "./plugins/barter/index.js"
import { showClanMenu } from "./plugins/clan/clan.js"
import { Shop } from "./menu_member/functions/shop/index.js"
import { LandMember } from "./plugins/land-system/index.js"
import { showPlayerShopMenu } from "./plugins/player-shop/index.js"
import { ShowPlayerWarps } from "./plugins/player-warp/index.js"
import { random_tp } from "./plugins/random-teleport/index.js"
import { showReportPlayerMenu } from "./plugins/report-player/index.js"
import { TeleportRequest } from "./plugins/teleport-request/index.js"
import { HomeSystem } from "./plugins/sethome/Set Home.js"
import { ShowAvailableWarps } from "./warp.js"
import { openBattlepass } from "./plugins/battlepass/index.js"
import { showEmoteMenu } from "./plugins/emotes/index.js"
import { getAllButtons } from "./admin_menu/custom_button/custom_database.js"
import { executeButtonCommand } from "./admin_menu/custom_button/custom_main.js"
import { buttonTextures } from "./menu_member/control_member/control.js"

import { registerCustomCommands } from "./plugins/custom-commands/custom.command.js"
import { featureStatus, ensureMemberFeature, isMemberFeatureEnabled, loadMemberFeatureStatus, setMemberFeatureEnabled } from "./function/memberFeatureState.js"
import { Lang, LANG_META } from "./lib/Lang.js"
registerCustomCommands(system)
function togglePersonalScoreboard(player) {
 const currentDisabled = player.getDynamicProperty("personal_scoreboard_disabled")
 const newDisabled = !currentDisabled
 player.setDynamicProperty("personal_scoreboard_disabled", newDisabled)
 const statusText = newDisabled ? Lang.t(player, "common.disabled") : Lang.t(player, "common.enabled")
 player.runCommand(`titleraw @s actionbar {"rawtext":[{"text":"§aScoreboard ${statusText}"}]}`)
}
function showLanguageMenu(player) {
 const currentLang = Lang.get(player)
 const currentLabel = Lang.t(player, "lang.current")
 const form = new ActionFormData()
 .title("§f" + Lang.t(player, "lang.menu.title").toLowerCase())
 .body("§7" + Lang.t(player, "lang.menu.body"))
 for (const meta of LANG_META) {
 const mark = meta.code === currentLang ? "\n§a" + currentLabel : ""
 form.button("§f" + meta.label.toLowerCase() + mark, meta.flag)
 }
 form.button("§c" + Lang.t(player, "common.back"), "textures/ui/arrow_left")
 form.show(player).then(response => {
 if (response.canceled) return
 const picked = LANG_META[response.selection]
 if (picked) {
 Lang.set(player, picked.code)
 player.sendMessage(Lang.t(player, "cmd.lang.success", picked.label))
 player.runCommand("playsound random.levelup @s")
 }
 system.runTimeout(() => showMemberMenu(player), 2)
 }).catch(error => {
 console.warn("Failed to open member language menu:", error)
 player.sendMessage("§cFailed to open language menu.")
 system.runTimeout(() => showMemberMenu(player), 2)
 })
}
system.runTimeout(() => {
 loadMemberFeatureStatus()
 const customButtons = getAllButtons()
 for (const btn of customButtons) ensureMemberFeature(`custom_${btn.name}`, true)
}, 1)
const MENU_ITEMS = [
 { key: "member.menu.btn.request_teleport", icon: "textures/ui/conduit_power_effect", feature: "teleport", handler: TeleportRequest },
 { key: "member.menu.btn.random_teleport", icon: "textures/ui/broadcast_glyph_color", feature: "randomTeleport", handler: random_tp },
 { key: "member.menu.btn.warp", icon: "textures/ui/icon_recipe_construction", feature: "warp", handler: ShowAvailableWarps },
 { key: "member.menu.btn.player_warp", icon: "textures/ui/glyph_realms", feature: "pwarp", handler: ShowPlayerWarps },
 { key: "member.menu.btn.set_home", icon: "textures/ui/icon_bell", feature: "setHome", handler: HomeSystem },
 { key: "member.menu.btn.land_management", icon: "textures/ui/icon_map", feature: "claimLand", handler: LandMember },
 { key: "member.menu.btn.transfer_money", icon: "textures/ui/invite_base", feature: "transferMoney", handler: transferMoney },
 { key: "member.menu.btn.bank", icon: "textures/ui/icon_book_writable", feature: "bank", handler: Bank },
 { key: "member.menu.btn.clan", icon: "textures/ui/button_custom/clan", feature: "clan", handler: showClanMenu },
 { key: "member.menu.btn.shop", icon: "textures/ui/button_custom/shop", feature: "shop", handler: Shop },
 { key: "member.menu.btn.player_shop", icon: "textures/icon_custom/my_characters", feature: "playerShop", handler: showPlayerShopMenu },
 { key: "member.menu.btn.report_player", icon: "textures/items/trial_key", feature: "reportPlayer", handler: showReportPlayerMenu },
 { key: "member.menu.btn.barter", icon: "textures/ui/icon_book_writable", feature: "barter", handler: BarterMenu },
 { key: "member.menu.btn.backpack", icon: "textures/items/bundle", feature: "backpack", handler: openBackpackMenu },
 { key: "member.menu.btn.battlepass", icon: "textures/ui/icon_book_writable", feature: "battlepass", handler: openBattlepass },
 { key: "member.menu.btn.emotes", icon: "textures/emotes/dance/dance_1", feature: "emotes", handler: showEmoteMenu },

 { key: "member.menu.btn.toggle_scoreboard", icon: "textures/items/sign", feature: "personalScoreboard", handler: togglePersonalScoreboard },
 { key: "member.menu.btn.language", icon: "textures/ui/language_glyph", feature: "language", handler: showLanguageMenu },
]
const messages = (() => {
 const cache = new Map()
 const createMessage = (prefix, text) => {
 const key = `${prefix}:${text}`
 if (!cache.has(key)) {
 cache.set(key, JSON.stringify({ rawtext: [{ text: `${prefix} ${text}` }] }))
 }
 return cache.get(key)
 }
 return {
 error: text => createMessage("§cError:", text),
 success: text => createMessage("§aSuccess:", text),
 info: text => createMessage("Info:", text),
 }
})()
const menuText = text => String(text ?? "")
export function showMemberMenu(source) {
 const enabledMenuItems = MENU_ITEMS.filter(item => isMemberFeatureEnabled(item.feature))
 const customButtons = getAllButtons()
 
 const form = new ActionFormData()
 .preserveButtonCase()
 .title(uiTitle("memberMenu", "§fChishiki Essential"))
 for (const item of enabledMenuItems) {
 let name = menuText(Lang.t(source, item.key))
 if (item.feature === "personalScoreboard") {
 const isDisabled = source.getDynamicProperty("personal_scoreboard_disabled")
 name = isDisabled ? "§a" + menuText(Lang.t(source, "member.menu.btn.enable_scoreboard")) : "§c" + menuText(Lang.t(source, "member.menu.btn.disable_scoreboard"))
 }
 form.button(name, buttonTextures[item.feature] || item.icon)
 }
 for (const btn of customButtons) {
 const featureKey = `custom_${btn.name}`
 if (featureStatus[featureKey] !== false) {
 form.button(menuText(`${btn.name}\n${btn.description || Lang.t(source, "member.menu.custom_button")}`), btn.icon || "textures/ui/icon_book_writable")
 }
 }
 form.button(menuText(Lang.t(source, "member.menu.btn.exit")), "textures/ui/redX1")
 form.show(source).then(result => {
 if (result.canceled) return
 const totalItems = enabledMenuItems.length + customButtons.length
 if (result.selection === totalItems) return
 if (result.selection < enabledMenuItems.length) {
 try {
 const selectedItem = enabledMenuItems[result.selection]
 if (!isMemberFeatureEnabled(selectedItem.feature)) {
 source.sendMessage("§cThis feature is currently disabled by an admin.")
 return
 }
 try { source.runCommand("playsound ui.loom.select_pattern @s ~~~ 0.6 1.2"); } catch { }
 selectedItem.handler(source)
 } catch (e) {
 console.warn("Failed to handle menu selection - Please try again", e)
 source.runCommand(`titleraw @s actionbar ${messages.error("Something went wrong. Please try again")}`)
 }
 } else {
 const customIndex = result.selection - enabledMenuItems.length
 if (customIndex < customButtons.length) {
 try { source.runCommand("playsound ui.loom.select_pattern @s ~~~ 0.6 1.2"); } catch { }
 executeButtonCommand(source, customButtons[customIndex])
 }
 }
 })
}
export const toggleFeature = (feature, status) => {
 if (feature in featureStatus) setMemberFeatureEnabled(feature, status)
}
export { featureStatus }
