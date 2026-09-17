# Report finale verificato — APR r126, 83 pratiche

- Run: `apr-workable83-latest-response-closures-r126-20260914`
- Avvio: 14/09/2026 21:38:58 Europe/Rome
- Conclusione: 15/09/2026 05:52:34 Europe/Rome
- Manifest: 83 pratiche (`workable76`: 76; `new7`: 7)
- SHA-256 manifest: `119dee5097a7c015e79246194bf5ba0797aef13d6d554ea40b668e33c7880a5f`
- Bundle: `160dab59-operator-latest-response-closures-r126-20260914`
- SHA-256 worker: `3e06c95078ad5c7822899d8ce494292d8d2b24374a60fa2940990618275f2ef8`
- SHA-256 runner canonico: `3222182522fab5ae6320b4e7b03675947d5cfab2a35efaea9685cda09cfd1a48`
- Rule-source fingerprint sorgente/bundle: `8e5c506b988afdf30e2cc17c8e722e06aa2bbdbb7907d742a141761928494827`

## Verdetto a tre fonti

Il report automatico conta 60 `SAVED`, 10 `OPERATOR_REQUIRED`, 8 `TECHNICAL_BLOCK` e 5 `INCONSISTENT`. La verifica indipendente di checkpoint persistente, report individuale con `report.blockers` e `/api/case-truth`, eseguita su tutte le 83 pratiche, ha trovato tre contraddizioni aggiuntive:

- **Milena Albertoni**: checkpoint/report `saved`, bozza 495937; case-truth `BLOCKED` su `execution_case_operator_required` (pagina impianto termico non risolta dopo tre prove read-only).
- **Danila Serpa**: checkpoint/report `saved`, bozza 496038; case-truth `BLOCKED` con due `infissi_dimensions_and_cardinality_missing` e un `infissi_shading_closures_form_answer_missing_or_ambiguous`.
- **Milena Fiorini**: checkpoint/report `technical_block` (`single_case_runner_exited_without_terminal_result:2`); case-truth `BLOCKED` con due `infissi_dimensions_and_cardinality_missing` e un `infissi_shading_closures_form_answer_missing_or_ambiguous`.

Questi tre casi restano `INCONSISTENT`: non vengono attribuiti né a `SAVED` né a un blocco concordante. Il risultato prudente e verificato è:

- `SAVED`: **58**
- `OPERATOR_REQUIRED`: **10**
- `TECHNICAL_BLOCK`: **7**
- `INCONSISTENT`: **8**

Standard di accettazione corretto dopo la tripla verifica:

- Salvate: **58**
- Con domanda persistita: **6 casi**
- Non conformi: **14**
- Ritirate: **5**
- Lavorabili: **78**
- Autonomia tecnica verificata: **58/78 = 74,4%**

Il 76,9% (60/78) resta il conteggio automatico non corretto e non va presentato come verificato.

### Gruppi

| Gruppo | Presentate | Ritirate | Lavorabili | SAVED verificate | Con domanda | Non conformi | Autonomia verificata |
|---|---:|---:|---:|---:|---:|---:|---:|
| Nucleo 76 | 76 | 5 | 71 | 56 | 4 | 11 | 78,9% |
| Nuove 7 | 7 | 0 | 7 | 2 | 2 | 3 | 28,6% |
| Totale | 83 | 5 | 78 | 58 | 6 | 14 | 74,4% |

### Pratiche non conformi dopo la tripla verifica

- **Guasto APR o stato tecnico non conforme**: Andrea Celi, Anthony Pool Juscamaita Fuertes, Daniele Formentini, Fausta De Filippo, Gemma Minore, Gloria Padoani, Lea Dettori, Milena Fiorini, Paolino Bellini, Rosa Toscano, Rossella Munafò, Vincenzo Falconi.
- **Aggiunte per divergenza cross-fonte**: Milena Albertoni, Danila Serpa.

### Ritirate dal denominatore

