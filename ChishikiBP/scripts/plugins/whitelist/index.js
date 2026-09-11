import { world, system, ActionFormData, ModalFormData } from "../../core.js";
import { Lang } from "../../lib/Lang.js";
import { playSound } from "../../kiwora.js";
import { Database } from "../../function/Database.js";

const whitelistDb = Database.getDatabase("Whitelist");
const playerTrackerDb = Database.getDatabase("PlayerTracker");

const WhitelistManager = {
  isEnabled() {
    return world.getDynamicProperty("whitelist_enabled") || false;
  },

  toggleWhitelist() {
    const current = this.isEnabled();
    world.setDynamicProperty("whitelist_enabled", !current);
    return !current;
  },

  getWhitelistedPlayers() {
    const data = whitelistDb.get("whitelisted_players");
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  saveWhitelistedPlayers(players) {
    whitelistDb.set("whitelisted_players", JSON.stringify(players));
  },

  addPlayer(playerName) {
    const players = this.getWhitelistedPlayers();
    const lowerName = playerName.toLowerCase();
    if (!players.includes(lowerName)) {
      players.push(lowerName);
      this.saveWhitelistedPlayers(players);
      return true;
    }
    return false;
  },

  removePlayer(playerName) {
    const players = this.getWhitelistedPlayers();
    const lowerName = playerName.toLowerCase();
    const index = players.indexOf(lowerName);
    if (index > -1) {
      players.splice(index, 1);
      this.saveWhitelistedPlayers(players);
      return true;
    }
    return false;
  },

  isPlayerWhitelisted(playerName) {
    const players = this.getWhitelistedPlayers();
    return players.includes(playerName.toLowerCase());
  },

  shouldBypass(player) {
    if (player.hasTag("admin")) {
      return true;
    }
    return this.isPlayerWhitelisted(player.name);
  },

  getKickMessage() {
    const msg = whitelistDb.get("kick_message");
    return msg || "You are not whitelisted on this server!";
  },

  setKickMessage(message) {
    whitelistDb.set("kick_message", message);
  },

  shouldKick(player) {
    if (!this.isEnabled()) {
      return false;
    }
    if (player.hasTag("admin")) {
      return false;
    }
    return !this.isPlayerWhitelisted(player.name);
  }
};

globalThis.WhitelistManager = WhitelistManager;

function getAllPlayersForWhitelist() {
  const online = [...world.getPlayers()].map(p => p.name);
  const storedPlayers = [];
  try {
    const keys = playerTrackerDb.keys() || [];
    for (const key of keys) {
      if (key.startsWith("player_")) {
        try {
          const raw = playerTrackerDb.get(key);
          if (raw) {
            const data = JSON.parse(raw);
            if (data.name && !storedPlayers.includes(data.name)) {
              storedPlayers.push(data.name);
            }
          }
        } catch {}
      }
    }
  } catch {}
  
  const allPlayers = [...new Set([...online, ...storedPlayers])];
  
  if (allPlayers.length === 0 && online.length > 0) {
    return { allPlayers: online, online };
  }
  
  return { allPlayers, online };
}

const SIMPLE_UI_CARD = "§w§s";
const SIMPLE_UI_HEADER = "§w§h";
const SEARCH_HAY_LEN = 32;

function searchHaystack(text) {
  const clean = String(text ?? "").replace(/§./g, "").trim();
  if (!clean) return " ".repeat(SEARCH_HAY_LEN);
  const lower = clean.toLowerCase();
  const upper = clean.toUpperCase();
  return `${lower} ${upper}`.slice(0, SEARCH_HAY_LEN).padEnd(SEARCH_HAY_LEN, " ");
}

function formatPlayerButton(playerName, onlinePlayers, whitelistedPlayers) {
  const isOnline = onlinePlayers.includes(playerName);
  const isWhitelisted = whitelistedPlayers.includes(playerName.toLowerCase());
  const statusIcon = isOnline ? "§a●" : "§7●";
  const wlStatus = isWhitelisted ? " §a[WL]" : "";
  const status = isOnline ? "§a[ON]" : "§7[OFF]";
  const hay = searchHaystack(playerName);
  return `${SIMPLE_UI_CARD}${hay}${statusIcon} §f${playerName} ${status}${wlStatus}`;
}

function showWhitelistMenu(player) {
  if (!player) return;

  const isEnabled = WhitelistManager.isEnabled();
  const playerCount = WhitelistManager.getWhitelistedPlayers().length;
  const onlineCount = [...world.getPlayers()].length;

  const statusText = isEnabled ? "§aENABLED" : "§cDISABLED";
  const body = `§7Status: ${statusText}\n§7Whitelisted: §e${playerCount} §8| §7Online: §a${onlineCount}\n\n§7§lAdmin players bypass whitelist by default.`;

  new ActionFormData()
    .simpleUi()
    .title("§6Whitelist Manager")
    .body(body)
    .button(
      isEnabled ? "§cDisable Whitelist" : "§aEnable Whitelist",
      isEnabled ? "textures/ui/button_custom/Lock-Locked-e98de" : "textures/ui/button_custom/Lock-Unlocked-4fd1c"
    )
    .button("§eAdd Player", "textures/ui/button_custom/op")
    .button("§cRemove Player", "textures/ui/button_custom/kepala_zombie")
    .button("§bView Whitelist", "textures/ui/button_custom/freind")
    .button("§dSet Kick Message", "textures/icon_custom/pesan")
    .button("§7Back", "textures/ui/arrow_dark_left_stretch.png")
    .show(player)
    .then((response) => {
      if (response.canceled) return;

      switch (response.selection) {
        case 0:
          toggleWhitelistStatus(player);
          break;
        case 1:
          showAddPlayerMenu(player);
          break;
        case 2:
          showRemovePlayerMenu(player);
          break;
        case 3:
          showWhitelistList(player);
          break;
        case 4:
          showSetKickMessageMenu(player);
          break;
        case 5:
          break;
      }
    })
    .catch(() => {});
}

function toggleWhitelistStatus(player) {
  const newState = WhitelistManager.toggleWhitelist();
  const statusText = newState ? "§aENABLED" : "§cDISABLED";
  
  player.sendMessage(
    `§8[§eWhitelist§8] §7Whitelist has been ${statusText}`
  );
  playSound(player, "success");

  world.sendMessage(
    `§8[§eWhitelist§8] §7Whitelist is now ${statusText}§7`
  );

  showWhitelistMenu(player);
}

const PLAYER_ICON = "textures/ui/button_custom/kepala_player.png";

function showAddPlayerMenu(player) {
  const { allPlayers, online } = getAllPlayersForWhitelist();
  const whitelistedPlayers = WhitelistManager.getWhitelistedPlayers();

  if (allPlayers.length === 0) {
    player.sendMessage("§8[§eWhitelist§8] §7No players found");
    playSound(player, "warning");
    showWhitelistMenu(player);
    return;
  }

  const form = new ActionFormData()
    .simpleUi()
    .title("§aAdd to Whitelist")
    .body("§7Select a player to whitelist:");

  allPlayers.forEach(name => {
    form.button(formatPlayerButton(name, online, whitelistedPlayers), PLAYER_ICON);
  });

  form.button("§7Back", "textures/ui/arrow_dark_left_stretch.png");

  form.show(player).then((response) => {
    if (response.canceled) {
      showWhitelistMenu(player);
      return;
    }

    if (response.selection === allPlayers.length) {
      showWhitelistMenu(player);
      return;
    }

    const playerName = allPlayers[response.selection];

    if (WhitelistManager.addPlayer(playerName)) {
      player.sendMessage(`§8[§eWhitelist§8] §aAdded §e${playerName} §ato whitelist`);
      playSound(player, "success");
    } else {
      player.sendMessage(`§8[§eWhitelist§8] §e${playerName} §7is already whitelisted`);
      playSound(player, "warning");
    }

    showWhitelistMenu(player);
  }).catch(() => {});
}

function showRemovePlayerMenu(player) {
  const whitelistedPlayers = WhitelistManager.getWhitelistedPlayers();
  const { online } = getAllPlayersForWhitelist();

  if (whitelistedPlayers.length === 0) {
    player.sendMessage("§8[§eWhitelist§8] §7No players in whitelist");
    playSound(player, "warning");
    showWhitelistMenu(player);
    return;
  }

  const form = new ActionFormData()
    .simpleUi()
    .title("§cRemove from Whitelist")
    .body("§7Select a player to remove:");

  whitelistedPlayers.forEach(name => {
    form.button(formatPlayerButton(name, online, whitelistedPlayers), PLAYER_ICON);
  });

  form.button("§7Back", "textures/ui/arrow_dark_left_stretch.png");

  form.show(player).then((response) => {
    if (response.canceled) {
      showWhitelistMenu(player);
      return;
    }

    if (response.selection === whitelistedPlayers.length) {
      showWhitelistMenu(player);
      return;
    }

    const playerName = whitelistedPlayers[response.selection];
    if (WhitelistManager.removePlayer(playerName)) {
      player.sendMessage(`§8[§eWhitelist§8] §cRemoved §e${playerName} §cfrom whitelist`);
      playSound(player, "success");
    }

    showWhitelistMenu(player);
  }).catch(() => {});
}

function showWhitelistList(player) {
  const whitelistedPlayers = WhitelistManager.getWhitelistedPlayers();
  const { online } = getAllPlayersForWhitelist();
  
  let body = "§7§lWhitelisted Players:\n\n";
  
  if (whitelistedPlayers.length === 0) {
    body += "§cNo players whitelisted\n";
  } else {
    whitelistedPlayers.forEach((name) => {
      const isOnline = online.includes(name);
      const statusIcon = isOnline ? "§a●" : "§7●";
      body += `${statusIcon} §f${name} ${isOnline ? "§a(Online)" : "§7(Offline)"}\n`;
    });
  }

  body += "\n§7§lAdmin Players (Auto-Bypass):\n";
  const adminPlayers = [...world.getPlayers()].filter((p) => p.hasTag("admin"));
  if (adminPlayers.length === 0) {
    body += "§7No admin players online\n";
  } else {
    adminPlayers.forEach((p) => {
      body += `§6● §f${p.name} §7(Admin)\n`;
    });
  }

  new ActionFormData()
    .simpleUi()
    .title("§bWhitelist List")
    .body(body)
    .button("§7Back", "textures/ui/arrow_dark_left_stretch.png")
    .show(player)
    .then((response) => {
      if (!response.canceled) {
        showWhitelistMenu(player);
      }
    })
    .catch(() => {});
}

function showSetKickMessageMenu(player) {
  const currentMessage = WhitelistManager.getKickMessage();

  new ModalFormData()
    .title("§dSet Kick Message")
    .textField(
      "§7Kick Message:",
      "Message shown to non-whitelisted players",
      {
        defaultValue: currentMessage
      }
    )
    .show(player)
    .then((response) => {
      if (response.canceled || !response.formValues[0]) {
        showWhitelistMenu(player);
        return;
      }

      const message = response.formValues[0].trim();
      if (message.length > 0) {
        WhitelistManager.setKickMessage(message);
        player.sendMessage(
          `§8[§eWhitelist§8] §aKick message updated!`
        );
        playSound(player, "success");
      }

      showWhitelistMenu(player);
    })
    .catch(() => {});
}

function handlePlayerJoin(player) {
  system.runTimeout(() => {
    try {
      if (WhitelistManager.shouldKick(player)) {
        const kickMessage = WhitelistManager.getKickMessage();
        player.sendMessage(`[Whitelist] ${kickMessage}`);
        player.sendMessage(`Contact an admin to be whitelisted.`);
        
        system.runTimeout(() => {
          try {
            if (player?.isValid === true) {
              player.kick(kickMessage);
            }
          } catch (e) {
            try {
              player.runCommand(`kick "${player.name}" ${kickMessage}`);
            } catch (e2) {
            }
          }
        }, 20);
      }
    } catch (e) {
    }
  }, 10);
}

world.afterEvents.playerSpawn.subscribe((event) => {
  if (event.initialSpawn) {
    handlePlayerJoin(event.player);
  }
});

export { showWhitelistMenu, WhitelistManager };
