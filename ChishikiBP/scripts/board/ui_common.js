import { notifyConfigChange } from "./_config.js";
const SOUNDS = {
 SUCCESS: "random.levelup",
 ERROR: "note.bass",
};
const MESSAGES = {
 NO_CHANGES: "§e No changes were made",
 APPLY_RELOAD: "Changes will take effect after reload",
 FAILED_GENERIC: "§c Failed to update. Please try again",
};
const UI_TEXTURES = {
 CREATIVE: "textures/ui/creative_icon",
 RANK: "textures/ui/icon_best3",
 MULTIPLAYER: "textures/ui/icon_multiplayer",
 CRAFTING: "textures/ui/icon_crafting",
 SETTING: "textures/ui/icon_setting",
 MAP: "textures/ui/icon_map",
 ARMOR: "textures/ui/icon_armor",
 REFRESH: "textures/ui/refresh_hover",
 TOGGLE_ON: "textures/ui/toggle_on",
 TOGGLE_OFF: "textures/ui/toggle_off",
 AUTOMATION: "textures/ui/automation_glyph_color",
 BACKUP: "textures/ui/backup_replace",
};
const playSuccessSound = (player) => player.playSound(SOUNDS.SUCCESS);
const playErrorSound = (player) => player.playSound(SOUNDS.ERROR);
const sendSuccessMessage = (player, message) => {
 player.sendMessage(message);
 playSuccessSound(player);
};
const sendErrorMessage = (player, message = MESSAGES.FAILED_GENERIC) => {
 player.sendMessage(message);
 playErrorSound(player);
};
const sendNoChangesMessage = (player) => {
 player.sendMessage(MESSAGES.NO_CHANGES);
 playErrorSound(player);
};
const handleConfigUpdate = (
 player,
 changes,
 successMsg,
 applyImmediately = false,
) => {
 if (changes > 0) {
 if (applyImmediately) {
 notifyConfigChange();
 sendSuccessMessage(player, successMsg);
 } else {
 sendSuccessMessage(
 player,
 `${successMsg.replace("updated", "saved")}! ${MESSAGES.APPLY_RELOAD}`,
 );
 }
 } else {
 sendNoChangesMessage(player);
 }
};
const PLACEHOLDER_INFO = [
 "Available Placeholders:",
 "──────────────────",
 "@BLANK - Empty line",
 "@NAME - Player name",
 "@CURRENCY - Currency symbol",
 "@MONEY - Money amount",
 "@BANK - Bank balance",
 "@COIN - Coin count",
 "@RANK - Player rank",
 "@CLAN - Player clan",
 "@GENDER - Player gender",
 "@HEALTH - Player health",
 "@LEVEL - Player level",
 "@XP - Total experience",
 "@KILL - Kill count",
 "@DEATH - Death count",
 "@PING - Player ping (ms)",
 "@ONLINE - Players online",
 "@MAXON - Max players",
 "@HOMES - Home count",
 "@MAXHOMES - Max homes",
 "@HOMESMAX - Homes count/limit",
 "@LANDS - Land claim count",
 "@MAXLANDS - Max lands",
 "@LANDSMAX - Lands count/limit",
 "@HOUR - Current hour",
 "@MINUTE - Current minute",
 "@DAY - Current day",
 "@MONTH - Current month",
 "@YEAR - Current year",
 "@DIMENSION - Player dimension",
 "@X - Player X position",
 "@Y - Player Y position",
 "@Z - Player Z position",
 "@TPS - Current server TPS",
 "",
 "Format Examples:",
 "@BLANK",
 "§3──── ୨୧ ────§r",
 "§f@NAME",
 "§b─── ⋆⋅☆⋅⋆ ───§r",
 "§f» §f@NAME",
 "@BLANK",
 "§f» §fRank: §d@RANK",
 "§f» §fClan: §b@CLAN",
 "§f» §fMoney: §e@CURRENCY@MONEY",
 "§f» §fBank: §a@CURRENCY@BANK",
 "§f» §fCoin: §6@COIN",
 "§f» §fTime: @HOUR:@MINUTE",
 "§f» §fTPS: §a@TPS",
 "§b─── ⋆⋅☆⋅⋆ ───§r",
 "@BLANK",
 "Decorative Examples:",
 "──────────────────",
 "§3──── ୨୧ ────§r",
 "§b─── ⋆⋅☆⋅⋆ ───§r",
 "§e━━━━━━━━━━━━§r",
 "§7▰▰▰▰▰▰▰▰▰▰▰▰§r",
].join("\n");
export {
 SOUNDS,
 MESSAGES,
 UI_TEXTURES,
 PLACEHOLDER_INFO,
 playSuccessSound,
 playErrorSound,
 sendSuccessMessage,
 sendErrorMessage,
 sendNoChangesMessage,
 handleConfigUpdate,
};
