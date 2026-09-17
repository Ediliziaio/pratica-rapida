# Report finale verificato — APR r125, 83 pratiche

- Run: `apr-workable83-operator-responses-payload-form-r125-20260914`
- Avvio: 14/09/2026 14:01:15 Europe/Rome
- Conclusione: 14/09/2026 20:46:39 Europe/Rome
- Manifest: 83 pratiche (`workable76`: 76; `new7`: 7)
- SHA-256 manifest: `119dee5097a7c015e79246194bf5ba0797aef13d6d554ea40b668e33c7880a5f`
- Bundle: `8b2652b6-operator-responses-payload-form-r125-20260914`
- SHA-256 worker: `cc4a2794b7bfb9bb37147dc5101498d43e5771e7434635128e1eab038ffe2b01`

## Verdetto a tre fonti

Il report automatico conta 59 `SAVED`, 11 `OPERATOR_REQUIRED`, 7 `TECHNICAL_BLOCK` e 6 `INCONSISTENT`. Il controllo indipendente di checkpoint, report individuale e `/api/case-truth` ha trovato due contraddizioni aggiuntive:

- Milena Albertoni: checkpoint/report `saved`, bozza 493865; case-truth `BLOCKED` su `execution_case_operator_required`.
- Danila Serpa: checkpoint/report `saved`, bozza 495581; case-truth `BLOCKED` con due `infissi_dimensions_and_cardinality_missing` e un `infissi_shading_closures_form_answer_missing_or_ambiguous`.

Perciò il risultato prudente e verificato è:

- `SAVED`: 57
- `OPERATOR_REQUIRED`: 11
- `TECHNICAL_BLOCK`: 7
- `INCONSISTENT`: 8

Standard di accettazione corretto dopo la tripla verifica:

- Salvate: 57
- Con domanda persistita: 7 casi
- Non conformi: 14
- Ritirate: 5
- Lavorabili: 78
- Autonomia tecnica verificata: 57/78 = 73,1%

Il 75,6% (59/78) resta il conteggio automatico non corretto e non va presentato come verificato.

### Gruppi

| Gruppo | Presentate | Ritirate | Lavorabili | SAVED verificate | Con domanda | Non conformi |
|---|---:|---:|---:|---:|---:|---:|
| Nucleo 76 | 76 | 5 | 71 | 55 | 5 | 11 |
| Nuove 7 | 7 | 0 | 7 | 2 | 2 | 3 |
| Totale | 83 | 5 | 78 | 57 | 7 | 14 |

## Domande del solo run corrente

Sono state generate 10 domande nuove. Due sono state poi ritirate automaticamente nello stesso run. È stata inoltre intercettata una domanda già coperta dal ledger, marcata correttamente qui come `RIPETUTA`.

### RIPETUTA — dato già presente nel ledger

- **Rossella Munafò** — “Indica le misure della bioclimatica riportate nel foglio manoscritto corretto per questa pratica.”
  - Il ledger contiene già: bioclimatica 400 × 300 cm, superficie 12,3 m².
  - Nel run la domanda non è stata riaperta (`question_retired`), ma la pratica è rimasta `OPERATOR_REQUIRED`: la risposta non ha ancora prodotto un esito terminale conforme.

### Nuove e aperte

- **Stefania Venturi** — “Puoi fornire il dato o la decisione richiesta descritta qui: Il form del cliente non e completo: mancano i dati dell'edificio e dell'impianto. Completa entrambe le sezioni?”
  - Il form contiene richiedente, residenza e dati catastali; mancano le sezioni edificio e impianto.
- **Nicla Biagioni** — “Confermi se sono state installate chiusure oscuranti insieme agli infissi?”
  - Il percorso Infissi non ha ricostruito in modo conclusivo la risposta sulle chiusure oscuranti.
- **Mauro Leonardi** — “Puoi indicare quanti serramenti sono stati installati e la misura di ciascuno?”
  - Nei documenti acquisiti APR non ha ricostruito numero e misure dei serramenti; il ledger contiene la data di fine lavori, non queste misure.
