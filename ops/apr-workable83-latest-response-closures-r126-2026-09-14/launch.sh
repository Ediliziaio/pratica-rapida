#!/bin/zsh
set -euo pipefail

run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable83-latest-response-closures-r126-20260914'
screen_name='apr_workable83_latest_response_closures_r126'
session_command='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-workable83-latest-response-closures-r126-2026-09-14/controller-session-command.sh'

mkdir -p "$run_root"
current_screen_pid="$( ( /usr/bin/screen -ls 2>/dev/null || true ) | /usr/bin/awk -v name="$screen_name" '$1 ~ ("\\." name "$") { split($1, parts, "."); print parts[1]; exit }')"
if [[ -n "$current_screen_pid" ]]; then
  print -r -- "already_running:${current_screen_pid}:${screen_name}"
  exit 0
fi

/usr/bin/screen -dmS "$screen_name" /bin/zsh "$session_command"
/bin/sleep 1
screen_pid="$( ( /usr/bin/screen -ls 2>/dev/null || true ) | /usr/bin/awk -v name="$screen_name" '$1 ~ ("\\." name "$") { split($1, parts, "."); print parts[1]; exit }')"
if [[ -z "$screen_pid" ]]; then
  print -u2 -r -- "screen_session_not_found_after_start"
  exit 1
fi
print -r -- "started:${screen_pid}:${screen_name}"
