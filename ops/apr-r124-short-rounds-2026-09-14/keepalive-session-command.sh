#!/bin/zsh
set -euo pipefail

state_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state'
worker='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/c58ba2b3-patch-notte-r124-governed-20260914/apr-enea-worker.mjs'
profile="$state_root/enea-browser-worker/chrome-profile"

/usr/local/bin/node "$worker" configure \
  --state-dir "$state_root" \
  --setup-enabled true \
  --operational-enabled false \
  --profile-directory "$profile" \
  --remote-debugging-port 9331 \
  --authorization-id user-2026-09-14-readonly-session-continuity \
  >/dev/null

exec /usr/bin/caffeinate -i /usr/local/bin/node "$worker" serve --state-dir "$state_root" --interval-ms 2000
