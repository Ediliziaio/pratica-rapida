# Arresto di sicurezza wide100 r26 — riavvio keepalive per lock globale corrotto

- Rilevato: 2026-09-02 12:28 CEST
- Lotto: `apr-wide100-current-cohort-bridge-r25`
- Bundle: `versions/5b282fac-co-beneficiary-single-intent-r26-20260902`
- Manifest immutato: SHA-256 `51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0`
- Stato aggregato: 28/100 terminali; 4 `saved`, 23 `operator_required`, 1 `technical_block`, 0 `inconsistent`, 72 rimanenti.

## Anomalia verificata

Il LaunchAgent `com.praticarapida.apr-enea-immortal-keepalive` è passato da `runs = 1`, PID 3784 e `last exit code = (never exited)` a `runs = 2`, PID 6590 e `last exit code = 1`. Chrome APR è rimasto sul PID 3785 e la sessione ENEA è rimasta autenticata.

La causa immediata dell'uscita, registrata in `worker.stderr.log` alle 12:26 CEST, è:

`apr_global_browser_lock_corrupt_fail_closed`

Lo stack persistito indica `PersistentAprEneaGlobalBrowserController.readLock` durante `tryAcquire`. Il lock esclusivo non era più presente al controllo successivo, dopo la ripresa automatica e il rilascio degli accessi; pertanto non viene attribuita una causa più profonda della corruzione senza una diagnosi separata.

## Tripla verifica

1. `launchctl` conferma il riavvio una sola volta del keepalive (`runs = 2`, PID 6590, exit precedente 1) e Chrome ancora vivo sul PID 3785.
2. `enea-browser-worker/service.json` del keepalive pubblica nuovamente `setup_ready`, heartbeat corrente, PID 6590 e Chrome PID 3785; il checkpoint del controllore globale è valido v2 e senza owner attivo dopo la quiescenza.
3. `server-readonly-proof.json` conferma la dashboard ENEA sul medesimo target CDP, con `forbiddenActionCount`, `previewAttemptCount`, `submitAttemptCount` e `communicationAttemptCount` tutti a zero.

Le tre fonti concordano sul ripristino della sessione, ma la continuità richiesta è stata violata dal riavvio del processo keepalive. È quindi un problema tecnico comune e imprevisto, non un esito per-pratica.

## Arresto fail-closed

Sono stati scaricati soltanto il sequencer wide100 e supervisor/worker/watchdog della coorte 2949. Keepalive e Chrome non sono stati spenti.

La pratica corrente Lia Chiericati aveva bozza `453823`, 0/8 pagine e checkpoint `recovery_queued`; il checkpoint dichiara un solo recupero automatico autorizzato dopo verifica read-only di una pagina non persistita. Nessun nuovo verdetto è stato attribuito alla pratica e non è stato eseguito alcun retry dopo l'arresto.

Il lotto resta fermo in attesa di autorizzazione esplicita per diagnosticare e correggere la causa generale del lock globale corrotto. Nessun codice è stato modificato.

## Diagnosi causale r27

La causa non era un contenuto business della pratica Lia Chiericati e non era un lock persistente realmente malformato. Il protocollo di creazione usava `openSync(lockPath, "wx")` seguito da `writeFileSync`, `fsyncSync` e `closeSync`: il pathname del target diventava quindi visibile agli altri processi dopo `open`, quando il file era ancora lungo zero byte o conteneva JSON parziale. Un concorrente che entrava in `readLock()` in quella finestra vedeva il target, non poteva decodificarlo e applicava correttamente il fail-closed `apr_global_browser_lock_corrupt_fail_closed`.

La riproduzione deterministica precedente alla correzione è `prove-lock-publication-race-r27.ts` (SHA-256 `ae3f4a3281428ee8c5b0a6df9cacf6d59edf6f93a909678434e727e05eb2aae3`): pathname visibile, `bytesBeforeWrite=0`, lettore concorrente in `apr_global_browser_lock_corrupt_fail_closed`.

## Correzione generale

La regola `system-global-browser-lock-atomic-publication-v1` scrive ora il JSON completo in un inode temporaneo univoco nello stesso directory, esegue `fsync` e `close`, quindi lo pubblica in un'unica operazione con `linkSync(temporary, lockPath)`. L'hard link conserva l'esclusività: `EEXIST` significa contesa e non sostituisce mai l'incumbent. Dopo il link viene sincronizzato il directory e il temporaneo è sempre rimosso. Un target già pubblicato e malformato continua a produrre lo stesso errore fail-closed; non è stato aggiunto alcun recupero permissivo.

Registro `enea-operational-registry-v101`, matrice `apr-enea-rule-test-matrix-v79`.

## Gate e installazione

- Test mirati: 56/56 verdi più typecheck verde.
- Primo gate integrato nel sandbox: non accettato, perché `listen(127.0.0.1)` era vietato con `EPERM`; nessuna installazione è avvenuta su tale evidenza.
- Gate integrato ripetuto con loopback consentito: 414/414 suite, 1591/1591 test, 89/89 chiavi con prova positiva e negativa.
- Stato monotono prima dell'installazione: `tested_not_deployed`.
- Bundle installato: `canonical-bundle/versions/7ec0aaf1-global-browser-lock-atomic-r27-20260902`.
- Stato dopo l'installazione: `active_tested_deployed`, fingerprint sorgente `fdeaddd1f82cb0258e315fa7cbce5c9ee1c3db66d45c9ebed11ebcdbb02a574e`.
- Report Vitest SHA-256 `2046d78fbd146eab6c9d68fbdafc188fba48da2157e01ce0fcb7133c9d288fc9`.
- Evidenza regole SHA-256 `841a295b7c4c3fcf53d743f918dce6526381a176dfac0ffdb40bbf58d858134b`.

Il keepalive è stato sostituito da launchd soltanto dopo il gate e l'installazione: PID precedente 6590, PID r27 24612. Chrome è rimasto invariato al PID 3785, avviato il 1 settembre 2026 alle 16:00:32. Il checkpoint globale r27 registra `system-global-browser-lock-atomic-publication-v1`; la prova server read-only osserva `https://bonusfiscali.enea.it/dashboard` con tutti i contatori vietati a zero.
