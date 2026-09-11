import { ActionFormData, ModalFormData, system, world } from "../../core";
import { getSethomeBenefits } from "../ranks/rank_benefits.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { isMemberFeatureEnabled } from "../../function/memberFeatureState.js";
import { Lang } from "../../lib/Lang.js";
import { requestTeleport, isPlayerTeleporting, sendActionBar, playTeleportSound, SOUNDS } from "../../function/teleportManager.js";

const HOME_DP_PREFIX = "sethome:";

export const SETHOME_CONFIG = {
  DEFAULT_MAX_HOMES: 5,
  MIN_Y: -64,
  TELEPORT_DELAY: 3,
  COOLDOWN_MS: 5000,
  CACHE_TTL_MS: 10000,
  MAX_HOME_NAME_LENGTH: 20,
  RATE_LIMIT_WINDOW_MS: 1000,
  MAX_OPERATIONS_PER_WINDOW: 3,
  TELEPORT_MOVEMENT_TOLERANCE: 0.1,
};

export const SETHOME_ICONS = {
  LAND: "textures/ui/icon_recipe_nature",
  BED: "textures/ui/icon_recipe_item",
  CHEST: "textures/ui/icon_blackfriday",
  MINE: "textures/ui/icon_iron_pickaxe",
  FARM: "textures/ui/icon_new",
  SHOP: "textures/ui/icon_staffpicks",
  PORTAL: "textures/ui/portalBg",
  BELL: "textures/ui/icon_bell",
};

export class PlayerCache {
  constructor() {
    this.cache = new Map();
    this.lastAccessed = new Map();
  }
  get(playerId) {
    const data = this.cache.get(playerId);
    if (!data) return null;
    if (Date.now() - data.timestamp > SETHOME_CONFIG.CACHE_TTL_MS) {
      this.cache.delete(playerId);
      this.lastAccessed.delete(playerId);
      return null;
    }
    this.lastAccessed.set(playerId, Date.now());
    return data.value;
  }
  set(playerId, value) {
    this.cache.set(playerId, { value, timestamp: Date.now() });
    this.lastAccessed.set(playerId, Date.now());
  }
  invalidate(playerId) {
    this.cache.delete(playerId);
    this.lastAccessed.delete(playerId);
  }
  cleanup() {
    const now = Date.now();
    for (const [playerId, data] of this.cache) {
      if (now - data.timestamp > SETHOME_CONFIG.CACHE_TTL_MS * 2) {
        this.cache.delete(playerId);
        this.lastAccessed.delete(playerId);
      }
    }
  }
}

export class CooldownManager {
  constructor() {
    this.cooldowns = new Map();
  }
  setCooldown(playerId, durationMs = SETHOME_CONFIG.COOLDOWN_MS) {
    this.cooldowns.set(playerId, Date.now() + durationMs);
  }
  isOnCooldown(playerId) {
    const expiry = this.cooldowns.get(playerId);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.cooldowns.delete(playerId);
      return false;
    }
    return true;
  }
  getRemainingMs(playerId) {
    const expiry = this.cooldowns.get(playerId);
    if (!expiry) return 0;
    return Math.max(0, expiry - Date.now());
  }
  cleanup() {
    const now = Date.now();
    for (const [playerId, expiry] of this.cooldowns) {
      if (now > expiry) {
        this.cooldowns.delete(playerId);
      }
    }
  }
}

export class RateLimiter {
  constructor(maxOps = SETHOME_CONFIG.MAX_OPERATIONS_PER_WINDOW, windowMs = SETHOME_CONFIG.RATE_LIMIT_WINDOW_MS) {
    this.operations = new Map();
    this.maxOps = maxOps;
    this.windowMs = windowMs;
  }
  canPerform(playerId) {
    const now = Date.now();
    const ops = this.operations.get(playerId) || [];
    const validOps = ops.filter((time) => now - time < this.windowMs);
    this.operations.set(playerId, validOps);
    return validOps.length < this.maxOps;
  }
  recordOperation(playerId) {
    const ops = this.operations.get(playerId) || [];
    ops.push(Date.now());
    this.operations.set(playerId, ops);
  }
  cleanup() {
    const now = Date.now();
    for (const [playerId, ops] of this.operations) {
      const validOps = ops.filter((time) => now - time < this.windowMs);
      if (validOps.length === 0) {
        this.operations.delete(playerId);
      } else {
        this.operations.set(playerId, validOps);
      }
    }
  }
}

