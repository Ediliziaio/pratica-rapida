#!/bin/zsh
# Travaso automatico CRM vero -> ombra, ogni 600 s, in una sessione screen.
set -euo pipefail
name='crm_ombra_travaso'
root='/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida'
if /usr/bin/screen -ls 2>/dev/null | grep -q "\.${name}\b"; then echo "already_running:${name}"; exit 0; fi
/usr/bin/screen -dmS "$name" /bin/zsh -c "cd '$root' && exec npx vite-node ops/crm-ombra-travaso-2026-09-16/travaso.ts --loop 600"
/bin/sleep 1
/usr/bin/screen -ls | grep "\.${name}\b" && echo "started:${name}"
