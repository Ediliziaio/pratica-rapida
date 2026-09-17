#!/bin/zsh
set -euo pipefail

runner="/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/scripts/enea-shadow-runner/simple-independent-runner.mjs"
bundle="/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/95ef720e-document-type-fattura-narrative-batch-r99-governed-20260909"
worker_sha="84b19a9055a5d8d621a9c50735fb32acee69b216c9a27aab4dbdf141a6bdecfb"

APR_BATCH_RUN_ID="apr-wide100-r99-governed-20260909" \
APR_BATCH_REPORT_TITLE="APR r99 — 100 pratiche originali" \
APR_BATCH_RUN_ROOT="/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-wide100-r99-governed-20260909" \
APR_BATCH_MANIFEST="/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-wide100-province-lineage-2026-09-02/manifest.json" \
APR_BATCH_MANIFEST_SHA256="51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0" \
APR_BATCH_EXPECTED_COUNT="100" \
APR_BATCH_BUNDLE="$bundle" \
APR_BATCH_WORKER_SHA256="$worker_sha" \
APR_BATCH_COHORT_OFFSET="4800" \
APR_BATCH_NTFY_DISABLED="1" \
/usr/local/bin/node "$runner"

APR_BATCH_RUN_ID="apr-pronte-da-fare-r99-governed-20260909" \
APR_BATCH_REPORT_TITLE="APR r99 — pipeline Pronte da fare" \
APR_BATCH_RUN_ROOT="/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-pronte-da-fare-r99-governed-20260909" \
APR_BATCH_MANIFEST="/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-pronte-da-fare-r99-2026-09-09/manifest.json" \
APR_BATCH_MANIFEST_SHA256="2a1e2ffedb6044afab7b36b138f48de6837870498de5335db1a67230217dd15c" \
APR_BATCH_EXPECTED_COUNT="31" \
APR_BATCH_BUNDLE="$bundle" \
APR_BATCH_WORKER_SHA256="$worker_sha" \
APR_BATCH_COHORT_OFFSET="5000" \
APR_BATCH_NTFY_DISABLED="1" \
/usr/local/bin/node "$runner"
