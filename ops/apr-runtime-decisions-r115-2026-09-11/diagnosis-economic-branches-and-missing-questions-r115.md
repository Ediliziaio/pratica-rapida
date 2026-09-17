# Diagnosi r115 — rami economici e `OPERATOR_REQUIRED` senza domanda

Data: 2026-09-12  
Ambito: lotto mirato r115, coorti 6103, 6104, 6109, 6110, 6114, 6115, 6116, 6117, 6118; coorti 6107 e 6108 usate come prova trasversale del bridge.  
Modalità: sola diagnosi locale/read-only su artefatti persistenti; nessuna modifica APR, nessuna installazione, nessuna esecuzione ENEA.

## Verdetto sintetico

- Il controllo economico possiede **3 punti di arresto operativi**, alimentati da **2 ricostruzioni economiche indipendenti**. Esiste inoltre un quarto punto, il classificatore finale, che non controlla importi ma può cambiare l'etichetta pubblica del problema.
- r115 ha eliminato il controllo sulle cifre intermedie e sulla confidenza OCR quando un `grossTotal` è stato estratto, ma **non** ha eliminato il requisito residuo “ogni segmento economico deve avere un totale parsato”. Non copre inoltre la seconda ricostruzione del bridge, che può classificare un bonifico come segmento fattura.
- Cigognetti, Sellati e Depalma sono davvero `OPERATOR_REQUIRED` senza domanda persistita: il blocker nasce nel preflight Infissi, mentre tutti i generatori di domande leggono il solo preflight comune.
- Munafò è diversa: la domanda è stata generata, persistita e consegnata. È il report del lotto a non mostrarla. Il valore `1×1 mm` non è estratto dai documenti: è un **segnaposto hard-coded** scritto dal generatore per soddisfare uno schema dati inadatto alle misure mancanti.

## 1. Topologia completa dei controlli economici

### Due ricostruzioni indipendenti

1. **Preflight comune**: costruisce `FinancialDocumentEvidence[]` e chiama `reconcileFinancialEvidence`. La funzione considera valido un documento economico solo se `grossTotal` è numerico; un singolo segmento economico senza totale aggiunge `totale-finale-fattura-incerto:<sourceId>` e rende inutilizzabile l'intera riconciliazione.
2. **Bridge operativo**: rilegge il checkpoint di analisi, risegmenta i testi e ricostruisce da zero l'economia con `observedEconomicInput()` e `runEconomicVerticalForCurrentCohort()`. Non consuma immutabilmente il risultato del preflight comune.

### Tre punti di arresto

1. **Gate comune** — `crmLocalPreflight.ts:1941`: pubblica `invoice_final_printed_total_not_verified` quando `financialReconciliation.usable === false`.
2. **Gate Infissi** — `infissiBatchPreflight.ts:525-529,616-623`: ricontrolla `finalPrintedTotalVerified`, aggiunge `infissi_final_printed_invoice_total_required` e ricopia anche il blocker economico comune.
3. **Gate bridge** — `apr-enea-operational-bridge-prepare-cli.ts:32-36`: esegue una seconda ricostruzione e termina con `apr_enea_bridge_prepare_economic_unresolved` se non è risolta.

Il **classificatore deep-review** (`deepCaseReview.ts:317-325`) è un quarto ramo downstream, ma non legge o verifica importi: trasforma i codici dei tre gate in `TECHNICAL_REPAIR`, `OPERATOR_REQUIRED` o `BUSINESS_RULE_REQUIRED`. È la ragione per cui Codognato e Riviera arrivano al riepilogo come `INCONSISTENT` invece di ricevere una diagnosi economica concordante.

### Perché alcuni casi passano e altri no

| Pratica | Preflight comune | Bridge | Riscontro conclusivo |
|---|---|---|---|
| Lucia Droghetti | 2 segmenti, totali 1.450 + 550; confidenza `uncertain`, ma tutti i totali presenti | `RESOLVED`, €2.000 | r115 è applicata: la confidenza non blocca; bozza 488696 `SAVED`, case-truth `READY`. |
| Francesco Laurelli | 3 segmenti, totali 677,93 + 840 + 3.759,40; confidenza `uncertain`, ma tutti presenti | `RESOLVED`, €5.277,33 | r115 è applicata; bozza 488697 `SAVED`, case-truth `READY`. |
| Eugenio Codognato | 6 segmenti economici; 5 totali numerici e 1 `grossTotal=null` (`a35d…`) | stesso segmento nullo | il requisito residuo sul totale parsato blocca l'intero fascicolo; le fonti terminali divergono, quindi verdetto formale `INCONSISTENT`. |
| Loretta Riviera | 3 fatture; totali 2.411,20, `null` (`266b…`), 3.014 | stesso segmento nullo | stesso requisito residuo; verdetto formale `INCONSISTENT`. |
| Patrizia Muzzi | nessuna evidenza finanziaria costruita | `fonti-assenti`, `nessuna-fattura-economica-valida` | non è una verifica fallita del numero stampato: l'acquisizione/classificazione non ha prodotto alcuna fattura economica. `TECHNICAL_BLOCK` concordante. |

