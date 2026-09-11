/**
 * @author kiwo
 * @watermark This code is protected. Redistribution without permission is prohibited.
 */

import { ActionFormData, ModalFormData, world, system } from "../../../core.js";
import { LandDatabase } from "../core/LandDatabase.js";
import { getFullMoney, setMoney } from "../../../function/moneySystem.js";
import { GlobalConfig } from "../../../function/GlobalConfig.js";
import { isMemberFeatureEnabled } from "../../../function/memberFeatureState.js";
const sameMember = (a, b) => (a?.id && b?.id && a.id === b.id) || a?.name === b?.name;
export class LandConfig {
  static CONFIG_KEY = "land_config";
  static MONEY_OBJ = "money";
  static DISP_OBJ = "display_money";
  static #cache = null;
  static #lastUpd = 0;
  static #nonSolid = ["minecraft:air", "minecraft:water", "minecraft:lava", "minecraft:fire", "minecraft:grass", "minecraft:tall_grass", "minecraft:seagrass", "minecraft:kelp", "minecraft:snow", "minecraft:vine", "minecraft:dead_bush", "minecraft:torch", "minecraft:flower"];
  static #hazard = ["minecraft:lava", "minecraft:fire", "minecraft:sweet_berry_bush", "minecraft:cactus", "minecraft:magma_block", "minecraft:campfire", "minecraft:soul_campfire", "minecraft:wither_rose"];
  static defaultConfig = { minClaimSize: 10, maxClaimSize: 1000, pricePerBlock: 10, maxClaimsPerPlayer: 3, allowOverlap: false, requireMoney: true, protectionEnabled: true, freeClaim: false, allowTeleport: true, notifyNearby: true, autoVisualize: true, performanceMode: true, nearProtectRadius: 5 };
  static initScoreboard() {
    try {
      if (!world.scoreboard.getObjective(this.MONEY_OBJ)) world.scoreboard.addObjective(this.MONEY_OBJ, "Money");
      if (!world.scoreboard.getObjective(this.DISP_OBJ)) world.scoreboard.addObjective(this.DISP_OBJ, "§b§l\u2726 BALANCE \u2726");
      this.cleanupDisplayScoreboard();
      this.animScoreboard();
      return true;
    } catch (e) { console.warn("SB Init:", e); return false; }
  }
  static cleanupDisplayScoreboard(objectiveId = this.DISP_OBJ) {
    try {
      const obj = world.scoreboard.getObjective(objectiveId);
      if (!obj) return;
      const onlineIds = new Set(world.getPlayers().map(p => p.scoreboardIdentity?.id).filter(Boolean));
      for (const part of obj.getParticipants()) {
        if (!onlineIds.has(part.id)) obj.removeParticipant(part);
      }
    } catch { }
  }
  static syncDisplayScoreboard() {
    try {
      const obj = world.scoreboard.getObjective(this.DISP_OBJ);
      if (!obj) return;
      const onlineIds = new Set();
      for (const p of world.getPlayers()) {
        const id = p.scoreboardIdentity?.id;
        if (id) onlineIds.add(id);
        const m = getFullMoney(p);
        obj.setScore(p, Number(m > 2000000000n ? 2000000000n : m));
      }
      for (const part of obj.getParticipants()) {
        if (!onlineIds.has(part.id)) obj.removeParticipant(part);
      }
    } catch { }
  }
  static #animHandle = undefined
  static animScoreboard() {
    if (this.#animHandle !== undefined) {
      try { system.clearRun(this.#animHandle); } catch { }
      this.#animHandle = undefined;
    }
    if (this.getConfig().performanceMode) return;
    this.#animHandle = system.runInterval(() => {
      try {
        if (this.getConfig().performanceMode) return;
        if (!world.scoreboard.getObjective(this.DISP_OBJ)) return this.initScoreboard();
        this.syncDisplayScoreboard();
      } catch { }
    }, 40);
  }
  static getConfig() {
    const now = Date.now();
    if (this.#cache && now - this.#lastUpd < 60000) return this.#cache;
    try {
      const s = GlobalConfig.get(this.CONFIG_KEY);
      this.#cache = s ? { ...this.defaultConfig, ...(typeof s === "string" ? JSON.parse(s) : s) } : this.defaultConfig;
      this.#lastUpd = now;
      return this.#cache;
    } catch { return this.defaultConfig; }
  }
  static saveConfig(c) {
    try {
      GlobalConfig.set(this.CONFIG_KEY, c);
      this.#cache = c;
      this.#lastUpd = Date.now();
      return true;
    } catch (e) { console.warn("Save:", e); return false; }
  }
  static async #form(p, f, cb, err) {
    try {
      const r = await f.show(p);
      if (r.canceled) return err?.();
      await cb(r);
    } catch (e) {
      p.sendMessage(e.reason ? `§cForm rejected: ${e.reason}` : "§cForm error");
      if (!e.reason) console.warn("Form:", e);
      err?.();
    }
  }
  static async showPerformanceSettings(p) {
    const c = this.getConfig();
    this.#form(p, new ModalFormData().title("Performance Settings")
      .toggle("§eProtection Enabled\n§8Enable/disable all land protection globally", { defaultValue: c.protectionEnabled !== false })
      .toggle("§ePerformance Mode\n§8Optimize for low-end devices", { defaultValue: c.performanceMode })
      .toggle("§eAuto Visualize Claims\n§8Show claim boundaries", { defaultValue: c.autoVisualize })
      .toggle("§eNotify Nearby Players\n§8Alert players near claims", { defaultValue: c.notifyNearby }),
      (r) => {
        [c.protectionEnabled, c.performanceMode, c.autoVisualize, c.notifyNearby] = r.formValues;
        this.saveConfig(c) && p.sendMessage("§aPerformance settings updated!");
      }, () => system.runTimeout(() => this.showAdminMenu(p), 1));
  }
  static calcPrice(b) { const c = this.getConfig(); return c.freeClaim ? 0n : BigInt(b) * BigInt(c.pricePerBlock); }
  static calcBlocks(p1, p2) { return (Math.abs(p1.x - p2.x) + 1) * (Math.abs(p1.z - p2.z) + 1); }
  static validateClaim(p1, p2, maxClaimSizeOverride = null) {
    if (!p1 || !p2) return { valid: false, message: "Invalid positions" };
    const c = this.getConfig(), b = this.calcBlocks(p1, p2);
    const maxSize = maxClaimSizeOverride !== null && maxClaimSizeOverride > 0 ? maxClaimSizeOverride : c.maxClaimSize;
    if (b < c.minClaimSize) return { valid: false, message: `Claim too small. Min: ${c.minClaimSize}` };
    if (b > maxSize) return { valid: false, message: `Claim too large. Max: ${maxSize}` };
    return { valid: true, blocks: b, price: this.calcPrice(b) };
  }
  static async showPriceSettings(p) {
    const c = this.getConfig();
    this.#form(p, new ModalFormData().title("Price Settings")
      .toggle("§eFree Claims\n§8Allow free land claims", { defaultValue: c.freeClaim })
      .toggle("§eRequire Money\n§8Require payment for claims", { defaultValue: c.requireMoney })
      .textField("§ePrice Per Block\n§8Cost per block", "Enter price...", { defaultValue: c.pricePerBlock.toString() }),
      (r) => {
        c.freeClaim = r.formValues[0];
        c.requireMoney = r.formValues[1];
        const pr = parseInt(r.formValues[2]);
        if (!isNaN(pr) && pr >= 0) c.pricePerBlock = pr;
        this.saveConfig(c);
        p.sendMessage("§aPrice settings updated!");
      }, () => system.runTimeout(() => this.showAdminMenu(p), 1));
  }
  static async showFeatureSettings(p) {
    const c = this.getConfig();
    this.#form(p, new ModalFormData().title("Feature Settings")
      .toggle("Allow Teleport to Claims", { defaultValue: c.allowTeleport })
      .toggle("Auto Visualize Claims", { defaultValue: c.autoVisualize }),
      (r) => {
        [c.allowTeleport, c.autoVisualize] = r.formValues;
        this.saveConfig(c);
        p.sendMessage("§aFeature settings updated!");
      }, () => system.runTimeout(() => this.showAdminMenu(p), 1));
  }
  static async showSizeSettings(p) {
    const c = this.getConfig();
    this.#form(p, new ModalFormData().title("Size Settings")
      .textField("§eMin Claim Size", "Size...", { defaultValue: c.minClaimSize.toString() })
      .textField("§eMax Claim Size", "Size...", { defaultValue: c.maxClaimSize.toString() })
      .slider("§eMax Claims Per Player", 1, 20, { valueStep: 1, defaultValue: c.maxClaimsPerPlayer })
      .toggle("§eAllow Claim Overlap", { defaultValue: c.allowOverlap }),
      (r) => {
        const [min, max] = [parseInt(r.formValues[0]), parseInt(r.formValues[1])];
        if (isNaN(min) || isNaN(max) || min < 1 || max < min) return p.sendMessage("§cInvalid size values!");
        [c.minClaimSize, c.maxClaimSize, c.maxClaimsPerPlayer, c.allowOverlap] = [min, max, r.formValues[2], r.formValues[3]];
        this.saveConfig(c);
        p.sendMessage("§aSize settings updated!");
      }, () => system.runTimeout(() => this.showAdminMenu(p), 1));
  }
  static async showAdminMenu(p) {
    this.#form(p, new ActionFormData().title("Land System Admin").body("Manage land claim system settings")
      .button("Price Settings\nConfigure costs", "textures/ui/MCoin")
      .button("Size Settings\nSet claim limits", "textures/ui/icon_preview")
      .button("Performance Settings\nOptimize for your device", "textures/ui/icon_staffpicks")
      .button("View Land Claims\nManage all claims", "textures/ui/icon_spring"),
      (r) => system.runTimeout(() => {
        const acts = [
          () => this.showPriceSettings(p),
          () => this.showSizeSettings(p),
          () => this.showPerformanceSettings(p),
          async () => {
            const claims = await LandDatabase.getAllClaims();
            claims.length === 0
              ? (p.sendMessage("§cNo land claims found!"), this.showAdminMenu(p))
              : this.showLandList(p);
          }
        ];
        acts[r.selection]?.();
      }, 1));
  }
  static async showLandList(p) {
    try {
      const claims = await LandDatabase.getAllClaims();
      if (!claims?.length) return p.sendMessage("§cNo land claims found!"), system.runTimeout(() => this.showAdminMenu(p), 1);
      const f = new ActionFormData().title("Land Claim List").body(`§fClaims: §a${claims.length}`);
      claims.forEach(c => {
        if (c && typeof c === "object") f.button(`§e${c.name || "Unnamed"}\n§7${LandDatabase.getPlayerName(c.owner)} §8| §b${this.calcBlocks(c.pos1, c.pos2)}b §8| §a${c.members?.length || 0}m`, "textures/ui/icon_best3");
      });
      this.#form(p, f, (r) => {
        const c = claims[r.selection];
        if (!c) return p.sendMessage("§cInvalid claim!"), system.runTimeout(() => this.showAdminMenu(p), 1);
        this.showClaimDetails(p, c);
      }, () => system.runTimeout(() => this.showAdminMenu(p), 1));
    } catch (e) { console.warn("List:", e); p.sendMessage("§cError loading list!"); system.runTimeout(() => this.showAdminMenu(p), 1); }
  }
  static async showClaimDetails(p, c) {
    try {
      const owner = world.getAllPlayers().find(pl => pl.id === c.owner)?.name || c.owner;
      const mems = c.members || [];
      const mList = mems.map(m => `§7- ${world.getAllPlayers().find(pl => sameMember(m, pl))?.name || m.name || m.id} (${Object.keys(m.permissions).filter(k => m.permissions[k]).join(", ") || "None"})`).join("\n");
      const hList = (c.accessHistory || []).slice(-5).map(h => `§7- ${h.playerName} (${h.action}) on ${new Date(h.timestamp).toLocaleString()}`).join("\n");
      this.#form(p, new ActionFormData().title("Claim Details").body(
        `§e=== Claim Information ===\n§fOwner: §a${owner}\n§fBlocks: §a${this.calcBlocks(c.pos1, c.pos2)}\n§fMembers: §a${mems.length}\n§fStatus: ${c.allowEntry ? "§aOpen" : "§cMembers only"}\n` +
        `§fLoc: §7${c.pos1.x},${c.pos1.y},${c.pos1.z} to ${c.pos2.x},${c.pos2.y},${c.pos2.z}\n\n§fMembers:\n${mList || "§7None"}\n\n§fHistory:\n${hList || "§7None"}`
      ).button("Teleport", "textures/ui/arrow").button("Permissions", "textures/ui/permissions_member_star").button("Entry Settings", "textures/ui/icon_import").button("Remove", "textures/ui/trash").button("Back", "textures/ui/arrow_left"),
        (r) => system.runTimeout(() => {
          [
            () => {
              try {
                p.teleport({ x: (c.pos1.x + c.pos2.x) / 2, y: this.findSafeY((c.pos1.x + c.pos2.x) / 2, (c.pos1.z + c.pos2.z) / 2, Math.max(c.pos1.y, c.pos2.y)), z: (c.pos1.z + c.pos2.z) / 2 });
                p.sendMessage("§aTeleported!");
              } catch { p.sendMessage("§cTeleport failed!"); }
              this.showClaimDetails(p, c);
            },
            () => this.showMemberPermissions(p, c),
            () => this.showEntrySettings(p, c),
            () => this.showRemoveConfirm(p, c),
            () => this.showLandList(p)
          ][r.selection]?.();
        }, 1), () => this.showLandList(p));
    } catch { p.sendMessage("§cError showing details"); this.showLandList(p); }
  }
  static async showMemberPermissions(p, c) {
    const mems = c.members || [];
    if (!mems.length) return p.sendMessage("§cNo members!"), system.runTimeout(() => this.showClaimDetails(p, c), 1);
    const f = new ActionFormData().title("Member Permissions").body("§fSelect member:");
    mems.forEach(m => f.button(`${world.getAllPlayers().find(pl => sameMember(m, pl))?.name || m.name || m.id}\n${Object.keys(m.permissions).filter(k => m.permissions[k]).join(", ") || "None"}`, "textures/ui/permissions_member"));
    f.button("Back", "textures/ui/arrow_left");
    this.#form(p, f, (r) => r.selection === mems.length ? system.runTimeout(() => this.showClaimDetails(p, c), 1) : this.editMemberPerms(p, c, mems[r.selection]), () => system.runTimeout(() => this.showClaimDetails(p, c), 1));
  }
  static async editMemberPerms(p, c, m) {
    this.#form(p, new ModalFormData().title("Edit Permissions")
      .toggle("Break", { defaultValue: m.permissions.break }).toggle("Place", { defaultValue: m.permissions.place }).toggle("Interact", { defaultValue: m.permissions.interact }).toggle("Farm", { defaultValue: m.permissions.farm ?? false }).toggle("Entry", { defaultValue: m.permissions.entry }),
      (r) => {
        const upd = { ...c, members: c.members.map(mem => sameMember(mem, m) ? { ...mem, permissions: { ...mem.permissions, break: r.formValues[0], place: r.formValues[1], interact: r.formValues[2], farm: r.formValues[3], entry: r.formValues[4] } } : mem) };
        LandDatabase.updateClaim(c.claimId, upd).then((ok) => {
          ok ? p.sendMessage(`§aPermissions updated for ${world.getAllPlayers().find(pl => sameMember(m, pl))?.name || m.name || m.id}`) : p.sendMessage("§cUpdate failed!");
          system.runTimeout(() => this.showMemberPermissions(p, c), 1);
        });
      }, () => system.runTimeout(() => this.showMemberPermissions(p, c), 1));
  }
  static async showRemoveConfirm(p, c) {
    this.#form(p, new ModalFormData().title("Remove Claim").textField("Type 'CONFIRM':", "CONFIRM", { defaultValue: "" }).toggle("§cConfirm deletion", { defaultValue: false }),
      (r) => {
        if (r.formValues[0] === "CONFIRM" && r.formValues[1]) {
          LandDatabase.removeClaim(c.claimId).then((ok) => {
            ok ? (p.sendMessage("§aClaim removed!"), this.showLandList(p)) : (p.sendMessage("§cRemove failed!"), system.runTimeout(() => this.showClaimDetails(p, c), 1));
          });
        } else system.runTimeout(() => this.showClaimDetails(p, c), 1);
      }, () => system.runTimeout(() => this.showClaimDetails(p, c), 1));
  }
  static async showEntrySettings(p, c) {
    this.#form(p, new ModalFormData().title("Entry Settings").toggle("Allow all players", { defaultValue: c.allowEntry ?? false }),
      (r) => {
        LandDatabase.updateClaim(c.claimId, { ...c, allowEntry: r.formValues[0] }).then((ok) => {
          ok ? p.sendMessage(`§aEntry settings updated! ${r.formValues[0] ? "All allowed" : "Members only"}`) : p.sendMessage("§cUpdate failed!");
          system.runTimeout(() => this.showClaimDetails(p, c), 1);
        });
      }, () => system.runTimeout(() => this.showClaimDetails(p, c), 1));
  }
  static findSafeY(x, z, maxY) {
    try {
      const dim = world.getDimension("overworld");
      for (let y = Math.min(maxY + 1, 319); y > -64; y--) {
        const [b, c, a] = [dim.getBlock({ x, y: y - 1, z }), dim.getBlock({ x, y, z }), dim.getBlock({ x, y: y + 1, z })];
        if (this.isSolid(b) && !this.isHazard(b) && !this.isSolid(c) && !this.isSolid(a)) return y;
      }
      return maxY + 1;
    } catch { return maxY + 1; }
  }
  static isSolid(b) { return b && !this.#nonSolid.some(id => b.typeId.includes(id)); }
  static isHazard(b) { return b && this.#hazard.some(id => b.typeId.includes(id)); }
}
system.afterEvents.scriptEventReceive.subscribe((e) => {
  if (e.id === "landsystem:init" && isMemberFeatureEnabled("claimLand")) LandConfig.initScoreboard();
});
system.runTimeout(() => LandConfig.cleanupDisplayScoreboard(), 20);
world.afterEvents.playerSpawn.subscribe(({ initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    LandConfig.cleanupDisplayScoreboard();
    if (isMemberFeatureEnabled("claimLand")) LandConfig.syncDisplayScoreboard();
  }, 10);
});
world.afterEvents.playerLeave?.subscribe?.(() => system.runTimeout(() => LandConfig.cleanupDisplayScoreboard(), 5));
export function AdminLandConfig(p) {
  if (!p?.hasTag?.("admin")) {
    p?.sendMessage("§cAdmin permission required to open Land System settings.");
    return;
  }
  return LandConfig.showAdminMenu(p);
}
