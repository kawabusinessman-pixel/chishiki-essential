import {
 system,
 world,
 ActionFormData,
 MessageFormData,
 ModalFormData,
} from "../core.js";
import { ForceOpen } from "../function/ForceOpen.js";
import { board, notifyConfigChange, DEFAULT_LINES, SCOREBOARD_PRESETS, setMaxOnlineSlots, getMaxOnlineSlots } from "./_config.js";
import {
 ChatDB,
 ClanDB,
 NametagDB,
 RankDB,
 ScoreboardDB,
 ScoreboardLines,
 PlaceholderDB,
} from "./data.js";
import { symbolCategories } from "./unicode.js";
import { handleChatDisplay } from "./custom_chat.js";
import { getCurrency, currencyDB } from "../function/getCurrency.js";
import { showCurrencyConfigForm } from "./currency_config.js";
import {
 setCustomMetrics,
 getCustomMetrics,
 resetMetricsToDefault,
} from "../lib/game.js";
import {
 globalCache,
 formatLine,
 getFormattedSymbolsList,
 clearSymbolCache,
} from "../lib/cache.js";
import {
 UI_TEXTURES,
 SOUNDS,
 MESSAGES,
 playSuccessSound,
 playErrorSound,
 sendSuccessMessage,
 sendErrorMessage,
 sendNoChangesMessage,
 handleConfigUpdate,
} from "./ui_common.js";
import { handleCustomPlaceholders } from "./custom_placeholders.js";
import { GlobalConfig } from "../function/GlobalConfig.js";
import { Lang } from "../lib/Lang.js";
const t = (player, key, ...args) => Lang.t(player, key, ...args);
const getScoreboardLines = () => ScoreboardLines.get("lines") || board.Line;
const previewLine = (player, line) =>
 line === "@BLANK" ? t(player, "scb.lines.empty") : line;
