import { system, world, MessageFormData, ModalFormData } from '../../core.js';
import { Lang } from "../../lib/Lang.js";
import { isMemberFeatureEnabled } from "../../function/memberFeatureState.js";
import { requestTeleport, isPlayerTeleporting, sendActionBar, playTeleportSound } from "../../function/teleportManager.js";

const COLORS = {
  red: "§c",
  green: "§a",
  yellow: "§e",
  blue: "§b",
  gray: "§7",
  white: "§f",
  gold: "§6",
};

const WARNING_ICON = "⚠";

function rawText(text) {
  return JSON.stringify({ rawtext: [{ text: String(text ?? "") }] });
}

const SOUNDS = {
  accept: "note.pling",
  deny: "note.bass",
  teleport: "mob.endermen.portal",
};

const COMMANDS = {
  hideOutput: "gamerule sendcommandfeedback false",
  showOutput: "gamerule sendcommandfeedback true",
};

const cooldowns = new Map();
const COOLDOWN_DURATION = 10000;
const requestLimits = new Map();
const MAX_REQUESTS = 3;
const LIMIT_WINDOW = 60000;
const activeRequests = new Set();
const TELEPORT_COUNTDOWN_SECONDS = 3;

function showActionBar(player, text) {
  sendActionBar(player, text);
}

function playSound(player, sound) {
  playTeleportSound(player, sound);
}

function isPlayerOnline(player) {
  if (!player) return false;
  let playerId;
  try {
    playerId = player.id;
  } catch {
    return false;
  }
  return Array.from(world.getPlayers()).some((p) => p.id === playerId);
}

function hasPlayerMoved(player, initialPos) {
  try {
    const currentPos = player.location;
    return (
      Math.abs(initialPos.x - currentPos.x) > 0.1 ||
      Math.abs(initialPos.y - currentPos.y) > 0.1 ||
      Math.abs(initialPos.z - currentPos.z) > 0.1
    );
  } catch {
    return true;
  }
}

function executeCommandsSync(targetName, destinationName, commands) {
  const target = world.getPlayers().find((p) => p.name === targetName);
  if (!target) return;
  try {
    target.runCommand(COMMANDS.hideOutput);
    for (const cmd of commands) {
      target.runCommand(cmd);
    }
  } catch (error) {
    console.warn("Command execution error:", error);
  } finally {
    target.runCommand(COMMANDS.showOutput);
  }
}

function runTeleportCountdown(player, target, initialPosition) {
  return new Promise((resolve, reject) => {
    if (!isMemberFeatureEnabled("teleport")) {
      reject(new Error("Teleport feature disabled"));
      return;
    }

    const started = requestTeleport(player, {
      type: "tpa",
      title: target?.name,
      duration: TELEPORT_COUNTDOWN_SECONDS,
      customActionBarBuilder: (p, bar, remaining) => {
        const text = `§e⚡ Teleporting [§b${bar}§e] §b${remaining}s`;
        if (isPlayerOnline(target)) {
          showActionBar(target, text);
        }
        return text;
      },
      onComplete: () => {
        if (!isPlayerOnline(player) || !isPlayerOnline(target)) {
          reject(new Error("Player offline during countdown"));
          return;
        }
        resolve();
      },
      onCancel: (p, reason) => {
        if (isPlayerOnline(target)) {
          showActionBar(target, `${COLORS.red}${Lang.t(target, "tpa.msg.other_moved") || "Teleport cancelled - Requester moved!"}`);
          playSound(target, SOUNDS.deny);
        }
        reject(new Error("Movement detected"));
      },
    });

    if (!started) {
      reject(new Error("Teleport already active or failed to start"));
    }
  });
}

