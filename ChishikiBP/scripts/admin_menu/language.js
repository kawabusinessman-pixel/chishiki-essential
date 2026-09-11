import { ActionFormData, system } from '../core.js';
import { Lang, LANG_META } from "../lib/Lang.js";

const returnToCaller = (onBack) => {
 if (typeof onBack === "function") system.runTimeout(onBack, 2);
};

export function showLanguageMenu(player, onBack) {
 const currentLang = Lang.get(player);
 const currentLabel = Lang.t(player, "lang.current");
 const form = new ActionFormData()
 .title(Lang.t(player, "lang.menu.title"))
 .body(Lang.t(player, "lang.menu.body"));
 for (const meta of LANG_META) {
  const mark = meta.code === currentLang ? "\n§a" + currentLabel : "";
  form.button(meta.label + mark, meta.flag);
 }
 form.button(Lang.t(player, "common.back"), "textures/ui/arrow_left");
 form.show(player)
 .then(({ selection, canceled }) => {
  if (canceled) return;
  const picked = LANG_META[selection];
  if (picked) {
   Lang.set(player, picked.code);
   player.sendMessage(Lang.t(player, "cmd.lang.success", picked.label));
  }
  returnToCaller(onBack);
 });
}
