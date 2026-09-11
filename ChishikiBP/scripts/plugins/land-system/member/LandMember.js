/**
 * @author kiwo
 * @watermark This code is protected. Redistribution without permission is prohibited.
 */

import { system, world, ActionFormData, ModalFormData, MessageFormData } from '../../../core.js';
import { LandConfig } from "../admin/LandConfig.js";
import { LandDatabase } from "../core/LandDatabase.js";
import { LandParticles } from "../core/LandParticles.js";
import { LandProtection } from "../core/LandProtection.js";
import { isMemberFeatureEnabled } from "../../../function/memberFeatureState.js";
import { clanDB } from "../../../function/getClan.js";
import { Lang } from "../../../lib/Lang.js";
import {
  addMoney,
  removeMoney,
  getFormattedMoney,
  getFullMoney,
} from "../../../function/moneySystem.js";
import {
  getLandBenefits,
  hasPermission,
} from "../../ranks/rank_benefits.js";
import { isPlayerValid } from "../../ranks/rank.js";
LandDatabase.init();
LandProtection.init();
const positions = new WeakMap();
let cachedConfig = null,
  lastConfigUpdate = 0;
const CONFIG_CACHE_TIME = 1000,
  NOTIFICATION_DELAY = 10;
const getConfig = () => {
  const now = Date.now();
  if (!cachedConfig || now - lastConfigUpdate > CONFIG_CACHE_TIME) {
    cachedConfig = LandConfig.getConfig();
    lastConfigUpdate = now;
  }
  return cachedConfig;
};
const isSameMember = (member, player) =>
  (member?.id && player?.id && member.id === player.id) || member?.name === player?.name;
