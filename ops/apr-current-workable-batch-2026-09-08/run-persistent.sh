#!/bin/zsh
set -euo pipefail

export APR_BATCH_RUN_ID="apr-current-workable-batch-r86-20260908"
export APR_BATCH_REPORT_TITLE="APR r86 — originali lavorabili e nuove pipeline"
export APR_BATCH_RUN_ROOT="/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-current-workable-batch-r86-20260908"
export APR_BATCH_MANIFEST="/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-current-workable-batch-2026-09-08/manifest.json"
export APR_BATCH_MANIFEST_SHA256="45c105f7f9f84db093aa2c2b733cfd81bb7375b3f691636ffc0060d3875f34e6"
export APR_BATCH_EXPECTED_COUNT="105"
export APR_BATCH_BUNDLE="/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/f6f8e746-deep-review-terminal-gate-r86-20260907"
export APR_BATCH_WORKER_SHA256="fbf41cdd351262848387183d76323769f7c2cd06de73dc370363d96cda491ce0"
export APR_BATCH_COHORT_OFFSET="3426"

exec /usr/local/bin/node "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-wide100-final-r67-2026-09-06/simple-independent-runner.mjs"
