
import { ModalFormData, ActionFormData, world, system } from "../../core.js";
import {
 getFormattedMoney,
 getFullMoney,
 addMoney,
 removeMoney,
 getMoneySystemMode,
} from "../../function/moneySystem.js";
import { getScore } from "../../function/getScore.js";
import { metricNumbers } from "../../lib/game.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";

const _identity = [107, 105, 119, 111].map((code) => String.fromCharCode(code)).join(""); 
const showError = (player, msg) => {
 player.runCommand(
 `titleraw @s actionbar {"rawtext":[{"text":"§c✖ §7${msg}"}]}`,
 );
 player.runCommand("playsound note.bass @s");
};
const showSuccess = (player, msg) => {
 player.runCommand(
 `titleraw @s actionbar {"rawtext":[{"text":"§a✓ ${msg}"}]}`,
 );
 player.runCommand("playsound random.levelup @s");
};
const OBJECTIVE_MAX_TRANSFER = 2000000000; 
const UNLIMITED_MAX_TRANSFER = 10000000000; 

const getConfig = () => {
 if (!_identity) return {};
 
 const raw = GlobalConfig.get("transferConfig");
 const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
 const moneyMode = getMoneySystemMode();
 
 
 const defaultMaxTransfer = moneyMode === "unlimited" 
 ? UNLIMITED_MAX_TRANSFER 
 : OBJECTIVE_MAX_TRANSFER;
 
 return {
 minTransfer: 1000,
 maxTransfer: defaultMaxTransfer,
 enabled: true,
 useCoinObjective: true,
 moneyMode,
 ...parsed,
 };
};
const getOnlinePlayers = (excludePlayer) =>
 [...world.getPlayers()].filter((p) => p.name !== excludePlayer.name);
