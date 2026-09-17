#!/bin/zsh
set -euo pipefail

repository_root='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida'
run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable76-fault-recovery-lease-r122-20260913'
runner_path="$repository_root/scripts/enea-shadow-runner/simple-independent-runner.mjs"
bundle_path='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/328eeac0-fault-recovery-browser-lease-r122-20260913'
expected_runner_sha256='d467630825ff8bb5c801466b32c2f360a88b8d53d2d1d6a254ee737f2d0a4505'
launcher_log="$run_root/controller.log"

actual_runner_sha256="$(/usr/bin/shasum -a 256 "$runner_path" | /usr/bin/awk '{print $1}')"
if [[ "$actual_runner_sha256" != "$expected_runner_sha256" ]]; then
  print -u2 -r -- "runner_hash_mismatch:${actual_runner_sha256}"
  exit 1
fi

mkdir -p "$run_root"
cd "$repository_root"

/usr/local/bin/node node_modules/vite-node/vite-node.mjs \
  scripts/enea-shadow-runner/apr-bundle-alignment-cli.ts "$bundle_path" \
  >>"$launcher_log" 2>&1
/usr/local/bin/node node_modules/vite-node/vite-node.mjs \
  scripts/enea-shadow-runner/apr-rule-governance-verify-cli.ts "$bundle_path" \
  >>"$launcher_log" 2>&1

exec /usr/bin/caffeinate -i \
  /usr/bin/env \
  APR_BATCH_RUN_ID=apr-workable76-fault-recovery-lease-r122-20260913 \
  'APR_BATCH_REPORT_TITLE=APR — giro completo 76 con rilavorazione guasti e lease browser 120s r122' \
  "APR_BATCH_RUN_ROOT=$run_root" \
  APR_BATCH_MANIFEST="$repository_root/ops/apr-workable76-r111-2026-09-11/manifest.json" \
  "APR_BATCH_BUNDLE=$bundle_path" \
  APR_BATCH_MANIFEST_SHA256=4be8287c7ec661404fc5d2b13b5e8bd1f492d876c6f6793ed3b374e8d2a54210 \
  APR_BATCH_WORKER_SHA256=0a4e67faf52ff16ea06c23c5ff3de807e7504237084961a77200dd6465057881 \
  APR_BATCH_COHORT_OFFSET=8000 \
  APR_BATCH_EXPECTED_COUNT=76 \
  APR_BATCH_NTFY_DISABLED=0 \
  /usr/local/bin/node "$runner_path" \
  >>"$launcher_log" 2>&1
