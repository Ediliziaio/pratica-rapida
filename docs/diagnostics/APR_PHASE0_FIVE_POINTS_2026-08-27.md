# APR — Fase 0: chiusura tecnica dei cinque accertamenti

Data: 27 agosto 2026  
HEAD verificato: `4cccfd97eb56b80b2c09f20d1d7daa0ff94bc6ee`

Ambito: repository e stato persistente locale. Nessun accesso a CRM, ENEA o browser; nessuna installazione, attivazione o modifica di servizi; nessun test operativo.

## 1. Bundle canonico

Il contenuto installabile più recente e riproducibile è quello della coorte 76:

`/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-76-night-new-balanced-10/install`

Hash:

- supervisor: `ba6fa4897762ab727560c616b0c86c1806701462e626c51709b458611a1cda72`
- worker: `908791c85f446636cae9b9172eb12728f5b5d78c38f30d0d183061de73077107`
- watchdog: `f2c5e9f7d75abd88454b9e18dd2e778141b4423e69612c9fec4b9339174d3663`

I tre file coincidono byte-per-byte con la coorte 75 e con una ricostruzione deterministica dall'HEAD corrente.

Su autorizzazione esplicita dell'utente e stata aggiunta la sola designazione canonica, senza copia, installazione o avvio di servizi:

