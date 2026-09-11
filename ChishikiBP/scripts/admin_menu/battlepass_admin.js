import { ActionFormData, ModalFormData, world } from "../core.js";
import {
  getBattlepassSettings,
  getRewards,
  saveBattlepassSettings,
  saveRewards,
} from "../plugins/battlepass/index.js";
import {
  DEFAULT_BATTLEPASS_SETTINGS,
  DEFAULT_BATTLEPASS_REWARDS,
  isValidBattlepassTag,
  normalizeBattlepassSettings,
} from "../plugins/battlepass/config.js";

const PAGE_SIZE = 10;
const activeAdminPlayers = new Set();

function getSortedRewards() {
  return getRewards()
    .slice()
    .sort((a, b) => (Number(a.levelRequired) || 0) - (Number(b.levelRequired) || 0));
}

async function addRewardUI(player) {
  try {
    const form = new ModalFormData()
      .title("Add Battlepass Reward")
      .dropdown(
        "§eReward Type\n§6Select the type of reward",
        ["Item/Command Reward", "Rank Reward"],
        { defaultValueIndex: 0 },
      )
      .dropdown(
        "§eReward Track\n§6Choose where this reward appears",
        ["Free Track", "Premium Track"],
        { defaultValueIndex: 0 },
      )
      .textField(
        "§eReward Name\n§6Display name in Battlepass UI",
        "Example: Iron Sword / VIP Rank",
        { defaultValue: "", placeholder: "Enter reward name" },
      )
      .textField(
        "§eLevel Required\n§6Level needed to claim reward",
        "Example: 10",
        { defaultValue: "", placeholder: "Enter level number" },
      )
      .textField(
        "§eTexture Path (Optional)\n§6Icon path - leave empty for default",
        "Example: textures/items/iron_sword",
        { defaultValue: "", placeholder: "Leave empty for default icon" },
      )
      .textField(
        "§eCommand/Rank\n§6For items: give command | For ranks: rank name",
        "Example: give @s iron_sword 1 OR vip",
        { defaultValue: "", placeholder: "Enter command or rank name" },
      )
      .textField(
        "§eTag Name\n§6Unique tag for tracking claims",
        "Example: claimedIronSword",
        { defaultValue: "", placeholder: "Enter tag name" },
      );

    const result = await form.show(player);
    if (result.canceled) return;
    if (!result.formValues || result.formValues.length !== 7) {
      player.sendMessage("§c✘ §7Form error - invalid data received!");
      return;
    }

    const [rewardType, rewardTrack, name, levelRequired, texture, commandOrRank, tag] =
      result.formValues;

    if (
      name === null ||
      name === undefined ||
      name.toString().trim() === "" ||
      levelRequired === null ||
      levelRequired === undefined ||
      levelRequired.toString().trim() === "" ||
      commandOrRank === null ||
      commandOrRank === undefined ||
      commandOrRank.toString().trim() === "" ||
      tag === null ||
      tag === undefined ||
      tag.toString().trim() === ""
    ) {
      player.sendMessage("§c✘ §7Required fields must be filled! (Name, Level, Command/Rank, Tag)");
      return;
    }

    const levelText = levelRequired.toString().trim();
    const level = Number(levelText);
    const maxTier = getBattlepassSettings().maxTier;
    if (!/^\d+$/.test(levelText) || level < 1 || level > maxTier) {
      player.sendMessage(`§c✘ §7Level must be a whole number between 1-${maxTier}!`);
      return;
    }

    const cleanTag = tag.toString().trim();
    if (!isValidBattlepassTag(cleanTag)) {
      player.sendMessage("§cReward Tag may only contain letters, numbers, colon, underscore, and hyphen.");
      return;
    }

    const rewards = getRewards();
    for (const r of rewards) {
      if (r.tag === cleanTag) {
        player.sendMessage("§c✘ §7Tag already used by another reward!");
        return;
      }
    }

    let command;
    let isRankReward = false;
    try {
      if (rewardType === 0) {
        command = commandOrRank.toString().trim();
      } else {
        isRankReward = true;
        const rankName = commandOrRank.toString().trim();
        if (rankName.includes('"') || rankName.includes("'")) {
          player.sendMessage("§c✘ §7Rank name cannot contain quotes!");
          return;
        }
        command = `tag @s add "rank:${rankName}"`;
      }
    } catch (error) {
      player.sendMessage("§c✘ §7Error processing command/rank data!");
      return;
    }

    const finalTexture =
      texture === null ||
      texture === undefined ||
      texture.toString().trim() === ""
        ? isRankReward
          ? "textures/ui/icon_setting"
          : "textures/items/paper"
        : texture.toString().trim();

    const rewardData = {
      name: name.toString().trim(),
      levelRequired: level,
      texture: finalTexture,
      command,
      tag: cleanTag,
      track: rewardTrack === 1 ? "premium" : "free",
      isRankReward: isRankReward,
      rankName: isRankReward ? commandOrRank.toString().trim() : null,
    };

    rewards.push(rewardData);
    if (!saveRewards(rewards)) {
      player.sendMessage("§cFailed to save the new Battlepass reward.");
      return;
    }

    const rewardTypeText = isRankReward ? "rank" : "item";
    const safeName = name.toString().trim();
    player.sendMessage(`§a✔ §7${rewardTypeText} reward "${safeName}" added!`);
    try { player.runCommand(`playsound random.levelup @s`); } catch (_) {}
  } catch (error) {
    player.sendMessage("§c✘ §7Unexpected error occurred!");
  }
}

