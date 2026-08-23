# APR — operatività locale

APR (Automazione PraticaRapida) è in questa fase un software locale. ENEA è il primo modulo. Non esiste ancora un'integrazione reale con CRM o portale ENEA.

## Avvio raccomandato

Inizializzazione idempotente di runtime, dashboard e adapter CRM fixture:

```sh
npm run apr:enea -- init --root .enea-shadow-runtime/apr-v1
```

Diagnostica fail-closed:

```sh
npm run apr:enea -- doctor --root .enea-shadow-runtime/apr-v1
```

Avvio unico della dashboard:

```sh
npm run apr:dashboard -- --root .enea-shadow-runtime/apr-v1 --port 4317
```

La dashboard è disponibile su `http://127.0.0.1:4317`. Il comando non avvia lavorazioni, browser o adattatori reali. Pubblica soltanto pagine e API GET/HEAD su loopback.

## Cosa significa “verde”

`doctor.readyForLocalDashboard=true` significa esclusivamente che:

- journal e dashboard locali sono leggibili;
- la configurazione CRM fixture è valida;
- cinque capability read-only hanno prova locale;
- readiness, adapter generico, adapter CRM e batch negano azioni esterne;
- `externalActionAllowed=false` e `operationalGate=blocked_adapters_unverified`.

Non significa che il CRM sia raggiungibile, autenticato o integrato.

## Adapter CRM read-only

Configurazione versionata: `config/apr/crm-readonly-adapter.json`.

Il contratto ammette soltanto:

1. elenco pratiche ENEA in ingresso;
2. lettura cliente;
3. lettura dossier ENEA;
4. lettura metadati documenti;
5. prova HEAD del documento originario.

Invarianti:

- origine HTTPS esatta e percorsi allowlistati;
- metodi esclusivamente GET/HEAD senza corpo;
- header esclusivamente `Accept` e `If-None-Match`;
- nessuna credenziale, cookie, token o segreto nel file;
- redirect fuori origine, query mutative e risposte troppo grandi rifiutati;
- automatismi CRM e CRM→Cruscotto dichiarati `preserve_exactly`;
- anche con fixture verde, coda reale e azioni esterne restano disabilitate.

Le prove sono fingerprint SHA-256 di risposte locali. `transport=local_fixture` impedisce di scambiarle per evidenza CRM reale.

## API locali

- `GET /api/status`
- `GET /api/crm-readonly-adapter`
- `GET /api/crm-integration-contract`
- `GET /api/rule-matrix`
- `GET /api/batch`
- `GET /api/pilot-sample`
- `GET /api/notifications`
- `GET /healthz`

POST, PUT, PATCH e DELETE restituiscono `405`. La pagina è solo osservazione.

## Pilot casuale iniziale 5-su-15

`pilot-init` crea un checkpoint vuoto e fail-closed. `pilot-select` accetta 15 record `{customerKey, displayName}` univoci provenienti dall'adattatore CRM read-only oppure da un elenco esplicitamente fornito dall'utente; fonte e ID prova sono obbligatori e persistiti. APR estrae cinque clienti una sola volta, salva il fingerprint dell'elenco e impedisce sostituzione o nuova estrazione dopo stop/riavvio.

```sh
npm run apr:enea -- pilot-init --root .enea-shadow-runtime/apr-v1.1
npm run apr:enea -- pilot-select --root .enea-shadow-runtime/apr-v1.1 --candidates <lista-read-only.json> --source-evidence-id <prova-server>
npm run apr:enea -- pilot-select --root .enea-shadow-runtime/apr-v1.1 --candidates <lista-utente.json> --source user_supplied_candidate_list --source-evidence-id <id-messaggio>
```

La presenza del checkpoint non abilita CRM o ENEA: `externalActionAllowed=false` resta invariato. Un elenco sintetico, incompleto o duplicato viene rifiutato e non produce nomi selezionati.

## Continuità senza Codex e notifiche

Il LaunchAgent permanente esegue sia il supervisore sia l'esecutore del batch locale. Un piano armato con manifest dossier coerente viene reclamato dal processo locale: chiudere o interrompere Codex non ferma la coda. Se il processo termina, `KeepAlive` lo riavvia; dopo la scadenza della lease il nuovo executor riprende anche un elemento rimasto `claimed` usando lo stesso checkpoint e la stessa chiave idempotente.

Le transizioni che richiedono attenzione e il completamento della coda vengono pubblicati nel Centro notifiche macOS e, indipendentemente dall'esito grafico, nell'inbox durevole `notifications/checkpoint.json`. La dashboard e `GET /api/notifications` mostrano consegna, motivo e ultimo evento. La consegna non usa Codex, OpenAI o rete.

Il servizio autonomo locale non supera il gate esterno: CRM, browser ed ENEA restano vietati finché gli adattatori reali non sono verificati.

## Ripresa e problemi comuni

- `APR doctor non verde`: rieseguire `init`, poi `doctor`; non cancellare checkpoint.
- `SUPERVISOR_BUSY`: esiste un supervisore con lease valida. Consultare lo stato invece di avviarne un secondo.
- porta occupata: scegliere una porta loopback diversa, ad esempio `--port 4318`.
- fixture/configurazione bloccata: leggere `validationErrors` in `/api/crm-readonly-adapter`; correggere soltanto file locali.
- matrice regole pendente: rieseguire i test; registrare l'evidenza soltanto dopo suite, typecheck e build verdi.

## Gate per una futura integrazione reale

Serviranno un adapter diverso dalla fixture, autenticazione gestita fuori dalla configurazione versionata, verifica indipendente dell'identità CRM, prove server read-only e autorizzazione esplicita. Fino ad allora la dicitura corretta è sempre `contract_only_not_real`.
