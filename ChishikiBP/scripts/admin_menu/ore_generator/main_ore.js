import { system, world, ActionFormData, ModalFormData } from "../../core";
import { getGenerators, addGenerator, removeGenerator, updateGenerator } from './database_ore.js';

const ORE_TYPES = {
  coal: { block: 'coal_ore', weight: 20, heightRange: { min: 0.6, max: 1.0 } },
  iron: { block: 'iron_ore', weight: 15, heightRange: { min: 0.4, max: 0.8 } },
  gold: { block: 'gold_ore', weight: 10, heightRange: { min: 0.2, max: 0.6 } },
  redstone: { block: 'redstone_ore', weight: 12, heightRange: { min: 0.1, max: 0.4 } },
  lapis: { block: 'lapis_ore', weight: 8, heightRange: { min: 0.1, max: 0.5 } },
  diamond: { block: 'diamond_ore', weight: 5, heightRange: { min: 0, max: 0.3 } },
  emerald: { block: 'emerald_ore', weight: 3, heightRange: { min: 0, max: 0.2 } }
};

const DEFAULT_SETTINGS = {
  enabled: true, autoReset: true, resetInterval: 300,
  stoneChance: 60, cobbleChance: 20,
  ores: { coal: true, iron: true, gold: true, diamond: true, emerald: true, lapis: true, redstone: true },
  oreChances: { coal: 20, iron: 15, gold: 10, diamond: 5, emerald: 3, lapis: 8, redstone: 12 }
};

const generatorCountdowns = new Map();
const generatorIntervals = new Map();

// Track what each player is currently creating
// Map<playerId, { name: string, step: 'safePos' | 'pos1' | 'pos2' }>
const creating = new Map();

/* ──────────── ENTRY POINT ──────────── */

function showMainMenu(player) {
  const state = creating.get(player.id);
  if (state) {
    const gen = getGenerators().find(g => g.name === state.name);
    if (!gen) {
      creating.delete(player.id);
    } else if (!gen.safePos) {
      return askSafePos(player, state.name);
    } else if (!gen.pos1) {
      return askPos1(player, state.name);
    } else if (!gen.pos2) {
      return askPos2(player, state.name);
    } else {
      creating.delete(player.id);
    }
  }

  const generators = getGenerators();
  const running = generators.filter(g => g.settings.enabled && g.pos1 && g.pos2).length;
  const total = generators.length;
  const incomplete = generators.filter(g => !g.pos1 || !g.pos2).length;

  new ActionFormData().simpleUi()
    .title('Ore Generator')
    .body(`Total: ${total} | Running: ${running}${incomplete ? ` | Incomplete: ${incomplete}` : ''}`)
    .button('New Generator', 'textures/ui/icon_iron_pickaxe')
    .button('Set Location', 'textures/blocks/diamond_ore')
    .button('Manage', 'textures/ui/gear')
    .button('Remove', 'textures/ui/trash')
    .show(player).then(r => {
      if (r.canceled) return;
      [createGen, setLocationMenu, manageList, removeList][r.selection](player);
    });
}

/* ──────────── CREATE WIZARD ──────────── */

function createGen(player) {
  new ModalFormData()
    .title('New Generator')
    .textField('Name', 'Example: Mine1', { defaultValue: '', placeholder: 'Unique name' })
    .textField('Reset Interval (seconds)', '300', { defaultValue: '300', placeholder: 'Seconds' })
    .toggle('Auto Reset', { defaultValue: true })
    .slider('Stone %', 0, 100, { defaultValue: 60, valueStep: 5 })
    .slider('Cobblestone %', 0, 100, { defaultValue: 20, valueStep: 5 })
    .show(player).then(r => {
      if (r.canceled) return;
      const [name, interval, autoReset, stonePct, cobblePct] = r.formValues;
      if (!name?.trim()) {
        player.sendMessage('Please enter a name!');
        return createGen(player);
      }
      if (getGenerators().find(g => g.name === name)) {
        player.sendMessage('Name already exists!');
        return createGen(player);
      }

      const settings = {
        ...DEFAULT_SETTINGS,
        autoReset,
        resetInterval: Math.max(1, Math.floor(Number(interval) || 300)),
        stoneChance: stonePct,
        cobbleChance: cobblePct,
      };

      addGenerator(name.trim(), null, null, settings);
      creating.set(player.id, { name: name.trim(), step: 'safePos' });

      player.sendMessage(`"${name}" created! Stand at the safe teleport spot and open the menu again.`);
      player.runCommand('playsound random.levelup @s');
    });
}

