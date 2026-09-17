#!/bin/zsh
set -euo pipefail

repository_root='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida'
run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-wide148-post-spid-login-r127-20260915'
runner_path="$repository_root/scripts/enea-shadow-runner/simple-independent-runner.mjs"
bundle_path='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/53d58e3c-post-wide148-portal-rejection-r127-20260915'
expected_runner_sha256='3222182522fab5ae6320b4e7b03675947d5cfab2a35efaea9685cda09cfd1a48'
launcher_log="$run_root/controller.log"

actual_runner_sha256="$(/usr/bin/shasum -a 256 "$runner_path" | /usr/bin/awk '{print $1}')"
if [[ "$actual_runner_sha256" != "$expected_runner_sha256" ]]; then
  print -u2 -r -- "runner_hash_mismatch:${actual_runner_sha256}"
  exit 1
fi

mkdir -p "$run_root"
cd "$repository_root"
/usr/local/bin/node node_modules/vite-node/vite-node.mjs scripts/enea-shadow-runner/apr-bundle-alignment-cli.ts "$bundle_path" >>"$launcher_log" 2>&1
/usr/local/bin/node node_modules/vite-node/vite-node.mjs scripts/enea-shadow-runner/apr-rule-governance-verify-cli.ts "$bundle_path" >>"$launcher_log" 2>&1

exec /usr/bin/caffeinate -i /usr/bin/env \
  APR_BATCH_RUN_ID=apr-wide148-post-spid-login-r127-20260915 \
  'APR_BATCH_REPORT_TITLE=APR r127 — rilancio fresco dopo nuovo login SPID delle stesse 148 pratiche' \
  "APR_BATCH_RUN_ROOT=$run_root" \
  APR_BATCH_MANIFEST="$repository_root/ops/apr-wide150-r126-2026-09-15/manifest.json" \
  "APR_BATCH_BUNDLE=$bundle_path" \
  APR_BATCH_MANIFEST_SHA256=64c53c2618e79bd407ffe8f269ab12b495d547a1e5153bd80529def4b73fc8cd \
  APR_BATCH_WORKER_SHA256=8a6faaadb2fcd226b109c50b7cb93ccf01ffebc4f09839342fcd6ba8c0a4e38f \
  APR_BATCH_COHORT_OFFSET=10302 \
  APR_BATCH_EXPECTED_COUNT=148 \
  APR_BATCH_NTFY_DISABLED=1 \
  /usr/local/bin/node "$runner_path" >>"$launcher_log" 2>&1
