# Report finale operativo APR r111 — lotto 76

## Identità ed evidenze

- Esecuzione: `apr-workable76-r111-20260911`
- Avvio: `2026-09-11T12:09:44.391Z`
- Conclusione: `2026-09-11T17:12:57.899Z`
- Durata: 5 ore, 3 minuti e 13 secondi
- Manifest: `ops/apr-workable76-r111-2026-09-11/manifest.json`
- SHA-256 manifest: `4be8287c7ec661404fc5d2b13b5e8bd1f492d876c6f6793ed3b374e8d2a54210`
- Bundle runtime: `cd448b42-final-total-only-r111-20260911`
- SHA-256 worker dichiarato nel report runtime: `b0616c276e002c62d5edaad1d97c53ca211e1ffb1273d026254521b5229faebc`
- Fonti concordanti: checkpoint persistente (76 risultati), journal (76 `case_terminalized` + `simple_lot_completed`) e report finale persistente.

## Esito complessivo

| Esito | Totale 76 | Nucleo 70 | Sei riacquisite |
|---|---:|---:|---:|
| `SAVED` | 33 | 31 | 2 |
| `OPERATOR_REQUIRED` | 16 | 16 | 0 |
| `TECHNICAL_BLOCK` | 19 | 15 | 4 |
| `INCONSISTENT` | 8 | 8 | 0 |

Il dato grezzo operativo è quindi **33 bozze salvate su 76**. Non è una misura dell'autonomia contrattuale: il manifest contiene casi tecnici, casi da localizzare e casi con fonti discordanti. Gli otto `INCONSISTENT` non ricevono un verdetto diverso in questo report.

**Rettifica dopo verifica completa della terza fonte:** i cinque casi pubblicati come `TECHNICAL_BLOCK` per `no_material_progress_for_7_minutes` non possiedono un `case-truth` terminale concordante. Sabrina Eustomi ha uno snapshot `OPERATOR_REQUIRED`; Giacotto, Bellini, Girelli e Lomartire hanno snapshot non terminali con runner non avviato. La tabella sopra conserva i conteggi grezzi prodotti dal lotto; secondo la tassonomia rigorosa, il quadro verificato è quindi **14 `TECHNICAL_BLOCK` concordanti e 13 `INCONSISTENT`**, non 19 e 8.

## SAVED — 33

Tutte le righe seguenti hanno pagine complete e un identificativo bozza persistito.

| Pratica | Bozza | Pagine |
|---|---:|---:|
| Vera Buracchi | 486655 | 11/11 |
| Della Maria Carla Vigetti | 486702 | 9/9 |
| Natale Tiraboschi | 486723 | 8/8 |
| Giovanni Pescatori | 486772 | 8/8 |
| Fares Hassairi | 486816 | 10/10 |
| Milena Albertoni | 486839 | 8/8 |
| Cataldo Cassone | 486869 | 8/8 |
| Marco Tocchetti | 486891 | 9/9 |
| Claudio Beghini | 486973 | 8/8 |
| Gianluigi Chiolini | 487008 | 9/9 |
| Gianfranco Lavezzi | 487079 | 9/9 |
| Luca Ronconi | 487137 | 8/8 |
| Antonella Ferletic | 487194 | 9/9 |
| Lia Chiericati | 487233 | 8/8 |
| Monica Molteni | 487307 | 9/9 |
| Claudia Campagna | 487357 | 8/8 |
| Fabio Sartori | 487419 | 8/8 |
| Annalisa Lanzo | 487480 | 8/8 |
| Armando Ranzoni | 487542 | 10/10 |
| Monica Ambra Fioravanti | 487610 | 9/9 |
| Adelfio Pietro Spinelli | 487675 | 8/8 |
| Lucia Lagrasta | 487743 | 11/11 |
| Angelina Stricelli | 487831 | 14/14 |
| Nadia Ragni | 487918 | 9/9 |
| Romeo Ropa | 487973 | 8/8 |
| Mauro Ballabio | 488032 | 10/10 |
| Rosa Toscano | 488095 | 9/9 |
| Luigi Carfora | 488142 | 8/8 |
| Zeno Righetti | 488187 | 19/19 |
| Gabriello Manso | 488286 | 8/8 |
| Fabrizio Pelizzari | 488373 | 9/9 |
| Filippo Bigalli | 488399 | 8/8 |
| Alessandro Zaniboni | 488414 | 8/8 |

## OPERATOR_REQUIRED — 16, per causa

### Localizzazione CRM, non domanda operatore — 5

Il runtime ha cercato una sola partizione/fase congelata e non ha trovato l'ID stabile nella fase attesa. Questo è un problema di localizzazione, non una richiesta di dati al cliente.