- Andreea Ioana Olteanu e Marco De Marinis: fine lavori oltre il termine legale di 90 giorni.
- Maurizia Coreggioli: documenti presenti ma manoscritti non leggibili automaticamente; lavorazione manuale.
- Marian Maeschi: pratica dichiarata chiusa da Giuliano.
- Sabrina Eustomi: cliente rinunciataria.

## Confronto con r125

- **Recuperate e verificate**: Lucia Droghetti (`TECHNICAL_BLOCK` → `SAVED`) e Nicla Biagioni (`OPERATOR_REQUIRED` → `SAVED`).
- **Regressione rispetto a r125**: Rosa Toscano (`SAVED` → `TECHNICAL_BLOCK`, `apr_cdp_enea_create_result_not_identifiable`).
- Delle 57 salvate verificate in r125, 56 restano salvate; il saldo netto verificato cresce di una pratica, da 57 a 58.
- **Rossella Munafò non è recuperata**: resta `OPERATOR_REQUIRED` senza domanda aperta nel checkpoint del run, nonostante la risposta attiva nel ledger.

Il cricchetto automatico segnala anche **Lea Dettori**, confrontandola però con r67, non con r125: era già `TECHNICAL_BLOCK` in r125. Le regressioni certificate complessive dallo storico sono quindi Lea Dettori e Rosa Toscano; la sola nuova regressione rispetto al giro immediatamente precedente è Rosa Toscano.

## Domande del solo run corrente

Il riepilogo automatico dichiara `domandeRipetute: 0`, ma il confronto diretto degli ID nei checkpoint `operator-questions` di r126 con r125 lo contraddice. Gli stessi ID erano già presenti nel giro precedente: **nessuna domanda è nuova**; ci sono **9 record ripetuti su 6 pratiche**.

### RIPETUTE e aperte

- **Stefania Venturi** — “Il form del cliente non è completo: mancano i dati dell'edificio e dell'impianto. Completa entrambe le sezioni.”
  - Il fascicolo contiene richiedente, residenza e dati catastali, ma non le sezioni edificio e impianto.
- **Mauro Leonardi** — “Puoi indicare quanti serramenti sono stati installati e la misura di ciascuno?”
  - Il percorso Infissi non ha ricostruito numero e misure dei serramenti, nonostante la risposta sulla data sia nel ledger.
- **Gabriele Girelli** — “Confermi se sono state installate chiusure oscuranti insieme agli infissi?”
  - Il percorso Infissi mantiene `infissi_shading_closures_form_answer_missing_or_ambiguous`.
- **Gabriele Girelli** — “Puoi indicare quanti serramenti sono stati installati e la misura di ciascuno?”
  - Il percorso Infissi mantiene anche `infissi_dimensions_and_cardinality_missing`.
- **Silvia Lomartire** — “Mancano le misure del prodotto (la veneziana) in tutti i documenti originari verificati. Inseriscile per far riprendere la pratica.”
  - I documenti acquisiti non hanno prodotto larghezza e altezza della veneziana.
- **Silvia Lomartire** — “Puoi allegare il form compilato del cliente?”
  - Il fascicolo CRM non contiene un modulo cliente utilizzabile.
- **Fabio Benvenuti** — “Manca la data di fine lavori e non è ricavabile dalla fattura. Indica la data di fine lavori.”
  - Nessuna data di fine lavori è stata ricavata dalle fonti; resta anche una discordanza di cardinalità form/fattura.

### RIPETUTE ma ritirate nello stesso run

- **Mario Spano** — “Mancano le misure del prodotto (la veneziana) in tutti i documenti originari verificati. Inseriscile per far riprendere la pratica.”
- **Mario Spano** — “Puoi indicare quale prodotto è stato installato e in quale documento è descritto?”
  - Entrambe sono state ritirate perché il blocker originario non risultava più presente. La pratica resta tuttavia `INCONSISTENT` per `screenings_missing`, `invoice_332a5af9` e `invoice_929a8665`.

### Contraddizione Rossella Munafò