const getClanData = (player) => {
  const clanId = clanDB.get(`player_${player.name}`)?.clanId;
  const clan = clanId && clanDB.get(`clan_${clanId}`);
  return clan && Array.isArray(clan.members) && clan.members.includes(player.name)
    ? { id: clanId, name: clan.name || clanId }
    : null;
};
class LandSystem {
  static _getOverlapError(res) {
    if (res.overlapType === "lobby_protection") {
      return `Area overlaps with Lobby Protection region "${res.withClaim.name}"! This area is protected and cannot be claimed.`;
    }
    return "Area overlaps with another land claim!";
  }
  static setPosition(player, posNum) {
    const pos = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z),
      dimension: player.dimension.id.split(":")[1],
    };
    const rotation = player.getRotation();
    const facing = Math.floor(rotation.y);
    if (facing >= -45 && facing < 45) {
      pos.z += 1;
    } else if (facing >= 45 && facing < 135) {
      pos.x -= 1;
    } else if (facing >= 135 || facing < -135) {
      pos.z -= 1;
    } else if (facing >= -135 && facing < -45) {
      pos.x += 1;
    }
    const playerPos = positions.get(player) || {};
    if (
      posNum === 2 &&
      playerPos.pos1 &&
      playerPos.pos1.dimension !== pos.dimension
    ) {
      LandProtection.sendErrorMessage(
        player,
        "Cannot set position 2 in a different dimension!",
      );
      return;
    }
    playerPos[posNum === 1 ? "pos1" : "pos2"] = pos;
    positions.set(player, playerPos);
    if (posNum === 2 && playerPos.pos1) {
      LandDatabase.checkClaimOverlap(playerPos.pos1, pos).then((res) => {
        if (res.overlaps) {
          LandProtection.sendErrorMessage(player, this._getOverlapError(res));
          playerPos.pos2 = undefined;
          positions.set(player, playerPos);
          return;
        }
        system.runTimeout(() => {
          LandParticles.showSelectionPreview(pos, posNum);
          if (playerPos.pos1 && playerPos.pos2) {
            LandParticles.scheduleOutlineUpdates(
              playerPos.pos1,
              playerPos.pos2,
              5,
            );
            this.showClaimInfo(player);
          }
        }, 1);
      });
    } else {
      system.runTimeout(() => {
        LandParticles.showSelectionPreview(pos, posNum);
        if (playerPos.pos1 && playerPos.pos2) {
          LandParticles.scheduleOutlineUpdates(
            playerPos.pos1,
            playerPos.pos2,
            5,
          );
          this.showClaimInfo(player);
        }
      }, 1);
    }
  }
  static resetPositions(player) {
    positions.delete(player);
  }
  static showClaimInfo(player) {
    const { pos1, pos2 } = positions.get(player) || {};
    if (!pos1 || !pos2) return;
    if (pos1.dimension !== pos2.dimension) {
      LandProtection.sendErrorMessage(
        player,
        "Cannot claim across different dimensions!",
      );
      return;
    }
    const landBenefits = getLandBenefits(player);
    const config = getConfig();
    const maxClaimSize = landBenefits.maxClaimSize > 0 ? landBenefits.maxClaimSize : config.maxClaimSize;
    const { valid, message, blocks } = LandConfig.validateClaim(pos1, pos2, maxClaimSize);
    if (!valid) return player.sendMessage(`Error: ${message}`);
    const price = LandConfig.calcPrice(blocks);
    player.sendMessage(
      `=== Claim Information ===\n` +
      `Total Blocks: ${blocks}\n` +
      `Price per Block: $${config.pricePerBlock}\n` +
      `Total Price: $${price}\n` +
      `Min/Max Size: ${config.minClaimSize}/${maxClaimSize}\n` +
      `Dimension: ${pos1.dimension}`,
    );
  }
  static async showClaimConfirmation(player) {
    const { pos1, pos2 } = positions.get(player) || {};
    if (!pos1 || !pos2)
      return LandProtection.sendErrorMessage(
        player,
        "Please set both positions first!",
      );
    const landBenefits = getLandBenefits(player);
    const config = getConfig();
    const maxClaims =
      landBenefits.maxClaims > 0
        ? landBenefits.maxClaims
        : config.maxClaimsPerPlayer;
    const maxClaimSize =
      landBenefits.maxClaimSize > 0
        ? landBenefits.maxClaimSize
        : config.maxClaimSize;
    const freeClaim = landBenefits.freeClaims || config.freeClaim;
    const { valid, message, blocks } = LandConfig.validateClaim(pos1, pos2, maxClaimSize);
    if (!valid) return LandProtection.sendErrorMessage(player, message);
    const overlapCheck = await LandDatabase.checkClaimOverlap(pos1, pos2);
    if (overlapCheck.overlaps) {
      return LandProtection.sendErrorMessage(
        player,
        this._getOverlapError(overlapCheck),
      );
    }
    const price = LandConfig.calcPrice(blocks),
      playerMoney = getFullMoney(player);
    if (blocks > maxClaimSize) {
      return LandProtection.sendErrorMessage(
        player,
        `Claim size exceeds your rank limit! Max: ${maxClaimSize} blocks`,
      );
    }
    const claims = await LandDatabase.getPlayerClaims(player.id);
    if (claims.length >= maxClaims)
      return LandProtection.sendErrorMessage(
        player,
        `Max claims reached for your rank (${maxClaims})`,
      );
    if (config.requireMoney && !freeClaim && playerMoney < price)
      return LandProtection.sendErrorMessage(
        player,
        `Need $${price}, have $${playerMoney}`,
      );
    const clan = getClanData(player);
    const claimTypes = [Lang.t(player, "land.claim.type.personal")];
    if (clan) claimTypes.push(Lang.t(player, "land.claim.type.clan", clan.name));
    const response = await new ModalFormData()
      .title("Confirm Land Claim §t§p§a")
      .textField("Claim Name\nGive your land a unique name", "e.g. My House", {
        defaultValue: "",
      })
      .dropdown(Lang.t(player, "land.claim.type.label"), claimTypes, { defaultValueIndex: 0 })
      .toggle(
        `Confirm Claim\n${freeClaim ? "Free Claim Available (Rank Benefit!)" : `Cost: $${price}`}`,
        { defaultValue: false },
      )
      .submitButton("CLAIM LAND")
      .show(player);
    if (response.canceled || !response.formValues[2]) return;
    const claimName = response.formValues[0]?.trim() || "Unnamed Claim";
    const claimClan = response.formValues[1] === 1 ? getClanData(player) : null;
    if (response.formValues[1] === 1 && !claimClan) {
      return LandProtection.sendErrorMessage(player, Lang.t(player, "land.claim.type.clan_unavailable"));
    }
    try {
      LandDatabase.updatePlayerName(player.id, player.name);
      const protectedDimensions = ["overworld", "nether"];
      if (
        landBenefits.endProtection ||
        hasPermission(player, "end_protection")
      ) {
        protectedDimensions.push("the_end");
      }
      const claimId = await LandDatabase.saveLandClaim(player.id, {
        pos1,
        pos2,
        name: claimName,
        permissions: LandProtection.getDefaultPermissions(),
        members: [],
        clanId: claimClan?.id,
        clanName: claimClan?.name,
        allowEntry: true,
        settings: {
          pvp: false,
          mobSpawning: true,
          explosions: false,
          farmlandProtection: true,
          nearProtectLand: true,
          nearProtectRadius: 5,
          protectedDimensions,
        },
      });
      if (config.requireMoney && !freeClaim) {
        if (!removeMoney(player, price)) {
          await LandDatabase.removeClaim(claimId);
          return LandProtection.sendErrorMessage(player, "Payment failed!");
        }
      }
      LandProtection.sendSuccessMessage(
        player,
        `Land claimed successfully!\n` +
        `\u2022 Name: ${claimName}\n` +
        `\u2022 Size: ${blocks} blocks\n` +
        `\u2022 Cost: ${freeClaim ? "FREE (Rank Benefit!)" : `$${price}`}\n` +
        `\u2022 ID: ${claimId}\n` +
        `\u2022 Protection: Enabled by default\n` +
        `\u2022 Near Protect Land: 5 blocks outside border (blocks piston/lava tricks)\n` +
        `\u2022 Protected Dimensions: ${protectedDimensions.join(", ")}\n\n§eNote: Entry protection is currently OFF. All players can enter your land. Enable it in Land Settings.`,
      );
      this.resetPositions(player);
    } catch (e) {
      LandProtection.sendErrorMessage(
        player,
        e.message?.includes("overlaps")
          ? "This area overlaps with another claim!"
          : "Failed to save claim!",
      );
    }
  }
  static async showMyClaims(player) {
    const claims = await LandDatabase.getPlayerClaims(player.id),
      config = getConfig();
    const landBenefits = getLandBenefits(player);
    const maxClaims = landBenefits.maxClaims > 0 ? landBenefits.maxClaims : config.maxClaimsPerPlayer;
    const form = new ActionFormData()
      .title("My Land Claims")
      .body(
        `Claims: ${claims.length}/${maxClaims}\nSelect a claim`,
      );
    if (claims.length) {
      for (let i = 0; i < claims.length; i++) {
        const c = claims[i];
        if (c?.pos1 && c?.pos2) {
          form.button(
            `${c.name || `Claim at ${c.pos1.x}, ${c.pos1.z}`}\nSize: ${LandConfig.calcBlocks(c.pos1, c.pos2)} blocks | Members: ${c.members?.length || 0}`,
            "textures/ui/icon_best3",
          );
        }
      }
    } else {
      form.button("No Claims Yet", "textures/ui/icon_sign");
    }
    const { canceled, selection } = await form.show(player);
    if (canceled || claims.length === 0)
      return system.runTimeout(() => LandMember(player), 1);
    const validClaims = claims.filter((c) => c?.pos1 && c?.pos2);
    selection >= 0 && selection < validClaims.length
      ? this.showMyClaimDetails(player, validClaims[selection])
      : LandProtection.sendErrorMessage(player, "Invalid selection") &&
      system.runTimeout(() => LandMember(player), 1);
  }
  static _formatPermissions(permissions) {
    if (!permissions) return "No permissions";
    const permMap = {
      break: "Break",
      place: "Place",
      interact: "Interact",
      farm: "Farm",
      entry: "Entry",
      pvp: "PvP",
    };
    const activePerms = Object.entries(permissions)
      .filter(([, value]) => value === true)
      .map(([key]) => permMap[key] || key)
      .join(", ");
    return activePerms || "No permissions";
  }
  static async showMyClaimDetails(player, claim) {
    if (!claim?.pos1 || !claim?.pos2)
      return (
        LandProtection.sendErrorMessage(player, "Invalid claim data") &&
        system.runTimeout(() => this.showMyClaims(player), 1)
      );
    const blocks = LandConfig.calcBlocks(claim.pos1, claim.pos2),
      members = claim.members || [];
    const membersList = members
      .map((m) => `- ${m.name} (${this._formatPermissions(m.permissions)})`)
      .join("\n");
    const claimType = claim.clanId
      ? Lang.t(player, "land.claim.type.clan", claim.clanName || claim.clanId)
      : Lang.t(player, "land.claim.type.personal");
    const form = new ActionFormData()
      .title(claim.name || "Claim Details")
      .body(
        `=== Claim Info ===\nID: ${claim.claimId}\n${Lang.t(player, "land.claim.type.label")}: ${claimType}\nBlocks: ${blocks}\nMembers: ${members.length}\nFrom: ${claim.pos1.x}, ${claim.pos1.y}, ${claim.pos1.z}\nTo: ${claim.pos2.x}, ${claim.pos2.y}, ${claim.pos2.z}\n\nMembers:\n${membersList || "No members"}`,
      )
      .button("Extend Claim", "textures/ui/icon_recipe_nature")
      .button("Manage Members", "textures/ui/permissions_member_star")
      .button("Entry Settings", "textures/ui/icon_import")
      .button("Interact Blocks\n§8Allow specific blocks", "textures/blocks/chest_front")
      .button("Land Settings", "textures/ui/button_custom/settings")
      .button(Lang.t(player, "land.claim.type.button"), "textures/ui/icon_multiplayer")
      .button("Rename Claim", "textures/ui/mining_fatigue_effect")
      .button("Remove Claim", "textures/ui/trash")
      .button("Back", "textures/ui/arrow_left");
    const { canceled, selection } = await form.show(player);
    if (canceled) return system.runTimeout(() => this.showMyClaims(player), 1);
    [
      () => this.showExtendClaim(player, claim),
      () => this.showMemberManagement(player, claim),
      () => this.showEntrySettings(player, claim),
      () => this.showInteractBlocksForm(player, claim),
      () => this.showLandSettings(player, claim),
      () => this.showClaimTypeSettings(player, claim),
      () => this.showRenameClaimForm(player, claim),
      () => this.showRemoveConfirmation(player, claim),
      () => this.showMyClaims(player),
    ][selection]?.();
  }
  static async showClaimTypeSettings(player, claim) {
    const clan = getClanData(player);
    const types = [Lang.t(player, "land.claim.type.personal")];
    const clanIndex = clan ? types.push(Lang.t(player, "land.claim.type.clan", clan.name)) - 1 : -1;
    const currentIndex = claim.clanId && clan?.id === claim.clanId ? clanIndex : 0;
    const { canceled, formValues } = await new ModalFormData()
      .title(Lang.t(player, "land.claim.type.settings.title"))
      .dropdown(Lang.t(player, "land.claim.type.label"), types, { defaultValueIndex: currentIndex })
      .submitButton(Lang.t(player, "land.claim.type.save"))
      .show(player);
    if (canceled) return system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
    const selectedClan = formValues[0] === clanIndex ? getClanData(player) : null;
    if (formValues[0] === clanIndex && !selectedClan) {
      LandProtection.sendErrorMessage(player, Lang.t(player, "land.claim.type.clan_unavailable"));
      return system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
    }
    const updatedClaim = { ...claim, clanId: selectedClan?.id, clanName: selectedClan?.name };
    if (await LandDatabase.updateClaim(claim.claimId, updatedClaim)) {
      LandProtection.clearClaimCache(claim.claimId);
      LandProtection.sendSuccessMessage(player, Lang.t(player, "land.claim.type.updated", selectedClan?.name || Lang.t(player, "land.claim.type.personal")));
      return system.runTimeout(() => this.showMyClaimDetails(player, updatedClaim), 1);
    }
    LandProtection.sendErrorMessage(player, "Failed to update settings!");
    system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
  }
  static async showExtendClaim(player, claim) {
    const form = new ModalFormData()
      .title("Extend Claim §t§p§a")
      .slider("North (+Z)", 0, 50, { defaultValue: 0, valueStep: 1 })
      .slider("South (-Z)", 0, 50, { defaultValue: 0, valueStep: 1 })
      .slider("East (+X)", 0, 50, { defaultValue: 0, valueStep: 1 })
      .slider("West (-X)", 0, 50, { defaultValue: 0, valueStep: 1 })
      .submitButton("PREVIEW EXTENSION");
    const response = await form.show(player);
    if (response.canceled)
      return system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
    const [n, s, e, w] = response.formValues;
    if (n === 0 && s === 0 && e === 0 && w === 0)
      return system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
    const p1 = claim.pos1,
      p2 = claim.pos2;
    const newPos1 = {
      x: Math.min(p1.x, p2.x) - w,
      y: p1.y,
      z: Math.min(p1.z, p2.z) - s,
      dimension: p1.dimension,
    };
    const newPos2 = {
      x: Math.max(p1.x, p2.x) + e,
      y: p2.y,
      z: Math.max(p1.z, p2.z) + n,
      dimension: p2.dimension,
    };
    const landBenefits = getLandBenefits(player);
    const maxClaimSize = landBenefits.maxClaimSize > 0 ? landBenefits.maxClaimSize : getConfig().maxClaimSize;
    const { valid, message, blocks } = LandConfig.validateClaim(
      newPos1,
      newPos2,
      maxClaimSize
    );
    if (!valid) return LandProtection.sendErrorMessage(player, message);
    const overlapCheck = await LandDatabase.checkClaimOverlap(
      newPos1,
      newPos2,
      claim.claimId,
    );
    if (overlapCheck.overlaps)
      return LandProtection.sendErrorMessage(
        player,
        this._getOverlapError(overlapCheck),
      );
    const config = getConfig();
    const oldBlocks = LandConfig.calcBlocks(p1, p2);
    const newPrice = LandConfig.calcPrice(blocks);
    const oldPrice = LandConfig.calcPrice(oldBlocks);
    const priceDiff = newPrice > oldPrice ? newPrice - oldPrice : 0n;
    const playerMoney = getFullMoney(player);
    if (
      config.requireMoney &&
      !config.freeClaim &&
      priceDiff > 0n &&
      playerMoney < priceDiff
    ) {
      return LandProtection.sendErrorMessage(
        player,
        `Need $${priceDiff} more (Have: $${playerMoney})`,
      );
    }
    const confirm = await new ModalFormData()
      .title("Confirm Extension §t§p§a")
      .toggle(
        `Extend Claim?\nOld: ${oldBlocks} blocks\nNew: ${blocks} blocks\nCost: $${priceDiff}`,
        { defaultValue: false },
      )
      .submitButton("CONFIRM")
      .show(player);
    if (confirm.canceled || !confirm.formValues[0])
      return system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
    if (config.requireMoney && !config.freeClaim && priceDiff > 0n) {
      if (!removeMoney(player, priceDiff))
        return LandProtection.sendErrorMessage(player, "Payment failed!");
    }
    if (
      await LandDatabase.updateClaim(claim.claimId, {
        pos1: newPos1,
        pos2: newPos2,
      })
    ) {
      LandProtection.sendSuccessMessage(player, "Claim extended successfully!");
      LandProtection.clearClaimCache(claim.claimId);
      LandParticles.showLandOutline(newPos1, newPos2);
    } else {
      LandProtection.sendErrorMessage(player, "Failed to extend claim!");
    }
    system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
  }
  static async showEntrySettings(player, claim) {
    if (!claim?.pos1 || !claim?.pos2)
      return (
        LandProtection.sendErrorMessage(player, "Invalid claim data") &&
        system.runTimeout(() => this.showMyClaims(player), 1)
      );
    const { canceled, formValues } = await new ModalFormData()
      .title("Entry Settings §t§p§a")
      .toggle("Allow all players entry", {
        defaultValue: claim.allowEntry === true,
      })
      .submitButton("SAVE SETTINGS")
      .show(player);
    if (canceled)
      return system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
    try {
      const updatedClaim = { ...claim, allowEntry: formValues[0] === true };
      const success = await LandDatabase.updateClaim(
        claim.claimId,
        updatedClaim,
      );
      if (success) {
        LandProtection.clearClaimCache(claim.claimId);
        LandProtection.sendSuccessMessage(
          player,
          `Access settings updated! ${formValues[0] ? "All players can enter" : "Only members are allowed"}`,
        );
        const claims = await LandDatabase.getPlayerClaims(player.id);
        const refreshedClaim = claims.find((c) => c.claimId === claim.claimId);
        if (refreshedClaim) {
          system.runTimeout(
            () => this.showMyClaimDetails(player, refreshedClaim),
            1,
          );
          return;
        }
      } else {
        LandProtection.sendErrorMessage(player, "Failed to update settings!");
      }
    } catch (e) {
      console.warn("Entry settings error:", e);
      LandProtection.sendErrorMessage(player, "Error updating settings!");
    }
    system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
  }
  static async showInteractBlocksForm(player, claim) {
    if (!claim?.pos1 || !claim?.pos2)
      return (
        LandProtection.sendErrorMessage(player, "Invalid claim data") &&
        system.runTimeout(() => this.showMyClaims(player), 1)
      );
    const current = claim.interactBlocks || [];
    const { canceled, formValues } = await new ModalFormData()
      .title("Interact Blocks §t§p§a")
      .textField(
        "Block IDs\n§7Blocks interacted by non-owners, comma separated, without minecraft: prefix (e.g. chest, barrel)",
        "chest, barrel, crafting_table",
        { defaultValue: current.join(", ") },
      )
      .submitButton("SAVE BLOCKS")
      .show(player);
    if (canceled)
      return system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
    const list = String(formValues?.[0] || "")
      .split(",")
      .map((s) => s.trim().toLowerCase().replace(/^minecraft:/, ""))
      .filter(Boolean);
    try {
      const updatedClaim = { ...claim, interactBlocks: list };
      const success = await LandDatabase.updateClaim(
        claim.claimId,
        updatedClaim,
      );
      if (success) {
        LandProtection.clearClaimCache(claim.claimId);
        LandProtection.sendSuccessMessage(
          player,
          `Interact blocks saved! (${list.length} block(s))`,
        );
        const claims = await LandDatabase.getPlayerClaims(player.id);
        const refreshedClaim = claims.find((c) => c.claimId === claim.claimId);
        if (refreshedClaim) {
          system.runTimeout(
            () => this.showMyClaimDetails(player, refreshedClaim),
            1,
          );
          return;
        }
      } else {
        LandProtection.sendErrorMessage(player, "Failed to update blocks!");
      }
    } catch (e) {
      console.warn("Interact blocks error:", e);
      LandProtection.sendErrorMessage(player, "Error updating blocks!");
    }
    system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
  }
  static async showRenameClaimForm(player, claim) {
    if (!claim?.pos1 || !claim?.pos2)
      return (
        LandProtection.sendErrorMessage(player, "Invalid claim data") &&
        system.runTimeout(() => this.showMyClaims(player), 1)
      );
    const { canceled, formValues } = await new ModalFormData()
      .title("Rename Claim §t§p§a")
      .textField("New name", "e.g. My House", {
        defaultValue: claim.name || "",
      })
      .submitButton("SAVE NAME")
      .show(player);
    if (canceled) return system.runTimeout(() => this.showMyClaims(player), 1);
    const newName = formValues[0]?.trim() || "Unnamed Claim",
      updatedClaim = { ...claim, name: newName };
    LandDatabase.updateClaim(claim.claimId, updatedClaim)
      ? this.queueNotification(player, `Renamed to: ${newName}`)
      : this.queueNotification(player, "Failed to rename!", true);
    system.runTimeout(() => this.showMyClaims(player), NOTIFICATION_DELAY * 3);
  }
  static async showMemberManagement(player, claim) {
    if (!claim?.pos1 || !claim?.pos2)
      return (
        LandProtection.sendErrorMessage(player, "Invalid claim data") &&
        system.runTimeout(() => this.showMyClaims(player), 1)
      );
    const members = claim.members || [];
    const form = new ActionFormData()
      .title("Manage Members")
      .body(`Current members: ${members.length}\nSelect an action:`);
    if (members.length > 0) {
      form.button(
        "Configure Members\nEdit permissions",
        "textures/ui/permissions_member_star",
      );
    }
    form
      .button("Add Member\nAdd new member", "textures/ui/color_plus")
      .button("Remove Member\nRemove existing member", "textures/ui/trash")
      .button("Back", "textures/ui/arrow_left");
    const { canceled, selection } = await form.show(player);
    if (canceled)
      return system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
    let action;
    if (members.length > 0) {
      action = [
        () => this.showMemberSettings(player, claim),
        () => this.showAddMember(player, claim),
        () => this.showRemoveMember(player, claim),
        () => this.showMyClaimDetails(player, claim),
      ][selection];
    } else {
      action = [
        () => this.showAddMember(player, claim),
        () => this.showRemoveMember(player, claim),
        () => this.showMyClaimDetails(player, claim),
      ][selection];
    }
    action?.();
  }
  static async showMemberSettings(player, claim) {
    const members = claim.members || [];
    if (!members.length) {
      LandProtection.sendErrorMessage(player, "No members to configure!");
      return system.runTimeout(
        () => this.showMemberManagement(player, claim),
        1,
      );
    }
    const form = new ActionFormData()
      .title("Member Settings")
      .body("Select a member to configure permissions:");
    for (const member of members) {
      form.button(
        `${member.name}\n${this._formatPermissions(member.permissions)}`,
        "textures/ui/button_custom/kepala_player",
      );
    }
    form.button("Back", "textures/ui/arrow_left");
    const { canceled, selection } = await form.show(player);
    if (canceled || selection === members.length) {
      return system.runTimeout(
        () => this.showMemberManagement(player, claim),
        1,
      );
    }
    const selectedMember = members[selection];
    const onlineMember = world.getAllPlayers().find((p) => isSameMember(selectedMember, p));
    await this.showPermissionSelection(
      player,
      claim,
      onlineMember || { id: selectedMember.id, name: selectedMember.name },
      true,
    );
  }
  static async showAddMember(player, claim) {
    const availablePlayers = world
      .getAllPlayers()
      .filter((p) => p.name !== player.name);
    if (!availablePlayers.length)
      return (
        LandProtection.sendErrorMessage(player, "No players online!") &&
        system.runTimeout(() => this.showMemberManagement(player, claim), 1)
      );
    const form = new ActionFormData()
      .title("Add Member")
      .body("Select player to add:");
    for (let i = 0; i < availablePlayers.length; i++) {
      const p = availablePlayers[i];
      const isMember = claim.members?.some((m) => isSameMember(m, p));
      form.button(
        `${p.name}\n${isMember ? "Already member" : "Add"}`,
        "textures/ui/button_custom/kepala_player",
      );
    }
    form.button("Back", "textures/ui/arrow_left");
    const { canceled, selection } = await form.show(player);
    if (canceled || selection === availablePlayers.length)
      return system.runTimeout(
        () => this.showMemberManagement(player, claim),
        1,
      );
    const selectedPlayer = availablePlayers[selection];
    if (claim.members?.some((m) => isSameMember(m, selectedPlayer))) {
      LandProtection.sendErrorMessage(player, "Player is already a member!");
      return system.runTimeout(
        () => this.showMemberManagement(player, claim),
        1,
      );
    }
    this.showPermissionSelection(player, claim, selectedPlayer);
  }
  static async showRemoveMember(player, claim) {
    const members = claim.members || [];
    if (!members.length)
      return (
        LandProtection.sendErrorMessage(player, "No members!") &&
        system.runTimeout(() => this.showMemberManagement(player, claim), 1)
      );
    const form = new ActionFormData()
      .title("Remove Member")
      .body("Select member to remove:");
    const validMembers = members.filter((m) => m && m.name);
    for (let i = 0; i < validMembers.length; i++) {
      const m = validMembers[i];
      form.button(
        `${m.name}\nClick to remove`,
        "textures/ui/button_custom/kepala_player",
      );
    }
    form.button("Back", "textures/ui/arrow_left");
    const { canceled, selection } = await form.show(player);
    if (canceled || selection === validMembers.length) {
      return system.runTimeout(
        () => this.showMemberManagement(player, claim),
        1,
      );
    }
    try {
      const removedMember = validMembers[selection];
      const updatedMembers = members.filter(
        (m) => !isSameMember(m, removedMember),
      );
      const updatedClaim = { ...claim, members: updatedMembers };
      const success = await LandDatabase.updateClaim(
        claim.claimId,
        updatedClaim,
      );
      if (success) {
        LandProtection.sendSuccessMessage(
          player,
          `Removed ${removedMember.name} from claim`,
        );
        LandProtection.clearClaimCache(claim.claimId);
        claim.members = updatedMembers;
      } else {
        LandProtection.sendErrorMessage(player, "Failed to remove member!");
      }
    } catch (e) {
      console.warn("Remove member error:", e);
      LandProtection.sendErrorMessage(player, "Error removing member!");
    }
    system.runTimeout(() => this.showMemberManagement(player, { ...claim }), 1);
  }
  static async _updateMemberPermissions(
    player,
    claim,
    targetPlayer,
    permissions,
  ) {
    const existingMember = claim.members?.find((m) => isSameMember(m, targetPlayer));
    let updatedMembers;
    if (existingMember) {
      updatedMembers = claim.members.map((m) =>
        isSameMember(m, targetPlayer) ? { ...m, id: targetPlayer.id || m.id, name: targetPlayer.name || m.name, permissions } : m,
      );
    } else {
      const newMember = {
        id: targetPlayer.id,
        name: targetPlayer.name,
        permissions,
        addedAt: Date.now(),
      };
      updatedMembers = [...(claim.members || []), newMember];
    }
    const updatedClaim = { ...claim, members: updatedMembers };
    const success = await LandDatabase.updateClaim(claim.claimId, updatedClaim);
    if (success) {
      const message = existingMember
        ? `Permissions updated for ${targetPlayer.name}`
        : `Added ${targetPlayer.name} with permissions`;
      LandProtection.sendSuccessMessage(player, message);
      LandProtection.clearClaimCache(claim.claimId);
      claim.members = updatedMembers;
    } else {
      const message = existingMember
        ? "Failed to update permissions!"
        : "Failed to add member!";
      LandProtection.sendErrorMessage(player, message);
    }
  }
  static async showPermissionSelection(
    player,
    claim,
    targetPlayer,
    isSettings = false,
  ) {
    const existingMember = claim.members?.find((m) => isSameMember(m, targetPlayer));
    const { canceled, formValues } = await new ModalFormData()
      .title(`Permissions for ${targetPlayer.name} §t§p§a`)
      .toggle("Break blocks", {
        defaultValue: existingMember?.permissions?.break ?? false,
      })
      .toggle("Place blocks", {
        defaultValue: existingMember?.permissions?.place ?? false,
      })
      .toggle("Interact (blocks, doors, containers, etc.)", {
        defaultValue: existingMember?.permissions?.interact ?? false,
      })
      .toggle("Farm (crops and farmland)", {
        defaultValue: existingMember?.permissions?.farm ?? false,
      })
      .toggle("Allow Entry", {
        defaultValue: existingMember?.permissions?.entry ?? false,
      })
      .toggle("Allow PvP (ON: Can PvP, OFF: Cannot PvP)", {
        defaultValue: existingMember?.permissions?.pvp ?? false,
      })
      .submitButton("SAVE PERMISSIONS")
      .show(player);
    if (canceled)
      return system.runTimeout(
        () => this.showMemberManagement(player, claim),
        1,
      );
    const permissions = {
      break: formValues[0],
      place: formValues[1],
      interact: formValues[2],
      farm: formValues[3],
      entry: formValues[4],
      pvp: formValues[5],
    };
    try {
      await this._updateMemberPermissions(
        player,
        claim,
        targetPlayer,
        permissions,
      );
    } catch (e) {
      console.warn("Permission update error:", e);
      LandProtection.sendErrorMessage(player, "Error updating permissions!");
    }
    system.runTimeout(
      () =>
        isSettings
          ? this.showMemberManagement(player, claim)
          : this.showMemberSettings(player, claim),
      1,
    );
  }
  static async showLandSettings(player, claim) {
    if (!claim?.pos1 || !claim?.pos2) {
      LandProtection.sendErrorMessage(player, "Invalid claim data");
      return system.runTimeout(() => this.showMyClaims(player), 1);
    }
    const settings = claim.settings || {};
    const form = new ModalFormData()
      .title("Land Settings §t§p§a")
      .toggle("Allow Entry\nAllow players to enter your claim", {
        defaultValue: claim.allowEntry === true,
      })
      .toggle("PvP Protection\nDisable PvP in your claim", {
        defaultValue: settings.pvp === false,
      })
      .toggle(
        "Disable Mob Spawning\nPrevents mobs from spawning in your claim",
        { defaultValue: settings.mobSpawning === false },
      )
      .toggle("Allow Explosions\nAllow TNT and creeper explosions", {
        defaultValue: settings.explosions === true,
      })
      .toggle("Farm Protection\nProtect farmland and crops from unauthorized damage", {
        defaultValue: settings.farmlandProtection !== false,
      })
      .toggle("Near Protect Land\nBuffer outside border blocks piston/lava tricks", {
        defaultValue: settings.nearProtectLand !== false,
      })
      .slider("Near Protect Radius\nBlocks outside your land border (3-6)", 3, 6, {
        defaultValue: Math.min(6, Math.max(3, settings.nearProtectRadius ?? 5)),
      })
      .toggle("Protect in Overworld", {
        defaultValue:
          settings.protectedDimensions?.includes("overworld") ?? true,
      })
      .toggle("Protect in Nether", {
        defaultValue: settings.protectedDimensions?.includes("nether") ?? true,
      });
    const response = await form.show(player);
    if (response.canceled) {
      return system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
    }
    try {
      const protectedDimensions = [];
      if (response.formValues[7]) protectedDimensions.push("overworld");
      if (response.formValues[8]) protectedDimensions.push("nether");
      const updatedSettings = {
        ...settings,
        pvp: !response.formValues[1],
        mobSpawning: !response.formValues[2],
        explosions: response.formValues[3],
        farmlandProtection: response.formValues[4],
        nearProtectLand: response.formValues[5],
        nearProtectRadius: response.formValues[6],
        protectedDimensions,
      };
      const updatedClaim = {
        ...claim,
        settings: updatedSettings,
        allowEntry: response.formValues[0],
      };
      const success = await LandDatabase.updateClaim(
        claim.claimId,
        updatedClaim,
      );
      if (success) {
        LandProtection.clearClaimCache(claim.claimId);
        LandProtection.sendSuccessMessage(
          player,
          "Land settings updated successfully!\n" +
          `\u2022 Entry: ${response.formValues[0] ? "Allowed" : "Denied"}\n` +
          `\u2022 PvP: ${!response.formValues[1] ? "Enabled" : "Disabled"}\n` +
          `\u2022 Mob Spawning: ${response.formValues[2] ? "Disabled" : "Enabled"}\n` +
          `\u2022 Explosions: ${response.formValues[3] ? "Enabled" : "Disabled"}\n` +
          `\u2022 Farm Protection: ${response.formValues[4] ? "Enabled" : "Disabled"}\n` +
          `\u2022 Near Protect Land: ${response.formValues[5] ? `Enabled (${response.formValues[6]} blocks)` : "Disabled"}\n` +
          `\u2022 Protected Dimensions: ${protectedDimensions.join(", ") || "None"}`,
        );
        claim.settings = updatedSettings;
        claim.allowEntry = response.formValues[0];
      } else {
        LandProtection.sendErrorMessage(player, "Failed to update settings!");
      }
    } catch (e) {
      console.warn("Land settings error:", e);
      LandProtection.sendErrorMessage(player, "Error updating settings!");
    }
    system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
  }
  static queueNotification(player, message, isError = false) {
    system.runTimeout(() => {
      if (isError) {
        LandProtection.sendErrorMessage(player, message);
      } else {
        LandProtection.sendSuccessMessage(player, message);
      }
    }, NOTIFICATION_DELAY * 3);
  }
  static async showRemoveConfirmation(player, claim) {
    const { canceled, formValues } = await new ModalFormData()
      .title("Remove Claim §t§p§a")
      .toggle("Confirm removal", { defaultValue: false })
      .submitButton("REMOVE CLAIM")
      .show(player);
    if (canceled || !formValues[0])
      return system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
    (await LandDatabase.removeClaim(claim.claimId))
      ? (LandProtection.sendSuccessMessage(player, "Claim removed!"),
        this.resetPositions(player),
        system.runTimeout(() => this.showMyClaims(player), 1))
      : LandProtection.sendErrorMessage(player, "Failed to remove!") &&
      system.runTimeout(() => this.showMyClaimDetails(player, claim), 1);
  }
}
export async function LandMember(player) {
  if (!isPlayerValid(player)) return;
  if (!isMemberFeatureEnabled("claimLand")) {
    player.sendMessage("§cLand system is currently disabled in Member Feature Toggle.");
    return;
  }
  const { pos1, pos2 } = positions.get(player) || {},
    pos1Set = pos1 ? "\u2713" : "\u2717",
    pos2Set = pos2 ? "\u2713" : "\u2717";
  let overlap = false;
  let overlapType = null;
  let overlapMsg = "";
  let claimInfo = "";
  const landBenefits = getLandBenefits(player);
  const maxClaims =
    landBenefits.maxClaims > 0
      ? landBenefits.maxClaims
      : getConfig().maxClaimsPerPlayer;
  const maxClaimSize =
    landBenefits.maxClaimSize > 0
      ? landBenefits.maxClaimSize
      : getConfig().maxClaimSize;
  const freeClaim = landBenefits.freeClaims || getConfig().freeClaim;
  const endProtection =
    landBenefits.endProtection || hasPermission(player, "end_protection");
  if (pos1 && pos2) {
    const res = await LandDatabase.checkClaimOverlap(pos1, pos2);
    if (res.overlaps) {
      overlap = true;
      overlapType = res.overlapType;
      overlapMsg = ` §c(Overlap!)`;
    }
    const validation = LandConfig.validateClaim(pos1, pos2, maxClaimSize);
    if (validation.valid) {
      const blocks = LandConfig.calcBlocks(pos1, pos2);
      const price = freeClaim ? "FREE" : `$${LandConfig.calcPrice(blocks)}`;
      claimInfo = ` §8| §7${blocks} blocks §8| §7${price}`;
      if (blocks > maxClaimSize) {
        claimInfo += ` §c(Max: ${maxClaimSize})`;
      }
    } else {
      claimInfo = ` §c(Invalid)`;
    }
  }
  const form = new ActionFormData()
    .title("LAND MANAGEMENT")
    .body(
      `§e\u2550\u2550\u2550 Land Claim System \u2550\u2550\u2550\n\n` +
      `§7Position 1: ${pos1 ? `§a\u2713 Set` : `§c\u2717 Not set`}\n` +
      `§7Position 2: ${pos2 ? `§a\u2713 Set` : `§c\u2717 Not set`}` +
      `${claimInfo}${overlapMsg}\n\n` +
      `§8Tip: Set both positions to create a claim`,
    )
    .button("Set Pos 1\n§7Mark first corner", "textures/ui/icon_recipe_item");
  if (overlap) {
    form.button(
      "Set Pos 2\n§c(Overlap!)",
      "textures/ui/icon_recipe_construction",
    );
  } else {
    form.button(
      pos1
        ? "Set Pos 2\n§7Mark second corner"
        : "Set Pos 2\n§cSet Pos 1 first!",
      "textures/ui/icon_recipe_construction",
    );
  }
  form.button("Reset\n§7Clear positions", "textures/ui/refresh");
  let claimBtnText = "Claim\n§7Create land claim";
  if (overlap) {
    claimBtnText =
      overlapType === "lobby_protection"
        ? "Claim\n§c(Protected area!)"
        : "Claim\n§c(Overlapping!)";
  } else if (!pos1 || !pos2) {
    claimBtnText = "Claim\n§cSet positions first";
  }
  form.button(claimBtnText, "textures/ui/icon_sign");
  form.button("My Claims\n§7Manage your lands", "textures/ui/mashup_world");
  form.button(
    "Details\n§7Rank benefits & pricing",
    "textures/ui/icon_book_writable",
  );
  form
    .show(player)
    .then(({ canceled, selection }) => {
      if (canceled) return;
      const showMenu = () => system.runTimeout(() => LandMember(player), 1);
      const setPosAndNotify = (posNum) => {
        const { x, y, z } = player.location;
        LandSystem.setPosition(player, posNum);
        LandProtection.sendSuccessMessage(
          player,
          `Pos ${posNum} set: ${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}`,
        );
        showMenu();
      };
      const showDetailsMenu = () => {
        let claimDetails = "";
        if (pos1 && pos2) {
          const validation = LandConfig.validateClaim(pos1, pos2, maxClaimSize);
          if (validation.valid) {
            const blocks = LandConfig.calcBlocks(pos1, pos2);
            const price = freeClaim
              ? "FREE"
              : `$${LandConfig.calcPrice(blocks)}`;
            claimDetails = `\n\n§e=== Current Selection ===\n§7Blocks: §b${blocks}\n§7Price: §b${price}`;
            if (blocks > maxClaimSize) {
              claimDetails += `\n§c\u26A0 Exceeds limit (${maxClaimSize})`;
            }
          }
        }
        const detailsForm = new MessageFormData()
          .title("§bLAND DETAILS")
          .body(
            `§e\u2550\u2550\u2550 Position Status \u2550\u2550\u2550\n` +
            `§7Pos 1: ${pos1 ? `§a${pos1.x}, ${pos1.y}, ${pos1.z} §8(${pos1.dimension})` : "§cNot set"}\n` +
            `§7Pos 2: ${pos2 ? `§a${pos2.x}, ${pos2.y}, ${pos2.z} §8(${pos2.dimension})` : "§cNot set"}\n\n` +
            `§e\u2550\u2550\u2550 Rank Benefits \u2550\u2550\u2550\n` +
            `§7Max Claims: §b${maxClaims}\n` +
            `§7Max Claim Size: §b${maxClaimSize} §7blocks\n` +
            `§7Free Claims: ${freeClaim ? "§aYes §7(No cost!)" : "§cNo"}\n` +
            `§7End Protection: ${endProtection ? "§aYes §7(The End dim)" : "§cNo"}\n\n` +
            `§e\u2550\u2550\u2550 Pricing Info \u2550\u2550\u2550\n` +
            `§7Price per Block: §b$${getConfig().pricePerBlock || 1}\n` +
            `§7Min Claim Size: §b${getConfig().minClaimSize || 10} §7blocks\n` +
            `§7Max Claim Size: §b${getConfig().maxClaimSize || 10000} §7blocks` +
            claimDetails,
          )
          .button1("OK")
          .button2("Back");
        detailsForm.show(player).then(() => showMenu());
      };
      const actions = [
        () => setPosAndNotify(1),
        overlap
          ? undefined
          : () => {
            if (pos1) {
              setPosAndNotify(2);
            } else {
              LandProtection.sendErrorMessage(player, "Set Pos 1 first!");
              showMenu();
            }
          },
        () => {
          LandSystem.resetPositions(player);
          LandProtection.sendSuccessMessage(player, "Positions reset");
          showMenu();
        },
        overlap
          ? undefined
          : () => {
            if (pos1 && pos2) {
              LandDatabase.checkClaimOverlap(pos1, pos2).then((res) => {
                if (res.overlaps) {
                  LandProtection.sendErrorMessage(
                    player,
                    LandSystem._getOverlapError(res),
                  );
                  showMenu();
                } else {
                  LandSystem.showClaimConfirmation(player).finally(showMenu);
                }
              });
            } else {
              LandSystem.showClaimConfirmation(player).finally(showMenu);
            }
          },
        () => LandSystem.showMyClaims(player),
        () => showDetailsMenu(),
      ];
      actions[selection]?.();
    })
    .catch((e) => {
      console.warn("Land menu error:", e);
      LandProtection.sendErrorMessage(
        player,
        "An error occurred in the land menu.",
      );
    });
}
