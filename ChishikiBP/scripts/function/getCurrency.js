import { world } from "../core.js";
import { Database } from "./Database.js";
const currencyDB = Database.getDatabase("kiwoCurrency");
const currencyCache = new Map();
function getCurrency(player) {
  try {
    const cacheKey = `player_${player.name}`;
    if (currencyCache.has(cacheKey)) {
      return currencyCache.get(cacheKey);
    }
    const playerData = currencyDB.get(cacheKey);
    if (!playerData?.currencyId) {
      return getDefaultCurrency();
    }
    const currencyData = currencyDB.get(`currency_${playerData.currencyId}`);
    if (!currencyData) {
      return getDefaultCurrency();
    }
    const result = currencyData.symbol || currencyData.name || playerData.currencyId;
    currencyCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn(`Error getting currency for ${player.name}:`, error);
    return getDefaultCurrency();
  }
}
function getDefaultCurrency() {
  try {
    return currencyDB.get("CurrencyDBConfig-default") || "$";
  } catch (error) {
    console.warn("Error getting default currency:", error);
    return "$";
  }
}
function clearCurrencyCache(playerName) {
  if (playerName === "*") {
    currencyCache.clear();
  } else {
    currencyCache.delete(`player_${playerName}`);
  }
}

world.afterEvents.playerLeave.subscribe(({ player }) => {
  if (player?.name) currencyCache.delete(`player_${player.name}`);
});

export { getCurrency, getDefaultCurrency, currencyDB, clearCurrencyCache };
