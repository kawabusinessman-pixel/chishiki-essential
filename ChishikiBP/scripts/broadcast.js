import { ModalFormData, world, system } from './core';
import { Lang } from './lib/Lang.js';
function broadcast(source, message = "") {
 const colors = [
 [Lang.t(source, "bc.color.red"), "§c"], 
 [Lang.t(source, "bc.color.green"), "§a"], 
 [Lang.t(source, "bc.color.blue"), "§9"], 
 [Lang.t(source, "bc.color.yellow"), "§e"], 
 [Lang.t(source, "bc.color.orange"), "§6"], 
 [Lang.t(source, "bc.color.white"), "§f"]
 ];
 new ModalFormData()
 .title(Lang.t(source, "bc.title"))
 .textField(Lang.t(source, "bc.label.msg"), Lang.t(source, "bc.placeholder"), { defaultValue: message })
 .dropdown(Lang.t(source, "bc.label.color"), colors.map(c => c[0]), { defaultValue: 0 })
 .toggle(Lang.t(source, "bc.label.all"), { defaultValue: true })
 .toggle(Lang.t(source, "bc.label.admin"), { defaultValue: false })
 .show(source)
 .then(({ canceled, formValues: [msg, colorIndex, toAll, toAdmin] }) => {
 if (canceled || !msg?.trim()) {
 source.playSound("random.orb");
 return;
 }
 const targets = [...world.getAllPlayers()].filter(p => toAll || (toAdmin && p.hasTag("admin")));
 if (targets.length === 0) return;
 targets.forEach(p => p.playSound("note.pling", { pitch: 0.5 }));
 let frame = 0;
 const animationFrames = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
 const broadcastMsg = `${colors[colorIndex][1]}${msg.trim()}`;
 // Penerima ditangkap sebelum animasi berjalan; siapa pun yang keluar di tengahnya
 // membuat handle-nya mati, jadi tiap pengiriman dijaga sendiri-sendiri agar satu
 // player yang keluar tidak menggagalkan broadcast ke yang lain.
 const sendSafely = (target, action) => {
 try {
 action(target);
 } catch {}
 };
 const interval = system.runInterval(() => {
 try {
 const incomingText = Lang.t(source, "bc.msg.incoming");
 if (frame < animationFrames.length) {
 const currentFrame = animationFrames[frame];
 const actionBarText = `§e${currentFrame}${incomingText}${currentFrame}`;
 targets.forEach(p => sendSafely(p, t => t.onScreenDisplay.setActionBar(actionBarText)));
 frame++;
 } else {
 system.clearRun(interval);
 const bcHeader = Lang.t(source, "bc.msg.header");
 const broadcastFull = `§e═══════§6${bcHeader}§e═══════\n\n${broadcastMsg}\n\n§e═════════════════════`;
 targets.forEach(p => sendSafely(p, t => {
 t.sendMessage(broadcastFull);
 t.playSound("random.levelup");
 t.spawnParticle("minecraft:totem_particle", { x: t.location.x, y: t.location.y + 2, z: t.location.z });
 }));
 }
 } catch (error) {
 system.clearRun(interval);
 console.warn(`Broadcast animation stopped: ${error}`);
 }
 }, 2);
 source.playSound("ui.toast.challenge_complete");
 })
 .catch((error) => {
 console.warn(`Broadcast form failed: ${error}`);
 source.playSound("block.note_block.bass");
 });
}
export { broadcast };
