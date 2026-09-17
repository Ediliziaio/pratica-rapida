# CRM ombra — report finale secondo giro

Data: 2026-09-16

Bundle: `855b3373-patch-cf-sequencer-governed-20260916-20260916`

Run operativo di rilavorazione: `apr-crm-ombra-second-round-rerun-three-20260916`

## Esiti

| Pratica | Risposta letta come | Colonna finale |
|---|---|---|
| Walter De Pace | `da fare a mano` → pratica non lavorabile da APR, gestione manuale | Archiviate |
| Maria Luigia Fusco | Data di fine lavori `11/07/2026`, applicata; il blocker sulla data scompare. Il nuovo giro resta `INCONSISTENT` e richiede numero e misure dei serramenti. | Richiesto intervento operatore |
| Marina Gerbaudo | Fatture non ancora disponibili; nessun dato applicabile. Nota esplicativa mantenuta. | Richiesto intervento operatore |
| Amaranti Gigliola | Data di fine lavori `15/07/2026`, applicata; il blocker sulla data scompare e viene creata la bozza ENEA `505688`. Il nuovo giro resta `INCONSISTENT` perché ENEA rifiuta il telefono non composto da sole cifre. | Richiesto intervento operatore |
| Anthony Pool Juscamaita Fuertes | Fatture non disponibili; nessun dato applicabile. Nota esplicativa mantenuta. | Richiesto intervento operatore |
| Federico Marino | Data di fine lavori `10/06/2026`, applicata; il blocker sulla data scompare. Il nuovo giro resta `INCONSISTENT` e richiede numero/misure dei serramenti e conferma sulle chiusure oscuranti. | Richiesto intervento operatore |
| Gianmario Mazza | `da fare a mano` → pratica non lavorabile da APR, gestione manuale | Archiviate |
| Valter Moretto | `corretto`, in risposta alla domanda sulla gestione manuale → pratica non lavorabile da APR | Archiviate |
| Selahattin Ozmen | `corretto, mettila da fare a mano` → pratica non lavorabile da APR | Archiviate |
| Patrizia Teresa Taverna | Letti 10 prodotti da `110 × 140`, ma risposta non applicabile senza deduzioni: manca l'unità e non è indicata la ripartizione tra zanzariere e avvolgibili. Pubblicata domanda di chiarimento. | Richiesto intervento operatore |
| Lorelai Staropoli | Nessuna risposta preesistente; il nuovo giro richiede larghezza, altezza e quantità dei prodotti. | Richiesto intervento operatore |

## Verifica

Per ogni colonna finale sono concordanti:

1. lettura diretta della pratica ombra;
2. lettura indipendente della tabella della fase;
3. query inversa di appartenenza alla fase attesa.

Per Fusco, Gigliola e Marino, checkpoint, report e `/api/case-truth` classificano il nuovo esito esclusivamente come `INCONSISTENT`; il report non attribuisce loro un falso verdetto operativo.

Nessuna anteprima, invio, protocollazione, ricevuta, email o comunicazione esterna è stata eseguita.
