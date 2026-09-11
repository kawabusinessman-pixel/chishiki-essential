import { system, world } from "../../core.js";
import { isInProtectedRegion, getRegionConfig, isLobbyProtectionEnabled } from "./config.js";
import { isAuthorizedAdmin, sendProtectionMessage } from "./utils.js";

const CROP_TYPES = new Set([
	"minecraft:wheat",
	"minecraft:carrots",
	"minecraft:potatoes",
	"minecraft:beetroot",
	"minecraft:melon_stem",
	"minecraft:pumpkin_stem",
	"minecraft:torchflower_crop",
	"minecraft:pitcher_crop",
	"minecraft:sweet_berry_bush",
	"minecraft:cocoa",
	"minecraft:nether_wart",
]);
const FARM_BLOCK_TYPES = ["minecraft:farmland", ...CROP_TYPES];
const playerState = new Map();
const trackedPlayers = new Map();
const FARMLAND_CHECK_INTERVAL = 10;
const FARMLAND_CHECK_BATCH = 4;
let farmlandCheckRun;
let farmlandCursor = 0;

function getBlockSafe(dim, x, y, z) {
	try { return dim.getBlock({ x, y, z }); } catch { return null; }
}

function setWetFarmland(block) {
	try {
		if (block.typeId !== "minecraft:farmland") block.setType("minecraft:farmland");
		block.setPermutation(block.permutation.withState("moisturized_amount", 7));
	} catch {}
}

let farmlandEventsRegistered = false;

function launchFromFarmland(player, fx, fy, fz, prevPos) {
	const dim = player.dimension;
	const dx = prevPos ? player.location.x - prevPos.x : 0;
	const dz = prevPos ? player.location.z - prevPos.z : 0;
	const len = Math.sqrt(dx * dx + dz * dz);
	let dirX, dirZ;
	if (len > 0.01) {
		dirX = -dx / len;
		dirZ = -dz / len;
	} else {
		const angle = Math.random() * Math.PI * 2;
		dirX = Math.cos(angle);
		dirZ = Math.sin(angle);
	}

	const effectLocation = { x: fx, y: fy, z: fz };
	try { dim.spawnParticle("minecraft:explosion_manual", effectLocation); } catch {}
	try { dim.playSound("random.explode", effectLocation, { volume: 1, pitch: 1 }); } catch {}
	try { player.addEffect("nausea", 60, { amplifier: 1, showParticles: false }); } catch {}
	try { player.addEffect("weakness", 60, { amplifier: 2, showParticles: false }); } catch {}

	const aboveBlock = getBlockSafe(dim, fx, fy + 1, fz);
	const cropPermutation = aboveBlock && CROP_TYPES.has(aboveBlock.typeId)
		? aboveBlock.permutation
		: null;

	system.runTimeout(() => {
		setWetFarmland(getBlockSafe(dim, fx, fy, fz));
		if (cropPermutation) {
			try { getBlockSafe(dim, fx, fy + 1, fz)?.setPermutation(cropPermutation); } catch {}
		}
		try {
			for (const item of dim.getEntities({
				type: "minecraft:item",
				location: { x: fx + 0.5, y: fy + 0.5, z: fz + 0.5 },
				maxDistance: 2,
			})) item.remove();
		} catch {}
	}, 2);

	try { player.applyKnockback(dirX, dirZ, 6, 0.15); return; } catch {}

	try { player.applyImpulse({ x: dirX * 3, y: 0.3, z: dirZ * 3 }); return; } catch {}

	try { dim.createExplosion(player.location, 4, { breaksBlocks: false, causesFire: false }); return; } catch {}

	const totalDist = 14;
	const steps = 5;
	for (let i = 0; i < steps; i++) {
		system.runTimeout(() => {
			const frac = (i + 1) / steps;
			player.teleport({
				x: fx + 0.5 + Math.round(dirX * totalDist * frac),
				y: fy + 0.5,
				z: fz + 0.5 + Math.round(dirZ * totalDist * frac)
			}, { dimension: dim });
		}, i + 1);
	}
}

function checkFarmlandFooting(player, regionId, fx, fz, footY, prevPos, state) {
	for (let dy = 0; dy >= -1; dy--) {
		const cy = footY + dy;
		const block = getBlockSafe(player.dimension, fx, cy, fz);
		if (!block) continue;

		if (block.typeId === "minecraft:dirt" && dy === 0) {
			const above = getBlockSafe(player.dimension, fx, cy + 1, fz);
			if (above && CROP_TYPES.has(above.typeId)) {
				const cropPermutation = above.permutation;
				setWetFarmland(block);
				try { above.setPermutation(cropPermutation); } catch {}
			}
			continue;
		}

		if (block.typeId !== "minecraft:farmland") continue;

		if (!isAuthorizedAdmin(player, regionId)) {
			const now = Date.now();
			if (now - state.lastTeleport < 1000) return false;
			state.lastTeleport = now;
			launchFromFarmland(player, fx, cy, fz, prevPos);
			return true;
		}
	}
	return false;
}

function stopFarmlandDetectorIfIdle() {
	if (trackedPlayers.size || farmlandCheckRun === undefined) return;
	system.clearRun(farmlandCheckRun);
	farmlandCheckRun = undefined;
}

function removeTrackedPlayer(playerId) {
	trackedPlayers.delete(playerId);
	playerState.delete(playerId);
	stopFarmlandDetectorIfIdle();
}