async function editRewardUI(player, page = 0) {
  try {
    const sortedRewards = getSortedRewards();
    if (sortedRewards.length === 0) {
      player.sendMessage("§cFailed: §r§cNo rewards to edit!");
      return;
    }

    const totalPages = Math.ceil(sortedRewards.length / PAGE_SIZE);
    const pagedRewards = sortedRewards.slice(
      page * PAGE_SIZE,
      (page + 1) * PAGE_SIZE,
    );

    const selectForm = new ActionFormData().simpleUi()
      .title(`Edit Reward (Page ${page + 1}/${totalPages})`)
      .body("§fSelect a reward to edit:");

    for (const reward of pagedRewards) {
      selectForm.button(
        `§f${reward.name}\n§r§7(Level ${reward.levelRequired})`,
        reward.texture,
      );
    }

    if (totalPages > 1) {
      if (page > 0)
        selectForm.button("§ePrevious Page", "textures/ui/arrow_left");
      if (page < totalPages - 1)
        selectForm.button("§eNext Page", "textures/ui/arrow_right");
    }

    const selection = await selectForm.show(player);
    if (selection.canceled || selection.selection === undefined) return;

    if (totalPages > 1) {
      const lastBtnIdx = pagedRewards.length;
      if (page > 0 && selection.selection === lastBtnIdx) {
        await editRewardUI(player, page - 1);
        return;
      }
      if (
        page < totalPages - 1 &&
        selection.selection === lastBtnIdx + (page > 0 ? 1 : 0)
      ) {
        await editRewardUI(player, page + 1);
        return;
      }
    }

    const selectedReward = pagedRewards[selection.selection];
    const rewards = getRewards();
    let originalIndex = -1;
    for (let i = 0; i < rewards.length; i++) {
      if (rewards[i].tag === selectedReward.tag) {
        originalIndex = i;
        break;
      }
    }

    if (originalIndex === -1) {
      player.sendMessage("§cFailed: §r§cReward not found!");
      return;
    }

    const isCurrentlyRankReward =
      selectedReward.isRankReward ||
      (selectedReward.command &&
        selectedReward.command.includes('tag @s add "rank:'));

    let currentRankName = "";
    if (isCurrentlyRankReward && selectedReward.rankName) {
      currentRankName = selectedReward.rankName;
    } else if (isCurrentlyRankReward && selectedReward.command) {
      const rankMatch = selectedReward.command.match(/tag @s add "rank:(.+?)"/);
      if (rankMatch) {
        currentRankName = rankMatch[1];
      }
    }

    const editForm = new ModalFormData()
      .title("Edit Battlepass Reward")
      .dropdown(
        "§eReward Type\n§8Select the type of reward",
        ["Item/Command Reward", "Rank Reward"],
        { defaultValueIndex: isCurrentlyRankReward ? 1 : 0 },
      )
      .dropdown(
        "§eReward Track\n§8Choose where this reward appears",
        ["Free Track", "Premium Track"],
        { defaultValueIndex: selectedReward.track === "premium" ? 1 : 0 },
      )
      .textField(
        "§eReward Name\n§8Enter a new name for this reward",
        "Example: Iron Sword / VIP Rank",
        { defaultValue: selectedReward.name, placeholder: "Enter reward name" },
      )
      .textField(
        "§eLevel Required\n§8Level needed to claim reward",
        "Example: 10",
        {
          defaultValue: selectedReward.levelRequired.toString(),
          placeholder: "Enter level number",
        },
      )
      .textField(
        "§eTexture Path (Optional)\n§8Icon path for the reward - leave empty for default",
        "Example: textures/items/iron_sword",
        {
          defaultValue: selectedReward.texture,
          placeholder: "Leave empty for default icon",
        },
      )
      .textField(
        "§eCommand/Rank\n§8For items: give command | For ranks: rank name",
        "Example: give @s iron_sword 1 OR vip",
        {
          defaultValue: isCurrentlyRankReward
            ? currentRankName
            : selectedReward.command,
          placeholder: "Enter command or rank name",
        },
      )
      .textField(
        "§eTag Name\n§8Unique tag for tracking claims",
        "Example: claimedIronSword",
        { defaultValue: selectedReward.tag, placeholder: "Enter tag name" },
      );

    const result = await editForm.show(player);
    if (result.canceled) return;
    if (!result.formValues || result.formValues.length !== 7) {
      player.sendMessage("§cFailed: §r§cForm error - invalid data received!");
      return;
    }

    const [rewardType, rewardTrack, name, levelRequired, texture, commandOrRank, tag] =
      result.formValues;

    if (
      name === null ||
      name === undefined ||
      name.toString().trim() === "" ||
      levelRequired === null ||
      levelRequired === undefined ||
      levelRequired.toString().trim() === "" ||
      commandOrRank === null ||
      commandOrRank === undefined ||
      commandOrRank.toString().trim() === "" ||
      tag === null ||
      tag === undefined ||
      tag.toString().trim() === ""
    ) {
      player.sendMessage("§cFailed: §r§cRequired fields must be filled! (Name, Level, Command/Rank, Tag)");
      return;
    }

    const levelText = levelRequired.toString().trim();
    const level = Number(levelText);
    const maxTier = getBattlepassSettings().maxTier;
    if (!/^\d+$/.test(levelText) || level < 1 || level > maxTier) {
      player.sendMessage(`§cFailed: §r§cLevel must be a whole number between 1-${maxTier}!`);
      return;
    }

    const cleanTag = tag.toString().trim();
    if (!isValidBattlepassTag(cleanTag)) {
      player.sendMessage("§cReward Tag may only contain letters, numbers, colon, underscore, and hyphen.");
      return;
    }

    if (cleanTag !== selectedReward.tag) {
      for (const r of rewards) {
        if (r.tag === cleanTag) {
          player.sendMessage("§cFailed: §r§cTag already used by another reward!");
          return;
        }
      }
    }

    let command;
    let isRankReward = false;
    try {
      if (rewardType === 0) {
        command = commandOrRank.toString().trim();
      } else {
        isRankReward = true;
        const rankName = commandOrRank.toString().trim();
        if (rankName.includes('"') || rankName.includes("'")) {
          player.sendMessage("§cFailed: §r§cRank name cannot contain quotes!");
          return;
        }
        command = `tag @s add "rank:${rankName}"`;
      }
    } catch (error) {
      player.sendMessage("§cFailed: §r§cError processing command/rank data!");
      return;
    }

    const finalTexture =
      texture === null ||
      texture === undefined ||
      texture.toString().trim() === ""
        ? isRankReward
          ? "textures/ui/icon_setting"
          : "textures/items/paper"
        : texture.toString().trim();

    const rewardData = {
      name: name.toString().trim(),
      levelRequired: level,
      texture: finalTexture,
      command,
      tag: cleanTag,
      track: rewardTrack === 1 ? "premium" : "free",
      isRankReward: isRankReward,
      rankName: isRankReward ? commandOrRank.toString().trim() : null,
    };

    rewards[originalIndex] = rewardData;
    if (!saveRewards(rewards)) {
      player.sendMessage("§cFailed to save the edited Battlepass reward.");
      return;
    }

    const rewardTypeText = isRankReward ? "rank" : "item";
    const safeName = name.toString().trim();
    player.sendMessage(`§aSuccess! §r§a${rewardTypeText} reward "${safeName}" edited!`);
    try { player.runCommand(`playsound random.levelup @s`); } catch (_) {}
  } catch (error) {
    player.sendMessage("§cFailed: §r§cUnexpected error occurred!");
    console.warn(`[Battlepass Error] Edit reward failed:`, error);
  }
}

