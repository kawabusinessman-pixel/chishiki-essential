import { world, ActionFormData, uiTitle } from "./core"
import { Lang } from "./lib/Lang.js"



const MAIN_MENU_BUTTONS = [
 { key: "menu.items", icon: "textures/icon_custom/gfc_wall_trophy" },
 { key: "menu.set_time", icon: "textures/icon_custom/gfc_wall_clock" },
 { key: "menu.vanish", icon: "textures/items/potion_bottle_invisibility" },
 { key: "menu.scoreboard", icon: "textures/icon_custom/gold_ingot" },
 { key: "menu.eliminate", icon: "textures/icon_custom/hammer" },
 { key: "menu.fake_action", icon: "textures/ui/enable_editor" },
 { key: "menu.set_spawn", icon: "textures/ui/saleribbon" },
 { key: "menu.player", icon: "textures/ui/Friend2" },
 { key: "menu.rank", icon: "textures/ui/icon_best3" },
 { key: "menu.gamemode", icon: "textures/ui/mashup_world" },
 { key: "menu.member", icon: "textures/ui/controller_glyph_color" },
 { key: "menu.broadcast", icon: "textures/icon_custom/broadcast" },
 { key: "menu.gamerule", icon: "textures/icon_custom/buku" },
 { key: "menu.fake_chat", icon: "textures/ui/comment" },
 { key: "menu.warps_set", icon: "textures/ui/subscription_glyph_color" },
 { key: "menu.board_set", icon: "textures/ui/gear" },
 { key: "menu.view_report", icon: "textures/items/flow_armor_trim_smithing_template" },
 { key: "menu.floating_txt", icon: "textures/ui/new_offer_symbol" },
 { key: "menu.chat_set", icon: "textures/ui/mute_off" },
 { key: "menu.member_set", icon: "textures/ui/controller_glyph_color" },
 { key: "menu.chat_games", icon: "textures/ui/hanging_sign_bamboo" },
 { key: "menu.npc_system", icon: "textures/icon_custom/gfc_plushie_goose" },
 { key: "menu.clear_lag", icon: "textures/ui/icon_iron_pickaxe" },
 { key: "menu.custom_item", icon: "textures/ui/Add-Ons_Nav_Icon36x36" },
 { key: "menu.server_opt", icon: "textures/items/coast_armor_trim_smithing_template" },
 { key: "menu.afk_config", icon: "textures/icon_custom/q_puppet" },
 { key: "menu.lobby_prtct", icon: "textures/icon_custom/lobby_prtoct" },
 { key: "menu.cstm_button", icon: "textures/ui/csb_faq_fox" },
 { key: "menu.ore_gnrtr", icon: "textures/blocks/diamond_ore" },
 { key: "menu.xray_log", icon: "textures/ui/button_custom/air-block_128-63725" },
 { key: "menu.ban_item", icon: "textures/ui/icon_lock" },
 { key: "menu.player_log", icon: "textures/ui/icon_steve" },
 { key: "menu.whitelist", icon: "textures/ui/button_custom/settings" },
 { key: "menu.login", icon: "textures/ui/icon_lock" },
 { key: "menu.afk_zone", icon: "textures/ui/accessibility_glyph_color" },
 { key: "menu.language", icon: "textures/ui/language_glyph_color" },
 { key: "menu.custom_cmds", icon: "textures/ui/icon_bookshelf" },
 { key: "menu.all_stacker", icon: "textures/ui/automation_glyph_color" }
];

function createKiworaFormFactory() {
 return function (player) {
 
 const dim = player.dimension.id.replace("minecraft:", "").toLowerCase();
 const onlineCount = [...world.getPlayers()].length;
 const statsText = `§7${player.name} §r| §7dim: ${dim} §r| §a${onlineCount}§7 online`;

 const form = new ActionFormData()
 .title(uiTitle("adminMenu", "§fChishiki Essential"))
 .body(statsText);

 for (const button of MAIN_MENU_BUTTONS) {
 form.button(Lang.t(player, button.key).toLowerCase(), button.icon);
 }

 return form;
 }
}

function createKillFormFactory() {
 return function (player) {
 return new ActionFormData()
 .simpleUi()
 .title(Lang.t(player, "kill.title"))
 .body(Lang.t(player, "kill.body"))
 .button(Lang.t(player, "kill.btn.monsters"), "textures/ui/promo_spider")
 .button(Lang.t(player, "kill.btn.animals"), "textures/ui/horse_heart")
 .button(Lang.t(player, "kill.btn.players"), "textures/ui/FriendsIcon")
 .button(Lang.t(player, "kill.btn.items"), "textures/items/iron_sword")
 .button(Lang.t(player, "kill.btn.back"), "textures/ui/arrow_left")
 }
}

