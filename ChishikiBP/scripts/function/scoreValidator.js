import { world, system } from '../core.js';
import { getMoneySystemMode } from './moneySystem.js';
const SAFE_LIMIT = 2e9;
const MIN_LIMIT = 0;
const OBJECTIVES = ['money', 'death', 'kill', 'mining'];
const playerValidation = new Map();
export function validatePlayerScores(player) {
 try {
 let needsValidation = false;
 for (const objective of OBJECTIVES) {
 if (objective === 'money' && getMoneySystemMode() === 'unlimited') continue;
 const obj = world.scoreboard.getObjective(objective) ?? world.scoreboard.addObjective(objective);
 let score = obj.getScore(player.scoreboardIdentity) ?? MIN_LIMIT;
 if (score < MIN_LIMIT || score > SAFE_LIMIT) {
 score = Math.min(Math.max(score, MIN_LIMIT), SAFE_LIMIT);
 obj.setScore(player, score);
 needsValidation = true;
 }
 }
 return needsValidation;
 } catch {
 return false;
 }
}
system.run(() => {
 for (const objective of OBJECTIVES) {
  try {
   if (objective === 'money' && getMoneySystemMode() === 'unlimited') continue;
   world.scoreboard.getObjective(objective) ?? world.scoreboard.addObjective(objective);
  } catch { }
 }
});
world.afterEvents.playerSpawn.subscribe(({ player }) => {
 validatePlayerScores(player);
});
world.afterEvents.playerJoin.subscribe(({ player }) => {
 validatePlayerScores(player);
});
system.runInterval(() => {
  const currentTime = Date.now();
  for (const player of world.getPlayers()) {
    const lastCheck = playerValidation.get(player.id) || 0;
    if (currentTime - lastCheck >= 20000) {
      if (validatePlayerScores(player)) {
        playerValidation.set(player.id, currentTime);
      }
    }
  }
}, 400);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  playerValidation.delete(playerId);
});