async function deleteRewardUI(player, page = 0) {
  const sortedRewards = getSortedRewards();
  if (sortedRewards.length === 0) {
    player.sendMessage("§cFailed: §r§cNo rewards to delete!");
    return;
  }

  const totalPages = Math.ceil(sortedRewards.length / PAGE_SIZE);
  const pagedRewards = sortedRewards.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  const selectForm = new ActionFormData().simpleUi()
    .title(`Delete Reward (Page ${page + 1}/${totalPages})`)
    .body("§fSelect a reward to delete:");

  for (const reward of pagedRewards) {
    selectForm.button(
      `§f${reward.name}\n§r§7(Level ${reward.levelRequired})`,
      reward.texture,
    );
  }

  if (totalPages > 1) {
    if (page > 0)
      selectForm.button("§ePrevious Page", "textures/ui/arrow_left");
    if (page < totalPages - 1)
      selectForm.button("§eNext Page", "textures/ui/arrow_right");
  }

  const selection = await selectForm.show(player);
  if (selection.canceled || selection.selection === undefined) return;

  if (totalPages > 1) {
    const lastBtnIdx = pagedRewards.length;
    if (page > 0 && selection.selection === lastBtnIdx) {
      await deleteRewardUI(player, page - 1);
      return;
    }
    if (
      page < totalPages - 1 &&
      selection.selection === lastBtnIdx + (page > 0 ? 1 : 0)
    ) {
      await deleteRewardUI(player, page + 1);
      return;
    }
  }

  const selectedReward = pagedRewards[selection.selection];
  const rewards = getRewards();
  let originalIndex = -1;
  for (let i = 0; i < rewards.length; i++) {
    if (rewards[i].tag === selectedReward.tag) {
      originalIndex = i;
      break;
    }
  }

  if (originalIndex === -1) {
    player.sendMessage("§cFailed: §r§cReward not found!");
    return;
  }

  const confirmForm = new ActionFormData().simpleUi()
    .title("Confirm Deletion")
    .body(`§fAre you sure you want to delete: §e${selectedReward.name}§f?`)
    .button("§2Yes, Delete", "textures/ui/confirm")
    .button("§4Cancel", "textures/ui/cancel");

  const confirmResult = await confirmForm.show(player);
  if (confirmResult.canceled || confirmResult.selection === 1) return;

  rewards.splice(originalIndex, 1);
  if (!saveRewards(rewards)) {
    player.sendMessage("§cFailed to delete the Battlepass reward.");
    return;
  }

  player.sendMessage(`§aSuccess! §r§aReward "${selectedReward.name}" deleted!`);
  try { player.runCommand(`playsound random.levelup @s`); } catch (_) {}
}

