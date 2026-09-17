#!/bin/zsh
set -euo pipefail

root='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-runtime-decisions-r115-2026-09-11/keepalive-state'
worker='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/0ae77c33-runtime-decisions-r115-20260911/apr-enea-worker.mjs'
profile='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state/enea-browser-worker/chrome-profile'

/usr/local/bin/node "$worker" configure \
  --state-dir "$root" \
  --setup-enabled true \
  --operational-enabled false \
  --profile-directory "$profile" \
  --remote-debugging-port 9331 \
  --authorization-id user-2026-09-11-readonly-session-continuity \
  >/dev/null

exec /usr/bin/caffeinate -i /usr/local/bin/node "$worker" serve --state-dir "$root" --interval-ms 2000
