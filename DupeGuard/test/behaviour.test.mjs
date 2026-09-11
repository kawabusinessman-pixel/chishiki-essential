import * as mc from "@minecraft/server";
import "./main.js";

const results = [];
const check = (label, got, want) =>
  results.push({ label, got: JSON.stringify(got), want: JSON.stringify(want),
                 pass: JSON.stringify(got) === JSON.stringify(want) });

/* --- TNT + container handling ------------------------------------ */
const spawnedItems = [];
const destroyed = [];

function fakeBlock(typeId, hasInventory) {
  const slots = hasInventory ? [{ typeId: "minecraft:diamond", amount: 5 }] : null;
  return {
    typeId,
    location: { x: 0, y: 64, z: 0 },
    setType: (t) => destroyed.push({ typeId, to: t }),
    getComponent: (c) => (c === "inventory" && slots
      ? { container: { size: slots.length, getItem: (i) => slots[i], setItem: (i) => { slots[i] = undefined; } } }
      : undefined),
  };
}

const blocks = [
  fakeBlock("minecraft:chest", true),
  fakeBlock("minecraft:ender_chest", false),
  fakeBlock("minecraft:undyed_shulker_box", true),
  fakeBlock("minecraft:stone", false),
];

let keptForVanilla = null;
const dim = {
  id: "minecraft:overworld",
  getBlock: (loc) => blocks.find(b => b.typeId === "minecraft:chest"),
  spawnItem: (stack) => spawnedItems.push(stack.typeId),
  spawnParticle: () => {}, playSound: () => {},
};

mc.subscriptions.before.explosion.forEach(fn => fn({
  dimension: dim,
  getImpactedBlocks: () => blocks,
  setImpactedBlocks: (b) => { keptForVanilla = b.map(x => x.typeId); },
}));

check("ender chest + shulker left to vanilla",
      keptForVanilla,
      ["minecraft:ender_chest", "minecraft:undyed_shulker_box", "minecraft:stone"]);

check("no free ender chest item is created",
      spawnedItems.includes("minecraft:ender_chest"), false);

check("chest contents dropped, then the chest itself",
      spawnedItems, ["minecraft:diamond", "minecraft:chest"]);

/* --- isValid works as a 2.x property ----------------------------- */
const removed = [];
const itemEntity = {
  typeId: "minecraft:item", id: "i1", isValid: true,          // property, not a method
  location: { x: 0, y: 64, z: 0 }, dimension: dim,
  remove: () => removed.push("i1"),
};

const leave = mc.subscriptions.after.playerLeave[0];
const entitySpawn = mc.subscriptions.after.entitySpawn[0];

// A player vanishes, then an item pops out where they stood.
mc.intervals.find(i => i.kind === "interval" && i.t === 4).fn();  // no players, no-op
mc.world.getPlayers = () => [{ id: "gone", location: { x: 0, y: 64, z: 0 }, dimension: dim }];
mc.intervals.find(i => i.kind === "interval" && i.t === 4).fn();  // sample location
leave({ playerId: "gone" });
entitySpawn({ entity: itemEntity });
check("crash-drop item is removed via isValid property", removed, ["i1"]);

/* --- report-only is the default ---------------------------------- */
check("item removal is off until explicitly enabled",
      mc.world.getDynamicProperty("cheats:inventoryEnforce") ?? false, false);

/* --- report ------------------------------------------------------ */
console.log("");
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.label}`);
  if (!r.pass) { console.log(`        got  ${r.got}\n        want ${r.want}`); failed++; }
}
console.log(failed === 0 ? "\nall behaviour cases pass" : `\n${failed} case(s) failed`);
process.exit(failed === 0 ? 0 : 1);