const getHomeCfg = () => {
  const defaults = {
    maxHomes: SETHOME_CONFIG.DEFAULT_MAX_HOMES,
    minY: SETHOME_CONFIG.MIN_Y,
    teleportDelay: SETHOME_CONFIG.TELEPORT_DELAY,
  };
  const numberOr = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const normalize = (cfg) => ({
    maxHomes: Math.max(1, numberOr(cfg?.maxHomes, defaults.maxHomes)),
    minY: numberOr(cfg?.minY, defaults.minY),
    teleportDelay: Math.max(1, numberOr(cfg?.teleportDelay, defaults.teleportDelay)),
  });
  try {
    const legacy = world.getDynamicProperty("homeConfig");
    if (legacy) {
      const parsedLegacy = typeof legacy === "string" ? JSON.parse(legacy) : legacy;
      GlobalConfig.set("homeConfig", parsedLegacy);
      try { world.setDynamicProperty("homeConfig", undefined); } catch { }
      return normalize(parsedLegacy);
    }
    const s = GlobalConfig.get("homeConfig");
    return normalize(s ? (typeof s === "string" ? JSON.parse(s) : s) : defaults);
  } catch {
    return defaults;
  }
};

const ICONS = SETHOME_ICONS;
const iconKeys = Object.keys(ICONS);

const SETHOME_TIME_ICONS = {
  morning: "textures/ui/icon_bell",
  day: "textures/ui/icon_bell",
  evening: "textures/ui/icon_bell",
  night: "textures/ui/icon_bell",
};

const homeCache = new PlayerCache();
const teleportCooldowns = new CooldownManager();
const operationRateLimiter = new RateLimiter();

system.runInterval(() => {
  homeCache.cleanup();
  teleportCooldowns.cleanup();
  operationRateLimiter.cleanup();
}, 100);

const rawMsg = (text) => `{"rawtext":[{"text":"${String(text ?? "").replace(/"/g, '\\"')}"}]}`;

const getSethomeTimeMode = () => {
  let time = 0;
  try {
    time = world.getTimeOfDay();
  } catch { }
  time = ((time % 24000) + 24000) % 24000;
  if (time < 6000) return "morning";
  if (time < 12000) return "day";
  if (time < 18000) return "evening";
  return "night";
};

const sethomeTitle = (pl, key, ...args) => {
  return Lang.t(pl, key, ...args);
};

const getSethomeTimeIcon = () => SETHOME_TIME_ICONS[getSethomeTimeMode()];

const buildHomeSlotIndicator = (used, max) => {
  const total = Math.max(1, Number(max) || 1);
  const filled = Math.max(0, Math.min(Number(used) || 0, total));
  const visibleSlots = Math.min(total, 24);
  const slot = "\u25AC";
  let text = "";
  for (let i = 0; i < visibleSlots; i++) {
    text += `${i < filled ? "§c" : "§a"}${slot}`;
    if (visibleSlots <= 14 && i < visibleSlots - 1) text += " ";
  }
  if (total > visibleSlots) text += ` §7+${total - visibleSlots}`;
  return text;
};

const plainSethomeText = (text) => String(text).replace(/(?:Â§|§)./g, "");
const menuCardText = (text) => plainSethomeText(text).split("\n")[0].trim();

const getMaxHomes = (pl) => {
  const cfgMax = getHomeCfg().maxHomes;
  const benefitMax = Number(getSethomeBenefits(pl)?.maxHomes) || 0;
  return Math.max(cfgMax, benefitMax);
};

const isValidHomeName = (name) => {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= SETHOME_CONFIG.MAX_HOME_NAME_LENGTH &&
    !/[\x00-\x1F\x7F"\\]/.test(trimmed)
  );
};

