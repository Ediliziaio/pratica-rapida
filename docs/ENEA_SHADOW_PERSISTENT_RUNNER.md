# Runner persistente CRM ombra ENEA

Questo componente è esclusivamente locale. Non apre browser e non contiene client ENEA, CRM, Supabase, produzione, email o messaggistica.

## Comandi

```sh
npm run enea:runner -- init
npm run enea:runner -- run
npm run enea:runner -- status
npm run enea:supervisor -- once
npm run enea:supervisor -- serve
npm run enea:supervisor -- status
npm run enea:adapter -- status
npm run enea:adapter -- fixture
npm run enea:service -- prepare
npm run enea:service -- verify
npm run test:enea-restart
```

Lo stato predefinito vive in `.enea-shadow-runtime/` (ignorata da Git):

- `checkpoints/checkpoint-*.json`: revisioni complete, immutabili e sincronizzate su disco;
- `HEAD`: puntatore informativo; il recupero scandisce comunque i checkpoint validi;
- `runner.lock/`: lock atomico di breve durata per ogni transizione;
- `stale-locks/`: lock scaduti conservati per diagnosi;
- `dashboard/status.json`: stato macchina leggibile;
- `dashboard/index.html`: dashboard locale statica. Il software non la apre automaticamente.
- `supervisor/checkpoint.json`: lease, heartbeat, URL, contatore ripristini e audit del supervisore.
- `readiness-lease/checkpoint.json`: readiness/lease atomica, owner, scadenza, keepalive, gate globale e audit con ID regola.
- `read-only-adapter/checkpoint.json`: identità fixture, allowlist, fingerprint delle prove, keepalive e audit dell'adattatore.

Il supervisore HTTP usa esclusivamente loopback. Con la porta predefinita la dashboard è:

```text
http://127.0.0.1:4317/
```

Le API locali read-only sono `GET /api/status`, `GET /api/readiness`, `GET /api/adapter`, `GET /api/audit?limit=50` e `GET /healthz`. La pagina si aggiorna ogni tre secondi senza inviare dati fuori dal computer.

La dashboard HTTP espone il form protetto **Avvia o riprendi il runner**, ma durante la fase readiness/lease il comando è disabilitato globalmente. Anche richieste POST costruite manualmente ricevono `409 readiness_phase_not_operational`; start, tick e registrazione prove rifiutano l'accesso prima di acquisire il lock del journal pratiche. La procedura LaunchAgent controllata è descritta in `docs/ENEA_SHADOW_LAUNCH_AGENT.md`.

## Readiness/lease persistente

La readiness ha un journal separato per evitare che prove tecniche simulate modifichino le pratiche. In questa consegna può assumere soltanto `evidenceMode: local_simulation`; non esiste una transizione verso readiness reale. Il gate resta quindi `blocked_pending_real_readiness` e `queueMayRun` resta sempre `false`.

Le simulazioni verificano l'intero contratto già presente nel registro: una sola proprietà globale, controlli completi, lease di 15 secondi, keepalive ammesso soltanto come `GET`/`HEAD` innocuo, prova server simulata obbligatoria, scadenza fail-closed e recupero da un nuovo owner. Ogni transizione registra gli ID `system-exclusive-runner-lease`, `system-enea-lease-required` e/o `system-atomic-checkpoint-resume` secondo il caso.

## Adattatore read-only e fixture

L'adattatore implementato è un confine contrattuale persistente, non un collegamento a Chrome, CRM o ENEA. L'unico trasporto ammesso in questa fase è `local_fixture`; qualunque altro valore viene bloccato. La fixture registra un'identità browser/profilo persistente sintetica, una scheda CRM e una ENEA uniche, origini HTTPS distinte associate rigidamente alle rispettive superfici e cinque scambi locali.

Sono ammessi soltanto `GET` e `HEAD` senza corpo, header di override o intento mutativo. Redirect fuori origine, scambio CRM sull'origine ENEA, profilo differente, risposta non verificata, mutazione osservata, contenuto eccessivo o MIME non ammesso bloccano l'intero run senza prove parziali. Il journal conserva URL senza query, metadati, dimensione e SHA-256; non conserva i corpi acquisiti. Il keepalive deve essere uno solo, su dashboard/riepilogo ENEA innocuo, e registra anche `system-enea-lease-required`.

Anche con fixture verde lo stato resta `mode: local_fixture`, `operationalGate: blocked_no_real_adapter` e `queueMayRun: false`. Il comando fixture non avvia né seleziona pratiche.

Ogni transizione ha una chiave idempotente e almeno un ID presente in `ENEA_OPERATIONAL_REGISTRY`. Le regole `system-*` nello stesso registro sono invarianti tecniche, non nuove regole business.

## Fail-safe invio

