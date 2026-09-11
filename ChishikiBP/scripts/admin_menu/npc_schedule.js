import { system, world, ActionFormData, ModalFormData, MessageFormData } from "../core.js";
import { Lang } from "../lib/Lang.js";

export const SCHEDULE_PROP = "npc:schedule";

function isEntityUsable(e) {
 try { return e?.isValid === true; } catch { return false; }
}

function toSec(d, h, m, s) {
 return (d|0)*86400 + (h|0)*3600 + (m|0)*60 + (s|0);
}

function splitSec(total) {
 total = Math.max(0, total|0);
 const d = Math.floor(total/86400); total%=86400;
 const h = Math.floor(total/3600); total%=3600;
 const m = Math.floor(total/60);
 const s = total%60;
 return { d,h,m,s };
}

export function formatDuration(sec, player=null) {
 sec = Math.max(0, sec|0);
 if (sec === 0) {
  try { const t = Lang.t(player, "npc.schedule.time.zero"); if (t && t !== "npc.schedule.time.zero") return t; } catch {}
  return "0 Detik";
 }
 const {d,h,m,s} = splitSec(sec);
 const parts=[];
 const add = (key, val) => {
  try {
   const t = Lang.t(player, key, val);
   if (t && t !== key) { parts.push(t); return; }
  } catch {}
  parts.push(`${val} ` + (key.endsWith(".day")?"Hari":key.endsWith(".hour")?"Jam":key.endsWith(".minute")?"Menit":"Detik"));
 };
 if (d) add("npc.schedule.time.day", d);
 if (h) add("npc.schedule.time.hour", h);
 if (m) add("npc.schedule.time.minute", m);
 if (s || !parts.length) add("npc.schedule.time.second", s);
 return parts.join(" ");
}

export function formatCompact(sec) {
 sec = Math.max(0, sec|0);
 const {d,h,m,s}=splitSec(sec);
 if (d) return `${d}d ${h}h ${m}m`;
 if (h) return `${h}h ${m}m ${s}s`;
 if (m) return `${m}m ${s}s`;
 return `${s}s`;
}

export function getNpcSchedule(entity) {
 if (!isEntityUsable(entity)) return null;
 try {
  const raw = entity.getDynamicProperty(SCHEDULE_PROP);
  if (typeof raw !== "string" || !raw) return null;
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object") return null;
  const closeSec = Math.max(0, (data.closeSec|0));
  const openSec = Math.max(0, (data.openSec|0));
  const base = Number.isFinite(data.base) ? data.base : Date.now();
  let closeEnabled, openEnabled;
  if (typeof data.closeEnabled === "boolean" || typeof data.openEnabled === "boolean") {
   closeEnabled = !!data.closeEnabled;
   openEnabled = !!data.openEnabled;
  } else if (typeof data.enabled === "boolean") {
   if (!data.enabled) { closeEnabled = false; openEnabled = false; }
   else { closeEnabled = closeSec>0; openEnabled = openSec>0; if (!closeEnabled && !openEnabled) { closeEnabled=false; openEnabled=true; } }
  } else {
   closeEnabled = closeSec>0;
   openEnabled = openSec>0;
  }
  return { closeSec, openSec, base, closeEnabled, openEnabled };
 } catch { return null; }
}

export function setNpcSchedule(entity, schedule) {
 if (!isEntityUsable(entity)) return false;
 try {
  const toSave = {
   closeSec: Math.max(0, schedule.closeSec|0),
   openSec: Math.max(0, schedule.openSec|0),
   base: Number.isFinite(schedule.base) ? schedule.base : Date.now(),
   closeEnabled: !!schedule.closeEnabled,
   openEnabled: !!schedule.openEnabled
  };
  entity.setDynamicProperty(SCHEDULE_PROP, JSON.stringify(toSave));
  return true;
 } catch (e) { console.warn("[NPC Schedule] save failed", e); return false; }
}

