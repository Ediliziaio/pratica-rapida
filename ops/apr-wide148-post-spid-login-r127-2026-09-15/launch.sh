#!/bin/zsh
set -euo pipefail

screen_name='apr_wide148_post_spid_login_r127_20260915'
command_file='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-wide148-post-spid-login-r127-2026-09-15/controller-session-command.sh'

if /usr/bin/screen -ls | /usr/bin/grep -Fq ".${screen_name}"; then
  print -u2 -r -- "screen_already_running:${screen_name}"
  exit 1
fi

exec /usr/bin/screen -dmS "$screen_name" /bin/zsh "$command_file"
