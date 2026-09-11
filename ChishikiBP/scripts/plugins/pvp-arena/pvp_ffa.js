import { world, system, ActionFormData, MessageFormData } from "../../core.js";
import { getPvpArenas, getArenaSpawns, snapToGround } from "./pvp_utils.js";
import { Lang } from "../../lib/Lang.js";

const FFA_MIN = 3;
const FFA_MAX = 30;
const FFA_COUNTDOWN = 10;
let ffaState = { active: false, arena: null, players: [], countdownHandle: null, startAt: 0 };
const ffaQueue = new Set();

function isInMatch(p) { try { return p.hasTag("pvp:in_match"); } catch { return false; } }
function saveOrigin(p) { try { world.setDynamicProperty(`pvp:origin:${p.name}`, JSON.stringify({ x: p.location.x, y: p.location.y, z: p.location.z, dim: p.dimension.id })); } catch {} }
function restoreOrigin(p) {
  try {
    const raw = world.getDynamicProperty(`pvp:origin:${p.name}`);
    if (!raw) return;
    const data = JSON.parse(raw);
    const dim = world.getDimension(data.dim.split(":").pop());
    p.teleport({ x: data.x, y: data.y, z: data.z }, { dimension: dim });
    world.setDynamicProperty(`pvp:origin:${p.name}`, undefined);
  } catch {}
}

export async function showFfaMenu(player) {
  if (isInMatch(player)) { player.sendMessage(Lang.t(player, "pvp.ffa.already_in_match")); return; }
  const arenas = getPvpArenas();
  if (!arenas.length) { player.sendMessage(Lang.t(player, "pvp.err.no_arena")); return; }
  const form = new ActionFormData().simpleUi().title(Lang.t(player, "pvp.ffa.title")).body(Lang.t(player, "pvp.ffa.body", ffaQueue.size, FFA_MIN, FFA_MAX)).button(Lang.t(player, "pvp.ffa.btn.join"), "textures/items/diamond_sword").button(Lang.t(player, "pvp.ffa.btn.queue"), "textures/ui/FriendsIcon").button(Lang.t(player, "pvp.ffa.btn.leave"), "textures/ui/cancel");
  if (ffaState.active) form.button(Lang.t(player, "pvp.ffa.spectate", ffaState.players.length), "textures/ui/magnifyingGlass");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === 0) joinFfa(player);
  else if (res.selection === 1) showQueue(player);
  else if (res.selection === 2) leaveQueue(player);
  else if (res.selection === 3 && ffaState.active) spectateFfa(player);
}

async function joinFfa(player) {
  const arenas = getPvpArenas();
  if (!arenas.length) return;
  const arena = arenas[0];
  if (ffaState.active) { player.sendMessage(Lang.t(player, "pvp.ffa.active")); return; }
  if (ffaQueue.has(player.name)) { player.sendMessage(Lang.t(player, "pvp.ffa.already_queue")); return; }
  if (isInMatch(player)) { player.sendMessage(Lang.t(player, "pvp.err.in_match")); return; }
  ffaQueue.add(player.name);
  player.sendMessage(Lang.t(player, "pvp.ffa.joined", ffaQueue.size, FFA_MAX, FFA_MIN));
  for (const p of world.getPlayers()) try { p.sendMessage(Lang.t(p, "pvp.ffa.broadcast_join", player.name, ffaQueue.size, FFA_MAX)); } catch {}
  if (ffaQueue.size >= FFA_MIN) {
    if (ffaQueue.size === FFA_MIN) {
      for (const p of world.getPlayers()) try { p.sendMessage(Lang.t(p, "pvp.ffa.will_start", FFA_COUNTDOWN)); } catch {}
      startCountdown(arena);
    } else if (ffaQueue.size >= FFA_MAX) {
      startFfa(arena);
    }
  }
  showFfaMenu(player);
}

function leaveQueue(player) {
  if (!ffaQueue.has(player.name)) { player.sendMessage(Lang.t(player, "pvp.ffa.not_in_queue")); return; }
  ffaQueue.delete(player.name);
  player.sendMessage(Lang.t(player, "pvp.ffa.leaved"));
  showFfaMenu(player);
}

async function showQueue(player) {
  const list = [...ffaQueue];
  const body = list.length ? list.map((n, i) => `§f${i+1}. §a${n}`).join("\n") : Lang.t(player, "pvp.ffa.queue_empty");
  const f = new MessageFormData().title(Lang.t(player, "pvp.ffa.queue_title")).body(Lang.t(player, "pvp.ffa.queue_body", list.length, body)).button1(Lang.t(player, "common.back")).button2(Lang.t(player, "common.close"));
  const r = await f.show(player);
  if (r.selection === 0) showFfaMenu(player);
}

function startCountdown(arena) {
  if (ffaState.countdownHandle) return;
  let count = FFA_COUNTDOWN;
  ffaState.countdownHandle = system.runInterval(() => {
    if (count <= 0) {
      system.clearRun(ffaState.countdownHandle);
      ffaState.countdownHandle = null;
      startFfa(arena);
      return;
    }
    for (const p of world.getPlayers()) try { p.sendMessage(Lang.t(p, "pvp.ffa.countdown", count, ffaQueue.size)); } catch {}
    for (const name of ffaQueue) {
      const p = world.getPlayers().find(pl => pl.name === name);
      if (p?.isValid) try { p.onScreenDisplay.setTitle(`§c${count}`); p.runCommand(`playsound note.pling @s ~ ~ ~ 1 ${0.7 + (FFA_COUNTDOWN-count)*0.1}`); } catch {}
    }
    count--;
    if (ffaQueue.size < FFA_MIN) {
      system.clearRun(ffaState.countdownHandle);
      ffaState.countdownHandle = null;
      for (const p of world.getPlayers()) try { p.sendMessage(Lang.t(p, "pvp.ffa.cancelled")); } catch {}
    }
  }, 20);
}

