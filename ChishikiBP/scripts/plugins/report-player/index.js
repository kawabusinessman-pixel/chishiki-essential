import { ModalFormData, ActionFormData, world } from '../../core.js';
import { addReport } from "../../viewreport.js";
const cooldowns = new Map();
const CATS = [
 {
 n: "Cheating",
 d: "Hacks, exploits, unfair advantage",
 ex: ["Kill Aura", "X-Ray", "Speed"],
 },
 {
 n: "Harassment",
 d: "Bullying, threats, targeting",
 ex: ["Verbal Abuse", "Threats"],
 },
 {
 n: "Inappropriate",
 d: "Toxic/NSFW/Offensive",
 ex: ["Hate Speech", "NSFW", "Bad Name"],
 },
 {
 n: "Griefing",
 d: "Griefing or ruining gameplay",
 ex: ["Base Destroy", "Steal", "Spawnkill"],
 },
 { n: "Other", d: "Other", ex: [] },
];
function reportMenu(pl) {
 const pls = world.getPlayers();
 const list = [];
 for (let i = 0; i < pls.length; i++)
 if (pls[i].name !== pl.name) list.push(pls[i].name);
 if (!list.length) {
 pl.sendMessage("§c⚠ No players to report!");
 return;
 }
 const fm = new ActionFormData()
 .title("Report Player")
 .body(`§7Online: §b${list.length}`);
 for (let i = 0; i < list.length; i++)
 fm.button(`${list[i]}`, "textures/ui/dressing_room_skins");
 fm.show(pl).then((r) => {
 if (!r || r.isCanceled) return;
 catMenu(pl, list[r.selection]);
 });
}
function catMenu(pl, target) {
 if (!target) return;
 const fm = new ActionFormData()
 .title(`Report: ${target}`)
 .body("§7Select category");
 fm.button("Back", "textures/ui/arrow_left");
 for (let i = 0; i < CATS.length; i++)
 fm.button(`${CATS[i].n}\n${CATS[i].d}`, "textures/ui/ErrorGlyph");
 fm.show(pl).then((r) => {
 if (!r || r.isCanceled) return;
 if (r.selection === 0) {
 reportMenu(pl);
 return;
 }
 detailMenu(pl, target, CATS[r.selection - 1]);
 });
}
function detailMenu(pl, target, cat) {
 const form = new ModalFormData()
 .title("Report Details §t§p§a")
 .textField("§eReason", "Enter reason...", { defaultValue: "" })
 .textField("§eProof §7(optional)", "Enter proof...", { defaultValue: "" })
 .toggle("§eConfirm Report", { defaultValue: true });
 form.show(pl).then((res) => {
 if (!res || res.canceled) return;
 const [reason, proof, confirm] = res.formValues;
 if (!confirm) {
 pl.sendMessage("§c⚠ Report cancelled - not confirmed");
 return;
 }
 if (!reason) {
 pl.sendMessage("§c⚠ Please provide a reason for the report");
 return;
 }
 processReport(pl, target, cat, reason, proof);
 });
}
function processReport(pl, target, cat, reason, proof) {
 const name = pl.name;
 const now = Date.now();
 const cdTime = 3600000,
 max = 3;
 if (!cooldowns.has(name)) cooldowns.set(name, []);
 const ts = cooldowns.get(name).filter((t) => now - t < cdTime);
 if (ts.length >= max) {
 const sisa = Math.ceil((cdTime - (now - ts[0])) / 1000);
 pl.sendMessage(
 `§c⚠ Report limit! Try again in: §e${Math.floor(sisa / 60)}m ${sisa % 60}s`,
 );
 return;
 }
 addReport({
 targetPlayer: target,
 category: cat.n,
 reason,
 hasEvidence: proof,
 reportedBy: name,
 timestamp: now,
 status: "PENDING",
 });
 ts.push(now);
 cooldowns.set(name, ts);
 pl.sendMessage(`§a✔ Report submitted!
§7Target: §e${target}
§7Category: §e${cat.n}
§7Status: §ePending`);
 pl.runCommand("playsound random.levelup @s");
 const pls = world.getPlayers();
 for (let i = 0; i < pls.length; i++) {
 if (pls[i].hasTag("staff"))
 pls[i].sendMessage(`§c⚠ New Report!
§7From: §e${name}
§7Target: §e${target}
§7Category: §e${cat.n}`);
 }
}
export { reportMenu as showReportPlayerMenu };