export const getPlayerCoins = (player) => {
 return getScore(player, "coin") || 0;
};
export const addPlayerCoins = (player, amount) => {
 try {
 player.runCommand(`scoreboard players add @s coin ${amount}`);
 return true;
 } catch (error) {
 console.warn("Error adding coins:", error);
 return false;
 }
};
export const removePlayerCoins = (player, amount) => {
 try {
 const currentCoins = getPlayerCoins(player);
 if (currentCoins < amount) return false;
 player.runCommand(`scoreboard players remove @s coin ${amount}`);
 return true;
 } catch (error) {
 console.warn("Error removing coins:", error);
 return false;
 }
};
const formatCoins = (amount) => {
 return metricNumbers(amount.toString());
};
const initializeCoinObjective = () => {
 try {
 const dim = world.getDimension("overworld");
 dim.runCommand(`scoreboard objectives add coin dummy`);
 } catch (error) {
 if (!error.toString().includes("already exists")) {
 console.warn("Error creating coin objective:", error);
 }
 }
};
system.runTimeout(() => {
 initializeCoinObjective();
}, 10);
const validateAmount = (amountStr, config) => {
 if (!amountStr?.trim())
 return { valid: false, error: "please enter an amount" };
 const amount = parseInt(amountStr.replace(/[^0-9]/g, ""));
 if (
 !amount ||
 isNaN(amount) ||
 amount < config.minTransfer ||
 amount > config.maxTransfer
 ) {
 return {
 valid: false,
 error: `please enter an amount between $${metricNumbers(config.minTransfer)} and $${metricNumbers(config.maxTransfer)}`,
 };
 }
 return { valid: true, amount };
};
export const coinSystem = {
 getPlayerCoins,
 addPlayerCoins,
 removePlayerCoins,
 formatCoins,
 initializeCoinObjective,
};
const waitTicks = (ticks = 1) => new Promise((resolve) => system.runTimeout(resolve, ticks));
const showFormRetry = async (player, form, retries = 8) => {
 let response = null;
 for (let i = 0; i < retries; i++) {
  response = await form.show(player);
  if (response?.cancelationReason !== "UserBusy") return response;
  await waitTicks(2);
 }
 return response;
};
const isSamePlayer = (a, b) => a?.id === b?.id || a?.name === b?.name;
const getTransferTargets = () => [...world.getPlayers()];
export function transferMoney(player) {
 if (!_identity) return;
 system.runTimeout(() => {
  openTransferMoney(player).catch((error) => {
   console.warn("[TRANSFER UI] Failed to open transfer menu:", error);
   showError(player, "failed to open transfer menu");
  });
 }, 1);
}
async function openTransferMoney(player) {
 const config = getConfig();
 if (!config.enabled) {
  showError(player, "money transfer is currently disabled");
  return;
 }
 const playerCoins = getPlayerCoins(player);
 const playerMoney = getFullMoney(player);
 const players = getTransferTargets();
 if (!players.length) {
  showError(player, "no players online to transfer to");
  return;
 }
 const response = await showFormRetry(player, new ModalFormData()
  .title("Transfer Money")
  .dropdown("transfer type", ["coins", "money"], {
   defaultValueIndex: 0,
  })
  .dropdown(
   "select player",
   players.map((p) => isSamePlayer(p, player) ? `${p.name} (You)` : p.name),
   {
    defaultValueIndex: 0,
   },
  )
  .textField(
   `amount [${config.moneyMode === "unlimited" ? "unlimited" : "2B"} mode] (${formatCoins(config.minTransfer)}-${formatCoins(config.maxTransfer)})`,
   "enter amount",
   {
    defaultValue: "",
   },
  )
 ).catch((error) => {
  console.warn("[TRANSFER UI] Modal form failed:", error);
  return null;
 });
 if (!response?.formValues) return;
 const [transferTypeIndex, targetIndex, amountStr] = response.formValues;
 const target = players[targetIndex];
 if (!target) {
  showError(player, "that player is no longer online");
  return;
 }
 if (isSamePlayer(target, player)) {
  showError(player, "you cannot transfer to yourself");
  return;
 }
 const validation = validateAmount(amountStr, config);
 if (!validation.valid) {
  showError(player, validation.error);
  return;
 }
 const transferTypes = ["coins", "money"];
 const selectedTransferType = transferTypes[transferTypeIndex];
 const useCoins = selectedTransferType === "coins";
 
 
 const { amount } = validation;
 const formattedAmount = useCoins ? formatCoins(amount) : metricNumbers(amount.toString());
 const currencyLabel = useCoins ? "coins" : "money";
 
 const confirmUI = new ActionFormData()
  .title("§c§lConfirm Transfer")
  .body([
   `§ePlease confirm your transfer:`,
   ``,
   `§fFrom: §a${player.name}`,
   `§fTo: §b${target.name}`,
   `§fAmount: §6${useCoins ? formattedAmount : "$" + formattedAmount}`,
   `§fType: §d${currencyLabel.toUpperCase()}`,
   ``,
   `§c§lThis action cannot be undone!`,
   ``,
   `§7Click §aCONFIRM §7to proceed or §cCANCEL §7to abort.`
  ].join("\n"))
  .button("§c§lCANCEL", "textures/ui/cancel")
  .button("§a§lCONFIRM", "textures/ui/check");
 
 const confirmResponse = await showFormRetry(player, confirmUI).catch((error) => {
  console.warn("[TRANSFER UI] Confirm form failed:", error);
  return null;
 });
 if (!confirmResponse || confirmResponse.selection !== 1) {
  showError(player, "transfer cancelled");
  return;
 }
 
 try {
  if (useCoins) {
   if (playerCoins < amount) {
    showError(player, "you don't have enough coins");
    return;
   }
   if (!removePlayerCoins(player, amount)) {
    showError(player, "failed to remove coins from your account");
    return;
   }
   if (!addPlayerCoins(target, amount)) {
    addPlayerCoins(player, amount);
    showError(player, "failed to send coins to target player");
    return;
   }
   showSuccess(
    player,
    `you sent ${formattedAmount} coins to ${target.name}`,
   );
   showSuccess(target, `${player.name} sent you ${formattedAmount} coins`);
   console.warn(
    `[COIN TRANSFER] ${player.name} sent ${formattedAmount} coins to ${target.name}`,
   );
  } else {
   if (playerMoney < BigInt(amount)) {
    showError(player, "you don't have enough money");
    return;
   }
   if (!removeMoney(player, amount)) {
    showError(player, "failed to remove money from your account");
    return;
   }
   if (!addMoney(target, amount)) {
    addMoney(player, amount);
    showError(player, "failed to send money to target player");
    return;
   }
   showSuccess(player, `you sent $${formattedAmount} to ${target.name}`);
   showSuccess(target, `${player.name} sent you $${formattedAmount}`);
   console.warn(
    `[MONEY TRANSFER] ${player.name} sent $${formattedAmount} to ${target.name}`,
   );
  }
 } catch (error) {
  console.warn("[TRANSFER ERROR]", error);
  showError(player, "transfer failed. please try again");
 }
}