- puntatore atomico: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/current`;
- target: `../cohorts/apr-pilot-76-night-new-balanced-10/install`;
- ricevuta immutabile: schema `apr-bundle-promotion-receipt-v1`, stato `PASS`;
- artifact ID ricevuta: `66ccc2fbecd4ca2950feaee2276f442fdafe5c2dbdf141ade0bcee3f68588016`;
- commit/runtime revision: `4cccfd97eb56b80b2c09f20d1d7daa0ff94bc6ee`.

La rilettura attraverso il puntatore produce gli stessi tre SHA-256 riportati sopra; il puntatore latest e la ricevuta concordano su ID, stato e target.

## 2. Processi

Tre riscontri concordanti sulla coorte 76:

1. `launchctl print gui/501/<label>`: supervisor, worker e watchdog non caricati;
2. enumerazione PID reale: nessun processo corrispondente;
3. porta dashboard `4501`: nessun listener.

Checkpoint supervisor: `stopped`, PID nullo, ultimo heartbeat `2026-08-27T00:20:35.752Z`. Nessun processo è stato avviato o riavviato.

## 3. Suite locale

La sospensione osservata non era un nuovo deadlock APR. Cause:

- reporter standard senza avanzamento visibile durante test lenti;
- sandbox che vieta listener locali (`EPERM 127.0.0.1`);
- fixture CDP/macOS intrinsecamente lenta.

Riscontri:

- esecuzione diagnostica in sandbox, escluso CDP: 182 file, 180 PASS, 2 FAIL; 1.303 test PASS, 17 FAIL, tutti riconducibili al divieto di listener locale;
- fuori sandbox, `localDashboardServer.test.ts` + `cdpEneaBrowserDriver.test.ts`: 2 file PASS, 70/70 test PASS, 420,03 s;
- fuori sandbox, `aprResumeCheckpointGuard.test.ts`: 1 file PASS, 2/2 test PASS, 1,74 s.

La suite monolitica e stata poi eseguita fuori sandbox con reporter progressivo:

`npm test -- --maxWorkers=1 --reporter=dot --testTimeout=120000 --hookTimeout=120000`

Esito verificato:

- 183 file: 182 PASS, 1 FAIL;
- 1.370 test: 1.368 PASS, 2 FAIL;
- durata: 644,74 s;
- fallimenti entrambi in `cdpEneaBrowserDriver.test.ts`: timeout del caso Comune con apostrofo (il test conserva un limite locale esplicito di 30 s) e `apr_cdp_command_timeout:Runtime.evaluate` nel caso generatore.

Ripetizione isolata immediatamente successiva, fuori sandbox e sullo stesso HEAD:

- Comune con apostrofo: PASS in 29,725 s;
- generatore: PASS in 91,767 s;
- selezione complessiva: 2/2 PASS, durata 122,13 s.

Conclusione: la copertura composta precedente resta verde e i due test non mostrano un difetto funzionale deterministico quando isolati. La suite monolitica resta comunque **non certificata verde**, perche il giro unico ha prodotto due timeout; la sensibilita della fixture CDP/macOS al carico resta debito tecnico. Non e stata applicata alcuna correzione.

## 4. Replay locale del campione ampio

Fonte immutata:

- manifest: `apr-wide-blocker-snapshot-2026-08-26-e30a7f6.json`
- SHA-256: `5dd703d3dc4712454968ca16f99d9cb524d29476934c7ea1fcace88243b745a2`
- casi originari: 126;
- Vans nel manifest: 0;
- Vittorio Paolinelli: escluso soltanto da questo corpus, non tramite regola APR permanente;
- casi rigiocati: 125.

Il replay ha riapplicato parser, classificatore e gate correnti su copie temporanee dei checkpoint e dei testi locali. Due esecuzioni indipendenti hanno prodotto la stessa proiezione SHA-256: `7f19b8d5f761635c4e8d584ac731d4a7d81d6e0d32064439d93f6cbcc40b3968`.

Esito HEAD:

- 45 READY;
- 80 BLOCKED;
- 8 casi storicamente bloccati ora READY;
- 7 regressioni READY → BLOCKED;
- `gross_triple_reconciliation_failed`: 49/125 (39,2%) nello storico, 22/125 (17,6%) sull'HEAD.

Il “70%” non è riproducibile come frequenza del solo blocker economico: nel manifest storico quel blocker era presente in 49 casi. Un valore vicino al 70% descriveva invece la quota complessiva dei casi bloccati. Il replay non è monotono verde a causa delle sette regressioni.

Artefatto: `docs/diagnostics/apr-phase0-wide-head-replay-2026-08-27.json`.

## 5. Nove elementi preesistenti

I punti documentali 2-9 sono stati organizzati senza alterarne il contenuto; il punto 1 resta deliberatamente non committato in attesa dell'approvazione esplicita richiesta. Stato:

1. `AGENTS.md`: regola permanente di autorizzazione ENEA; candidata stabile. Nessun commit eseguito: serve approvazione esplicita.
2. `docs/archive/apr-fixed-corpus-block-01-2026-08-25/APR_FIXED_CORPUS_BLOCK_01_2026-08-25.json`: identità ed esclusioni del corpus fisso. Consolidato con manifest e risultati nel pacchetto storico indicizzato dalla relativa `README.md`; hash originario preservato.
3. `docs/archive/apr-fixed-corpus-block-01-2026-08-25/APR_FIXED_CORPUS_BLOCK_01_OPERATIONAL_MANIFEST_2026-08-25.json`: manifest operativo storico. Archiviato nello stesso pacchetto e non usato come fonte runtime attiva; hash originario preservato.
4. `docs/archive/apr-fixed-corpus-block-01-2026-08-25/APR_FIXED_CORPUS_BLOCK_01_RESULTS_2026-08-25.md`: risultati locali storici, non ENEA. Archiviato nello stesso pacchetto; hash originario preservato.
5. `docs/archive/claude-slice6-review-2026-08-24/apr-review-aa77f5d-slice6-completo.md`: pacchetto di revisione storico, indicizzato come archivio documentale; hash preservato.
6. `docs/archive/claude-slice6-review-2026-08-24/apr-review-recovery-slice6-completo.md`: pacchetto di revisione recovery storico, indicizzato come archivio documentale; hash preservato.
7. `docs/archive/claude-slice6-review-2026-08-24/apr-slice6-review-completo-con-diff.md`: raccolta completa di diff per revisione, consolidata tramite indice senza fondere o alterare il contenuto; hash preservato.
8. `docs/diagnostics/archive/superseded-2026-08-26/apr-wide-current-code-replay-2026-08-26.json`: replay sul commit `d89ed761…`, archiviato come `SUPERSEDED`; hash preservato e non usato come baseline corrente.
9. `docs/diagnostics/archive/superseded-2026-08-26/report-riverifica-manifest-etichette-2026-08-26.md`: relazione associata al replay precedente, archiviata con indice che rimanda al nuovo artefatto; hash preservato.

## Gate

La Fase 1 non è avviata. Restano necessarie:

- approvazione esplicita dell'utente per il commit della regola di autorizzazione ENEA in `AGENTS.md`;
- diagnosi dei due fallimenti della suite monolitica prima di certificarla verde;
- decisione sulla correzione generale del resolver zanzariere emersa in due delle sette regressioni apparenti.

L'indagine completa delle sette regressioni e in `docs/diagnostics/APR_PHASE0_SEVEN_REGRESSIONS_2026-08-27.md`: zero regressioni accidentali recenti, due difetti reali preesistenti del resolver resi visibili dal fail-closed e cinque false READY storiche. Nessuna correzione e stata applicata.
