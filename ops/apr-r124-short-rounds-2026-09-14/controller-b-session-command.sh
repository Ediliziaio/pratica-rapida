#!/bin/zsh
set -euo pipefail

repository_root='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida'
run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-r124-short-round-b-20260914'
runner_path="$repository_root/scripts/enea-shadow-runner/simple-independent-runner.mjs"
bundle_path='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/c58ba2b3-patch-notte-r124-governed-20260914'
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
  APR_BATCH_RUN_ID=apr-r124-short-round-b-20260914 \
  'APR_BATCH_REPORT_TITLE=APR r124 — giro B, sette pratiche nominate da Giuliano' \
  "APR_BATCH_RUN_ROOT=$run_root" \
  APR_BATCH_MANIFEST="$repository_root/ops/apr-r124-short-rounds-2026-09-14/manifest-b.json" \
  "APR_BATCH_BUNDLE=$bundle_path" \
  APR_BATCH_MANIFEST_SHA256=e4d23f88673f331b6aea9f8fb90a253433dafe596823b098f222480ca3909272 \
  APR_BATCH_WORKER_SHA256=3c5d11fbb9040189cf77202f359ebc47134031fe4af95cd116730c1d95ea71d4 \
  APR_BATCH_COHORT_OFFSET=9100 \
  APR_BATCH_EXPECTED_COUNT=7 \
  APR_BATCH_NTFY_DISABLED=0 \
  /usr/local/bin/node "$runner_path" >>"$launcher_log" 2>&1
