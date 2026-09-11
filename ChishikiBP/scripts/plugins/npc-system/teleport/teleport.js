import { world, ActionFormData, ModalFormData } from "../../../core.js"
import { Database } from "../../../function/Database.js"
import { findNpcRecord, setRecordText } from "../../floating-text/registry.js"
const teleportDB = Database.getDatabase("teleport_npcs")
function getNPCConfig(npcId) {
 return teleportDB.get(npcId, {
 x: 0, y: 0, z: 0,
 dimension: "overworld",
 mode: "menu"
 })
}
function setNPCConfig(npcId, config) {
 teleportDB.set(npcId, config)
}
function teleportPlayer(player, config) {
 const dim = world.getDimension(config.dimension)
 player.teleport({ x: config.x, y: config.y, z: config.z }, { dimension: dim })
 player.sendMessage(`§aTeleported to §b${config.dimension} §aat §f${config.x}, ${config.y}, ${config.z}!`)
 player.runCommand("playsound random.levelup @s ~~~ 1 1")
}
function parseCoords(str) {
 const parts = str.replace(/,/g, " ").trim().split(/\s+/)
 if (parts.length !== 3) return null
 const x = parseFloat(parts[0])
 const y = parseFloat(parts[1])
 const z = parseFloat(parts[2])
 if (isNaN(x) || isNaN(y) || isNaN(z)) return null
 return { x, y, z }
}
function getNPCId(npcEntity) {
 const idTag = npcEntity.getTags().find(t => t.startsWith("npc_id:"))
 return idTag ? idTag.replace("npc_id:", "") : npcEntity.id
}
function getFloatingText(npcEntity) {
 return findNpcRecord(getNPCId(npcEntity))
}
async function showFloatingTextEditMenu(player, npcEntity) {
 const floatingText = getFloatingText(npcEntity)
 if (!floatingText) {
 player.sendMessage("§cNo floating text found! Create one using the floating text system.")
 return
 }
 const form = new ModalFormData()
 .title("Edit Floating Text")
 .textField("Floating Text:", "Enter text here...", { defaultValue: floatingText.text || "" })
 const res = await form.show(player)
 if (res.canceled) return
 const newText = res.formValues[0]?.trim()
 if (!newText) {
 player.sendMessage("§cText cannot be empty!")
 return
 }
 setRecordText(floatingText.id, newText)
 player.sendMessage(`§aFloating text updated to: §f${newText}`)
 player.runCommand("playsound random.levelup @s ~~~ 1 1")
}
async function showTeleportSettingsMenu(player, npcEntity) {
 const npcId = getNPCId(npcEntity)
 const config = getNPCConfig(npcId)
 const coordsStr = `${config.x},${config.y},${config.z}`
 const form = new ModalFormData()
 .title("Teleport Settings")
 .textField("Coordinates (format: x,y,z)", "100,64,200", { defaultValue: coordsStr })
 .dropdown("Dimension", ["overworld", "nether", "the_end"], { defaultValueIndex: ["overworld", "nether", "the_end"].indexOf(config.dimension) })
 .dropdown("Teleport Mode", ["Menu (Confirm)", "Direct (Instant)"], { defaultValueIndex: config.mode === "direct" ? 1 : 0 })
 const res = await form.show(player)
 if (res.canceled) return
 const coords = parseCoords(res.formValues[0])
 if (!coords) {
 player.sendMessage("§cInvalid coordinates! Use format: x,y,z")
 return
 }
 const dims = ["overworld", "nether", "the_end"]
 const modes = ["menu", "direct"]
 config.x = coords.x
 config.y = coords.y
 config.z = coords.z
 config.dimension = dims[res.formValues[1]]
 config.mode = modes[res.formValues[2]]
 setNPCConfig(npcId, config)
 player.sendMessage(`§aTeleport NPC configured!`)
 player.sendMessage(`§7- Coords: §f${config.x}, ${config.y}, ${config.z}`)
 player.sendMessage(`§7- Dimension: §f${config.dimension}`)
 player.sendMessage(`§7- Mode: §f${config.mode === "direct" ? "Direct" : "Menu"}`)
 player.runCommand("playsound random.levelup @s ~~~ 1 1")
}
export async function showTeleportMenu(player, npcEntity) {
 const npcId = getNPCId(npcEntity)
 const config = getNPCConfig(npcId)
 if (config.mode === "direct") {
 teleportPlayer(player, config)
 return
 }
 const form = new ActionFormData()
 .title("Teleport")
 .body(`§7Teleport to:\n§bDimension: §f${config.dimension}\n§bCoordinates: §f${config.x}, ${config.y}, ${config.z}\n\n§eAre you sure you want to teleport?`)
 .button("§aYes, Teleport", "textures/ui/check")
 .button("§cCancel", "textures/ui/cancel")
 const res = await form.show(player)
 if (!res.canceled && res.selection === 0) {
 teleportPlayer(player, config)
 }
}
export async function showTeleportAdminMenu(player, npcEntity) {
 const form = new ActionFormData()
 .title("Teleport NPC Options")
 .body("§eSelect an option:")
 .button("§aTeleport Settings\n§8Configure coords, dimension, mode", "textures/ui/gear")
 .button("§bEdit Floating Text\n§8Customize the text above NPC", "textures/ui/book_glyph")
 .button("§cCustomize Appearance\n§8Change skin & name", "textures/ui/dressing_room_skins")
 .button("§cCancel", "textures/ui/cancel")
 const res = await form.show(player)
 if (res.canceled) return
 if (res.selection === 0) {
 await showTeleportSettingsMenu(player, npcEntity)
 } else if (res.selection === 1) {
 await showFloatingTextEditMenu(player, npcEntity)
 } else if (res.selection === 2) {
 try { player.runCommand(`dialogue open @e[type=npc,c=1,r=5] @s`); } catch { }
 }
}
