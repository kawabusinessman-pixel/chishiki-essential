import { ActionFormData } from "../../core.js";
import { LobbyProtection } from "./lobby_p.js";
import { Lang } from "../../lib/Lang.js";
const getMenus = (player) => ({
 main: {
 title: Lang.t(player, "lobby.help.main.title"),
 body: Lang.t(player, "lobby.help.main.body"),
 buttons: [
 { text: Lang.t(player, "lobby.help.main.btn.admin"), icon: "textures/ui/permissions_member_star" },
 { text: Lang.t(player, "lobby.help.main.btn.usage"), icon: "textures/ui/how_to_play_button_default" },
 { text: Lang.t(player, "lobby.help.main.btn.features"), icon: "textures/ui/icon_lock" },
 { text: Lang.t(player, "common.back"), icon: "textures/ui/arrow_left" }
 ]
 },
 admin: {
 title: Lang.t(player, "lobby.help.admin.title"),
 body: Lang.t(player, "lobby.help.admin.body"),
 buttons: [{ text: Lang.t(player, "common.back"), icon: "textures/ui/arrow_left" }]
 },
 usage: {
 title: Lang.t(player, "lobby.help.usage.title"),
 body: Lang.t(player, "lobby.help.usage.body"),
 buttons: [{ text: Lang.t(player, "common.back"), icon: "textures/ui/arrow_left" }]
 },
 features: {
 title: Lang.t(player, "lobby.help.features.title"),
 body: Lang.t(player, "lobby.help.features.body"),
 buttons: [{ text: Lang.t(player, "common.back"), icon: "textures/ui/arrow_left" }]
 }
});
const showMenu = (player, type, callback) => {
 const menu = getMenus(player)[type];
 const form = new ActionFormData().simpleUi()
 .title(menu.title)
 .body(menu.body);
 menu.buttons.forEach(btn => form.button(btn.text, btn.icon));
 form.show(player).then(r => !r.canceled && callback?.(r.selection));
};
export const showHelpMenu = player => showMenu(player, 'main', sel => {
 const handlers = [
 () => showMenu(player, 'admin', () => showHelpMenu(player)),
 () => showMenu(player, 'usage', () => showHelpMenu(player)),
 () => showMenu(player, 'features', () => showHelpMenu(player)),
 () => LobbyProtection.showMainMenu(player)
 ];
 handlers[sel]?.();
});