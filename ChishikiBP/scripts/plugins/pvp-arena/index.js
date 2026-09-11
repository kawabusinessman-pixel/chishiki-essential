import { world, system } from "../../core.js";
import { handleDuelDeath, cleanupDuelOnLeave } from "./pvp_1vs1.js";
import { handleSquadDeath, cleanupSquadOnLeave } from "./pvp_squad.js";
import { handleFfaDeath, cleanupFfaOnLeave } from "./pvp_ffa.js";

export function initPvpArena() {
  world.afterEvents.entityDie.subscribe((e) => {
    try {
      if (e.deadEntity?.typeId !== "minecraft:player") return;
      const dead = e.deadEntity;
      const killer = e.damageSource?.damagingEntity;
      if (dead.hasTag("pvp:ffa")) { handleFfaDeath(dead); return; }
      if (dead.hasTag("pvp:squad")) { handleSquadDeath(dead); return; }
      if (dead.hasTag("pvp:duel")) { handleDuelDeath(dead, killer); return; }
    } catch {}
  });

  world.afterEvents.playerLeave.subscribe(({ playerId, playerName }) => {
    const name = playerName || playerId;
    try { cleanupDuelOnLeave(name); } catch {}
    try { cleanupSquadOnLeave(name); } catch {}
    try { cleanupFfaOnLeave(name); } catch {}
    try {
      const p = world.getPlayers().find(pl => pl.id === playerId);
      if (p) for (const t of p.getTags()) if (t.startsWith("pvp:")) try { p.removeTag(t); } catch {}
    } catch {}
  });


}

system.runTimeout(() => initPvpArena(), 80);

export { showDuelMenu } from "./pvp_1vs1.js";
export { showSquadMenu } from "./pvp_squad.js";
export { showFfaMenu } from "./pvp_ffa.js";