async function viewRewardClaimedByPlayers(
  player,
  rewardPage = 0,
  playerPage = 0,
  cachedPlayers = null,
  selectedRewardCache = null,
) {
  const sortedRewards = getSortedRewards();
  if (sortedRewards.length === 0) {
    player.sendMessage("§cFailed: §r§cNo rewards to view!");
    return;
  }

  const totalRewardPages = Math.ceil(sortedRewards.length / PAGE_SIZE);
  const pagedRewards = sortedRewards.slice(
    rewardPage * PAGE_SIZE,
    (rewardPage + 1) * PAGE_SIZE,
  );

  if (!selectedRewardCache) {
    const selectForm = new ActionFormData().simpleUi()
      .title(
        `View Players Who Claimed (Page ${rewardPage + 1}/${totalRewardPages})`,
      )
      .body("§fSelect a reward to see who claimed it:");

    for (const reward of pagedRewards) {
      selectForm.button(
        `§f${reward.name}\n§r§7(Level ${reward.levelRequired})`,
        reward.texture,
      );
    }

    if (totalRewardPages > 1) {
      if (rewardPage > 0)
        selectForm.button("§ePrevious Page", "textures/ui/arrow_left");
      if (rewardPage < totalRewardPages - 1)
        selectForm.button("§eNext Page", "textures/ui/arrow_right");
    }

    const selection = await selectForm.show(player);
    if (selection.canceled || selection.selection === undefined) return;

    if (totalRewardPages > 1) {
      const lastBtnIdx = pagedRewards.length;
      if (rewardPage > 0 && selection.selection === lastBtnIdx) {
        await viewRewardClaimedByPlayers(player, rewardPage - 1, 0, null, null);
        return;
      }
      if (
        rewardPage < totalRewardPages - 1 &&
        selection.selection === lastBtnIdx + (rewardPage > 0 ? 1 : 0)
      ) {
        await viewRewardClaimedByPlayers(player, rewardPage + 1, 0, null, null);
        return;
      }
    }

    const selectedReward = pagedRewards[selection.selection];
    const allPlayers = Array.from(world.getPlayers());
    const playersWithTag = allPlayers
      .filter((p) => p.hasTag(selectedReward.tag))
      .map((p) => p.name);

    await viewRewardClaimedByPlayers(
      player,
      rewardPage,
      0,
      playersWithTag,
      selectedReward,
    );
    return;
  }

  const playersWithTag = cachedPlayers || [];
  const PAGE_PLAYER = 20;
  const totalPlayerPages = Math.ceil(playersWithTag.length / PAGE_PLAYER) || 1;
  const pagedPlayers = playersWithTag.slice(
    playerPage * PAGE_PLAYER,
    (playerPage + 1) * PAGE_PLAYER,
  );

  const playersForm = new ActionFormData().simpleUi()
    .title(
      `Players Claimed ${String(selectedRewardCache.name).replace(/§[0-9a-fk-or]/gi, "")} (Page ${playerPage + 1}/${totalPlayerPages})`,
    )
    .body(
      pagedPlayers.length > 0
        ? `§fPlayers who claimed this reward:\n§e${pagedPlayers.join("\n§e")}`
        : "§fNo players have claimed this reward yet.",
    )
    .button("§2Back to Rewards", "textures/ui/arrow_left");

  if (totalPlayerPages > 1) {
    if (playerPage > 0)
      playersForm.button("§ePrevious Page", "textures/ui/arrow_left");
    if (playerPage < totalPlayerPages - 1)
      playersForm.button("§eNext Page", "textures/ui/arrow_right");
  }

  const selection = await playersForm.show(player);
  if (selection.canceled || selection.selection === undefined) return;

  let idx = 1;
  if (totalPlayerPages > 1) {
    if (playerPage > 0 && selection.selection === idx) {
      await viewRewardClaimedByPlayers(
        player,
        rewardPage,
        playerPage - 1,
        playersWithTag,
        selectedRewardCache,
      );
      return;
    }
    idx++;
    if (playerPage < totalPlayerPages - 1 && selection.selection === idx) {
      await viewRewardClaimedByPlayers(
        player,
        rewardPage,
        playerPage + 1,
        playersWithTag,
        selectedRewardCache,
      );
      return;
    }
  }

  await viewRewardClaimedByPlayers(player, rewardPage, 0, null, null);
}

