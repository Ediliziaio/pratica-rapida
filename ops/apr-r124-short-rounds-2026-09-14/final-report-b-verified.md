# APR r124 — giro B verificato

- Run: `apr-r124-short-round-b-20260914`
- Intervallo: 2026-09-14 11:43:00–12:04:17 CEST
- Manifest: `e4d23f88673f331b6aea9f8fb90a253433dafe596823b098f222480ca3909272`
- Bundle: `c58ba2b3-patch-notte-r124-governed-20260914`
- Worker: `3c5d11fbb9040189cf77202f359ebc47134031fe4af95cd116730c1d95ea71d4`
- Runner autoattestato: `3222182522fab5ae6320b4e7b03675947d5cfab2a35efaea9685cda09cfd1a48`
- Selezione CRM: 7/7 trovate univocamente in `Pronte da fare` con GET autenticato read-only; nessuna pratica forzata.
- Sicurezza: sole bozze TEST; nessuna anteprima, invio o comunicazione.

## Standard di accettazione

- Salvate: 2
- Con domanda: 2
- Non conformi: 3
- Ritirate: 0

Le tre fonti concordano sui sette stati terminali.

## Pratica → esito → domanda/guasto

| Pratica | Esito | Bozza | Domanda o guasto |
|---|---|---:|---|
| Fabio Benvenuti | `OPERATOR_REQUIRED` | — | Domanda persistita: “Puoi indicare la data di fine lavori?”. Evidenza: la data non è ricavabile dai documenti. Restano inoltre blocker su cardinalità/prodotti non riconciliati, quindi la domanda non copre tutto il motivo terminale. |
| Gianfranco Zanetti | `SAVED` | 492995 | 8/8 pagine; nessun problema e nessuna domanda. |
| Daniele Formentini | `TECHNICAL_BLOCK` | 493100 | ENEA rifiuta il comune di residenza anche dopo i retry. Nessuna domanda. |
| Andrea Celi | `OPERATOR_REQUIRED` | — | Esclusione permanente: fornitore Vans. Nessun allegato elaborato e nessuna azione ENEA tentata. Nessuna domanda persistita: non conforme allo standard del canale operatore. |
| Gabriele Malossi | `SAVED` | 493119 | 10/10 pagine; nessun problema e nessuna domanda. |
| Anthony Pool Juscamaita Fuertes | `TECHNICAL_BLOCK` | — | Gate Infissi: revisione `infissi-transmittance-131-to-13-v1` non completata. Il guardiano lo classifica “giudicato senza fascicolo”. Nessuna domanda. |
| Mario Spano | `INCONSISTENT` | — | Blocchi: `screenings_missing`, `invoice_332a5af9`, `invoice_929a8665`. Domande persistite: “Mancano le misure del prodotto (la veneziana) in tutti i documenti originari verificati. Inseriscile per far riprendere la pratica.” e “Puoi indicare quale prodotto è stato installato e in quale documento è descritto?”. La domanda attesa sul caso avvolgibile/cassonetto non è stata prodotta. |

## Domande del solo run

- Fabio Benvenuti — “Puoi indicare la data di fine lavori?” Evidenza: manca la data e non è ricavabile dalla fattura.
- Mario Spano — “Mancano le misure del prodotto (la veneziana) in tutti i documenti originari verificati. Inseriscile per far riprendere la pratica.” Documento mancante indicato: scheda o documento con larghezza e altezza del prodotto.
- Mario Spano — “Puoi indicare quale prodotto è stato installato e in quale documento è descritto?” Evidenza: nessun prodotto di schermatura riconciliato dalle fatture.

## Fonti congelate

- Checkpoint SHA-256: `92d6f22c6517cd0325973ce3dcdba7dc990af7f6376d87c8a8c52f1782adf7ec`
- Report SHA-256: `3626a557bf6a55fdccb2d48424986cacb79ba40ac6f40d93af23edbdc6a1c7bc`
- Acceptance SHA-256: `b4eb682b36551d1bed0c0925402960e4686f04d9e58563c3c8e9673153d202b3`
- Regression guard SHA-256: `2254515802fe77488e2f44039ca5a3b588a465fdcb4b2b9ed55ce005713c08fc`
- Terza fonte: dashboard locale `/api/case-truth`, letta dopo la conclusione del run.
