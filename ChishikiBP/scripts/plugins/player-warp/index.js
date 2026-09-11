import { system, world, ActionFormData, ModalFormData } from "../../core.js";
import { Database } from "../../function/Database.js";
import { getPwarpBenefits, getPwarpCostDiscount } from "../ranks/rank_benefits.js";
import { addMoney, removeMoney, getFullMoney } from "../../function/moneySystem.js";
import { requestTeleport, isPlayerTeleporting, sendActionBar, playTeleportSound } from "../../function/teleportManager.js";
function sAB(player, text) {
 sendActionBar(player, text);
}
const pwarpDb = new Database("pwarp");
const PWARP_LIST_UI_MARKER = "§s§i§m§p§r";
const PWARP_CARD_MARKER = "§w§s";
const PWARP_SEARCH_HAY_LEN = 32;
const DEFAULT_PERSONAL_WARP_LIMIT = 3;
const DEFAULT_PUBLIC_WARP_LIMIT = 5;
const DEFAULT_DELAY = 3;
const DEFAULT_TELEPORT_COST = 0;
const DEFAULT_INVITE_COOLDOWN_SECONDS = 30;

function getTeleportCost() {
  return Number(world.getDynamicProperty("pwarp_teleport_cost") || DEFAULT_TELEPORT_COST);
}

function getEffectiveTeleportCost(player) {
  const baseCost = getTeleportCost();
  if (baseCost <= 0) return 0;
  const discount = getPwarpCostDiscount(player);
  const finalCost = Math.floor(baseCost * (1 - discount / 100));
  return Math.max(0, finalCost);
}

