import { getBank, setBank, addTransaction, getBankTimestamp } from "./bank.js";
import { world, system } from "../../core.js";
import { ActionFormData } from "../../core.js";
export function resetBank(player) {
 const current = getBank(player);
 if (current > 0n) {
 setBank(player, 0n);
 addTransaction(player, `RESET to 0 | Admin | ${new Date().toLocaleTimeString()}`);
 player.sendMessage("[BANK] Your bank balance has been reset to 0 by an admin.");
 } else {
 player.sendMessage("[BANK] Your bank balance is already 0.");
 }
}
export function resetAllBanks(admin) {
 let count = 0;
 const resetTimestamp = Date.now();
 for (const player of world.getPlayers()) {
 const current = getBank(player);
 if (current > 0n) {
 setBank(player, 0n);
 addTransaction(player, `RESET ALL | Admin | ${new Date().toLocaleTimeString()}`);
 player.sendMessage("[BANK] Your bank balance has been reset to 0 by an admin (RESET ALL).");
 count++;
 }
 }
 world.setDynamicProperty("bankResetTimestamp", resetTimestamp.toString());
 admin.sendMessage(`[BANK] All online players' bank balances have been reset! Total players reset: ${count}`);
}
world.afterEvents.playerSpawn.subscribe(({ player }) => {
 try {
 const resetTimestampRaw = world.getDynamicProperty("bankResetTimestamp");
 if (resetTimestampRaw) {
 const resetTimestamp = BigInt(resetTimestampRaw);
 const current = getBank(player);
 const bankTimestamp = getBankTimestamp(player);
 if (current > 0n && bankTimestamp < resetTimestamp) {
 setBank(player, 0n);
 addTransaction(player, `RESET ALL (JOIN) | Admin | ${new Date().toLocaleTimeString()}`);
 player.sendMessage("[BANK] Your bank balance has been reset to 0 by an admin (RESET ALL).");
 }
 }
 } catch { }
});
export function showResetBankMenu(player, onBack) {
 new ActionFormData()
 .title("§cRESET PLAYER BANK")
 .body("§cWARNING!\n\n§fThis action will reset the bank balance of the selected player(s) to 0.\n\nChoose reset mode:")
 .button("RESET SINGLE PLAYER", "textures/ui/icon_trash")
 .button("RESET ALL ONLINE PLAYERS", "textures/ui/icon_trash")
 .button("CANCEL", "textures/ui/arrow_left")
 .show(player)
 .then(res => {
 if (res.canceled || res.selection === 2) {
 if (typeof onBack === "function") onBack();
 return;
 }
 if (res.selection === 0) {
 showResetBankSingle(player, onBack);
 } else if (res.selection === 1) {
 showResetBankAllConfirm(player, onBack);
 }
 });
}
function showResetBankSingle(player, onBack) {
 const onlinePlayers = [...world.getPlayers()];
 if (onlinePlayers.length === 0) {
 player.sendMessage("§cNo players online!");
 showResetBankMenu(player, onBack);
 return;
 }
 const form = new ActionFormData()
 .title("§cRESET PLAYER BANK (SINGLE)")
 .body("§fSelect the player whose bank you want to reset:");
 for (const p of onlinePlayers) {
 const balance = getBank(p);
 form.button(`${p.name}\n§7Balance: §e${balance.toLocaleString()}`, "textures/ui/icon_agent");
 }
 form.button("§c< BACK", "textures/ui/arrow_left");
 form.show(player).then(res => {
 if (res.canceled) {
 showResetBankMenu(player, onBack);
 return;
 }
 if (res.selection === onlinePlayers.length) {
 showResetBankMenu(player, onBack);
 return;
 }
 const target = onlinePlayers[res.selection];
 if (!target) {
 player.sendMessage("§cPlayer not found or disconnected.");
 showResetBankMenu(player, onBack);
 return;
 }
 showResetConfirmSingle(player, target, onBack);
 });
}
function showResetConfirmSingle(admin, target, onBack) {
 const balance = getBank(target);
 new ActionFormData()
 .title("§cCONFIRM RESET")
 .body(`§fAre you sure you want to reset the bank of:\n\n§e${target.name}\n§7Current Balance: §e${balance.toLocaleString()}\n\n§cThis action cannot be undone!`)
 .button("§cYES, RESET!", "textures/ui/icon_trash")
 .button("§a< CANCEL", "textures/ui/arrow_left")
 .show(admin)
 .then(res => {
 if (res.canceled || res.selection !== 0) {
 showResetBankSingle(admin, onBack);
 return;
 }
 resetBank(target);
 admin.sendMessage(`§aBank of player '${target.name}' has been reset to 0!`);
 showResetBankMenu(admin, onBack);
 });
}
function showResetBankAllConfirm(player, onBack) {
 new ActionFormData()
 .title("§cRESET ALL ONLINE PLAYER BANKS")
 .body("§cMAJOR WARNING!\n\n§fThis action will reset the bank balance of ALL ONLINE PLAYERS to 0.\n\nAre you sure you want to continue?")
 .button("§cYES, RESET ALL!", "textures/ui/icon_trash")
 .button("CANCEL", "textures/ui/arrow_left")
 .show(player)
 .then(res => {
 if (res.canceled || res.selection !== 0) {
 showResetBankMenu(player, onBack);
 return;
 }
 resetAllBanks(player);
 if (typeof onBack === "function") onBack();
 });
}