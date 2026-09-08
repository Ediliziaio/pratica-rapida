# APR — diagnosi progressiva dei quattro presunti regressi r67

Data: 2026-09-06  
Stato: **IN CORSO — nessuna correzione autorizzata o applicata**

## Mandato

Confrontare Roberto Marcello, Zeno Righetti, Danila Serpa e Milena Albertoni tra l'ultima esecuzione operativa riuscita e il comportamento attribuito a r67, usando documenti originali e artefatti persistenti. Non proporre né applicare correzioni prima di avere una causa dimostrata.

## Evidenze progressive

### 1. Prima verifica del report terminale r67

Fonte: `enea-shadow-runner/runs/apr-wide100-final-r67-20260906/report.json`.

- **Milena Albertoni**, coorte 3234: `saved`, bozza 465573, 8/8 pagine.
- **Zeno Righetti**, coorte 3257: `saved`, bozza 465585, 19/19 pagine.
- **Danila Serpa**, coorte 3262: `technical_block`, bozza 465588, 0/8 pagine, causa `apr_cdp_enea_field_verification_failed:id-comune_nascita`.
- **Roberto Marcello**: non compare nel report terminale r67 delle 100.

Questa fonte non supporta l'affermazione che r67 abbia bloccato tutti e quattro per totali o misure mancanti. La situazione è quindi provvisoriamente **DISCREPANTE**: occorre identificare la fonte che espone i quattro presunti blocchi prima di attribuire una regressione.

### 2. Seconda verifica sugli artefatti per-pratica r67

- Milena: il sequencer registra `case_saved_after_worker_quiescence` alle 2026-09-06T03:25:37.685Z.
- Zeno: il sequencer registra `case_saved_after_worker_quiescence` alle 2026-09-06T05:14:39.685Z.
- Danila: il sequencer registra `case_technical_block_after_worker_quiescence` alle 2026-09-06T05:21:14.095Z, ancora sul comune di nascita.

Anche la seconda fonte persistente contraddice un blocco economico/prodotto r67 per Milena, Zeno e Danila.

## Ipotesi da verificare, non ancora conclusioni

1. La fonte dei quattro “dati mancanti” potrebbe essere un replay/preflight successivo o uno snapshot globale non coincidente con l'esecuzione operativa r67.
2. Potrebbe trattarsi di dati persistiti/proiettati da una versione precedente, non del comportamento operativo r67.
3. Potrebbe esistere un percorso di analisi diverso da quello usato dal worker che ha effettivamente completato Milena e Zeno.

Finché non sono confrontati checkpoint, `report.blockers` e case-truth/snapshot terminale della medesima esecuzione, non viene attribuito alcun verdetto di regressione.

### 3. Confronto puntuale ultimo successo storico ↔ r67

Sono stati confrontati i checkpoint `crm-local-preflight` delle coorti storiche r22 con quelli r67. I campi confrontati includono hash delle fonti, terna contabile, prodotti fisici, misure, gTot, blocker e stato del payload.

#### Milena Albertoni

- Successo storico: coorte 2629, bozza 449600, `saved`.
- r67: coorte 3234, bozza 465573, `saved`, 8/8.
- Stesse fonti: `3fa878...` e `8f0bf1...` in entrambe le esecuzioni.
- Stessa lettura in entrambe: due fatture da €915,00, totale €1.830,00, terna verde; una tenda 2770×2100 mm, 5,817 m², gTot 0,10.
- In entrambi i checkpoint: `blockers=[]`, `payload_complete`.

**Riscontro progressivo:** nessuna regressione r67; APR ha letto oggi gli stessi totali e le stesse misure e ha completato la bozza.

#### Zeno Righetti

- Successo storico: coorte 2634, bozza 449713, `saved`.
- r67: coorte 3257, bozza 465585, `saved`, 19/19.
- Stesse quattro fonti in entrambe le esecuzioni.
- Stessa lettura in entrambe: due fatture da €5.865,20, totale €11.730,40, terna verde; 12 prodotti con identiche misure e gTot.
- In entrambi i checkpoint: `blockers=[]`, `payload_complete`.

**Riscontro progressivo:** nessuna regressione r67; APR ha letto oggi gli stessi totali e le stesse misure e ha completato la bozza.

#### Danila Serpa

- Storico r22: coorte 2642, `technical_block` sul campo ENEA `id-comune_nascita`.
- r67: coorte 3262, bozza 465588, ancora `technical_block` sul medesimo campo ENEA.
- Stesse due fonti in entrambe le esecuzioni.
- Stessa lettura locale in entrambe: fattura €1.160,01 (imponibile €1.054,55 + IVA €105,46), terna verde; tenda 1970×2000 mm, 3,94 m², gTot 0,08.
- In entrambi i checkpoint preflight: `blockers=[]`, `payload_complete`.

**Riscontro progressivo:** nessuna regressione su fatture o misure. Inoltre non è stato trovato alcun report/checkpoint storico `saved` di Danila: le esecuzioni operative persistite la fermano ripetutamente sul comune di nascita, non sui documenti economici.

#### Roberto Marcello

- Successo verificato: replay r24, coorte 2820, bozza 452111, `saved`.
- Lettura del successo: cinque fatture, totale €8.273,04, terna verde, nessun blocker, `payload_complete` nel percorso Infissi.
- Roberto non appartiene al manifest congelato delle 100 e non compare nel report r67; non esiste quindi una sua esecuzione r67 da confrontare.