export function TeleportRequest(player) {
  if (!isMemberFeatureEnabled("teleport")) {
    player.sendMessage("§cTeleport requests are currently disabled in Member Feature Toggle.");
    return;
  }
  const lastRequest = cooldowns.get(player.id);
  if (lastRequest && Date.now() - lastRequest < COOLDOWN_DURATION) {
    const remainingTime = Math.ceil((COOLDOWN_DURATION - (Date.now() - lastRequest)) / 1000);
    showActionBar(
      player,
      `${COLORS.red}${WARNING_ICON} ${Lang.t(player, "tpa.msg.cooldown", remainingTime)}`,
    );
    return;
  }

  const playerRequests = requestLimits.get(player.id) || [];
  const now = Date.now();
  const recentRequests = playerRequests.filter((time) => now - time < LIMIT_WINDOW);

  if (recentRequests.length >= MAX_REQUESTS) {
    showActionBar(
      player,
      `${COLORS.red}${WARNING_ICON} ${Lang.t(player, "tpa.msg.too_many")}`,
    );
    return;
  }

  const players = Array.from(world.getPlayers());
  const playerNames = players.map((p) => p.name);

  if (playerNames.length === 0) {
    showActionBar(player, `${COLORS.red}${Lang.t(player, "tpa.msg.no_players")}`);
    return;
  }

  new ModalFormData()
    .title(Lang.t(player, "tpa.menu.title"))
    .dropdown(`${COLORS.yellow}${Lang.t(player, "tpa.menu.select_player")}`, playerNames, {
      defaultValueIndex: 0,
    })
    .toggle(
      `${COLORS.blue}${Lang.t(player, "tpa.menu.bring_to_me")}\n${COLORS.gray}${Lang.t(player, "tpa.menu.bring_desc")}`,
      {
        defaultValue: false,
      },
    )
    .toggle(`${COLORS.red}${Lang.t(player, "tpa.menu.disable_requests")}`, {
      defaultValue: player.hasTag("disableTpa"),
    })
    .submitButton(Lang.t(player, "tpa.menu.send"))
    .show(player)
    .then((response) => handleFormResponse(response, player, playerNames))
    .catch(console.warn);
}

