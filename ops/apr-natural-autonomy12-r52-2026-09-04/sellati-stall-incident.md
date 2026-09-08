# Arresto del lotto naturale — Claudia Sellati

Il lotto è stato fermato su richiesta dopo avere confermato che Claudia Sellati non stava avanzando sul portale ENEA.

## Verdetto

La pratica deve essere classificata esclusivamente `INCONSISTENT`: le fonti non concordano.

- Processo: erano vivi soltanto sequencer e supervisore; worker e watchdog della coorte 3075 non erano caricati.
- Checkpoint: preflight comune e prodotti `ready_local_plan`; esecuzione ENEA mai preparata, revisione 0, nessun item, nessun bridge e nessun servizio worker.
- Dashboard `/api/case-truth`: `READY`, zero blocker e «nessun problema».
- Sequencer: continuava invece a mostrare Sellati come `working` in fase `monitoring`.

Non è stata creata alcuna bozza per Sellati e non è stata completata alcuna pagina.

## Cosa è successo

Dopo il preflight verde, il sequencer ha intercettato un’eccezione case-local prima di persistere `case_infissi_validation_gate_prepared` e prima di avviare il worker. Il percorso di isolamento ha poi atteso una verità terminale da un’esecuzione che non era mai partita.

Con la continuità attiva, questa attesa non aveva una scadenza effettiva: il supervisore continuava a pubblicare heartbeat di un runner a revisione 0 e coda vuota. Per questo il servizio appariva attivo, ma non esisteva progresso reale.

L’eccezione iniziale non è stata persistita dal bulkhead e quindi non può essere identificata con certezza dagli artefatti. Lo stesso comando di riconciliazione prodotti, eseguito su una copia locale dello stato, è terminato correttamente con exit code 0 e Sellati `READY`. Non attribuisco quindi un nome non dimostrato all’errore iniziale.

Il difetto strutturale dimostrato è invece preciso: il percorso di isolamento può attendere indefinitamente quando l’errore avviene prima della creazione dell’esecuzione e del worker.

## Arresto e sicurezza

- Sequencer del lotto e supervisore 3075 arrestati.
- Worker e watchdog 3075 erano già assenti.
- Keepalive e Chrome APR preservati.
- Nessuna anteprima, invio o comunicazione.
- Nessuna modifica a codice, bundle o checkpoint/recovery.
- Nessun rilancio effettuato.
