# APR r124 — arresto controllato prima del ciclo risposte/domande

Data: 2026-09-14

## Lavoro completato

Le quattro patch richieste sono state applicate esattamente; per ciascuna `git apply --reverse --check` conferma che il contenuto della patch e' presente nel worktree:

- `ops/apr-copia-piu-completa-vince-2026-09-13.patch`
- `ops/apr-zanzariera-e-una-spunta-2026-09-13.patch`
- `ops/apr-certificato-nello-slot-fattura-2026-09-13.patch`
- `ops/apr-domanda-munafo-nomina-il-dato-2026-09-14.patch`

Verifiche eseguite:

- test mirati delle quattro patch: 98/98 verdi;
- modulo `src/features/enea-shadow-crm/`: 426/426 verdi;
- `scripts/enea-shadow-runner/crmLocalPreflight.test.ts`: 140/140 verdi;
- `npm run typecheck`: pulito, inclusi typecheck principale e runner ENEA.

## Discrepanza bloccante

Il prompt indica come fonte dei cinque tipi di risposta da rendere consumabili:

`src/features/enea-shadow-crm/operator-answers/answerRecord.ts:71`

Questo file non esiste. La verifica e' stata ripetuta con tre fonti indipendenti:

1. ricerca nel filesystem corrente;
2. ricerca negli alberi Git dei branch condivisi `claude/apr-canonical-runner-and-stall-classification`, `agent/crm-ombra-enea-lab` e `codex/shadow-crm-apr`;
3. ricerca nella cronologia Git completa per percorsi e contenuti.

Nessuna fonte contiene `answerRecord.ts` o la directory `operator-answers` descritta dal prompt. Nel codice realmente presente, l'unico schema persistente trovato e' `scripts/enea-shadow-runner/operatorResponseLedger.ts`, che espone otto payload diversi e non contiene i cinque tipi citati.

## Riscontri reali sul ledger

Il checkpoint globale reale `state/operator-responses/checkpoint.json` risulta valido e contiene:

- 40 risposte;
- 34 ricevute il 2026-09-11;
- 6 ricevute il 2026-09-12;
- 0 ricevute il 2026-09-13;
- 60 applicazioni persistite.

Tipi presenti: `screening_products`, `cadastral_identifiers`, `old_window_characteristics`, `physical_product_count`, `document_refresh`, `case_disposition`, `operator_required`, `general_rule_confirmation`.

## Decisione fail-closed

Non sono stati inventati tipi, conversioni o mapping alternativi. Non sono stati eseguiti bundle, installazione o test ENEA. L'attivita' si arresta qui in conformita' all'istruzione: se un presupposto non torna, fermarsi e riferire senza improvvisare.

Per riprendere serve la fonte effettiva dello schema del CRM ombra oppure una specifica autorevole dei cinque payload e dei rispettivi campi/semantica.