- Rossella Munafò
- Patrizia Muzzi
- Stefania Venturi
- Angela Tuttolani
- Fausta De Filippo

Correzione generale differita: cercare l'ID stabile attraverso tutte le pipeline ammesse, trattando la fase come attributo corrente e non come parte dell'identità. Munafò e Muzzi sono già state ritrovate indipendentemente in `archiviate`; per le altre tre il lotto non ha eseguito una ricerca trasversale.

### Risoluzione chiusure oscuranti non applicata — 7

Codice runtime: `infissi_invoice_evidence_incomplete_for_shading_closure_resolution`.

- Matteo Capitanelli — la decisione successiva di Giuliano risolve il caso: due chiusure da 750×2450 e 755×2450 sui primi due dei sette infissi. La domanda operatore non serve più.
- Andrea Trabucco — falso `OPERATOR_REQUIRED`: form NO e fattura silente; la regola già decisa “fattura silente = NO” avrebbe dovuto chiudere il caso.
- Luca Cigognetti — falso `OPERATOR_REQUIRED`: la zanzariera deve essere associata alla prima finestra secondo la regola già decisa.
- Claudia Sellati — la regola certificata sulle chiusure non ha prodotto una risoluzione terminale; nessuna domanda è stata persistita dal runtime.
- Flavia Cipriani — evidenza fattura ritenuta insufficiente dal runtime; nessuna domanda è stata persistita.
- Ivana Mastrangelo — form NO e fattura senza chiusure dovrebbero ricadere nella regola “fattura silente = NO”; il percorso operativo non l'ha applicata.
- Antonio Scaparrotta — form SÌ ma fattura senza chiusure: secondo la precedenza già decisa, la fattura comanda e la risposta dovrebbe essere NO; il percorso operativo non l'ha applicata.

`operatorQuestion` utile soltanto dove l'evidenza resta davvero ambigua: **“Quante chiusure oscuranti aggiuntive risultano effettivamente fornite insieme agli infissi, e a quali infissi vanno associate?”** Nei casi coperti dalle regole già impartite non va generata alcuna domanda.

### Risposta form sulle chiusure ambigua — 1

- Elena Depalma — `infissi_shading_closures_form_answer_missing_or_ambiguous`; cinque infissi e riferimento a zanzariera, ma allocazione non risolta. `operatorQuestion`: **“Quante zanzariere sono state installate insieme ai cinque infissi di Elena Depalma?”**

### Cardinalità e misure schermature — 2

- Sarah Mondini — il form espone tre righe, il parser ha ricostruito zero prodotti fisici; mancano cardinalità e misure.
- Giulia Kasermann — il form espone una riga, il parser ha ricostruito zero prodotti fisici; mancano cardinalità e misure.

Il runtime ha persistito tre domande per ciascuna:

1. “Confermi il valore corretto da usare per `screenings.quantity`, sulla base dei documenti originari?”
2. “Mancano le misure del prodotto in tutti i documenti originari verificati: puoi inserirle?”
3. “Puoi inserire o indicare il documento tecnico con misure del prodotto richiesto per risolvere `screenings.dimensions`?”

Queste domande sono però **obsolete** rispetto alle risposte già date da Giuliano: Mondini = una pergotenda 540×400 cm; Kasermann = una tenda da sole 300×200 cm. La loro ricomparsa prova che la risposta/regola non ha raggiunto il percorso runtime.

### Conflitto automatico fra fonti Infissi — 1

- Marcella Capatti — `infissi_automatic_source_conflict`: due candidati da sette pezzi, ma il binding fra sorgente e firma prodotto non è stato verificato; APR ha chiuso con zero prodotti. Giuliano aveva già confermato sette infissi e la regola “cardinalità sui pezzi, non sulle righe”. Nessuna nuova domanda dovrebbe essere necessaria.

## TECHNICAL_BLOCK — 19, per causa

### Totale finale stampato non verificato — 3

- Vincenzo Falconi
- Lucia Droghetti
- Francesco Laurelli

Codice: `invoice_final_printed_total_not_verified`. È il falso blocco già registrato: il totale finale stampato fa fede e non deve essere riconciliato con imponibile, IVA, aliquote o bonifici.

### Revisione trasmittanza obbligatoria non completata — 4

- Gregorio Fusco
- Santo Giuga
- Mauro Leonardi
- Gemma Minore

Causa esatta: `infissi_required_validation_revision_did_not_complete:infissi-transmittance-131-to-13-v1` durante il preflight.

### Dimensioni e cardinalità Infissi mancanti — 4