const GUIDE_SECTIONS = [
 { id: "layout", ph: ["blank"] },
 { id: "player", ph: ["name", "rank", "clan", "gender", "health", "level", "xp", "playtime"] },
 { id: "economy", ph: ["currency", "money", "bank", "coin"] },
 { id: "combat", ph: ["kill", "death", "ping"] },
 { id: "server", ph: ["online", "maxon", "tps", "clearlag"] },
 { id: "limits", ph: ["homes", "maxhomes", "homesmax", "lands", "maxlands", "landsmax"] },
 { id: "time", ph: ["hour", "minute", "day", "month", "year"] },
 { id: "location", ph: ["dimension", "x", "y", "z"] },
 { id: "examples", ph: ["ex1", "ex2", "ex3", "ex4"] },
];
const DEFAULT_VALUES = {
  title: "",
  logoEnabled: true,
  useTextLogo: false,
  textLogo: "Chishiki Essential",
  currency: "$",
  maxOnline: "10",
  rankPrefix: "rank:",
  clanPrefix: "clan:",
  clanDefault: "§fNone",
  chatFormat: "§8[§r@RANK§8] §8[§r@CLAN§8] §7@NAME >>§r @MSG",
  nametagFormat: "§8[§r@RANK§8] §f@NAME §7@PINGms@NL§r§8[§r@GENDER§8] §8[§r@CLAN§8]",
  timezone: "+7",
};
const updateDB = (db, key, value) => {
 db.set(key, value);
 globalCache.set("lastUpdate", Date.now());
};
const initializeConfigs = () => {
 try {
 const oldLines = GlobalConfig.get("scoreboard_lines");
 if (oldLines && !ScoreboardLines.get("lines")) {
 const parsedLines = typeof oldLines === "string" ? JSON.parse(oldLines) : oldLines;
 if (Array.isArray(parsedLines)) {
 ScoreboardLines.set("lines", parsedLines);
 }
 }
 const defaultCurrency = currencyDB.get("CurrencyDBConfig-default");
 if (defaultCurrency) {
 ScoreboardDB.set("ScoreboardDBConfig-currency", defaultCurrency);

 }
 const maxOnline = ScoreboardDB.get("ScoreboardDBConfig-max-online") ?? GlobalConfig.get("scoreboard:maxOnline");
 if (maxOnline !== undefined && maxOnline !== null && String(maxOnline).trim() !== "") {
 setMaxOnlineSlots(maxOnline);
 }
 } catch { }
};
system.runTimeout(initializeConfigs, 20);
async function FuncBoardConfig(player) {
 const UI = new ActionFormData()
 .title("Board Configuration")
 .button("Scoreboard Config", UI_TEXTURES.CREATIVE)
 .button("Rank Config", UI_TEXTURES.RANK)
 .button("Clan Config", UI_TEXTURES.MULTIPLAYER)
 .button("Currency Config", UI_TEXTURES.CRAFTING)
 .button("Money System Config", UI_TEXTURES.CRAFTING)
 .button("Metrics Config", UI_TEXTURES.SETTING)
 .button("Chat Display", UI_TEXTURES.MAP)
 .button("Nametag Display", UI_TEXTURES.ARMOR)
 .button("All Config Reset", UI_TEXTURES.REFRESH);
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 const actions = [
 FuncScbConfig,
 handleRankConfig,
 handleClanConfig,
 showCurrencyConfigForm,
 handleMoneySystemConfig,
 handleMetricsConfig,
 handleChatDisplay,
 handleNametagDisplay,
 handleConfigReset,
 ];
 actions[result.selection]?.(player);
}
async function handleRankConfig(player) {
 const UI = new ModalFormData().title("Rank Config");
 UI.textField("Rank prefix", "Enter rank prefix", {
 defaultValue:
 RankDB.get("RankDBConfig-prefix") ?? DEFAULT_VALUES.rankPrefix,
 placeholder: "Example: rank:",
 });
 UI.textField("Rank default", "Enter default rank", {
 defaultValue: RankDB.get("RankDBConfig-default") ?? "",
 placeholder: "Leave empty for no default",
 });
 UI.toggle("Apply Changes Immediately", {
 defaultValue: true,
 });
 try {
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 const [prefix, defaultRank, applyImmediately] = result.formValues;
 let changes = 0;
 if (prefix) {
 updateDB(RankDB, "RankDBConfig-prefix", prefix);
 changes++;
 }
 if (defaultRank !== undefined) {
 updateDB(RankDB, "RankDBConfig-default", defaultRank);
 changes++;
 }
 handleConfigUpdate(
 player,
 changes,
 "§a Rank config updated",
 applyImmediately,
 );
 } catch (error) {
 console.warn("Error in handleRankConfig:", error);
 sendErrorMessage(
 player,
 "§c Failed to update rank config. Please try again",
 );
 }
}
async function handleClanConfig(player) {
 const UI = new ModalFormData().title("Clan Config");
 UI.textField("Clan prefix (§cnot used anymore§r)", "No longer used", {
 defaultValue:
 ClanDB.get("ClanDBConfig-prefix") ?? DEFAULT_VALUES.clanPrefix,
 placeholder: "Example: clan:",
 disabled: true,
 });
 UI.textField("Clan default", "Enter default clan", {
 defaultValue:
 ClanDB.get("ClanDBConfig-default") ?? DEFAULT_VALUES.clanDefault,
 placeholder: "Example: None",
 });
 UI.toggle("Apply Changes Immediately", {
 defaultValue: true,
 });
 try {
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 const [, defaultClan, applyImmediately] = result.formValues;
 let changes = 0;
 if (defaultClan !== undefined) {
 updateDB(
 ClanDB,
 "ClanDBConfig-default",
 defaultClan || DEFAULT_VALUES.clanDefault,
 );
 changes++;
 }
 handleConfigUpdate(
 player,
 changes,
 "§a Clan config updated",
 applyImmediately,
 );
 } catch (error) {
 console.warn("Error in handleClanConfig:", error);
 sendErrorMessage(
 player,
 "§c Failed to update clan config. Please try again",
 );
 }
}
async function handleMoneySystemConfig(player) {
 try {
 const { handleMoneySystemConfig } =
 await import("../function/moneySystem.js");
 await handleMoneySystemConfig(player);
 } catch (error) {
 console.warn("Error in handleMoneySystemConfig:", error);
 sendErrorMessage(player, "§c Failed to open money system configuration");
 }
}
async function handleNametagDisplay(player) {
 try {
 const { handleNametagConfig } = await import("./nametag.js");
 await handleNametagConfig(player);
 } catch (error) {
 console.warn("Error in handleNametagDisplay:", error);
 sendErrorMessage(player, "§c Failed to open nametag configuration");
 }
}
async function handleConfigReset(player) {
 const configs = [
 { db: ScoreboardDB, name: "Scoreboard" },
 { db: RankDB, name: "Rank" },
 { db: ClanDB, name: "Clan" },
 { db: currencyDB, name: "Currency" },
 { db: ChatDB, name: "Chat" },
 { db: NametagDB, name: "Nametag" },
 ];
 const UI = new ModalFormData().title("Reset Configs");
 for (const element of configs) {
 UI.toggle(`Reset ${element.name}`);
 }
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 const resetToggles = result.formValues;
 let resetCount = 0;
 for (let i = 0; i < resetToggles.length; i++) {
 if (!resetToggles[i]) continue;
 const { db, name } = configs[i];
 db.clear();
 switch (name) {
 case "Scoreboard":
 updateDB(db, "ScoreboardDBConfig-title", DEFAULT_VALUES.title);
 updateDB(db, "ScoreboardDBConfig-currency", DEFAULT_VALUES.currency);
 updateDB(db, "ScoreboardDBConfig-max-online", DEFAULT_VALUES.maxOnline);
 updateDB(
 db,
 "ScoreboardDBConfig-offset-timezone",
 DEFAULT_VALUES.timezone,
 );
  updateDB(db, "ScoreboardDBConfig-enabled", true);
  updateDB(db, "ScoreboardDBConfig-logo-enabled", DEFAULT_VALUES.logoEnabled);
  updateDB(db, "ScoreboardDBConfig-use-text-logo", DEFAULT_VALUES.useTextLogo);
  updateDB(db, "ScoreboardDBConfig-text-logo", DEFAULT_VALUES.textLogo);
  ScoreboardLines.set("lines", DEFAULT_LINES);
 break;
 case "Rank":
 updateDB(db, "RankDBConfig-prefix", DEFAULT_VALUES.rankPrefix);
 updateDB(db, "RankDBConfig-default", "");
 break;
 case "Clan":
 updateDB(db, "ClanDBConfig-prefix", DEFAULT_VALUES.clanPrefix);
 updateDB(db, "ClanDBConfig-default", DEFAULT_VALUES.clanDefault);
 break;
 case "Currency":
 currencyDB.set("CurrencyDBConfig-default", DEFAULT_VALUES.currency);
 break;
 case "Chat":
 updateDB(db, "ChatDBDisplay-chat", DEFAULT_VALUES.chatFormat);
 updateDB(db, "ChatDBDisplay-status", false);
 try {
 GlobalConfig.set(
 "chat_settings",
 {
 format: DEFAULT_VALUES.chatFormat,
 enabled: false,
 multiLine: false,
 showTime: false,
 lastUpdate: Date.now(),
 }
 );
 } catch { }
 break;
 case "Nametag":
 updateDB(db, "NametagDBDisplay-nametag", DEFAULT_VALUES.nametagFormat);
 updateDB(db, "NametagDBDisplay-status", false);
 break;
 }
 resetCount++;
 }
 if (resetCount > 0) {
 notifyConfigChange();
 globalCache.set("lastUpdate", Date.now());
 sendSuccessMessage(
 player,
 `§a ${resetCount} config(s) have been reset to default`,
 );
 } else {
 sendNoChangesMessage(player);
 }
}
async function FuncScbConfig(player) {
 const isEnabled = ScoreboardDB.get("ScoreboardDBConfig-enabled") ?? true;
 const UI = new ActionFormData()
 .title("Scoreboard Settings")
 .body("Manage the scoreboard settings")
 .button(
 `${isEnabled ? "§aDisable" : "§eEnable"} Scoreboard`,
 isEnabled ? UI_TEXTURES.TOGGLE_ON : UI_TEXTURES.TOGGLE_OFF,
 )
 .button("Basic Settings", UI_TEXTURES.AUTOMATION)
 .button(t(player, "scb.lines.btn.manage"), UI_TEXTURES.BACKUP)
  .button("§bScoreboard Presets\n§7Choose a layout", "textures/board/presets/economy")
 .button("Custom Placeholders", UI_TEXTURES.CRAFTING)
 .button("Reset Default", UI_TEXTURES.REFRESH);
 const result = await ForceOpen(player, UI);
 if (result.canceled) return FuncBoardConfig(player);
 const actions = [
 handleToggleScoreboard,
 handleBasicSettings,
 handleManageLines,
 handleScoreboardPresets,
 handleCustomPlaceholders,
 handleResetScoreboard,
 ];
 actions[result.selection]?.(player);
}


