import { system } from '../core.js';
import { RankDB } from "../board/data.js";
function getRank(player) {
 try {
 const prefix = RankDB.get("RankDBConfig-prefix") ?? "rank:";
 const ranks = player
 .getTags()
 .filter((v) => v.startsWith(prefix))
 .map((v) => v.substring(prefix.length))
 .filter((x) => x);
 let rank;
 if (ranks.length === 0) {
 rank = RankDB.get("RankDBConfig-default") ?? "";
 if (rank) {
 system.run(() => {
 try {
 if (!player.getTags().some(tag => tag.startsWith(prefix))) {
 player.addTag(`${prefix}${rank}`);
 console.warn(`[getRank] Added default rank tag ${prefix}${rank} to ${player.name}`);
 }
 } catch (tagError) {
 console.warn(`[getRank] Failed to add default rank tag to ${player.name}:`, tagError);
 }
 });
 }
 return rank;
 } else {
 rank = ranks.join("§r");
 }
 return rank;
 } catch (error) {
 console.warn(`[getRank] Error getting rank for ${player.name}:`, error);
 try {
 const defaultPrefix = "rank:";
 const ranks = player
 .getTags()
 .filter((v) => v.startsWith(defaultPrefix))
 .map((v) => v.substring(defaultPrefix.length))
 .filter((x) => x);
 if (ranks.length === 0) {
 const defaultRank = RankDB.get("RankDBConfig-default") ?? "";
 if (defaultRank) {
 system.run(() => {
 try {
 player.addTag(`${defaultPrefix}${defaultRank}`);
 console.warn(`[getRank] Added fallback default rank tag ${defaultPrefix}${defaultRank} to ${player.name}`);
 } catch (tagError) {
 console.warn(`[getRank] Failed to add fallback default rank tag to ${player.name}:`, tagError);
 }
 });
 }
 return defaultRank;
 }
 return ranks.join("§r");
 } catch (fallbackError) {
 console.warn(`[getRank] Critical error getting rank for ${player.name}:`, fallbackError);
 return RankDB.get("RankDBConfig-default") ?? ""; 
 }
 }
}
export { getRank };
