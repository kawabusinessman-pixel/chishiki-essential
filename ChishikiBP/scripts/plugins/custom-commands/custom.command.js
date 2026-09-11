import { system, world, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player } from "../../core"
import { getAllWarps, teleportToWarp } from "../../warp.js"
import { ShowPlayerWarps } from "../player-warp/index.js"
import { teleportToDeathLocation } from "../back-to-die/index.js"
import { showMemberMenu } from "../../member.js"
import { featureStatus, isMemberFeatureEnabled } from "../../function/memberFeatureState.js"
import { random_tp_instant } from "../random-teleport/index.js"
import { Shop, Sell } from "../../menu_member/functions/shop/index.js"
import { TeleportRequest } from "../teleport-request/index.js"
import { processRedeemCode } from "../npc-system/redeem-code/redeem_code.js"
import { showDailyRewardMenu } from "../npc-system/daily-reward/daily_reward.js"
import { openJobsMenu } from "../jobs/jobs.js"
import { showEmoteMenu } from "../emotes/index.js"
import { isCommandEnabled } from "./command_state.js"
import { Lang } from "../../lib/Lang.js"
import { sendAnnounce } from "../../function/announceTitle.js"
import { handleHomeCommand, handleSethomeCommand, handleDelhomeCommand } from "../sethome/Set Home.js"
const getPlayer = origin => origin?.initiator || origin.sourceEntity
const isPlayer = player => player instanceof Player
const success = () => ({ status: CustomCommandStatus.Success })
const failure = (message = "Players only.") => ({ status: CustomCommandStatus.Failure, message })
const checkFeature = (player, feature, featureName) => {
	if (!isMemberFeatureEnabled(feature)) {
		player.sendMessage(`§c✘ ${featureName} feature is currently disabled by admin.`)
		system.run(() => player.playSound("note.bass"))
		return false
	}
	return true
}
const isAdminActor = player => !player || player.hasTag("admin")
const handlers = {
	clearchat: origin => {
		if (!isCommandEnabled('clearchat')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure("This command is for players only.")
		system.run(() => {
			const msg = { rawtext: [{ text: "clearchat-nperma" }] }
			for (let i = 0; i < 50; i++) player.sendMessage(msg)
			player.sendMessage("§a[ClearChat] §r§aChat cleared successfully.")
			player.playSound("random.orb")
		})
		return success()
	},
	helps: origin => {
		if (!isCommandEnabled('helps')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		const message = [
			"§9━━━[ CHISHIKI ESSENTIAL HELP ]━━━§r",
			"§bCommands:§r",
			"§3• §f/helps §7- Show this help",
			"§3• §f/info §7- Server info",
			"§3• §f/rules §7- Server rules",
			"§3• §f/home [name] §7- Teleport to home",
			"§3• §f/sethome [name] §7- Set home at location",
			"§3• §f/delhome <name> §7- Delete home point",
			"§3• §f/warp [name] §7- List/teleport to warps",
			"§3• §f/pwarp §7- Open player warp menu",
			"§3• §f/back §7- Return to last death location",
			"§3• §f/menu §7- Open member menu",
			"§3• §f/rtp §7- Random teleport",
			"§3• §f/shop §7- Open shop menu",
			"§3• §f/sell §7- Sell inventory items to shop",
			"§3• §f/tpa §7- View teleport menu",
			"§3• §f/redeem §7- Redeem a gift code",
		"§3• §f/daily §7- Claim daily reward",
			"§3• §f/clearchat §7- Clear your chat",
			"",
			"§eTips:§r",
			"§7- Use §f/helps§7 anytime for this menu",
			"§7- Commands are not case-sensitive",
			"§8━━━━━━━━━━━━━━━━━━━━━━§r",
		].join("\n")
		player.sendMessage(message)
		return success()
	},
	info: origin => {
		if (!isCommandEnabled('info')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		const message = ["§2━━━[ SERVER INFO ]━━━§r", "§a• §fCreator: §bKiworaID", "§a• §fVersion: §e5.0.0", "§a• §fWebsite: §bKiwStudio.com", "§8© 2025 Chishiki Essential. All rights reserved.", "§8━━━━━━━━━━━━━━━━━━━━━━§r"].join("\n")
		player.sendMessage(message)
		return success()
	},
	rules: origin => {
		if (!isCommandEnabled('rules')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		const message = ["§6━━━[ SERVER RULES ]━━━§r", "§c1. §fNo griefing", "§c2. §fBe respectful", "§c3. §fNo cheating or hacking", "§c4. §fNo spamming", "§c5. §fNo advertising", "§c6. §fNo scamming", "§c7. §fNo toxic or hate speech", "§c8. §fFollow staff instructions", "", "§eBreaking rules may result in mute, kick, or ban.", "§8━━━━━━━━━━━━━━━━━━━━━━§r"].join("\n")
		player.sendMessage(message)
		return success()
	},
	home: (origin, name) => {
		if (!isCommandEnabled('home')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "setHome", "Set Home")) return failure("Set Home feature is disabled")
		system.run(() => handleHomeCommand(player, name))
		return success()
	},
	sethome: (origin, name) => {
		if (!isCommandEnabled('sethome')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "setHome", "Set Home")) return failure("Set Home feature is disabled")
		system.run(() => handleSethomeCommand(player, name))
		return success()
	},
	delhome: (origin, name) => {
		if (!isCommandEnabled('delhome')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "setHome", "Set Home")) return failure("Set Home feature is disabled")
		system.run(() => handleDelhomeCommand(player, name))
		return success()
	},
	warp: (origin, name) => {
		if (!isCommandEnabled('warp')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "warp", "Warp")) return failure("Warp feature is disabled")
		if (!name) {
			const warps = getAllWarps()
			if (!warps.length) {
				player.sendMessage("§cNo warps have been created yet.")
				return success()
			}
			const list = warps.map(w => `§b${w.Name}`).join("§7, ")
			player.sendMessage(`§aAvailable Warps: ${list}`)
			player.sendMessage(`§aUse /warp <warp name> to teleport to a warp. Warp names must be one word, no spaces allowed.`)
			return success()
		}
		const warps = getAllWarps()
		const idx = warps.findIndex(w => w.Name.toLowerCase() === name.toLowerCase())
		if (idx === -1) {
			player.sendMessage(`§cWarp "${name}" tidak ditemukan.`)
			return failure()
		}
		teleportToWarp(player, warps, idx)
		return success()
	},
	pwarp: origin => {
		if (!isCommandEnabled('pwarp')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "pwarp", "Player Warp")) return failure("Player Warp feature is disabled")
		system.run(() => ShowPlayerWarps(player))
		return success()
	},
	back: origin => {
		if (!isCommandEnabled('back')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "setHome", "Set Home")) return failure("Set Home feature is disabled")
		teleportToDeathLocation(player)
		return success()
	},
	menu: origin => {
		if (!isCommandEnabled('menu')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!Object.values(featureStatus).some(status => status)) {
			player.sendMessage("§c✘ All member features are currently disabled by admin.")
			system.run(() => player.playSound("note.bass"))
			return failure("All member features are disabled")
		}
		system.run(() => showMemberMenu(player))
		return success()
	},
	rtp: (origin, dim = "overworld") => {
		if (!isCommandEnabled('rtp')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "randomTeleport", "Random Teleport")) return failure("Random teleport feature is disabled")
		random_tp_instant(player, dim)
		return success()
	},
	rtp_nether: origin => handlers.rtp(origin, "nether"),
	rtp_end: origin => handlers.rtp(origin, "end"),
	shop: origin => {
		if (!isCommandEnabled('shop')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "shop", "Shop")) return failure("Shop feature is disabled")
		system.run(() => Shop(player))
		return success()
	},
	sell: origin => {
		if (!isCommandEnabled('sell')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "shop", "Shop")) return failure("Shop feature is disabled")
		system.run(() => Sell(player))
		return success()
	},
	tpa: origin => {
		if (!isCommandEnabled('tpa')) return failure('This command is currently disabled.')
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "teleport", "Teleport")) return failure("Teleport feature is disabled")
		system.run(() => TeleportRequest(player))
		return success()
	},
	job: origin => {
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "job", "Jobs")) return failure("Jobs feature is disabled")
		system.run(() => openJobsMenu(player))
		return success()
	},
	emotes: origin => {
		const player = getPlayer(origin)
		if (!isPlayer(player)) return failure()
		if (!checkFeature(player, "emotes", "Emotes")) return failure("Emotes feature is disabled")
		system.run(() => showEmoteMenu(player))
		return success()
	},
		redeem: (origin, ...parts) => {
			if (!isCommandEnabled('redeem')) return failure('This command is currently disabled.')
			const player = getPlayer(origin)
			if (!isPlayer(player)) return failure()
			const code = parts.filter(p => p != null && String(p).length).join(" ").trim()
			if (!code) return failure(Lang.t(player, "redeem.usage"))
			system.run(() => processRedeemCode(player, code, { skipConfirm: true }))
			return success()
		},
		daily: origin => {
			if (!isCommandEnabled('daily')) return failure('This command is currently disabled.')
			const player = getPlayer(origin)
			if (!isPlayer(player)) return failure()
			system.run(() => showDailyRewardMenu(player))
			return success()
		},
		announce: (origin, titleText, subtitleText, broadcast = true) => {
			if (!isCommandEnabled('announce')) return failure('This command is currently disabled.')
			const player = getPlayer(origin)
			if (player && !isPlayer(player)) return failure()
			if (!isAdminActor(player)) return failure("You don't have permission to use this command.")
			if (!titleText || !String(titleText).trim()) return failure("Usage: /announce <title> [subtitle] [broadcast]")
			const name = player ? player.name : "Server"
			const ftitle = String(titleText)
				.replace(/\\n/g, "\n")
				.replaceAll("@s", name)
				.slice(0, 200)
			const fsubtitle = String(subtitleText ?? "")
				.replace(/\\n/g, "\n")
				.replaceAll("@s", name)
			system.run(() => {
				const targets = broadcast ? "all" : (player ? [player] : [])
				sendAnnounce(targets, ftitle, subtitleText ? fsubtitle : "")
			})
			return success()
		},
		abcast: (origin, message) => {
			if (!isCommandEnabled('abcast')) return failure('This command is currently disabled.')
			const player = getPlayer(origin)
			if (player && !isPlayer(player)) return failure()
			if (!isAdminActor(player)) return failure("You don't have permission to use this command.")
			if (!message || !String(message).trim()) return failure("Usage: /abcast <message>")
			const text = String(message).replace(/\\n/g, "\n").slice(0, 300)
			system.run(() => {
				for (const target of world.getAllPlayers()) {
					try { target.onScreenDisplay.setActionBar(text) } catch { }
				}
			})
			return success()
		},
}
const REDEEM_CODE_PARTS = Array.from({ length: 8 }, (_, i) => ({
	name: i === 0 ? "code" : `code${i + 1}`,
	type: CustomCommandParamType.String,
}))
const commands = [
	{ name: "kiw:clearchat", description: "Clear your chat", handler: handlers.clearchat },
	{ name: "kiw:helps", description: "Show help message", handler: handlers.helps },
	{ name: "kiw:info", description: "Dev information", handler: handlers.info },
	{ name: "kiw:rules", description: "View server rules", handler: handlers.rules },
	{ name: "kiw:home", description: "Teleport to a home", handler: handlers.home, params: [{ name: "name", type: CustomCommandParamType.String }] },
	{ name: "kiw:sethome", description: "Set home at current location", handler: handlers.sethome, params: [{ name: "name", type: CustomCommandParamType.String }] },
	{ name: "kiw:delhome", description: "Delete a home", handler: handlers.delhome, params: [{ name: "name", type: CustomCommandParamType.String }] },
	{ name: "kiw:warp", description: "List or teleport to a warp", handler: handlers.warp, params: [{ name: "name", type: CustomCommandParamType.String }] },
	{ name: "kiw:pwarp", description: "Open player warp menu", handler: handlers.pwarp },
	{ name: "kiw:back", description: "Return to last death location", handler: handlers.back },
	{ name: "kiw:menu", description: "Open member menu", handler: handlers.menu },
	{ name: "kiw:rtp", description: "Random teleport (Overworld)", handler: (origin) => handlers.rtp(origin, "overworld") },
	{ name: "kiw:rtp_nether", description: "Random teleport to the Nether", handler: handlers.rtp_nether },
	{ name: "kiw:rtp_end", description: "Random teleport to The End", handler: handlers.rtp_end },
	{ name: "kiw:shop", description: "Open shop menu", handler: handlers.shop },
	{ name: "kiw:sell", description: "Sell inventory items to shop", handler: handlers.sell },
	{ name: "kiw:tpa", description: "Open teleport request menu", handler: handlers.tpa },
	{ name: "kiw:job", description: "Open Jobs menu", handler: handlers.job },
	{ name: "kiw:emotes", description: "Open Emotes menu", handler: handlers.emotes },
	{ name: "kiw:emote", description: "Open Emotes menu", handler: handlers.emotes },
	{
		name: "kiw:redeem",
		description: "Redeem a gift code",
		handler: handlers.redeem,
		mandatoryParams: [REDEEM_CODE_PARTS[0]],
		optionalParams: REDEEM_CODE_PARTS.slice(1),
	},
	{ name: "kiw:daily", description: "Claim daily reward", handler: handlers.daily },
	{
		name: "kiw:announce",
		description: "Show a title announcement without hiding the scoreboard",
		handler: handlers.announce,
		mandatoryParams: [{ name: "title", type: CustomCommandParamType.String }],
		optionalParams: [
			{ name: "subtitle", type: CustomCommandParamType.String },
			{ name: "broadcast", type: CustomCommandParamType.Boolean },
		],
	},
	{
		name: "kiw:abcast",
		description: "Broadcast an actionbar message to all players",
		handler: handlers.abcast,
		mandatoryParams: [{ name: "message", type: CustomCommandParamType.String }],
	},
]
export function registerCustomCommands(system) {
	system.beforeEvents.startup.subscribe(init => {
		for (let i = 0; i < commands.length; i++) {
			const cmd = commands[i]
			const commandConfig = {
				name: cmd.name,
				description: cmd.description,
				permissionLevel: CommandPermissionLevel.Any,
				cheatsRequired: false,
				...(cmd.mandatoryParams && { mandatoryParameters: cmd.mandatoryParams }),
				...(cmd.optionalParams
					? { optionalParameters: cmd.optionalParams }
					: cmd.params && { optionalParameters: cmd.params }),
			}
			init.customCommandRegistry.registerCommand(commandConfig, cmd.handler)
		}
	})
}