function startFfa(arena) {
  if (ffaState.active) return;
  if (ffaQueue.size < 2) { for (const p of world.getPlayers()) try { p.sendMessage(Lang.t(p, "pvp.ffa.cancelled")); } catch {} return; }
  if (ffaState.countdownHandle) { system.clearRun(ffaState.countdownHandle); ffaState.countdownHandle = null; }
  const names = [...ffaQueue];
  ffaQueue.clear();
  const players = names.map(n => world.getPlayers().find(p => p.name === n)).filter(p => p?.isValid);
  if (players.length < 2) { for (const p of players) try { p.sendMessage(Lang.t(p, "pvp.ffa.cancelled")); } catch {} return; }
  ffaState = { active: true, arena, players: players.map(p => p.name), countdownHandle: null, startAt: Date.now() };
  for (const p of world.getPlayers()) try { p.sendMessage(Lang.t(p, "pvp.ffa.start", players.length, arena.name)); } catch {}
  const spawns = getArenaSpawns(arena, players.length, 12);
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const loc = spawns.spawns[i % spawns.spawns.length];
    saveOrigin(p);
    p.addTag("pvp:in_match");
    p.addTag("pvp:ffa");
    try { p.teleport({ x: loc.x, y: loc.y, z: loc.z }, { dimension: spawns.dimension }); p.runCommand("effect @s clear"); p.runCommand("gamemode survival"); p.onScreenDisplay.setTitle("§c§lFIGHT!"); p.runCommand("playsound random.levelup @s ~ ~ ~ 1 1"); snapToGround(p, spawns.dimension, loc.x, loc.z, loc.y); } catch {}
    p.sendMessage(Lang.t(p, "pvp.ffa.fight", players.length));
  }
  world.scoreboard.getObjective("pvp:ffa_wins") || (() => { try { world.scoreboard.addObjective("pvp:ffa_wins", "FFA Wins"); } catch {} })();
}

export function handleFfaDeath(deadPlayer) {
  try {
    if (!deadPlayer.hasTag("pvp:ffa")) return false;
    if (!ffaState.active) return false;
    deadPlayer.removeTag("pvp:in_match");
    deadPlayer.addTag("pvp:dead");
    ffaState.players = ffaState.players.filter(n => n !== deadPlayer.name);
    system.runTimeout(() => {
      try { deadPlayer.runCommand("gamemode spectator"); } catch {}
      deadPlayer.sendMessage(Lang.t(deadPlayer, "pvp.ffa.dead"));
    }, 20);
    const alive = world.getPlayers().filter(p => p.hasTag("pvp:ffa") && !p.hasTag("pvp:dead") && p.isValid);
    for (const p of world.getPlayers()) try { p.sendMessage(Lang.t(p, "pvp.ffa.eliminated", deadPlayer.name, alive.length)); } catch {}
    if (alive.length <= 1) {
      if (alive.length === 1) {
        const winner = alive[0];
        winner.sendMessage(Lang.t(winner, "pvp.ffa.win"));
        for (const p of world.getPlayers()) try { p.sendMessage(Lang.t(p, "pvp.ffa.broadcast_win", winner.name, ffaState.players.length + 1)); } catch {}
        try { world.scoreboard.getObjective("pvp:ffa_wins")?.addScore(winner, 1); } catch {}
        try { winner.runCommand("playsound random.levelup @s ~ ~ ~ 1 1.5"); } catch {}
      } else {
        for (const p of world.getPlayers()) try { p.sendMessage(Lang.t(p, "pvp.ffa.no_winner")); } catch {}
      }
      cleanupFfa();
    }
    return true;
  } catch { return false; }
}

function cleanupFfa() {
  const allFfa = world.getPlayers().filter(p => p.hasTag("pvp:ffa"));
  for (const p of allFfa) {
    for (const t of p.getTags()) if (t.startsWith("pvp:")) try { p.removeTag(t); } catch {}
    try { p.runCommand("gamemode survival"); } catch {}
    system.runTimeout(() => restoreOrigin(p), 60);
  }
  ffaState = { active: false, arena: null, players: [], countdownHandle: null, startAt: 0 };
}

function spectateFfa(player) {
  if (!ffaState.active) { player.sendMessage(Lang.t(player, "pvp.ffa.no_war")); return; }
  const arena = ffaState.arena;
  try {
    const center = getArenaSpawns(arena, 1, 0);
    player.teleport({ x: center.spawns[0].x, y: center.spawns[0].y + 20, z: center.spawns[0].z }, { dimension: center.dimension });
    player.runCommand("gamemode spectator");
    player.sendMessage(Lang.t(player, "pvp.ffa.spectate_msg"));
  } catch {}
}

export function cleanupFfaOnLeave(playerName) {
  ffaQueue.delete(playerName);
  if (ffaState.active && ffaState.players.includes(playerName)) {
    ffaState.players = ffaState.players.filter(n => n !== playerName);
    const alive = world.getPlayers().filter(p => p.hasTag("pvp:ffa") && !p.hasTag("pvp:dead") && p.isValid);
    if (alive.length <= 1) {
      if (alive.length === 1) {
        const winner = alive[0];
        for (const p of world.getPlayers()) try { p.sendMessage(Lang.t(p, "pvp.ffa.leave_win", winner.name)); } catch {}
        try { world.scoreboard.getObjective("pvp:ffa_wins")?.addScore(winner, 1); } catch {}
      }
      cleanupFfa();
    }
  }
}

export function isFfaActive() { return ffaState.active; }
