#!/usr/bin/env bash
# Runs the DupeGuard logic tests against a stubbed @minecraft/server.
#
# scripts/main.js is the source of truth; it is copied in here before each run
# so module resolution finds the stub in test/node_modules.
set -euo pipefail
cd "$(dirname "$0")"

cp ../scripts/main.js ./main.js
trap 'rm -f ./main.js' EXIT

node inventory-sync.test.mjs
echo
node behaviour.test.mjs