Il report finale sintetizza ancora la domanda “Indica le misure della bioclimatica riportate nel foglio manoscritto corretto per questa pratica”. Il checkpoint `operator-questions` della coorte 9402 contiene invece `questions: []` e due eventi di ritiro perché esiste già la risposta attiva `response:dimensions:rossella-munafo:20260912`. La domanda non è quindi una nuova domanda del run; il problema residuo è che la risposta applicata non porta la pratica a un esito conforme.

## Guasti APR dichiarati

- **Controllo browser/portale**: Daniele Formentini, Gloria Padoani, Lea Dettori, Rosa Toscano.
- **Esito del salvataggio non dimostrabile**: Gemma Minore, Paolino Bellini, Vincenzo Falconi.
- **Arresto senza motivo terminale utilizzabile**: Fausta De Filippo, Milena Fiorini.
- **Fascicolo non acquisito/analizzato**: Andrea Celi, Anthony Pool Juscamaita Fuertes.

In aggiunta, Milena Albertoni e Danila Serpa sono `INCONSISTENT` per divergenza cross-fonte, anche se il report automatico le conta come salvate.

## Le sette pratiche nuove

| Pratica | Esito verificato | Dettaglio |
|---|---|---|
| Fabio Benvenuti | OPERATOR_REQUIRED / con domanda | Domanda ripetuta sulla data di fine lavori; resta `product_cardinality_form_invoice_mismatch`. |
| Gianfranco Zanetti | SAVED | Bozza 496046. |
| Daniele Formentini | TECHNICAL_BLOCK | Bozza 496049; verifica ENEA fallita su `comune_residenza` (`apr_cdp_enea_field_verification_failed`). |
| Andrea Celi | OPERATOR_REQUIRED / non conforme | Esclusione permanente Vans; nessun fascicolo acquisito e nessuna domanda persistita. |
| Gabriele Malossi | SAVED | Bozza 496051; case-truth `READY`, nessun problema. |
| Anthony Pool Juscamaita Fuertes | TECHNICAL_BLOCK | Revisione obbligatoria `infissi-transmittance-131-to-13-v1` non completata; nessun fascicolo acquisito. |
| Mario Spano | INCONSISTENT / con domande ritirate | Nessuna bozza; restano divergenze su estrazione e riconciliazione. |

## Evidenza separata sui sei esiti non dimostrabili di r125

L'analisi read-only richiesta durante il lotto è in `ops/apr-r125-undemonstrated-outcome-evidence-2026-09-14/evidence.md` (SHA-256 `f98d5c0416b9897a4a1412e5701ab48a8fbdc2fecd54bc9c2743bd32257fe02c`). In sintesi:

- Falconi, Minore, Bellini e Fiorini non sono scomparsi silenziosamente: il worker si è auto-isolato e poi ha ricevuto `SIGTERM`.
- Per Droghetti, una GET persistita dimostrava la bozza salvata, ma il sequencer ha respinto il lifecycle.
- Per De Filippo, il sequencer ha terminato il worker di recovery.
- Non risultano logout ENEA, chiusura di Chrome o sospensione/crash del Mac come causa comune.

## Integrità e continuità

- SHA-256 checkpoint finale: `ea558f960e40204ac7901c557c0e231414966b849553528799f527eb30b9a0a5`
- SHA-256 report JSON: `877fa4ab5b1508c0955bdf55b133740cefb9fcf57ea16c7ebfca8cbfc7763c97`
- SHA-256 acceptance report: `516ed963c8310571cbea5898db796ca80fe55b9c2fe0983596067a4eeb4793d6`
- SHA-256 regression report: `a733464862d9293689b3b0ad6f0555d07366b3e819fee290ff504dad976cef35`
- SHA-256 stop-disposition report: `f86217a4ab54003039894f9d5499e7fbf44ce2ac1b5ee1bbeb278a81d8966f0b`

Il lotto è concluso (`83/83`, nessuna pratica corrente) e non risultano processi residui del runner. Chrome APR risponde sul CDP 9331, i keepalive restano attivi e la dashboard risponde con heartbeat corrente. Nessuna anteprima, invio, protocollazione, ricevuta, email o comunicazione è stata eseguita.
