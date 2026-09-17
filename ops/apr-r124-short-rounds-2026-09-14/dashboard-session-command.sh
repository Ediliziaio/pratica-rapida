#!/bin/zsh
set -euo pipefail

cd '/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida'
exec /usr/local/bin/node node_modules/vite-node/vite-node.mjs \
  scripts/enea-shadow-runner/apr-cli.ts serve \
  --state-dir '/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state' \
  --port 10036 \
  --interval-ms 5000
