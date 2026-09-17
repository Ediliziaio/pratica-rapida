#!/bin/zsh
set -euo pipefail

run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-runtime-decisions-r115-targeted21-20260911'

exec /usr/bin/caffeinate -i \
  /usr/bin/env \
  APR_BATCH_RUN_ID=apr-runtime-decisions-r115-targeted21-20260911 \
  'APR_BATCH_REPORT_TITLE=APR — mirato r115 sulle 21 decisioni runtime' \
  "APR_BATCH_RUN_ROOT=$run_root" \
  APR_BATCH_MANIFEST='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-runtime-decisions-r115-2026-09-11/manifest-targeted-21.json' \
  APR_BATCH_BUNDLE='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/versions/0ae77c33-runtime-decisions-r115-20260911' \
  APR_BATCH_MANIFEST_SHA256=7266a68302e59b0cc63f7154c16b0e4c6bc12c7c605d5cca517d2d95a660239f \
  APR_BATCH_WORKER_SHA256=6a0d11677a9d8fc056b7b375cae76a4d417d1f52325cb98ec99620fea33b0ccc \
  APR_BATCH_COHORT_OFFSET=6100 \
  APR_BATCH_EXPECTED_COUNT=21 \
  APR_BATCH_NTFY_DISABLED=1 \
  /usr/local/bin/node \
  /Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/scripts/enea-shadow-runner/simple-independent-runner.mjs