async function resetBattlepassUI(player) {
  const resetForm = new ActionFormData().simpleUi()
    .title("Reset Battlepass")
    .body("§fSelect a reset option:")
    .button(
      "Reset Player Claims\n§r§7Clear claim tags for online players",
      "textures/ui/refresh",
    )
    .button(
      "Restore Default Rewards\n§r§7Restore 16 default rewards",
      "textures/ui/refresh",
    )
    .button(
      "Full Battlepass Reset\n§r§7Reset season, settings & rewards",
      "textures/ui/trash_default",
    )
    .button("Back to Admin Menu", "textures/ui/arrow_left");

  const selection = await resetForm.show(player);
  if (selection.canceled || selection.selection === undefined || selection.selection === 3) return;

  if (selection.selection === 0) {
    const confirmForm = new ActionFormData().simpleUi()
      .title("Confirm Claims Reset")
      .body("§fAre you sure you want to clear all Battlepass reward claim tags for currently online players?\n\n§7This allows online players to claim rewards again.")
      .button("§2Yes, Clear Claims", "textures/ui/confirm")
      .button("§4Cancel", "textures/ui/cancel");
    const confirmResult = await confirmForm.show(player);
    if (confirmResult.canceled || confirmResult.selection === 1) return;

    const rewards = getRewards();
    const onlinePlayers = Array.from(world.getPlayers());
    let clearedCount = 0;
    for (const p of onlinePlayers) {
      for (const r of rewards) {
        if (p.hasTag(r.tag)) {
          p.removeTag(r.tag);
          clearedCount++;
        }
      }
    }
    player.sendMessage(`§aSuccess! Cleared ${clearedCount} claim tag(s) across ${onlinePlayers.length} online player(s).`);
    try { player.runCommand("playsound random.levelup @s"); } catch (_) {}
  } else if (selection.selection === 1) {
    const confirmForm = new ActionFormData().simpleUi()
      .title("Confirm Restore Rewards")
      .body("§fAre you sure you want to restore default Battlepass rewards (16 rewards)?\n\n§cWarning: Any custom rewards will be replaced.")
      .button("§2Yes, Restore Defaults", "textures/ui/confirm")
      .button("§4Cancel", "textures/ui/cancel");
    const confirmResult = await confirmForm.show(player);
    if (confirmResult.canceled || confirmResult.selection === 1) return;

    const defaultList = DEFAULT_BATTLEPASS_REWARDS.map((r) => ({ ...r }));
    const saved = saveRewards(defaultList);
    if (!saved) {
      player.sendMessage("§cFailed to restore default Battlepass rewards.");
      return;
    }
    player.sendMessage("§aSuccess! Restored default Battlepass rewards (8 Free + 8 Premium).");
    try { player.runCommand("playsound random.levelup @s"); } catch (_) {}
  } else if (selection.selection === 2) {
    const confirmForm = new ActionFormData().simpleUi()
      .title("Confirm Full Reset")
      .body("§fAre you sure you want to perform a FULL Battlepass reset?\n\n§cThis will:\n§71. Reset settings to Season 1 defaults (Premium disabled)\n§72. Restore 16 default rewards\n§73. Clear claim tags from online players")
      .button("§2Yes, Full Reset", "textures/ui/confirm")
      .button("§4Cancel", "textures/ui/cancel");
    const confirmResult = await confirmForm.show(player);
    if (confirmResult.canceled || confirmResult.selection === 1) return;

    saveBattlepassSettings(DEFAULT_BATTLEPASS_SETTINGS);
    const defaultList = DEFAULT_BATTLEPASS_REWARDS.map((r) => ({ ...r }));
    saveRewards(defaultList);

    const onlinePlayers = Array.from(world.getPlayers());
    for (const p of onlinePlayers) {
      for (const r of defaultList) {
        if (p.hasTag(r.tag)) p.removeTag(r.tag);
      }
    }
    player.sendMessage("§aSuccess! Battlepass has been fully reset to default.");
    try { player.runCommand("playsound random.levelup @s"); } catch (_) {}
  }
}

