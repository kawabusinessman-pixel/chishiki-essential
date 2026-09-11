import { Lang } from "../lib/Lang.js";
export function showChangelog(source) {
 const msg = Lang.t(source, "info.changelog.msg");
 source.runCommand(`tellraw @s {"rawtext":[{"text":"${msg}"}]}`);
}
