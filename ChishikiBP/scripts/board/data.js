import { Database } from "../function/Database.js";
import { world } from "../core.js";

const LINES_PROP = "kiw:scoreboard_lines";

const ScoreboardDB = new Database("ScoreboardDB");
const RankDB = new Database("RankDB");
const ClanDB = new Database("ClanDB");
const ChatDB = new Database("ChatDB");
const NametagDB = new Database("NametagDB");
const PlaceholderDB = new Database("PlaceholderDB");

class ScoreboardLinesDB {
 get(key) {
 if (key !== "lines") return undefined;
 try {
 const raw = world.getDynamicProperty(LINES_PROP);
 if (!raw) return undefined;
 return JSON.parse(raw);
 } catch {
 return undefined;
 }
 }
 set(key, value) {
 if (key !== "lines") return;
 try {
 world.setDynamicProperty(LINES_PROP, JSON.stringify(value));
 } catch (e) {
 console.warn("[ScoreboardLines] Error saving lines:", e);
 }
 }
 clear() {
 try {
 world.setDynamicProperty(LINES_PROP, undefined);
 } catch { }
 }
}

const ScoreboardLines = new ScoreboardLinesDB();

export { ScoreboardDB, RankDB, ClanDB, ChatDB, NametagDB, PlaceholderDB, ScoreboardLines };