Il runner non esegue submit. L'API interna può concludere un job soltanto con una futura evidenza strutturata proveniente da lettura dashboard ENEA, stato esatto `Inviata`, CPID non vuoto e timestamp valido. Una prova incompleta lascia il job `awaiting_submission_proof`; non viene effettuato alcun retry.

## Limiti residui della prima consegna

- Il LaunchAgent è installato per l'utente macOS corrente e parte dopo il login; non è un demone di sistema disponibile prima del login.
- Il bundle permanente usa `/usr/local/bin/node`: un aggiornamento o la rimozione di quel runtime renderebbe necessario rigenerare e reinstallare il plist.
- Un'interruzione brusca del processo (incluso `Ctrl-C` intercettato dal wrapper `npm`) può lasciare il checkpoint supervisore `running` fino alla scadenza della lease, al massimo 15 secondi. Il riavvio anticipato viene rifiutato; dopo la scadenza il recupero è automatico e auditato.
- Non esiste ancora un trasporto reale verso browser, CRM o ENEA: è implementato soltanto il contratto e il trasporto fixture locale. Il runner non acquisisce fonti reali e non lavora campi del portale.
- La lease ENEA è modellata e il keepalive fixture è verificato, ma una lease reale richiede un futuro trasporto read-only esplicitamente autorizzato.
- I blocchi esistenti richiedono ancora la specifica azione operatore già registrata nella pratica; il runner non inventa fallback o regole.
- Readiness e keepalive sono stati provati soltanto con input locali simulati. Il test reale dovrà osservare una sessione autorizzata senza aprirne una nuova e dimostrare: identità browser persistente, sessioni CRM/ENEA visibili e autenticate, origine CRM consentita, lettura allegati, pagina CRM read-only raggiungibile, lease ENEA attiva e prova server del keepalive innocuo.
- Il gate operativo non verrà aperto automaticamente dal superamento dei test simulati. Servono un trasporto read-only reale autorizzato, evidenza reale persistita e una successiva autorizzazione esplicita prima di implementare l'abilitazione della coda.
- La prova `Inviata + CPID` è validata strutturalmente, non verificata crittograficamente. Il futuro adattatore dovrà produrre un `evidenceId` non falsificabile o un artefatto firmato/hashed.
- Il journal usa il filesystem locale. Per alta disponibilità tra più macchine servirà un archivio transazionale condiviso; non è stato introdotto per evitare Supabase/produzione.

## Esito verifiche del 14 agosto 2026

- `npm run test:enea-restart`: **verde**, 6 file e 25 test. Oltre a restart/readiness, verifica identità e profilo persistenti, origini e percorsi allowlist, acquisizione fingerprint, keepalive GET/HEAD, replay idempotente e rifiuto di metodi, corpi, header, intenti, redirect, trasporti e mutazioni non consentiti.
- Il test fail-safe rifiuta una prova `Inviata` priva di CPID e lascia il job in `awaiting_submission_proof`.
- `npm run typecheck:enea-runner`: **verde**.
- Test mirati coda/registro/esecutore precedente: **11/11 verdi**.
- `npm test`: **verde**, 68 file e 334 test.
- `npm run build`: **verde**. Unico avviso non bloccante: database locale Browserslist obsoleto.
- Smoke test CLI in directory temporanea: inizializzazione `runner_off`, selezione singola e arresto veritiero su `operator_intervention`; dashboard JSON/HTML aggiornata. Nessun browser o collegamento esterno avviato.
- Avvio reale verificato su `http://127.0.0.1:4317/`: heartbeat attivo, sei job visibili, revisione runner invariata. Dopo interruzione brusca, il recupero reale successivo alla lease ha registrato `supervisor_restarted` e `restartCount = 1`.
- Installazione reale LaunchAgent verificata il 14 agosto 2026: servizio `running`, `runs = 2` dopo riavvio controllato, PID cambiato da 14276 a 14292, pagina dashboard HTTP 200. Prima e dopo il riavvio il journal aveva revisione `0`, sei ID ordinati e unici, tutti i `selectionCount = 0` e lo stesso SHA-256 `8fdfd3558a9247352b7407fcb289d852fe2f319b8a5e9e6b701697dd8fa91251`.
- Deploy readiness sul solo servizio locale verificato il 14 agosto 2026: LaunchAgent `running`, `runs = 4`, PID 15989, `restartCount = 3`, API readiness `unverified/not_acquired`, `evidenceMode = none`, `queueMayRun = false`. Il checkpoint pratiche è rimasto alla revisione `0`, con sei job `queued`, zero selezioni e lo stesso SHA-256 precedente.
- Deploy adattatore fixture verificato il 14 agosto 2026: LaunchAgent `running`, `runs = 5`, PID 17383, `restartCount = 4`; `/api/adapter` riporta `fixture_verified`, identità fixture verificata, cinque prove con SHA-256, un keepalive `HEAD` e `queueMayRun = false`. Il checkpoint pratiche resta byte-per-byte invariato.
