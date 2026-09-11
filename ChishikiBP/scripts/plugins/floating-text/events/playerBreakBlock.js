import { world } from "../../../core.js"
import { addScore } from "../../../lib/game.js"
const ORE_BLOCKS = new Set([
 "minecraft:coal_ore",
 "minecraft:iron_ore",
 "minecraft:gold_ore",
 "minecraft:diamond_ore",
 "minecraft:emerald_ore",
 "minecraft:lapis_ore",
 "minecraft:nether_gold_ore",
 "minecraft:nether_quartz_ore",
 "minecraft:copper_ore",
 "minecraft:deepslate_coal_ore",
 "minecraft:deepslate_iron_ore",
 "minecraft:deepslate_gold_ore",
 "minecraft:deepslate_diamond_ore",
 "minecraft:deepslate_emerald_ore",
 "minecraft:deepslate_lapis_ore",
 "minecraft:deepslate_copper_ore",
 "minecraft:deepslate_redstone_ore",
 "minecraft:redstone_ore",
 "minecraft:ancient_debris",
])
function isOreBlock(typeId) {
 return ORE_BLOCKS.has(typeId)
}
export function setupPlayerBreakBlockEvent() {
 world.beforeEvents.playerBreakBlock.subscribe(event => {
 const player = event.player
 const block = event.block
 if (!player || !block) return
 if (isOreBlock(block.typeId)) {
 addScore(player, "mining", 1)
 }
 })
}
