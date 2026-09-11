import { XRAY_CONFIG } from "./config.js";
class NotificationRateLimiter {
 constructor() {
 this.playerNotifications = new Map();
 }
 canNotify(playerName) {
 const now = Date.now();
 const playerData = this.playerNotifications.get(playerName) || { count: 0, resetTime: now + 60000 };
 if (now > playerData.resetTime) {
 playerData.count = 0;
 playerData.resetTime = now + 60000;
 }
 if (playerData.count >= XRAY_CONFIG.PERFORMANCE.MAX_NOTIFICATION_RATE) {
 return false;
 }
 playerData.count++;
 this.playerNotifications.set(playerName, playerData);
 return true;
 }
 reset(playerName) {
 this.playerNotifications.delete(playerName);
 }
}
export class DataCompressor {
 static compressLog(logEntry) {
 return {
 p: logEntry.player,
 o: logEntry.ore.replace("minecraft:", ""),
 l: [logEntry.location.x, logEntry.location.y, logEntry.location.z],
 d: logEntry.dimension.replace("minecraft:", ""),
 t: logEntry.timestamp,
 id: logEntry.id || Date.now().toString()
 };
 }
 static decompressLog(compressedLog) {
 if (compressedLog.player) return compressedLog;
 return {
 player: compressedLog.p,
 ore: compressedLog.o.includes(":") ? compressedLog.o : "minecraft:" + compressedLog.o,
 location: {
 x: compressedLog.l[0],
 y: compressedLog.l[1],
 z: compressedLog.l[2]
 },
 dimension: compressedLog.d.includes(":") ? compressedLog.d : "minecraft:" + compressedLog.d,
 timestamp: compressedLog.t,
 id: compressedLog.id
 };
 }
 static getDataSize(data) {
 return new Blob([JSON.stringify(data)]).size;
 }
}
export class PerformanceMonitor {
 constructor() {
 this.metrics = new Map();
 }
 startTimer(operation) {
 this.metrics.set(operation, { startTime: Date.now() });
 }
 endTimer(operation) {
 const metric = this.metrics.get(operation);
 if (!metric) return 0;
 const duration = Date.now() - metric.startTime;
 metric.duration = duration;
 metric.endTime = Date.now();
 return duration;
 }
 getMetrics() {
 const result = {};
 for (const [operation, data] of this.metrics) {
 result[operation] = {
 duration: data.duration || 0,
 timestamp: data.endTime || data.startTime
 };
 }
 return result;
 }
 clearMetrics() {
 this.metrics.clear();
 }
}
export class MemoryManager {
 static estimateMemoryUsage(data) {
 const jsonString = JSON.stringify(data);
 return jsonString.length * 2; 
 }
 static exceedsLimit(data, limit) {
 return this.estimateMemoryUsage(data) > limit;
 }
 static optimizeLogs(logs) {
 return logs
 .sort((a, b) => new Date(b.timestamp || b.t) - new Date(a.timestamp || a.t))
 .slice(0, XRAY_CONFIG.DATABASE.MAX_TOTAL_LOGS)
 .map(log => DataCompressor.compressLog(log));
 }
}
export class TimeFormatter {
 static getTimeAgo(date) {
 const now = new Date();
 const diff = now - date;
 const minutes = Math.floor(diff / 60000);
 if (minutes < 1) return "Just now";
 if (minutes === 1) return "1 minute ago";
 if (minutes < 60) return `${minutes} minutes ago`;
 const hours = Math.floor(minutes / 60);
 if (hours === 1) return "1 hour ago";
 if (hours < 24) return `${hours} hours ago`;
 const days = Math.floor(hours / 24);
 if (days === 1) return "1 day ago";
 return `${days} days ago`;
 }
 static formatDuration(ms) {
 if (ms < 1000) return `${ms}ms`;
 if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
 return `${(ms / 60000).toFixed(1)}m`;
 }
}
export const rateLimiter = new NotificationRateLimiter();
export const performanceMonitor = new PerformanceMonitor();
export const Utils = {
 safeJsonParse(jsonString, fallback = null) {
 try {
 return JSON.parse(jsonString);
 } catch (error) {
 console.warn("[XRayUtils] JSON parse error:", error);
 return fallback;
 }
 },
 safeJsonStringify(data, fallback = "{}") {
 try {
 return JSON.stringify(data);
 } catch (error) {
 console.warn("[XRayUtils] JSON stringify error:", error);
 return fallback;
 }
 },
 debounce(func, delay) {
 let timeoutId;
 return function (...args) {
 clearTimeout(timeoutId);
 timeoutId = setTimeout(() => func.apply(this, args), delay);
 };
 }
};