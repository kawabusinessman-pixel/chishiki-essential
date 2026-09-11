import { system, world, ActionFormData } from '../core.js';
import { metricNumbers } from "../lib/game.js";
import { ForceOpen } from "./ForceOpen.js";
import { Database } from "./Database.js";
import { GlobalConfig } from "./GlobalConfig.js";
const MIN_LIMIT = 0;
const BASE_PROPERTY_ID = "money_balance_string";
const OBJECTIVE_LIMIT = 2e9;
const MONEY_CONFIG_PROPERTY = "moneySystem:config";
const MoneyConfigDB = new Database("MoneyConfig");
const DEFAULT_MONEY_CONFIG = {
 mode: "objective",
 useDecimals: false,
 version: "1.0.0",
 lastUpdated: Date.now(),
};
let cachedMoneyConfig = null;
function loadMoneySystemConfig() {
  if (cachedMoneyConfig) return cachedMoneyConfig;
  try {
    const configData = GlobalConfig.get(MONEY_CONFIG_PROPERTY);
    if (configData) {
      const config = typeof configData === "string" ? JSON.parse(configData) : configData;
      cachedMoneyConfig = { ...DEFAULT_MONEY_CONFIG, ...config };
      return cachedMoneyConfig;
    }
  } catch (error) {
    console.warn("Error loading money system config:", error);
  }
  cachedMoneyConfig = { ...DEFAULT_MONEY_CONFIG };
  return cachedMoneyConfig;
}
async function saveMoneySystemConfig(config) {
  try {
    const configToSave = {
      ...config,
      lastUpdated: Date.now(),
    };
    cachedMoneyConfig = configToSave;
    GlobalConfig.set(
      MONEY_CONFIG_PROPERTY,
      configToSave,
    );
    console.warn(
      `[MONEY CONFIG] Configuration saved: ${JSON.stringify(configToSave)}`,
    );
    return true;
  } catch (error) {
    console.warn("Error saving money system config:", error);
    return false;
  }
}
export function getMoneySystemMode() {
 const config = loadMoneySystemConfig();
 return config.mode || DEFAULT_MONEY_CONFIG.mode;
}
export function useDecimalMode() {
 const config = loadMoneySystemConfig();
 return config.useDecimals || false;
}
async function setDecimalMode(enabled) {
 const currentConfig = loadMoneySystemConfig();
 const newConfig = {
 ...currentConfig,
 useDecimals: enabled,
 };
 const success = await saveMoneySystemConfig(newConfig);
 if (success) {
 console.warn(`[MONEY CONFIG] Decimal mode set to: ${enabled}`);
 }
 return success;
}
async function toggleDecimalMode(player) {
 try {
 const currentDecimal = useDecimalMode();
 const newDecimal = !currentDecimal;
 const success = await setDecimalMode(newDecimal);
 if (success) {
 player.sendMessage(
 `§a Decimal display ${newDecimal ? "enabled" : "disabled"}`,
 );
 if (newDecimal) {
 player.sendMessage(`§e Money will now show as: $1,234.56`);
 player.sendMessage(`§e Last 2 digits are treated as cents`);
 } else {
 player.sendMessage(`§e Money will now show as: $1,234`);
 }
 player.playSound("random.click");
 } else {
 player.sendMessage("§c Failed to update decimal setting");
 player.playSound("note.bass");
 }
 await handleMoneySystemConfig(player);
 } catch (error) {
 console.warn("Error toggling decimal mode:", error);
 player.sendMessage("§c Failed to toggle decimal mode");
 player.playSound("note.bass");
 }
}
async function setMoneySystemMode(mode) {
 const currentConfig = loadMoneySystemConfig();
 const newConfig = {
 ...currentConfig,
 mode: mode,
 };
 const success = await saveMoneySystemConfig(newConfig);
 if (success) {
 await MoneyConfigDB.set("money_system_mode", mode);
 }
 return success;
}
function migratePlayerMoney(player) {
 const currentMode = getMoneySystemMode();
 try {
 if (currentMode === "unlimited") {
 return migrateMoneyToProperty(player);
 } else if (currentMode === "objective") {
 const moneyString = player.getDynamicProperty(BASE_PROPERTY_ID);
 if (moneyString !== undefined) {
 const amount = BigInt(moneyString);
 const scoreAmount =
 amount > BigInt(OBJECTIVE_LIMIT) ? OBJECTIVE_LIMIT : Number(amount);
 system.run(() => {
 try {
 if (getMoneySystemMode() !== "objective") return;
 const obj =
 world.scoreboard.getObjective("money") ??
 world.scoreboard.addObjective("money");
 obj.setScore(player, scoreAmount);
 player.setDynamicProperty(BASE_PROPERTY_ID, undefined);
 } catch (error) {
 console.warn(
 `Error migrating to objective mode for ${player.name}:`,
 error,
 );
 }
 });
 return true;
 }
 }
 } catch (error) {
 console.warn(`Error migrating money for player ${player.name}:`, error);
 }
 return false;
}
async function migrateAllOfflinePlayers() {
 try {
 const currentMode = getMoneySystemMode();
 let migratedCount = 0;
 if (currentMode === "unlimited") {
 const objective = world.scoreboard.getObjective("money");
 const onlineNames = new Set([...world.getPlayers()].map((player) => player.name));
 if (objective) {
 const participants = objective.getParticipants();
 for (const participant of participants) {
 const playerName = participant.displayName;
 if (onlineNames.has(playerName)) continue;
 const score = objective.getScore(participant);
 if (score > 0) {
 world.setDynamicProperty(
 `offline_migration_${playerName}`,
 JSON.stringify({
 mode: "unlimited",
 amount: score,
 timestamp: Date.now(),
 }),
 );
 migratedCount++;
 }
 }
 }
 } else if (currentMode === "objective") {
 }
 return migratedCount;
 } catch (error) {
 console.warn("Error migrating offline players:", error);
 return 0;
 }
}
function applyOfflineMigration(player) {
 try {
 const migrationData = world.getDynamicProperty(
 `offline_migration_${player.name}`,
 );
 if (migrationData) {
 const data = JSON.parse(migrationData);
 if (data.mode !== "unlimited") return false;
 if (getMoneySystemMode() !== "unlimited") {
 world.setDynamicProperty(`offline_migration_${player.name}`, undefined);
 return false;
 }
 const existingMoney = player.getDynamicProperty(BASE_PROPERTY_ID);
 const finalAmount =
 existingMoney === undefined ? BigInt(data.amount) : BigInt(existingMoney);
 if (existingMoney === undefined) {
 player.setDynamicProperty(BASE_PROPERTY_ID, data.amount.toString());
 }
 syncMoneyScoreboard(player, finalAmount);
 world.setDynamicProperty(`offline_migration_${player.name}`, undefined);
 console.warn(
 `[OFFLINE MIGRATION] Applied migration for ${player.name}: ${data.amount} money`,
 );
 return true;
 }
 } catch (error) {
 console.warn(`Error applying offline migration for ${player.name}:`, error);
 }
 return false;
}
system.run(() => {
 try {
 world.scoreboard.getObjective("money") ??
 world.scoreboard.addObjective("money");
 } catch (error) {
 console.warn("Error initializing money objective:", error);
 }
});
world.afterEvents.playerSpawn.subscribe((eventData) => {
 const { player, initialSpawn } = eventData;
 if (initialSpawn) {
 system.runTimeout(() => {
 const offlineMigrated = applyOfflineMigration(player);
 if (!offlineMigrated) {
 const migrated = migratePlayerMoney(player);
 if (migrated) {
 console.warn(
 `[MONEY MIGRATION] Auto-migrated money for player ${player.name} to ${getMoneySystemMode()} mode`,
 );
 }
 }
 }, 20);
 }
});
export function migrateMoneyToProperty(player) {
 try {
 const existingStringMoney = player.getDynamicProperty(BASE_PROPERTY_ID);
 if (existingStringMoney !== undefined) {
 return true;
 }
 const oldMoneyTotal = getOldChunkMoney(player);
 if (oldMoneyTotal > 0n) {
 player.setDynamicProperty(BASE_PROPERTY_ID, oldMoneyTotal.toString());
 clearOldMoneyChunks(player);
 console.warn(
 `[MONEY MIGRATION] Successfully migrated ${oldMoneyTotal} money from chunks for player ${player.name}`,
 );
 return true;
 }
 const scoreboardMoney = Math.max(
 world.scoreboard
 .getObjective("money")
 .getScore(player.scoreboardIdentity) || 0,
 MIN_LIMIT,
 );
 player.setDynamicProperty(BASE_PROPERTY_ID, scoreboardMoney.toString());
 syncMoneyScoreboard(player, BigInt(scoreboardMoney));
 console.warn(
 `[MONEY MIGRATION] Successfully migrated ${scoreboardMoney} money for player ${player.name}`,
 );
 return true;
 } catch (error) {
 console.warn(
 `[MONEY MIGRATION] Failed to migrate money for player ${player.name}:`,
 error,
 );
 return false;
 }
}
export function migrateAllPlayers() {
 try {
 const players = [...world.getPlayers()];
 let successCount = 0;
 for (const player of players) {
 if (migrateMoneyToProperty(player)) {
 successCount++;
 }
 }
 console.warn(
 `[MONEY MIGRATION] Migration completed: ${successCount}/${players.length} players successfully migrated`,
 );
 return successCount;
 } catch (error) {
 console.warn("[MONEY MIGRATION] Error during mass migration:", error);
 return 0;
 }
}
function getOldChunkMoney(player) {
 let total = BigInt(0);
 const oldBaseId = "money_balance";
 const baseValue = player.getDynamicProperty(oldBaseId);
 if (baseValue !== undefined) {
 total += BigInt(baseValue);
 }
 let chunkIndex = 1;
 while (true) {
 const chunkId = `${oldBaseId}_${chunkIndex}`;
 const chunkValue = player.getDynamicProperty(chunkId);
 if (chunkValue === undefined) {
 break;
 }
 total += BigInt(chunkValue);
 chunkIndex++;
 }
 return total;
}
function clearOldMoneyChunks(player) {
 const oldBaseId = "money_balance";
 player.setDynamicProperty(oldBaseId, undefined);
 let chunkIndex = 1;
 while (true) {
 const chunkId = `${oldBaseId}_${chunkIndex}`;
 const chunkValue = player.getDynamicProperty(chunkId);
 if (chunkValue === undefined) {
 break;
 }
 player.setDynamicProperty(chunkId, undefined);
 chunkIndex++;
 }
}
export function getFullMoney(player) {
 try {
 const currentMode = getMoneySystemMode();
 if (currentMode === "objective") {
 const score =
 world.scoreboard
 .getObjective("money")
 ?.getScore(player.scoreboardIdentity) || 0;
 return BigInt(Math.max(score, MIN_LIMIT));
 } else {
 const moneyString = player.getDynamicProperty(BASE_PROPERTY_ID);
 if (moneyString !== undefined) {
 try {
 return BigInt(moneyString);
 } catch {
 console.warn(
 `[MONEY] Invalid money_balance_string for ${player.name}: "${moneyString}"`,
 );
 return BigInt(MIN_LIMIT);
 }
 }
 const oldMoneyTotal = getOldChunkMoney(player);
 if (oldMoneyTotal > 0n) {
 player.setDynamicProperty(BASE_PROPERTY_ID, oldMoneyTotal.toString());
 clearOldMoneyChunks(player);
 console.warn(
 `[MONEY AUTO-MIGRATION] Migrated ${oldMoneyTotal} money from chunks for player ${player.name}`,
 );
 return oldMoneyTotal;
 }
 const score =
 world.scoreboard
 .getObjective("money")
 ?.getScore(player.scoreboardIdentity) || 0;
 const amount = BigInt(Math.max(score, MIN_LIMIT));
 if (score > 0) {
 player.setDynamicProperty(BASE_PROPERTY_ID, amount.toString());
 syncMoneyScoreboard(player, amount);
 console.warn(
 `[MONEY AUTO-MIGRATION] Migrated ${score} money for player ${player.name}`,
 );
 } else {
 player.setDynamicProperty(BASE_PROPERTY_ID, "0");
 }
 return amount;
 }
 } catch {
 return BigInt(MIN_LIMIT);
 }
}
export function formatMoneyValue(amount) {
 const useDecimals = useDecimalMode();
 const num = Number(amount);
 if (useDecimals) {
 if (num >= 1e12) {
 return (num / 1e12).toFixed(2) + "T";
 } else if (num >= 1e9) {
 return (num / 1e9).toFixed(2) + "B";
 } else if (num >= 1e6) {
 return (num / 1e6).toFixed(2) + "M";
 } else if (num >= 1e3) {
 return (num / 1e3).toFixed(2) + "K";
 } else {
 return num.toFixed(2);
 }
 } else {
 return metricNumbers(amount.toString());
 }
}
export function getFormattedMoney(player) {
 const amount = getFullMoney(player);
 return `$${formatMoneyValue(amount)}`;
}
function setObjectiveMoney(player, amount) {
  const scoreAmount =
  amount > BigInt(OBJECTIVE_LIMIT) ? OBJECTIVE_LIMIT : Number(amount);
  try {
  const obj =
  world.scoreboard.getObjective("money") ??
  world.scoreboard.addObjective("money");
  obj.setScore(player, scoreAmount);
  return true;
  } catch (error) {
  console.warn(`Error saving money for ${player.name}:`, error);
  return false;
  }
}
function syncMoneyScoreboard(player, amount) {
 return setObjectiveMoney(player, amount);
}
export function addMoney(player, amount) {
 try {
 const amountBigInt = BigInt(amount);
 if (amountBigInt <= 0n) return false;
 const currentMode = getMoneySystemMode();
 const currentMoney = getFullMoney(player);
 const newAmount = currentMoney + amountBigInt;
 if (currentMode === "objective") {
 return setObjectiveMoney(player, newAmount);
 } else {
 player.setDynamicProperty(BASE_PROPERTY_ID, newAmount.toString());
 syncMoneyScoreboard(player, newAmount);
 }
 return true;
 } catch (error) {
 console.warn("Error adding money:", error);
 return false;
 }
}
export function removeMoney(player, amount) {
 try {
 const amountBigInt = BigInt(amount);
 if (amountBigInt <= 0n) return false;
 const currentMode = getMoneySystemMode();
 const currentMoney = getFullMoney(player);
 const newAmount = currentMoney - amountBigInt;
 if (newAmount < 0n) return false;
 if (currentMode === "objective") {
 return setObjectiveMoney(player, newAmount);
 } else {
 player.setDynamicProperty(BASE_PROPERTY_ID, newAmount.toString());
 syncMoneyScoreboard(player, newAmount);
 }
 return true;
 } catch (error) {
 console.warn("Error removing money:", error);
 return false;
 }
}
export function setMoney(player, amount) {
 try {
 const newAmount = BigInt(amount);
 if (newAmount < 0n) return false;
 const currentMode = getMoneySystemMode();
 if (currentMode === "objective") {
 return setObjectiveMoney(player, newAmount);
 } else {
 player.setDynamicProperty(BASE_PROPERTY_ID, newAmount.toString());
 syncMoneyScoreboard(player, newAmount);
 }
 return true;
 } catch (error) {
 console.warn("Error setting money:", error);
 return false;
 }
}
export function wouldResultInNegative(player, amount) {
 try {
 const currentMoney = getFullMoney(player);
 return currentMoney - BigInt(amount) < 0n;
 } catch {
 return true;
 }
}
export function checkBalance(player) {
 try {
 const balance = getFormattedMoney(player);
 player.sendMessage(`§8[§aMONEY§8] §fYour current balance: §a${balance}`);
 } catch (error) {
 console.warn("Error checking balance:", error);
 player.sendMessage("§8[§cMONEY§8] §cError retrieving balance");
 }
}
export function getMoneyDetails(player) {
 try {
 const moneyAmount = getFullMoney(player);
 let details = [
 `§e=== MONEY DETAILS: ${player.name} ===`,
 `§fTotal Balance: §a${metricNumbers(moneyAmount.toString())}`,
 `§fRaw Value: §b${moneyAmount.toString()}`,
 `§fStorage Type: §6Single Dynamic Property (String)`,
 `§fProperty ID: §7${BASE_PROPERTY_ID}`,
 ];
 return details.join("\n");
 } catch (error) {
 console.warn("Error getting money details:", error);
 return "§cError retrieving money details";
 }
}
function handleShopBuy(player, data) {
 const { item, count, price } = data;
 if (wouldResultInNegative(player, price)) {
 player.sendMessage("§8[§cSHOP§8] §cInsufficient funds to buy this item");
 return;
 }
 if (removeMoney(player, price)) {
 system.run(() => {
 try {
 player.runCommand(`give @s ${item} ${count}`);
 player.sendMessage(
 `§8[§aSHOP§8] §aSuccessfully bought ${count}x ${item} for $${price}`,
 );
 } catch (error) {
 addMoney(player, price);
 player.sendMessage(
 `§8[§cSHOP§8] §cFailed to give item. Your money has been refunded.`,
 );
 console.warn(`[SHOP] Failed to give item to ${player.name}: ${error}`);
 }
 });
 }
}
export async function handleMoneySystemConfig(player) {
 try {
 const currentMode = getMoneySystemMode();
 const decimalEnabled = useDecimalMode();
 let bodyText = `§e=== CURRENT CONFIGURATION ===\n\n`;
 bodyText += `§fActive Mode: §a${currentMode === "unlimited" ? "Unlimited Mode" : "Objective Mode (2B Limit)"}\n`;
 bodyText += `§fDecimal Display: §a${decimalEnabled ? "Enabled" : "Disabled"}\n\n`;
 if (currentMode === "unlimited") {
 bodyText += `§6Mode Details:\n`;
 bodyText += `§f• Uses dynamic properties for storage\n`;
 bodyText += `§f• No money limit restrictions\n`;
 bodyText += `§f• Better performance for large amounts\n`;
 bodyText += `§f• Automatic migration on player join\n`;
 } else {
 bodyText += `§6Mode Details:\n`;
 bodyText += `§f• Uses scoreboard objectives\n`;
 bodyText += `§f• Maximum limit: 2,147,483,647\n`;
 bodyText += `§f• Compatible with command blocks\n`;
 bodyText += `§f• Supports reset functionality\n`;
 }
 const UI = new ActionFormData()
 .title("Money System Configuration")
 .body(bodyText)
 .button(
 `Switch to Unlimited Mode ${currentMode === "unlimited" ? "§a(Active)" : ""}`,
 currentMode === "unlimited"
 ? "textures/ui/chat_keyboard_hover"
 : "textures/ui/chat_keyboard",
 )
 .button(
 `Switch to Objective Mode ${currentMode === "objective" ? "§a(Active)" : ""}`,
 currentMode === "objective"
 ? "textures/ui/chat_keyboard_hover"
 : "textures/ui/chat_keyboard",
 )
 .button("Reset All Money", "textures/ui/refresh_light")
 .button("Migration Status", "textures/ui/checkbox_filled_hover")
 .divider()
 .button(
 `Decimal Display: ${decimalEnabled ? "§aON" : "§cOFF"}`,
 decimalEnabled ? "textures/ui/toggle_on" : "textures/ui/toggle_off",
 );
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 switch (result.selection) {
 case 0:
 await switchToUnlimitedMode(player);
 break;
 case 1:
 await switchToObjectiveMode(player);
 break;
 case 2:
 await handleResetAllMoney(player);
 break;
 case 3:
 await showMigrationStatus(player);
 break;
 case 4:
 await toggleDecimalMode(player);
 break;
 }
 } catch (error) {
 console.warn("Error in handleMoneySystemConfig:", error);
 player.sendMessage("§c Failed to open money system configuration");
 player.playSound("note.bass");
 }
}
async function handleResetAllMoney(player) {
 const currentMode = getMoneySystemMode();
 if (currentMode === "unlimited") {
 const UI = new ActionFormData()
 .title("Reset All Money - Not Available")
 .body(
 "§c=== RESET NOT AVAILABLE ===\n\n" +
 "§fReset All Money function only works in §eObjective Mode§f.\n\n" +
 "§6Why?\n" +
 "§f• Unlimited mode uses dynamic properties\n" +
 "§f• Cannot efficiently reset all player data\n" +
 "§f• Objective mode uses scoreboard system\n" +
 "§f• Easy to reset by removing/recreating objective\n\n" +
 "§eTo use Reset All Money:\n" +
 "§f1. Switch to Objective Mode first\n" +
 "§f2. Then use Reset All Money function\n" +
 "§f3. Switch back to Unlimited if needed",
 )
 .button("Switch to Objective Mode", "textures/ui/book_edit_default")
 .button("Back", "textures/ui/arrow_left");
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 if (result.selection === 0) {
 await switchToObjectiveMode(player);
 } else if (result.selection === 1) {
 await handleMoneySystemConfig(player);
 }
 return;
 }
 const UI = new ActionFormData()
 .title("Reset All Money - Confirmation")
 .body(
 "§c=== WARNING: RESET ALL MONEY ===\n\n" +
 "§fThis will §cPERMANENTLY DELETE§f all player money!\n\n" +
 "§6What will happen:\n" +
 "§f• All players' money will be set to §c$0\n" +
 "§f• This action §cCANNOT BE UNDONE\n" +
 "§f• Works by removing and recreating money objective\n\n" +
 "§eOnly proceed if you are absolutely sure!\n" +
 "§cThis affects ALL players in the world!",
 )
 .button("§cYES - Reset All Money", "textures/ui/check")
 .button("§aBack", "textures/ui/arrow_left");
 const result = await ForceOpen(player, UI);
 if (result.canceled || result.selection === 1) {
 await handleMoneySystemConfig(player);
 return;
 }
 await resetAllObjectiveMoney(player);
}
async function resetAllObjectiveMoney(player) {
 try {
 player.sendMessage("§e Starting money reset process...");
 const onlinePlayers = [...world.getPlayers()];
 let clearedOnline = 0;
 for (const onlinePlayer of onlinePlayers) {
 try {
 onlinePlayer.setDynamicProperty(BASE_PROPERTY_ID, undefined);
 clearedOnline++;
 } catch (error) {
 console.warn(
 `Error clearing dynamic property for ${onlinePlayer.name}:`,
 error,
 );
 }
 }
 if (clearedOnline > 0) {
 player.sendMessage(
 `§a Step 1/4: Cleared ${clearedOnline} online players' data`,
 );
 }
 let clearedOffline = 0;
 try {
 const db = new Database("moneyMigration");
 const allOfflineData = await db.getAll();
 for (const [playerName, data] of Object.entries(allOfflineData)) {
 if (data && typeof data === "object" && "money" in data) {
 await db.delete(playerName);
 clearedOffline++;
 }
 }
 if (clearedOffline > 0) {
 player.sendMessage(
 `§a Step 2/4: Cleared ${clearedOffline} offline players' data`,
 );
 }
 } catch (error) {
 console.warn("Error clearing offline player data:", error);
 player.sendMessage("§c Warning: Could not clear offline player data");
 }
 system.run(() => {
 try {
 world
 .getDimension("overworld")
 .runCommand("scoreboard objectives remove money");
 player.sendMessage("§a Step 3/4: Removed money objective");
 } catch (error) {
 console.warn("Error removing money objective:", error);
 player.sendMessage("§c Failed to remove money objective");
 return;
 }
 system.runTimeout(() => {
 try {
 world
 .getDimension("overworld")
 .runCommand("scoreboard objectives add money dummy");
 player.sendMessage("§a Step 4/4: Recreated money objective");
 player.sendMessage("§a §lMoney reset completed successfully!");
 player.sendMessage(
 "§e All players now have $0 (including offline players)",
 );
 player.playSound("random.levelup");
 console.warn(
 `[MONEY RESET] All player money has been reset by ${player.name} (${clearedOnline} online, ${clearedOffline} offline)`,
 );
 } catch (error) {
 console.warn("Error recreating money objective:", error);
 player.sendMessage("§c Failed to recreate money objective");
 player.sendMessage(
 "§c Please manually run: /scoreboard objectives add money dummy",
 );
 player.playSound("note.bass");
 }
 }, 5);
 });
 } catch (error) {
 console.warn("Error in resetAllObjectiveMoney:", error);
 player.sendMessage("§c Failed to reset money system");
 player.playSound("note.bass");
 }
}
async function switchToUnlimitedMode(player) {
 try {
 const onlinePlayers = [...world.getPlayers()];
 const playerMoneyData = new Map();
 for (const onlinePlayer of onlinePlayers) {
 const currentMoney = getFullMoney(onlinePlayer);
 playerMoneyData.set(onlinePlayer.name, currentMoney);
 }
 const success = await setMoneySystemMode("unlimited");
 if (!success) {
 player.sendMessage("§c Failed to save configuration");
 player.playSound("note.bass");
 return;
 }
 let onlineMigrated = 0;
 for (const onlinePlayer of onlinePlayers) {
 const originalMoney = playerMoneyData.get(onlinePlayer.name) || BigInt(0);
 try {
 onlinePlayer.setDynamicProperty(
 BASE_PROPERTY_ID,
 originalMoney.toString(),
 );
 syncMoneyScoreboard(onlinePlayer, originalMoney);
 onlineMigrated++;
 console.warn(
 `[MONEY MIGRATION] Migrated ${onlinePlayer.name}: ${originalMoney} (unlimited mode)`,
 );
 } catch (error) {
 console.warn(
 `Error migrating ${onlinePlayer.name} to unlimited mode:`,
 error,
 );
 }
 }
 const offlineMigrated = await migrateAllOfflinePlayers();
 player.sendMessage("§a Money system switched to Unlimited Mode");
 player.sendMessage("§a Configuration saved successfully");
 if (onlineMigrated > 0) {
 player.sendMessage(
 `§e Migrated ${onlineMigrated} online players immediately`,
 );
 }
 if (offlineMigrated > 0) {
 player.sendMessage(
 `§e Prepared migration data for ${offlineMigrated} offline players`,
 );
 }
 player.playSound("random.levelup");
 } catch (error) {
 console.warn("Error switching to unlimited mode:", error);
 player.sendMessage("§c Failed to switch to unlimited mode");
 player.playSound("note.bass");
 }
}
async function switchToObjectiveMode(player) {
 try {
 const onlinePlayers = [...world.getPlayers()];
 const playerMoneyData = new Map();
 for (const onlinePlayer of onlinePlayers) {
 const currentMoney = getFullMoney(onlinePlayer);
 playerMoneyData.set(onlinePlayer.name, currentMoney);
 }
 await setMoneySystemMode("objective");
 if (getMoneySystemMode() !== "objective") {
 player.sendMessage("§c Failed to save configuration");
 player.playSound("note.bass");
 return;
 }
 let onlineMigrated = 0;
 let cappedPlayers = 0;
 for (const onlinePlayer of onlinePlayers) {
 const originalMoney = playerMoneyData.get(onlinePlayer.name) || BigInt(0);
 const scoreAmount =
 originalMoney > BigInt(OBJECTIVE_LIMIT)
 ? OBJECTIVE_LIMIT
 : Number(originalMoney);
 try {
 const obj =
 world.scoreboard.getObjective("money") ??
 world.scoreboard.addObjective("money");
 obj.setScore(onlinePlayer, scoreAmount);
 onlinePlayer.setDynamicProperty(BASE_PROPERTY_ID, undefined);
 onlineMigrated++;
 if (originalMoney > BigInt(OBJECTIVE_LIMIT)) {
 cappedPlayers++;
 }
 console.warn(
 `[MONEY MIGRATION] Migrated ${onlinePlayer.name}: ${originalMoney} -> ${scoreAmount} (objective mode)`,
 );
 } catch (error) {
 console.warn(
 `Error migrating ${onlinePlayer.name} to objective mode:`,
 error,
 );
 }
 }
 player.sendMessage("§a Money system switched to Objective Mode (2B Limit)");
 if (onlineMigrated > 0) {
 player.sendMessage(
 `§e Migrated ${onlineMigrated} online players immediately`,
 );
 }
 if (cappedPlayers > 0) {
 player.sendMessage(
 `§c Warning: ${cappedPlayers} players had money capped to 2B limit`,
 );
 }
 player.playSound("random.levelup");
 } catch (error) {
 console.warn("Error switching to objective mode:", error);
 player.sendMessage("§c Failed to switch to objective mode");
 player.playSound("note.bass");
 }
}
async function showMigrationStatus(player) {
 const currentMode = getMoneySystemMode();
 const onlinePlayers = [...world.getPlayers()];
 let migrationInfo = `§e=== MONEY SYSTEM STATUS ===\n\n`;
 migrationInfo += `§fCurrent Mode: §a${currentMode === "unlimited" ? "Unlimited Mode" : "Objective Mode (2B Limit)"}\n`;
 migrationInfo += `§fOnline Players: §b${onlinePlayers.length}\n\n`;
 migrationInfo += `§6Storage Details:\n`;
 if (currentMode === "unlimited") {
 migrationInfo += `§f• Uses dynamic properties\n`;
 migrationInfo += `§f• No money limit\n`;
 migrationInfo += `§f• Better performance for large amounts\n`;
 } else {
 migrationInfo += `§f• Uses scoreboard objectives\n`;
 migrationInfo += `§f• Maximum: 2,147,483,647 (2B)\n`;
 migrationInfo += `§f• Compatible with command blocks\n`;
 }
 migrationInfo += `\n§eMigration Process:\n`;
 migrationInfo += `§f• Automatic when players join\n`;
 migrationInfo += `§f• Preserves existing money values\n`;
 migrationInfo += `§f• No player action required\n`;
 let pendingMigrations = 0;
 try {
 const objective = world.scoreboard.getObjective("money");
 if (objective && currentMode === "unlimited") {
 const participants = objective.getParticipants();
 for (const participant of participants) {
 const score = objective.getScore(participant);
 if (score > 0) {
 pendingMigrations++;
 }
 }
 }
 } catch (error) {
 console.warn("Error checking pending migrations:", error);
 }
 if (pendingMigrations > 0) {
 migrationInfo += `\n§cPending Migrations: §e${pendingMigrations} offline players`;
 }
 const UI = new ActionFormData()
 .title("Migration Status")
 .body(migrationInfo)
 .button("Back", "textures/ui/arrow_left");
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 if (result.selection === 0) {
 await handleMoneySystemConfig(player);
 }
}