async function showBattlepassSettings(player) {
  const current = getBattlepassSettings();
  const form = new ModalFormData()
    .title("BATTLEPASS SETTINGS")
    .textField(
      "Season Name\nShown in the player Battle Pass menu",
      "Example: Season 1",
      { defaultValue: current.seasonName },
    )
    .textField(
      "Season Description\nShort plain-text description",
      "Example: Complete rewards and increase your tier.",
      { defaultValue: current.seasonDescription },
    )
    .textField(
      "Maximum Tier\nRewards above this tier will be hidden",
      "1-1000",
      { defaultValue: current.maxTier.toString() },
    )
    .toggle(
      "Enable Premium Pass\nPlayers need the configured tag for Premium access",
      { defaultValue: current.premiumEnabled },
    )
    .textField(
      "Premium Player Tag\nAllowed: letters, numbers, colon, underscore, hyphen",
      "battlepass:premium",
      { defaultValue: current.premiumTag },
    );

  const result = await form.show(player);
  if (result.canceled) return;
  if (!result.formValues || result.formValues.length !== 5) {
    player.sendMessage("§cBattlepass settings form returned invalid data.");
    return;
  }

  const [seasonNameValue, descriptionValue, maxTierValue, premiumEnabled, premiumTagValue] =
    result.formValues;

  const seasonName = String(seasonNameValue ?? "").trim();
  const seasonDescription = String(descriptionValue ?? "").trim();
  const maxTierText = String(maxTierValue ?? "").trim();
  const premiumTag = String(premiumTagValue ?? "").trim();

  if (!seasonName || seasonName.length > 40) {
    player.sendMessage("§cSeason Name must contain 1-40 characters.");
    return;
  }

  if (!seasonDescription || seasonDescription.length > 120) {
    player.sendMessage("§cSeason Description must contain 1-120 characters.");
    return;
  }

  if (!/^\d+$/.test(maxTierText)) {
    player.sendMessage("§cMaximum Tier must be a whole number between 1 and 1000.");
    return;
  }

  const maxTier = Number(maxTierText);
  if (maxTier < 1 || maxTier > 1000) {
    player.sendMessage("§cMaximum Tier must be between 1 and 1000.");
    return;
  }

  if (!isValidBattlepassTag(premiumTag)) {
    player.sendMessage("§cPremium Player Tag contains invalid characters or is longer than 64 characters.");
    return;
  }

  const next = normalizeBattlepassSettings({
    seasonName,
    seasonDescription,
    maxTier,
    premiumEnabled: premiumEnabled === true,
    premiumTag,
  });

  if (!saveBattlepassSettings(next)) {
    player.sendMessage("§cFailed to save Battlepass settings.");
    return;
  }

  const hiddenRewards = getRewards().filter(
    (reward) => Number(reward.levelRequired) > next.maxTier,
  ).length;

  player.sendMessage("§aBattlepass settings saved.");
  if (hiddenRewards > 0) {
    player.sendMessage(
      `§e${hiddenRewards} reward(s) above tier ${next.maxTier} are now hidden from players.`,
    );
  }
  try { player.runCommand("playsound random.levelup @s"); } catch (_) {}
}

