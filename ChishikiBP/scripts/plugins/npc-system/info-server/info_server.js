import { ActionFormData, ModalFormData, world, system } from "../../../core.js";
import { getInfoSection, saveInfoSection } from "./info_server_config.js";
import { Lang } from "../../../lib/Lang.js";

const SECTIONS = ["staff", "rules", "guide"];

const SECTION_BUTTONS = {
 staff: { icon: "textures/ui/icon_multiplayer" },
 rules: { icon: "textures/icon_custom/rules" },
 guide: { icon: "textures/items/book_writable" },
};

function text(player, key) {
 return Lang.t(player, `info.server.${key}`);
}

function formatSectionBody(player, section) {
 const lines = getInfoSection(section);
 if (!lines.length) return `${text(player, `${section}.hint`)}\n\n${text(player, "empty")}`;
 return `${text(player, `${section}.hint`)}\n\n${lines.join("\n\n")}`;
}

function showSectionView(player, section, backToMenu = true) {
 new ActionFormData().simpleUi()
 .title(text(player, `${section}.title`))
 .body(formatSectionBody(player, section))
 .button(text(player, "ok"), "textures/ui/check")
 .show(player)
 .then(res => {
  if (res.canceled) return;
  if (backToMenu) showInfoServerMenu(player);
 });
}

export function showInfoServerMenu(player) {
 try {
 const form = new ActionFormData().simpleUi()
 .title(text(player, "title"))
  .body(text(player, "body"));
 for (const section of SECTIONS) {
 const meta = SECTION_BUTTONS[section];
 form.button(text(player, `${section}.button`), meta.icon);
 }
 form.button(text(player, "close"), "textures/ui/cancel");
  form.show(player).then(res => {
  if (res.canceled || res.selection >= SECTIONS.length) return;
  showSectionView(player, SECTIONS[res.selection]);
  });
 } catch (error) {
 console.warn("Error showing info server menu:", error);
 player.sendMessage(text(player, "error.open"));
 }
}

export async function showInfoServerAdmin(player) {
 try {
 const form = new ActionFormData().simpleUi()
 .title(text(player, "admin.title"))
  .body(text(player, "admin.body"));
 for (const section of SECTIONS) {
 const meta = SECTION_BUTTONS[section];
 form.button(text(player, `admin.${section}.button`), "textures/ui/pencil_edit_icon");
 }
 form.button(text(player, "back"), "textures/ui/arrow_left");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection >= SECTIONS.length) return;
  await editSectionForm(player, SECTIONS[res.selection]);
 } catch (error) {
 console.warn("Error in info server admin menu:", error);
 player.sendMessage(text(player, "error.admin"));
 }
}

async function editSectionForm(player, section) {
 const current = getInfoSection(section);
 const form = new ModalFormData()
 .title(text(player, `admin.${section}.title`))
 .textField(
  `${text(player, `${section}.hint`)}\n${text(player, "admin.field.label")}`,
  text(player, "admin.field.placeholder"),
  {
  defaultValue: current.map(line => line.replace(/\n/g, "\\n")).join("\\n"),
  placeholder: text(player, "admin.field.placeholder"),
  },
 );
 const res = await form.show(player);
 if (res.canceled) return showInfoServerAdmin(player);
 const lines = String(res.formValues[0] || "")
  .split("\n")
  .map(line => line.trim().replace(/\\n/g, "\n"))
  .filter(line => line.length > 0);
 if (saveInfoSection(section, lines)) {
 player.sendMessage(text(player, "admin.saved", text(player, `${section}.label`)));
  player.runCommand("playsound random.levelup @s ~~~ 1 1");
 }
 showInfoServerAdmin(player);
}

export async function showRulesNpcAdmin(player) {
 try {
 const menu = new ActionFormData().simpleUi()
 .title(text(player, "legacy.admin.title"))
  .body(text(player, "legacy.admin.body"))
  .button(text(player, "legacy.admin.view"), "textures/ui/check")
  .button(text(player, "legacy.admin.edit"), "textures/ui/pencil_edit_icon")
  .button(text(player, "back"), "textures/ui/arrow_left");
  const res = await menu.show(player);
  if (res.canceled) return;
  if (res.selection === 0) showSectionView(player, "rules", false);
  else if (res.selection === 1) await editSectionForm(player, "rules");
 } catch (error) {
 console.warn("Error in rules admin menu:", error);
 player.sendMessage(text(player, "error.admin"));
 }
}

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
 try {
  const player = event.player;
  const target = event.target;
  if (target.typeId === "minecraft:npc" && target.hasTag("rules_npc")) {
  event.cancel = true;
  system.run(() => {
   if (player.hasTag("admin")) {
   showRulesNpcAdmin(player);
   } else {
   showSectionView(player, "rules", false);
   }
  });
  }
 } catch { }
});
