# Diagnosi — sessione ENEA scaduta non propagata al lotto

## Requisito vincolante del titolare

La scadenza della sessione ENEA:

1. non deve far cadere pratiche in silenzio;
2. deve fermare l'intero giro con lo stato pubblico **«sessione ENEA scaduta»**;
3. deve avvisare Giuliano.

Questa consegna e solo diagnosi read-only. Non contiene correzioni al bundle, al worker, al sequencer o al runner; la progettazione della correzione e rinviata a Claude.

## Verdetto

Il keepalive **non era fermo**: entrambi i processi r115 e r124 erano attivi e continuavano a produrre prove server read-only aggiornate. Il file `state/readiness-lease/checkpoint.json` e obsoleto perche i due keepalive non usano ne aggiornano `PersistentReadinessLease`; scrivono invece `enea-browser-worker/service.json`, `enea-browser-worker/cdp-driver.json` e `enea-browser-worker/server-readonly-proof.json` nei rispettivi `state-dir`.

Il worker delle coorti Ugo Caselli **ha riconosciuto l'assenza di una sessione autenticata** e ha pubblicato `login_required`. La perdita semantica avviene dopo: il sequencer attende cinque minuti, trasforma l'evento in `common_technical_block` ma lascia la pratica `working` e `processed: 0`; il runner esterno non riconosce questo report come terminale, lo sostituisce con `single_case_runner_exited_without_terminal_result:2` e continua perche possiede uno stop globale solo per l'autenticazione CRM, non per ENEA.

Quindi la causa radice e una **mancata propagazione dello stato globale ENEA tra quattro livelli** (worker → sequencer → runner esterno → notifica), aggravata dalla presenza di due store di readiness non collegati.

## 1. Perche `readiness-lease/checkpoint.json` non riceve piu prove

### Processo e destinazioni reali

- `apr_keepalive_r124` esegue il worker con `--state-dir` uguale alla radice runtime globale: `ops/apr-r124-short-rounds-2026-09-14/keepalive-session-command.sh:4-17`.
- `apr_keepalive_r115` usa invece una radice privata sotto `ops/.../keepalive-state`: `ops/apr-runtime-decisions-r115-2026-09-11/keepalive-session-command.sh:4-17`.
- Entrambi condividono profilo Chrome e porta CDP 9331, ma persistono lo stato del keepalive nel sottodominio `enea-browser-worker` del proprio `state-dir`.

Il processo `apr-enea-worker-cli.ts` importa e costruisce `PersistentAprEneaWorkerService`, `CdpEneaBrowserDriver` e il controller browser, ma non importa ne costruisce `PersistentReadinessLease`: `scripts/enea-shadow-runner/apr-enea-worker-cli.ts:1-30`. In setup read-only verifica la sessione e registra `login_required` oppure `setup_ready` nel service store: `scripts/enea-shadow-runner/apr-enea-worker-cli.ts:212-240`.

`PersistentAprEneaWorkerService` scrive la prova server in `enea-browser-worker/server-readonly-proof.json`: `scripts/enea-shadow-runner/aprEneaBrowserWorkerService.ts:270-276`.

Lo store separato `PersistentReadinessLease` vive in `<state-dir>/readiness-lease/checkpoint.json`: `scripts/enea-shadow-runner/readinessLease.ts:192-200`. Le API capaci di aggiornarlo esistono (`recordAuthenticatedKeepalive`, righe 446-518), ma il worker/keepalive non le chiama. Nel runtime corrente le sole costruzioni di `PersistentReadinessLease` sono dashboard, supervisor, CLI readiness e test; non il worker di keepalive.

### Prove persistenti

- Store legacy: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state/readiness-lease/checkpoint.json` — ultimo evento `2026-08-14T20:24:38.360Z`, stato `expired`, revisione 21.
- Keepalive r124: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state/enea-browser-worker/server-readonly-proof.json` — prova aggiornata il `2026-09-15T21:34:19.735Z`, URL operativo `https://bonusfiscali.enea.it/dashboard`, fingerprint profilo `0ffd88dd...bc9b`, azioni vietate 0.
- Keepalive r115: `/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-runtime-decisions-r115-2026-09-11/keepalive-state/enea-browser-worker/server-readonly-proof.json` — prova aggiornata il `2026-09-15T21:34:20.319Z`, stesso profilo e stesso target ENEA, azioni vietate 0.

Conclusione: il file readiness del 14 agosto non e il journal corrente dei keepalive. La dashboard che lo mostra combina due sottosistemi diversi e fa apparire il keepalive privo di prove, mentre le prove esistono altrove.

## 2. Perche la sessione scaduta diventa `single_case_runner_exited_without_terminal_result`

### Il worker rileva la sessione non autenticata

`CdpEneaBrowserDriver.verifySession()` combina indicatori DOM e due GET server con credenziali, poi restituisce `authenticated` e `serverLogoutProven`: `scripts/enea-shadow-runner/cdpEneaBrowserDriver.ts:719-787`.

Nel worker di setup, se `authenticated` e falso, viene sempre scritto `service.status = login_required`; la formulazione e “Logout ENEA provato” solo se `serverLogoutProven` e vero, altrimenti “Autenticazione ENEA non ancora dimostrata”: `scripts/enea-shadow-runner/apr-enea-worker-cli.ts:229-230`.

Le coorti fallite di Ugo lo confermano:

