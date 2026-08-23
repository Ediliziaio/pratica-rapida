# APR — continuità automatica tra gate

Data: 17 agosto 2026  
Coorte: `apr-pilot-40`  
Dashboard: `http://127.0.0.1:4472/`

## Difetto corretto

Il completamento del piano locale create/fill/save lasciava APR senza un gate successivo persistito. I processi rimanevano accesi, ma non esisteva lavoro accodato: la prosecuzione dipendeva quindi da un nuovo turno Codex.

## Correzione

È stato aggiunto l'orchestratore persistente `apr-gate-orchestrator-v1`, integrato nel supervisore, nella dashboard e nel watchdog.

Catalogo corrente:

1. `local_cohort_create_fill_save_plan` — completato;
2. `local_enea_browser_bridge_contract` — accodato e completato automaticamente;
3. `external_enea_readiness_admission` — registrato automaticamente nel safety gate.

Il contratto bridge produce un manifest persistente con le due pratiche e l'ordine di tutte le 19 pagine. Hash dei pacchetti, contatori create/fill/save e ordine dei checkpoint vengono verificati nuovamente prima di completare il gate.

## Continuità e sicurezza

- un solo gate locale attivo;
- lock e lease persistiti prima della validazione;
- recupero dopo crash senza duplicare il manifest;
- gate successivo scritto nel checkpoint prima di terminare il precedente;
- watchdog consapevole di `orchestrazione_gate` e `blocco_tecnico_gate`;
- dashboard con stato, gate corrente, motivo e prossima azione;
- `externalActionAllowed=false`;
- `browserAllowed=false`;
- `crmMutationAllowed=false`;
- `eneaActionAllowed=false`;
- preview, submit, ricevute e comunicazioni disabilitati.

## Prove

- test crash/lease/idempotenza dell'orchestratore verdi;
- test watchdog e classificazione gate verdi;
- riavvio reale del supervisore: checkpoint e manifest invariati;
- servizi supervisor, worker e watchdog attivi;
- dashboard mostra `WAITING_EXTERNAL_SAFETY_GATE` e il gate `external_enea_readiness_admission`;
- il watchdog mostra `TECHNICAL_BLOCK` con la prossima azione tecnica precisa, non `IDLE` e non un'attesa generica della chat.

## Limite residuo

L'orchestratore elimina il vuoto fra i gate già implementati, ma APR non può scrivere autonomamente nuovo codice. Il gate readiness ENEA deve ora essere implementato e collaudato da Codex; una volta installato, sarà il processo APR a eseguirlo dal checkpoint. Nessuna azione sul portale è stata eseguita in questo gate.
