import { world } from "../../core.js";
const dbKey = "custom_buttons";
export function getAllButtons() {
 try {
 const buttons = world.getDynamicProperty(dbKey);
 if (!buttons) {
 world.setDynamicProperty(dbKey, "[]");
 return [];
 }
 return JSON.parse(buttons);
 } catch (error) {
 console.warn("Error getting buttons:", error);
 return [];
 }
}
export function saveAllButtons(buttons) {
 try {
 world.setDynamicProperty(dbKey, JSON.stringify(buttons));
 } catch (error) {
 console.warn("Error saving buttons:", error);
 }
}
export function addButton(button) {
 const buttons = getAllButtons();
 buttons.push(button);
 saveAllButtons(buttons);
}
export function removeButton(index) {
 const buttons = getAllButtons();
 buttons.splice(index, 1);
 saveAllButtons(buttons);
}
export function updateButton(index, button) {
 const buttons = getAllButtons();
 buttons[index] = button;
 saveAllButtons(buttons);
}
