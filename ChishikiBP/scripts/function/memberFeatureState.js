import { world } from "../core.js";

const STORAGE_KEY = "memberFeatureStatus";

export const featureStatus = {
 teleport: true,
 randomTeleport: true,
 warp: true,
 pwarp: true,
 setHome: true,
 transferMoney: true,
 bank: true,
 clan: true,
 shop: true,
 reportPlayer: true,
 claimLand: true,
 barter: true,
 backpack: true,
 playerShop: true,
 battlepass: true,
 emotes: true,
 job: false,
 personalScoreboard: true,
 language: true,
};

let loaded = false;
const statusListeners = new Set();
const notifyStatusListeners = (feature, enabled) => {
 for (const listener of statusListeners) {
  try { listener(feature, enabled); } catch { }
 }
};

export function onMemberFeatureStatusChange(listener) {
 if (typeof listener !== "function") return () => { };
 statusListeners.add(listener);
 return () => statusListeners.delete(listener);
}

export function loadMemberFeatureStatus() {
 try {
 const saved = world.getDynamicProperty(STORAGE_KEY);
 if (saved) {
 const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
 if (parsed && typeof parsed === "object") {
 for (const [feature, enabled] of Object.entries(parsed)) {
 featureStatus[feature] = enabled !== false;
 }
 }
 }
 } catch (error) {
 console.warn("Unable to load member feature settings; using defaults.", error);
 }
 loaded = true;
 return featureStatus;
}

export function isMemberFeatureEnabled(feature) {
 if (!loaded) loadMemberFeatureStatus();
 return featureStatus[feature] !== false;
}

export function saveMemberFeatureStatus() {
 try {
 world.setDynamicProperty(STORAGE_KEY, JSON.stringify(featureStatus));
 return true;
 } catch (error) {
 console.warn("Could not save member feature settings.", error);
 return false;
 }
}

export function setMemberFeatureEnabled(feature, enabled) {
 loaded = true;
 featureStatus[feature] = !!enabled;
 notifyStatusListeners(feature, featureStatus[feature]);
 return saveMemberFeatureStatus();
}

export function ensureMemberFeature(feature, defaultValue = true) {
 if (!loaded) loadMemberFeatureStatus();
 if (!(feature in featureStatus)) {
 featureStatus[feature] = !!defaultValue;
 notifyStatusListeners(feature, featureStatus[feature]);
 saveMemberFeatureStatus();
 }
 return featureStatus[feature];
}
