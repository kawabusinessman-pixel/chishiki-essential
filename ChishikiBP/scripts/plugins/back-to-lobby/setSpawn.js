import { world, ActionFormData, MessageFormData } from '../../core.js';
import { ScoreboardDB } from '../../board/data.js';
import { showMainMenu } from '../../kiwora.js';
import { Lang } from '../../lib/Lang.js';
import { GlobalConfig } from '../../function/GlobalConfig.js';
import { isTeleportBlockedByAntiFly } from '../../admin_menu/lobby_protect/utils.js';
const SPAWN_HISTORY_KEY = 'spawnHistory';
const LOBBY_ENABLED_KEY = 'lobbyEnabled';
const LOBBY_POS_KEY = 'lobbySpawn';
const OFFSET_MS = parseInt(ScoreboardDB.get('ScoreboardDBConfig-offset-timezone') ?? '+7') * 3600000;
function formatDate(date) {
 return date.toLocaleString('id-ID', {
 day: '2-digit',
 month: '2-digit',
 year: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 hour12: false
 });
}
function getHistory() {
 const saved = GlobalConfig.get(SPAWN_HISTORY_KEY);
 if (!saved) return [];
 try {
 return typeof saved === "string" ? JSON.parse(saved) : saved;
 } catch {
 return [];
 }
}
function saveHistory(history) {
 GlobalConfig.set(SPAWN_HISTORY_KEY, history);
}
world.afterEvents.playerSpawn.subscribe(({ player }) => {
 const lobbyEnabled = ScoreboardDB.get(LOBBY_ENABLED_KEY) === true;
 const lobbySpawn = ScoreboardDB.get(LOBBY_POS_KEY);
 if (lobbyEnabled && lobbySpawn && typeof lobbySpawn.x === 'number') {
 try {
  if (isTeleportBlockedByAntiFly(
   player,
   { x: lobbySpawn.x, y: lobbySpawn.y, z: lobbySpawn.z },
   'minecraft:overworld'
  )) {
  player.sendMessage('§cMatikan fly dulu sebelum masuk lobby!');
  return;
  }
  const dim = player.dimension.id.replace('minecraft:', '');
  if (dim !== 'overworld') {
  player.teleport(
   { x: lobbySpawn.x + 0.5, y: lobbySpawn.y, z: lobbySpawn.z + 0.5 },
   { dimension: world.getDimension('overworld') }
  );
  } else {
  player.teleport({ x: lobbySpawn.x + 0.5, y: lobbySpawn.y, z: lobbySpawn.z + 0.5 });
  }
 } catch { }
 }
});
export function showSpawnMenu(source) {
 const currentX = Math.floor(source.location.x);
 const currentY = Math.floor(source.location.y);
 const currentZ = Math.floor(source.location.z);
 const lobbyEnabled = ScoreboardDB.get(LOBBY_ENABLED_KEY) === true;
 function showHistory() {
 const history = getHistory();
 const body = history.length
 ? history.map((s, i) =>
 Lang.t(source, "spawn.history.item",
 i + 1, s.x, s.y, s.z,
 i === history.length - 1 ? Lang.t(source, "spawn.history.current") : '',
 s.timestamp
 )
 ).join('\n\n')
 : Lang.t(source, "spawn.history.empty");
 new MessageFormData()
 .title(Lang.t(source, "spawn.history.title"))
 .body(body)
 .button1(Lang.t(source, "spawn.history.btn.back"))
 .button2(Lang.t(source, "spawn.history.btn.close"))
 .show(source)
 .then(res => { if (res.selection === 0) showSpawnMenu(source) });
 }
 function toggleLobby() {
 const newStatus = !lobbyEnabled;
 ScoreboardDB.set(LOBBY_ENABLED_KEY, newStatus);
 if (newStatus) {
 ScoreboardDB.set(LOBBY_POS_KEY, { x: currentX, y: currentY, z: currentZ });
 }
 const statusText = newStatus ? Lang.t(source, "common.enabled") : Lang.t(source, "common.disabled");
 source.sendMessage(Lang.t(source, "spawn.msg.lobby_status", statusText));
 showSpawnMenu(source);
 }
 const lobbyStatus = lobbyEnabled ? Lang.t(source, "common.on") : Lang.t(source, "common.off");
 new ActionFormData()
 .title(Lang.t(source, "spawn.title"))
 .body(Lang.t(source, "spawn.body", currentX, currentY, currentZ, lobbyStatus))
 .button(Lang.t(source, "spawn.btn.set"), 'textures/items/compass_item')
 .button(Lang.t(source, "spawn.btn.history"), 'textures/items/book_writable')
 .button(lobbyEnabled ? Lang.t(source, "spawn.btn.lobby_off") : Lang.t(source, "spawn.btn.lobby_on"), lobbyEnabled ? 'textures/ui/cancel' : 'textures/ui/check')
 .button(Lang.t(source, "spawn.btn.back"), 'textures/ui/arrow_left')
 .show(source)
 .then(res => {
 if (res.canceled) return;
 if (res.selection === 0) {
 try {
 source.runCommand(`setworldspawn ${currentX} ${currentY} ${currentZ}`);
 const now = new Date(Date.now() + OFFSET_MS);
 const history = getHistory();
 history.push({
 x: currentX,
 y: currentY,
 z: currentZ,
 timestamp: formatDate(now)
 });
 saveHistory(history);
 source.sendMessage(Lang.t(source, "spawn.msg.set_success", currentX, currentY, currentZ));
 } catch (error) {
 source.sendMessage(Lang.t(source, "spawn.msg.set_failed", error.message));
 }
 } else if (res.selection === 1) {
 showHistory();
 } else if (res.selection === 2) {
 toggleLobby();
 } else if (res.selection === 3) {
 showMainMenu(source);
 }
 });
}