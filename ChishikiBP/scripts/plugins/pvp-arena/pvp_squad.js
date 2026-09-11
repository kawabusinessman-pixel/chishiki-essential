import { world, system, ActionFormData, MessageFormData, ModalFormData } from "../../core.js";
import { getPvpArenas, saveOrigin, restoreOrigin, getArenaSpawns, snapToGround } from "./pvp_utils.js";
import { clanDB } from "../../function/getClan.js";
import { Lang } from "../../lib/Lang.js";

const SQUAD_INVITE_TTL = 45000;
const pendingSquadInvites = new Map();

function getPlayerClan(playerName) {
  try { return clanDB.get(`player_${playerName}`)?.clanId || null; } catch { return null; }
}
function getClanMembers(clanId) {
  try { return clanDB.get(`clan_${clanId}`)?.members || []; } catch { return []; }
}
function getClanName(clanId) {
  try { return clanDB.get(`clan_${clanId}`)?.name || clanId; } catch { return clanId; }
}
function isInMatch(p) { try { return p.hasTag("pvp:in_match"); } catch { return false; } }

export async function showSquadMenu(player) {
  if (isInMatch(player)) { player.sendMessage(Lang.t(player, "pvp.err.in_match")); return; }
  const myClanId = getPlayerClan(player.name);
  if (!myClanId) { player.sendMessage(Lang.t(player, "pvp.err.no_clan")); return; }
  const myClanMembers = getClanMembers(myClanId);
  const arenas = getPvpArenas();
  if (!arenas.length) { player.sendMessage(Lang.t(player, "pvp.err.no_arena")); return; }

  const arenaForm = new ActionFormData().simpleUi().title(Lang.t(player, "pvp.squad.title")).body(Lang.t(player, "pvp.squad.select_arena", getClanName(myClanId), myClanMembers.length));
  for (const a of arenas) arenaForm.button(`${a.name}\n§7${a.pos1.x},${a.pos1.z} → ${a.pos2.x},${a.pos2.z}`, "textures/items/diamond_sword");
  arenaForm.button(Lang.t(player, "common.back"), "textures/ui/cancel");
  const arenaRes = await arenaForm.show(player);
  if (arenaRes.canceled || arenaRes.selection >= arenas.length) return;
  const arena = arenas[arenaRes.selection];

  const onlineClanMates = world.getPlayers().filter(p => p.name !== player.name && myClanMembers.includes(p.name) && !isInMatch(p) && p.isValid);
  let selectedTeam = [player.name];
  if (onlineClanMates.length > 0) {
    const teamForm = new ModalFormData().title(Lang.t(player, "pvp.squad.pick_team"));
    for (const m of onlineClanMates) teamForm.toggle(`${m.name} §7(${isInMatch(m) ? Lang.t(player, "common.online") : Lang.t(player, "common.offline")})`, { defaultValue: false });
    teamForm.toggle(Lang.t(player, "pvp.squad.invite_all"), { defaultValue: false });
    const tRes = await teamForm.show(player);
    if (tRes.canceled) return;
    const toggles = tRes.formValues.slice(0, onlineClanMates.length);
    const inviteAll = tRes.formValues[onlineClanMates.length];
    if (inviteAll) selectedTeam = [player.name, ...onlineClanMates.map(p => p.name)];
    else {
      for (let i = 0; i < toggles.length; i++) if (toggles[i]) selectedTeam.push(onlineClanMates[i].name);
    }
    if (selectedTeam.length < 1) selectedTeam = [player.name];
    if (selectedTeam.length > 8) { player.sendMessage(Lang.t(player, "pvp.err.max_squad")); return; }
  }

  const allClans = [];
  for (const key of clanDB.keys()) {
    if (key.startsWith("clan_") && !key.endsWith("_settings")) {
      const clanId = key.slice(5);
      if (clanId === myClanId) continue;
      const clan = clanDB.get(key);
      if (!clan?.members) continue;
      const online = clan.members.filter(n => world.getPlayers().some(p => p.name === n));
      allClans.push({ clanId, name: clan.name || clanId, members: clan.members, online });
    }
  }
  if (!allClans.length) { player.sendMessage(Lang.t(player, "pvp.err.no_rival_clan")); return; }
  const clanPick = new ActionFormData().simpleUi().title(Lang.t(player, "pvp.squad.select_rival", selectedTeam.join(", "))).body(Lang.t(player, "pvp.squad.select_rival", selectedTeam.join(", ")));
  for (const c of allClans) clanPick.button(`${c.name}\n§7Members: ${c.members.length} | Online: ${c.online.length}`, "textures/ui/icon_multiplayer");
  clanPick.button(Lang.t(player, "common.back"), "textures/ui/cancel");
  const clanRes = await clanPick.show(player);
  if (clanRes.canceled || clanRes.selection >= allClans.length) return;
  const rival = allClans[clanRes.selection];
  const rivalOnline = world.getPlayers().filter(p => rival.members.includes(p.name) && !isInMatch(p) && p.isValid);
  if (!rivalOnline.length) { player.sendMessage(Lang.t(player, "pvp.err.rival_offline", rival.name)); return; }

  const inviteId = `squad_${Date.now()}`;
  const invite = { id: inviteId, from: player.name, fromClan: myClanId, fromTeam: selectedTeam, toClan: rival.clanId, arenaId: arena.id, expires: Date.now() + SQUAD_INVITE_TTL };
  for (const p of rivalOnline) pendingSquadInvites.set(p.name, invite);
  const rivalLeader = rivalOnline.find(p => clanDB.get(`player_${p.name}`)?.rank === "owner") || rivalOnline[0];
  player.sendMessage(Lang.t(player, "pvp.squad.challenge_sent", rival.name, rivalLeader.name, selectedTeam.join(", ")));
  for (const p of rivalOnline) try { p.sendMessage(Lang.t(p, "pvp.squad.challenge_received", player.name, getClanName(myClanId), rival.name, arena.name)); } catch {}
  showSquadInviteToRival(rivalLeader, invite, arena, rival);
  system.runTimeout(() => {
    for (const p of rivalOnline) if (pendingSquadInvites.get(p.name)?.id === inviteId) pendingSquadInvites.delete(p.name);
  }, SQUAD_INVITE_TTL / 50);
}

