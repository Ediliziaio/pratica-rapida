#!/bin/zsh
set -euo pipefail

run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable76-r111-20260911'
launcher_log="$run_root/detached-controller.log"

print -r -- "$(date -u +%Y-%m-%dT%H:%M:%SZ) controller_session_started" >>"$launcher_log"

exec /usr/bin/caffeinate -i \
  /usr/bin/env \
  APR_BATCH_RUN_ID=apr-workable76-r111-20260911 \
  'APR_BATCH_REPORT_TITLE=APR — giro r111: nucleo 70 + 6 pratiche riattivate' \
  "APR_BATCH_RUN_ROOT=$run_root" \
  APR_BATCH_MANIFEST='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-workable76-r111-2026-09-11/manifest.json' \
  APR_BATCH_BUNDLE='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/cd448b42-final-total-only-r111-20260911' \
  APR_BATCH_MANIFEST_SHA256=4be8287c7ec661404fc5d2b13b5e8bd1f492d876c6f6793ed3b374e8d2a54210 \
  APR_BATCH_WORKER_SHA256=b0616c276e002c62d5edaad1d97c53ca211e1ffb1273d026254521b5229faebc \
  APR_BATCH_COHORT_OFFSET=5900 \
  APR_BATCH_EXPECTED_COUNT=76 \
  APR_BATCH_NTFY_DISABLED=0 \
  /usr/local/bin/node \
  /Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/scripts/enea-shadow-runner/simple-independent-runner.mjs \
  >>"$launcher_log" 2>&1
