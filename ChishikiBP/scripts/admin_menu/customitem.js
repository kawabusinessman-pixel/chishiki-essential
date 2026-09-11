import { world, system, ActionFormData, ModalFormData } from "../core.js"
import { showMainMenu } from "../kiwora.js"
const CONFIG = {
 default: {
 adminItem: "kwd:item01",
 memberItem: "kwd:member01",
 useCustomItems: false,
 },
 messages: {
 success: "§a✔ Settings saved successfully!",
 error: "§c⚠ Failed to save settings!",
 noAdminTag: "§c⚠ You need admin tag! Use: §f/tag @s add admin",
 noMemberTag: "§c⚠ You need member tag! Contact admin",
 sameItem: "§c⚠ Admin and Member items cannot be the same!",
 },
 items: ["kwd:item01", "kwd:member01", "minecraft:compass", "minecraft:clock", "minecraft:nether_star", "minecraft:blaze_rod", "minecraft:stick", "minecraft:paper", "minecraft:diamond", "minecraft:emerald", "minecraft:gold_ingot", "minecraft:iron_ingot", "minecraft:book", "minecraft:feather", "minecraft:map", "minecraft:name_tag", "minecraft:ender_pearl", "minecraft:ender_eye", "minecraft:totem_of_undying", "minecraft:trident", "minecraft:shield", "minecraft:golden_apple"],
 lockedItems: new Set(["kwd:item01", "kwd:member01"]),
}
let config = null
const helpers = {
 hasTag: (player, tag) => player.getTags().includes(tag),
 getConfig: () => {
 if (config) return config
 try {
 const saved = world.getDynamicProperty("customItemConfig")
 config = saved ? { ...CONFIG.default, ...JSON.parse(saved) } : CONFIG.default
 return config
 } catch {
 return (config = CONFIG.default)
 }
 },
 saveConfig: newConfig => {
 try {
 world.setDynamicProperty("customItemConfig", JSON.stringify(newConfig))
 config = newConfig
 return true
 } catch {
 return false
 }
 },
 playSound: (player, sound, pitch = 1) => player.runCommand(`playsound ${sound} @s ~~~ 1 ${pitch}`),
}
export async function customitem(source) {
  if (!helpers.hasTag(source, "admin")) {
    source.sendMessage(CONFIG.messages.noAdminTag)
    helpers.playSound(source, "note.bass", 0.5)
    return
  }
  const currentConfig = helpers.getConfig()
  const adminLocked = CONFIG.lockedItems.has(currentConfig.adminItem) ? "§6[x]" : "§a[v]"
  const memberLocked = CONFIG.lockedItems.has(currentConfig.memberItem) ? "§6[x]" : "§a[v]"
  const form = new ActionFormData().simpleUi()
    .title("Custom Item Settings")
    .body(`Current: ${currentConfig.useCustomItems ? "§aEnabled" : "§cDisabled"}\n${adminLocked} §fAdmin: §7${currentConfig.adminItem}\n${memberLocked} §fMember: §7${currentConfig.memberItem}\n\n§8§o[x] = protected, cannot be swapped.`)
    .button("Configure Items", "textures/ui/icon_setting")
    .button("Reset to Default", "textures/ui/refresh")
    .button("Back", "textures/ui/arrow_left")
  const response = await form.show(source)
  if (!response.canceled) {
    const actions = [() => showItemSettings(source), () => resetToDefault(source), () => showMainMenu(source)]
    actions[response.selection]?.()
  }
}
async function showItemSettings(source) {
 const currentConfig = helpers.getConfig()
 const itemLabels = CONFIG.items.map(id => {
 if (id === "kwd:item01") return "§0[x] kwd:item01 (Default Admin)"
 if (id === "kwd:member01") return "§0[x] kwd:member01 (Default Member)"
 return `§0${id}`
 })
 const form = new ModalFormData()
 .title("Item Settings")
 .toggle("§eEnable Custom Items", { defaultValue: currentConfig.useCustomItems })
 .dropdown("§eAdmin Item §c§o([x] = locked)", itemLabels, { defaultValue: CONFIG.items.indexOf(currentConfig.adminItem) })
 .dropdown("§eMember Item §c§o([x] = locked)", itemLabels, { defaultValue: CONFIG.items.indexOf(currentConfig.memberItem) })
 const response = await form.show(source)
 if (!response.canceled) {
 const [useCustomItems, adminItemIndex, memberItemIndex] = response.formValues
 const adminItem = CONFIG.items[adminItemIndex]
 const memberItem = CONFIG.items[memberItemIndex]
 if (adminItem === memberItem) {
 source.sendMessage(CONFIG.messages.sameItem)
 helpers.playSound(source, "note.bass", 0.5)
 showItemSettings(source)
 return
 }
 const newConfig = {
 ...currentConfig,
 useCustomItems,
 adminItem,
 memberItem,
 }
 const success = helpers.saveConfig(newConfig)
 source.sendMessage(success ? CONFIG.messages.success : CONFIG.messages.error)
 helpers.playSound(source, success ? "random.levelup" : "note.bass", success ? 1 : 0.5)
 }
}
async function resetToDefault(source) {
 const form = new ActionFormData().simpleUi().title("Confirm Reset").body("§eReset to default settings?\n§c⚠ Cannot be undone!").button("§cReset", "textures/ui/refresh_light").button("Cancel", "textures/ui/arrow_left")
 const response = await form.show(source)
 if (!response.canceled && response.selection === 0) {
 const success = helpers.saveConfig(CONFIG.default)
 source.sendMessage(success ? "§a✔ Reset successful!" : CONFIG.messages.error)
 helpers.playSound(source, success ? "random.levelup" : "note.bass", success ? 1 : 0.5)
 }
}
system.runTimeout(() => helpers.getConfig(), 100)
export function getCustomItemConfig() {
 const cfg = helpers.getConfig()
 return {
 ...cfg,
 isProtectedItem: (itemId) => {
 return itemId === cfg.adminItem || itemId === cfg.memberItem || CONFIG.lockedItems.has(itemId)
 },
 isAdminItem: (itemId) => itemId === cfg.adminItem || (!cfg.useCustomItems && itemId === "kwd:item01"),
 isMemberItem: (itemId) => itemId === cfg.memberItem || (!cfg.useCustomItems && itemId === "kwd:member01"),
 checkAccess: (player, itemType) => {
 if (itemType === "admin" && !helpers.hasTag(player, "admin")) {
 player.sendMessage(CONFIG.messages.noAdminTag)
 helpers.playSound(player, "note.bass", 0.5)
 return false
 }
 return true
 },
 }
}
