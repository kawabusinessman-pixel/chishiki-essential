# Chishiki Essential

Rebranded + reskinned build of **KiwEssentials FixedHUD v33.2.5** (mcbe 26.40),
originally by KiworaID / KiwStudio.

> Modification is permitted by the original author. **Selling this modified
> addon is not permitted.** Original creator credits (KiworaID, KiwStudio.com)
> are left intact in-game.

## Layout

| Path | What it is |
| --- | --- |
| `ChishikiBP/` | behavior pack (scripts, items, entities) |
| `ChishikiRP/` | resource pack (UI, textures, lang) |
| `DupeGuard/` | patched DupeGuard anti-dupe pack, see its own README |
| `build.sh` | packs everything into `dist/` |

Pack UUIDs and versions are unchanged, so this installs over an existing
KiwEssentials world without breaking saved data.

## Requirements

**The world must have the "Beta APIs" experiment enabled.** Without it the
behavior pack does not load at all and the server log shows:

```
[Scripting] Plugin [Chishiki Essential [BP] FixedHUD - 33.2.5] - requesting
dependency on beta APIs [@minecraft/server - 2.x.x-beta], but the Beta APIs
experiment is not enabled.
```

This comes from upstream: `ChishikiBP/manifest.json` declares
`"version": "beta"` for both `@minecraft/server` and `@minecraft/server-ui`,
and the code genuinely uses APIs that only ship in the beta modules:

| API | Used by | Feature that breaks without it |
| --- | --- | --- |
| `TextPrimitive`, `world.primitiveShapesManager` | `plugins/floating-text/registry.js` | floating text and leaderboards |
| `CustomForm`, `ObservableString` | `plugins/clan/chat_clan.js` | clan chat window |

So the dependency cannot simply be pinned to a stable version — those two
features would have to be rewritten first.

Enabling experiments marks the world as experimental and disables achievements.
That is expected for any script-based add-on.

DupeGuard is unaffected either way: it asks for stable `@minecraft/server`
2.4.0 and loads with or without the experiment.

## Building

```sh
./build.sh     # -> dist/ChishikiEssential_FixedHUD_33.2.5.mcaddon
               #    dist/DupeGuard_1.5.1.mcpack
```

## Changes from upstream

### 1. Rebrand: KiwEssentials -> Chishiki Essential

* Admin book title (`ChishikiBP/scripts/forms.js`)
* Member book title (`ChishikiBP/scripts/member.js`)
* Scoreboard text-logo default (`ChishikiBP/scripts/board/scoreboard.js`,
  `ChishikiBP/scripts/board/main.js`, `ChishikiRP/texts/en_US.lang`)
* `/helps` header and `/info` copyright line
  (`ChishikiBP/scripts/plugins/custom-commands/custom.command.js`)
* Pack names in both `manifest.json` files

### 2. Blue member book UI

The member book used the same flat black dialog as every other form. It now
gets its own blue skin, routed by the `memberMenu` title marker
(`§k§i§w§m§e§m§b§r`) that `member.js` already emits.

`ChishikiRP/ui/vkf.json`:

* `pure_action_panel`, `pure_title_bar`, `pure_close_button` and
  `custom_grid_panel` now read their skin from variables
  (`$panel_bg_texture`, `$titlebar_bg_texture`, `$close_bg_color`,
  `$grid_item_template`) that default to the original black values, so every
  other menu is untouched.
* New `member_action_panel` / `member_grid_panel` / `member_button_wrapper` /
  `member_button` definitions supply the blue variants.
* `next_long_form` routes titles carrying the member marker to
  `member_action_panel`; `generic_action_panel` now excludes that marker.

New textures in `ChishikiRP/textures/kiwui/`:

| File | Fill | Border |
| --- | --- | --- |
| `dialog_background_blue.png` | `#0E1E40` | `#4DA6FF` |
| `button_default_blue.png` | `#10244E` | `#285CA8` |
| `button_hover_blue.png` | `#1A4082` | `#80CAFF` |

The admin book intentionally keeps the original dark theme.

### 3. Blue scoreboard

* `ChishikiRP/textures/board/background.png` - card recoloured from purple
  (`#9B6BFF` border on `#181626`) to ice blue (`#4DA6FF` on `#101C38`),
  matching the `textures/form/title.png` logo.
* `ChishikiBP/scripts/board/_config.js` - `DEFAULT_LINES` recoloured from
  red (`§c`) to blue (`§b` headers, `§9` bullets), and the "Classic Default"
  preset label follows.

Existing worlds keep whatever scoreboard lines they already saved; the new
colours apply to fresh installs and to anyone who resets to default.

## DupeGuard

`DupeGuard/` holds a patched build of the third-party DupeGuard v1.5.0 anti-dupe
pack. It is a separate add-on, not part of Chishiki Essential — it just ships
from the same repo because it runs on the same server.

The headline fix: v1.5.0 treated taking a stack out of a chest as duplication
and deleted the difference on the player's next join. Item removal is now
opt-in behind `/cheats:invenforce`. Full write-up and logic tests in
`DupeGuard/README.md` and `DupeGuard/test/`.