function createPlayerFormFactory() {
 return function (player) {
 return new ActionFormData()
 .simpleUi()
 .title(player ? Lang.t(player, "player.menu.title") : "Player Options")
 .body(player ? Lang.t(player, "player.menu.body") : "§7Main Menu §r> §fPlayer Options")
 .button(player ? Lang.t(player, "player.btn.info") : "info", "textures/ui/infobulb")
 .button(player ? Lang.t(player, "player.btn.teleport") : "teleport", "textures/ui/glyph_realms")
 .button(player ? Lang.t(player, "player.btn.ban") : "ban/unban", "textures/ui/hammer_l")
 .button(player ? Lang.t(player, "player.btn.mute") : "mute/unmute", "textures/ui/mute_off")
 .button(player ? Lang.t(player, "player.btn.kick") : "kick", "textures/ui/minus")
 .button(player ? Lang.t(player, "player.btn.give") : "give items", "textures/items/diamond_chestplate")
 .button(player ? Lang.t(player, "player.btn.invsee") : "invsee", "textures/ui/inventory_icon")
 .button(player ? Lang.t(player, "player.btn.money") : "money", "textures/items/gold_nugget")
 .button(player ? Lang.t(player, "player.btn.custom_cmds") : "custom commands", "textures/ui/icon_bookshelf")
 .button(player ? Lang.t(player, "common.back") : "back", "textures/ui/arrow_left")
 }
}

function createScoreboardFormFactory() {
 return function (player) {
 return new ActionFormData()
 .simpleUi()
 .title(Lang.t(player, "sb.title"))
 .body(Lang.t(player, "sb.body"))
 .button(Lang.t(player, "sb.btn.create"), "textures/ui/plus")
 .button(Lang.t(player, "sb.btn.view"), "textures/ui/magnifying_glass")
 .button(Lang.t(player, "sb.btn.display"), "textures/ui/addServer")
 .button(Lang.t(player, "sb.btn.reset"), "textures/ui/trash")
 .button(Lang.t(player, "sb.btn.back"), "textures/ui/arrow_left")
 }
}

function createVanishFormFactory() {
 return function (player) {
 return new ActionFormData()
 .simpleUi()
 .title(Lang.t(player, "vanish.title"))
 .body(Lang.t(player, "vanish.body"))
 .button(Lang.t(player, "vanish.btn.invisible"), "textures/ui/invisibility_effect")
 .button(Lang.t(player, "vanish.btn.clear"), "textures/items/bucket_milk")
 .button(Lang.t(player, "vanish.btn.spectator"), "textures/items/armor_stand")
 .button(Lang.t(player, "vanish.btn.back"), "textures/ui/arrow_left")
 }
}

function createGamemodeFormFactory() {
 return function (player) {
 return new ActionFormData()
 .simpleUi()
 .title(Lang.t(player, "gamemode.title"))
 .body(Lang.t(player, "gamemode.body"))
 .button(Lang.t(player, "gamemode.btn.survival"), "textures/items/book_portfolio")
 .button(Lang.t(player, "gamemode.btn.creative"), "textures/items/book_portfolio")
 .button(Lang.t(player, "gamemode.btn.adventure"), "textures/items/book_portfolio")
 .button(Lang.t(player, "gamemode.btn.spectator"), "textures/items/book_portfolio")
 .button(Lang.t(player, "gamemode.btn.back"), "textures/ui/arrow_left")
 }
}

function createRankFormFactory() {
 return function (player) {
 return new ActionFormData()
 .simpleUi()
 .title(Lang.t(player, "rank.title"))
 .body(Lang.t(player, "rank.body"))
 .button(Lang.t(player, "rank.btn.set"), "textures/ui/icon_steve")
 .button(Lang.t(player, "rank.btn.remove"), "textures/ui/trash_default")
 .button(Lang.t(player, "rank.btn.manage_custom"), "textures/ui/creative_icon")
 .button(Lang.t(player, "rank.btn.list_skills"), "textures/items/villagebell")
 .button(Lang.t(player, "rank.btn.set_default"), "textures/ui/icon_sign")
 .button(Lang.t(player, "rank.btn.customize"), "textures/ui/icon_recipe_item")
 .button(Lang.t(player, "rank.btn.benefits"), "textures/ui/health_boost_effect")
 .button(Lang.t(player, "rank.btn.subscription"), "textures/ui/timer")
 .button(Lang.t(player, "rank.btn.color_chat"), "textures/icon_custom/pesan.png")
 .button(Lang.t(player, "rank.btn.back"), "textures/ui/arrow_left")
 }
}

function createTimeFormFactory() {
 return function (player) {
 return new ActionFormData()
 .simpleUi()
 .title(Lang.t(player, "time.title"))
 .body(Lang.t(player, "time.body"))
 .button(Lang.t(player, "time.btn.day"), "textures/items/clock_item")
 .button(Lang.t(player, "time.btn.sunset"), "textures/items/clock_item")
 .button(Lang.t(player, "time.btn.night"), "textures/items/clock_item")
 .button(Lang.t(player, "time.btn.clear"), "textures/ui/weather_clear")
 .button(Lang.t(player, "time.btn.rain"), "textures/ui/weather_rain")
 .button(Lang.t(player, "time.btn.storm"), "textures/ui/weather_thunderstorm")
 .button(Lang.t(player, "time.btn.back"), "textures/ui/arrow_left")
 }
}

const kiwora = createKiworaFormFactory()
const killForm = createKillFormFactory()
const playerForm = createPlayerFormFactory()
const scoreboardForm = createScoreboardFormFactory()
const vanishForm = createVanishFormFactory()
const gamemodeForm = createGamemodeFormFactory()
const timeForm = createTimeFormFactory()
const rankForm = createRankFormFactory()

export {
 killForm,
 kiwora,
 playerForm,
 scoreboardForm,
 vanishForm,
 timeForm,
 gamemodeForm,
 rankForm
}
