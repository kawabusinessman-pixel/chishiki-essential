import { ActionFormData } from '../core.js';
import { showMainMenu } from "../kiwora";
import { timeForm } from "../forms";
export function showTimeWeatherMenu(source) {
 timeForm(source).show(source).then((response) => {
 if (response.canceled) return;
 const selection = response.selection;
 if (selection === 6) {
 showMainMenu(source);
 return;
 }
 let command = "";
 switch (selection) {
 case 0: command = "time set day"; break;
 case 1: command = "time set sunset"; break;
 case 2: command = "time set night"; break;
 case 3: command = "weather clear"; break;
 case 4: command = "weather rain"; break;
 case 5: command = "weather thunder"; break;
 }
 if (command !== "") {
 source.runCommand(command);
 }
 });
}
