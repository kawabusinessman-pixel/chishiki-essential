import * as mc from "@minecraft/server";
import "./main.js";

/* --- fake player ------------------------------------------------- */
function makePlayer(name, id) {
  const slots = new Array(36).fill(undefined);
  const container = {
    size: 36,
    getItem: (i) => slots[i] ? { typeId: slots[i].typeId, amount: slots[i].amount } : undefined,
    setItem: (i, v) => { slots[i] = v ? { typeId: v.typeId, amount: v.amount } : undefined; },
    addItem: () => undefined,
  };
  const dp = new Map();
  return {
    name, id, typeId: "minecraft:player", isValid: true,
    location: { x: 0, y: 64, z: 0 },
    dimension: mc.dimensionStub,
    slots,
    getComponent: (c) => (c === "inventory" ? { container } : undefined),
    getDynamicProperty: (k) => dp.get(k),
    setDynamicProperty: (k, v) => dp.set(k, v),
    hasTag: () => false,
    getGameMode: () => "survival",
    playSound: () => {},
    sendMessage: () => {},
    runCommand: () => {},
  };
}

function setStack(p, slot, typeId, amount) { p.slots[slot] = { typeId, amount }; }
function totalOf(p, typeId) {
  return p.slots.reduce((n, s) => n + (s && s.typeId === typeId ? s.amount : 0), 0);
}

/* --- drive the pack --------------------------------------------- */
const saveTick = mc.intervals.find(i => i.kind === "interval" && i.t === 10).fn;
const fireStartup = () => mc.subscriptions.systemBefore.startup[0]({
  customCommandRegistry: { registerCommand: (def, cb) => mc.commands.push({ def, cb }) }
});
const interact = (player, block) =>
  mc.subscriptions.after.playerInteractWithBlock.forEach(fn => fn({ player, block }));
const spawn = (player, initialSpawn) =>
  mc.subscriptions.after.playerSpawn.forEach(fn => fn({ player, initialSpawn }));
const die = (player) =>
  mc.subscriptions.after.entityDie.forEach(fn => fn({ deadEntity: player }));
const runTimeouts = () => {
  const pending = mc.intervals.filter(i => i.kind === "timeout");
  mc.intervals.length = 0;
  pending.forEach(t => t.fn());
};

fireStartup();
const inv = mc.commands.find(c => c.def.name === "cheats:invcheck");
inv.cb({ sourceEntity: makePlayer("admin", "admin") });          // enable Inventory Sync
const enforce = mc.commands.find(c => c.def.name === "cheats:invenforce");
enforce.cb({ sourceEntity: makePlayer("admin", "admin") });      // enable item removal

const chest  = { typeId: "minecraft:chest", getComponent: () => ({ container: {} }) };
const stone  = { typeId: "minecraft:stone", getComponent: () => undefined };
let players = [];
mc.world.getPlayers = () => players;

const results = [];
function check(label, got, want) {
  results.push({ label, got, want, pass: got === want });
}

/* --- case 1: pulled a stack out of a chest (the screenshot case) -- */
{
  const p = makePlayer("amell6245", "p1");
  players = [p];
  setStack(p, 0, "minecraft:netherite_ingot", 64);
  saveTick();                       // baseline = 64
  interact(p, chest);               // opens a chest
  setStack(p, 1, "minecraft:netherite_ingot", 64);   // 64 -> 128
  saveTick();                       // must commit immediately, not hold it pending
  players = [];
  spawn(p, true); runTimeouts();    // rejoin
  check("chest withdrawal keeps all 128 ingots", totalOf(p, "minecraft:netherite_ingot"), 128);
}

/* --- case 2: same jump, no container touched, logs out fast ------- */
{
  const p = makePlayer("cheater", "p2");
  players = [p];
  setStack(p, 0, "minecraft:netherite_ingot", 64);
  saveTick();                       // baseline = 64
  setStack(p, 1, "minecraft:netherite_ingot", 64);   // 64 -> 128 out of nowhere
  saveTick();                       // pending, NOT committed
  players = [];
  spawn(p, true); runTimeouts();    // rejoin before the 15s window elapsed
  check("unexplained gain is rolled back to 64", totalOf(p, "minecraft:netherite_ingot"), 64);
}

/* --- case 3: respawn after death must not be audited -------------- */
{
  const p = makePlayer("died", "p3");
  players = [p];
  setStack(p, 0, "minecraft:diamond", 10);
  saveTick();
  die(p);                           // death grants a pickup grace
  p.slots.fill(undefined);          // dropped everything
  saveTick();                       // baseline = empty
  setStack(p, 0, "minecraft:diamond", 10);           // picked the drops back up
  saveTick();                       // grace -> commits straight away
  players = [];
  spawn(p, true); runTimeouts();    // even a full rejoin must keep them
  check("death drops picked back up are kept", totalOf(p, "minecraft:diamond"), 10);
}

/* --- case 4: gain that survived the 15s window ------------------- */
{
  const p = makePlayer("legit", "p4");
  players = [p];
  setStack(p, 0, "minecraft:iron_ingot", 32);
  saveTick();
  setStack(p, 1, "minecraft:iron_ingot", 32);        // 32 -> 64
  saveTick();                                        // starts the 15s timer
  const realNow = Date.now;
  Date.now = () => realNow() + 20000;                // 20s later
  saveTick();                                        // commits
  Date.now = realNow;
  players = [];
  spawn(p, true); runTimeouts();
  check("gain older than 15s is kept", totalOf(p, "minecraft:iron_ingot"), 64);
}

/* --- report ------------------------------------------------------ */
console.log("");
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.label}  (got ${r.got}, want ${r.want})`);
  if (!r.pass) failed++;
}
console.log(failed === 0 ? "\nall inventory-sync cases pass" : `\n${failed} case(s) failed`);
process.exit(failed === 0 ? 0 : 1);