- `apr-pilot-10156-global-controller-ugo-caselli/enea-browser-worker/service.json`: piu eventi `login_required`, tra cui `2026-09-15T21:19:06.935Z` e `21:19:43.722Z`, motivo “Autenticazione ENEA non ancora dimostrata nel profilo APR”.
- `apr-pilot-10301-global-controller-ugo-caselli/enea-browser-worker/service.json`: stesso comportamento nel secondo tentativo.
- In entrambe, `enea-draft-execution/checkpoint.json` resta invece `status: ready`, item `queued`, motivo “Payload TEST e gate portale verdi; in attesa della sessione ENEA”.

Non e quindi corretto dire che il worker non ha visto il problema: lo ha visto nel proprio service store. Non e riuscito a trasformarlo in una prova terminale globale condivisa.

### Il sequencer perde il verdetto

Il sequencer legge `service.status === login_required`, ma non termina subito. Avvia un guardiano di attesa: `ops/apr-global-controller-test10-2026-08-29/sequencer.mjs:488-523`.

Il guardiano aspetta cinque minuti senza progresso prima di restituire `common_block`: `ops/apr-global-controller-test10-2026-08-29/sequencerSessionGuard.mjs:1-2` e `45-93`.

Scaduta la soglia, il sequencer genera un errore tecnico comune (`session_unavailable_after_stall_threshold`), non uno stato terminale `sessione ENEA scaduta`: `ops/apr-global-controller-test10-2026-08-29/sequencer.mjs:547-553`. Il catch persiste `stopped_common_technical_block`, lascia il caso senza risultato e termina con exit code 2: `ops/apr-global-controller-test10-2026-08-29/sequencer.mjs:650-664`.

Le prove reali sono:

- `.../archived-runs/session-expired/apr-wide148-post-portal-rejection-r127-20260915/case-10156-ugo-caselli/report.json`: `processed: 0`, caso `working`, `commonTechnicalBlock` generico.
- stesso esito in `case-10301-ugo-caselli/report.json`.
- i rispettivi `sequencer.log` mostrano heartbeat su `execution-terminal-truth` per circa cinque minuti, poi `run_stopped_common_technical_block`.

### Il runner esterno lo degrada e continua

Il runner accetta il risultato del figlio solo se `processed === 1` e lo stato del caso e terminale. Altrimenti costruisce un `technical_block` sintetico: `scripts/enea-shadow-runner/simple-independent-runner.mjs:226-242`.

Il testo sintetico viene creato come `single_case_runner_exited_without_terminal_result:<exit>`: `scripts/enea-shadow-runner/simple-independent-runner.mjs:690-695`.

Lo stop globale del runner e implementato esclusivamente per `external_crm_authentication_unavailable`: `scripts/enea-shadow-runner/simple-independent-runner.mjs:698-712`. Non esiste l'equivalente ENEA. Per questo Ugo viene registrata come blocco tecnico, entra nella policy di rilavorazione e il lotto puo passare oltre.

## 3. Prova della sessione ristabilita

Tre riscontri indipendenti concordano:

1. keepalive r124: prova server read-only `2026-09-15T21:34:19.735Z`, dashboard autenticata, target ENEA `5A80C5AA22DAECA06C12BC1E09EABA5C`;
2. keepalive r115: seconda prova server read-only `2026-09-15T21:34:20.319Z`, stesso profilo e target, store indipendente;
3. coorte 10302 Ugo Caselli: dopo il login il worker ha completato 8/8 pagine e il server ha confermato la bozza 501023; `case-10302-ugo-caselli/report.json` termina `saved`, senza preview, submit o comunicazioni.

La sessione ENEA era quindi nuovamente autenticata prima del rilancio.

## 4. Gestione del run interrotto e rilancio

Il vecchio run e stato fermato al confine reale della pratica: il controllore e stato congelato, Ugo ha terminato, il worker ha pubblicato `status: stopped` con `currentCustomerKey: null`, poi il solo controllore del lotto e stato terminato. Chrome, i due keepalive e la dashboard non sono stati arrestati.

Il run e stato spostato fuori da `runs/` in:

`/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/archived-runs/session-expired/apr-wide148-post-portal-rejection-r127-20260915`

Di conseguenza non entra nella scansione storica del cricchetto. Il record strutturato e `ops/apr-sessione-enea-scaduta-2026-09-15/run-interruption-apr-wide148-post-portal-rejection-r127.json`.

Il nuovo run fresco e:

`apr-wide148-post-spid-login-r127-20260915`

- stesso manifest SHA-256 `64c53c2618e79bd407ffe8f269ab12b495d547a1e5153bd80529def4b73fc8cd`;
- stesso bundle `53d58e3c-post-wide148-portal-rejection-r127-20260915`;
- stesso worker SHA-256 `8a6faaadb2fcd226b109c50b7cb93ccf01ffebc4f09839342fcd6ba8c0a4e38f`;
- runner SHA-256 `3222182522fab5ae6320b4e7b03675947d5cfab2a35efaea9685cda09cfd1a48`;
- generazioni fresche, coorti 10303-10450.

## 5. Punti che la correzione futura deve chiudere

Senza prescrivere qui l'implementazione, il difetto non e chiuso finche:

- il keepalive autenticato aggiorna una sola fonte di verita readiness/sessione, oppure il vecchio store viene ritirato come fonte pubblica;
- `login_required` ENEA diventa immediatamente un evento globale strutturato consumabile dal sequencer, senza attendere il timeout di stallo;
- il sequencer produce un report terminale di lotto con causa `sessione ENEA scaduta`, non un caso `working` con `processed: 0`;
- il runner esterno riconosce tale evento, ferma il lotto e non attiva rilavorazioni o pratiche successive;
- la notifica a Giuliano e persistita e inviata una sola volta per episodio;
- un test end-to-end parte da una risposta server/DOM di login e dimostra: nessuna pratica persa, lotto fermo, stato esplicito, notifica registrata.
