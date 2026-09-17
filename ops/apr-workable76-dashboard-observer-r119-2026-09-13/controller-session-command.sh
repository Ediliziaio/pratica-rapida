#!/bin/zsh
set -euo pipefail

run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable76-dashboard-observer-r119-20260913'
runner_path='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/scripts/enea-shadow-runner/simple-independent-runner.mjs'
expected_runner_sha256='89254c6afd808056e8d5a35a19a0fda1ed3d7bfc5def1eba83cac107280790dd'
launcher_log="$run_root/controller.log"

actual_runner_sha256="$(/usr/bin/shasum -a 256 "$runner_path" | /usr/bin/awk '{print $1}')"
if [[ "$actual_runner_sha256" != "$expected_runner_sha256" ]]; then
  print -u2 -r -- "runner_hash_mismatch:${actual_runner_sha256}"
  exit 1
fi

mkdir -p "$run_root"
exec /usr/bin/caffeinate -i \
  /usr/bin/env \
  APR_BATCH_RUN_ID=apr-workable76-dashboard-observer-r119-20260913 \
  'APR_BATCH_REPORT_TITLE=APR — giro completo 76 con dashboard osservatrice r119' \
  "APR_BATCH_RUN_ROOT=$run_root" \
  APR_BATCH_MANIFEST='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-workable76-r111-2026-09-11/manifest.json' \
  APR_BATCH_BUNDLE='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/f086c1f4-crm-refresh-serialization-r118-20260912' \
  APR_BATCH_MANIFEST_SHA256=4be8287c7ec661404fc5d2b13b5e8bd1f492d876c6f6793ed3b374e8d2a54210 \
  APR_BATCH_WORKER_SHA256=295b9fe0083f82243b7435c775ea02d3c5f0ab5f0aabf8ec820167bd899822ad \
  APR_BATCH_COHORT_OFFSET=6700 \
  APR_BATCH_EXPECTED_COUNT=76 \
  APR_BATCH_NTFY_DISABLED=0 \
  /usr/local/bin/node \
  "$runner_path" \
  >>"$launcher_log" 2>&1
