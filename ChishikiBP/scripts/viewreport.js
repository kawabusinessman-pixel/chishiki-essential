import { world, ActionFormData, MessageFormData } from './core.js';
import { showBanPlayerMenu } from './admin_menu/banSystem.js';
import { ScoreboardDB } from './board/data.js';
const REPORT_STATUS = {
 PENDING: "• Pending",
 INVESTIGATING: "• Investigating", 
 RESOLVED: "• Resolved",
 REJECTED: "• Rejected",
 BANNED: "• Banned"
};
const STATUS_ICONS = {
 PENDING: "textures/ui/warning_alex",
 INVESTIGATING: "textures/ui/magnifying_glass",
 BANNED: "textures/ui/lock_color",
 RESOLVED: "textures/ui/check",
 REJECTED: "textures/ui/cancel"
};
const OFFSET_STR = ScoreboardDB.get("ScoreboardDBConfig-offset-timezone") ?? "+7";
const OFFSET_HOURS = parseInt(OFFSET_STR);
const OFFSET_MS = OFFSET_HOURS * 3600000;
function getAllReports() {
 const reports = world.getDynamicProperty("reports");
 return reports ? JSON.parse(reports) : [];
}
function saveAllReports(reports) {
 world.setDynamicProperty("reports", JSON.stringify(reports));
}
function showViewReportMenu(player) {
 const reports = getAllReports();
 let pendingCount = 0;
 let investigatingCount = 0;
 let resolvedCount = 0;
 for (const report of reports) {
 switch (report.status) {
 case "PENDING":
 pendingCount++;
 break;
 case "INVESTIGATING":
 investigatingCount++;
 break;
 case "RESOLVED":
 case "REJECTED":
 resolvedCount++;
 break;
 default:
 break;
 }
 }
 const form = new ActionFormData()
 .title("report menu")
 .body(
 "reports requiring action:\n" +
 `⌛ pending review: ${pendingCount}\n` +
 `⚡ under investigation: ${investigatingCount}\n\n` +
 "select a report category to view:"
 );
 form.button(
 "active reports\nreports pending resolution",
 STATUS_ICONS.PENDING
 );
 form.button(
 "resolved reports\nhistory of handled reports",
 STATUS_ICONS.RESOLVED
 );
 form.button(
 "clear history\ndelete old reports",
 "textures/ui/trash"
 );
 form.show(player).then(response => {
 if (!response || response.isCanceled) return;
 switch (response.selection) {
 case 0:
 showActiveReports(player);
 break;
 case 1:
 showResolvedReports(player);
 break;
 case 2:
 confirmClearHistory(player);
 break;
 }
 });
}
function showActiveReports(player) {
 const reports = getAllReports()
 .filter(r => r.status === "PENDING" || r.status === "INVESTIGATING")
 .sort((a, b) => b.timestamp - a.timestamp);
 const form = new ActionFormData()
 .title("active reports")
 .body(reports.length === 0 ? "no active reports at this time." : "select a report to take action:");
 if (reports.length === 0) {
 form.button("back to menu\nreturn to main menu", "textures/ui/arrow_left");
 } else {
 for (const report of reports) {
 const timeAgo = getTimeAgo(report.timestamp);
 form.button(
 `${report.targetPlayer}\n${report.category} - ${timeAgo}`,
 STATUS_ICONS[report.status]
 );
 }
 }
 form.show(player).then(response => {
 if (!response || response.isCanceled) return;
 if (reports.length === 0) {
 showViewReportMenu(player);
 } else {
 const selectedReport = reports[response.selection];
 if (selectedReport) {
 showReportActions(player, selectedReport);
 }
 }
 });
}
function showReportActions(player, report) {
 const timeFormat = getFormattedTime(report.timestamp);
 const form = new ActionFormData()
 .title(`report: ${report.targetPlayer}`)
 .body(
 `category: ${report.category}\n` +
 `reported by: ${report.reportedBy}\n` +
 `reason: ${report.reason}\n` +
 `evidence: ${report.hasEvidence ? "yes" : "no"}\n` +
 `time: ${timeFormat.fullDateTime}\n` +
 `status: ${REPORT_STATUS[report.status]}`
 )
 .button("investigate\nmark as investigating", STATUS_ICONS.INVESTIGATING)
 .button("resolve\nmark as handled", STATUS_ICONS.RESOLVED)
 .button("ban player\npermanent ban", STATUS_ICONS.BANNED)
 .button("reject\ninvalid report", STATUS_ICONS.REJECTED);
 form.show(player).then(response => {
 if (!response || response.isCanceled) return;
 switch (response.selection) {
 case 0:
 updateReportStatus(player, report, "INVESTIGATING");
 break;
 case 1:
 updateReportStatus(player, report, "RESOLVED");
 break;
 case 2:
 showBanPlayerMenu(player, report.targetPlayer);
 break;
 case 3:
 updateReportStatus(player, report, "REJECTED");
 break;
 default:
 break;
 }
 });
}
function updateReportStatus(player, report, newStatus) {
 const reports = getAllReports();
 const reportIndex = reports.findIndex(r =>
 r.targetPlayer === report.targetPlayer && r.timestamp === report.timestamp
 );
 if (reportIndex !== -1) {
 reports[reportIndex].status = newStatus;
 saveAllReports(reports);
 player.sendMessage(`✔ Report status updated to ${REPORT_STATUS[newStatus]}`);
 player.runCommand(`playsound random.levelup @s`);
 } else {
 player.sendMessage("❌ Report not found.");
 }
}
function getFormattedTime(timestamp) {
 const date = new Date(timestamp);
 const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
 const localDate = new Date(utc + OFFSET_MS);
 const day = String(localDate.getDate()).padStart(2, '0');
 const month = String(localDate.getMonth() + 1).padStart(2, '0');
 const year = localDate.getFullYear();
 const hour = String(localDate.getHours()).padStart(2, '0');
 const minute = String(localDate.getMinutes()).padStart(2, '0');
 return {
 fullDateTime: `${day}/${month}/${year} ${hour}:${minute}`,
 timeOnly: `${hour}:${minute}`
 };
}
function getTimeAgo(timestamp) {
 const now = Date.now() + OFFSET_MS;
 const then = timestamp + OFFSET_MS;
 const seconds = Math.floor((now - then) / 1000);
 if (seconds < 60) return "Just now";
 if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
 if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
 return `${Math.floor(seconds / 86400)} days ago`;
}
function confirmClearHistory(player) {
 new MessageFormData()
 .title("clear history")
 .body(
 "are you sure you want to delete all report history?\nwarning: this action cannot be undone!"
 )
 .button1("no, cancel")
 .button2("yes, delete all")
 .show(player)
 .then(response => {
 if (response.selection === 1) {
 saveAllReports([]);
 player.sendMessage("✔ All report history has been cleared");
 player.runCommand(`playsound random.break @s`);
 }
 });
}
function addReport(reportData) {
 try {
 const reports = getAllReports();
 const newReport = {
 targetPlayer: reportData.targetPlayer,
 category: reportData.category,
 reason: reportData.reason,
 hasEvidence: !!reportData.hasEvidence,
 reportedBy: reportData.reportedBy,
 timestamp: Date.now(),
 status: "PENDING"
 };
 reports.push(newReport);
 saveAllReports(reports);
 const staffPlayers = world.getPlayers().filter(player => player.hasTag("staff"));
 for (const player of staffPlayers) {
 player.sendMessage(
 `⚠ New Report Received!\nFrom: ${reportData.reportedBy}\nTarget: ${reportData.targetPlayer}\nCategory: ${reportData.category}`
 );
 player.runCommand(`playsound random.orb @s`);
 }
 return true;
 } catch (error) {
 console.warn("Error adding report:", error);
 return false;
 }
}
function showResolvedReports(player) {
 const reports = getAllReports()
 .filter(r => r.status === "RESOLVED" || r.status === "REJECTED")
 .sort((a, b) => b.timestamp - a.timestamp);
 const form = new ActionFormData()
 .title("resolved reports")
 .body(reports.length === 0 ? "no resolved reports at this time." : "history of handled reports:");
 if (reports.length === 0) {
 form.button("back to menu\nreturn to main menu", "textures/ui/arrow_left");
 } else {
 for (const report of reports) {
 const timeAgo = getTimeAgo(report.timestamp);
 const statusIcon = STATUS_ICONS[report.status];
 form.button(
 `${report.targetPlayer}\n${report.category} - ${timeAgo}`,
 statusIcon
 );
 }
 }
 form.show(player).then(response => {
 if (!response || response.isCanceled) return;
 if (reports.length === 0) {
 showViewReportMenu(player);
 } else {
 const selectedReport = reports[response.selection];
 if (selectedReport) {
 showReportDetails(player, selectedReport);
 }
 }
 });
}
function showReportDetails(player, report) {
 const timeFormat = getFormattedTime(report.timestamp);
 const form = new ActionFormData()
 .title("report details")
 .body(
 `target: ${report.targetPlayer}\n` +
 `category: ${report.category}\n` +
 `reported by: ${report.reportedBy}\n` +
 `reason: ${report.reason}\n` +
 `evidence: ${report.hasEvidence ? "yes" : "no"}\n` +
 `time: ${timeFormat.fullDateTime}\n` +
 `status: ${REPORT_STATUS[report.status]}`
 )
 .button("back\nreturn to list", "textures/ui/arrow_left");
 form.show(player).then(response => {
 if (!response || response.isCanceled) return;
 showResolvedReports(player);
 });
}
export { showViewReportMenu, addReport };