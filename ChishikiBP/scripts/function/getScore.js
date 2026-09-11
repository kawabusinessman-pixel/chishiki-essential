import { world } from '../core.js';
const SAFE_LIMIT = 2000000000;
const MIN_LIMIT = 0;
export function getScore(player, objective) {
 try {
 const score = world.scoreboard.getObjective(objective).getScore(player.scoreboardIdentity);
 if (score === undefined || score < MIN_LIMIT) {
 world.getDimension("overworld").runCommand(`scoreboard players set "${player.name}" ${objective} ${MIN_LIMIT}`);
 return MIN_LIMIT;
 }
 if (score > SAFE_LIMIT) {
 world.getDimension("overworld").runCommand(`scoreboard players set "${player.name}" ${objective} ${SAFE_LIMIT}`);
 return SAFE_LIMIT;
 }
 return score;
 } catch {
 world.getDimension("overworld").runCommand(`scoreboard objectives add ${objective} dummy`);
 world.getDimension("overworld").runCommand(`scoreboard players set "${player.name}" ${objective} ${MIN_LIMIT}`);
 return MIN_LIMIT;
 }
}