/* ──────────── SAFE POS ──────────── */

function askSafePos(player, name) {
  new ActionFormData().simpleUi()
    .title('Step 1/3 - Safe Teleport')
    .body(`Generator: ${name}\n\nStand where players should teleport to.\nThis should be outside the generator area.`)
    .button('Set my location as SafePos', 'textures/ui/check')
    .button('Cancel creation', 'textures/ui/trash')
    .show(player).then(r => {
      if (r.canceled) return;
      if (r.selection === 1) {
        removeGenerator(name);
        creating.delete(player.id);
        player.sendMessage('Creation cancelled.');
        return;
      }
      const pos = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z)
      };
      updateGenerator(name, { safePos: pos });
      creating.set(player.id, { name, step: 'pos1' });
      player.sendMessage(`SafePos saved (${pos.x} ${pos.y} ${pos.z})`);
      player.runCommand('playsound random.levelup @s');
      player.sendMessage('Now stand at the first corner of the area, then reopen the menu.');
    });
}

/* ──────────── POS 1 ──────────── */

function askPos1(player, name) {
  const gen = getGenerators().find(g => g.name === name);
  if (!gen) {
    creating.delete(player.id);
    return player.sendMessage('Generator not found!');
  }

  new ActionFormData().simpleUi()
    .title('Step 2/3 - Corner 1')
    .body(`Generator: ${name}\nSafePos: ${gen.safePos.x} ${gen.safePos.y} ${gen.safePos.z}\n\nStand at the first corner of the area.`)
    .button('Set my location as Pos 1', 'textures/ui/check')
    .button('Back to menu', 'textures/ui/arrow_left')
    .show(player).then(r => {
      if (r.canceled) return;
      if (r.selection === 1) {
        creating.delete(player.id);
        return showMainMenu(player);
      }
      const pos = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z)
      };
      updateGenerator(name, { pos1: pos, pos2: null });
      creating.set(player.id, { name, step: 'pos2' });
      player.sendMessage(`Pos 1 saved (${pos.x} ${pos.y} ${pos.z})`);
      player.runCommand('playsound random.levelup @s');
      player.sendMessage('Now stand at the opposite corner, then reopen the menu.');
    });
}

/* ──────────── POS 2 ──────────── */

function askPos2(player, name) {
  const gen = getGenerators().find(g => g.name === name);
  if (!gen?.pos1) {
    creating.delete(player.id);
    return player.sendMessage('Pos 1 not set! Something went wrong.');
  }

  new ActionFormData().simpleUi()
    .title('Step 3/3 - Corner 2')
    .body(`Generator: ${name}\nPos 1: ${gen.pos1.x} ${gen.pos1.y} ${gen.pos1.z}\n\nStand at the opposite corner.`)
    .button('Set my location as Pos 2', 'textures/ui/check')
    .button('Back to menu', 'textures/ui/arrow_left')
    .show(player).then(r => {
      if (r.canceled) return;
      if (r.selection === 1) {
        creating.delete(player.id);
        return showMainMenu(player);
      }
      const pos = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z)
      };
      updateGenerator(name, { pos1: gen.pos1, pos2: pos });

      const updated = getGenerators().find(g => g.name === name);
      if (updated) {
        resetGenerator(updated);
        if (updated.settings.autoReset && updated.settings.enabled)
          startGenerator(name, updated.settings);
      }

      creating.delete(player.id);
      player.sendMessage(`Generator "${name}" is complete and running!`);
      player.runCommand('playsound random.levelup @s');
    });
}

/* ──────────── SET LOCATION ──────────── */

function setLocationMenu(player) {
  const gens = getGenerators().filter(g => !g.pos1 || !g.pos2);
  if (!gens.length) {
    player.sendMessage('All generators have positions set.');
    return showMainMenu(player);
  }
  const form = new ActionFormData().simpleUi()
    .title('Set Location')
    .body('Select an incomplete generator.');
  gens.forEach(g => {
    const s = !g.safePos ? 'No SafePos' : !g.pos1 ? 'Need Pos 1' : 'Need Pos 2';
    form.button(`${g.name}\n${s}`, 'textures/ui/icon_iron_pickaxe');
  });
  form.show(player).then(r => {
    if (r.canceled) return showMainMenu(player);
    const gen = gens[r.selection];
    if (!gen) return showMainMenu(player);
    if (!gen.safePos) askSafePos(player, gen.name);
    else if (!gen.pos1) askPos1(player, gen.name);
    else askPos2(player, gen.name);
  });
}

