#!/bin/zsh
set -uo pipefail

source_root='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida'
runtime_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner'
bundle="$runtime_root/canonical-bundle/versions/e5c6096c-authoritative-economic-questions-r116-20260911"
worker_sha='75c629d7e69dd934a10c5d196b2a8e99a39a3709ed7ada2dea8e4766c0785a82'
target_manifest="$source_root/ops/apr-runtime-decisions-r115-2026-09-11/manifest-targeted-21.json"
target_manifest_sha='7266a68302e59b0cc63f7154c16b0e4c6bc12c7c605d5cca517d2d95a660239f'
target_root="$runtime_root/runs/apr-authoritative-economic-questions-r116-targeted21-20260912"
long_manifest="$source_root/ops/apr-workable76-r111-2026-09-11/manifest.json"
long_manifest_sha='4be8287c7ec661404fc5d2b13b5e8bd1f492d876c6f6793ed3b374e8d2a54210'
long_root="$runtime_root/runs/apr-authoritative-economic-questions-r116-workable76-20260912"
runner="$source_root/scripts/enea-shadow-runner/simple-independent-runner.mjs"
orchestrator_root="$source_root/ops/apr-authoritative-economic-questions-r116-2026-09-12/runtime-orchestration"
log="$orchestrator_root/controller.log"
state="$orchestrator_root/state.json"
ntfy='https://ntfy.sh/apr-giuliano-x7q2m9'

mkdir -p "$target_root" "$orchestrator_root"
notify() { /usr/bin/curl -fsS -d "$1" "$ntfy" >/dev/null 2>&1 || true; }
write_state() {
  /usr/local/bin/node -e 'const fs=require("fs"),p=process.argv[1],v=JSON.parse(process.argv[2]),t=p+".tmp-"+process.pid;fs.writeFileSync(t,JSON.stringify(v,null,2)+"\n",{mode:0o600});fs.renameSync(t,p)' "$state" "$1"
}
report_value() { /usr/bin/jq -r "$2 // empty" "$1" 2>/dev/null; }

print -r -- "$(date -u +%Y-%m-%dT%H:%M:%SZ) target_start bundle=$bundle worker_sha=$worker_sha" >>"$log"
write_state '{"phase":"targeted_running","targetedThreshold":12,"longAuthorized":true}'
notify 'APR r116: mirato sulle 21 avviato.'

/usr/bin/caffeinate -i /usr/bin/env \
  APR_BATCH_RUN_ID=apr-authoritative-economic-questions-r116-targeted21-20260912 \
  'APR_BATCH_REPORT_TITLE=APR — mirato r116 sulle 21 pratiche' \
  "APR_BATCH_RUN_ROOT=$target_root" \
  "APR_BATCH_MANIFEST=$target_manifest" \
  "APR_BATCH_BUNDLE=$bundle" \
  "APR_BATCH_MANIFEST_SHA256=$target_manifest_sha" \
  "APR_BATCH_WORKER_SHA256=$worker_sha" \
  APR_BATCH_COHORT_OFFSET=6300 \
  APR_BATCH_EXPECTED_COUNT=21 \
  APR_BATCH_NTFY_DISABLED=1 \
  /usr/local/bin/node "$runner" >>"$log" 2>&1
target_exit=$?
target_status="$(report_value "$target_root/report.json" '.status')"
target_processed="$(report_value "$target_root/report.json" '.processed')"
target_saved="$(report_value "$target_root/report.json" '.saved')"

if [[ "$target_exit" -ne 0 || "$target_status" != 'completed' || "$target_processed" != '21' ]]; then
  write_state "{\"phase\":\"controller_failed\",\"lot\":\"targeted21\",\"exitCode\":$target_exit,\"status\":\"$target_status\",\"processed\":${target_processed:-0}}"
  notify "ALLARME APR r116: controller mirato interrotto (${target_processed:-0}/21, stato ${target_status:-assente})."
  exit 2
fi

print -r -- "$(date -u +%Y-%m-%dT%H:%M:%SZ) target_complete saved=$target_saved" >>"$log"
notify "APR r116: mirato concluso, salvate $target_saved su 21."
if [[ "$target_saved" -lt 12 ]]; then
  write_state "{\"phase\":\"stopped_below_threshold\",\"targetedSaved\":$target_saved,\"threshold\":12}"
  exit 0
fi

mkdir -p "$long_root"
print -r -- "$(date -u +%Y-%m-%dT%H:%M:%SZ) long_start bundle=$bundle worker_sha=$worker_sha" >>"$log"
write_state "{\"phase\":\"long76_running\",\"targetedSaved\":$target_saved,\"threshold\":12}"
notify "APR r116: soglia superata ($target_saved/21), giro sulle 76 avviato."

/usr/bin/caffeinate -i /usr/bin/env \
  APR_BATCH_RUN_ID=apr-authoritative-economic-questions-r116-workable76-20260912 \
  'APR_BATCH_REPORT_TITLE=APR — giro completo r116 sulle 76 pratiche' \
  "APR_BATCH_RUN_ROOT=$long_root" \
  "APR_BATCH_MANIFEST=$long_manifest" \
  "APR_BATCH_BUNDLE=$bundle" \
  "APR_BATCH_MANIFEST_SHA256=$long_manifest_sha" \
  "APR_BATCH_WORKER_SHA256=$worker_sha" \
  APR_BATCH_COHORT_OFFSET=6400 \
  APR_BATCH_EXPECTED_COUNT=76 \
  APR_BATCH_NTFY_DISABLED=1 \
  /usr/local/bin/node "$runner" >>"$log" 2>&1
long_exit=$?
long_status="$(report_value "$long_root/report.json" '.status')"
long_processed="$(report_value "$long_root/report.json" '.processed')"
long_saved="$(report_value "$long_root/report.json" '.saved')"

if [[ "$long_exit" -ne 0 || "$long_status" != 'completed' || "$long_processed" != '76' ]]; then
  write_state "{\"phase\":\"controller_failed\",\"lot\":\"long76\",\"targetedSaved\":$target_saved,\"exitCode\":$long_exit,\"status\":\"$long_status\",\"processed\":${long_processed:-0}}"
  notify "ALLARME APR r116: controller giro 76 interrotto (${long_processed:-0}/76, stato ${long_status:-assente})."
  exit 2
fi

write_state "{\"phase\":\"completed\",\"targetedSaved\":$target_saved,\"longSaved\":$long_saved}"
print -r -- "$(date -u +%Y-%m-%dT%H:%M:%SZ) long_complete saved=$long_saved" >>"$log"
notify "APR r116: giro sulle 76 concluso, salvate $long_saved su 76."