async function showSquadInviteToRival(leader, invite, arena, rival) {
  if (!leader?.isValid) return;
  const rivalMembersOnline = world.getPlayers().filter(p => rival.members.includes(p.name) && !isInMatch(p) && p.isValid);
  const form = new MessageFormData().title(Lang.t(leader, "pvp.squad.invite.title")).body(Lang.t(leader, "pvp.squad.invite.body", invite.from, getClanName(invite.fromClan), arena.name, invite.fromTeam.join(", "), invite.fromTeam.length)).button1(Lang.t(leader, "pvp.btn.accept")).button2(Lang.t(leader, "pvp.btn.decline"));
  const res = await form.show(leader);
  if (res.canceled || res.selection === 1) {
    for (const p of rivalMembersOnline) pendingSquadInvites.delete(p.name);
    try { world.getPlayers().find(p => p.name === invite.from)?.sendMessage(Lang.t(world.getPlayers().find(p => p.name === invite.from), "pvp.squad.declined", rival.name)); } catch {}
    for (const p of rivalMembersOnline) try { p.sendMessage(Lang.t(p, "pvp.squad.you_declined")); } catch {}
    return;
  }
  let rivalTeam = rivalMembersOnline.map(p => p.name);
  if (rivalTeam.length > 8) rivalTeam = rivalTeam.slice(0, 8);
  const myTeamPlayers = invite.fromTeam.map(n => world.getPlayers().find(p => p.name === n)).filter(p => p?.isValid && !isInMatch(p));
  const rivalTeamPlayers = rivalTeam.map(n => world.getPlayers().find(p => p.name === n)).filter(p => p?.isValid && !isInMatch(p));
  if (myTeamPlayers.length === 0 || rivalTeamPlayers.length === 0) {
    leader.sendMessage(Lang.t(leader, "pvp.squad.invalid"));
    return;
  }
  for (const p of rivalMembersOnline) pendingSquadInvites.delete(p.name);
  startSquadWar(myTeamPlayers, rivalTeamPlayers, arena, invite.fromClan, rival.clanId);
}

async function startSquadWar(teamA, teamB, arena, clanA, clanB) {
  const all = [...teamA, ...teamB];
  for (const p of all) { p.addTag("pvp:in_match"); p.addTag("pvp:squad"); p.addTag(`pvp:team:${teamA.includes(p) ? clanA : clanB}`); }
  for (const p of world.getPlayers()) {
    try { p.sendMessage(`§c⚔ ${Lang.t(p, "pvp.squad.start", getClanName(clanA), teamA.length, getClanName(clanB), teamB.length, arena.name)}`); } catch {}
  }
  const spawnsA = getArenaSpawns(arena, teamA.length, 6);
  const spawnsB = getArenaSpawns(arena, teamB.length, 6);
  for (let i = 0; i < teamA.length; i++) {
    const p = teamA[i];
    const loc = spawnsA.spawns[i % spawnsA.spawns.length];
    try { saveOrigin(p); p.teleport({ x: loc.x, y: loc.y, z: loc.z + 10 }, { dimension: spawnsA.dimension }); p.runCommand("effect @s clear"); snapToGround(p, spawnsA.dimension, loc.x, loc.z + 10, loc.y); } catch {}
  }
  for (let i = 0; i < teamB.length; i++) {
    const p = teamB[i];
    const loc = spawnsB.spawns[i % spawnsB.spawns.length];
    try { saveOrigin(p); p.teleport({ x: loc.x, y: loc.y, z: loc.z - 10 }, { dimension: spawnsB.dimension }); p.runCommand("effect @s clear"); snapToGround(p, spawnsB.dimension, loc.x, loc.z - 10, loc.y); } catch {}
  }
  let count = 5;
  const cd = system.runInterval(() => {
    for (const p of all) if (p.isValid) try { p.onScreenDisplay.setTitle(`§c${count}`); } catch {}
    count--;
    if (count < 0) {
      system.clearRun(cd);
      for (const p of all) if (p.isValid) try { p.onScreenDisplay.setTitle("§aFIGHT!"); p.runCommand("playsound random.levelup @s ~ ~ ~ 1 1"); } catch {}
    }
  }, 20);
  system.runTimeout(() => checkSquadWin(clanA, clanB), 100);
}

