# APR r60 — Nadia Ragni, misure `L × S`

Data: 2026-09-05

## Esito sintetico

- La segnalazione iniziale `screenings_missing` era un falso blocco APR: le misure sono presenti e leggibili in entrambe le fatture.
- La causa è stata corretta in modo generale e la correzione è installata nel bundle canonico r60.
- Il replay operativo pulito ha superato il preflight con una schermatura `5000 × 2900 mm` (14,5 m²) e ha creato la nuova bozza TEST ENEA `465411`.
- La bozza non è completa: dopo il salvataggio verificato della pagina Beneficiario, APR si è fermato fail-closed sulla pagina Immobile per `apr_cdp_enea_field_verification_failed:id-comune`.
- Questo secondo impedimento è distinto dalla lettura delle misure e non è stato corretto nell'ambito di r60.

## Prova sui documenti originali

Le fatture di acconto e saldo riportano entrambe la riga prodotto `Compakt / Pergotenda telo retrattile motorizzata` e la misura `L 500 x S 290`.

APR conservava correttamente il testo OCR, ma il parser accettava le seconde dimensioni etichettate `H` o `SP`, non l'abbreviazione esplicita `S` usata per la sporgenza. Inoltre la deduplicazione tecnica non riconosceva le intestazioni con particelle `Fattura di acconto` e `Fattura a saldo`, quindi rischiava di contare due volte lo stesso prodotto pur dovendo conservare entrambe le fatture per la riconciliazione economica.

Il pattern appartiene alla stessa famiglia generale del caso Lanzo (riga prodotto dimensionata non conservata), ma ha sintassi diversa: Lanzo usa `DIM. CM L … × …`; Ragni usa due assi esplicitamente etichettati `L … × S …`.

## Correzioni generali

1. `system-labelled-screening-depth-abbreviation-v1`
   - riconosce solo prodotti schermanti già classificati;
   - richiede entrambe le etichette esplicite `L` e `S`;
   - normalizza l'unità con il risolutore condiviso;
   - non interpreta coppie numeriche senza etichette;
   - non sostituisce parser più autorevoli quando superficie o gTot sono espliciti.

2. `system-explicit-acconto-saldo-particle-technical-supersession-v1`
   - riconosce `di/d'acconto` e `a saldo` nelle intestazioni fiscali;
   - conserva entrambi i documenti economici;
   - ritira soltanto la duplicazione tecnica dell'acconto quando firma prodotto e cronologia concordano;
   - resta fail-closed in caso di firme incompatibili o parole soltanto incidentali.

Il gTot non viene inventato dal parser: resta demandato al classificatore già autorizzato per le Pergotende generiche.

## Verifica sul campione

La ricerca sul corpus congelato delle 100 pratiche ha trovato il formato `L × S` in due casi:

- Nadia Ragni: comportamento corretto da r60;
- Rosa Toscano: superficie/gTot già espliciti e già gestiti da un parser più autorevole; r60 non ne modifica il risultato.

Non sono emersi altri casi del campione modificati dalla nuova regola.

## Test e gate

- Test mirati positivi e negativi: verdi.
- Suite completa: 437/437 file di test, 1.752/1.752 test verdi.
- Audit storico delle decisioni: 101 decisioni dichiarate, 96 attive, 5 superseded, 0 irrisolte.
- Gate monotono: `active_tested_deployed`.
- Bundle canonico: `versions/af834aa2-labelled-screening-depth-r60-20260905`.
- Fingerprint sorgente: `623c88b2da3cba14cf21185f14f82c272c56ebb6f6f5569dad6a4b89c59420f9`.

## Replay operativo pulito

- Coorte: `3133`.
- Generazione: `generation-20f4212e1e5ffc52b32c87f4`.
- Nuova bozza canonica: `465411`.
- Nessuna vecchia bozza ripresa.
- Pagina Beneficiario: salvata una volta e verificata lato server.
- Pagina Immobile: due tentativi deterministici sulla stessa bozza, entrambi fermati prima del salvataggio perché il controllo `id-comune` non ha prodotto una corrispondenza ENEA completa.
- Evidenza browser: valore atteso `Trinità d’Agultu e Vignola` (SS); il controllo è rimasto su `Trinità`, senza candidati selezionabili.
- Esito concordante: `TECHNICAL_BLOCK`, bozza non completa, 1/9 pagine salvate.
- Sicurezza: zero anteprime, zero invii, zero comunicazioni.

## Caso residuo strutturato

```json
{
  "customerKey": "nadia-ragni",
  "classification": "technical_block",
  "exactCause": "Il controllo autocomplete ENEA id-comune non ha selezionato il valore atteso Trinità d’Agultu e Vignola (SS): il campo è rimasto a Trinità e la rilettura server/DOM non ha verificato una corrispondenza completa.",
  "missingDocumentType": null,
  "operatorQuestion": "Autorizzi la diagnosi e l'eventuale correzione generale del riconoscimento ENEA dei comuni composti con apostrofo, partendo da Trinità d’Agultu e Vignola, prima di un nuovo replay pulito di Ragni?",
  "onboardingGap": null
}
```

## Tripla verifica dell'esito operativo

1. Processi: worker, supervisor e watchdog della coorte risultavano attivi durante l'esecuzione; keepalive e Chrome APR sono rimasti vivi.
2. Persistenza: checkpoint execution e worker più report del sequencer concordano su `technical_block`, bozza `465411`, una pagina salvata e causa `id-comune`.
3. Dashboard `/api/case-truth`: `sourceState=blocked_case`, `reportOutcome=blocked_case`, blocker `execution_case_operator_required` con la stessa causa.