/* ──────────── MANAGE ──────────── */

function manageList(player) {
  const gens = getGenerators();
  if (!gens.length) return noGens(player);
  const form = new ActionFormData().simpleUi()
    .title('Manage')
    .body('Select a generator to edit.');
  gens.forEach(g => {
    const loc = g.pos1 && g.pos2 ? 'Has Location' : 'No Location';
    const on = g.settings.enabled ? 'Enabled' : 'Disabled';
    form.button(`${g.name}\n${on} | ${loc}`, 'textures/ui/gear');
  });
  form.show(player).then(r => {
    if (r.canceled) return;
    if (gens[r.selection]) editSettings(player, gens[r.selection].name);
  });
}

function editSettings(player, name) {
  const gen = getGenerators().find(g => g.name === name);
  if (!gen) return showMainMenu(player);
  const s = gen.settings;

  const form = new ModalFormData()
    .title(name)
    .toggle('Enabled', { defaultValue: s.enabled })
    .toggle('Auto Reset', { defaultValue: s.autoReset })
    .textField('Reset Interval (seconds)', '300', { defaultValue: String(s.resetInterval) })
    .slider('Stone %', 0, 100, { defaultValue: s.stoneChance, valueStep: 5 })
    .slider('Cobblestone %', 0, 100, { defaultValue: s.cobbleChance, valueStep: 5 });

  for (const [ore, enabled] of Object.entries(s.ores)) {
    const chance = s.oreChances?.[ore] ?? DEFAULT_SETTINGS.oreChances[ore];
    form.toggle(`${ore.charAt(0).toUpperCase() + ore.slice(1)} (${chance}%)`, { defaultValue: enabled });
  }

  form.show(player).then(r => {
    if (r.canceled) return;
    const [enabled, autoReset, interval, stonePct, cobblePct, ...oreToggles] = r.formValues;
    const oreKeys = Object.keys(s.ores);
    const newOres = {};
    const newChances = {};
    oreKeys.forEach((k, i) => {
      newOres[k] = oreToggles[i];
      newChances[k] = s.oreChances?.[k] ?? DEFAULT_SETTINGS.oreChances[k];
    });

    updateGenerator(name, {
      settings: {
        enabled, autoReset,
        resetInterval: Math.max(1, Math.floor(Number(interval) || 300)),
        stoneChance: stonePct, cobbleChance: cobblePct,
        ores: newOres, oreChances: newChances
      }
    });

    player.sendMessage(`"${name}" updated!`);
    player.runCommand('playsound random.levelup @s');

    const updated = getGenerators().find(g => g.name === name);
    if (updated?.pos1 && updated?.pos2) {
      generatorCountdowns.set(name, updated.settings.resetInterval);
      if (updated.settings.enabled && updated.settings.autoReset)
        startGenerator(name, updated.settings);
      else {
        const iv = generatorIntervals.get(name);
        if (iv) { system.clearRun(iv); generatorIntervals.delete(name); }
      }
    }
  });
}

/* ──────────── REMOVE ──────────── */

function removeList(player) {
  const gens = getGenerators();
  if (!gens.length) return noGens(player);
  const form = new ActionFormData().simpleUi()
    .title('Remove Generator')
    .body('Select a generator to remove.');
  gens.forEach(g => form.button(g.name, 'textures/ui/trash'));
  form.show(player).then(r => {
    if (r.canceled) return;
    const gen = gens[r.selection];
    if (!gen) return;
    creating.delete(player.id);
    if (gen.pos1 && gen.pos2) clearGeneratorArea(gen);
    const iv = generatorIntervals.get(gen.name);
    if (iv) { system.clearRun(iv); generatorIntervals.delete(gen.name); }
    generatorCountdowns.delete(gen.name);
    removeGenerator(gen.name);
    player.sendMessage(`"${gen.name}" removed.`);
    player.runCommand('playsound.random.break @s');
  });
}

function noGens(player) {
  player.sendMessage('No generators yet! Create one first.');
  showMainMenu(player);
}