function getAliveTeam(clanId) {
  return world.getPlayers().filter(p => p.isValid && p.hasTag("pvp:squad") && p.hasTag(`pvp:team:${clanId}`) && !p.hasTag("pvp:dead"));
}

export function handleSquadDeath(deadPlayer) {
  try {
    if (!deadPlayer.hasTag("pvp:squad")) return false;
    deadPlayer.addTag("pvp:dead");
    deadPlayer.removeTag("pvp:in_match");
    const tags = deadPlayer.getTags().find(t => t.startsWith("pvp:team:"));
    const clanId = tags?.replace("pvp:team:", "");
    system.runTimeout(() => {
      try { deadPlayer.runCommand("gamemode spectator"); } catch {}
      deadPlayer.sendMessage(Lang.t(deadPlayer, "pvp.squad.dead"));
    }, 20);
    system.runTimeout(() => checkSquadWinForDead(clanId), 40);
    return true;
  } catch { return false; }
}

function checkSquadWinForDead(deadClan) {
  const allSquad = world.getPlayers().filter(p => p.hasTag("pvp:squad"));
  if (!allSquad.length) { cleanupAllSquad(); return; }
  const clans = new Set();
  for (const p of allSquad) {
    const t = p.getTags().find(x => x.startsWith("pvp:team:"));
    if (t) clans.add(t.replace("pvp:team:", ""));
  }
  for (const clan of clans) {
    const alive = allSquad.filter(p => p.hasTag(`pvp:team:${clan}`) && !p.hasTag("pvp:dead") && p.isValid);
    const dead = allSquad.filter(p => p.hasTag(`pvp:team:${clan}`));
    if (alive.length === 0 && dead.length > 0) {
      const winnerClan = [...clans].find(c => c !== clan);
      if (winnerClan) {
        const winners = world.getPlayers().filter(p => p.hasTag(`pvp:team:${winnerClan}`));
        const losers = world.getPlayers().filter(p => p.hasTag(`pvp:team:${clan}`));
        for (const w of winners) try { w.sendMessage(Lang.t(w, "pvp.squad.win", getClanName(winnerClan), getClanName(clan))); } catch {}
        for (const l of losers) try { l.sendMessage(Lang.t(l, "pvp.squad.lose", getClanName(clan))); } catch {}
        for (const p of world.getPlayers()) try { p.sendMessage(`§b🏆 ${Lang.t(p, "pvp.squad.win", getClanName(winnerClan), getClanName(clan))}`); } catch {}
        system.runTimeout(() => cleanupAllSquad(), 100);
        return;
      }
    }
  }
}

function checkSquadWin(clanA, clanB) {
  const aAlive = world.getPlayers().filter(p => p.hasTag("pvp:squad") && p.hasTag(`pvp:team:${clanA}`) && p.isValid && !p.hasTag("pvp:dead")).length;
  const bAlive = world.getPlayers().filter(p => p.hasTag("pvp:squad") && p.hasTag(`pvp:team:${clanB}`) && p.isValid && !p.hasTag("pvp:dead")).length;
  if (aAlive === 0 || bAlive === 0) checkSquadWinForDead(aAlive === 0 ? clanA : clanB);
}

function cleanupAllSquad() {
  for (const p of world.getPlayers()) {
    if (p.hasTag("pvp:squad")) {
      for (const t of p.getTags()) if (t.startsWith("pvp:")) try { p.removeTag(t); } catch {}
      try { p.runCommand("gamemode survival"); } catch {}
      system.runTimeout(() => restoreOrigin(p), 60);
    }
  }
}

export function cleanupSquadOnLeave(playerName) {
  for (const [k, v] of pendingSquadInvites.entries()) if (k === playerName || v.from === playerName) pendingSquadInvites.delete(k);
}
