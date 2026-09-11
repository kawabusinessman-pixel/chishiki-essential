import { world, ActionFormData } from "../core.js"
import { showScoreboardMenu } from "./scoreboard.js"
import { Lang } from "../lib/Lang.js"
export async function showResetScoresMenu(source) {
 try {
 const response = await new ActionFormData().simpleUi().title(Lang.t(source, "admin.resetscores.title")).body(Lang.t(source, "admin.resetscores.body")).button(Lang.t(source, "admin.resetscores.btn.death"), "textures/ui/icon_recipe_equipment").button(Lang.t(source, "admin.resetscores.btn.kill"), "textures/ui/icon_recipe_nature").button(Lang.t(source, "admin.resetscores.btn.both"), "textures/ui/icon_recipe_construction").button(Lang.t(source, "admin.resetscores.btn.back"), "textures/ui/arrow_left").show(source)
 if (response.canceled) return
 switch (response.selection) {
 case 0:
 await showResetScoreTypeMenu(source, "death")
 break
 case 1:
 await showResetScoreTypeMenu(source, "kill")
 break
 case 2:
 await showResetScoreTypeMenu(source, "both")
 break
 case 3:
 await showScoreboardMenu(source)
 break
 }
 } catch (error) {
 source.sendMessage("Error occurred while showing the reset scores menu!")
 }
}
async function showResetScoreTypeMenu(source, scoreType) {
 try {
 const players = world.getAllPlayers()
 if (players.length === 0) {
 const response = await new ActionFormData().simpleUi().title(Lang.t(source, "admin.resetscores.error.title")).body(Lang.t(source, "admin.resetscores.error.body")).button(Lang.t(source, "admin.resetscores.btn.back"), "textures/ui/arrow_left").show(source)
 if (!response.canceled) await showResetScoresMenu(source)
 return
 }
 const resetTypeResponse = await new ActionFormData().simpleUi()
 .title(Lang.t(source, "admin.resetscores.options.title"))
 .body(`Select how you want to reset ${scoreType === "both" ? "death and kill" : scoreType} scores:`)
 .button(Lang.t(source, "admin.resetscores.options.btn.all"), "textures/ui/icon_multiplayer")
 .button(Lang.t(source, "admin.resetscores.options.btn.specific"), "textures/ui/icon_steve")
 .button(Lang.t(source, "admin.resetscores.options.btn.back"), "textures/ui/arrow_left")
 .show(source)
 if (resetTypeResponse.canceled) return await showResetScoresMenu(source)
 switch (resetTypeResponse.selection) {
 case 0:
 await resetScoresForAll(source, scoreType)
 break
 case 1:
 await showPlayerSelectionMenu(source, scoreType)
 break
 case 2:
 await showResetScoresMenu(source)
 break
 }
 } catch (error) {
 source.sendMessage("An error occurred while showing reset options!")
 }
}
async function showPlayerSelectionMenu(source, scoreType) {
 try {
 const players = world.getAllPlayers()
 const MAX_PLAYERS_PER_PAGE = 10
 async function showPlayerPage(pageNum) {
 const startIdx = pageNum * MAX_PLAYERS_PER_PAGE
 const endIdx = Math.min(startIdx + MAX_PLAYERS_PER_PAGE, players.length)
 const currentPlayers = players.slice(startIdx, endIdx)
 const totalPages = Math.ceil(players.length / MAX_PLAYERS_PER_PAGE)
 const menu = new ActionFormData().simpleUi().title(Lang.t(source, "admin.resetscores.select_player.title", pageNum + 1, totalPages)).body(`Choose a player to reset ${scoreType === "both" ? "death and kill" : scoreType} scores:`)
 for (let i = 0; i < currentPlayers.length; i++) {
 menu.button(currentPlayers[i].name, "textures/ui/icon_steve")
 }
 if (pageNum > 0) menu.button(Lang.t(source, "admin.resetscores.select_player.btn.prev"), "textures/ui/arrow_left")
 if (endIdx < players.length) menu.button(Lang.t(source, "admin.resetscores.select_player.btn.next"), "textures/ui/arrow_right")
 menu.button(Lang.t(source, "admin.resetscores.select_player.btn.back"), "textures/ui/cancel")
 const response = await menu.show(source)
 if (response.canceled) return await showResetScoreTypeMenu(source, scoreType)
 const buttonCount = currentPlayers.length
 if (response.selection < buttonCount) {
 await resetScoresForPlayer(source, currentPlayers[response.selection], scoreType)
 } else if (pageNum > 0 && response.selection === buttonCount) {
 await showPlayerPage(pageNum - 1)
 } else if (endIdx < players.length && ((pageNum > 0 && response.selection === buttonCount + 1) || (pageNum === 0 && response.selection === buttonCount))) {
 await showPlayerPage(pageNum + 1)
 } else {
 await showResetScoreTypeMenu(source, scoreType)
 }
 }
 await showPlayerPage(0)
 } catch (error) {
 source.sendMessage("An error occurred while selecting player!")
 }
}
async function resetScoresForAll(source, scoreType) {
 try {
 const confirmResponse = await new ActionFormData().simpleUi()
 .title(Lang.t(source, "admin.resetscores.confirm.title"))
 .body(Lang.t(source, "admin.resetscores.confirm.body"))
 .button(Lang.t(source, "admin.resetscores.confirm.btn.reset"), "textures/ui/trash")
 .button(Lang.t(source, "admin.resetscores.confirm.btn.cancel"), "textures/ui/arrow_left")
 .show(source)
 if (confirmResponse.canceled || confirmResponse.selection === 1) {
 return await showResetScoreTypeMenu(source, scoreType)
 }
 try {
 const players = world.getAllPlayers()
 for (const player of players) {
 if (scoreType === "death" || scoreType === "both") {
 world.scoreboard.getObjective("death")?.setScore(player, 0)
 }
 if (scoreType === "kill" || scoreType === "both") {
 world.scoreboard.getObjective("kill")?.setScore(player, 0)
 }
 }
 } catch (error) {
 console.error("Error resetting scores:", error)
 source.sendMessage("§cFailed to reset scores!")
 return
 }
 const finalResponse = await new ActionFormData().simpleUi()
 .title(Lang.t(source, "admin.resetscores.success.title"))
 .body(`Successfully reset ${scoreType === "both" ? "death and kill" : scoreType} scores for all players!`)
 .button(Lang.t(source, "admin.resetscores.success.btn.more"), "textures/ui/refresh")
 .button(Lang.t(source, "admin.resetscores.success.btn.back"), "textures/ui/arrow_left")
 .show(source)
 if (!finalResponse.canceled) {
 await (finalResponse.selection === 0 ? showResetScoresMenu : showScoreboardMenu)(source)
 }
 } catch (error) {
 source.sendMessage("Failed to reset scores for all players!")
 }
}
async function resetScoresForPlayer(source, player, scoreType) {
 try {
 const confirmResponse = await new ActionFormData().simpleUi()
 .title(Lang.t(source, "admin.resetscores.confirm.title"))
 .body(`Warning!\n\nAre you sure you want to reset ${scoreType === "both" ? "death and kill" : scoreType} scores for ${player.name}?\n\nThis action cannot be undone!`)
 .button(Lang.t(source, "admin.resetscores.confirm.btn.reset"), "textures/ui/trash")
 .button(Lang.t(source, "admin.resetscores.confirm.btn.cancel"), "textures/ui/arrow_left")
 .show(source)
 if (confirmResponse.canceled || confirmResponse.selection === 1) {
 return await showPlayerSelectionMenu(source, scoreType)
 }
 try {
 if (scoreType === "death" || scoreType === "both") {
 world.scoreboard.getObjective("death")?.setScore(player, 0)
 }
 if (scoreType === "kill" || scoreType === "both") {
 world.scoreboard.getObjective("kill")?.setScore(player, 0)
 }
 } catch (error) {
 console.error("Error resetting player scores:", error)
 source.sendMessage(`§cFailed to reset scores for ${player.name}!`)
 return
 }
 const finalResponse = await new ActionFormData().simpleUi()
 .title(Lang.t(source, "admin.resetscores.success.title"))
 .body(`Successfully reset ${scoreType === "both" ? "death and kill" : scoreType} scores for ${player.name}!`)
 .button(Lang.t(source, "admin.resetscores.success.btn.more"), "textures/ui/refresh")
 .button(Lang.t(source, "admin.resetscores.success.btn.back"), "textures/ui/arrow_left")
 .show(source)
 if (!finalResponse.canceled) {
 switch (finalResponse.selection) {
 case 0:
 await showPlayerSelectionMenu(source, scoreType)
 break
 case 1:
 await showResetScoresMenu(source)
 break
 case 2:
 await showScoreboardMenu(source)
 break
 }
 }
 } catch (error) {
 source.sendMessage(`Failed to reset scores for ${player.name}!`)
 }
}