const getHomes = (pl, useCache = true) => {
  const playerId = pl.id;
  if (useCache) {
    const cached = homeCache.get(playerId);
    if (cached) return cached;
  }
  const dpKey = HOME_DP_PREFIX + pl.name;
  let homes = [];
  let migrated = false;
  let rawDp = world.getDynamicProperty(dpKey);
  if (rawDp) {
    try {
      homes = typeof rawDp === "string" ? JSON.parse(rawDp) : rawDp;
    } catch (e) {
      homes = [];
    }
  } else {
    const legacyKey = pl.name + "_homes";
    const legacyRaw = GlobalConfig.get(legacyKey);
    if (legacyRaw) {
      try {
        homes = typeof legacyRaw === "string" ? JSON.parse(legacyRaw) : legacyRaw;
        migrated = true;
      } catch (e) {
        homes = [];
      }
    } else {
      const tags = pl.getTags();
      for (const tag of tags) {
        if (!tag.startsWith('{"Home":{')) continue;
        try {
          const parsed = JSON.parse(tag);
          if (parsed?.Home) homes.push(parsed.Home);
          pl.removeTag(tag);
          migrated = true;
        } catch {
          pl.removeTag(tag);
        }
      }
    }
  }
  homeCache.set(playerId, homes);
  if (migrated) {
    saveHomes(pl, homes);
    pl.sendMessage(Lang.t(pl, "sethome.migrated"));
  }
  return homes;
};

const invalidateHomeCache = (pl) => {
  if (pl?.id) homeCache.invalidate(pl.id);
};

const saveHomes = (pl, homes) => {
  const dpKey = HOME_DP_PREFIX + pl.name;
  world.setDynamicProperty(dpKey, JSON.stringify(homes));
  invalidateHomeCache(pl);
};

const createHomeObj = (name, desc, iconIdx, wmsg, location, dim) => ({
  Name: name.trim(),
  Description: desc.trim() || undefined,
  Pos: `${Math.trunc(location.x)} ${Math.trunc(location.y)} ${Math.trunc(location.z)}`,
  Dimension: dim,
  Icon: ICONS[iconKeys[iconIdx]],
  WelcomeMessage: wmsg.trim() || undefined,
  UUID: `${dim}:${Math.trunc(location.x)}:${Math.trunc(location.y)}:${Math.trunc(location.z)}`,
});

function homeMenu(pl) {
  if (!isMemberFeatureEnabled("setHome")) {
    pl.sendMessage("§cSet Home is currently disabled in Member Feature Toggle.");
    return;
  }
  if (!operationRateLimiter.canPerform(pl.id)) {
    pl.sendMessage(Lang.t(pl, "sethome.slowdown"));
    return;
  }
  operationRateLimiter.recordOperation(pl.id);
  const homes = getHomes(pl);
  const maxHomes = getMaxHomes(pl);
  new ActionFormData()
    .title(sethomeTitle(pl, "sethome.menu.title"))
    .body(buildHomeSlotIndicator(homes.length, maxHomes))
    .button(menuCardText(Lang.t(pl, "sethome.btn.create")), getSethomeTimeIcon())
    .button(menuCardText(Lang.t(pl, "sethome.btn.manage")), "textures/ui/icon_setting")
    .button(menuCardText(Lang.t(pl, "sethome.btn.teleport")), "textures/ui/icon_map")
    .show(pl)
    .then((r) => {
      if (r?.selection === undefined) return;
      const actions = [
        () =>
          homes.length >= maxHomes
            ? (pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.err.max"))}`),
              pl.runCommand("playsound note.bass @s"))
            : createHome(pl),
        () =>
          homes.length
            ? manageHome(pl, homes)
            : pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.err.none"))}`),
        () =>
          homes.length
            ? viewHome(pl, homes)
            : pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.err.none"))}`),
      ];
      actions[r.selection]?.();
    });
}

function createHome(pl) {
  new ModalFormData()
    .title(sethomeTitle(pl, "sethome.create.title"))
    .textField(Lang.t(pl, "sethome.create.name"), Lang.t(pl, "sethome.create.name.placeholder"), { defaultValue: "" })
    .textField(Lang.t(pl, "sethome.create.desc"), Lang.t(pl, "sethome.create.desc.placeholder"), { defaultValue: "" })
    .dropdown(Lang.t(pl, "sethome.create.icon"), iconKeys, { defaultValue: 0 })
    .textField(Lang.t(pl, "sethome.create.wmsg"), Lang.t(pl, "sethome.create.wmsg.placeholder"), { defaultValue: "" })
    .show(pl)
    .then((r) => {
      if (!r?.formValues) return;
      const [name, desc, iconIdx, wmsg] = r.formValues;
      const trimmedName = name.trim();
      const latestHomes = getHomes(pl, false);
      const maxHomes = getMaxHomes(pl);
      if (latestHomes.length >= maxHomes) {
        pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.err.max"))}`);
        pl.runCommand("playsound note.bass @s");
        return;
      }
      if (!isValidHomeName(trimmedName)) {
        pl.sendMessage(Lang.t(pl, "sethome.err.invalid_name", String(SETHOME_CONFIG.MAX_HOME_NAME_LENGTH)));
        return;
      }
      if (latestHomes.some((h) => h.Name.toLowerCase() === trimmedName.toLowerCase())) {
        pl.sendMessage(Lang.t(pl, "sethome.err.name_exists"));
        return;
      }
      const dim = pl.dimension.id.replace("minecraft:", "");
      const home = createHomeObj(name, desc, iconIdx, wmsg, pl.location, dim);
      latestHomes.push(home);
      saveHomes(pl, latestHomes);
      pl.sendMessage(Lang.t(pl, "sethome.created", trimmedName));
      pl.runCommand("playsound random.levelup @s");
    });
}

