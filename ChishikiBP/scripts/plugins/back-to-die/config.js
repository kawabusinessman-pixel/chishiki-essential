import { world, system } from '../../core.js';
import { deathLocationsDB } from "./database.js";
class BackToDieConfig {
 constructor() {
 this._initialized = false;
 this._initPromise = null;
 this._initializeConfig();
 }
 async _initializeConfig() {
 try {
 let attempts = 0;
 const MAX_ATTEMPTS = 100;
 while (!deathLocationsDB.isInitialized && attempts < MAX_ATTEMPTS) {
 await new Promise(resolve => system.runTimeout(resolve, 5));
 attempts++;
 }
 if (!deathLocationsDB.isInitialized) {
 return;
 }
 const enabled = deathLocationsDB.get("config:enabled");
 if (enabled === undefined) {
 deathLocationsDB.set("config:enabled", false);
 }
 this._initialized = true;
 } catch (error) {
 console.warn("Error in back to die config initialization:", error);
 this._initialized = false;
 }
 }
 async waitForInitialization() {
 if (this._initialized) return true;
 if (this._initPromise) {
 await this._initPromise;
 return this._initialized;
 }
 this._initPromise = this._initializeConfig();
 await this._initPromise;
 return this._initialized;
 }
 async isEnabled() {
 try {
 await this.waitForInitialization();
 if (!deathLocationsDB.isInitialized) {
 return false;
 }
 const enabled = deathLocationsDB.get("config:enabled");
 if (enabled === undefined) {
 return false;
 }
 return enabled;
 } catch (error) {
 console.warn("Error reading back to die config:", error);
 return false;
 }
 }
 async setEnabled(value) {
 try {
 await this.waitForInitialization();
 if (!deathLocationsDB.isInitialized) {
 return false;
 }
 const enabled = Boolean(value);
 deathLocationsDB.set("config:enabled", enabled);
 await new Promise(resolve => system.runTimeout(resolve, 5));
 const savedValue = deathLocationsDB.get("config:enabled");
 if (savedValue !== enabled) {
 return false;
 }
 return enabled;
 } catch (error) {
 console.warn("Error saving back to die config:", error);
 return false;
 }
 }
 async resetConfig() {
 try {
 if (!deathLocationsDB.isInitialized) {
 return false;
 }
 deathLocationsDB.set("config:enabled", false);
 return true;
 } catch (error) {
 console.warn("Error resetting back to die config:", error);
 return false;
 }
 }
}
export const backToDieConfig = new BackToDieConfig();
