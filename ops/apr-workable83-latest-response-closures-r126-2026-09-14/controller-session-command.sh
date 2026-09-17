#!/bin/zsh
set -euo pipefail

repository_root='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida'
run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable83-latest-response-closures-r126-20260914'
runner_path="$repository_root/scripts/enea-shadow-runner/simple-independent-runner.mjs"
bundle_path='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/160dab59-operator-latest-response-closures-r126-20260914'
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
  APR_BATCH_RUN_ID=apr-workable83-latest-response-closures-r126-20260914 \
  'APR_BATCH_REPORT_TITLE=APR r126 — 76 lavorabili più 7 nominate, generazione fresca' \
  "APR_BATCH_RUN_ROOT=$run_root" \
  APR_BATCH_MANIFEST="$repository_root/ops/apr-workable83-operator-responses-payload-form-r125-2026-09-14/manifest.json" \
  "APR_BATCH_BUNDLE=$bundle_path" \
  APR_BATCH_MANIFEST_SHA256=119dee5097a7c015e79246194bf5ba0797aef13d6d554ea40b668e33c7880a5f \
  APR_BATCH_WORKER_SHA256=3e06c95078ad5c7822899d8ce494292d8d2b24374a60fa2940990618275f2ef8 \
  APR_BATCH_COHORT_OFFSET=9400 \
  APR_BATCH_EXPECTED_COUNT=83 \
  APR_BATCH_NTFY_DISABLED=1 \
  /usr/local/bin/node "$runner_path" >>"$launcher_log" 2>&1
