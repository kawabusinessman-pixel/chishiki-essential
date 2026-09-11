import { serializePlayerInventory, preparePlayerInventoryRestore, applyPreparedInventoryRestore, purgePlayerInventory, releaseSerializedInventoryBackups, releaseUnavailableSerializedInventoryBackups } from "./inventory_utils.js";
const S_KEY = "lobby_protect:saved_inventory";
const L_KEY = "lobby_protect:lobby_inventory";
const TX_KEY = "lobby_protect:inventory_transaction";
const TX_DEACTIVATING = "deactivating";
const TX_SURVIVAL_RESTORED = "survival_restored";
const CORRUPT_LOBBY_ARCHIVE_KEY = "lobby_protect:corrupt_lobby_inventory";
const CORRUPT_LOBBY_RECOVERY_PLAYER = "KiworaID OFC";
const recoveryFailures = new Map();
const parseInventoryData = raw => {
 const parsed = JSON.parse(raw);
 if (!Array.isArray(parsed)) throw new Error("Inventory backup is not an array");
 return parsed;
};
const saveInventoryData = (player, key, items) => {
 const raw = JSON.stringify(items);
 player.setDynamicProperty(key, raw);
 if (player.getDynamicProperty(key) !== raw) throw new Error(`Failed to verify ${key}`);
 return raw;
};
const clearInventoryData = (player, key) => {
 player.setDynamicProperty(key, undefined);
 if (player.getDynamicProperty(key) !== undefined) throw new Error(`Failed to clear ${key}`);
};
const archiveCorruptLobbySnapshot = (player, raw, items) => {
 if (player?.name !== CORRUPT_LOBBY_RECOVERY_PLAYER) return false;
 if (player.getDynamicProperty(CORRUPT_LOBBY_ARCHIVE_KEY) === undefined) {
  player.setDynamicProperty(CORRUPT_LOBBY_ARCHIVE_KEY, raw);
  if (player.getDynamicProperty(CORRUPT_LOBBY_ARCHIVE_KEY) !== raw) throw new Error("Failed to archive corrupt lobby inventory");
 }
 releaseUnavailableSerializedInventoryBackups(items);
 clearInventoryData(player, L_KEY);
 return true;
};
const recoveryKey = player => player?.id ?? player?.name;

export function clearLobbyRecoveryFailure(playerOrId) {
 const key = typeof playerOrId === "string" ? playerOrId : recoveryKey(playerOrId);
 if (key) recoveryFailures.delete(key);
}

