# APR — gate CRM reale esclusivamente read-only — 17 agosto 2026

## Esito

Gate **verde per l'acquisizione reale in sola lettura della pipeline CRM `Pronte da fare`**.

APR usa la sessione CRM dedicata conservata nel Portachiavi macOS ed emette soltanto `GET` sulla view RLS `enea_practices_public`. Prima di inoltrare un evento alla coda locale, ne salva il checkpoint atomico. Nessuna operazione CRM mutativa e nessuna azione ENEA sono abilitate.

## Prove concordanti

1. **Test automatici:** 114 file e 682 test verdi, eseguiti serialmente; comprendono crash fra staging e dispatch, ripresa, deduplica, coda vuota, login assente, riga invalida isolata, esclusione Beatrice Ciotta e dashboard/API.
2. **Servizi di sistema:** LaunchAgent supervisore ripartito con PID `41174` e contatore run `32`; worker PID `29196` e watchdog PID `12920` sono rimasti attivi e non sono stati riavviati dal deploy.
3. **Checkpoint e dashboard reali:** 10 righe CRM sono state lette, persistite e inoltrate; `processedInboundEventIds=10`, `unique=10`, `pending=0`, `dispatched=10`. Dashboard e `/healthz` espongono `crmIncomingReadOnly=idle`, `crmIntegrationWorkflow=running`, `crmAuth=authenticated`, `externalActionAllowed=false`.

## Prova di riavvio e idempotenza

- Hash checkpoint runner prima/dopo: `7bb0451b73c465b04185f292943b1472a665f408928e95e269ccc8f92c4aca49`.
- Hash ingresso CRM prima/dopo: `1da965b5224787f2502fa1777bba9dfe1ab1787042d32d833ce1412be0332462`.
- Hash workflow CRM prima/dopo: `bd52c54ca77cf5097a74fa3ee2b2633b2809c6645cc006afd3a266c74d19bff6`.
- Dopo il riavvio: sempre 10 eventi, 10 ID unici, nessun pending, nessun duplicato e nessuna perdita.

## Correzioni introdotte

- Eliminato il vincolo errato che accettava soltanto coorti di cinque risultati CRM.
- Reso idempotente il blocco ripetuto dell'adattatore.
- Resa stabile la prova autenticata: l'orario variabile non partecipa più al fingerprint; origine, fingerprint coorte, conteggi e hash dossier ordinati determinano l'identità della prova.
- L'audit dell'adattatore resta fermo alla revisione `20688` attraverso heartbeat e riavvio.

## Installazione

- Bundle permanente: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/apr-supervisor.mjs`
- SHA-256 bundle: `4ae7860c55c057dc5baa447e6edd4d862d5b874bf6ba1b4e2987f7502b434b14`
- Runtime: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-40`
- Dashboard: `http://127.0.0.1:4472/`
- API ingresso: `http://127.0.0.1:4472/api/crm-incoming-readonly`

## Limiti residui reali

- Questo gate intercetta e mette in sicurezza gli eventi reali, ma non collega ancora automaticamente ciascun evento al download del dossier e al preflight generale: è il gate successivo.
- Non è stata eseguita alcuna mutazione CRM: lo spostamento reale tra pipeline resta disabilitato.
- Il gate ENEA operativo resta separato: nessuna bozza nuova, preview, submit, ricevuta, email o comunicazione è stata eseguita.
- Il checkpoint storico dell'adattatore conserva 20.689 eventi legacy generati prima della correzione. Non è stato compattato per preservare l'audit; da ora non cresce più per heartbeat equivalenti.
- `readinessLease=not_acquired` e il watchdog espone uno stato residuo del pilot precedente; non impediscono il GET CRM, ma dovranno essere riallineati prima del successivo gate ENEA reale.
