# Report finale APR wide148 r126 — 15/09/2026

Run: `apr-wide148-r126-20260915`  
Manifest: `ops/apr-wide150-r126-2026-09-15/manifest.json`  
Avvio: 15/09/2026 10:08:01 Europe/Rome  
Fine: 15/09/2026 22:22:46 Europe/Rome

## Esito complessivo

- Presentate: 148
- Processate: 148
- Salvate: 74
- OPERATOR_REQUIRED: 35
- TECHNICAL_BLOCK: 25
- INCONSISTENT: 14
- Ritirate dal denominatore: 5
- Lavorabili secondo lo standard di accettazione: 143
- Salvate / lavorabili: 74 / 143 = 51,7%
- Con domanda persistita: 34
- Non conformi: 35
- Anteprima, submit e comunicazioni: mai eseguiti

## Esito per gruppo

| Gruppo | Totale | Salvate | OPERATOR_REQUIRED | TECHNICAL_BLOCK | INCONSISTENT | Con domanda | Non conformi | Ritirate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `nuova_standard` | 55 | 13 | 20 | 13 | 9 | 28 | 14 | 0 |
| `nuova_manoscritto` | 11 | 0 | 6 | 5 | 0 | 0 | 11 | 0 |
| `gia_lavorata` | 82 | 61 | 9 | 7 | 5 | 6 | 10 | 5 |

## Confronto con apr-workable83-latest-response-closures-r126-20260914

- Pratiche comuni: 82
- Salvate nel giro precedente fra le comuni: 60
- Salvate in wide148 fra le comuni: 61
- Regressioni dirette: **0**
- Recuperata: **Rosa Toscano**, da `technical_block` a `saved`

Il cricchetto storico più ampio segnala separatamente una regressione certificata rispetto a r67: **Lea Dettori**, oggi `technical_block` pur essendo stata salvata con gli stessi documenti il 05/09/2026. Non è una regressione rispetto al run r126 indicato sopra.

## Guasti APR del solo run — 30

- 13 — nessun documento originario acquisito: Aldo Bruno Valeri, Anna Cianci, Anthony Pool Juscamaita Fuertes, Carlo Onado, Domenico Nuzzi, Gianmario Mazza, Lino Santoro, Marcello Suriano, Marco Foppoli, Maria Luisa Sicle, Massimo Angelo Sala, Rosanna Detto, Sarah Katherine Learmonth.
- 6 — esito del salvataggio non dimostrabile dopo il recupero: Elena Sarpa, Francesco De Vallier, Gemma Minore, Miria Giusti, Paolino Bellini, Vincenzo Falconi.
- 4 — errore tecnico del controllo browser: Daniele Formentini, Fausta De Filippo, Gloria Padoani, Lea Dettori.
- 4 — payload incompleto per mappatura APR: Giacomo Bonfante, Marida Ronda, Michele Quattrini, Nello Farinelli.
- 2 — arresto senza motivo persistito: Francesca Moscadelli, Milena Fiorini.
- 1 — conflitto identità beneficiario senza domanda formulabile: Giancarlo Della Vedova.

## Domande operatore del solo run — 39

Le righe seguenti raggruppano domande con testo identico; i nomi sono esclusivamente quelli del run corrente.

- 7 — **Dalle fatture non risulta riconciliato nessun prodotto di schermatura. Indica quale prodotto e' stato installato e in quale documento e' descritto.** Ludovica Costigliolo, Maria Andres, Maria Letizia Rizza, Mario Spano, Nunzia Musci, Pietro Catanzaaro, Raffaela Lucarini.
- 5 — **Il fascicolo CRM non contiene un form cliente utilizzabile. Allega il form compilato del cliente.** Adelina Candito, Fedele Datteo, Giovanni Carbonaro, Giuliana De Vitis, Silvia Lomartire.
- 1 — **Il form del cliente non e completo: mancano i dati dell'edificio e dell'impianto. Completa entrambe le sezioni.** Stefania Venturi.
- 1 — **Il totale di almeno un documento fiscale non è stato riconosciuto. Indica il dato corretto leggendolo dal documento, senza ricalcolarlo.** Giacomo Scafati.
- 1 — **Indica le misure della bioclimatica riportate nel foglio manoscritto corretto per questa pratica.** Rossella Munafò.
- 8 — **La data di fine lavori appartiene a un anno diverso da quello del portale aperto. Conferma su quale portale annuale va inserita la pratica.** Alessandro Villa, Anna Rita Battista Colella, Graziella Minguzzi, Maria Luigia Fusco, Mariana Jitca, Sara Agostinelli, Ubaldo Carriero, Walter Di Maio.
- 3 — **La fattura descrive la schermatura ma nessun documento riporta le misure del prodotto. Indica larghezza e altezza del prodotto installato (non della finestra protetta).** Fabio Carlo Lisca, Sabrina Scaccabarozzi, Vittoria Cattaneo.
- 1 — **La fine lavori supera il termine di 90 giorni. Conferma se la pratica e' ancora procedibile o va ritirata.** Sabrina Busolin.
- 1 — **Le fatture non permettono di identificare con certezza un solo intestatario persona fisica. Indica nome, cognome e codice fiscale del beneficiario da inserire.** Gianluca Campus.
- 6 — **Manca la data di fine lavori e non e' ricavabile dalla fattura. Indica la data di fine lavori.** Esposito Nicola, Fabio Benvenuti, Giorgio Salerno Ballotta, Luca Bonoli, Lucio Milano, Maria Loreta Venere.
- 4 — **Mancano le misure e il numero dei serramenti. Nei documenti allegati (certificati, ordini, schede tecniche) le misure di solito ci sono: indica quanti serramenti sono stati installati e la misura di ciascuno.** Francesco Giorgini, Gabriele Girelli, Igor Capecci, Mauro Leonardi.
- 1 — **Non e' chiaro se l'intervento comprenda chiusure oscuranti (persiane, tapparelle, zanzariere). Conferma se sono state installate e su quali serramenti.** Giorgia Valore.

Il report del cricchetto registra `domandeRipetute: 0`: nessuna nuova domanda duplicata è stata certificata nel run. Il campo `alreadyAsked` del report di disposizione è vero su 34 delle 39 disposizioni perché la domanda esisteva già nel ledger e nel run è stata riutilizzata, non rigenerata come duplicato.

## Fonti persistenti

- `report.json`: verdetto aggregato e casi.
- `checkpoint.json`: completamento 148/148.
- `acceptance-report.json`: standard di accettazione.
- `regression-report.json`: cricchetto e giudizi senza fascicolo.
- `stop-disposition-report.json`: domande e guasti del solo run.

Tutte le fonti sono nella directory:
`/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-wide148-r126-20260915/`.