function manageHome(pl, homes) {
  const fm = new ActionFormData()
    .title(sethomeTitle(pl, "sethome.manage.title"))
    .body(Lang.t(pl, "sethome.manage.body", String(homes.length)));
  homes.forEach((home) => {
    fm.button(
      `${home.Name}§r\n§8${home.Description || home.Pos}`,
      home.Icon || ICONS.BELL,
    );
  });
  fm.show(pl).then((r) => {
    if (r?.selection !== undefined) editHome(pl, homes[r.selection]);
  });
}

function editHome(pl, home) {
  new ActionFormData()
    .title(sethomeTitle(pl, "sethome.edit.title", home.Name))
    .body(Lang.t(pl, "sethome.edit.body", home.Pos, home.Dimension))
    .button(Lang.t(pl, "sethome.edit.btn.location"), "textures/ui/levitation_effect")
    .button(Lang.t(pl, "sethome.edit.btn.details"), "textures/ui/icon_setting")
    .button(Lang.t(pl, "sethome.edit.btn.delete"), "textures/ui/icon_trash")
    .show(pl)
    .then((r) => {
      if (r?.selection === undefined) return;
      const actions = [
        () => updateHomeLoc(pl, home),
        () => editHomeDetail(pl, home),
        () => delHome(pl, home),
      ];
      actions[r.selection]();
    });
}

function viewHome(pl, homes) {
  const fm = new ActionFormData()
    .title(sethomeTitle(pl, "sethome.tp.title"))
    .body(Lang.t(pl, "sethome.tp.body"));
  const teleportIcon = getSethomeTimeIcon();
  homes.forEach((home) => {
    fm.button(plainSethomeText(home.Name), teleportIcon);
  });
  fm.show(pl).then((r) => {
    if (r?.selection !== undefined) tpHome(pl, homes[r.selection]);
  });
}

function updateHomeLoc(pl, home) {
  const { x, y, z } = pl.location;
  const dim = pl.dimension.id.replace("minecraft:", "");
  const newHome = {
    ...home,
    Pos: `${Math.trunc(x)} ${Math.trunc(y)} ${Math.trunc(z)}`,
    Dimension: dim,
    UUID: `${dim}:${Math.trunc(x)}:${Math.trunc(y)}:${Math.trunc(z)}`,
  };
  const homes = getHomes(pl);
  const index = homes.findIndex((h) => h.UUID === home.UUID);
  if (index !== -1) {
    homes[index] = newHome;
    saveHomes(pl, homes);
    pl.sendMessage(Lang.t(pl, "sethome.loc.updated", home.Name));
    pl.runCommand("playsound random.levelup @s");
  }
}