async function handleFormResponse(response, player, playerNames) {
  if (response.canceled) return;

  const [selectedIndex, tpHere, disableRequests] = response.formValues;
  const targetName = playerNames[selectedIndex];
  const target = targetName
    ? Array.from(world.getPlayers()).find((p) => p.name === targetName)
    : undefined;

  if (!target) {
    showActionBar(player, `${COLORS.red}${Lang.t(player, "tpa.msg.player_offline")}`);
    return;
  }

  if (disableRequests !== player.hasTag("disableTpa")) {
    showActionBar(
      player,
      disableRequests
        ? `${COLORS.red}${Lang.t(player, "tpa.msg.disabled")}`
        : `${COLORS.green}${Lang.t(player, "tpa.msg.enabled")}`,
    );
    disableRequests
      ? player.addTag("disableTpa")
      : player.removeTag("disableTpa");
  }

  if (target.hasTag("disableTpa")) {
    showActionBar(
      player,
      `${COLORS.red}${Lang.t(player, "tpa.msg.target_disabled", target.name)}`,
    );
    return;
  }

  if (player.hasTag("disableTpa")) {
    showActionBar(player, `${COLORS.red}${Lang.t(player, "tpa.msg.you_disabled")}`);
    return;
  }

  const requestKey = `${player.id}-${target.id}`;
  if (activeRequests.has(requestKey)) {
    showActionBar(player, `${COLORS.red}${Lang.t(player, "tpa.msg.pending")}`);
    return;
  }

  const playerRequests = requestLimits.get(player.id) || [];
  playerRequests.push(Date.now());
  requestLimits.set(player.id, playerRequests);
  cooldowns.set(player.id, Date.now());
  activeRequests.add(requestKey);

  const messageForm = new MessageFormData()
    .title(Lang.t(target, "tpa.request.title"))
    .body(
      tpHere
        ? `${COLORS.blue}${player.name} ${COLORS.gray}${Lang.t(target, "tpa.request.body_wants_you", player.name)}`
        : `${COLORS.blue}${player.name} ${COLORS.gray}${Lang.t(target, "tpa.request.body_wants_visit", player.name)}`,
    )
    .button1(Lang.t(target, "tpa.request.accept"))
    .button2(Lang.t(target, "tpa.request.decline"));

  showActionBar(
    player,
    `${COLORS.green}${Lang.t(player, "tpa.msg.request_sent", target.name)}`,
  );
  playSound(player, SOUNDS.accept);

  const requestTimeout = system.runTimeout(() => {
    if (activeRequests.has(requestKey)) {
      activeRequests.delete(requestKey);
      showActionBar(
        player,
        `${COLORS.red}${WARNING_ICON} ${Lang.t(player, "tpa.msg.timeout")}`,
      );
    }
  }, 30000);

  const result = await messageForm.show(target);
  system.clearRun(requestTimeout);

  if (result.canceled || result.selection === undefined) {
    showActionBar(player, `${COLORS.red}${Lang.t(player, "tpa.msg.request_denied")}`);
    playSound(player, SOUNDS.deny);
    activeRequests.delete(requestKey);
    return;
  }

  if (result.selection === 1) {
    showActionBar(player, `${COLORS.red}${Lang.t(player, "tpa.msg.request_denied")}`);
    playSound(player, SOUNDS.deny);
    activeRequests.delete(requestKey);
    return;
  }

  showActionBar(player, `${COLORS.green}${Lang.t(player, "tpa.msg.request_accepted")}`);
  playSound(player, SOUNDS.accept);

  if (isPlayerTeleporting(player)) {
    showActionBar(player, `${COLORS.red}Already in another teleport process!`);
    activeRequests.delete(requestKey);
    return;
  }

  if (!target || !isPlayerOnline(target) || target.hasTag("disableTpa")) {
    showActionBar(player, `${COLORS.red}${Lang.t(player, "tpa.msg.target_unavailable")}`);
    activeRequests.delete(requestKey);
    return;
  }

  try {
    player.runCommand(COMMANDS.hideOutput);
    const lockedPlayer = player;
    const initialPosition = { ...lockedPlayer.location };

    showActionBar(
      lockedPlayer,
      `${COLORS.yellow}${Lang.t(lockedPlayer, "tpa.msg.stand_still")}`,
    );

    await runTeleportCountdown(lockedPlayer, target, initialPosition);

    if (hasPlayerMoved(lockedPlayer, initialPosition)) {
      throw new Error("Movement detected at final check");
    }

    const targetName = tpHere ? target.name : player.name;
    const destinationName = tpHere ? player.name : target.name;
    const successMsg = rawText(`${COLORS.green}${Lang.t(player, "tpa.msg.success")}`);

    executeCommandsSync(targetName, destinationName, [
      `effect @s resistance 10 255 true`,
      `tp @s "${destinationName}"`,
      `playsound ${SOUNDS.teleport} @s`,
      `titleraw @s actionbar ${successMsg}`,
    ]);
  } catch (error) {
    if (!["Movement detected", "Player offline during countdown", "Teleport feature disabled"].includes(error.message)) {
      console.warn("Teleport error:", error);
      player.sendMessage(`${COLORS.red}${WARNING_ICON} ${Lang.t(player, "tpa.msg.failed")}`);
    }
  } finally {
    activeRequests.delete(requestKey);
    const now = Date.now();
    for (const [playerId, requests] of requestLimits) {
      const validRequests = requests.filter((time) => now - time < LIMIT_WINDOW);
      if (validRequests.length === 0) {
        requestLimits.delete(playerId);
      } else {
        requestLimits.set(playerId, validRequests);
      }
    }
    try {
      player.runCommand(COMMANDS.showOutput);
    } catch (e) {
      console.warn("Error resetting command feedback:", e);
    }
  }
}

function cleanupOldData() {
  const now = Date.now();

  for (const [playerId, time] of cooldowns) {
    if (now - time > COOLDOWN_DURATION) {
      cooldowns.delete(playerId);
    }
  }

  for (const [playerId, requests] of requestLimits) {
    const validRequests = requests.filter((time) => now - time < LIMIT_WINDOW);
    if (validRequests.length === 0) {
      requestLimits.delete(playerId);
    } else {
      requestLimits.set(playerId, validRequests);
    }
  }
}

system.runInterval(cleanupOldData, 60000);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  cooldowns.delete(playerId);
  requestLimits.delete(playerId);
  for (const key of activeRequests) {
    if (key.includes(playerId)) {
      activeRequests.delete(key);
    }
  }
});