/* ──────────── CORE LOGIC ──────────── */

function isPlayerInGenerator(player, gen) {
  const { pos1, pos2 } = gen;
  if (!pos1 || !pos2) return false;
  return (
    player.location.x >= Math.min(pos1.x, pos2.x) - 1 &&
    player.location.x <= Math.max(pos1.x, pos2.x) + 1 &&
    player.location.y >= Math.min(pos1.y, pos2.y) - 1 &&
    player.location.y <= Math.max(pos1.y, pos2.y) + 1 &&
    player.location.z >= Math.min(pos1.z, pos2.z) - 1 &&
    player.location.z <= Math.max(pos1.z, pos2.z) + 1
  );
}

function hasPlayerNearGenerator(gen, radius = 50) {
  if (!gen.pos1 || !gen.pos2) return false;
  const cx = (gen.pos1.x + gen.pos2.x) / 2;
  const cy = (gen.pos1.y + gen.pos2.y) / 2;
  const cz = (gen.pos1.z + gen.pos2.z) / 2;
  const radSq = radius * radius;
  for (const p of world.getPlayers()) {
    if (p.dimension.id !== "minecraft:overworld") continue;
    const dx = p.location.x - cx, dy = p.location.y - cy, dz = p.location.z - cz;
    if (dx * dx + dy * dy + dz * dz <= radSq) return true;
  }
  return false;
}

function clearGeneratorArea(gen) {
  const { pos1, pos2 } = gen;
  if (!pos1 || !pos2) return;
  const [minX, maxX] = pos1.x < pos2.x ? [pos1.x, pos2.x] : [pos2.x, pos1.x];
  const [minY, maxY] = pos1.y < pos2.y ? [pos1.y, pos2.y] : [pos2.y, pos1.y];
  const [minZ, maxZ] = pos1.z < pos2.z ? [pos1.z, pos2.z] : [pos2.z, pos1.z];

  for (const p of world.getPlayers()) {
    if (isPlayerInGenerator(p, gen)) {
      const loc = gen.safePos
        ? { x: gen.safePos.x + 0.5, y: gen.safePos.y, z: gen.safePos.z + 0.5 }
        : { x: (minX + maxX) / 2, y: maxY + 3, z: (minZ + maxZ) / 2 };
      p.teleport(loc);
      p.sendMessage('Teleported to safe zone!');
    }
  }

  world.getDimension('overworld').runCommand(`fill ${minX} ${minY} ${minZ} ${maxX} ${maxY} ${maxZ} air`);
}