function editHomeDetail(pl, home) {
  const currentIcon = iconKeys.findIndex((key) => ICONS[key] === home.Icon);
  new ModalFormData()
    .title(sethomeTitle(pl, "sethome.edit.title", home.Name))
    .textField(Lang.t(pl, "sethome.create.name"), Lang.t(pl, "sethome.create.name.placeholder"), { defaultValue: home.Name })
    .textField(Lang.t(pl, "sethome.create.desc"), Lang.t(pl, "sethome.create.desc.placeholder"), { defaultValue: home.Description || "" })
    .dropdown(Lang.t(pl, "sethome.create.icon"), iconKeys, { defaultValue: Math.max(0, currentIcon) })
    .textField(Lang.t(pl, "sethome.create.wmsg"), Lang.t(pl, "sethome.create.wmsg.placeholder"), { defaultValue: home.WelcomeMessage || "" })
    .show(pl)
    .then((r) => {
      if (!r?.formValues) return;
      const [name, desc, iconIdx, wmsg] = r.formValues;
      const trimmedName = name.trim();
      if (trimmedName !== home.Name && !isValidHomeName(trimmedName)) {
        pl.sendMessage(Lang.t(pl, "sethome.err.invalid_name", String(SETHOME_CONFIG.MAX_HOME_NAME_LENGTH)));
        return;
      }
      const homes = getHomes(pl);
      if (
        trimmedName !== home.Name &&
        homes.some((h) => h.UUID !== home.UUID && h.Name.toLowerCase() === trimmedName.toLowerCase())
      ) {
        pl.sendMessage(Lang.t(pl, "sethome.err.name_exists"));
        return;
      }
      const newHome = {
        ...home,
        Name: trimmedName || home.Name,
        Description: desc.trim() || undefined,
        Icon: ICONS[iconKeys[iconIdx]],
        WelcomeMessage: wmsg.trim() || undefined,
      };
      const index = homes.findIndex((h) => h.UUID === home.UUID);
      if (index !== -1) {
        homes[index] = newHome;
        saveHomes(pl, homes);
        pl.sendMessage(Lang.t(pl, "sethome.updated", newHome.Name));
        pl.runCommand("playsound random.levelup @s");
      }
    });
}

function delHome(pl, home) {
  new ActionFormData()
    .title(sethomeTitle(pl, "sethome.delete.title"))
    .body(Lang.t(pl, "sethome.delete.body", home.Name))
    .button(Lang.t(pl, "sethome.delete.confirm"), "textures/ui/icon_trash")
    .button(Lang.t(pl, "sethome.delete.cancel"), "textures/ui/icon_cancel")
    .show(pl)
    .then((r) => {
      if (r?.selection === 0) {
        const homes = getHomes(pl);
        const newHomes = homes.filter((h) => h.UUID !== home.UUID);
        if (homes.length !== newHomes.length) {
          saveHomes(pl, newHomes);
          pl.sendMessage(Lang.t(pl, "sethome.deleted", home.Name));
          pl.runCommand("playsound random.break @s");
        }
      }
    });
}

function tpHome(pl, home) {
  if (isPlayerTeleporting(pl)) {
    pl.sendMessage(Lang.t(pl, "sethome.tp.already"));
    return;
  }
  if (teleportCooldowns.isOnCooldown(pl.id)) {
    const remaining = Math.ceil(teleportCooldowns.getRemainingMs(pl.id) / 1000);
    pl.sendMessage(Lang.t(pl, "sethome.tp.cooldown", String(remaining)));
    return;
  }

  const cfg = getHomeCfg();
  const { Name, Pos, Dimension, WelcomeMessage } = home;
  const coords = Pos.split(" ");
  if (coords.length !== 3) return;
  const [x, y, z] = coords;

  teleportCooldowns.setCooldown(pl.id);

  requestTeleport(pl, {
    type: "home",
    title: Name,
    duration: cfg.teleportDelay,
    customCancelMsg: Lang.t(pl, "sethome.tp.move") || "§cTeleport cancelled - You moved!",
    onComplete: (player) => {
      if (!isMemberFeatureEnabled("setHome")) {
        player.sendMessage("§cSet Home was disabled; teleport canceled.");
        return;
      }
      try {
        player.runCommand(`execute in ${Dimension} run tp @s ${x} ${y} ${z}`);
        sendActionBar(player, Lang.t(player, "sethome.tp.ok", Name));
        if (WelcomeMessage) player.sendMessage(`§e➤ ${WelcomeMessage}`);
        playTeleportSound(player, SOUNDS.SUCCESS);
      } catch (e) {
        console.warn("[SetHome] Teleport execution error:", e);
      }
    },
  });
}