const reportRecoveryFailure = (player, context, error) => {
 const key = recoveryKey(player);
 const signature = `${context}:${error}`;
 if (key && recoveryFailures.get(key) === signature) return;
 if (key) recoveryFailures.set(key, signature);
 console.warn(`[Lobby Inventory] ${context} untuk ${player?.name || player?.id || "unknown"}: ${error}`);
 const reason = String(error || "");
 const message = reason.includes("Unregistered shulker")
 ? "§eShulker belum terdaftar. Letakkan lalu hancurkan shulker sekali sebelum masuk lobby; inventory tidak diubah."
 : "§cInventory tidak dipindahkan karena backup gagal diverifikasi. Data lama tetap disimpan.";
 try { player.sendMessage(message); } catch { }
};
export function activateLobbyMode(p) {
 let survivalData;
 let preparedSurvival;
 let lobbyData = [];
 let preparedLobby;
 let survivalSnapshotSaved = false;
 let transitionStarted = false;
 try {
  if (p.dimension.id === "minecraft:the_end") return false;
  const transaction = p.getDynamicProperty(TX_KEY);
  if (transaction && p.getDynamicProperty(S_KEY)) {
   if (!deactivateLobbyMode(p)) return false;
  } else if (transaction) {
   clearInventoryData(p, TX_KEY);
  }
  if (p.getDynamicProperty(S_KEY)) {
   clearLobbyRecoveryFailure(p);
   return true;
  }
  let lobbyDataStr = p.getDynamicProperty(L_KEY);
  if (lobbyDataStr) {
   lobbyData = parseInventoryData(lobbyDataStr);
  }
  try {
   preparedLobby = preparePlayerInventoryRestore(p, lobbyData);
  } catch (error) {
   if (!archiveCorruptLobbySnapshot(p, lobbyDataStr, lobbyData)) throw error;
   lobbyData = [];
   lobbyDataStr = undefined;
   preparedLobby = preparePlayerInventoryRestore(p, lobbyData);
  }
  survivalData = serializePlayerInventory(p);
  preparedSurvival = preparePlayerInventoryRestore(p, survivalData);
  saveInventoryData(p, S_KEY, survivalData);
  survivalSnapshotSaved = true;
  transitionStarted = true;
  if (!purgePlayerInventory(p)) throw new Error("Failed to clear survival inventory");
  if (!applyPreparedInventoryRestore(p, preparedLobby, false)) throw new Error("Failed to restore lobby inventory");
  if (lobbyDataStr) {
   clearInventoryData(p, L_KEY);
   releaseSerializedInventoryBackups(lobbyData);
  }
  clearLobbyRecoveryFailure(p);
  return true;
 } catch (error) {
  if (transitionStarted && preparedSurvival) {
   const cleared = purgePlayerInventory(p);
   if (cleared && applyPreparedInventoryRestore(p, preparedSurvival, false)) {
    try {
     clearInventoryData(p, S_KEY);
     releaseSerializedInventoryBackups(survivalData);
    } catch { }
   } else {
    console.warn(`[Lobby Inventory] Rollback survival inventory gagal untuk ${p?.name || p?.id || "unknown"}; snapshot S/L dipertahankan.`);
   }
  } else {
   releaseSerializedInventoryBackups(survivalData);
   if (survivalSnapshotSaved || Array.isArray(survivalData)) try { clearInventoryData(p, S_KEY); } catch { }
  }
  reportRecoveryFailure(p, "gagal mengaktifkan lobby inventory", error);
  return false;
 }
}
export function deactivateLobbyMode(p) {
 let survivalData;
 let preparedSurvival;
 let lobbyData;
 let preparedLobby;
 let lobbySnapshotSaved = false;
 let transitionStarted = false;
 let survivalRestored = false;
 try {
  const survivalDataStr = p.getDynamicProperty(S_KEY);
  const transaction = p.getDynamicProperty(TX_KEY);
  if (!survivalDataStr) {
   if (transaction) clearInventoryData(p, TX_KEY);
   clearLobbyRecoveryFailure(p);
   return true;
  }
  survivalData = parseInventoryData(survivalDataStr);
  if (transaction === TX_SURVIVAL_RESTORED) {
   clearInventoryData(p, S_KEY);
   releaseSerializedInventoryBackups(survivalData);
   clearInventoryData(p, TX_KEY);
   clearLobbyRecoveryFailure(p);
   return true;
  }
  preparedSurvival = preparePlayerInventoryRestore(p, survivalData);
  if (transaction === TX_DEACTIVATING) {
   const savedLobbyRaw = p.getDynamicProperty(L_KEY);
   lobbyData = savedLobbyRaw ? parseInventoryData(savedLobbyRaw) : [];
   preparedLobby = preparePlayerInventoryRestore(p, lobbyData);
   lobbySnapshotSaved = true;
  } else {
   const previousLobbyRaw = p.getDynamicProperty(L_KEY);
   lobbyData = serializePlayerInventory(p);
   try {
    preparedLobby = preparePlayerInventoryRestore(p, lobbyData);
    saveInventoryData(p, L_KEY, lobbyData);
    lobbySnapshotSaved = true;
   } catch (error) {
    releaseSerializedInventoryBackups(lobbyData);
    throw error;
   }
   if (previousLobbyRaw) {
    try { releaseSerializedInventoryBackups(parseInventoryData(previousLobbyRaw)); } catch { }
   }
   p.setDynamicProperty(TX_KEY, TX_DEACTIVATING);
   if (p.getDynamicProperty(TX_KEY) !== TX_DEACTIVATING) throw new Error("Failed to verify inventory transaction marker");
  }
  transitionStarted = true;
  if (!purgePlayerInventory(p)) throw new Error("Failed to clear lobby inventory");
  if (!applyPreparedInventoryRestore(p, preparedSurvival, false)) throw new Error("Failed to restore survival inventory");
  survivalRestored = true;
  p.setDynamicProperty(TX_KEY, TX_SURVIVAL_RESTORED);
  if (p.getDynamicProperty(TX_KEY) !== TX_SURVIVAL_RESTORED) throw new Error("Failed to mark survival inventory as restored");
  clearInventoryData(p, S_KEY);
  releaseSerializedInventoryBackups(survivalData);
  clearInventoryData(p, TX_KEY);
  clearLobbyRecoveryFailure(p);
  return true;
 } catch (error) {
  if (!survivalRestored && transitionStarted && preparedLobby) {
   const cleared = purgePlayerInventory(p);
   const rolledBack = cleared && applyPreparedInventoryRestore(p, preparedLobby, false);
   if (!rolledBack) {
    console.warn(`[Lobby Inventory] Rollback lobby inventory gagal untuk ${p?.name || p?.id || "unknown"}; snapshot S/L dipertahankan.`);
   }
  } else if (!lobbySnapshotSaved) {
   releaseSerializedInventoryBackups(lobbyData);
  }
  reportRecoveryFailure(
   p,
   survivalRestored
    ? "survival inventory sudah pulih; finalisasi marker akan dicoba ulang"
    : "gagal memulihkan survival inventory",
   error,
  );
  return false;
 }
}
export function clearLobbyData(p) {
 try {
  const survival = p.getDynamicProperty(S_KEY);
  const lobby = p.getDynamicProperty(L_KEY);
  const survivalItems = survival ? parseInventoryData(survival) : null;
  const lobbyItems = lobby ? parseInventoryData(lobby) : null;
  p.setDynamicProperties({ [S_KEY]: undefined, [L_KEY]: undefined, [TX_KEY]: undefined });
  if (p.getDynamicProperty(S_KEY) !== undefined || p.getDynamicProperty(L_KEY) !== undefined) {
   throw new Error("Failed to clear lobby inventory data");
  }
  releaseSerializedInventoryBackups(survivalItems);
  releaseSerializedInventoryBackups(lobbyItems);
 } catch { }
}
