# DupeGuard — patched build

Patched fork of **DupeGuard Add-On v1.5.0** ("Ultimate Anti-Cheat/Anti-dupe for
bedrock"). Same UUID and same commands, so it drops straight into an existing
world as an update.

Build with `../build.sh` → `dist/DupeGuard_1.5.1.mcpack`.
Run the logic tests with `test/run.sh` (needs Node; no Minecraft required).

## Commands

| Command | Default | What it does |
| --- | --- | --- |
| `/cheats:status` | — | Show every setting (usable by anyone) |
| `/cheats:bundles` | on | Block bundles in hoppers/droppers/dispensers/crafters |
| `/cheats:placement` | on | Break hopper/dropper/dispenser loops |
| `/cheats:explosions` | on | TNT + container dupe protection |
| `/cheats:portals` | on | Stop items being duped in nether portals |
| `/cheats:coursedrop` | on | Remove items dropped by a crash/disconnect |
| `/cheats:invcheck` | **off** | Inventory snapshot comparison on join |
| `/cheats:invenforce` | **off** | *New.* Let `invcheck` actually delete items |

Players with the tag `dupeguard_bypass` are exempt from the inventory checks:

```
/tag @s add dupeguard_bypass
```

## Why `invenforce` exists

`invcheck` compares a saved snapshot of your inventory against what you have on
join, and v1.5.0 **deleted** anything it could not account for. Every heuristic
of this kind has false positives, and a false positive here means a real player
permanently loses real items.

So removal is now a separate, opt-in switch. Turn `invcheck` on first, read the
console for a few days, and only enable `invenforce` once the reports look
clean.

## What was wrong in v1.5.0

### 1. Chest withdrawals were treated as duplication

`savePlayerInventory` only counted the **player's own** container. Pulling a
stack out of a chest, shulker or ender chest makes that count jump in one tick
(64 → 128), which the code read as a gain with no explanation. If the player
then disconnected inside the 15-second commit window, the next join deleted the
difference — items that came from a chest the server had already emptied.

Fixed: interacting with any container now commits the snapshot immediately. A
container transfer is already persisted on the container's side, so rolling the
player back would *destroy* items rather than prevent a dupe. Dying grants the
same grace for 2 minutes, so collecting your own death drops is not flagged
either, and creative/spectator gains are always committed.

### 2. A brand-new player had no baseline for 15 seconds

With no stored snapshot, the whole inventory looked like a gain, so nothing was
committed until the delay elapsed. The first save now takes the current
inventory as the baseline.

### 3. Deleting items on respawn

The join check also ran on respawn after death. It now only runs on
`initialSpawn`.

### 4. `isValid()` is not a function in API 2.x

The manifest requires `@minecraft/server` 2.4.0, where `Entity.isValid` became a
property. `spawn.entity.isValid()` threw inside a `try/catch`, which silently
disabled the part of anti-crash-drop that removes items dropped just *before* a
disconnect. Both shapes are now accepted.

### 5. Unbounded memory growth

`recentItemSpawns` collected every item entity that spawned and was only
trimmed inside `playerLeave`. On a server where nobody left — a mob farm
running overnight — it grew until the script engine gave up. It is now capped
and pruned on a timer. `lastCommittedCounts`, `pendingUpdates` and
`playerLocations` were never cleared either; they are now cleared on leave.

### 6. World dynamic properties leaked forever

One `dp_inv_<playerId>` world property per player who ever joined, never
removed, eventually exhausting the world's dynamic property budget. Snapshots
now live on the **player** entity (`dupeguard:inv`), and the old world
properties are purged once at startup.

### 7. Free ender chests from explosions

The TNT handler matched containers with `typeId.includes("chest")`, which also
caught `minecraft:ender_chest`. It then removed the block and spawned an ender
chest *item* — an anti-dupe addon creating items out of nothing. Shulker boxes
had a milder version of the same problem: their contents were scattered as
loose items instead of staying inside the box.

Both are now left to vanilla, which already handles them without a dupe.

### 8. Portal protection could void or steal items

`inv.container.addItem(stack)` discarded the leftover, so an item recovered from
a portal vanished when the receiving inventory was full. And it handed the item
to whichever player happened to be scanning — up to 10 blocks away — not the
owner.

Items are now teleported out of the portal block instead. Only if there is no
free space nearby does it fall back to giving the item to a player within 4
blocks, and any leftover is dropped rather than deleted.

### 9. Death drops deleted on disconnect

Anti-crash-drop removed any item spawning within 3 blocks of a disconnect. A
player who died and then quit lost their death drops. Deaths in the last 10
seconds are now excluded.

### 10. Performance

| What | Before | After |
| --- | --- | --- |
| Piston loop scan | 17×17×17 = **4913** `getBlock` calls per activation | only the blocks the piston moved (~5-20), plus a 2s per-piston cooldown |
| Portal scan | every **2 ticks** (10×/second) | every 20 ticks |
| Player location sampling | every tick | every 4 ticks |
| Bundle item scan | every 10 ticks | every 20 ticks |
| Inventory snapshot write | `setDynamicProperty` twice a second per player | only when the snapshot actually changed |

The piston scan was the worst of these: any redstone farm triggered thousands of
block lookups per second.

### 11. Smaller fixes

- `FACE_TO_DIRECTION` had `Up` and `Down` swapped relative to the
  `facing_direction` block state.
- Console output is throttled, so one broken farm cannot flood the log.
- The seven near-identical toggle commands are generated from one helper.
- Dead `OPPOSITE_DIRECTION` table removed; missing command registry is handled.
- Hopper loops are still allowed on `playerPlaceBlock` (only dispenser/dropper
  pairs are broken there) — widening it would break legitimate redstone.

## Known limits

Inventory Sync is still a heuristic. It cannot see `/give`, trades, crafting or
ground pickups as distinct events, so an unexplained gain that survives 15
seconds is simply accepted, and one that does not is reported. That is why
`invenforce` is off by default. Treat its output as a lead to investigate, not
proof.