export function getNpcScheduleState(entity) {
 const sched = getNpcSchedule(entity);
 if (!sched || (!sched.closeEnabled && !sched.openEnabled)) return { enabled:false, isOpen:true, remainingSec:0, closeSec:0, openSec:0, closeEnabled:false, openEnabled:false };
 const closeSec = sched.closeEnabled ? (sched.closeSec|0) : 0;
 const openSec = sched.openEnabled ? (sched.openSec|0) : 0;
 const base = sched.base;
 const closeEnabled = !!sched.closeEnabled;
 const openEnabled = !!sched.openEnabled;
 if (!closeEnabled && !openEnabled) return { enabled:false, isOpen:true, remainingSec:0, closeSec, openSec, base, closeEnabled, openEnabled };
 if (closeEnabled && openEnabled) {
  if (closeSec<=0 && openSec<=0) return { enabled:true, isOpen:true, remainingSec:0, closeSec, openSec, base, closeEnabled, openEnabled };
  if (openSec<=0) return { enabled:true, isOpen:false, remainingSec: Infinity, closeSec, openSec, base, closeEnabled, openEnabled };
  if (closeSec<=0) {
   const elapsed = (Date.now()-base)/1000;
   const pos = elapsed>=0 ? elapsed % openSec : 0;
   const remaining = openSec - pos;
   return { enabled:true, isOpen:true, remainingSec: Math.ceil(remaining), closeSec, openSec, base, closeEnabled, openEnabled };
  }
  const cycle = closeSec + openSec;
  const elapsed = (Date.now()-base)/1000;
  const pos = elapsed>=0 ? elapsed % cycle : 0;
  const isOpen = pos >= closeSec;
  const remaining = isOpen ? (cycle - pos) : (closeSec - pos);
  return { enabled:true, isOpen, remainingSec: Math.ceil(remaining), closeSec, openSec, base, cycle, closeEnabled, openEnabled };
 }
 if (closeEnabled && !openEnabled) {
  const elapsed = (Date.now()-base)/1000;
  if (elapsed < closeSec) return { enabled:true, isOpen:false, remainingSec: Math.ceil(closeSec - elapsed), closeSec, openSec, base, closeEnabled, openEnabled };
  return { enabled:true, isOpen:true, remainingSec: Infinity, closeSec, openSec, base, closeEnabled, openEnabled };
 }
 if (!closeEnabled && openEnabled) {
  const elapsed = (Date.now()-base)/1000;
  if (elapsed < openSec) return { enabled:true, isOpen:true, remainingSec: Math.ceil(openSec - elapsed), closeSec, openSec, base, closeEnabled, openEnabled };
  return { enabled:true, isOpen:false, remainingSec: Infinity, closeSec, openSec, base, closeEnabled, openEnabled };
 }
 return { enabled:false, isOpen:true, remainingSec:0, closeSec, openSec, base, closeEnabled, openEnabled };
}

export function isNpcOpenForPlayer(player, npcEntity) {
 try { if (player?.hasTag?.("admin")) return true; } catch {}
 const st = getNpcScheduleState(npcEntity);
 if (!st.enabled) return true;
 return st.isOpen;
}

export async function showNpcScheduleMenu(player, npcEntity) {
 if (!isEntityUsable(npcEntity) || !isEntityUsable(player)) return;
 const sched = getNpcSchedule(npcEntity);
 const state = getNpcScheduleState(npcEntity);
 const closeEnabled = sched?.closeEnabled === true;
 const openEnabled = sched?.openEnabled === true;
 const enabled = state.enabled;
 const closeStr = sched ? formatDuration(sched.closeSec, player) : formatDuration(0, player);
 const openStr = sched ? formatDuration(sched.openSec, player) : formatDuration(0, player);
 const statusOpen = openEnabled ? Lang.t(player, "npc.schedule.menu.status.open_active") : Lang.t(player, "npc.schedule.menu.status.open_inactive");
 const statusClose = closeEnabled ? Lang.t(player, "npc.schedule.menu.status.close_active") : Lang.t(player, "npc.schedule.menu.status.close_inactive");
 const statusCombined = `${statusOpen} §7| ${statusClose}`;
 let stateLine = "";
 if (enabled) {
  if (state.isOpen) {
   const rem = state.remainingSec===Infinity?"∞":formatDuration(state.remainingSec, player);
   stateLine = Lang.t(player, "npc.schedule.menu.state.open", rem);
  } else {
   const rem = state.remainingSec===Infinity?"∞":formatDuration(state.remainingSec, player);
   stateLine = Lang.t(player, "npc.schedule.menu.state.closed", rem);
  }
 } else {
  stateLine = Lang.t(player, "npc.schedule.menu.state.always_open");
 }
 const body = Lang.t(player, "npc.schedule.menu.body2", statusCombined, stateLine, closeStr, openStr, sched?new Date(sched.base).toLocaleString():"-");
 const form = new ActionFormData().simpleUi()
  .title(Lang.t(player, "npc.schedule.menu.title"))
  .body(body)
  .button(openEnabled ? Lang.t(player, "npc.schedule.menu.btn.disable_open") : Lang.t(player, "npc.schedule.menu.btn.enable_open"), openEnabled ? "textures/ui/cancel" : "textures/ui/realms_green_check")
  .button(closeEnabled ? Lang.t(player, "npc.schedule.menu.btn.disable_close") : Lang.t(player, "npc.schedule.menu.btn.enable_close"), closeEnabled ? "textures/ui/cancel" : "textures/ui/realms_green_check")
  .button(Lang.t(player, "npc.schedule.menu.btn.set_open"), "textures/items/clock_item")
  .button(Lang.t(player, "npc.schedule.menu.btn.set_close"), "textures/items/clock_item")
  .button(Lang.t(player, "npc.schedule.menu.btn.reset"), "textures/ui/refresh_light")
  .button(Lang.t(player, "npc.schedule.menu.btn.delete"), "textures/ui/trash_default")
  .button(Lang.t(player, "common.back"), "textures/ui/arrow_left");
 const res = await form.show(player);
 if (res.canceled) return;
 switch(res.selection){
  case 0: {
   const cur = sched ? {...sched} : { closeSec:3600, openSec:3600, base: Date.now(), closeEnabled:false, openEnabled:true };
   cur.openEnabled = !openEnabled;
   if (cur.openEnabled && !cur.closeEnabled && cur.openSec<=0) cur.openSec = 3600;
   if (!cur.openEnabled && !cur.closeEnabled) { /* both off => always open */ }
   cur.base = Date.now();
   setNpcSchedule(npcEntity, cur);
   player.sendMessage(cur.openEnabled ? Lang.t(player, "npc.schedule.msg.open_enabled") : Lang.t(player, "npc.schedule.msg.open_disabled"));
   try{ player.runCommand("playsound random.pop @s ~~~ 1 1");}catch{}
   return showNpcScheduleMenu(player, npcEntity);
  }
  case 1: {
   const cur = sched ? {...sched} : { closeSec:3600, openSec:3600, base: Date.now(), closeEnabled:false, openEnabled:true };
   cur.closeEnabled = !closeEnabled;
   if (cur.closeEnabled && cur.closeSec<=0) cur.closeSec = 3600;
   cur.base = Date.now();
   setNpcSchedule(npcEntity, cur);
   player.sendMessage(cur.closeEnabled ? Lang.t(player, "npc.schedule.msg.close_enabled") : Lang.t(player, "npc.schedule.msg.close_disabled"));
   try{ player.runCommand("playsound random.pop @s ~~~ 1 1");}catch{}
   return showNpcScheduleMenu(player, npcEntity);
  }
  case 2: return showDurationForm(player, npcEntity, "open");
  case 3: return showDurationForm(player, npcEntity, "close");
  case 4: {
   const cur = getNpcSchedule(npcEntity);
   if (!cur) { player.sendMessage(Lang.t(player, "npc.schedule.msg.no_schedule")); return showNpcScheduleMenu(player,npcEntity); }
   cur.base = Date.now();
   if (!cur.closeEnabled && !cur.openEnabled) { cur.openEnabled = true; if (cur.openSec<=0) cur.openSec = 3600; }
   setNpcSchedule(npcEntity, cur);
   player.sendMessage(Lang.t(player, "npc.schedule.msg.reset"));
   return showNpcScheduleMenu(player, npcEntity);
  }
  case 5: {
   try { npcEntity.setDynamicProperty(SCHEDULE_PROP, undefined); } catch{}
   player.sendMessage(Lang.t(player, "npc.schedule.msg.deleted"));
   return;
  }
  case 6: return;
 }
}

