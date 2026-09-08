# Test naturale APR su 12 pratiche — esito finale

Il lotto si è arrestato prima della prima pratica con un blocco tecnico comune pubblicato da APR: `manifest_allowed_stages_required`.

## Conteggi

- Campione congelato: 12 pratiche, coorti 3074–3085.
- Elaborate: 0/12.
- Bozze salvate: 0.
- Intervento operatore per-pratica: 0.
- Blocchi tecnici per-pratica: 0.
- Pratiche incoerenti: 0.
- Rimaste in coda: 12.

Non è stato attribuito alcun verdetto alle singole pratiche perché nessuna ha iniziato l'elaborazione.

## Verifica indipendente

Le tre fonti concordano:

1. `launchctl`: sequencer eseguito una volta, terminato con codice 2.
2. Checkpoint e report persistenti: `stopped_common_technical_block`, 0 elaborate, motivo `manifest_allowed_stages_required`.
3. Journal persistente: evento `run_stopped_common_technical_block` con lo stesso motivo e nessuna pratica corrente.

## Sicurezza e vincoli

- Nessuna pratica ha raggiunto ENEA.
- Nessuna bozza è stata creata o salvata.
- Nessuna anteprima, invio o comunicazione è stata tentata.
- Keepalive rimasto attivo; Chrome non è stato arrestato.
- Nessuna diagnosi, correzione o modifica del sistema è stata eseguita dopo l'arresto.

Il motivo è riportato esattamente come pubblicato da APR, senza interpretazione causale, in conformità alla richiesta di lasciare gli arresti invariati e documentarli soltanto.