async function showCustomItemHelp(player) {
  const helpForm = new ActionFormData().simpleUi()
    .title("Battlepass Reward Help")
    .body(
      "§fHow to add rewards to Battlepass:\n\n" +
      "§e1. Item/Command Rewards:§r\n" +
      " §7give @s custom:item_name amount§r\n" +
      " §7give @s diamond_sword 1§r\n" +
      " §7effect @s strength 300 1§r\n\n" +
      "§e2. Rank Rewards:§r\n" +
      " §7Select 'Rank Reward' type§r\n" +
      " §7Enter rank name: §fvip§r\n" +
      ' §7System will create: §ftag @s add "rank:vip"§r\n\n' +
      "§e3. Rank Examples:§r\n" +
      " §7vip §f→ §7rank:vip§r\n" +
      " §7premium §f→ §7rank:premium§r\n" +
      " §7diamond §f→ §7rank:diamond§r\n\n" +
      "§e4. Texture Paths (Optional):§r\n" +
      " §7Items: textures/items/item_name§r\n" +
      " §7Ranks: textures/ui/rank_icon§r\n" +
      " §7Default: paper icon for items, setting icon for ranks§r\n\n" +
      "§e5. Multiple Commands:§r\n" +
      " §7Use '/execute @s ~ ~ ~ ' before each command§r\n" +
      " §7Example: §f/execute @s ~ ~ ~ give @s diamond 5§r\n" +
      " §7 §f/execute @s ~ ~ ~ effect @s strength 300 1§r\n\n" +
      "§fNote: Rank rewards automatically remove old ranks and add new ones.",
    )
    .button("§2Back to Admin Menu", "textures/ui/arrow_left");

  await helpForm.show(player);
}