const SCB_PRESET_TITLE = "[[scb_presets]]Scoreboard Presets";

function getActiveScoreboardPresetId() {
 try {
 const id = ScoreboardDB.get("ScoreboardDBConfig-preset");
 if (id) return String(id);
 } catch {}
 return "classic";
}

async function handleScoreboardPresets(player) {
 try {
 const activeId = getActiveScoreboardPresetId();
 const activePreset =
 SCOREBOARD_PRESETS.find((p) => p.id === activeId) || SCOREBOARD_PRESETS[0];
 const activeName = String(activePreset?.name || "Classic").replace(/§./g, "");
 const UI = new ActionFormData()
 .title(SCB_PRESET_TITLE)
  .body(`§7Active layout: §a${activeName}\n§8Choose a preset to apply instantly`);
 for (const preset of SCOREBOARD_PRESETS) {
 const isActive = preset.id === activeId;
 const label = String(preset.label || preset.name);
 
 UI.button(
  isActive ? `${label}\n§aSelected` : `${label}\n§8Tap to apply`,
 preset.icon,
 );
 }
  UI.button("§cBack\n§8Settings", "textures/board/presets/back");
 const result = await ForceOpen(player, UI);
 if (result.canceled || result.selection === SCOREBOARD_PRESETS.length) {
 return FuncScbConfig(player);
 }
 const preset = SCOREBOARD_PRESETS[result.selection];
 if (!preset?.lines) return FuncScbConfig(player);
 ScoreboardLines.set("lines", [...preset.lines]);
 try {
 ScoreboardDB.set("ScoreboardDBConfig-preset", preset.id);
 } catch {}
 globalCache.delete("lines");
 globalCache.set("lastUpdate", Date.now());
 notifyConfigChange();
 sendSuccessMessage(
 player,
 `§a Applied: ${String(preset.name).replace(/§./g, "")}`,
 );
 return handleScoreboardPresets(player);
 } catch (error) {
 console.warn("Error in handleScoreboardPresets:", error);
 sendErrorMessage(player, "§c Failed to apply scoreboard preset");
 return FuncScbConfig(player);
 }
}
async function handleToggleScoreboard(player) {
 const currentStatus = ScoreboardDB.get("ScoreboardDBConfig-enabled") ?? true;
 const newStatus = !currentStatus;
 const UI = new MessageFormData()
 .title("Toggle Scoreboard")
 .body(
 `Are you sure you want to ${newStatus ? "enable" : "disable"} the scoreboard?\n\n§7Current status: ${currentStatus ? "§aEnabled" : "§cDisabled"}§7\nNew status: ${newStatus ? "§aEnabled" : "§cDisabled"}`,
 )
 .button1("Confirm")
 .button2("Cancel");
 const result = await ForceOpen(player, UI);
 if (result.canceled || result.selection === 1) return;
 updateDB(ScoreboardDB, "ScoreboardDBConfig-enabled", newStatus);
 notifyConfigChange();
 sendSuccessMessage(
 player,
 `§a Scoreboard has been ${newStatus ? "§aenabled" : "§cdisabled"}§a`,
 );
}
async function handleBasicSettings(player) {
  await ScoreboardDB.ready();
  const timezones = [
 "UTC-12",
 "UTC-11",
 "UTC-10",
 "UTC-9",
 "UTC-8",
 "UTC-7",
 "UTC-6",
 "UTC-5",
 "UTC-4",
 "UTC-3",
 "UTC-2",
 "UTC-1",
 "UTC+0",
 "UTC+1",
 "UTC+2",
 "UTC+3",
 "UTC+4",
 "UTC+5",
 "UTC+6",
 "UTC+7",
 "UTC+8",
 "UTC+9",
 "UTC+10",
 "UTC+11",
 "UTC+12",
 "UTC+13",
 "UTC+14",
 ];
  const currentTitle = ScoreboardDB.get("ScoreboardDBConfig-title");
  const currentLogoEnabled =
  ScoreboardDB.get("ScoreboardDBConfig-logo-enabled") ?? GlobalConfig.get("scoreboard:logoEnabled") ?? DEFAULT_VALUES.logoEnabled;
  const currentUseTextLogo =
  ScoreboardDB.get("ScoreboardDBConfig-use-text-logo") ?? GlobalConfig.get("scoreboard:useTextLogo") ?? DEFAULT_VALUES.useTextLogo;
  const currentTextLogo =
  ScoreboardDB.get("ScoreboardDBConfig-text-logo") || GlobalConfig.get("scoreboard:textLogo") || DEFAULT_VALUES.textLogo;
  const currentCurrency =
  currencyDB.get("CurrencyDBConfig-default") ||
  ScoreboardDB.get("ScoreboardDBConfig-currency");
  const currentMaxOnline = ScoreboardDB.get("ScoreboardDBConfig-max-online");
  const currentTimezone = GlobalConfig.get("time:timezone") ?? DEFAULT_VALUES.timezone;
  const timezonesIndex = timezones.indexOf(currentTimezone);
  const UI = new ModalFormData().title("Basic Settings");
  UI.toggle("Real-Time\n§7Minecraft time follows timezone", {
  defaultValue: GlobalConfig.get("time:enabled") ?? false,
  });
  UI.toggle("Scoreboard Logo\n§7Show the logo above the scoreboard", {
  defaultValue: currentLogoEnabled,
  });
  UI.toggle("Use Text Logo\n§7Use text logo instead of title.png", {
  defaultValue: currentUseTextLogo,
  });
  UI.textField("Text Logo", "Enter text logo (e.g. Chishiki Essential)", {
  defaultValue: currentTextLogo ?? DEFAULT_VALUES.textLogo,
  placeholder: "Chishiki Essential",
  });
  UI.textField("Title", "Enter server title (optional)", {
  defaultValue: currentTitle ?? DEFAULT_VALUES.title,
  placeholder: "Leave empty for no title",
  });
  UI.textField("Currency", "Enter currency symbol", {
  defaultValue: currentCurrency ?? DEFAULT_VALUES.currency,
  placeholder: "$",
  });
  UI.textField("Max Online", "Enter max players", {
  defaultValue: currentMaxOnline ?? DEFAULT_VALUES.maxOnline,
  placeholder: "20",
  });
  UI.dropdown("Timezone", timezones, {
  defaultValueIndex: timezonesIndex !== -1 ? timezonesIndex : 19,
  });
  UI.toggle("Apply Changes Immediately", {
  defaultValue: true,
  });
  try {
  const result = await ForceOpen(player, UI);
  if (result.canceled) return FuncScbConfig(player);
  const [
  enableRealTime,
  logoEnabled,
  useTextLogo,
  textLogo,
  title,
  currency,
  maxOnline,
  timezoneIndex,
  applyImmediately,
  ] = result.formValues;
  let changes = 0;
  const selectedTimezone = timezones[timezoneIndex];
  const currentTimezone = GlobalConfig.get("time:timezone");
  const currentRealTime = GlobalConfig.get("time:enabled");
  if (logoEnabled !== currentLogoEnabled) {
  updateDB(ScoreboardDB, "ScoreboardDBConfig-logo-enabled", logoEnabled);
  GlobalConfig.set("scoreboard:logoEnabled", logoEnabled);
  changes++;
  }
  if (useTextLogo !== currentUseTextLogo) {
  updateDB(ScoreboardDB, "ScoreboardDBConfig-use-text-logo", useTextLogo);
  GlobalConfig.set("scoreboard:useTextLogo", useTextLogo);
  changes++;
  }
  if (textLogo !== undefined && textLogo !== currentTextLogo) {
  const finalLogo = textLogo || DEFAULT_VALUES.textLogo;
  updateDB(
  ScoreboardDB,
  "ScoreboardDBConfig-text-logo",
  finalLogo,
  );
  GlobalConfig.set("scoreboard:textLogo", finalLogo);
  changes++;
  }
  if (title !== undefined && title !== currentTitle) {
  updateDB(
  ScoreboardDB,
  "ScoreboardDBConfig-title",
  title || DEFAULT_VALUES.title,
  );
  changes++;
  }
  if (currency !== undefined && currency !== currentCurrency) {
  updateDB(
  ScoreboardDB,
  "ScoreboardDBConfig-currency",
  currency || DEFAULT_VALUES.currency,
  );
  if (currency !== currentCurrency) {
  currencyDB.set(
  "CurrencyDBConfig-default",
  currency || DEFAULT_VALUES.currency,
  );
  const { clearCurrencyCache } =
  await import("../function/getCurrency.js");
  clearCurrencyCache("*");
  }
  changes++;
  }
  if (maxOnline !== undefined && maxOnline !== currentMaxOnline) {
  setMaxOnlineSlots(maxOnline || DEFAULT_VALUES.maxOnline);
  changes++;
  }
  if (
  selectedTimezone !== currentTimezone ||
  enableRealTime !== currentRealTime
  ) {
  GlobalConfig.set("time:timezone", selectedTimezone);
  GlobalConfig.set("time:enabled", enableRealTime);
  updateDB(
  ScoreboardDB,
  "ScoreboardDBConfig-offset-timezone",
  selectedTimezone,
  );
  changes++;
  }
  if (changes > 0) {
  globalCache.delete("title");
  globalCache.delete("lines");
  globalCache.set("lastUpdate", Date.now());
  notifyConfigChange();
  }
  const detailMsg = `§a Settings updated\n§fLogo: ${logoEnabled ? "§aEnabled" : "§cDisabled"}\n§fUse Text Logo: ${useTextLogo ? "§aEnabled" : "§cDisabled"}\n§fText Logo: ${textLogo || DEFAULT_VALUES.textLogo}\n§fTitle: ${title || DEFAULT_VALUES.title}\n§fCurrency: ${currency || DEFAULT_VALUES.currency}\n§fMax Online: ${maxOnline || DEFAULT_VALUES.maxOnline}\n§fReal-Time: ${enableRealTime ? "§aEnabled" : "§cDisabled"}\n§fTimezone: ${selectedTimezone}`;
  handleConfigUpdate(player, changes, detailMsg, applyImmediately);
  } catch (error) {
  console.warn("Error in handleBasicSettings:", error);
  sendErrorMessage(player, "§c Failed to update settings. Please try again");
  }
}
async function handleManageLines(player) {
 Lang.load(player);
 return showLinesHub(player);
}
async function showLinesHub(player) {
 try {
 const currentLines = getScoreboardLines();
 const UI = new ActionFormData()
 .title(t(player, "scb.lines.title"))
 .body(t(player, "scb.lines.body", currentLines.length))
 .button(t(player, "scb.lines.btn.add"), "textures/ui/color_plus")
 .divider()
 .button(t(player, "scb.lines.btn.guide"), "textures/ui/icon_book_writable")
 .divider();
 if (currentLines.length > 0) {
 UI.header(t(player, "scb.lines.preview.header")).divider();
 for (let i = 0; i < currentLines.length; i++) {
 UI.button(previewLine(player, currentLines[i])).divider();
 }
 }
 const result = await ForceOpen(player, UI);
 if (result.canceled) return FuncScbConfig(player);
 if (result.selection === 0) return showLineForm(player, { mode: "add" });
 if (result.selection === 1) return showPlaceholderGuide(player);
 return showLineForm(player, {
 mode: "edit",
 lineIndex: result.selection - 2,
 });
 } catch (error) {
 console.warn("Error in showLinesHub:", error);
 sendErrorMessage(player, t(player, "scb.lines.err.load"));
 }
}
async function showPlaceholderGuide(player) {
 const UI = new ActionFormData()
 .title(t(player, "scb.lines.guide.title"))
 .body(t(player, "scb.lines.guide.intro"))
 .divider();
 for (const section of GUIDE_SECTIONS) {
 UI.header(t(player, `scb.lines.guide.section.${section.id}`)).divider();
 for (const ph of section.ph) {
 UI.label(t(player, `scb.lines.guide.ph.${ph}`)).divider();
 }
 }
 UI.button(t(player, "common.back"), "textures/ui/arrow_left");
 const result = await ForceOpen(player, UI);
 if (result.canceled) return showLinesHub(player);
 return showLinesHub(player);
}
function buildLineFromForm(lineType, useIcon, symbolIndex, content, symbolsList) {
 if (lineType === 1) return "@BLANK";
 if (!content?.trim()) return null;
 const selectedSymbol = symbolsList[symbolIndex].symbol;
 return useIcon ? formatLine(selectedSymbol, content) : content;
}
async function showLineForm(player, { mode, lineIndex }) {
 const isEdit = mode === "edit";
 try {
 const currentLines = getScoreboardLines();
 const symbolsList = getFormattedSymbolsList(symbolCategories);
 const lineTypes = [
 t(player, "scb.lines.type.content"),
 t(player, "scb.lines.type.blank"),
 ];
 let isBlank = false;
 let hasIcon = false;
 let currentSymbol = 0;
 let currentContent = "";
 if (isEdit) {
 const currentLine = currentLines[lineIndex];
 isBlank = currentLine === "@BLANK";
 hasIcon =
 !isBlank &&
 currentLine.includes("§f") &&
 currentLine.includes(" §f");
 currentContent = currentLine;
 if (hasIcon) {
 const symbolMatch = symbolsList.findIndex((s) =>
 currentLine.includes(s.symbol),
 );
 if (symbolMatch !== -1) {
 currentSymbol = symbolMatch;
 currentContent = currentLine.split(" §f")[1];
 }
 }
 }
 const UI = new ModalFormData().title(
 isEdit
 ? t(player, "scb.lines.edit.title", lineIndex + 1)
 : t(player, "scb.lines.add.title"),
 );
 UI.dropdown(t(player, "scb.lines.field.type"), lineTypes, {
 defaultValue: isBlank ? 1 : 0,
 });
 UI.toggle(t(player, "scb.lines.field.use_icon"), {
 defaultValue: isEdit ? hasIcon : true,
 });
 UI.dropdown(
 t(player, "scb.lines.field.symbol"),
 symbolsList.map((item) => `${item.symbol} ${item.name}`),
 { defaultValueIndex: Math.max(0, currentSymbol) },
 );
 UI.textField(
 t(player, "scb.lines.field.content"),
 t(player, "scb.lines.field.content.placeholder"),
 {
 defaultValue: isEdit && !isBlank ? currentContent : undefined,
 placeholder: t(player, "scb.lines.field.content.example"),
 },
 );
 UI.slider(
 isEdit
 ? t(player, "scb.lines.field.move_to")
 : t(player, "scb.lines.field.position"),
 1,
 isEdit ? currentLines.length : Math.max(1, currentLines.length + 1),
 {
 valueStep: 1,
 defaultValue: isEdit ? lineIndex + 1 : currentLines.length + 1,
 },
 );
 if (isEdit) {
 UI.toggle(t(player, "scb.lines.field.delete"), { defaultValue: false });
 }
 UI.toggle(t(player, "scb.lines.field.apply"), { defaultValue: true });
 const result = await ForceOpen(player, UI);
 if (result.canceled) return showLinesHub(player);
 const [
 lineType,
 useIcon,
 symbolIndex,
 content,
 position,
 deleteOrApply,
 applyImmediately,
 ] = result.formValues;
 if (isEdit && deleteOrApply) {
 const newLines = currentLines.filter((_, i) => i !== lineIndex);
 ScoreboardLines.set("lines", newLines);
 notifyConfigChange();
 sendSuccessMessage(player, t(player, "scb.lines.msg.deleted"));
 return showLinesHub(player);
 }
 const newLine = buildLineFromForm(
 lineType,
 useIcon,
 symbolIndex,
 content,
 symbolsList,
 );
 if (!newLine) {
 sendErrorMessage(player, t(player, "scb.lines.err.empty"));
 return showLineForm(player, { mode, lineIndex });
 }
 const newLines = [...currentLines];
 if (isEdit) {
 newLines.splice(lineIndex, 1);
 newLines.splice(position - 1, 0, newLine);
 } else {
 newLines.splice(position - 1, 0, newLine);
 }
 ScoreboardLines.set("lines", newLines);
 const applyNow = isEdit ? applyImmediately : deleteOrApply;
 const successMsg = applyNow
 ? t(player, isEdit ? "scb.lines.msg.updated" : "scb.lines.msg.added")
 : t(
 player,
 isEdit ? "scb.lines.msg.updated_reload" : "scb.lines.msg.added_reload",
 );
 handleConfigUpdate(player, 1, successMsg, applyNow);
 return showLinesHub(player);
 } catch (error) {
 console.warn("Error in showLineForm:", error);
 sendErrorMessage(
 player,
 t(player, isEdit ? "scb.lines.err.edit" : "scb.lines.err.add"),
 );
 return showLinesHub(player);
 }
}
async function handleResetScoreboard(player) {
 const UI = new MessageFormData()
 .title("Reset Scoreboard")
 .body("Reset all scoreboard settings to default?")
 .button1("Reset")
 .button2("Cancel");
 const result = await ForceOpen(player, UI);
 if (result.canceled || result.selection === 1) return;
 ScoreboardDB.clear();
 updateDB(ScoreboardDB, "ScoreboardDBConfig-title", DEFAULT_VALUES.title);
 updateDB(
 ScoreboardDB,
 "ScoreboardDBConfig-currency",
 DEFAULT_VALUES.currency,
 );
 updateDB(
 ScoreboardDB,
 "ScoreboardDBConfig-max-online",
 DEFAULT_VALUES.maxOnline,
 );
 updateDB(
 ScoreboardDB,
 "ScoreboardDBConfig-offset-timezone",
 DEFAULT_VALUES.timezone,
 );
 updateDB(ScoreboardDB, "ScoreboardDBConfig-enabled", true);
 updateDB(
 ScoreboardDB,
 "ScoreboardDBConfig-logo-enabled",
 DEFAULT_VALUES.logoEnabled,
 );
 updateDB(
 ScoreboardDB,
 "ScoreboardDBConfig-use-text-logo",
 DEFAULT_VALUES.useTextLogo,
 );
 updateDB(
 ScoreboardDB,
 "ScoreboardDBConfig-text-logo",
 DEFAULT_VALUES.textLogo,
 );
 ScoreboardLines.set("lines", DEFAULT_LINES);
 globalCache.delete("lines");
 globalCache.delete("title");
 globalCache.set("lastUpdate", Date.now());
 notifyConfigChange();
 sendSuccessMessage(player, "§a Scoreboard has been reset to default");
}
system.runInterval(() => {
 globalCache.cleanup();
 clearSymbolCache();
}, 12000);
async function handleMetricsConfig(player) {
 const UI = new ActionFormData()
 .title("Metrics Configuration")
 .button("Edit Metrics", "textures/ui/hammer_l")
 .button("Reset to Default", "textures/ui/refresh_hover")
 .button("Preview Metrics", "textures/ui/magnifyingGlass");
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 const actions = [handleEditMetrics, handleResetMetrics, handlePreviewMetrics];
 actions[result.selection]?.(player);
}
async function handleEditMetrics(player) {
 const currentMetrics = getCustomMetrics();
 const UI = new ModalFormData().title("Edit Custom Metrics");
 const metricLabels = [
 "Yottabyte (Y)",
 "Zettabyte (Z)",
 "Exabyte (E)",
 "Petabyte (P)",
 "Terabyte (T)",
 "Gigabyte (G)",
 "Megabyte (M)",
 "Kilobyte (k)",
 ];
 for (let i = 0; i < currentMetrics.length; i++) {
 const metric = currentMetrics[i];
 UI.textField(
 `${metricLabels[i]} - Value`,
 `Enter value for ${metric.symbol}`,
 {
 defaultValue: metric.value.toString(),
 placeholder: "e.g., 1000000000000000000000000",
 },
 );
 UI.textField(
 `${metricLabels[i]} - Symbol`,
 `Enter symbol for ${metricLabels[i]}`,
 {
 defaultValue: metric.symbol,
 placeholder: "e.g., Y",
 },
 );
 }
 UI.toggle("Apply Changes Immediately", {
 defaultValue: true,
 });
 try {
 const result = await ForceOpen(player, UI);
 if (result.canceled) return;
 const formValues = result.formValues;
 const newMetrics = [];
 const applyImmediately = formValues[formValues.length - 1];
 for (let i = 0; i < formValues.length - 1; i += 2) {
 const valueStr = formValues[i];
 const symbol = formValues[i + 1];
 if (valueStr && symbol) {
 const value = parseFloat(valueStr);
 if (!isNaN(value) && value > 0) {
 newMetrics.push({ value, symbol: symbol.trim() });
 }
 }
 }
 if (newMetrics.length === 0) {
 sendErrorMessage(player, "§c No valid metrics provided");
 return;
 }
 newMetrics.sort((a, b) => b.value - a.value);
 const success = setCustomMetrics(newMetrics);
 if (success) {
 const successMsg = `§a Custom metrics updated successfully! (${newMetrics.length} metrics configured)`;
 handleConfigUpdate(player, 1, successMsg, applyImmediately);
 } else {
 sendErrorMessage(player, "§c Failed to save custom metrics");
 }
 } catch (error) {
 console.warn("Error in handleEditMetrics:", error);
 sendErrorMessage(player, "§c Failed to update metrics configuration");
 }
}
async function handleResetMetrics(player) {
 const UI = new MessageFormData()
 .title("Reset Metrics")
 .body(
 "Are you sure you want to reset all custom metrics to default values?\n\n§7This will restore:\n§f• Y (1e24)\n§f• Z (1e21)\n§f• E (1e18)\n§f• P (1e15)\n§f• T (1e12)\n§f• G (1e9)\n§f• M (1e6)\n§f• k (1e3)",
 )
 .button1("Reset")
 .button2("Cancel");
 const result = await ForceOpen(player, UI);
 if (result.canceled || result.selection === 1) return;
 const success = resetMetricsToDefault();
 if (success) {
 notifyConfigChange();
 sendSuccessMessage(
 player,
 "§a Custom metrics have been reset to default values",
 );
 } else {
 sendErrorMessage(player, "§c Failed to reset metrics");
 }
}
async function handlePreviewMetrics(player) {
 try {
 const currentMetrics = getCustomMetrics();
 let previewText = "§lCurrent Metrics Configuration:\n\n";
 const testValues = [
 1e25, 5e23, 2.5e20, 7.8e17, 1.2e14, 9.5e11, 3.7e8, 4.2e5, 1500, 250,
 ];
 for (const testValue of testValues) {
 const { metricNumbers } = await import("../lib/game.js");
 const formatted = metricNumbers(testValue);
 previewText += `§f${testValue.toExponential(2)} = §e${formatted}\n`;
 }
 previewText += "\n§7Current Metrics:\n";
 for (const metric of currentMetrics) {
 previewText += `§f${metric.symbol}: §a${metric.value.toExponential(2)}\n`;
 }
 const UI = new MessageFormData()
 .title("Metrics Preview")
 .body(previewText)
 .button1("OK")
 .button2("Edit Metrics");
 const result = await ForceOpen(player, UI);
 if (result.selection === 1) {
 await handleEditMetrics(player);
 }
 } catch (error) {
 console.warn("Error in handlePreviewMetrics:", error);
 sendErrorMessage(player, "§c Failed to load metrics preview");
 }
}
export { FuncBoardConfig };
