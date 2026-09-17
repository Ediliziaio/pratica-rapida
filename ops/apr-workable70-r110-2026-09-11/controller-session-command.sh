#!/bin/zsh
set -euo pipefail

run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable70-r110-20260911'
launcher_log="$run_root/detached-controller.log"

print -r -- "$(date -u +%Y-%m-%dT%H:%M:%SZ) controller_session_started" >>"$launcher_log"

exec /usr/bin/caffeinate -i \
  /usr/bin/env \
  APR_BATCH_RUN_ID=apr-workable70-r110-20260911 \
  'APR_BATCH_REPORT_TITLE=APR — giro completo 70 lavorabili, r110' \
  "APR_BATCH_RUN_ROOT=$run_root" \
  APR_BATCH_MANIFEST='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-workable70-r110-2026-09-11/manifest.json' \
  APR_BATCH_BUNDLE='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/6da0194c-infissi-closure-authority-r110-20260910' \
  APR_BATCH_MANIFEST_SHA256=dc16fe1373645a33054cbf994fea1a647a5acd2bf7212341419e41070623a45d \
  APR_BATCH_WORKER_SHA256=5beccb73cd8ee89d2fb440a45bdd70a2b7c668052bd5161c37be95595a551d79 \
  APR_BATCH_COHORT_OFFSET=5800 \
  APR_BATCH_EXPECTED_COUNT=70 \
  APR_BATCH_NTFY_DISABLED=1 \
  /usr/local/bin/node \
  /Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/scripts/enea-shadow-runner/simple-independent-runner.mjs \
  >>"$launcher_log" 2>&1