export async function openBattlepassAdmin(player) {
  const playerKey = player.id ?? player.name;
  if (activeAdminPlayers.has(playerKey)) return;
  activeAdminPlayers.add(playerKey);

  try {
    while (true) {
      const adminMenu = new ActionFormData().simpleUi()
        .title("BATTLEPASS ADMIN MENU")
        .body("§fSelect an option:")
        .button(
          "§aAdd Reward\n§r§7Add a new reward",
          "textures/ui/Add-Ons_Nav_Icon36x36",
        )
        .button(
          "§eEdit Reward\n§r§7Modify existing reward",
          "textures/ui/icon_setting",
        )
        .button(
          "§cDelete Reward\n§r§7Remove existing reward",
          "textures/ui/icon_trash",
        )
        .button(
          "§bView Players\n§r§7See who claimed rewards",
          "textures/ui/icon_multiplayer",
        )
        .button(
          "Settings\n§r§7Configure season and premium",
          "textures/ui/icon_setting",
        )
        .button(
          "§dReward Help\n§r§7How to add items & ranks",
          "textures/ui/blue_info_glyph",
        )
        .button(
          "Reset Battlepass\n§r§7Reset claims, rewards, or season",
          "textures/ui/refresh",
        );

      const result = await adminMenu.show(player);
      if (result.canceled || result.selection === undefined) return;

      switch (result.selection) {
        case 0:
          await addRewardUI(player);
          break;
        case 1:
          await editRewardUI(player);
          break;
        case 2:
          await deleteRewardUI(player);
          break;
        case 3:
          await viewRewardClaimedByPlayers(player);
          break;
        case 4:
          await showBattlepassSettings(player);
          break;
        case 5:
          await showCustomItemHelp(player);
          break;
        case 6:
          await resetBattlepassUI(player);
          break;
      }
    }
  } catch (error) {
    console.warn("[Battlepass Admin] Menu closed after an unexpected error:", error);
  } finally {
    activeAdminPlayers.delete(playerKey);
  }
}