**Riscontro progressivo:** non è dimostrabile un blocco r67 di Roberto, perché r67 non lo ha eseguito. Attribuire a r67 un suo presunto esito “dati mancanti” mescola necessariamente un artefatto di un'altra esecuzione.

### 4. Verifica del bundle realmente eseguito

Gli `apr-enea-worker.mjs` installati nelle coorti r67 3234, 3257 e 3262 hanno tutti SHA-256 `b52ec569d32ccc340f315697f294e2e43622dfd9029cc3f8d36f880b9dd6239e`, uguale al bundle canonico corrente r67.

Il diff r66→r67 modifica esclusivamente governo e comportamento di quiescenza dei worker terminali. Non modifica parser fatture, parser prodotti, gTot, resolver comuni o riconciliazione economica.

### 5. Causa provvisoria ormai fortemente supportata

L'allarme “tutti e quattro bloccati oggi da r67 per dati mancanti” non proviene dall'esecuzione operativa r67. È una **fusione di stati provenienti da esecuzioni differenti o da snapshot storici**:

- due casi r67 realmente `saved` sono stati presentati come bloccati;
- Danila è stata presentata con una causa documentale diversa dal suo vero arresto ENEA;
- Roberto è stato attribuito a un lotto nel quale non era presente.

La regressione osservata è quindi, fino a prova contraria, nella **raccolta/classificazione del report diagnostico**, non nel percorso operativo APR che ha letto i documenti. La conclusione definitiva richiede ancora di identificare l'artefatto esatto usato per costruire l'elenco contestato.

## Verifica conclusiva

### Identificazione della contaminazione storica

La ricerca su tutti i checkpoint persistenti mostra che i vecchi falsi blocker documentali esistono, ma in esecuzioni storiche differenti:

- Milena aveva `completion_date_missing` e `gross_triple_reconciliation_failed` nella vecchia coorte 33; dalle coorti operative successive fino a r67 il preflight è verde e r67 la salva.
- Roberto aveva `screenings_missing` e `invoice_332a5af9` nelle vecchie coorti 55/56 e in diversi replay anteriori alla correzione; r24 lo completa dopo la correzione della lineage provinciale. Non viene eseguito da r67.
- Il checkpoint globale Infissi del 24 agosto contiene vecchi blocker di dimensioni/cardinalità per Danila, pur essendo Danila una pratica Schermature; il preflight r67 corretto trova invece misura, superficie, gTot e totale economico.
- Non è stato trovato alcun checkpoint documentale bloccato di Zeno nel percorso comune corrente: r67 lo completa con 12 prodotti.

La presenza di Roberto nell'elenco attribuito a r67, pur essendo assente dal manifest e dal report r67, è la prova discriminante: l'elenco contestato non poteva derivare dalla sola esecuzione r67. Ha riutilizzato o fuso risultati storici senza vincolare la selezione a `runId/cohort/bundle/document fingerprint`.

### Tripla verifica terminale

| Pratica | Fonte 1: report del lotto | Fonte 2: checkpoint esecuzione/preflight | Fonte 3: snapshot terminale dashboard | Conclusione verificata |
|---|---|---|---|---|
| Milena Albertoni | `saved`, 8/8, bozza 465573 | `saved`; preflight completo, zero blocker | `IDLE`, “Bozza TEST completa” | Nessuna regressione; r67 ha completato |
| Zeno Righetti | `saved`, 19/19, bozza 465585 | `saved`; preflight completo, zero blocker | `IDLE`, “Bozza TEST completa” | Nessuna regressione; r67 ha completato |
| Danila Serpa | `technical_block`, comune di nascita | preflight documentale completo e senza blocker; execution arrestata su `id-comune_nascita` | `TECHNICAL_BLOCK`, stessa causa | Nessuna regressione documentale; resta un problema distinto di selezione comune ENEA |
| Roberto Marcello | assente dal lotto r67 | nessun checkpoint r67; ultimo replay r24 `saved`, 16/16 | ultimo snapshot r24 `IDLE`, bozza completa | Nessun verdetto r67 possibile; attribuzione a r67 non valida |

Per Danila lo stato interno legacy `operator_intervention` e lo stato pubblico `TECHNICAL_BLOCK` differiscono nominalmente, ma riportano la stessa causa tecnica; non esiste alcun blocker di dati mancanti. Non viene quindi trasformato in un blocco documentale.

### Verdetto finale della diagnosi

**Non è stata dimostrata alcuna regressione dei parser r67 su questi quattro casi.**

La causa esatta dell'emergenza è una **regressione di reporting/provenienza**: sono stati attribuiti all'esecuzione r67 blocker provenienti da checkpoint storici o da percorsi non applicabili. Il difetto consiste nell'assenza, nel raggruppamento diagnostico usato, di un vincolo simultaneo su esecuzione, coorte, bundle e impronta dei documenti.

In particolare:

- Milena e Zeno costituiscono controprove operative dirette, perché r67 li ha effettivamente completati;
- Danila costituisce una controprova di contenuto, perché r67 ha letto correttamente fattura e misura e si è fermato solo dopo, sul comune di nascita;
- Roberto costituisce la prova di contaminazione tra run, perché non era nel lotto r67.

Non è stata applicata né proposta alcuna correzione. Il dossier documenta soltanto la causa provata.
