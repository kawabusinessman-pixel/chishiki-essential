import { MessageFormData } from "../../core.js"
import { Lang } from "../../lib/Lang.js"
export function showClanInfoMenu(player) {
 const form = new MessageFormData()
 .title(Lang.t(player, "clan.docs.title"))
 .body(Lang.t(player, "clan.docs.body"))
 .button1(Lang.t(player, "clan.common.close"))
 .button2(Lang.t(player, "clan.common.back"))
 form.show(player).then(res => {
 if (res.selection === 1) {
 import("./clan.js").then(mod => mod.showClanMenu(player))
 }
 })
}
