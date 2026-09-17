#!/bin/zsh
set -euo pipefail

SOURCE_ROOT="/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida"
RUNTIME_ROOT="/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner"
BUNDLE="$RUNTIME_ROOT/canonical-bundle/versions/855b3373-patch-cf-sequencer-governed-20260916-20260916"
MANIFEST="$SOURCE_ROOT/ops/apr-crm-ombra-ready-three-2026-09-17/manifest.json"
RUN_ID="apr-crm-ombra-ready-three-20260917"
RUN_ROOT="$RUNTIME_ROOT/runs/$RUN_ID"
AUTHORIZATION_ID="user-2026-09-17-crm-ombra-ready-three-draft-only-v1"
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

prepare_case 10561 "5bd45fbe-1700-4d13-b545-ecd9a48b7e27" "daniele-miracapillo" "DANIELE MIRACAPILLO" "infissi"
prepare_case 10562 "2c8fd0ba-d51f-4a53-b58c-e50c30a4922b" "alessandro-mantelli" "Alessandro Mantelli" "screening"
prepare_case 10563 "34572044-6e01-465a-ab01-f937d3ec4b87" "marco-zambella" "Marco Zambella" "screening"

export APR_BATCH_RUN_ID="$RUN_ID"
export APR_BATCH_REPORT_TITLE="APR CRM ombra - Miracapillo, Mantelli, Zambella"
export APR_BATCH_RUN_ROOT="$RUN_ROOT"
export APR_BATCH_MANIFEST="$MANIFEST"
export APR_BATCH_BUNDLE="$BUNDLE"
export APR_BATCH_MANIFEST_SHA256="$(shasum -a 256 "$MANIFEST" | awk '{print $1}')"
export APR_BATCH_WORKER_SHA256="$(shasum -a 256 "$BUNDLE/apr-enea-worker.mjs" | awk '{print $1}')"
export APR_BATCH_COHORT_OFFSET="10560"
export APR_BATCH_EXPECTED_COUNT="3"
export APR_BATCH_NTFY_DISABLED="1"

exec /usr/local/bin/node "$SOURCE_ROOT/scripts/enea-shadow-runner/simple-independent-runner.mjs"