function resetGenerator(gen) {
  const { pos1, pos2, settings } = gen;
  if (!pos1 || !pos2) return;

  const [minX, maxX] = pos1.x < pos2.x ? [pos1.x, pos2.x] : [pos2.x, pos1.x];
  const [minY, maxY] = pos1.y < pos2.y ? [pos1.y, pos2.y] : [pos2.y, pos1.y];
  const [minZ, maxZ] = pos1.z < pos2.z ? [pos1.z, pos2.z] : [pos2.z, pos1.z];
  const height = maxY - minY;

  for (const p of world.getPlayers()) {
    if (isPlayerInGenerator(p, gen)) {
      const loc = gen.safePos
        ? { x: gen.safePos.x + 0.5, y: gen.safePos.y, z: gen.safePos.z + 0.5 }
        : { x: (minX + maxX) / 2, y: maxY + 3, z: (minZ + maxZ) / 2 };
      p.teleport(loc);
      p.sendMessage('Teleported to safe zone!');
    }
  }

  let totalWeight = 0;
  const enabledOres = [];
  for (const [ore, enabled] of Object.entries(settings.ores)) {
    if (enabled && (settings.oreChances[ore] || 0) > 0) {
      totalWeight += settings.oreChances[ore];
      enabledOres.push({ type: ore, chance: settings.oreChances[ore], data: ORE_TYPES[ore] });
    }
  }

  const dim = world.getDimension('overworld');

  const counts = { stone: 0, cobblestone: 0 };
  const oreMap = {};
  for (const o of enabledOres) oreMap[o.data.block] = 0;

  const decisions = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const rel = (y - minY) / height;
        let block = 'air';
        const r = Math.random() * 100;
        if (r < settings.stoneChance && settings.stoneChance > 0) block = 'stone';
        else if (r < settings.stoneChance + settings.cobbleChance && settings.cobbleChance > 0) block = 'cobblestone';

        if (block === 'air' && enabledOres.length > 0) {
          const rangeOres = enabledOres.filter(o =>
            rel >= o.data.heightRange.min && rel <= o.data.heightRange.max
          );
          const pool = rangeOres.length > 0 ? rangeOres : enabledOres;
          const poolTotal = pool.reduce((s, o) => s + o.chance, 0);
          const oreR = Math.random() * poolTotal;
          let acc = 0;
          for (const ore of pool) {
            acc += ore.chance;
            if (oreR <= acc) { block = ore.data.block; break; }
          }
        }

        if (counts[block] !== undefined) counts[block]++;
        else if (oreMap[block] !== undefined) oreMap[block]++;
        decisions.push({ x, y, z, block });
      }
    }
  }

  // Find the most common block (base) and fill once
  const combos = [{ name: 'stone', count: counts.stone }, { name: 'cobblestone', count: counts.cobblestone }];
  for (const o of enabledOres) combos.push({ name: o.data.block, count: oreMap[o.data.block] });
  const base = combos.reduce((a, b) => a.count > b.count ? a : b, combos[0]);

  if (base.count > 0) {
    dim.runCommand(`fill ${minX} ${minY} ${minZ} ${maxX} ${maxY} ${maxZ} ${base.name}`);
  }

  const diffBlocks = [];
  for (const d of decisions) {
    if (d.block !== base.name) {
      diffBlocks.push(d);
    }
  }

  for (let i = 0; i < diffBlocks.length; i += 100) {
    const batch = diffBlocks.slice(i, i + 100);
    system.runTimeout(() => {
      for (const d of batch) {
        try {
          const blk = dim.getBlock({ x: d.x, y: d.y, z: d.z });
          if (blk) blk.setType(d.block.startsWith('minecraft:') ? d.block : `minecraft:${d.block}`);
        } catch {
          try { dim.runCommand(`setblock ${d.x} ${d.y} ${d.z} ${d.block}`); } catch {}
        }
      }
    }, Math.floor(i / 100));
  }
}

function startGenerator(name, settings) {
  const gen = getGenerators().find(g => g.name === name);
  if (!gen?.pos1 || !gen?.pos2) return;

  const existing = generatorIntervals.get(name);
  if (existing) { system.clearRun(existing); generatorIntervals.delete(name); }

  if (!settings.autoReset || !settings.enabled) return;
  if (!generatorCountdowns.has(name)) generatorCountdowns.set(name, settings.resetInterval);

  const timer = system.runInterval(() => {
    const cur = getGenerators().find(g => g.name === name);
    if (!cur?.pos1 || !cur?.pos2 || !cur.settings.enabled || !cur.settings.autoReset) {
      const iv = generatorIntervals.get(name);
      if (iv) { system.clearRun(iv); generatorIntervals.delete(name); }
      generatorCountdowns.delete(name);
      return;
    }

    let cd = generatorCountdowns.get(name);
    if (cd == null) cd = cur.settings.resetInterval;

    if (!hasPlayerNearGenerator(cur)) {
      if (cd !== cur.settings.resetInterval) generatorCountdowns.set(name, cur.settings.resetInterval);
      return;
    }

    cd--;
    generatorCountdowns.set(name, cd);

    if (cd <= 5 && cd > 0) {
      const players = [...world.getPlayers()];
      for (const p of players) {
        if (isPlayerInGenerator(p, cur)) {
          p.onScreenDisplay.setActionBar(`Resetting in ${cd}...`);
          p.runCommand(`playsound note.pling @s ~ ~ ~ 1 ${0.5 + cd * 0.1}`);
        }
      }
    }

    if (cd <= 0) {
      if (hasPlayerNearGenerator(cur)) resetGenerator(cur);
      generatorCountdowns.set(name, cur.settings.resetInterval);
    }
  }, 40);

  generatorIntervals.set(name, timer);
}

function initGenerators() {
  const gens = getGenerators();
  let count = 0;
  for (const g of gens) {
    if (g.settings.enabled && g.settings.autoReset && g.pos1 && g.pos2) {
      generatorCountdowns.set(g.name, g.settings.resetInterval);
      startGenerator(g.name, g.settings);
      count++;
    }
  }

}

system.runTimeout(() => initGenerators(), 60);

export { showMainMenu as ore_generator };