Prova aggiuntiva che il bridge è un percorso autonomo:

- Ivana Mastrangelo è `ready_local_plan` a €7.486,67 nel preflight comune, ma il bridge include tre ricevute di bonifico come presunti segmenti fattura senza totale e blocca.
- Antonio Scaparrotta è `ready_local_plan` a €8.905,55 nel preflight comune, ma il bridge include una ricevuta di bonifico come presunto segmento fattura senza totale e blocca.

La selezione del bridge parte da allegati di analisi con `kind === "invoice"`, li risegmenta e applica un euristico fiscale (`aprEconomicCorpusReplay.ts:74-114`). Per questo uno slot CRM archiviato sotto fattura può far rientrare anche una ricevuta bancaria. La correzione r115 è quindi presente, ma copre il calcolo del totale già estratto; non rende coerenti le due ricostruzioni né risolve classificazione/acquisizione a monte.

## 2. `OPERATOR_REQUIRED` senza domanda

### Cigognetti, Sellati e Depalma

Le tre fonti concordano sullo stato caso:

- preflight Infissi: `blocked_case` con `infissi_shading_closures_form_answer_missing_or_ambiguous` e nessun `operatorQuestion` nel blocker;
- deep review: `OPERATOR_REQUIRED`, ma il testo è soltanto `nextAction` generato al volo;
- terminal observation `/api/case-truth`: `blocked_case`, un blocker coerente, stato pubblico `OPERATOR_REQUIRED`.

Il checkpoint `operator-questions/checkpoint.json` resta a revisione 0 e senza domande. La causa è il cablaggio:

- il server passa `infissiSnapshot` soltanto a `retireInfissiClosureMeasurementQuestions`;
- i quattro metodi di discovery ricevono invece `crmLocalPreflight.snapshot(...)` (`localDashboardServer.ts:969-973` e `1184-1189`);
- nessun metodo traduce un blocker Infissi generico in una domanda persistente;
- `deepCaseReview.questionFor()` sa formulare il testo per quel codice, ma lo scrive solo in `DeepReviewItem.nextAction` (`deepCaseReview.ts:203-217,320-325`), non nello store delle domande.

Quindi il difetto è generale per qualunque `operator_required` che nasca esclusivamente nel verticale Infissi e non possieda già `operatorQuestion` nel blocker.

### Munafò: non è realmente “senza domanda”

Le fonti persistenti mostrano:

- preflight comune `blocked_case` con quattro blocker, incluso `operator_response_pending_external_data`;
- deep review `OPERATOR_REQUIRED`;
- case-truth `blocked_case` con gli stessi quattro blocker;
- store domande revisione 1 con domanda aperta `complex-vendor:rossella-munafo:dc3e55c0489de4e3`;
- delivery checkpoint con domanda consegnata all'outbox locale.

Testo persistito: “La fattura non riporta alcuna misura. Sono stati trovati più documenti tecnici di fornitori/posizioni diversi. Conferma quale prodotto/posizione è quello corretto per questa pratica e indica larghezza e altezza esatte.”

Il report aggregato del lotto salva solo `state` e `reason` del finalizzatore e non incorpora lo snapshot `operator-questions`; per questo la domanda scompare dal riepilogo pur esistendo nel sottosistema dedicato.

### Origine di `1×1 mm`

Non è OCR e non è estrazione. In `operatorQuestions.ts` i tre generatori per misure assenti/ambigue costruiscono esplicitamente:

```ts
payload: { rawWidth: 1, rawHeight: 1, reportedUnit: "mm", ... }
```

Le occorrenze sono alle righe 188, 257 e 288; Munafò entra nel ramo multi-fornitore delle righe 264-289. Il motivo strutturale è che il tipo `missing_measurement` riusa un payload che richiede sempre larghezza e altezza, anche quando il dato è precisamente assente. Il codice inserisce quindi `1×1` come sentinella positiva per soddisfare lo schema.

Il valore non è stato inviato a ENEA in questo lotto: la pratica è rimasta bloccata e `answer()` esige una misura esplicita prima di applicare una risposta (`operatorQuestions.ts:293-304`). Resta però un dato inventato e ambiguo nell'audit, perché è indistinguibile tipologicamente da una misura osservata.

## Fonti persistenti verificate

Per ciascun caso sono stati confrontati: `crm-local-preflight/checkpoint.json`, `infissi-batch-preflight/checkpoint.json`, `deep-case-review/checkpoint.json`, `operator-questions/checkpoint.json` nella relativa coorte e lo snapshot terminale contenente `/api/case-truth` nella directory globale `enea-shadow-runner/terminal-observability/`.

Run del lotto: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-runtime-decisions-r115-targeted21-20260911`.

Coorti: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-{6103,6104,6107,6108,6109,6110,6114,6115,6116,6117,6118}-global-controller-*`.

Diagnostica riproducibile read-only: `ops/apr-runtime-decisions-r115-2026-09-11/diagnose-economic-branches.ts`.

## Azioni escluse

Nessun file applicativo è stato modificato; nessun bundle è stato costruito o installato; nessuna pratica è stata eseguita o ripresa; il giro lungo non è stato avviato.