function runFarmlandChecks() {
	if (!isLobbyProtectionEnabled()) {
		trackedPlayers.clear();
		playerState.clear();
		stopFarmlandDetectorIfIdle();
		return;
	}

	const players = Array.from(trackedPlayers.values());
	if (!players.length) {
		farmlandCursor = 0;
		stopFarmlandDetectorIfIdle();
		return;
	}
	const start = farmlandCursor % players.length;
	const end = Math.min(start + FARMLAND_CHECK_BATCH, players.length);
	farmlandCursor = end >= players.length ? 0 : end;

	for (let i = start; i < end; i++) {
		const tracked = players[i];
		const player = tracked.player;
		try {
			if (player.dimension.id !== tracked.dimensionId) {
				removeTrackedPlayer(player.id);
				continue;
			}

			const ploc = player.location;
			const fx = Math.floor(ploc.x);
			const fy = Math.floor(ploc.y) - 1;
			const fz = Math.floor(ploc.z);
			const bounds = tracked.bounds;
			if (fx < bounds.minX || fx > bounds.maxX ||
				fy < bounds.minY || fy > bounds.maxY ||
				fz < bounds.minZ || fz > bounds.maxZ) {
				removeTrackedPlayer(player.id);
				continue;
			}

			let state = playerState.get(player.id);
			if (!state) {
				state = {
					x: ploc.x, y: ploc.y, z: ploc.z,
					fx: NaN, fy: NaN, fz: NaN,
					lastTeleport: 0, lastMessage: 0,
				};
				playerState.set(player.id, state);
			}

			const prevX = state.x;
			const prevY = state.y;
			const prevZ = state.z;
			state.x = ploc.x;
			state.y = ploc.y;
			state.z = ploc.z;
			if (state.fx === fx && state.fy === fy && state.fz === fz) continue;
			state.fx = fx;
			state.fy = fy;
			state.fz = fz;

			const prevPos = { x: prevX, y: prevY, z: prevZ };
			if (checkFarmlandFooting(player, tracked.regionId, fx, fz, fy, prevPos, state)) {
				const now = Date.now();
				if (now - state.lastMessage > 5000) {
					state.lastMessage = now;
					sendProtectionMessage(player, "§c⚠ §7Farmland area is protected!");
				}
			}
		} catch (e) {
			removeTrackedPlayer(player.id);
			console.error(`[Farmland] Error checking ${player?.name}:`, e?.message || e, e?.stack || '');
		}
	}
}

export function updateFarmlandTracking(player, region, regionConfig) {
	if (!player || !region || !regionConfig?.farmlandProtection || !isLobbyProtectionEnabled()) {
		if (player) removeTrackedPlayer(player.id);
		return;
	}

	const dimensionId = player.dimension.id;
	const minX = Math.min(region.pos1.x, region.pos2.x);
	const maxX = Math.max(region.pos1.x, region.pos2.x);
	const minY = Math.min(region.pos1.y, region.pos2.y);
	const maxY = Math.max(region.pos1.y, region.pos2.y);
	const minZ = Math.min(region.pos1.z, region.pos2.z);
	const maxZ = Math.max(region.pos1.z, region.pos2.z);
	const current = trackedPlayers.get(player.id);
	if (current && current.regionId === region.id && current.dimensionId === dimensionId &&
		current.bounds.minX === minX && current.bounds.maxX === maxX &&
		current.bounds.minY === minY && current.bounds.maxY === maxY &&
		current.bounds.minZ === minZ && current.bounds.maxZ === maxZ) {
		current.player = player;
		return;
	}

	trackedPlayers.set(player.id, {
		player,
		regionId: region.id,
		dimensionId,
		bounds: { minX, maxX, minY, maxY, minZ, maxZ },
	});
	if (farmlandCheckRun === undefined) farmlandCheckRun = system.runInterval(runFarmlandChecks, FARMLAND_CHECK_INTERVAL);
}

export function registerFarmlandEvents() {
	if (farmlandEventsRegistered) return;
	farmlandEventsRegistered = true;
	world.beforeEvents.playerBreakBlock.subscribe((e) => {
		try {
			if (!isLobbyProtectionEnabled()) return;
			const { player, block } = e;
			const reg = isInProtectedRegion(block.location, block.dimension.id);
			if (!reg || !getRegionConfig(reg.id).farmlandProtection) return;
			if (isAuthorizedAdmin(player, reg.id)) return;
			e.cancel = true;
		} catch {}
	}, { blockTypes: FARM_BLOCK_TYPES });

	world.beforeEvents.playerPlaceBlock.subscribe((e) => {
		try {
			if (!isLobbyProtectionEnabled()) return;
			const { player, block } = e;
			const reg = isInProtectedRegion(block.location, block.dimension.id);
			if (!reg || !getRegionConfig(reg.id).farmlandProtection) return;
			if (isAuthorizedAdmin(player, reg.id)) return;
			const below = getBlockSafe(player.dimension, block.location.x, block.location.y - 1, block.location.z);
			if (below?.typeId === "minecraft:farmland") {
				e.cancel = true;
				sendProtectionMessage(player, "§c⚠ §7Cannot place blocks on farmland!");
			}
		} catch {}
	});

	world.afterEvents.playerSpawn.subscribe(({ player }) => {
		removeTrackedPlayer(player.id);
	});
	world.beforeEvents.playerLeave.subscribe(({ playerId }) => removeTrackedPlayer(playerId));
}
