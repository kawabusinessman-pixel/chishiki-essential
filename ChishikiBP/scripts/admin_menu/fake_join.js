import { ModalFormData } from "../core.js";
import { Lang } from "../lib/Lang.js";
const FAKE_ACTIONS = {
 JOIN: {
 world: "multiplayer.player.joined",
 realm: "multiplayer.player.joined.realms",
 },
 LEAVE: {
 world: "multiplayer.player.left",
 realm: "multiplayer.player.left.realms",
 },
};
const NOTIFICATION = {
 sounds: {
 error: "note.bass",
 success: "random.levelup",
 info: "random.pop",
 },
 prefixes: {
 error: "§c✘",
 success: "§a✓",
 info: "§b➢",
 },
 actionSound: "item.trident.riptide_1",
};
const ACTION_TYPE = { JOIN: 0, LEAVE: 1 };
const LOCATION_TYPE = { WORLD: 0, REALM: 1 };
function notifyPlayer(player, type, message) {
 const { sounds, prefixes } = NOTIFICATION;
 const sound = sounds[type] || sounds.info;
 const prefix = prefixes[type] || prefixes.info;
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"${prefix} ${message}"}]}`,
 );
 player.runCommand(`playsound ${sound} @s`);
}
function getCommandKey(actionIndex, locationIndex) {
 const action = actionIndex === ACTION_TYPE.JOIN ? "JOIN" : "LEAVE";
 const location = locationIndex === LOCATION_TYPE.WORLD ? "world" : "realm";
 return FAKE_ACTIONS[action][location];
}
export function showFakeJoinMenu(source) {
 const form = new ModalFormData()
 .title(Lang.t(source, "fake.title"))
 .textField(Lang.t(source, "fake.player_name"), Lang.t(source, "fake.player_name_placeholder"))
 .dropdown(Lang.t(source, "fake.action"), [
 Lang.t(source, "fake.action.join"),
 Lang.t(source, "fake.action.leave")
 ])
 .dropdown(Lang.t(source, "fake.location"), [
 Lang.t(source, "fake.location.world"),
 Lang.t(source, "fake.location.realm")
 ]);
 form.show(source).then((response) => {
 if (!response || response.canceled) return;
 const [name, actionIndex, locationIndex] = response.formValues;
 const cleanName = name?.trim();
 if (!cleanName) {
 notifyPlayer(source, "error", Lang.t(source, "fake.err.enter_name"));
 return;
 }
 try {
 const commandKey = getCommandKey(actionIndex, locationIndex);
 source.runCommand(
 `tellraw @a {"rawtext":[{"translate":"${commandKey}", "with":["§e${cleanName}§r"]}]}`,
 );
 source.runCommand(`playsound ${NOTIFICATION.actionSound} @s`);
 } catch (error) {
 console.warn("Fake join error:", error);
 notifyPlayer(source, "error", Lang.t(source, "fake.err.send_failed"));
 }
 }).catch((error) => {
 console.warn("Fake join menu error:", error);
 notifyPlayer(source, "error", Lang.t(source, "fake.err.open_failed"));
 });
}
