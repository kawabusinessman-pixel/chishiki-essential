import { system, world } from "../core.js";
import { ActionFormData } from "../core.js";
import { TickEventSignal } from "./anti nuke/index.js";
const messages = {
 title: "Anti-Cheat",
 features: [
 "§e⭐ Features:",
 "§f- Anti-Nuker",
 "§f- Block Restore",
 "§f- Auto Warning",
 ].join("\n"),
 buttons: {
 antiNuker: "Anti-Nuker: ",
 blockRestore: "Block Restore: ",
 autoWarn: "Auto Warning: ",
 back: "Back",
 },
 status: {
 enabled: "§aENABLED",
 disabled: "§cDISABLED",
 },
 close: "Close",
};
const antiNukerConfig = {
 enabled: false,
 blockRestore: false,
 autoWarn: false,
};
let configLoaded = false;
function getConfig() {
 try {
 if (configLoaded) {
 return antiNukerConfig;
 }
 system.run(() => {
 try {
 const config = world.getDynamicProperty("antinuker_config");
 if (!config) {
 try {
 world.setDynamicProperty(
 "antinuker_config",
 JSON.stringify(antiNukerConfig),
 );
 } catch (storageError) {
 console.warn(
 "Error saving default anti-nuker config:",
 storageError,
 );
 }
 configLoaded = true;
 return;
 }
 const parsedConfig = JSON.parse(config);
 Object.assign(antiNukerConfig, parsedConfig);
 } catch (storageError) {
 console.warn(
 "Error accessing anti-nuker config storage:",
 storageError,
 );
 }
 });
 configLoaded = true;
 return antiNukerConfig;
 } catch (error) {
 console.warn("Error getting anti-nuker config:", error);
 configLoaded = true;
 return antiNukerConfig;
 }
}
function saveConfig(config) {
 try {
 Object.assign(antiNukerConfig, config);
 system.run(() => {
 try {
 world.setDynamicProperty(
 "antinuker_config",
 JSON.stringify(antiNukerConfig),
 );
 } catch (storageError) {
 console.warn(
 "Error saving anti-nuker config to storage:",
 storageError,
 );
 }
 });
 } catch (error) {
 console.warn("Error saving anti-nuker config:", error);
 }
}
function initializeConfig() {
 try {
 const savedConfig = getConfig();
 } catch (error) {
 console.warn("Failed to initialize anti-nuker config:", error);
 }
}
const log = new Map();
const blockLog = new Map();
world.afterEvents.playerBreakBlock.subscribe(
 ({ block, brokenBlockPermutation, dimension, player }) => {
 let config;
 try {
 config = getConfig();
 } catch (error) {
 console.warn("Error getting config in anti-nuker system:", error);
 config = antiNukerConfig;
 }
 if (!config.enabled) return;
 const playerName = player.name;
 const old = log.get(playerName);
 log.set(playerName, { time: Date.now(), amount: old?.amount ?? 0 });
 if (!old) return;
 if ((old.time ?? Date.now()) < Date.now() - 50)
 return blockLog.set(playerName, {
 location: block.location,
 permutation: brokenBlockPermutation,
 });
 if (
 config.blockRestore &&
 blockLog.has(playerName) &&
 log.get(playerName).amount === 0
 ) {
 try {
 dimension
 .getBlock(blockLog.get(playerName).location)
 .setPermutation(blockLog.get(playerName).permutation);
 setTickTimeout(() => {
 try {
 const entities = dimension.getEntitiesAtBlockLocation(
 blockLog.get(playerName)?.location ?? block.location,
 );
 if (entities) {
 entities
 .filter((entity) => entity.typeId === "minecraft:item")
 ?.forEach((item) => item.kill());
 }
 blockLog.delete(playerName);
 } catch (e) {
 console.warn(`Error cleaning up block entities: ${e}`);
 }
 }, 0);
 } catch (e) {
 console.warn(`Error restoring block: ${e}`);
 }
 }
 if (config.blockRestore) {
 try {
 dimension
 .getBlock(block.location)
 .setPermutation(brokenBlockPermutation);
 setTickTimeout(() => {
 try {
 const entities = dimension.getEntitiesAtBlockLocation(
 block.location,
 );
 if (entities) {
 entities
 .filter((entity) => entity.typeId === "minecraft:item")
 .forEach((item) => item.kill());
 }
 } catch (e) {
 console.warn(`Error cleaning up items: ${e}`);
 }
 }, 0);
 } catch (e) {
 console.warn(`Error restoring broken block: ${e}`);
 }
 }
 log.set(playerName, { time: Date.now(), amount: ++old.amount });
 },
);
system.runInterval(() => {
 let config;
 try {
 config = getConfig();
 } catch (error) {
 console.warn("Error getting config in anti-nuker interval:", error);
 config = antiNukerConfig;
 }
 if (!config.enabled) return;
 let playerMap;
 if (config.autoWarn) {
 playerMap = new Map();
 for (const p of world.getPlayers()) playerMap.set(p.name, p);
 }
 for (const playerName of log.keys()) {
 if (log.get(playerName).amount > 5) {
  try {
  if (config.autoWarn && playerMap) {
   const player = playerMap.get(playerName);
   if (player) player.runCommandAsync(`say NUKER`);
  }
  } catch (e) {
  }
 }
 log.set(playerName, Object.assign(log.get(playerName), { amount: 0 }));
 }
}, 40);
world.afterEvents.playerLeave.subscribe((data) => {
 log.delete(data.playerName);
 blockLog.delete(data.playerName);
});
function setTickTimeout(callback, tick, loop = false) {
	try {
		if (loop) {
			return system.runInterval(callback, Math.max(1, tick || 1));
		} else {
			return system.runTimeout(callback, Math.max(1, tick || 1));
		}
	} catch (e) {
		try {
			return system.runTimeout(callback, 1);
		} catch (e2) {
			console.warn(`Failed to run callback even with fallback: ${e2}`);
		}
	}
}
async function toggleAntiNuker(player, feature) {
 try {
 switch (feature) {
 case "enabled":
 antiNukerConfig.enabled = !antiNukerConfig.enabled;
 break;
 case "blockRestore":
 antiNukerConfig.blockRestore = !antiNukerConfig.blockRestore;
 break;
 case "autoWarn":
 antiNukerConfig.autoWarn = !antiNukerConfig.autoWarn;
 break;
 }
 try {
 saveConfig(antiNukerConfig);
 } catch (error) {
 console.warn("Failed to save anti-nuker config:", error);
 }
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§a✓ Setting updated successfully!"}]}`,
 );
 } catch (error) {
 console.warn("Error in toggleAntiNuker:", error);
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§cError updating setting. Default values will be used."}]}`,
 );
 }
}
function createToggleForm() {
 try {
 const form = new ActionFormData()
 .title(messages.title)
 .body(messages.features);
 form.button(
 messages.buttons.antiNuker +
 (antiNukerConfig.enabled
 ? messages.status.enabled
 : messages.status.disabled),
 "textures/ui/debug_glyph_color",
 );
 form.button(
 messages.buttons.blockRestore +
 (antiNukerConfig.blockRestore
 ? messages.status.enabled
 : messages.status.disabled),
 "textures/ui/refresh_light",
 );
 form.button(
 messages.buttons.autoWarn +
 (antiNukerConfig.autoWarn
 ? messages.status.enabled
 : messages.status.disabled),
 "textures/ui/warning_alex",
 );
 form.button(messages.buttons.back, "textures/ui/arrow_left");
 return form;
 } catch (error) {
 console.warn("Error creating toggle form:", error);
 return new ActionFormData()
 .title("Error")
 .body("§cAn error occurred loading the Anti-Cheat menu.")
 .button("Back", "textures/ui/arrow_left");
 }
}
async function showOptMenu(player) {
 try {
 const toggleForm = createToggleForm();
 const response = await toggleForm.show(player);
 if (response.canceled) return;
 switch (response.selection) {
 case 0:
 await toggleAntiNuker(player, "enabled");
 break;
 case 1:
 await toggleAntiNuker(player, "blockRestore");
 break;
 case 2:
 await toggleAntiNuker(player, "autoWarn");
 break;
 case 3:
 return;
 }
 showOptMenu(player);
 } catch (error) {
 console.warn("Error showing opt menu:", error);
 try {
 player.runCommand(
 `tellraw @s {"rawtext":[{"text":"§cError showing menu. Please try again."}]}`,
 );
 } catch (e) {
 console.warn("Failed to send error message to player:", e);
 }
 }
}
try {
 initializeConfig();
} catch (error) {
 console.warn("Error during anti-nuker initialization:", error);
}
export { showOptMenu };
