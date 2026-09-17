#!/bin/zsh
set -euo pipefail

run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable76-resume-remaining26-r118-20260912'
launcher_log="$run_root/controller.log"

mkdir -p "$run_root"
exec /usr/bin/caffeinate -i \
  /usr/bin/env \
  APR_BATCH_RUN_ID=apr-workable76-resume-remaining26-r118-20260912 \
  'APR_BATCH_REPORT_TITLE=APR — prosecuzione 26 pratiche dopo correzione sessione CRM r118' \
  "APR_BATCH_RUN_ROOT=$run_root" \
  APR_BATCH_MANIFEST='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-crm-refresh-serialization-r118-2026-09-12/manifest-resume-remaining26.json' \
  APR_BATCH_BUNDLE='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/f086c1f4-crm-refresh-serialization-r118-20260912' \
  APR_BATCH_MANIFEST_SHA256=c7ad21b6ac47df96137f142f6e4c031aaa54c5b05a934638f691c28995e10e86 \
  APR_BATCH_WORKER_SHA256=295b9fe0083f82243b7435c775ea02d3c5f0ab5f0aabf8ec820167bd899822ad \
  APR_BATCH_COHORT_OFFSET=6500 \
  APR_BATCH_EXPECTED_COUNT=26 \
  APR_BATCH_NTFY_DISABLED=0 \
  /usr/local/bin/node \
  /Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/scripts/enea-shadow-runner/simple-independent-runner.mjs \
  >>"$launcher_log" 2>&1
