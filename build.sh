#!/usr/bin/env bash
# Packs ChishikiBP/ + ChishikiRP/ into a distributable .mcaddon.
set -euo pipefail

cd "$(dirname "$0")"
NAME="ChishikiEssential_FixedHUD_33.2.5"
OUT="dist/${NAME}.mcaddon"

rm -rf dist
mkdir -p dist
zip -r -q -X "$OUT" ChishikiBP ChishikiRP \
  -x '*.DS_Store' -x '__MACOSX/*' -x '*/.gitkeep'

echo "built $OUT ($(du -h "$OUT" | cut -f1))"
