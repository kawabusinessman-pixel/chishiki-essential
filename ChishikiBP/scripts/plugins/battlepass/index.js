import { world, ActionFormData } from "../../core.js";
import { isMemberFeatureEnabled } from "../../function/memberFeatureState.js";
import {
  DEFAULT_BATTLEPASS_SETTINGS,
  DEFAULT_BATTLEPASS_REWARDS,
  normalizeBattlepassSettings,
} from "./config.js";
const BATTLEPASS_NAMESPACE = "battlepass";
const REWARDS_PROPERTY = `${BATTLEPASS_NAMESPACE}:rewards`;
const SETTINGS_PROPERTY = `${BATTLEPASS_NAMESPACE}:settings`;
const REWARD_TRACK_PAGE_SIZE = 8;
const BATTLEPASS_UI_MARKER = "§b§p§a§s§s";
const BATTLEPASS_PAGE_MARKERS = Object.freeze({
  main: "§b§p§m§a§i§n",
  rewards: "§b§p§r§e§w",
  quests: "§b§p§q§u§e",
  daily: "§b§p§d§a§i",
  weekly: "§b§p§w§e§e",
  premium: "§b§p§p§r§e",
  detail: "§b§p§d§e§t",
});
world.afterEvents.worldLoad.subscribe(() => {
  try {
    const existingRewards = world.getDynamicProperty(REWARDS_PROPERTY);
    if (!existingRewards || existingRewards === "[]") {
      world.setDynamicProperty(REWARDS_PROPERTY, JSON.stringify(DEFAULT_BATTLEPASS_REWARDS));
    }
    if (!world.getDynamicProperty(SETTINGS_PROPERTY)) {
      world.setDynamicProperty(SETTINGS_PROPERTY, JSON.stringify(DEFAULT_BATTLEPASS_SETTINGS));
    }
  } catch (error) {
    console.warn("[Battlepass] Failed to initialize persistent data:", error);
  }
});
export function getRewards() {
  try {
    const rewards = world.getDynamicProperty(REWARDS_PROPERTY);
    if (typeof rewards !== "string" || rewards.length === 0) {
      return DEFAULT_BATTLEPASS_REWARDS.map((reward) => ({ ...reward }));
    }
    const parsed = JSON.parse(rewards);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_BATTLEPASS_REWARDS.map((reward) => ({ ...reward }));
    }
    return parsed;
  } catch (error) {
    console.warn("[Battlepass] Failed to read rewards:", error);
    return DEFAULT_BATTLEPASS_REWARDS.map((reward) => ({ ...reward }));
  }
}
export function saveRewards(rewards) {
 if (!Array.isArray(rewards)) return false;
 try {
 world.setDynamicProperty(REWARDS_PROPERTY, JSON.stringify(rewards));
 return true;
 } catch (error) {
 console.warn("[Battlepass] Failed to save rewards:", error);
 return false;
 }
}
export function getBattlepassSettings() {
 try {
 const raw = world.getDynamicProperty(SETTINGS_PROPERTY);
 if (typeof raw !== "string" || raw.length === 0) {
 return normalizeBattlepassSettings(DEFAULT_BATTLEPASS_SETTINGS);
 }
 return normalizeBattlepassSettings(JSON.parse(raw));
 } catch (error) {
 console.warn("[Battlepass] Failed to read settings:", error);
 return normalizeBattlepassSettings(DEFAULT_BATTLEPASS_SETTINGS);
 }
}
export function saveBattlepassSettings(settings) {
 try {
 const normalized = normalizeBattlepassSettings(settings);
 world.setDynamicProperty(SETTINGS_PROPERTY, JSON.stringify(normalized));
 return true;
 } catch (error) {
 console.warn("[Battlepass] Failed to save settings:", error);
 return false;
 }
}
function getRewardTrack(reward) {
 return reward?.track === "premium" ? "premium" : "free";
}
function hasPremiumAccess(player, settings) {
 return settings.premiumEnabled && player.hasTag(settings.premiumTag);
}
function addRewardTrackButton(form, reward, player, settings) {
 if (!reward) {
 form.button("§8EMPTY");
 return;
 }
  const track = getRewardTrack(reward);
  const premiumAccess = track !== "premium" || hasPremiumAccess(player, settings);
  const claimed = player.hasTag(reward.tag);
  const reached = player.level >= reward.levelRequired;
  const available = premiumAccess && reached && !claimed;
  const status = claimed
    ? "§aCLAIMED"
    : !premiumAccess
    ? `§cPREMIUM REQUIRED §7- LEVEL ${reward.levelRequired}`
    : available
    ? `§eAVAILABLE - LEVEL ${reward.levelRequired}`
    : `§7LOCKED - LEVEL ${reward.levelRequired}`;
  form.button(
    `${track === "premium" ? "§a" : "§6"}${reward.name}\n§r${status}`,
    premiumAccess ? reward.texture : "textures/ui/lock",
  );
}
async function confirmClaimReward(player, reward, level) {
  const settings = getBattlepassSettings();
  if (getRewardTrack(reward) === "premium") {
    if (!settings.premiumEnabled) {
      player.sendMessage("§cPremium Pass is currently disabled.");
      return false;
    }
    if (!hasPremiumAccess(player, settings)) {
      player.sendMessage("§cPremium Pass access is required to claim this reward.");
      return false;
    }
  }
  const confirmForm = new ActionFormData()
    .title("§6Confirm Reward Claim")
    .body(`§fAre you sure you want to claim: §e${reward.name}§f?`)
    .button("§2Yes, Claim Now", "textures/ui/confirm")
    .button("§4Cancel", "textures/ui/cancel");
  const result = await confirmForm.show(player);
  if (result.canceled || result.selection === 1) return false;
  if (level >= reward.levelRequired && !player.hasTag(reward.tag)) {
    try {
      player.runCommand("gamerule sendcommandfeedback false");
      const isRankReward = reward.isRankReward ||
        (reward.command && reward.command.includes('tag @s add "rank:'));
      if (isRankReward) {
        await handleRankReward(player, reward);
      } else {
        await player.runCommand(reward.command);
      }
      player.runCommand("gamerule sendcommandfeedback true");
      player.runCommand(`tellraw @s {"rawtext":[{"text":"§aSuccess! §r§aYou have claimed §e${reward.name}§a!"}]}`);
      player.addTag(reward.tag);
      player.runCommand(`playsound random.levelup @s`);
      return true;
    } catch (error) {
      player.runCommand("gamerule sendcommandfeedback true");
      player.runCommand(`tellraw @s {"rawtext":[{"text":"§cFailed! §r§cCould not claim §e${reward.name}§c."}]}`);
      console.warn(`Failed to execute reward command: ${error}`);
      return false;
    }
  }
  return false;
}
async function handleRankReward(player, reward) {
  try {
    let rankName = "";
    if (reward.rankName) {
      rankName = reward.rankName;
    } else if (reward.command) {
      const rankMatch = reward.command.match(/tag @s add "rank:(.+?)"/);
      if (rankMatch) {
        rankName = rankMatch[1];
      }
    }
    if (!rankName) {
      throw new Error("Could not determine rank name from reward");
    }
    const existingRankTags = player.getTags().filter(tag => tag.startsWith("rank:"));
    for (const tag of existingRankTags) {
      player.removeTag(tag);
    }
    const newRankTag = `rank:${rankName}`;
    player.addTag(newRankTag);
    player.runCommand(`tellraw @s {"rawtext":[{"text":"§6[RANK] §r§aYour rank has been updated to: §e${rankName}§a!"}]}`);
    console.warn(`[Battlepass] Player ${player.name} received rank: ${rankName}`);
  } catch (error) {
    console.warn(`[Battlepass] Failed to handle rank reward for ${player.name}:`, error);
    throw error;
  }
}
function battlepassTitle(title, page = "detail") {
  return `${BATTLEPASS_UI_MARKER}${BATTLEPASS_PAGE_MARKERS[page] ?? BATTLEPASS_PAGE_MARKERS.detail}${title}`;
}
function createBattlepassForm(title, body, page) {
  const form = new ActionFormData()
    .preserveButtonCase()
    .title(battlepassTitle(title, page));
  if (body !== undefined) form.body(body);
  return form;
}
async function viewRewardDetails(player, reward, level) {
  const settings = getBattlepassSettings();
  const isPremiumReward = getRewardTrack(reward) === "premium";
  const premiumAccess = !isPremiumReward || hasPremiumAccess(player, settings);
  const canClaim = premiumAccess && level >= reward.levelRequired && !player.hasTag(reward.tag);
  const alreadyClaimed = player.hasTag(reward.tag);
  const statusText = alreadyClaimed
    ? "§aClaimed"
    : isPremiumReward && !settings.premiumEnabled
    ? "§cPremium Disabled"
    : !premiumAccess
    ? "§cPremium Required"
    : canClaim
    ? "§eAvailable to Claim"
    : "§cNot Available";
  const detailForm = createBattlepassForm(`§fBATTLE PASS REWARD`, undefined, "detail")
    .body(
      `§eReward Information:§r\n` +
      `§fName: §e${reward.name}§r\n` +
      `§fLevel Required: §e${reward.levelRequired}§r\n` +
      `§fStatus: ${statusText}§r\n` +
      `\n§fYour Current Level: §e${level}§r\n` +
      `${!canClaim && !alreadyClaimed ? `§fLevels Needed: §c${reward.levelRequired - level}§r\n` : ""}`
    );
  const buttonLabel = canClaim
    ? "§2Claim Reward"
    : alreadyClaimed
    ? "§7Already Claimed"
    : isPremiumReward && !settings.premiumEnabled
    ? "§cPremium Disabled"
    : !premiumAccess
    ? "§cPremium Required"
    : "§7Not Enough Level";
  detailForm.button(
    buttonLabel,
    canClaim ? "textures/ui/confirm" : alreadyClaimed ? "textures/ui/check" : "textures/ui/lock",
  );
  detailForm.button("§4Back", "textures/ui/arrow_left");
  const result = await detailForm.show(player);
  if (result.canceled) return "exit";
  if (result.selection === 1) return "rewards";
  if (result.selection === 0 && canClaim) return "claim";
  return "rewards";
}
async function openBattlepassRewards(player, page = 0) {
  const level = player.level;
  const settings = getBattlepassSettings();
  const rewards = getRewards()
    .filter((reward) => Number(reward.levelRequired) <= settings.maxTier)
    .sort((a, b) => a.levelRequired - b.levelRequired);
  const freeRewards = rewards.filter((reward) => getRewardTrack(reward) === "free");
  const premiumRewards = rewards.filter((reward) => getRewardTrack(reward) === "premium");
  const pageCount = Math.max(
    1,
    Math.ceil(freeRewards.length / REWARD_TRACK_PAGE_SIZE),
    Math.ceil(premiumRewards.length / REWARD_TRACK_PAGE_SIZE),
  );
  const safePage = Math.min(Math.max(Number.isInteger(page) ? page : 0, 0), pageCount - 1);
  const pageStart = safePage * REWARD_TRACK_PAGE_SIZE;
  const freePage = freeRewards.slice(pageStart, pageStart + REWARD_TRACK_PAGE_SIZE);
  const premiumPage = premiumRewards.slice(pageStart, pageStart + REWARD_TRACK_PAGE_SIZE);
  const form = createBattlepassForm(
    "§fBATTLE PASS REWARDS",
    `§f${settings.seasonName} §8• §fTier: §e${Math.min(level, settings.maxTier)}§7/§e${settings.maxTier} §8• §fPage: §e${safePage + 1}§7/§e${pageCount}\n${getXpBar(player)}`,
    "rewards",
  );
  for (let slot = 0; slot < REWARD_TRACK_PAGE_SIZE; slot++) {
    addRewardTrackButton(form, freePage[slot], player, settings);
  }
  for (let slot = 0; slot < REWARD_TRACK_PAGE_SIZE; slot++) {
    addRewardTrackButton(form, premiumPage[slot], player, settings);
  }
  form.button("§cBACK", "textures/ui/arrow_left");
  form.button(safePage > 0 ? "§f " : "§8 ", "textures/ui/arrow_left");
  form.button(safePage + 1 < pageCount ? "§f " : "§8 ", "textures/ui/arrow_right");
  const result = await form.show(player);
  if (result.canceled || result.selection === undefined) return { screen: "exit", page: safePage };
  if (result.selection < REWARD_TRACK_PAGE_SIZE) {
    const reward = freePage[result.selection];
    return reward ? { screen: "reward", reward, level, page: safePage } : { screen: "rewards", page: safePage };
  }
  if (result.selection < REWARD_TRACK_PAGE_SIZE * 2) {
    const reward = premiumPage[result.selection - REWARD_TRACK_PAGE_SIZE];
    return reward ? { screen: "reward", reward, level, page: safePage } : { screen: "rewards", page: safePage };
  }
  if (result.selection === 16) return { screen: "main", page: safePage };
  if (result.selection === 17) return { screen: "rewards", page: Math.max(0, safePage - 1) };
  if (result.selection === 18) return { screen: "rewards", page: Math.min(pageCount - 1, safePage + 1) };
  return { screen: "rewards", page: safePage };
}
async function openBattlepassQuestOverview(player) {
  const form = createBattlepassForm("§fBATTLE PASS QUESTS", "§7Quest tracking is being prepared.\n§fChoose a quest category to preview its UI.", "quests");
  form.button("§bDAILY QUESTS", "textures/ui/icon_book_writable");
  form.button("§eWEEKLY QUESTS", "textures/ui/icon_book_writable");
  form.button("§cBACK", "textures/ui/arrow_left");
  const result = await form.show(player);
  if (result.canceled) return "exit";
  if (result.selection === 2) return "main";
  return result.selection === 0 ? "daily" : "weekly";
}
async function openBattlepassDailyQuests(player) {
  const form = createBattlepassForm("§fDAILY QUESTS", "§7Daily quest data has not been configured yet.\n§fThis screen will show daily objectives and reset time once the quest system is added.", "daily");
  form.button("§cBACK", "textures/ui/arrow_left");
  const result = await form.show(player);
  return result.canceled ? "exit" : "quests";
}
async function openBattlepassWeeklyQuests(player) {
  const form = createBattlepassForm("§fWEEKLY QUESTS", "§7Weekly quest data has not been configured yet.\n§fThis screen will show the unlocked week and its objectives once the quest system is added.", "weekly");
  form.button("§cBACK", "textures/ui/arrow_left");
  const result = await form.show(player);
  return result.canceled ? "exit" : "quests";
}
async function openBattlepassPremium(player) {
  const settings = getBattlepassSettings();
  if (!settings.premiumEnabled) {
    player.sendMessage("§cPremium Pass is currently disabled.");
    return "main";
  }
  const ownsPremium = settings.premiumEnabled && player.hasTag(settings.premiumTag);
  const body = ownsPremium
    ? `§aPremium Pass Active\n§7You have Premium access for §f${settings.seasonName}§7.`
    : `§cPremium Pass Locked\n§7Required access has not been granted for §f${settings.seasonName}§7.`;
  const form = createBattlepassForm("§fPREMIUM PASS", body, "premium");
  form.button("§cBACK", "textures/ui/arrow_left");
  const result = await form.show(player);
  return result.canceled ? "exit" : "main";
}
async function openBattlepassMain(player) {
  const level = player.level;
  const settings = getBattlepassSettings();
  const currentTier = Math.min(level, settings.maxTier);
  const premiumStatus = !settings.premiumEnabled
    ? "§7Disabled"
    : player.hasTag(settings.premiumTag)
    ? "§aActive"
    : "§cLocked";
  const form = createBattlepassForm(
    "§fBATTLE PASS",
    `§f${settings.seasonName}\n§7${settings.seasonDescription}\n§fYour Tier: §e${currentTier}§7/§e${settings.maxTier} §8• §fPremium: ${premiumStatus}\n${getXpBar(player)}`,
    "main",
  );
  form.button("§6YOUR PASS", "textures/ui/icon_book_writable");
  form.button("§bQUESTS", "textures/ui/icon_book_writable");
  form.button("§aPREMIUM", "textures/ui/icon_book_writable");
  form.button("§eREWARDS", "textures/ui/icon_book_writable");
  const result = await form.show(player);
  if (result.canceled) return "exit";
  if (result.selection === 2 && !settings.premiumEnabled) {
    player.sendMessage("§cPremium Pass is currently disabled.");
    return "main";
  }
  return ["rewards", "quests", "premium", "rewards"][result.selection] ?? "exit";
}
export async function openBattlepass(player) {
 if (!isMemberFeatureEnabled("battlepass")) {
 player.sendMessage("§cBattlepass is currently disabled in Member Feature Toggle.");
 return;
 }
 let screen = "main";
 let rewardPage = 0;
 while (screen !== "exit") {
 if (screen === "main") {
 screen = await openBattlepassMain(player);
 } else if (screen === "rewards") {
 const result = await openBattlepassRewards(player, rewardPage);
 rewardPage = result.page ?? rewardPage;
 if (result.screen === "reward") {
 const next = await viewRewardDetails(player, result.reward, result.level);
 if (next === "exit") {
 screen = "exit";
 continue;
 }
 if (next === "claim") {
 await confirmClaimReward(player, result.reward, result.level);
 }
 screen = "rewards";
 } else {
 screen = result.screen;
 }
 } else if (screen === "quests") {
 screen = await openBattlepassQuestOverview(player);
 } else if (screen === "daily") {
 screen = await openBattlepassDailyQuests(player);
 } else if (screen === "weekly") {
 screen = await openBattlepassWeeklyQuests(player);
 } else if (screen === "premium") {
 screen = await openBattlepassPremium(player);
 }
 }
}
function getXpBar(player) {
 const barLength = 20;
 const currentXP = player.xpEarnedAtCurrentLevel;
 const neededXP = player.totalXpNeededForNextLevel;
 const progress = neededXP > 0 ? currentXP / neededXP : 0;
 const filled = Math.floor(barLength * progress);
 const empty = barLength - filled;
 const percentage = Math.floor(progress * 100);
 return `§a[§2${'■'.repeat(filled)}§7${'□'.repeat(empty)}§a] (${percentage}%)`;
}
