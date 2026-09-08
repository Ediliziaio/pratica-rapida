# APR — corpus fisso, blocco 01

## Ambito

- Corpus: `apr-fixed-corpus-block-01`
- Identità persistite: 10
- Fonte: snapshot locale materializzato della pipeline CRM `Archiviate`
- Esecuzione: replay APR locale isolato
- Azioni esterne: disabilitate (`externalActionAllowed=false`)
- CRM, ENEA e browser: non toccati
- Bozze ENEA create o salvate: 0 (non oggetto di questo replay isolato)
- Correzioni e nuove regole applicate dopo il replay: nessuna

## Verifica a tre fonti

Ogni esito è stato confrontato fra:

1. checkpoint del preflight comune e, quando applicabile, del gate Infissi;
2. `report.blockers` e classificazione della deep review;
3. API temporanea isolata `/api/case-truth` in modalità `unified`.

Se le tre fonti non concordano, l'esito pubblico è esclusivamente `INCONSISTENT`.

## Esiti pubblici verificati

| Pratica | Modulo documentale | Esito | Evidenza / motivo |
|---|---|---|---|
| Amelia Lerose | Schermature | `INCONSISTENT` | Preflight `ready_local_plan` senza blocker, ma `/api/case-truth` dichiara `IN_PROGRESS` (`execution_in_progress`). |
| Tommasina Desando | Schermature | `INCONSISTENT` | Preflight `ready_local_plan` senza blocker, ma `/api/case-truth` dichiara `IN_PROGRESS` (`execution_in_progress`). |
| Romeo Ropa | Schermature | `INCONSISTENT` | Preflight `ready_local_plan` senza blocker, ma `/api/case-truth` dichiara `IN_PROGRESS` (`execution_in_progress`). |
| Mara Elena Maddiotto | Misto | `READY` | Preflight comune e gate prodotto senza blocker; API `READY` (`ready_before_execution`). Nessuna bozza ENEA creata in questo replay. |
| Luca Cigognetti | Misto | `READY` | Preflight comune e gate prodotto senza blocker; API `READY` (`ready_before_execution`). Nessuna bozza ENEA creata in questo replay. |
| Francesco Fumagalli | Schermature | `TECHNICAL_BLOCK` | `draft_payload_mapping_incomplete`; deep review `TECHNICAL_REPAIR`; API `TECHNICAL_BLOCK` (`common_block_technical`). |
| Armando Ranzoni | Misto | `INCONSISTENT` | Checkpoint/deep review indicano intervento operatore, ma API rileva una fonte `product_gate` eseguita pur risultando non applicabile e restituisce `INCONSISTENT`. |
| Giulia Luisa Ginevra Waldis | Schermature | `OPERATOR_REQUIRED` | `product_cardinality_form_invoice_mismatch`; confermato da preflight, deep review e API (`common_block_operator`). |
| Luca Maestri | Schermature | `OPERATOR_REQUIRED` | `completion_over_90_days_operator_required`; confermato da preflight, deep review e API (`common_block_operator`). |
| Antonio Scaparrotta | Infissi | `INCONSISTENT` | Checkpoint/deep review riportano riconciliazione economica e capitale bonificato superiore alle fatture, ma API rileva `product_gate=BLOCKED` non applicabile e restituisce `INCONSISTENT`. |

## Sintesi

- `READY`: 2
- `OPERATOR_REQUIRED`: 2
- `TECHNICAL_BLOCK`: 1
- `INCONSISTENT`: 5
- Bozze ENEA salvate: 0 (replay locale senza azioni esterne)

Il risultato preliminare del runner (`5 ready / 1 technical / 4 operator`) non è usato come verità pubblica perché non concorda con `/api/case-truth` su cinque casi.

## Esclusioni effettuate prima della sostituzione

- Sarah Murru: fattura originaria dichiarata ma non acquisibile nello snapshot locale.
- Prova rivenditore 1 30/04: form cliente e fonti fiscali originarie assenti.
- Monica Molteni: fattura di acconto richiamata dal saldo ma non acquisita.
- Vera Buracchi: fattura di acconto richiamata dal saldo ma non acquisita.

## Prossimo gate (non eseguito)

Indagare separatamente le incoerenze della verità unica (`IN_PROGRESS` spurio sui tre casi Schermature e applicabilità del `product_gate` su Armando Ranzoni e Antonio Scaparrotta). Nessuna correzione è stata avviata perché il mandato del blocco richiede di fermarsi e riportare i risultati.
