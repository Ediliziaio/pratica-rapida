#!/bin/zsh
# Verifica di igiene macOS (2026-09-08): nessuna correzione nel codice sorgente
# tocca mai un LaunchAgent gia' caricato in precedenza da un comando `launchctl`
# scritto a mano. Questo script e' il modo mirato e non intrusivo (nessun
# system_profiler, nessuna app grafica) per accorgersi che qualcosa e' rimasto
# caricato oltre lo scopo del task che lo ha giustificato. Va eseguito a mano
# quando si sospetta un residuo, non e' collegato al gate di installazione.
set -euo pipefail

echo "== LaunchAgent com.praticarapida.* attualmente caricati =="
loaded=$(launchctl list | grep "praticarapida" || true)
if [ -z "$loaded" ]; then
  echo "(nessuno)"
else
  echo "$loaded"
fi

echo ""
echo "== file .plist com.praticarapida.* residui in ~/Library/LaunchAgents =="
stray_files=$(find "$HOME/Library/LaunchAgents" -maxdepth 1 -name "*praticarapida*.plist" 2>/dev/null || true)
if [ -z "$stray_files" ]; then
  echo "(nessuno)"
else
  echo "$stray_files"
fi

echo ""
if [ -n "$loaded" ] || [ -n "$stray_files" ]; then
  echo "ATTENZIONE: residui trovati. Per ognuno: confermare se e' un servizio APR"
  echo "permanente deliberato (worker/supervisore/watchdog di produzione, keepalive"
  echo "ENEA) o un LaunchAgent scritto a mano per un task una tantum mai rimosso."
  echo "Nel secondo caso: 'launchctl bootout gui/\$(id -u)/<label>' e rimuovere il file."
  exit 1
fi
echo "Pulito: nessun LaunchAgent com.praticarapida.* residuo oltre ai servizi attesi."