function pwarpSearchHaystack(name) {
  const clean = String(name ?? "")
    .replace(/\u00C2?§./g, "")
    .trim();
  if (!clean) return " ".repeat(PWARP_SEARCH_HAY_LEN);
  const lower = clean.toLowerCase();
  const raw = `${lower} ${clean.toUpperCase()}`;
  return raw.slice(0, PWARP_SEARCH_HAY_LEN).padEnd(PWARP_SEARCH_HAY_LEN, " ");
}
function pwarpCardButtonText(pwarp) {
  const access = pwarp.isPublic ? "§a[public]" : "§c[private]";
  const hay = pwarpSearchHaystack(`${pwarp.name} ${pwarp.owner}`);
  return `${PWARP_CARD_MARKER}${hay}§f${pwarp.name}\n§7by: ${pwarp.owner} ${access}`;
}
function pwarpListBody(pwarps) {
  const total = pwarps.length;
  const pub = pwarps.filter((w) => w.isPublic).length;
  const priv = total - pub;
  return `§fTotal: §b${total} §8| §cPrivate: §f${priv} §8| §aPublic: §f${pub}`;
}
function getPersonalWarpLimit(player) {
  if (player) {
    const benefits = getPwarpBenefits(player);
    if (benefits.personal_limit > 0) return benefits.personal_limit;
  }
  return Number(
    world.getDynamicProperty("pwarp_personal_limit") ||
      DEFAULT_PERSONAL_WARP_LIMIT,
  );
}
function getPublicWarpLimit(player) {
  if (player) {
    const benefits = getPwarpBenefits(player);
    if (benefits.public_limit > 0) return benefits.public_limit;
  }
  return Number(
    world.getDynamicProperty("pwarp_public_limit") || DEFAULT_PUBLIC_WARP_LIMIT,
  );
}
function getInviteCooldown() {
  return Number(
    world.getDynamicProperty("pwarp_invite_cooldown") ||
      DEFAULT_INVITE_COOLDOWN_SECONDS,
  );
}
const DELAY = DEFAULT_DELAY;
function normalizeWarpName(name) {
  return name.trim().replace(/\s+/g, "_").toLowerCase();
}
function isValidWarpName(name) {
  return /^[a-zA-Z0-9_]+$/.test(name);
}
function getWarpIndex() {
  try {
    const idx = world.getDynamicProperty("pwarp_index");
    if (!idx) {
      world.setDynamicProperty("pwarp_index", "[]");
      return [];
    }
    return JSON.parse(idx);
  } catch {
    return [];
  }
}
function saveWarpIndex(arr) {
  world.setDynamicProperty("pwarp_index", JSON.stringify(arr));
}
function getWarpData(warpname) {
  const key = `pwarp_${warpname}`;
  try {
    const raw = world.getDynamicProperty(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}
function setWarpData(warpname, data) {
  const key = `pwarp_${warpname}`;
  world.setDynamicProperty(key, JSON.stringify(data));
}
function deleteWarpData(warpname) {
  const key = `pwarp_${warpname}`;
  world.setDynamicProperty(key, undefined);
}
function countPlayerWarps(playerName, isPublic = false) {
  const idx = getWarpIndex();
  let count = 0;
  for (const name of idx) {
    const data = getWarpData(name);
    if (data && data.owner === playerName && data.isPublic === isPublic)
      count++;
  }
  return count;
}
function migratePwarpOldToNew() {
  const oldRaw = world.getDynamicProperty("playerwarps");
  if (!oldRaw) return;
  let oldArr = [];
  try {
    oldArr = JSON.parse(oldRaw);
  } catch {}
  if (!Array.isArray(oldArr) || oldArr.length === 0) {
    world.setDynamicProperty("playerwarps", undefined);
    return;
  }
  const idx = getWarpIndex();
  for (const warp of oldArr) {
    if (!warp || !warp.name) continue;
    let name = normalizeWarpName(warp.name);
    if (!isValidWarpName(name)) continue;
    if (name.length < 3 || name.length > 16) continue;
    if (idx.includes(name)) continue;
    warp.name = name;
    setWarpData(name, warp);
    idx.push(name);
  }
  saveWarpIndex(idx);
  world.setDynamicProperty("playerwarps", undefined);
}
function migratePwarpToDatabaseForPlayer(playerName) {
  const flagKey = `pwarp_db_migrated_${playerName}`;
  if (world.getDynamicProperty(flagKey)) return;
  const idx = getWarpIndex();
  let migrated = 0;
  for (const name of idx) {
    const data = getWarpData(name);
    if (data && data.owner === playerName && !pwarpDb.get(name)) {
      pwarpDb.set(name, data);
      migrated++;
    }
  }
  world.setDynamicProperty(flagKey, true);
  if (migrated > 0) {
    console.warn(
      `[PWARP] Migrasi ke Database untuk ${playerName}: ${migrated} warp dimigrasi.`,
    );
  }
}
world.afterEvents.playerJoin.subscribe((ev) => {
  if (!ev.player) return;
  migratePwarpToDatabaseForPlayer(ev.player.name);
});
function ShowPlayerWarps(player) {
  try {
    migratePwarpOldToNew();
    const personalLimit = getPersonalWarpLimit(player);
    const publicLimit = getPublicWarpLimit(player);
    const fm = new ActionFormData()
      .title("PWARP MENU")
      .body(
        `§7Personal: §b${countPlayerWarps(player.name, false)}§7/${personalLimit} §8| §7Public: §b${countPlayerWarps(player.name, true)}§7/${publicLimit}`,
      );
    fm.button("Create", "textures/ui/icon_recipe_construction");
    fm.button("Warp List", "textures/ui/icon_multiplayer");
    fm.button("My Warps", "textures/ui/icon_trash");
    fm.show(player).then((response) => {
      if (!response || response.canceled) return;
      switch (response.selection) {
        case 0:
          createPlayerWarp(player);
          break;
        case 1:
          showWarpList(player);
          break;
        case 2:
          managePlayerWarps(player);
          break;
      }
    }).catch((err) => {
      console.warn("[PWARP] show failed:", err);
      player.sendMessage("§cFailed to open pwarp menu.");
    });
  } catch (err) {
    console.warn("[PWARP] ShowPlayerWarps error:", err);
    player.sendMessage("§cFailed to open pwarp menu.");
  }
}
function showWarpList(player) {
  try {
    const idx = getWarpIndex();
    const pwarps = idx
      .map(getWarpData)
      .filter((w) => w && (w.isPublic || w.owner === player.name));
    const fm = new ActionFormData()
      .simpleUi()
      .title("PLAYER WARP LIST")
      .body(pwarpListBody(pwarps));
    if (pwarps.length === 0) {
      fm.button("No warps available", "textures/ui/icon_recipe_construction");
      player.sendMessage("No valid warps found!");
    } else {
      pwarps.forEach((pwarp) => {
        fm.button(
          `§f${pwarp.name}\n§7by: ${pwarp.owner} ${pwarp.isPublic ? "§a[public]" : "§c[private]"}`,
          "textures/ui/icon_multiplayer",
        );
      });
    }
    fm.show(player).then((response) => {
      if (!response || response.canceled) return;
      if (pwarps.length > 0) {
        const selectedWarp = pwarps[response.selection];
        if (!selectedWarp) return;
        const desc = selectedWarp.description
          ? `\n\n§7Description: §f${selectedWarp.description}`
          : "";
        if (selectedWarp.owner === player.name) {
          showOwnerWarpMenu(player, selectedWarp);
        } else {
          new ActionFormData()
            .title("§cWARP CONFIRMATION")
            .body(
              `§eTeleport to §6${selectedWarp.name}§e?${desc}\n\n§cWarning: §7Teleport may be dangerous — teleport at your own risk.`,
            )
            .button("§aYes, I understand", "textures/ui/confirm")
            .button("§cNo, cancel", "textures/ui/cancel")
            .show(player)
            .then((confirmResponse) => {
              if (
                !confirmResponse ||
                confirmResponse.canceled ||
                confirmResponse.selection === 1
              )
                return;
              teleportToPlayerWarp(player, selectedWarp);
            });
        }
      }
    }).catch((err) => {
      console.warn("[PWARP] warp list show failed:", err);
      player.sendMessage("§cFailed to open warp list.");
    });
  } catch (err) {
    console.warn("[PWARP] showWarpList error:", err);
    player.sendMessage("§cFailed to open warp list.");
  }
}
function showPlayerInviteList(owner, warp) {
  try {
    // Nama disalin sekarang: form bisa terbuka lama, dan handle player yang keluar
    // akan melempar error begitu propertinya dibaca nanti.
    const playerNames = world
      .getPlayers()
      .map((p) => p.name)
      .filter((name) => name !== owner.name);
    if (playerNames.length === 0) {
      owner.sendMessage("No other players online to invite.");
      return;
    }
    const fm = new ActionFormData()
      .title(`Invite: ${warp.name}`)
      .body(`§7Select player`);
    playerNames.forEach((name) =>
      fm.button(name, "textures/ui/friend1_black_outline_2x"),
    );
    fm.button("Back", "textures/ui/arrow_left");
    fm.show(owner).then((res) => {
      if (!res || res.canceled) return;
      const sel = res.selection;
      if (sel === playerNames.length) return;
      const targetName = playerNames[sel];
      const target = targetName
        ? world.getPlayers().find((p) => p.name === targetName)
        : undefined;
      if (!target) {
        owner.sendMessage("That player is no longer online.");
        return;
      }
      sendWarpInvite(target, owner, warp);
    });
  } catch (e) {
    owner.sendMessage("Failed to open player invite list.");
  }
}
function showOwnerWarpMenu(owner, selectedWarp) {
  const desc = selectedWarp.description
    ? ` §8- ${selectedWarp.description}`
    : "";
  new ActionFormData()
    .title(selectedWarp.name)
    .body(`§7Your warp${desc}`)
    .button("Teleport", "textures/ui/dust_selectable_3")
    .button("Invite", "textures/ui/FriendsDiversity")
    .button("Cancel", "textures/ui/cancel")
    .show(owner)
    .then((confirmResponse) => {
      if (!confirmResponse || confirmResponse.canceled) return;
      if (confirmResponse.selection === 0)
        teleportToPlayerWarp(owner, selectedWarp);
      else if (confirmResponse.selection === 1)
        showPlayerInviteList(owner, selectedWarp);
    });
}
function sendWarpInvite(toPlayer, fromPlayer, warp) {
  try {
    try {
      const cdKey = `pwarp_invite_cd_${fromPlayer.name}`;
      const last = Number(world.getDynamicProperty(cdKey)) || 0;
      const now = Date.now();
      const cooldownSeconds = getInviteCooldown();
      const waitMs = cooldownSeconds * 1000;
      if (now - last < waitMs) {
        const rem = Math.ceil((waitMs - (now - last)) / 1000);
        fromPlayer.sendMessage(
          `Invite cooldown active. Please wait ${rem}s before sending another invite.`,
        );
        return;
      }
      world.setDynamicProperty(cdKey, String(now));
    } catch (e) {}
    const desc = warp.description
      ? `\n\n§7Description: §f${warp.description}`
      : "";
    new ActionFormData()
      .title(`Invite to warp: ${warp.name}`)
      .body(
        `§e${fromPlayer.name} invites you to warp §6${warp.name}§e.${desc}\n\n§7Do you want to accept and teleport?`,
      )
      .button("Accept", "textures/ui/confirm")
      .button("Decline", "textures/ui/cancel")
      .show(toPlayer)
      .then((resp) => {
        if (!resp || resp.canceled || resp.selection === 1) {
          fromPlayer.sendMessage(`${toPlayer.name} declined the warp invite.`);
          return;
        }
        toPlayer.sendMessage(`Teleporting to warp: ${warp.name}...`);
        teleportToPlayerWarp(toPlayer, warp);
        fromPlayer.sendMessage(
          `${toPlayer.name} accepted the invite to ${warp.name}.`,
        );
      });
  } catch (e) {
    fromPlayer.sendMessage(`Failed to send invite to ${toPlayer.name}.`);
  }
}
function createPlayerWarp(player) {
  const personalCount = countPlayerWarps(player.name, false);
  const publicCount = countPlayerWarps(player.name, true);
  const publicLimit = getPublicWarpLimit(player);
  const form = new ModalFormData()
    .title("CREATE WARP §t§p§a")
    .textField("§eName\n§7Letters, numbers, underscore only", "Enter name...", {
      defaultValue: "",
    })
    .toggle(
      `§ePublic Access\n§7Allow others to use (${publicCount}/${publicLimit})`,
      { defaultValue: false },
    );
  form.textField("§eDescription §7(optional)", "What is this warp for?", {
    defaultValue: "",
  });
  form.show(player).then((response) => {
    if (!response || response.canceled) return;
    let [name, isPublic, description] = response.formValues;
    name = normalizeWarpName(name);
    description = String(description || "").trim();
    if (!name) {
      player.sendMessage("Please enter a warp name!");
      return;
    }
    if (!isValidWarpName(name)) {
      player.sendMessage(
        "Warp name can only contain letters, numbers, and underscore!",
      );
      return;
    }
    if (name.length < 3 || name.length > 16) {
      player.sendMessage("Warp name must be between 3 and 16 characters!");
      return;
    }
    if (description.length > 200) {
      player.sendMessage("Description too long (max 200 characters).");
      return;
    }
    const personalLimit = getPersonalWarpLimit(player);
    const publicLimit = getPublicWarpLimit(player);
    if (isPublic && publicCount >= publicLimit) {
      player.sendMessage(
        `You've reached the public warp limit (${publicLimit})!`,
      );
      return;
    }
    if (!isPublic && personalCount >= personalLimit) {
      player.sendMessage(
        `You've reached the personal warp limit (${personalLimit})!`,
      );
      return;
    }
    const idx = getWarpIndex();
    if (idx.includes(name)) {
      player.sendMessage("A warp with this name already exists!");
      return;
    }
    const { x, y, z } = player.location;
    const dimension = player.dimension.id.replace("minecraft:", "");
    const newWarp = {
      name,
      owner: player.name,
      location: {
        x: Math.floor(x),
        y: Math.floor(y),
        z: Math.floor(z),
        dimension,
      },
      isPublic,
      description,
      created: Date.now(),
    };
    setWarpData(name, newWarp);
    idx.push(name);
    saveWarpIndex(idx);
    player.sendMessage(`Warp "${name}" created successfully!`);
    player.runCommand("playsound random.levelup @s");
  });
}
function teleportToPlayerWarp(player, warp) {
  if (!warp || !warp.location) {
    player.sendMessage("Invalid warp!");
    return;
  }
  
  if (isPlayerTeleporting(player)) {
    player.sendMessage("§cYou are already teleporting!");
    return;
  }

  const teleportCost = getEffectiveTeleportCost(player);
  if (teleportCost > 0) {
    const playerMoney = getFullMoney(player);
    if (playerMoney < BigInt(teleportCost)) {
      player.sendMessage(`§cNot enough money! Need $${teleportCost}`);
      player.runCommand("playsound note.bass @s");
      return;
    }
  }

  const { x, y, z, dimension } = warp.location;
  const costText = teleportCost > 0 ? ` §7(Cost: $${teleportCost})` : "";

  requestTeleport(player, {
    type: "pwarp",
    title: warp.name,
    duration: DELAY,
    customActionBarBuilder: (p, bar, remaining) => {
      return `§e⚡ Teleporting [§b${bar}§e] §b${remaining}s${costText}`;
    },
    onComplete: (p) => {
      if (teleportCost > 0) {
        if (!removeMoney(p, teleportCost)) {
          p.sendMessage("§cPayment failed! Teleport cancelled.");
          return;
        }
        p.sendMessage(`§7- $${teleportCost} §8(pwarp teleport cost)`);
      }
      p.runCommand("gamerule sendcommandfeedback false");
      p.runCommand(`execute in ${dimension} run tp @s ${x} ${y} ${z}`);
      p.runCommand("gamerule sendcommandfeedback true");
      sAB(p, `§aPWarp! §b${warp.name}`);
      playTeleportSound(p, "mob.endermen.portal");
    },
  });
}
function managePlayerWarps(player) {
  const idx = getWarpIndex();
  const playerOwnedWarps = idx
    .map(getWarpData)
    .filter((w) => w && w.owner === player.name);
  if (playerOwnedWarps.length === 0) {
    player.sendMessage("You have no valid warps!");
    return;
  }
  const form = new ActionFormData()
    .title("MY WARPS")
    .body(`§7Total: §b${playerOwnedWarps.length}`);
  playerOwnedWarps.forEach((pwarp) => {
    const access = pwarp.isPublic ? "[PUBLIC]" : "[PRIVATE]";
    form.button(`${pwarp.name}\n${access}`, "textures/ui/icon_trash");
  });
  form.show(player).then((response) => {
    if (!response || response.canceled) return;
    const selectedWarp = playerOwnedWarps[response.selection];
    if (!selectedWarp) return;
    new ActionFormData()
      .title(String(selectedWarp.name || "WARP"))
      .body(`§7${selectedWarp.isPublic ? "Public" : "Private"} warp`)
      .button("Edit", "textures/ui/pencil")
      .button("Delete", "textures/ui/trash")
      .show(player)
      .then((manageResponse) => {
        if (!manageResponse || manageResponse.canceled) return;
        if (manageResponse.selection === 0) {
          editPlayerWarp(player, selectedWarp);
        } else if (manageResponse.selection === 1) {
          const idxArr = getWarpIndex();
          const ix = idxArr.indexOf(selectedWarp.name);
          if (ix !== -1) {
            idxArr.splice(ix, 1);
            saveWarpIndex(idxArr);
            deleteWarpData(selectedWarp.name);
            player.sendMessage(`Removed warp: ${selectedWarp.name}`);
            player.runCommand(`playsound random.break @s`);
          }
        }
      });
  });
}
function editPlayerWarp(player, selectedWarp) {
  const form = new ModalFormData()
    .title("EDIT WARP §t§p§a")
    .textField("§eName", "Enter name...", { defaultValue: selectedWarp.name })
    .textField("§eDescription §7(optional)", "Enter description...", {
      defaultValue: selectedWarp.description || "",
    })
    .toggle("§ePublic Access", { defaultValue: selectedWarp.isPublic })
    .toggle("§eUpdate Location", { defaultValue: false });
  form.show(player).then((response) => {
    if (!response || response.canceled) return;
    let [name, description, isPublic, updateLoc] = response.formValues;
    name = normalizeWarpName(name);
    description = String(description || "").trim();
    if (!name) {
      player.sendMessage("Please enter a warp name!");
      return;
    }
    if (!isValidWarpName(name)) {
      player.sendMessage(
        "Warp name can only contain letters, numbers, and underscore!",
      );
      return;
    }
    if (name.length < 3 || name.length > 16) {
      player.sendMessage("Warp name must be between 3 and 16 characters!");
      return;
    }
    const idx = getWarpIndex();
    if (name !== selectedWarp.name && idx.includes(name)) {
      player.sendMessage("A warp with this name already exists!");
      return;
    }
    if (!selectedWarp.isPublic && isPublic) {
      const publicCount = countPlayerWarps(player.name, true);
      const publicLimit = getPublicWarpLimit(player);
      if (publicCount >= publicLimit) {
        player.sendMessage(
          `You've reached the public warp limit (${publicLimit})!`,
        );
        return;
      }
    }
    const updatedWarp = {
      ...selectedWarp,
      name,
      isPublic,
      description,
    };
    if (updateLoc) {
      const { x, y, z } = player.location;
      const dimension = player.dimension.id.replace("minecraft:", "");
      updatedWarp.location = {
        x: Math.floor(x),
        y: Math.floor(y),
        z: Math.floor(z),
        dimension,
      };
    }
    if (name !== selectedWarp.name) {
      const idxArr = getWarpIndex();
      const ix = idxArr.indexOf(selectedWarp.name);
      if (ix !== -1) idxArr[ix] = name;
      saveWarpIndex(idxArr);
      deleteWarpData(selectedWarp.name);
    }
    setWarpData(name, updatedWarp);
    player.sendMessage(`Warp "${name}" updated successfully!`);
    player.runCommand("playsound random.levelup @s");
  });
}
export {
  ShowPlayerWarps,
  createPlayerWarp,
  getWarpData,
  managePlayerWarps,
  saveWarpIndex,
  showWarpList,
  teleportToPlayerWarp,
};
