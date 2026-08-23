# APR — Automazione PraticaRapida

## Primo modulo: ENEA

Questa prima versione è un motore esclusivamente locale. Legge dossier CRM fixture in JSON, normalizza form e fatture tramite il registro unico, conserva fonti/avvisi/differenze, produce un piano bozza e si arresta prima di qualsiasi azione esterna.

Non apre browser e non accede a CRM, ENEA, Supabase o produzione. `externalActionAllowed`, `previewAllowed`, `submitAllowed` e `communicationsAllowed` restano sempre `false`; il gate adapter resta `blocked_adapters_unverified`.

## Avvio locale

Singolo dossier fixture:

```sh
npm run apr:enea -- dossier \
  --root .enea-shadow-runtime \
  --input scripts/enea-shadow-runner/fixtures/localCrmDossier.json \
  --run-id apr-demo-001
```

Batch autonomo (il manifest è una lista di `{displayName, customerKey, dossierPath}`):

```sh
npm run apr:enea -- batch \
  --root .enea-shadow-runtime \
  --manifest scripts/enea-shadow-runner/fixtures/aprBatchManifest.example.json \
  --batch-id apr-batch-001
```

Dashboard locale:

```sh
npm run enea:supervisor -- serve --state-dir .enea-shadow-runtime --port 4317
```

URL: `http://127.0.0.1:4317`

Per la fase v1.1 usare preferibilmente l'avvio unico e la diagnostica descritti in [APR_LOCAL_OPERATIONS.md](./APR_LOCAL_OPERATIONS.md): `init`, `doctor`, quindi `npm run apr:dashboard`.

API read-only: `/api/status`, `/api/batch`, `/api/local-dossier`, `/api/rule-matrix`, `/api/crm-integration-contract`.

L'API `/api/crm-readonly-adapter` espone esclusivamente configurazione e prove fixture locali. `fixture_verified` non equivale a integrazione CRM reale.

## Persistenza e ripresa

- `batch-manifest.json` congela l'input e impedisce la sovrascrittura di una coda attiva.
- `execution-plan.json` conserva claim ed esiti una pratica alla volta.
- `cases/case-NNN/local-dossier/checkpoint.json` conserva ogni transizione e gli ID regola.
- `batch-report.json` espone avanzamento, differenze, fonti e motivi dei blocchi.
- Un caso bloccato viene chiuso come blocco per-pratica; il ciclo reclama automaticamente il successivo.
- Un cliente duplicato è `duplicate_input` e non viene elaborato due volte.

Il test di accettazione usa 15 input, 14 clienti unici, un duplicato e due dossier ambigui. Ricrea il batch dopo ogni tick per simulare il riavvio e verifica: 12 piani pronti, 2 blocchi, 1 duplicato, zero elementi persi o reclamati due volte.

## Confine CRM

APR è progettato come modulo del CRM PraticaRapida. Il contratto locale propone avanzamenti e l'instradamento dei dubbi a `Richiesto intervento operatore`. Ogni comando ha precondizione di revisione/stato, chiave idempotente, audit e compensazione. La simulazione confronta i fingerprint degli automatismi CRM e dell'integrazione CRM→Cruscotto, che devono restare invariati.

Invio portale, PDF ENEA, email/ricevute e collegamento allo spazio cliente sono capacità future, descritte ma non eseguibili nella prima versione.

## Collaudo

```sh
npm run typecheck:enea-runner
npx vitest run scripts/enea-shadow-runner/localDossierBatch.test.ts
npx vitest run scripts/enea-shadow-runner/localDashboardServer.test.ts
```

La matrice completa è in [APR_RULE_TEST_MATRIX.md](./APR_RULE_TEST_MATRIX.md). L'evidenza persistente viene scritta soltanto dopo un run verde:

```sh
npm run apr:enea -- verify-rules --root .enea-shadow-runtime --test-command "vitest run APR acceptance"
```
