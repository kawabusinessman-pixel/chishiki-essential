import { world, system, ActionFormData, MessageFormData } from "../../core.js";
import { getPvpArenas, teleportToArena, restoreOrigin } from "./pvp_utils.js";
import { Lang } from "../../lib/Lang.js";

const INVITE_TTL = 30000;
const COUNTDOWN = 5;
const pendingInvites = new Map();

function isInMatch(player) {
  try { return player.hasTag("pvp:in_match"); } catch { return false; }
}

function broadcastForLang(key, ...args) {
  for (const p of world.getPlayers()) {
    try { p.sendMessage(Lang.t(p, key, ...args)); } catch {}
  }
}
function broadcastRaw(prefix, msgKey, ...args) {
  for (const p of world.getPlayers()) {
    try { p.sendMessage(`${prefix} ${Lang.t(p, msgKey, ...args)}`); } catch { p.sendMessage(`${prefix} ${msgKey}`); }
  }
}

export async function showDuelMenu(player) {
  if (isInMatch(player)) {
    player.sendMessage(Lang.t(player, "pvp.err.in_match"));
    return;
  }
  const arenas = getPvpArenas();
  if (!arenas.length) {
    player.sendMessage(Lang.t(player, "pvp.err.no_arena"));
    return;
  }
  const online = world.getPlayers().filter(p => p.name !== player.name && !isInMatch(p) && p.isValid);
  if (!online.length) {
    player.sendMessage(Lang.t(player, "pvp.err.no_player"));
    return;
  }
  const arenaForm = new ActionFormData().simpleUi().title(Lang.t(player, "pvp.1vs1.title")).body(Lang.t(player, "pvp.1vs1.select_arena"));
  for (const a of arenas) arenaForm.button(`${a.name}\n§7${a.pos1.x},${a.pos1.z} - ${a.pos2.x},${a.pos2.z}`, "textures/items/diamond_sword");
  arenaForm.button(Lang.t(player, "common.back"), "textures/ui/cancel");
  const arenaRes = await arenaForm.show(player);
  if (arenaRes.canceled || arenaRes.selection >= arenas.length) return;
  const arena = arenas[arenaRes.selection];

  const pickForm = new ActionFormData().simpleUi().title(Lang.t(player, "pvp.1vs1.title")).body(Lang.t(player, "pvp.1vs1.select_opponent", arena.name));
  for (const p of online) pickForm.button(`${p.name}\n§7Click to invite`, "textures/ui/FriendsIcon");
  pickForm.button(Lang.t(player, "common.back"), "textures/ui/cancel");
  const res = await pickForm.show(player);
  if (res.canceled || res.selection >= online.length) return;
  const target = online[res.selection];
  if (!target?.isValid) { player.sendMessage(Lang.t(player, "pvp.err.offline")); return; }
  if (pendingInvites.has(target.name)) { player.sendMessage(Lang.t(player, "pvp.err.pending")); return; }
  const inviteId = `duel_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const invite = { id: inviteId, from: player.name, to: target.name, arenaId: arena.id, expires: Date.now() + INVITE_TTL, type: "duel" };
  pendingInvites.set(target.name, invite);
  try { world.setDynamicProperty(`pvp:invite:${target.name}`, JSON.stringify(invite)); } catch {}
  player.sendMessage(Lang.t(player, "pvp.1vs1.invite_sent", target.name, arena.name));
  try { target.sendMessage(Lang.t(target, "pvp.1vs1.invite_received", player.name, arena.name)); } catch {}
  system.runTimeout(() => {
    if (pendingInvites.get(target.name)?.id === inviteId) {
      pendingInvites.delete(target.name);
      try { world.setDynamicProperty(`pvp:invite:${target.name}`, undefined); } catch {}
      try { player.sendMessage(Lang.t(player, "pvp.1vs1.expired", target.name)); } catch {}
      try { target.sendMessage(Lang.t(target, "pvp.1vs1.expired2")); } catch {}
    }
  }, INVITE_TTL / 50);
  showInviteToTarget(target, invite, arena);
}

async function showInviteToTarget(target, invite, arena) {
  if (!target?.isValid) return;
  const fromPlayer = world.getPlayers().find(p => p.name === invite.from);
  if (!fromPlayer) { pendingInvites.delete(target.name); return; }
  const form = new MessageFormData().title(Lang.t(target, "pvp.invite.title")).body(Lang.t(target, "pvp.invite.body", invite.from, arena.name, arena.pos1.x, arena.pos1.z, arena.pos2.x, arena.pos2.z)).button1(Lang.t(target, "pvp.btn.accept")).button2(Lang.t(target, "pvp.btn.decline"));
  const res = await form.show(target);
  if (res.canceled || res.selection === 1) {
    pendingInvites.delete(target.name);
    try { world.setDynamicProperty(`pvp:invite:${target.name}`, undefined); } catch {}
    try { target.sendMessage(Lang.t(target, "pvp.msg.declined_you")); } catch {}
    try { fromPlayer.sendMessage(Lang.t(fromPlayer, "pvp.msg.declined_them", target.name)); } catch {}
    return;
  }
  if (pendingInvites.get(target.name)?.id !== invite.id) { target.sendMessage(Lang.t(target, "pvp.1vs1.expired2")); return; }
  pendingInvites.delete(target.name);
  try { world.setDynamicProperty(`pvp:invite:${target.name}`, undefined); } catch {}
  if (isInMatch(target) || isInMatch(fromPlayer)) {
    target.sendMessage(Lang.t(target, "pvp.err.in_match_other"));
    fromPlayer.sendMessage(Lang.t(fromPlayer, "pvp.err.in_match_other"));
    return;
  }
  startDuel(fromPlayer, target, arena);
}

async function startDuel(p1, p2, arena) {
  if (!p1?.isValid || !p2?.isValid) return;
  const players = [p1, p2];
  for (const p of players) { p.addTag("pvp:in_match"); p.addTag("pvp:duel"); }
  p1.sendMessage(Lang.t(p1, "pvp.duel.start", p2.name, arena.name));
  p2.sendMessage(Lang.t(p2, "pvp.duel.start", p1.name, arena.name));
  for (const p of world.getPlayers()) {
    try { p.sendMessage(Lang.t(p, "pvp.duel.broadcast_start", p1.name, p2.name, arena.name)); } catch {}
  }
  teleportToArena(p1, arena, -6);
  teleportToArena(p2, arena, 6);
  for (const p of players) { try { p.runCommand("effect @s clear"); p.addEffect("resistance", 100, { amplifier: 5, showParticles: false }); } catch {} }
  let count = COUNTDOWN;
  const countdown = system.runInterval(() => {
    if (!players.every(p => p.isValid && p.hasTag("pvp:in_match"))) { system.clearRun(countdown); return; }
    for (const p of players) { try { p.onScreenDisplay.setTitle(`§c${count}`); p.runCommand(`playsound note.pling @s ~ ~ ~ 1 ${0.8 + (5-count)*0.1}`); } catch {} }
    count--;
    if (count < 0) {
      system.clearRun(countdown);
      for (const p of players) {
        try { p.onScreenDisplay.setTitle("§a§lFIGHT!"); p.runCommand("effect @s clear"); p.runCommand("playsound random.levelup @s ~ ~ ~ 1 1"); } catch {}
      }
    }
  }, 20);

  world.scoreboard.getObjective("pvp:wins") || (() => { try { world.scoreboard.addObjective("pvp:wins", "PVP Wins"); } catch {} })();
  world.scoreboard.getObjective("pvp:losses") || (() => { try { world.scoreboard.addObjective("pvp:losses", "PVP Losses"); } catch {} })();
}

export function handleDuelDeath(deadPlayer, killer) {
  try {
    if (!deadPlayer.hasTag("pvp:duel")) return false;
    const wasInDuel = deadPlayer.hasTag("pvp:in_match");
    if (!wasInDuel) return false;
    const killerPlayer = killer?.typeId === "minecraft:player" ? killer : null;
    let winner = killerPlayer && killerPlayer.isValid && killerPlayer.name !== deadPlayer.name ? killerPlayer : null;
    if (!winner) {
      const others = world.getPlayers().filter(p => p.hasTag("pvp:duel") && p.name !== deadPlayer.name && p.isValid);
      if (others.length === 1) winner = others[0];
    }
    const allDuelists = world.getPlayers().filter(p => p.hasTag("pvp:duel"));
    for (const p of allDuelists) {
      try { p.removeTag("pvp:in_match"); p.removeTag("pvp:duel"); } catch {}
      system.runTimeout(() => restoreOrigin(p), 60);
    }
    try { deadPlayer.removeTag("pvp:in_match"); deadPlayer.removeTag("pvp:duel"); } catch {}
    system.runTimeout(() => restoreOrigin(deadPlayer), 60);

    if (winner) {
      winner.sendMessage(Lang.t(winner, "pvp.duel.win", deadPlayer.name));
      deadPlayer.sendMessage(Lang.t(deadPlayer, "pvp.duel.lose", winner.name));
      for (const p of world.getPlayers()) {
        try { p.sendMessage(`§e🏆 ${Lang.t(p, "pvp.broadcast.duel_win", winner.name, deadPlayer.name)}`); } catch {}
      }
      try { world.scoreboard.getObjective("pvp:wins")?.addScore(winner, 1); } catch {}
      try { world.scoreboard.getObjective("pvp:losses")?.addScore(deadPlayer, 1); } catch {}
      try { winner.runCommand("playsound random.levelup @s ~ ~ ~ 1 1"); } catch {}
    } else {
      for (const p of world.getPlayers()) {
        try { p.sendMessage(`§7⚔ ${Lang.t(p, "pvp.ffa.eliminated", deadPlayer.name, "0")}`); } catch { p.sendMessage(`§7⚔ Duel: ${deadPlayer.name} gugur.`); }
      }
    }
    return true;
  } catch { return false; }
}

export function cleanupDuelOnLeave(playerName) {
  pendingInvites.delete(playerName);
  try { world.setDynamicProperty(`pvp:invite:${playerName}`, undefined); } catch {}
}
