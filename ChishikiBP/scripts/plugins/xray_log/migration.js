import { world } from "../../core.js";
import { DataCompressor, Utils } from "./utils.js";
import { XRAY_CONFIG } from "./config.js";
export class MigrationManager {
 constructor() {
 this.migrationStatus = {
 isComplete: false,
 migratedLogs: 0,
 errors: 0,
 startTime: null,
 endTime: null
 };
 }
 needsMigration() {
 try {
 const oldLogs = world.getDynamicProperty("xray_logs");
 const newMeta = world.getDynamicProperty("xray_logs_meta");
 return oldLogs && !newMeta;
 } catch (error) {
 console.warn("[Migration] Error checking migration status:", error);
 return false;
 }
 }
 async migrate() {
 if (!this.needsMigration()) {
 return { success: true, message: "No migration needed" };
 }
 this.migrationStatus.startTime = Date.now();
 console.log("[Migration] Starting XRay data migration...");
 try {
 const oldLogsData = world.getDynamicProperty("xray_logs");
 if (!oldLogsData) {
 return { success: true, message: "No old data found" };
 }
 const oldLogs = Utils.safeJsonParse(oldLogsData, []);
 if (!Array.isArray(oldLogs)) {
 throw new Error("Invalid old data format");
 }
 console.log(`[Migration] Found ${oldLogs.length} old logs to migrate`);
 const compressedLogs = this.processOldLogs(oldLogs);
 await this.saveInChunks(compressedLogs);
 this.createMetadata(compressedLogs.length);
 await this.backupOldData(oldLogsData);
 world.setDynamicProperty("xray_logs", undefined);
 this.migrationStatus.isComplete = true;
 this.migrationStatus.endTime = Date.now();
 this.migrationStatus.migratedLogs = compressedLogs.length;
 const duration = this.migrationStatus.endTime - this.migrationStatus.startTime;
 console.log(`[Migration] Completed successfully in ${duration}ms`);
 console.log(`[Migration] Migrated ${compressedLogs.length} logs`);
 return {
 success: true,
 message: `Successfully migrated ${compressedLogs.length} logs`,
 duration: duration,
 migratedLogs: compressedLogs.length
 };
 } catch (error) {
 this.migrationStatus.errors++;
 console.error("[Migration] Migration failed:", error);
 return {
 success: false,
 message: `Migration failed: ${error.message}`,
 error: error
 };
 }
 }
 processOldLogs(oldLogs) {
 const processed = [];
 for (let i = 0; i < oldLogs.length; i++) {
 const log = oldLogs[i];
 try {
 if (!this.isValidLogEntry(log)) {
 console.warn(`[Migration] Skipping invalid log entry at index ${i}`);
 continue;
 }
 const compressedLog = DataCompressor.compressLog(log);
 processed.push(compressedLog);
 } catch (error) {
 console.warn(`[Migration] Error processing log at index ${i}:`, error);
 this.migrationStatus.errors++;
 }
 }
 return processed
 .sort((a, b) => new Date(b.t) - new Date(a.t))
 .slice(0, XRAY_CONFIG.DATABASE.MAX_TOTAL_LOGS);
 }
 isValidLogEntry(log) {
 return log &&
 typeof log.player === 'string' &&
 typeof log.ore === 'string' &&
 log.location &&
 typeof log.location.x === 'number' &&
 typeof log.location.y === 'number' &&
 typeof log.location.z === 'number' &&
 typeof log.timestamp === 'string';
 }
 async saveInChunks(logs) {
 const chunks = [];
 const maxLogsPerChunk = XRAY_CONFIG.DATABASE.MAX_LOGS_PER_CHUNK;
 for (let i = 0; i < logs.length; i += maxLogsPerChunk) {
 chunks.push(logs.slice(i, i + maxLogsPerChunk));
 }
 console.log(`[Migration] Saving ${logs.length} logs in ${chunks.length} chunks`);
 for (let i = 0; i < chunks.length; i++) {
 const chunkKey = `xray_logs_chunk_${i}`;
 const chunkData = Utils.safeJsonStringify(chunks[i]);
 if (chunkData.length > XRAY_CONFIG.DATABASE.MAX_CHUNK_SIZE) {
 console.warn(`[Migration] Chunk ${i} is too large (${chunkData.length} bytes), truncating`);
 const truncatedChunk = chunks[i].slice(0, Math.floor(chunks[i].length / 2));
 world.setDynamicProperty(chunkKey, Utils.safeJsonStringify(truncatedChunk));
 } else {
 world.setDynamicProperty(chunkKey, chunkData);
 }
 }
 }
 createMetadata(totalLogs) {
 const metadata = {
 chunkCount: Math.ceil(totalLogs / XRAY_CONFIG.DATABASE.MAX_LOGS_PER_CHUNK),
 totalLogs: totalLogs,
 lastClean: Date.now(),
 migrationDate: Date.now(),
 version: "2.0.0"
 };
 world.setDynamicProperty("xray_logs_meta", Utils.safeJsonStringify(metadata));
 console.log("[Migration] Created metadata:", metadata);
 }
 async backupOldData(oldData) {
 try {
 const backupKey = `xray_logs_backup_${Date.now()}`;
 world.setDynamicProperty(backupKey, oldData);
 console.log(`[Migration] Created backup: ${backupKey}`);
 setTimeout(() => {
 try {
 world.setDynamicProperty(backupKey, undefined);
 console.log(`[Migration] Cleaned up backup: ${backupKey}`);
 } catch (error) {
 console.warn(`[Migration] Failed to cleanup backup: ${error}`);
 }
 }, 7 * 24 * 60 * 60 * 1000); 
 } catch (error) {
 console.warn("[Migration] Failed to create backup:", error);
 }
 }
 getStatus() {
 return { ...this.migrationStatus };
 }
 resetStatus() {
 this.migrationStatus = {
 isComplete: false,
 migratedLogs: 0,
 errors: 0,
 startTime: null,
 endTime: null
 };
 }
}
export async function autoMigrate() {
 const migrationManager = new MigrationManager();
 if (migrationManager.needsMigration()) {
 console.log("[Migration] Auto-migration triggered");
 const result = await migrationManager.migrate();
 if (result.success) {
 console.log("[Migration] Auto-migration completed successfully");
 } else {
 console.error("[Migration] Auto-migration failed:", result.message);
 }
 return result;
 }
 return { success: true, message: "No migration needed" };
}
export const migrationManager = new MigrationManager();
