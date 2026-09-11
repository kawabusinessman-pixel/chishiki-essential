import { Database } from "./Database.js"
const clanDB = Database.getDatabase("kiwoClan")
function getClan(player) {
 try {
 const playerData = clanDB.get(`player_${player.name}`)
 if (!playerData || !playerData.clanId) {
 return "§fNone"
 }
 const clanData = clanDB.get(`clan_${playerData.clanId}`)
 if (!clanData) {
 return "§fNone"
 }
 return clanData.name || playerData.clanId
 } catch (error) {
 console.warn(`Error getting clan for ${player.name}:`, error)
 return "§fNone"
 }
}
export { getClan, clanDB }
