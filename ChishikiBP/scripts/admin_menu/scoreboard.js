import { world, ActionFormData, ModalFormData } from "../core.js"
import { showMainMenu } from "../kiwora"
import { scoreboardForm } from "../forms.js"
import { showResetScoresMenu } from "./resetScores.js"
import { Lang } from "../lib/Lang.js"
export async function showScoreboardMenu(source) {
 try {
 const menu = scoreboardForm(source)
 const response = await menu.show(source)
 if (response.canceled) return
 switch (response.selection) {
 case 0:
 await showSetScoreMenu(source)
 break
 case 1:
 await showGetScoreMenu(source)
 break
 case 2:
 await showSetDisplayMenu(source)
 break
 case 3:
 await showResetScoresMenu(source)
 break
 case 4:
 showMainMenu(source)
 break
 }
 } catch (error) {
 console.error("Error showing scoreboard menu:", error)
 source.sendMessage(Lang.t(source, "sb.err.menu"))
 }
}
async function showSetDisplayMenu(source) {
 try {
 const objectives = world.scoreboard.getObjectives()
 if (objectives.length === 0) {
 const errorMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.error"))
 .body(Lang.t(source, "sb.err.no_obj_display"))
 .button(Lang.t(source, "sb.create.btn"), "textures/ui/plus")
 .button(Lang.t(source, "sb.btn.back_sb"), "textures/ui/arrow_left")
 const response = await errorMenu.show(source)
 if (!response.canceled && response.selection === 0) {
 await showSetScoreMenu(source)
 } else {
 await showScoreboardMenu(source)
 }
 return
 }
 const displayMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.display.title"))
 .body(Lang.t(source, "sb.display.body"))
 objectives.forEach(objective => {
 displayMenu.button(Lang.t(source, "sb.btn.configure_obj", objective.id))
 })
 const objectiveResponse = await displayMenu.show(source)
 if (objectiveResponse.canceled) return await showScoreboardMenu(source)
 const selectedObjective = objectives[objectiveResponse.selection].id
 const locationMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.location.title"))
 .body(Lang.t(source, "sb.location.body", selectedObjective))
 .button(Lang.t(source, "sb.location.sidebar"), "textures/ui/sidebar_right")
 .button(Lang.t(source, "sb.location.belowname"), "textures/ui/player_offline")
 .button(Lang.t(source, "sb.location.list"), "textures/ui/servers")
 const locationResponse = await locationMenu.show(source)
 if (locationResponse.canceled) return await showSetDisplayMenu(source)
 const locations = ["sidebar", "belowName", "list"]
 const selectedLocation = locations[locationResponse.selection]
 source.runCommand(`scoreboard objectives setdisplay ${selectedLocation} ${selectedObjective}`)
 source.sendMessage(Lang.t(source, "sb.msg.display_set", selectedObjective, selectedLocation))
 const successMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.success"))
 .body(Lang.t(source, "sb.display.success_body", selectedObjective, selectedLocation))
 .button(Lang.t(source, "sb.btn.configure_another"), "textures/ui/refresh")
 .button(Lang.t(source, "sb.btn.back_main"), "textures/ui/arrow_left")
 const finalResponse = await successMenu.show(source)
 if (!finalResponse.canceled) {
 if (finalResponse.selection === 0) {
 await showSetDisplayMenu(source)
 } else {
 await showScoreboardMenu(source)
 }
 }
 } catch (error) {
 console.error("Error during set display:", error)
 source.sendMessage(Lang.t(source, "sb.err.failed_display"))
 }
}
async function showSetScoreMenu(source) {
 try {
 const setScoreForm = new ModalFormData()
 .title(Lang.t(source, "sb.create.title"))
 .textField(Lang.t(source, "sb.create.obj_name"), Lang.t(source, "sb.create.obj_name_placeholder"))
 .textField(Lang.t(source, "sb.create.display_name"), Lang.t(source, "sb.create.display_name_placeholder"))
 const response = await setScoreForm.show(source)
 if (response.canceled) return await showScoreboardMenu(source)
 const objectiveName = response.formValues[0].replace(/\s+/g, "_")
 const displayName = response.formValues[1].replace(/\s+/g, "_")
 source.runCommand(`scoreboard objectives add ${objectiveName} dummy ${displayName}`)
 const successMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.success"))
 .body(Lang.t(source, "sb.create.success_body", objectiveName, displayName))
 .button(Lang.t(source, "sb.btn.config_display"), "textures/ui/settings_glyph")
 .button(Lang.t(source, "sb.btn.create_another"), "textures/ui/plus")
 .button(Lang.t(source, "sb.btn.back_main"), "textures/ui/arrow_left")
 const finalResponse = await successMenu.show(source)
 if (!finalResponse.canceled) {
 switch (finalResponse.selection) {
 case 0:
 await showSetDisplayMenu(source)
 break
 case 1:
 await showSetScoreMenu(source)
 break
 case 2:
 await showScoreboardMenu(source)
 break
 }
 }
 } catch (error) {
 console.error("Error creating objective:", error)
 source.sendMessage(Lang.t(source, "sb.err.failed_create"))
 }
}
async function showGetScoreMenu(source) {
 try {
 const objectives = world.scoreboard.getObjectives()
 if (objectives.length === 0) {
 const errorMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.error"))
 .body(Lang.t(source, "sb.err.no_obj_view"))
 .button(Lang.t(source, "sb.create.btn"), "textures/ui/plus")
 .button(Lang.t(source, "sb.btn.back_sb"), "textures/ui/arrow_left")
 const response = await errorMenu.show(source)
 if (!response.canceled && response.selection === 0) {
 await showSetScoreMenu(source)
 } else {
 await showScoreboardMenu(source)
 }
 return
 }
 const viewMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.view.title"))
 .body(Lang.t(source, "sb.view.body"))
 objectives.forEach(objective => {
 viewMenu.button(Lang.t(source, "sb.btn.view_obj", objective.id))
 })
 const objectiveResponse = await viewMenu.show(source)
 if (objectiveResponse.canceled) return await showScoreboardMenu(source)
 const selectedObjective = objectives[objectiveResponse.selection]
 const actionMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.actions.title"))
 .body(Lang.t(source, "sb.actions.body", selectedObjective.id))
 .button(Lang.t(source, "sb.btn.view_scores"), "textures/ui/magnifying_glass")
 .button(Lang.t(source, "sb.btn.delete_obj"), "textures/ui/trash")
 .button(Lang.t(source, "sb.btn.back_list"), "textures/ui/arrow_left")
 const actionResponse = await actionMenu.show(source)
 if (actionResponse.canceled) return await showGetScoreMenu(source)
 if (actionResponse.selection === 0) {
 const participants = world.scoreboard.getParticipants()
 const playerScores = participants.map(participant => {
 const score = selectedObjective.getScore(participant)
 return `• ${participant.displayName}: ${score}`
 })
 if (playerScores.length > 0) {
 const scoresMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.scores.title"))
 .body([Lang.t(source, "sb.scores.header", selectedObjective.id), ...playerScores, "================================"].join("\n"))
 .button(Lang.t(source, "sb.btn.view_another"), "textures/ui/refresh")
 .button(Lang.t(source, "sb.btn.back_main"), "textures/ui/arrow_left")
 const finalResponse = await scoresMenu.show(source)
 if (!finalResponse.canceled) {
 if (finalResponse.selection === 0) {
 await showGetScoreMenu(source)
 } else {
 await showScoreboardMenu(source)
 }
 }
 } else {
 const noScoresMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.scores.no_scores_title"))
 .body(Lang.t(source, "sb.scores.no_scores_body", selectedObjective.id))
 .button(Lang.t(source, "sb.btn.view_another"), "textures/ui/refresh")
 .button(Lang.t(source, "sb.btn.back_main"), "textures/ui/arrow_left")
 const finalResponse = await noScoresMenu.show(source)
 if (!finalResponse.canceled) {
 if (finalResponse.selection === 0) {
 await showGetScoreMenu(source)
 } else {
 await showScoreboardMenu(source)
 }
 }
 }
 } else if (actionResponse.selection === 1) {
 const confirmMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.delete.confirm_title"))
 .body(Lang.t(source, "sb.delete.confirm_body", selectedObjective.id))
 .button(Lang.t(source, "sb.btn.delete_confirm"), "textures/ui/trash")
 .button(Lang.t(source, "sb.btn.cancel"), "textures/ui/arrow_left")
 const confirmResponse = await confirmMenu.show(source)
 if (!confirmResponse.canceled && confirmResponse.selection === 0) {
 try {
 world.scoreboard.removeObjective(selectedObjective.id)
 source.sendMessage(Lang.t(source, "sb.msg.deleted", selectedObjective.id))
 } catch (error) {
 console.error("Error deleting objective:", error)
 source.sendMessage(Lang.t(source, "sb.msg.delete_failed", selectedObjective.id, error.message))
 return await showGetScoreMenu(source)
 }
 const successMenu = new ActionFormData().simpleUi()
 .title(Lang.t(source, "sb.success"))
 .body(Lang.t(source, "sb.delete.success_body", selectedObjective.id))
 .button(Lang.t(source, "sb.btn.view_others"), "textures/ui/refresh")
 .button(Lang.t(source, "sb.btn.back_main"), "textures/ui/arrow_left")
 const finalResponse = await successMenu.show(source)
 if (!finalResponse.canceled) {
 if (finalResponse.selection === 0) {
 await showGetScoreMenu(source)
 } else {
 await showScoreboardMenu(source)
 }
 }
 } else {
 await showGetScoreMenu(source)
 }
 } else {
 await showGetScoreMenu(source)
 }
 } catch (error) {
 console.error("Error in score management:", error)
 source.sendMessage(Lang.t(source, "sb.err.failed_manage"))
 }
}
