import { system, world, ActionFormData, ModalFormData } from "../../core.js"
import { floatingTextMenu } from "./forms/floatingTextMenus.js"
import { createRecord, getRecords, setRecordText } from "./registry.js"
export function sortirLeaderboardMenu(viewer) {
 const leaderboardCategories = {
 "Player Stats": [
 { id: "money", name: "Money Leaderboard", description: "Top richest players" },
 { id: "bank", name: "Top Bank", description: "Top bank balances" },
 { id: "kill", name: "Kill Leaderboard", description: "Most kills players" },
 { id: "death", name: "Death Leaderboard", description: "Most deaths players" },
 { id: "mining", name: "Top Mining", description: "Most mining ores (only ores are counted)" },
 { id: "playtime", name: "Playtime Leaderboard", description: "Most active players by total playtime" },
 { id: "online_time", name: "Online Player Stats", description: "Current online players with their playtime" },
 ],
 "Clan Rankings": [
 { id: "clan_leaderboard", name: "Top Clan Overall", description: "Best clans by level & members" },
 { id: "clan_level", name: "Clan Level Ranking", description: "Highest level clans" },
 { id: "clan_member_count", name: "Clan Member Count", description: "Most members clans" },
 ],
 }
 new ActionFormData()
 .title("Sort Leaderboard Manager")
 .body("Select the leaderboard category you want to manage:\n\nPlayer Stats - Individual player statistics\nClan Rankings - Clan rankings")
 .button("Player Stats\nMoney, Kills, Deaths", "textures/ui/icon_steve")
 .button("Clan Rankings\nClan Level, Members", "textures/ui/icon_alex")
 .button("View All Active\nSee all active leaderboards", "textures/ui/gear")
 .button("Back to Main Menu", "textures/ui/arrow_left")
 .show(viewer)
 .then(({ selection, canceled }) => {
 if (canceled) return
 switch (selection) {
 case 0:
 showCategoryLeaderboards(viewer, "Player Stats", leaderboardCategories["Player Stats"])
 break
 case 1:
 showCategoryLeaderboards(viewer, "Clan Rankings", leaderboardCategories["Clan Rankings"])
 break
 case 2:
 showActiveLeaderboards(viewer)
 break
 case 3:
 floatingTextMenu(viewer)
 break
 }
 })
}
function showCategoryLeaderboards(viewer, categoryName, leaderboards) {
 const form = new ActionFormData().title(`${categoryName} Leaderboards`).body(`Select the type of leaderboard you want to create:`)
 leaderboards.forEach(board => {
 form.button(`${board.name}\n${board.description}`, "textures/ui/book_addpicture_default")
 })
 form.button("Back", "textures/ui/arrow_left")
 form.show(viewer).then(({ selection, canceled }) => {
 if (canceled) return
 if (selection === leaderboards.length) {
 sortirLeaderboardMenu(viewer)
 return
 }
 const selectedBoard = leaderboards[selection]
 createQuickLeaderboard(viewer, selectedBoard)
 })
}
function createQuickLeaderboard(viewer, boardConfig) {
 const pos = viewer.location
 new ModalFormData()
 .title(`Setup ${boardConfig.name}`)
 .textField("Leaderboard Title", "Custom title", {
 defaultValue: boardConfig.name.replace(/[^\w\s]/g, "").trim(),
 tooltip: "Enter custom title for this leaderboard",
 })
 .textField("Position (X Y Z)", "Coordinates", {
 defaultValue: `${pos.x.toFixed(2)} ${pos.y.toFixed(2)} ${pos.z.toFixed(2)}`,
 tooltip: "Format: X Y Z",
 })
 .slider("Players to Display", 5, 15, {
 defaultValue: 10,
 tooltip: "How many players to show",
 valueStep: 1,
 })
 .dropdown("Sort Order", ["Descending (High to Low)", "Ascending (Low to High)"], {
 defaultValueIndex: boardConfig.id === "death" ? 1 : 0,
 tooltip: "How to sort the scores",
 })
 .dropdown("Time Unit (Playtime Only)", ["Seconds", "Minutes", "Hours", "Days"], {
 defaultValueIndex: boardConfig.id === "playtime" ? 2 : 0,
 tooltip: "Time unit for playtime display (only affects playtime leaderboards)",
 })
 .show(viewer)
 .then(({ formValues, canceled }) => {
 if (canceled) return
 const [x, y, z] = formValues[1].trim().split(" ", 3).map(Number)
 const pos = { x, y: y - 0.58, z }
 try {
 const leaderboardData = [
 formValues[0] || boardConfig.name,
 boardConfig.id,
 formValues[3] === 0,
 true,
 "§6",
 "§f",
 "§a",
 formValues[2],
 {},
 ]
 if (boardConfig.id === "playtime") leaderboardData[9] = formValues[4]
 const record = createRecord({
 dim: viewer.dimension.id,
 x: pos.x,
 y: pos.y,
 z: pos.z,
 type: "leaderboard",
 data: leaderboardData,
 })
 setRecordText(record.id, "LOADING...")
 viewer.sendMessage(`${boardConfig.name} created successfully.`)
 viewer.sendMessage(`Position: ${formValues[1]}`)
 viewer.sendMessage(`Players: ${formValues[2]} players`)
 if (boardConfig.id === "playtime") {
 const timeUnits = ["Seconds", "Minutes", "Hours", "Days"]
 viewer.sendMessage(`Time Unit: ${timeUnits[formValues[4]]}`)
 }
 viewer.playSound("random.levelup")
 system.runTimeout(() => {
 sortirLeaderboardMenu(viewer)
 }, 40)
 } catch (error) {
 viewer.sendMessage("Error creating leaderboard: " + error.message)
 sortirLeaderboardMenu(viewer)
 }
 })
}
function showActiveLeaderboards(viewer) {
 const leaderboards = getRecords().filter(record => record.type === "leaderboard")
 if (leaderboards.length === 0) {
 new ActionFormData()
 .title("Active Leaderboards")
 .body("No active leaderboards found.\n\nCreate a new one from the main menu.")
 .button("Back", "textures/ui/arrow_left")
 .show(viewer)
 .then(() => sortirLeaderboardMenu(viewer))
 return
 }
 const form = new ActionFormData().title(`Active Leaderboards (${leaderboards.length})`).body("List of all active leaderboards on the server:")
 leaderboards.forEach(record => {
 try {
 const data = Array.isArray(record.data) ? record.data : []
 const title = data[0] || "Unknown"
 const objective = data[1] || "unknown"
 const dimName = record.dim.replace("minecraft:", "")
 let timeUnitInfo = ""
 if (objective === "playtime" && data[9] !== undefined) {
 const timeUnits = ["Seconds", "Minutes", "Hours", "Days"]
 timeUnitInfo = ` | ${timeUnits[data[9]]}`
 }
 form.button(`${title}\n${objective}${timeUnitInfo} | ${dimName} | ${record.x.toFixed(0)}, ${record.y.toFixed(0)}, ${record.z.toFixed(0)}`, "textures/ui/book_addpicture_default")
 } catch {
 form.button("Error Loading Leaderboard", "textures/ui/crossout")
 }
 })
 form.button("Back", "textures/ui/arrow_left")
 form.show(viewer).then(({ selection, canceled }) => {
 if (canceled) return
 if (selection === leaderboards.length) {
 sortirLeaderboardMenu(viewer)
 return
 }
 const selectedRecord = leaderboards[selection]
 viewer.sendMessage(`Navigating to leaderboard: ${(selectedRecord.text || selectedRecord.data?.[0] || "Unknown").split("\n")[0]}`)
 })
}
