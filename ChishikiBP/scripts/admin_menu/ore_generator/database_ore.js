import { world } from "../../core.js";
const DB_KEY = "ore_generators";

let cache = null;
let cacheInvalidationCallback = null;

export function onGeneratorsChanged(callback) {
  cacheInvalidationCallback = callback;
}

function getGenerators() {
  if (cache) return cache;
  try {
    const data = world.getDynamicProperty(DB_KEY);
    cache = data ? JSON.parse(data) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function saveGenerators(generators) {
  try {
    world.setDynamicProperty(DB_KEY, JSON.stringify(generators));
    cache = generators;
    if (cacheInvalidationCallback) cacheInvalidationCallback();
  } catch (e) {
    console.warn("[OreGenerator DB] Error saving generators:", e);
  }
}

function addGenerator(name, pos1, pos2, settings) {
  const generators = getGenerators();
  generators.push({ name, pos1, pos2, settings });
  saveGenerators(generators);
}

function removeGenerator(name) {
  const generators = getGenerators();
  const filtered = generators.filter(g => g.name !== name);
  saveGenerators(filtered);
}

function updateGenerator(name, settings) {
  const generators = getGenerators();
  const index = generators.findIndex(g => g.name === name);
  if (index !== -1) {
    generators[index] = { ...generators[index], ...settings };
    saveGenerators(generators);
  }
}

export { getGenerators, addGenerator, removeGenerator, updateGenerator };
