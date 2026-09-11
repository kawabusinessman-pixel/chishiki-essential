import { system, world, ActionFormData, ModalFormData } from "../core.js";
import { addMoney } from "../function/moneySystem.js";
import { ForceOpen } from "../function/ForceOpen.js";
import { Database } from "../function/Database.js";
const gameDB = Database.getDatabase("chatGames");
const rewardsDB = Database.getDatabase("chatGameRewards");
const DEFAULT_CONFIG = {
 enabled: false,
 autoInterval: 300,
 rewards: { money: 1000 },
 words: ["minecraft", "creeper", "diamond", "redstone", "enderdragon", "nether", "portal", "zombie", "skeleton", "spider"],
};
let gameState = { active: false, currentWord: "", scrambledWord: "", startTime: 0, participants: new Set(), winner: null };
let autoGameInterval = null;
let gameTimeout = null;
let gameRoundId = 0;
const Config = {
 load() {
 try {
 const conf = { ...DEFAULT_CONFIG, ...gameDB.get("config", DEFAULT_CONFIG) };
 const rewards = rewardsDB.get("rewards", {});
 if (Object.keys(rewards).length > 0) conf.rewards = { ...conf.rewards, ...rewards };
 return conf;
 } catch { return DEFAULT_CONFIG; }
 },
 save(config) {
 try {
 gameDB.set("config", config);
 const { money, ...custom } = config.rewards || {};
 if (Object.keys(custom).length > 0) rewardsDB.set("rewards", custom);
 return true;
 } catch { return false; }
 }
};
function scrambleWord(word) {
 const arr = word.split("");
 for (let i = arr.length - 1; i > 0; i--) {
 const j = Math.floor(Math.random() * (i + 1));
 [arr[i], arr[j]] = [arr[j], arr[i]];
 }
 return arr.join("");
}
function giveRewards(player, rewards) {
 try {
 if (rewards.money) addMoney(player, rewards.money);
 if (rewards.xp) player.runCommand(`xp ${rewards.xp} @s`);
 if (rewards.items) Object.entries(rewards.items).forEach(([id, qty]) => player.runCommand(`give @s ${id} ${qty}`));
 if (rewards.commands) rewards.commands.forEach(cmd => player.runCommand(cmd.replace("@p", "@s")));
 } catch { }
}
function broadcast(msg, sound) {
 world.getPlayers().forEach(p => {
 p.sendMessage(msg);
 if (sound) try { p.playSound(sound); } catch { }
 });
}
function startChatGame() {
 if (gameState.active) return false;
 const config = Config.load();
 if (!config.enabled || !config.words.length) return false;
 const word = config.words[Math.floor(Math.random() * config.words.length)].toLowerCase();
 gameRoundId += 1;
 const currentRoundId = gameRoundId;
 gameState = {
 active: true,
 currentWord: word,
 scrambledWord: scrambleWord(word),
 startTime: Date.now(),
 participants: new Set(),
 winner: null
 };
 if (gameTimeout) {
 system.clearRun(gameTimeout);
 gameTimeout = null;
 }
 broadcast(`§e=== WORD GUESSING GAME STARTED ===\n§fGuess the word: §a${gameState.scrambledWord}\n§fReward: §6$${config.rewards.money}`, "note.pling");
 gameTimeout = system.runTimeout(() => {
 if (gameState.active && gameRoundId === currentRoundId) endChatGame(false);
 }, 1200);
 return true;
}
function endChatGame(hasWinner) {
 if (!gameState.active) return;
 if (gameTimeout) {
 system.clearRun(gameTimeout);
 gameTimeout = null;
 }
 gameState.active = false;
 if (hasWinner && gameState.winner) {
 const winner = gameState.winner;
 const winnerName = winner.name;
 const answer = gameState.currentWord;
 const rewards = Config.load().rewards;
 // chatSend is a before event; defer world mutations until the next tick.
 system.run(() => giveRewards(winner, rewards));
 broadcast(`§e=== GAME COMPLETED ===\n§aWinner: §f${winnerName}\n§fAnswer: §a${answer}`, "random.levelup");
 } else {
 broadcast(`§e=== TIME'S UP ===\n§fAnswer: §a${gameState.currentWord}`, "note.bass");
 }
}
function startAutoGame() {
 const config = Config.load();
 if (!config.enabled) return;
 if (autoGameInterval) system.clearRun(autoGameInterval);
 autoGameInterval = system.runInterval(() => {
 if (Config.load().enabled && !gameState.active) startChatGame();
 }, config.autoInterval * 20);
}
function stopAutoGame() {
 if (autoGameInterval) { system.clearRun(autoGameInterval); autoGameInterval = null; }
}
world.beforeEvents.chatSend.subscribe((ev) => {
 if (gameState.active) {
 if (ev.message.toLowerCase().trim() === gameState.currentWord) {
 gameState.winner = ev.sender;
 endChatGame(true);
 ev.cancel = true;
 } else {
 gameState.participants.add(ev.sender.name);
 }
 }
});
export async function showChatGamesMenu(player) {
 try {
 const config = Config.load();
 const body = `§e=== WORD GUESSING GAME ADMIN ===\n\n§fStatus: ${config.enabled ? "§aEnabled" : "§cDisabled"}\n§fAuto Interval: §b${config.autoInterval}s\n§fReward: §6$${config.rewards.money}\n§fTotal Words: §a${config.words.length}\n${gameState.active ? `\n§6Running: §a${gameState.scrambledWord}` : ""}`;
 const res = await ForceOpen(player, new ActionFormData().simpleUi()
 .title("Word Guessing Game")
 .body(body)
 .button(config.enabled ? "§cDisable" : "§aEnable", config.enabled ? "textures/ui/toggle_on" : "textures/ui/toggle_off")
 .button("§bSettings", "textures/ui/gear")
 .button("§6Rewards", "textures/ui/gift_square")
 .button("§eWords", "textures/ui/book_edit_default")
 .button("§aStart Manual", "textures/ui/green")
 .button(gameState.active ? "§cStop" : "§8Stop", "textures/ui/cancel"));
 if (res.canceled) return;
 const actions = [
 async () => {
 config.enabled = !config.enabled;
 if (Config.save(config)) {
 config.enabled ? startAutoGame() : (stopAutoGame(), gameState.active && endChatGame(false));
 player.sendMessage(config.enabled ? "§aGame Enabled!" : "§cGame Disabled!");
 }
 showChatGamesMenu(player);
 },
 () => configureSettings(player),
 () => manageCustomRewards(player),
 () => manageWords(player),
 () => {
 if (gameState.active) player.sendMessage("§cGame running!");
 else if (config.enabled && startChatGame()) player.sendMessage("§aStarted!");
 else player.sendMessage("§cEnable game first!");
 showChatGamesMenu(player);
 },
 () => {
 if (!gameState.active) player.sendMessage("§cNo game running!");
 else { endChatGame(false); player.sendMessage("§aStopped!"); }
 showChatGamesMenu(player);
 }
 ];
 actions[res.selection]();
 } catch { player.sendMessage("§cMenu Error"); }
}
async function configureSettings(player) {
 const config = Config.load();
 const res = await ForceOpen(player, new ModalFormData()
 .title("Settings")
 .slider("Interval (s)", 60, 1800, { valueStep: 1, defaultValue: config.autoInterval })
 .textField("Money Reward", "Amount", { defaultValue: config.rewards.money.toString() }));
 if (res.canceled) return showChatGamesMenu(player);
 const [interval, money] = res.formValues;
 if (isNaN(parseInt(money)) || parseInt(money) < 0) return player.sendMessage("§cInvalid money!") || configureSettings(player);
 config.autoInterval = interval;
 config.rewards.money = parseInt(money);
 if (Config.save(config)) {
 if (config.enabled) { stopAutoGame(); startAutoGame(); }
 player.sendMessage("§aSaved!");
 }
 showChatGamesMenu(player);
}
async function manageCustomRewards(player) {
 const config = Config.load();
 const r = rewardsDB.get("rewards", {});
 const body = `§e=== REWARDS ===\nMoney: §6$${config.rewards.money}\nXP: §b${r.xp || 0}\nItems: §b${Object.keys(r.items || {}).length}\nCmds: §b${(r.commands || []).length}`;
 const res = await ForceOpen(player, new ActionFormData().simpleUi().title("Rewards").body(body)
 .button("Add XP", "textures/items/experience_bottle")
 .button("Add Item", "textures/ui/inventory_icon")
 .button("Add Cmd", "textures/blocks/command_block")
 .button("Clear All", "textures/ui/trash")
 .button("Back", "textures/ui/arrow_left"));
 if (res.canceled || res.selection === 4) return showChatGamesMenu(player);
 const handlers = [
 async () => {
 const f = await ForceOpen(player, new ModalFormData().title("Add XP").textField("Amount", "XP"));
 if (f.canceled) return manageCustomRewards(player);
 const xp = parseInt(f.formValues[0]);
 if (isNaN(xp) || xp < 0) return player.sendMessage("§cInvalid XP!");
 r.xp = xp; rewardsDB.set("rewards", r); manageCustomRewards(player);
 },
 async () => {
 const f = await ForceOpen(player, new ModalFormData().title("Add Item").textField("ID", "minecraft:stone").textField("Qty", "1"));
 if (f.canceled) return manageCustomRewards(player);
 const [id, qty] = f.formValues;
 if (!id || isNaN(parseInt(qty)) || parseInt(qty) < 1) return player.sendMessage("§cInvalid!");
 if (!r.items) r.items = {}; r.items[id] = parseInt(qty);
 rewardsDB.set("rewards", r); manageCustomRewards(player);
 },
 async () => {
 const f = await ForceOpen(player, new ModalFormData().title("Add Cmd").textField("Command", "say Hi @p"));
 if (f.canceled) return manageCustomRewards(player);
 if (!f.formValues[0].trim()) return player.sendMessage("§cEmpty!");
 if (!r.commands) r.commands = []; r.commands.push(f.formValues[0].trim());
 rewardsDB.set("rewards", r); manageCustomRewards(player);
 },
 async () => {
 const f = await ForceOpen(player, new ActionFormData().simpleUi().title("Clear?").body("Clear custom rewards?").button("Yes").button("No"));
 if (!f.canceled && f.selection === 0) { rewardsDB.set("rewards", {}); player.sendMessage("§aCleared!"); }
 manageCustomRewards(player);
 }
 ];
 handlers[res.selection]();
}
async function manageWords(player) {
 const config = Config.load();
 const body = `§e=== WORDS (${config.words.length}) ===\n${config.words.slice(0, 8).map((w, i) => `${i + 1}. ${w}`).join("\n")}${config.words.length > 8 ? "\n..." : ""}`;
 const res = await ForceOpen(player, new ActionFormData().simpleUi().title("Words").body(body)
 .button("Add", "textures/ui/color_plus")
 .button("Remove", "textures/ui/trash")
 .button("View All", "textures/ui/book_edit_default")
 .button("Reset", "textures/ui/refresh_light")
 .button("Back", "textures/ui/arrow_left"));
 if (res.canceled || res.selection === 4) return showChatGamesMenu(player);
 const handlers = [
 async () => {
 const f = await ForceOpen(player, new ModalFormData().title("Add").textField("Word", "min 3 chars"));
 if (f.canceled) return manageWords(player);
 const w = f.formValues[0].toLowerCase().trim();
 if (w.length < 3 || config.words.includes(w)) return player.sendMessage("§cInvalid/Duplicate!");
 config.words.push(w); Config.save(config); manageWords(player);
 },
 async () => {
 if (!config.words.length) return manageWords(player);
 const f = await ForceOpen(player, new ModalFormData().title("Remove").dropdown("Word", config.words));
 if (f.canceled) return manageWords(player);
 config.words.splice(f.formValues[0], 1); Config.save(config); manageWords(player);
 },
 async () => {
 await ForceOpen(player, new ActionFormData().simpleUi().title("All Words").body(config.words.map((w, i) => `${i + 1}. ${w}`).join("\n")).button("Back"));
 manageWords(player);
 },
 async () => {
 const f = await ForceOpen(player, new ActionFormData().simpleUi().title("Reset?").body("Reset to default?").button("Yes").button("No"));
 if (!f.canceled && f.selection === 0) { config.words = [...DEFAULT_CONFIG.words]; Config.save(config); }
 manageWords(player);
 }
 ];
 handlers[res.selection]();
}
system.runTimeout(() => { if (Config.load().enabled) startAutoGame(); }, 100);
const handleChatGamesMenu = showChatGamesMenu;
export { startChatGame, endChatGame, gameState, handleChatGamesMenu };