- Massimo Cappello
- Guido Calvacchi
- Cesare Imperiali
- Stefano Buosi

Codice: `infissi_dimensions_and_cardinality_missing`. Le fonti risultano presenti, ma il percorso operativo non ha ricostruito dimensioni/cardinalità sufficienti.

### Nessun avanzamento materiale per sette minuti — 5

- Sabrina Eustomi
- Rocco Giacotto
- Paolino Bellini
- Gabriele Girelli
- Silvia Lomartire

Il controller non ha osservato avanzamenti materiali entro il timeout; la singola pratica è stata isolata e il lotto ha proseguito.

### Verifica campi Comune rifiutata da ENEA — 2

- Gloria Padoani — bozza 488343, 0/9; falliti `id-comune_nascita` e `id-comune_residenza`.
- Danila Serpa — bozza 488361, 0/8; fallito `id-comune_nascita`.

### Contratto React della schermatura non pronto — 1

- Lea Dettori — bozza 486755, 5/9; `apr_cdp_enea_screening_react_contract_not_ready:screening:1`.

## INCONSISTENT — 8

Per queste pratiche le fonti non concordano; non viene attribuito un verdetto diverso.

- Loretta Riviera — `infissi_final_printed_invoice_total_required`.
- Milena Fiorini — bozza 486913, 5/12; rilettura server senza prova dopo l'unico recupero autorizzato.
- Eugenio Codognato — risoluzione chiusure oscuranti e totale finale stampato non concordanti.
- Andreea Ioana Olteanu — `infissi_automatic_source_conflict`.
- Marco De Marinis — evidenza fattura insufficiente per risoluzione chiusure.
- Nicla Biagioni — `screening_primary_measurements_missing`.
- Maurizia Coreggioli — `infissi_shading_closures_form_answer_missing_or_ambiguous`.
- Marian Maeschi — `screening_primary_measurements_missing`.

Per questi casi la domanda corretta non è chiedere al cliente un dato finché checkpoint, `report.blockers` e `case-truth` non vengono riallineati. La decisione richiesta a Giuliano, se si vorrà procedere, è: **“Autorizzi una nuova verifica operativa pulita per stabilire il verdetto reale di questa pratica?”**

## Sei pratiche riacquisite dopo caricamento fatture

- Filippo Bigalli — `SAVED`, bozza 488399, 8/8.
- Alessandro Zaniboni — `SAVED`, bozza 488414, 8/8.
- Rocco Giacotto — `TECHNICAL_BLOCK`, nessun avanzamento materiale per sette minuti.
- Paolino Bellini — `TECHNICAL_BLOCK`, nessun avanzamento materiale per sette minuti.
- Gabriele Girelli — `TECHNICAL_BLOCK`, nessun avanzamento materiale per sette minuti.
- Silvia Lomartire — `TECHNICAL_BLOCK`, nessun avanzamento materiale per sette minuti.

## Difetti da correggere dopo il lotto

1. Il totale finale stampato continua a produrre un falso blocco in tre casi.
2. Le regole certificate sulle chiusure oscuranti risultano presenti ma non invocate nel percorso operativo.
3. Le domande operatore non vengono persistite in modo completo: il report contiene soltanto le sei domande di Mondini e Kasermann; gli altri `OPERATOR_REQUIRED` non hanno `operatorQuestion` strutturata.
4. Il lookup CRM è ancora vincolato alla fase congelata e genera cinque falsi casi operatore.
5. La regola generale di allocazione ordinata delle chiusure è registrata come candidata, ma non è stata installata durante il lotto.
6. Quattro pratiche falliscono perché la revisione trasmittanza richiesta non risulta completata nel preflight.
7. Quattro pratiche non ricostruiscono dimensioni/cardinalità Infissi.
8. Cinque pratiche si arrestano senza avanzamento materiale al timeout.
9. Due pratiche vengono rifiutate sui campi Comune.

## Sicurezza

- Anteprima: non tentata.
- Invio/protocollazione: non tentati.
- Comunicazioni: non tentate dal flusso APR.
- Il lotto ha creato o salvato esclusivamente bozze ENEA.

## Fonti primarie

- Report macchina finale: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable76-r111-20260911/milestones/report-final-complete.json`
- Checkpoint: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable76-r111-20260911/checkpoint.json`
- Journal: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-workable76-r111-20260911/journal.ndjson`
- Registro correzioni post-lotto: `ops/apr-workable76-r111-2026-09-11/post-lot-corrections-register.json`
- Decisione allocazione chiusure: `ops/apr-workable76-r111-2026-09-11/business-decision-ordered-shading-closure-allocation.json`
