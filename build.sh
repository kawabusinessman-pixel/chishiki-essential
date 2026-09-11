#!/usr/bin/env bash
# Packs the addons in this repo into distributable files under dist/.
set -euo pipefail

cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist

# Chishiki Essential: behavior + resource pack in one .mcaddon
CHISHIKI="dist/ChishikiEssential_FixedHUD_33.2.5.mcaddon"
zip -r -q -X "$CHISHIKI" ChishikiBP ChishikiRP \
  -x '*.DS_Store' -x '__MACOSX/*' -x '*/.gitkeep'
echo "built $CHISHIKI ($(du -h "$CHISHIKI" | cut -f1))"

# DupeGuard: single behaviour pack, shipped as .mcpack
DUPEGUARD="dist/DupeGuard_1.5.1.mcpack"
( cd DupeGuard && zip -r -q -X "../$DUPEGUARD" manifest.json pack_icon.png scripts \
    -x '*.DS_Store' -x '__MACOSX/*' )
echo "built $DUPEGUARD ($(du -h "$DUPEGUARD" | cut -f1))"
