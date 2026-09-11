import { Database } from "../../function/Database.js";

const database = Database.getDatabase("custom_commands");

export function isCommandEnabled(commandId) {
 return database.get(commandId, true);
}

export function setCommandEnabled(commandId, enabled) {
 database.set(commandId, !!enabled);
}

export function ensureCommandDefault(commandId) {
 if (!database.has(commandId)) database.set(commandId, true);
}