async function showDurationForm(player, npcEntity, type) {
 const sched = getNpcSchedule(npcEntity) || { closeSec:3600, openSec:3600, base: Date.now(), closeEnabled:false, openEnabled:true };
 const sec = type==="close" ? sched.closeSec : sched.openSec;
 const {d,h,m,s}=splitSec(sec);
 const isClose = type==="close";
 const title = isClose ? Lang.t(player, "npc.schedule.form.close.title") : Lang.t(player, "npc.schedule.form.open.title");
 const desc = isClose ? Lang.t(player, "npc.schedule.form.close.desc") : Lang.t(player, "npc.schedule.form.open.desc");
 const form = new ModalFormData()
  .title(title)
  .label(Lang.t(player, "npc.schedule.form.label", desc))
  .textField(Lang.t(player, "npc.schedule.form.field.day"), "0", { defaultValue: String(d) })
  .textField(Lang.t(player, "npc.schedule.form.field.hour"), "0", { defaultValue: String(h) })
  .textField(Lang.t(player, "npc.schedule.form.field.minute"), "0", { defaultValue: String(m) })
  .textField(Lang.t(player, "npc.schedule.form.field.second"), "0", { defaultValue: String(s) });
 const res = await form.show(player);
 if (res.canceled) return showNpcScheduleMenu(player, npcEntity);
 let [dStr,hStr,mStr,sStr]=res.formValues.slice(1);
 let dV=parseInt(dStr), hV=parseInt(hStr), mV=parseInt(mStr), sV=parseInt(sStr);
 if ([dV,hV,mV,sV].some(v=>isNaN(v)||v<0)) { player.sendMessage(Lang.t(player, "npc.schedule.msg.invalid_input")); return showDurationForm(player,npcEntity,type); }
 dV=Math.min(365,dV); hV=Math.min(23,hV); mV=Math.min(59,mV); sV=Math.min(59,sV);
 const total = toSec(dV,hV,mV,sV);
 if (isClose) { sched.closeSec = total; sched.closeEnabled = total>0; } else { sched.openSec = total; sched.openEnabled = total>0; }
 if (!sched.base) sched.base = Date.now();
 if (!sched.closeEnabled && !sched.openEnabled) {
  player.sendMessage(Lang.t(player, "npc.schedule.msg.both_zero"));
 }
 sched.base = Date.now();
 setNpcSchedule(npcEntity, sched);
 player.sendMessage(isClose ? Lang.t(player, "npc.schedule.msg.updated_close", formatDuration(total, player)) : Lang.t(player, "npc.schedule.msg.updated_open", formatDuration(total, player)));
 try{ player.runCommand("playsound random.levelup @s ~~~ 1 1");}catch{}
 return showNpcScheduleMenu(player, npcEntity);
}