- **Gabriele Girelli** — “Confermi se sono state installate chiusure oscuranti insieme agli infissi?”
  - Il percorso Infissi non ha ricostruito in modo conclusivo la risposta sulle chiusure oscuranti.
- **Gabriele Girelli** — “Puoi indicare quanti serramenti sono stati installati e la misura di ciascuno?”
  - I documenti acquisiti non hanno prodotto numero e misure dei serramenti.
- **Silvia Lomartire** — “Mancano le misure del prodotto (la veneziana) in tutti i documenti originari verificati. Inseriscile per far riprendere la pratica.”
  - APR ha individuato la veneziana, ma non larghezza e altezza nelle fonti originarie.
- **Silvia Lomartire** — “Puoi allegare il form compilato del cliente?”
  - Il fascicolo CRM non contiene un modulo cliente utilizzabile.
- **Fabio Benvenuti** — “Puoi indicare la data di fine lavori?”
  - La data di fine lavori non è stata ricavata dalle fonti acquisite.

### Nuove ma ritirate nello stesso run

- **Mario Spano** — “Mancano le misure del prodotto (la veneziana) in tutti i documenti originari verificati. Inseriscile per far riprendere la pratica.”
  - Ritirata automaticamente perché il blocker originario non risultava più presente.
- **Mario Spano** — “Puoi indicare quale prodotto e' stato installato e in quale documento e' descritto?”
  - Ritirata automaticamente perché il blocker originario non risultava più presente. La pratica resta `INCONSISTENT` per divergenze su `screenings_missing`, `invoice_332a5af9` e `invoice_929a8665`.

## Regressioni certificate

- **Lea Dettori** — era `SAVED` in r67 con lo stesso fingerprint documentale; ora `TECHNICAL_BLOCK` (`apr_cdp_enea_screening_react_contract_not_ready:screening:1`).
- **Lucia Droghetti** — era `SAVED` in r123 con lo stesso fingerprint documentale; ora `TECHNICAL_BLOCK` (`uncertain_save_lifecycle_invalid:state_status_mismatch:filling:resolved_saved`).

## Recuperate rispetto a r123

Concordanti nelle tre fonti: Patrizia Muzzi, Eugenio Codognato, Santo Giuga, Massimo Cappello e Cesare Imperiali. Danila Serpa non è conteggiata come recuperata perché la dashboard contraddice checkpoint e report.

## Guasti APR dichiarati dal report di disposizione

- Controllo browser/portale: Daniele Formentini, Gloria Padoani, Lea Dettori.
- Esito del salvataggio non dimostrabile: Gemma Minore, Paolino Bellini, Vincenzo Falconi.
- Arresto senza motivo terminale utilizzabile: Fausta De Filippo, Lucia Droghetti, Milena Fiorini.
- Fascicolo non acquisito/analizzato: Andrea Celi, Anthony Pool Juscamaita Fuertes.

In aggiunta, Milena Albertoni e Danila Serpa hanno una divergenza cross-fonte e restano `INCONSISTENT`.

## Le sette pratiche nuove

| Pratica | Esito verificato | Dettaglio |
|---|---|---|
| Fabio Benvenuti | OPERATOR_REQUIRED | Domanda sulla data di fine lavori; restano anche blocker non coperti dalla sola domanda. |
| Gianfranco Zanetti | SAVED | Bozza 495686. |
| Daniele Formentini | TECHNICAL_BLOCK | ENEA rifiuta la verifica di `comune_residenza` dopo due tentativi di recupero. |
| Andrea Celi | OPERATOR_REQUIRED / non conforme | Esclusione permanente Vans; nessuna domanda, nessun fascicolo acquisito. |
| Gabriele Malossi | SAVED | Bozza 495707; case-truth `READY`, nessun problema. |
| Anthony Pool Juscamaita Fuertes | TECHNICAL_BLOCK | Revisione obbligatoria `infissi-transmittance-131-to-13-v1` non completata; nessun fascicolo acquisito. |
| Mario Spano | INCONSISTENT | Nessuna bozza; domande ritirate, ma restano divergenze di estrazione/riconciliazione. |

## Continuità dopo il lotto

Il lotto è concluso e non ha processi residui. Dashboard, Chrome APR e keepalive restano attivi; non sono stati spenti.
