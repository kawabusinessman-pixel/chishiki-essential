import { world, ActionFormData, ModalFormData } from "../../../core.js";
import { addMoney } from "../../../function/moneySystem.js";
import { GlobalConfig } from "../../../function/GlobalConfig.js";
const CONFIG = {
 TAG: { VOTE: "vote", ADMIN: "admin" },
 PROP: { TOTAL_VOTES: "totalServerVotes", REWARDS: "voteRewards" },
 MSG: {
 ALREADY_VOTED: "§cYou have already voted today!",
 SUCCESS: "§aThank you for voting!",
 REWARD_GIVEN: "§eYou received: ",
 CLOSED: "§7Menu closed.",
 NO_PERM: "§cYou don't have permission to access this.",
 RESET_DONE: "§aReset {count} vote(s).",
 NO_VOTERS: "<No voters today>",
 REWARDS_UPDATED: "§aVote rewards updated successfully!"
 },
 UI: {
 TITLE: "Vote Menu",
 BODY: "Support the server by voting!\n\nEarn special rewards for each vote.",
 ADMIN_TITLE: "Vote Management",
 BTN_VOTE: "Vote Now",
 BTN_CLOSE: "Close"
 },
 ICON: { CONFIRM: "textures/ui/confirm", CANCEL: "textures/ui/cancel" }
};
const DEFAULT_REWARDS = {
 money: 0,
 items: [],
 xp: 0,
 commands: []
};
class VoteSystem {
 static hasVoted = (p) => p.hasTag(CONFIG.TAG.VOTE);
 static isAdmin = (p) => p.hasTag(CONFIG.TAG.ADMIN);
 static getTotalVotes() {
 try {
 const total = GlobalConfig.get(CONFIG.PROP.TOTAL_VOTES);
 return total ? parseInt(total) : 0;
 } catch (e) {
 console.warn("Failed to get total votes:", e);
 return 0;
 }
 }
 static incrementTotalVotes() {
 try {
 const current = this.getTotalVotes();
 GlobalConfig.set(CONFIG.PROP.TOTAL_VOTES, (current + 1).toString());
 return current + 1;
 } catch (e) {
 console.warn("Failed to increment total votes:", e);
 return 0;
 }
 }
 static getVotedPlayers() {
 try {
 return world.getPlayers().filter(p => this.hasVoted(p)).map(p => p.name);
 } catch (e) {
 console.warn("Failed to get voters:", e);
 return [];
 }
 }
 static resetVotes() {
 try {
 const players = world.getPlayers().filter(p => this.hasVoted(p));
 players.forEach(p => p.removeTag(CONFIG.TAG.VOTE));
 return players.length;
 } catch (e) {
 console.warn("Failed to reset votes:", e);
 return 0;
 }
 }
 static markVoted(p) {
 try {
 p.addTag(CONFIG.TAG.VOTE);
 this.incrementTotalVotes();
 return true;
 } catch (e) {
 console.warn("Failed to mark vote:", e);
 return false;
 }
 }
 static getRewards() {
 try {
 const saved = GlobalConfig.get(CONFIG.PROP.REWARDS);
 if (saved) {
 return typeof saved === "string" ? JSON.parse(saved) : saved;
 }
 } catch (e) {
 console.warn("Failed to get rewards:", e);
 }
 return { ...DEFAULT_REWARDS };
 }
 static saveRewards(rewards) {
 try {
 GlobalConfig.set(CONFIG.PROP.REWARDS, rewards);
 return true;
 } catch (e) {
 console.warn("Failed to save rewards:", e);
 return false;
 }
 }
 static giveRewards(player) {
 try {
 const rewards = this.getRewards();
 const rewardMessages = [];
 if (rewards.money && rewards.money > 0) {
 if (addMoney(player, rewards.money)) {
 rewardMessages.push(`§a$${rewards.money}`);
 }
 }
 if (rewards.items && Array.isArray(rewards.items)) {
 for (const itemData of rewards.items) {
 if (itemData.item && itemData.amount > 0) {
 try {
 player.runCommand(`give @s ${itemData.item} ${itemData.amount}`);
 rewardMessages.push(`§e${itemData.amount}x ${itemData.item}`);
 } catch (e) {
 console.warn(`Failed to give item ${itemData.item}:`, e);
 }
 }
 }
 }
 if (rewards.xp && rewards.xp > 0) {
 try {
 player.runCommand(`xp ${rewards.xp} @s`);
 rewardMessages.push(`§b${rewards.xp} XP`);
 } catch (e) {
 console.warn("Failed to give XP:", e);
 }
 }
 if (rewards.commands && Array.isArray(rewards.commands)) {
 for (const cmd of rewards.commands) {
 if (cmd && cmd.trim()) {
 try {
 player.runCommand(cmd.replace(/@p/g, "@s"));
 } catch (e) {
 console.warn(`Failed to execute command ${cmd}:`, e);
 }
 }
 }
 }
 if (rewardMessages.length > 0) {
 player.sendMessage(CONFIG.MSG.REWARD_GIVEN);
 rewardMessages.forEach(msg => player.sendMessage(" " + msg));
 }
 try {
 player.runCommand("playsound random.levelup @s ~~~ 1 1");
 player.runCommand("particle minecraft:totem_particle ~~~");
 } catch (e) {
 console.warn("Failed to play effects:", e);
 }
 return true;
 } catch (e) {
 console.warn("Failed to give rewards:", e);
 return false;
 }
 }
}
function vote(player) {
 if (!player) return console.warn("Invalid player object");
 if (VoteSystem.hasVoted(player)) return player.sendMessage(CONFIG.MSG.ALREADY_VOTED);
 const rewards = VoteSystem.getRewards();
 let rewardPreview = "\n\n§6Rewards:";
 let hasRewards = false;
 if (rewards.money > 0) {
 rewardPreview += `\n§a• $${rewards.money}`;
 hasRewards = true;
 }
 if (rewards.items && rewards.items.length > 0) {
 rewards.items.forEach(item => {
 rewardPreview += `\n§e• ${item.amount}x ${item.item}`;
 });
 hasRewards = true;
 }
 if (rewards.xp > 0) {
 rewardPreview += `\n§b• ${rewards.xp} XP`;
 hasRewards = true;
 }
 if (!hasRewards) {
 rewardPreview += "\n§7No rewards configured yet.";
 }
 new ActionFormData()
 .title(CONFIG.UI.TITLE)
 .body(CONFIG.UI.BODY + rewardPreview)
 .button(CONFIG.UI.BTN_VOTE, CONFIG.ICON.CONFIRM)
 .button(CONFIG.UI.BTN_CLOSE, CONFIG.ICON.CANCEL)
 .show(player)
 .then(res => {
 if (res.canceled) return;
 if (res.selection === 0) {
 if (VoteSystem.markVoted(player)) {
 player.sendMessage(CONFIG.MSG.SUCCESS);
 VoteSystem.giveRewards(player);
 }
 } else {
 player.sendMessage(CONFIG.MSG.CLOSED);
 }
 })
 .catch(e => console.warn("Vote form error:", e));
}
function showVoteAdminMenu(admin) {
 if (!admin) return console.warn("Invalid admin object");
 if (!VoteSystem.isAdmin(admin)) return admin.sendMessage(CONFIG.MSG.NO_PERM);
 const voters = VoteSystem.getVotedPlayers();
 const totalVotes = VoteSystem.getTotalVotes();
 const rewards = VoteSystem.getRewards();
 let rewardSummary = "§6Current Rewards:\n";
 let hasRewards = false;
 if (rewards.money > 0) {
 rewardSummary += `§a• Money: $${rewards.money}\n`;
 hasRewards = true;
 }
 if (rewards.items && rewards.items.length > 0) {
 rewardSummary += `§e• Items: ${rewards.items.length} types\n`;
 hasRewards = true;
 }
 if (rewards.xp > 0) {
 rewardSummary += `§b• XP: ${rewards.xp}\n`;
 hasRewards = true;
 }
 if (rewards.commands && rewards.commands.length > 0) {
 rewardSummary += `§d• Commands: ${rewards.commands.length}\n`;
 hasRewards = true;
 }
 if (!hasRewards) {
 rewardSummary += "§c• No rewards configured!\n§7Click 'Configure Rewards' to set up.\n";
 }
 new ActionFormData()
 .title(CONFIG.UI.ADMIN_TITLE)
 .body(
 `§7Total Votes (All Time): §a${totalVotes}\n` +
 `§7Votes Today: §e${voters.length}\n\n` +
 rewardSummary
 )
 .button("§6Configure Rewards\n§r§8Customize vote rewards", "textures/ui/gift_square")
 .button("§eView Voters\n§r§8See who voted today", "textures/ui/book_metatag_default")
 .button("§cReset Daily Votes\n§r§8Clear today's votes", "textures/ui/refresh")
 .button("§7Close", "textures/ui/cancel")
 .show(admin)
 .then(res => {
 if (res.canceled) return;
 switch (res.selection) {
 case 0:
 showRewardConfigMenu(admin);
 break;
 case 1:
 showVotersListMenu(admin);
 break;
 case 2:
 confirmResetVotes(admin);
 break;
 }
 })
 .catch(e => console.warn("Admin form error:", e));
}
function showVotersListMenu(admin) {
 const voters = VoteSystem.getVotedPlayers();
 const list = voters.length ? voters : [CONFIG.MSG.NO_VOTERS];
 new ModalFormData()
 .title("Voters Today")
 .textField("§eTotal Voters", voters.length.toString(), { defaultValue: voters.length.toString() })
 .dropdown("§bPlayers who voted today:", list, { defaultValue: 0 })
 .show(admin)
 .then(res => {
 if (!res.canceled) {
 showVoteAdminMenu(admin);
 }
 })
 .catch(e => console.warn("Voters list error:", e));
}
function confirmResetVotes(admin) {
 const voters = VoteSystem.getVotedPlayers();
 new ModalFormData()
 .title("Reset Daily Votes")
 .toggle(`§cReset ${voters.length} vote(s)?`, { defaultValue: false })
 .show(admin)
 .then(res => {
 if (res.canceled) {
 showVoteAdminMenu(admin);
 return;
 }
 if (res.formValues[0] && voters.length) {
 const count = VoteSystem.resetVotes();
 admin.sendMessage(CONFIG.MSG.RESET_DONE.replace("{count}", count));
 }
 showVoteAdminMenu(admin);
 })
 .catch(e => console.warn("Reset confirmation error:", e));
}
function showRewardConfigMenu(admin) {
 const rewards = VoteSystem.getRewards();
 new ActionFormData()
 .title("Configure Vote Rewards")
 .body("§7Select what you want to configure:")
 .button("§aMoney Reward\n§r§8Set money amount", "textures/items/emerald")
 .button("§eItem Rewards\n§r§8Configure items", "textures/items/diamond")
 .button("§bXP Reward\n§r§8Set XP amount", "textures/items/experience_bottle")
 .button("§dCustom Commands\n§r§8Add command rewards", "textures/blocks/command_block")
 .button("§cReset to Default\n§r§8Restore default rewards", "textures/ui/refresh")
 .button("§7Back", "textures/ui/arrow_left")
 .show(admin)
 .then(res => {
 if (res.canceled) {
 showVoteAdminMenu(admin);
 return;
 }
 switch (res.selection) {
 case 0:
 editMoneyReward(admin);
 break;
 case 1:
 editItemRewards(admin);
 break;
 case 2:
 editXPReward(admin);
 break;
 case 3:
 editCommandRewards(admin);
 break;
 case 4:
 resetToDefaultRewards(admin);
 break;
 case 5:
 showVoteAdminMenu(admin);
 break;
 }
 })
 .catch(e => console.warn("Reward config error:", e));
}
function editMoneyReward(admin) {
 const rewards = VoteSystem.getRewards();
 new ModalFormData()
 .title("Money Reward")
 .textField("§aMoney Amount", "1000", { defaultValue: rewards.money.toString() })
 .show(admin)
 .then(res => {
 if (res.canceled) {
 showRewardConfigMenu(admin);
 return;
 }
 const amount = parseInt(res.formValues[0]) || 0;
 rewards.money = amount;
 VoteSystem.saveRewards(rewards);
 admin.sendMessage(CONFIG.MSG.REWARDS_UPDATED);
 showRewardConfigMenu(admin);
 })
 .catch(e => console.warn("Edit money error:", e));
}
function editItemRewards(admin) {
 const rewards = VoteSystem.getRewards();
 const itemsStr = rewards.items.map(i => `${i.item},${i.amount}`).join(";");
 new ModalFormData()
 .title("Item Rewards")
 .textField(
 "§eItem List\n§r§7Format: item,amount;item,amount\n§r§7Example: diamond,5;emerald,3",
 "diamond,5;emerald,3",
 { defaultValue: itemsStr || "diamond,5" }
 )
 .show(admin)
 .then(res => {
 if (res.canceled) {
 showRewardConfigMenu(admin);
 return;
 }
 const itemsInput = res.formValues[0];
 const items = itemsInput.split(";").map(s => {
 const [item, amount] = s.split(",");
 return { item: item.trim(), amount: parseInt(amount) || 1 };
 }).filter(i => i.item);
 rewards.items = items;
 VoteSystem.saveRewards(rewards);
 admin.sendMessage(CONFIG.MSG.REWARDS_UPDATED);
 showRewardConfigMenu(admin);
 })
 .catch(e => console.warn("Edit items error:", e));
}
function editXPReward(admin) {
 const rewards = VoteSystem.getRewards();
 new ModalFormData()
 .title("XP Reward")
 .textField("§bXP Amount", "100", { defaultValue: rewards.xp.toString() })
 .show(admin)
 .then(res => {
 if (res.canceled) {
 showRewardConfigMenu(admin);
 return;
 }
 const amount = parseInt(res.formValues[0]) || 0;
 rewards.xp = amount;
 VoteSystem.saveRewards(rewards);
 admin.sendMessage(CONFIG.MSG.REWARDS_UPDATED);
 showRewardConfigMenu(admin);
 })
 .catch(e => console.warn("Edit XP error:", e));
}
function editCommandRewards(admin) {
 const rewards = VoteSystem.getRewards();
 const commandsStr = rewards.commands.join("\n");
 new ModalFormData()
 .title("Custom Commands")
 .textField(
 "§dCommand List\n§r§7One command per line\n§r§7Use @s for the player\n§r§7Example: effect @s speed 30 1",
 "effect @s speed 30 1",
 { defaultValue: commandsStr || "" }
 )
 .show(admin)
 .then(res => {
 if (res.canceled) {
 showRewardConfigMenu(admin);
 return;
 }
 const commandsInput = res.formValues[0];
 const commands = commandsInput.split("\n").map(c => c.trim()).filter(c => c);
 rewards.commands = commands;
 VoteSystem.saveRewards(rewards);
 admin.sendMessage(CONFIG.MSG.REWARDS_UPDATED);
 showRewardConfigMenu(admin);
 })
 .catch(e => console.warn("Edit commands error:", e));
}
function resetToDefaultRewards(admin) {
 new ModalFormData()
 .title("Reset to Default")
 .toggle("§cReset all rewards to default?", { defaultValue: false })
 .show(admin)
 .then(res => {
 if (res.canceled || !res.formValues[0]) {
 showRewardConfigMenu(admin);
 return;
 }
 VoteSystem.saveRewards(DEFAULT_REWARDS);
 admin.sendMessage("§aRewards reset to default!");
 showRewardConfigMenu(admin);
 })
 .catch(e => console.warn("Reset default error:", e));
}
export { vote, showVoteAdminMenu };
