
import { world, system } from '../../core.js';
import { backToDieConfig } from "./config.js";
import { deathLocationsDB } from "./database.js";
import { sendAnnounce } from "../../function/announceTitle.js";


world.afterEvents.entityDie.subscribe(async (event) => {
 const { deadEntity } = event;
 if (deadEntity.typeId !== "minecraft:player") return;
 const isEnabled = await backToDieConfig.isEnabled();
 if (!isEnabled) return;
 const location = {
 x: Math.floor(deadEntity.location.x),
 y: Math.floor(deadEntity.location.y),
 z: Math.floor(deadEntity.location.z),
 dimension: deadEntity.dimension.id
 };
 deathLocationsDB.set(deadEntity.name, location);
});

export async function teleportToDeathLocation(player) {
 const isEnabled = await backToDieConfig.isEnabled();
 if (!isEnabled) {
 player.sendMessage("§c Back to death location feature is currently disabled!");
 return false;
 }
 const lastDeathLocation = deathLocationsDB.get(player.name);
 if (!lastDeathLocation) {
 player.sendMessage("§c No death location saved!");
 return false;
 }
 try {
 const targetDimension = world.getDimension(lastDeathLocation.dimension);
 system.run(() => {
 player.teleport(
 {
 x: lastDeathLocation.x,
 y: lastDeathLocation.y,
 z: lastDeathLocation.z
 },
 {
 dimension: targetDimension,
 rotation: { x: 0, y: 0 }
 }
 );
 });
 player.sendMessage(`§a Teleported to last death location: §f${lastDeathLocation.x} ${lastDeathLocation.y} ${lastDeathLocation.z}`);
 sendAnnounce(player, "§4RETURN BY DEATH", `BACK §7${String(lastDeathLocation.dimension || "").replace("minecraft:", "")}`);
 deathLocationsDB.delete(player.name);
 return true;
 } catch (error) {
 console.warn("Error while teleporting to death location:", error);
 player.sendMessage("§c Failed to teleport to death location!");
 return false;
 }
}


export { backToDieConfig, deathLocationsDB };
