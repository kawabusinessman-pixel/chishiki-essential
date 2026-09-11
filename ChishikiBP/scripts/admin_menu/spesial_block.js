import { kiwora } from "../forms.js"
import { showMainMenu } from "../kiwora.js"
import { ActionFormData } from "../core.js"
import { Lang } from "../lib/Lang.js"
const ITEMS = [
 "command_block", "structure_block", "border_block", "barrier",
 "light_block 1 15", "jigsaw", "spawn_egg 1 51", "iron_golem_spawn_egg",
 "allow", "deny", "structure_void"
]
const ITEM_NAMES = [
 "command block", "structure block", "border block", "barrier",
 "light block", "jigsaw", "npc", "iron golem",
 "allow", "deny", "structure void"
]
const ITEM_ICONS = [
 "textures/blocks/command_block",
 "textures/blocks/structure_block",
 "textures/blocks/border",
 "textures/blocks/barrier",
 "textures/items/light_block_15",
 "textures/blocks/jigsaw_front",
 "textures/items/egg_npc",
 "textures/items/spawn_eggs/spawn_egg_iron_golem",
 "textures/blocks/build_allow",
 "textures/blocks/build_deny",
 "textures/blocks/structure_void"
]
const helpers = {
 giveItem: (player, item) => player.runCommand(`give @s ${item}`),
 playSound: (player) => player.runCommand("playsound block.note_block.bell @s"),
 setFeedback: (player, enabled) => player.runCommand(`gamerule sendcommandfeedback ${enabled}`),
 sendMessage: (player, message) => player.sendMessage(message)
}
export async function showSpecialItemsMenu(source) {
 const form = new ActionFormData().simpleUi()
 .title(Lang.t(source, "admin.spesial_block.title"))
 .body(Lang.t(source, "admin.spesial_block.body"))
 for (let i = 0; i < ITEMS.length; i++) {
 form.button(ITEM_NAMES[i], ITEM_ICONS[i])
 }
 form.button(Lang.t(source, "admin.spesial_block.btn.back"), "textures/ui/arrow_left")
 const response = await form.show(source)
 if (response.canceled) return
 if (response.selection === ITEMS.length) {
 showMainMenu(source)
 return
 }
 const item = ITEMS[response.selection]
 if (!item) return
 helpers.setFeedback(source, false)
 try {
 helpers.giveItem(source, item)
 helpers.playSound(source)
 helpers.sendMessage(source, "§a✔ Item has been given successfully!")
 showSpecialItemsMenu(source)
 } finally {
 helpers.setFeedback(source, true)
 }
}