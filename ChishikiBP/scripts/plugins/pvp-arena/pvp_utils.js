import { world, system } from "../../core.js";
import { getProtectedRegions, getRegionConfig, isPvpRegion } from "../../admin_menu/lobby_protect/config.js";

export function getPvpArenas() {
  try {
    const regs = getProtectedRegions();
    return regs.filter(r => isPvpRegion(r.id));
  } catch { return []; }
}

export function getArenaById(id) {
  return getPvpArenas().find(r => r.id === id) || null;
}

export function formatArenaLabel(arena) {
  const c = getRegionConfig(arena.id);
  const mode = c.regionMode === "pvp" ? "§c[PVP]" : "§a[LOBBY]";
  const s = (Math.abs(arena.pos1.x - arena.pos2.x) + 1) * (Math.abs(arena.pos1.z - arena.pos2.z) + 1);
  return `${mode} ${arena.name} §7(${s} blocks)`;
}

export function getArenaCenter(arena) {
  const cx = Math.floor((arena.pos1.x + arena.pos2.x) / 2) + 0.5;
  const cz = Math.floor((arena.pos1.z + arena.pos2.z) / 2) + 0.5;
  return { x: cx, z: cz };
}

export function findSafeY(dimension, x, z, startY = 320) {
  // 318 keeps the y + 1 air check inside the build height (max block Y is 319);
  // starting at 320 made getBlock(321) throw on the first tick and fall back
  // to startY, which dropped players from y=320.
  const top = Math.min(Math.floor(startY), 318);
  const scan = (from) => {
    try {
      for (let y = from; y > -64; y--) {
        let b, c, a;
        try {
          b = dimension.getBlock({ x: Math.floor(x), y: y - 1, z: Math.floor(z) });
          c = dimension.getBlock({ x: Math.floor(x), y, z: Math.floor(z) });
          a = dimension.getBlock({ x: Math.floor(x), y: y + 1, z: Math.floor(z) });
        } catch { return null; }
        if (b && !b.isAir && c?.isAir && a?.isAir) return y;
      }
    } catch { }
    return null;
  };
  // The startY hint can sit below the real surface (old regions, creator was
  // in a tunnel): retry once from the full column before settling on top.
  return scan(top) ?? (top < 318 ? scan(318) : null) ?? top;
}

function getSpawnStartY(arena) {
  const y = Number(arena?.spawnY);
  return Number.isFinite(y) ? Math.min(y + 2, 318) : 318;
}

const GROUND_SNAP_TRIES = 8;

// Two-phase landing: the player is teleported high first so the arena chunk
// starts loading (findSafeY cannot read an unloaded chunk), then snapped down
// onto the arena floor once blocks become readable.
export function snapToGround(player, dimension, x, z, startY = 318) {
  let tries = 0;
  const handle = system.runInterval(() => {
    tries++;
    if (!player.isValid) { system.clearRun(handle); return; }
    try { player.addEffect("slow_falling", 60, { amplifier: 0, showParticles: false }); } catch { }
    let landed = false;
    try {
      dimension.getBlock({ x: Math.floor(x), y: 64, z: Math.floor(z) });
      const y = Math.max(findSafeY(dimension, x, z, startY), -60);
      player.teleport({ x, y, z }, { dimension });
      try { player.resetFallDistance(); } catch { }
      landed = true;
    } catch { }
    if (landed || tries >= GROUND_SNAP_TRIES) {
      system.clearRun(handle);
      try { player.removeEffect("slow_falling"); } catch { }
    }
  }, 10);
}

export function getArenaSpawn(arena, offset = 0) {
  const center = getArenaCenter(arena);
  const dimId = (getRegionConfig(arena.id).protectedDimensions?.[0]) || "overworld";
  const dim = world.getDimension(dimId);
  const x = center.x + offset;
  const z = center.z + offset;
  const y = findSafeY(dim, x, z, getSpawnStartY(arena));
  return { dimension: dim, location: { x, y, z } };
}

export function getArenaSpawns(arena, count = 2, spread = 8) {
  const center = getArenaCenter(arena);
  const dimId = (getRegionConfig(arena.id).protectedDimensions?.[0]) || "overworld";
  const dim = world.getDimension(dimId);
  const spawns = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = center.x + Math.cos(angle) * spread;
    const z = center.z + Math.sin(angle) * spread;
    const y = findSafeY(dim, x, z, getSpawnStartY(arena));
    spawns.push({ x, y, z });
  }
  return { dimension: dim, spawns };
}

export function saveOrigin(player) {
  try {
    const loc = player.location;
    const dim = player.dimension.id;
    world.setDynamicProperty(`pvp:origin:${player.name}`, JSON.stringify({ x: loc.x, y: loc.y, z: loc.z, dim }));
  } catch {}
}

export function restoreOrigin(player) {
  try {
    const raw = world.getDynamicProperty(`pvp:origin:${player.name}`);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const dim = world.getDimension(data.dim.split(":").pop());
    const y = findSafeY(dim, data.x, data.z, data.y + 5);
    player.teleport({ x: data.x, y, z: data.z }, { dimension: dim });
    world.setDynamicProperty(`pvp:origin:${player.name}`, undefined);
    return true;
  } catch { return false; }
}

export function teleportToArena(player, arena, offset = 0) {
  try {
    const spawn = getArenaSpawn(arena, offset);
    saveOrigin(player);
    // Phase 1: teleport high so the arena chunk starts loading
    player.teleport({ x: spawn.location.x, y: 320, z: spawn.location.z }, { dimension: spawn.dimension });
    // Phase 2: snap down onto the arena floor once blocks are readable
    snapToGround(player, spawn.dimension, spawn.location.x, spawn.location.z, getSpawnStartY(arena));
    return true;
  } catch (e) {
    console.warn("[PVP] teleport failed:", e);
    return false;
  }
}

export function broadcast(title, msg) {
  for (const p of world.getPlayers()) {
    try { p.sendMessage(`§c§l[PVP] §r${msg}`); } catch {}
  }
}
