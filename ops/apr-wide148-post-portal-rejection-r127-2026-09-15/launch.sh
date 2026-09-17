#!/bin/zsh
set -euo pipefail

run_root='/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-wide148-post-portal-rejection-r127-20260915'
screen_name='apr_wide148_post_portal_rejection_r127_20260915'
session_command='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-wide148-post-portal-rejection-r127-2026-09-15/controller-session-command.sh'

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
