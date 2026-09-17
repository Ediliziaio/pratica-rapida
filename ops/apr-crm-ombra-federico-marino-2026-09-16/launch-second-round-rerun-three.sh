#!/bin/zsh
set -euo pipefail

SOURCE_ROOT="/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida"
RUNTIME_ROOT="/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner"
BUNDLE="$RUNTIME_ROOT/canonical-bundle/versions/855b3373-patch-cf-sequencer-governed-20260916-20260916"
MANIFEST="$SOURCE_ROOT/ops/apr-crm-ombra-federico-marino-2026-09-16/manifest-second-round-rerun-three.json"
RUN_ID="apr-crm-ombra-second-round-rerun-three-20260916"
RUN_ROOT="$RUNTIME_ROOT/runs/$RUN_ID"
AUTHORIZATION_ID="user-2026-09-16-crm-ombra-second-round-with-staropoli-v1"
PREPARE="$SOURCE_ROOT/ops/apr-crm-ombra-federico-marino-2026-09-16/prepare-shadow-single-case.ts"

prepare_case() {
  local cohort="$1"
  local practice_id="$2"
  local customer_key="$3"
  local display_name="$4"
  local product_module="$5"
  local state_dir="$RUNTIME_ROOT/cohorts/apr-pilot-${cohort}-global-controller-${customer_key}"
  "$SOURCE_ROOT/node_modules/.bin/vite-node" "$PREPARE" \
    --runtime-root "$RUNTIME_ROOT" \
    --state-dir "$state_dir" \
    --history-root "$RUNTIME_ROOT/cohorts" \
    --source-root "$RUNTIME_ROOT/state" \
    --practice-id "$practice_id" \
    --customer-key "$customer_key" \
    --display-name "$display_name" \
    --authorization-id "$AUTHORIZATION_ID" \
    --experiment-id "$RUN_ID" \
    --product-module "$product_module"
}

prepare_case 10551 "2527ecd1-8dd6-479e-a6d9-e1eddabd2a93" "maria-luigia-fusco" "Maria Luigia Fusco" "infissi"
prepare_case 10552 "bc08d27a-0c8c-40cb-9c83-5c454a15b040" "amaranti-gigliola" "Amaranti Gigliola" "screening"
prepare_case 10553 "5aa5410c-f849-4dfc-b55a-ddccf911303e" "federico-marino" "Federico Marino" "screening"

export APR_BATCH_RUN_ID="$RUN_ID"
export APR_BATCH_REPORT_TITLE="APR CRM ombra - rilavorazione risposte deterministiche"
export APR_BATCH_RUN_ROOT="$RUN_ROOT"
export APR_BATCH_MANIFEST="$MANIFEST"
export APR_BATCH_BUNDLE="$BUNDLE"
export APR_BATCH_MANIFEST_SHA256="$(shasum -a 256 "$MANIFEST" | awk '{print $1}')"
export APR_BATCH_WORKER_SHA256="$(shasum -a 256 "$BUNDLE/apr-enea-worker.mjs" | awk '{print $1}')"
export APR_BATCH_COHORT_OFFSET="10550"
export APR_BATCH_EXPECTED_COUNT="3"
export APR_BATCH_NTFY_DISABLED="1"

exec /usr/local/bin/node "$SOURCE_ROOT/scripts/enea-shadow-runner/simple-independent-runner.mjs"