export function executeChatCommand(player, message) {
	if (!isPlayer(player)) return false
	const clean = message.startsWith("/") || message.startsWith("!") ? message.slice(1).trim() : message.trim()
	if (!clean) return false
	const parts = clean.split(/\s+/)
	const rawCmd = parts[0]?.toLowerCase() || ""
	const cmd = rawCmd.startsWith("kiw:") ? rawCmd.slice(4) : rawCmd
	const args = parts.slice(1)
	const origin = { initiator: player, sourceEntity: player }

	switch (cmd) {
		case "home":
			handlers.home(origin, args[0])
			return true
		case "sethome":
			handlers.sethome(origin, args[0])
			return true
		case "delhome":
			handlers.delhome(origin, args[0])
			return true
		case "warp":
			handlers.warp(origin, args[0])
			return true
		case "pwarp":
			handlers.pwarp(origin)
			return true
		case "back":
			handlers.back(origin)
			return true
		case "menu":
			handlers.menu(origin)
			return true
		case "rtp":
			handlers.rtp(origin, args[0] || "overworld")
			return true
		case "rtp_nether":
			handlers.rtp_nether(origin)
			return true
		case "rtp_end":
			handlers.rtp_end(origin)
			return true
		case "shop":
			handlers.shop(origin)
			return true
		case "sell":
			handlers.sell(origin)
			return true
		case "tpa":
			handlers.tpa(origin)
			return true
		case "job":
		case "jobs":
			handlers.job(origin)
			return true
		case "emotes":
		case "emote":
			handlers.emotes(origin)
			return true
		case "redeem":
			handlers.redeem(origin, ...args)
			return true
		case "daily":
			handlers.daily(origin)
			return true
		case "clearchat":
			handlers.clearchat(origin)
			return true
		case "helps":
		case "help":
			handlers.helps(origin)
			return true
		case "info":
			handlers.info(origin)
			return true
		case "rules":
			handlers.rules(origin)
			return true
		case "announce":
			handlers.announce(origin, args.join(" "))
			return true
		case "abcast":
			handlers.abcast(origin, args.join(" "))
			return true
		default:
			return false
	}
}

