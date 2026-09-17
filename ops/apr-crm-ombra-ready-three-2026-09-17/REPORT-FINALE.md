# CRM ombra — Miracapillo, Mantelli, Zambella

Data: 2026-09-17

Run: `apr-crm-ombra-ready-three-20260917`

Bundle: `855b3373-patch-cf-sequencer-governed-20260916-20260916`

Worker SHA-256: `be8d0d57304209335d0f99205e41e4aa12a3eb0f8f0d76a27768e78f61b96fd9`

| Pratica | Colonna finale | Domanda / bozza |
|---|---|---|
| Daniele Miracapillo | Richiesto intervento operatore | APR rileva una contraddizione sul materiale del quinto avvolgibile e un numero di chiusure superiore al numero di finestre: qual è il materiale corretto del quinto avvolgibile e quanti sono esattamente infissi e chiusure? |
| Alessandro Mantelli | Invio pratica chiusa (`da_inviare`) | Bozza ENEA n. `507589`, completa e salvata; URL registrato nelle note interne. |
| Marco Zambella | Richiesto intervento operatore | Il numero indicato nel form non coincide con quello ricostruito dalla fattura: quanti prodotti sono stati installati? |

Miracapillo resta formalmente `INCONSISTENT`: checkpoint, report e `/api/case-truth` non consentono un verdetto operativo concordante. Mantelli risulta `READY`/nessun problema nella verità caso ed è verificato lato server. Zambella risulta `blocked_case` con blocker concordante `product_cardinality_form_invoice_mismatch`.

Per ogni colonna finale sono concordanti lettura diretta della pratica ombra, lettura della fase e query inversa di appartenenza alla fase.

Nessuna anteprima, invio, protocollazione, ricevuta, email o comunicazione esterna è stata eseguita.
