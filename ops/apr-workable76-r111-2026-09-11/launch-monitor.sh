#!/bin/zsh
set -euo pipefail

run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable76-r111-20260911'
monitor_pid="$run_root/detached-monitor.pid"
monitor_log="$run_root/detached-monitor.log"
screen_name='apr_workable76_r111_monitor'
monitor_script='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-workable76-r111-2026-09-11/progress-monitor.mjs'

mkdir -p "$run_root"
current_screen_pid="$( ( /usr/bin/screen -ls 2>/dev/null || true ) | /usr/bin/awk -v name="$screen_name" '$1 ~ ("\\." name "$") { split($1, parts, "."); print parts[1]; exit }')"
if [[ -n "$current_screen_pid" ]]; then
  print -r -- "$current_screen_pid" >| "$monitor_pid"
  print -r -- "already_running:${current_screen_pid}:${screen_name}"
  exit 0
fi

/usr/bin/screen -dmS "$screen_name" /usr/bin/caffeinate -i /usr/local/bin/node "$monitor_script" >>"$monitor_log" 2>&1
/bin/sleep 1

screen_pid="$( ( /usr/bin/screen -ls 2>/dev/null || true ) | /usr/bin/awk -v name="$screen_name" '$1 ~ ("\\." name "$") { split($1, parts, "."); print parts[1]; exit }')"
if [[ -z "$screen_pid" ]]; then
  print -u2 -r -- "monitor_screen_session_not_found_after_start"
  exit 1
fi

print -r -- "$screen_pid" >| "$monitor_pid"
print -r -- "started:${screen_pid}:${screen_name}"