export function handleHomeCommand(pl, homeName) {
  if (!isMemberFeatureEnabled("setHome")) {
    pl.sendMessage("§cSet Home feature is currently disabled by admin.");
    return;
  }
  const homes = getHomes(pl);
  const maxHomes = getMaxHomes(pl);
  const trimmed = typeof homeName === "string" ? homeName.trim() : "";

  if (!trimmed) {
    if (!homes.length) {
      pl.sendMessage(Lang.t(pl, "sethome.err.none") || "§c! You have no home yet!");
      pl.sendMessage("§aUse §f/sethome <name>§a to create a home point.");
      return;
    }
    if (homes.length === 1) {
      tpHome(pl, homes[0]);
      return;
    }
    const list = homes.map((h) => `§b${h.Name}§7`).join("§7, ");
    pl.sendMessage(`§aYour Homes (${homes.length}/${maxHomes}): ${list}`);
    pl.sendMessage("§aUse §f/home <name>§a to teleport to a home.");
    return;
  }

  const target = homes.find((h) => h.Name.toLowerCase() === trimmed.toLowerCase());
  if (!target) {
    pl.sendMessage(Lang.t(pl, "sethome.err.not_found", trimmed) || `§cHome "${trimmed}" tidak ditemukan.`);
    const list = homes.length ? homes.map((h) => `§b${h.Name}§7`).join("§7, ") : "§cNone";
    pl.sendMessage(`§aAvailable Homes: ${list}`);
    return;
  }
  tpHome(pl, target);
}

export function handleSethomeCommand(pl, homeName) {
  if (!isMemberFeatureEnabled("setHome")) {
    pl.sendMessage("§cSet Home feature is currently disabled by admin.");
    return;
  }
  const rawName = typeof homeName === "string" ? homeName.trim() : "";
  const trimmedName = rawName || "home";

  if (!isValidHomeName(trimmedName)) {
    pl.sendMessage(Lang.t(pl, "sethome.err.invalid_name", String(SETHOME_CONFIG.MAX_HOME_NAME_LENGTH)));
    return;
  }

  const latestHomes = getHomes(pl, false);
  const maxHomes = getMaxHomes(pl);
  const existingIndex = latestHomes.findIndex((h) => h.Name.toLowerCase() === trimmedName.toLowerCase());
  const dim = pl.dimension.id.replace("minecraft:", "");
  const { x, y, z } = pl.location;

  if (existingIndex !== -1) {
    latestHomes[existingIndex] = {
      ...latestHomes[existingIndex],
      Pos: `${Math.trunc(x)} ${Math.trunc(y)} ${Math.trunc(z)}`,
      Dimension: dim,
      UUID: `${dim}:${Math.trunc(x)}:${Math.trunc(y)}:${Math.trunc(z)}`,
    };
    saveHomes(pl, latestHomes);
    pl.sendMessage(Lang.t(pl, "sethome.loc.updated", trimmedName));
    try { pl.playSound("random.levelup"); } catch {}
    return;
  }

  if (latestHomes.length >= maxHomes) {
    try { pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.err.max"))}`); } catch {}
    pl.sendMessage(Lang.t(pl, "sethome.err.max") || "§c! You hit the home limit!");
    try { pl.playSound("note.bass"); } catch {}
    return;
  }

  const home = createHomeObj(trimmedName, "", 0, "", pl.location, dim);
  latestHomes.push(home);
  saveHomes(pl, latestHomes);
  pl.sendMessage(Lang.t(pl, "sethome.created", trimmedName));
  try { pl.playSound("random.levelup"); } catch {}
}

export function handleDelhomeCommand(pl, homeName) {
  if (!isMemberFeatureEnabled("setHome")) {
    pl.sendMessage("§cSet Home feature is currently disabled by admin.");
    return;
  }
  const trimmed = typeof homeName === "string" ? homeName.trim() : "";
  if (!trimmed) {
    pl.sendMessage("§cUsage: /delhome <home_name>");
    return;
  }
  const homes = getHomes(pl, false);
  const target = homes.find((h) => h.Name.toLowerCase() === trimmed.toLowerCase());
  if (!target) {
    pl.sendMessage(Lang.t(pl, "sethome.err.not_found", trimmed) || `§cHome "${trimmed}" tidak ditemukan.`);
    return;
  }
  const newHomes = homes.filter((h) => h.UUID !== target.UUID);
  saveHomes(pl, newHomes);
  pl.sendMessage(Lang.t(pl, "sethome.deleted", target.Name));
  try { pl.playSound("random.break"); } catch {}
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  homeCache.invalidate(playerId);
  teleportCooldowns.cooldowns.delete(playerId);
  operationRateLimiter.operations.delete(playerId);
});

export {
  homeMenu as HomeSystem,
  invalidateHomeCache,
  getHomes,
  saveHomes,
  getMaxHomes,
  isValidHomeName,
  createHomeObj,
  tpHome,
};
