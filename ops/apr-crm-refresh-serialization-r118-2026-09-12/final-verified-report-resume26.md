# Report finale verificato — continuazione 26 pratiche r118

Generato: 2026-09-12T23:45:35+02:00  
Esecuzione: `apr-workable76-resume-remaining26-r118-20260912`  
Intervallo operativo: 2026-09-12 21:07:49–23:22:25 Europe/Rome (2 h 14 min 36 s)  
Manifest: 26 casi, SHA-256 `c7ad21b6ac47df96137f142f6e4c031aaa54c5b05a934638f691c28995e10e86`  
Bundle runtime: `f086c1f4-crm-refresh-serialization-r118-20260912`  
Worker SHA-256: `295b9fe0083f82243b7435c775ea02d3c5f0ab5f0aabf8ec820167bd899822ad`

## Verdetto

Il runner grezzo ha scritto 11 SAVED, 3 OPERATOR_REQUIRED, 10 TECHNICAL_BLOCK e 2 INCONSISTENT. Questo riepilogo non e il verdetto finale: cinque dei dieci timeout etichettati dal controller esterno come TECHNICAL_BLOCK divergono dagli stati persistenti della pratica e dallo snapshot terminale.

Applicando la verifica obbligatoria tra checkpoint del caso, `report.blockers` dei componenti e snapshot persistente equivalente a `/api/case-truth`, il risultato verificato e:

| Stato verificato | Casi |
|---|---:|
| SAVED | 11 |
| OPERATOR_REQUIRED formalmente concordante | 3 |
| TECHNICAL_BLOCK concordante | 5 |
| INCONSISTENT | 7 |
| Totale | 26 |

Le 11 bozze SAVED comprendono 117 pagine completate. Nessuna anteprima, submit, comunicazione o ricevuta e stata tentata.

## SAVED — 11

| Pratica | Bozza ENEA | Pagine | Verifica |
|---|---:|---:|---|
| Mauro Ballabio | 490292 | 10/10 | Nessun problema; checkpoint, report e snapshot terminale concordanti |
| Flavia Cipriani | 490299 | 13/13 | Nessun problema; fonti concordanti |
| Rosa Toscano | 490303 | 9/9 | Nessun problema; fonti concordanti |
| Luigi Carfora | 490306 | 8/8 | Nessun problema; fonti concordanti |
| Zeno Righetti | 490311 | 19/19 | Nessun problema; fonti concordanti |
| Sarah Mondini | 490322 | 8/8 | Nessun problema; fonti concordanti |
| Marcella Capatti | 490327 | 14/14 | Nessun problema; fonti concordanti |
| Giulia Kasermann | 490329 | 8/8 | Nessun problema; fonti concordanti |
| Gabriello Manso | 490332 | 8/8 | Nessun problema; fonti concordanti |
| Ivana Mastrangelo | 490339 | 11/11 | Nessun problema; fonti concordanti |
| Monica Ambra Fioravanti | 490347 | 9/9 | Nessun problema; il nuovo tentativo ha superato il precedente HTTP 504 |

## OPERATOR_REQUIRED formalmente concordante — 3

### Elena Depalma

- Causa pubblicata: risposta sulle chiusure oscuranti considerata mancante o ambigua.
- Domanda generata: **“Confermi se sono state installate chiusure oscuranti insieme agli infissi?”**
- Risposta gia data da Giuliano: **SI, sono state installate chiusure oscuranti.** Il form contiene il dato; metallo e vetro doppio per tutti e cinque erano gia stati registrati e applicati dal ledger.
- Valutazione: falso OPERATOR_REQUIRED; e un altro caso della famiglia “regole chiusure presenti ma non applicate dal runtime”. Non va richiesto nuovamente a Giuliano.

### Marian Maeschi

- Causa pubblicata: decisione economica autorevole Infissi assente; il gate Infissi ha inoltre ricostruito zero righe tecniche.
- Dato decisivo gia presente nel ledger: Giuliano ha dichiarato la pratica **chiusa esternamente**.
- Valutazione: falso OPERATOR_REQUIRED. Il preflight comune ha applicato correttamente la disposizione `closed_externally`, ma il percorso Infissi ha continuato e ha sovrascritto l'esito. Nessuna nuova domanda e necessaria.

### Francesco Laurelli

- Causa pubblicata: acquisizione CRM non valida, HTTP 504 Gateway Timeout.
- Testo generato: “Il CRM e nuovamente raggiungibile con l'account APR in sola lettura per acquisire la pratica di Francesco Laurelli?”
- Valutazione: classificazione formalmente concordante nelle fonti correnti, ma semanticamente errata. Un 504 e un problema tecnico temporaneo da ritentare, non una domanda dati per l'operatore.

## TECHNICAL_BLOCK concordanti — 5

### Ricostruzione prodotti Infissi — 3

| Pratica | Causa esatta |
|---|---|
| Guido Calvacchi | Le fonti sono presenti, ma APR non ricostruisce dimensioni e cardinalita degli infissi; il gate Infissi registra due blocker coerenti sulle righe tecniche. |
| Cesare Imperiali | Le fonti sono presenti, ma APR non ricostruisce dimensioni e cardinalita degli infissi; nessuna bozza creata. |
| Stefano Buosi | Sei fonti risultano acquisite, ma APR non ricostruisce dimensioni e cardinalita degli infissi; la risposta precedente indicava certificati con misure caricati, quindi il problema e di acquisizione/associazione runtime, non un'assenza documentale provata. |

### Valore del comune rifiutato dal portale — 2

| Pratica | Bozza | Causa esatta |
|---|---:|---|
| Gloria Padoani | 490342 | ENEA ha rifiutato i valori di comune di nascita e comune di residenza durante la verifica dei campi; 0/9 pagine completate. |
| Fausta De Filippo | 490346 | ENEA ha rifiutato il comune di nascita durante la verifica dei campi; 0/9 pagine completate. |

## INCONSISTENT — 7

Questi casi non ricevono un verdetto di merito. Il controller esterno, il checkpoint di esecuzione e/o lo snapshot terminale non concordano.

| Pratica | Divergenza verificata | Informazione sottostante, non elevata a verdetto |
|---|---|---|
| Andreea Ioana Olteanu | Controller: timeout tecnico a 7 minuti. Esecuzione: `ready`, payload in coda. Snapshot: `INCONSISTENT`. | Il preflight comune segnala fine lavori 18/04/2025, portale annuale incompatibile e oltre 90 giorni; il gate Infissi e invece verde. Nessuna bozza. |
| Marco De Marinis | Controller: timeout tecnico a 7 minuti. Esecuzione: `ready`, payload in coda. Snapshot: `INCONSISTENT`. | Il preflight comune segnala fine lavori 17/12/2025, portale annuale incompatibile e oltre 90 giorni; il gate Infissi e verde. Nessuna bozza. |
| Nicla Biagioni | Preflight comune e Infissi hanno blocker su prodotti/misure; la deep review chiede operatore; lo snapshot terminale pubblica zero blocker. | Possibili misure/prodotti non ricostruiti e totale di un documento non riconosciuto. Nessuna domanda e affidabile finche le fonti non concordano. |
| Sabrina Eustomi | Controller: timeout tecnico. Preflight: `blocked_case` per modulo cliente originario assente. Snapshot: `OPERATOR_REQUIRED` senza una case-truth completa. | Candidato `missingDocumentType`: modulo cliente originario. Domanda candidata: “Puoi inserire il modulo cliente originario?”; non e ancora un verdetto concordante. |
| Maurizia Coreggioli | Controller: timeout tecnico. Esecuzione: `ready`; snapshot: `INCONSISTENT`. | Il preflight comune segnala modulo cliente originario assente, mentre il gate Infissi e verde. Nessuna bozza. |
| Mauro Leonardi | Preflight comune registra data 04/11/2025, oltre 90 giorni e misure prodotto mancanti; deep review chiede operatore; snapshot terminale pubblica zero blocker. | Domande candidate: portale/periodo corretto e misure del prodotto; non sono affidabili finche le fonti non concordano. |
| Gemma Minore | Controller: timeout tecnico. Esecuzione: `ready`; snapshot: `INCONSISTENT`. | Il preflight comune non identifica univocamente il cointestatario, mentre il gate Infissi e verde. Nessuna bozza. |

## Famiglia chiusure oscuranti — priorita post-lotto

Oggi questa famiglia ha fermato **4 pratiche uniche**, per **7 arresti complessivi** contando i tentativi ripetuti:

- Luca Cigognetti: 2 arresti; form SI e allegato “installazione zanzariera 7 pz”, ma zero chiusure ricostruite.
- Claudia Sellati: 2 arresti sulla stessa famiglia.
- Santo Giuga: 1 arresto; form e fattura concordano sulla zanzariera con gli infissi.
- Elena Depalma: 2 arresti; risposta presente nel form e confermata da Giuliano.

Il difetto e registrato come `infissi_shading_closures_rules_not_applied_at_runtime`. Ha molte regole certificate ma continua a non applicarle in tutti i rami operativi; va aperto come problema architetturale con Claude Code, non con correzioni per nome.

Artefatto strutturato: `ops/apr-crm-refresh-serialization-r118-2026-09-12/post-lot-closure-family-priority.json`.

## Effetto della correzione CRM r118

Nel lotto completo non e ricomparso `login_required`; i 26 casi sono stati processati senza una nuova caduta della sessione CRM. L'unico errore di trasporto CRM e stato il 504 su Laurelli, mentre Fioravanti — ritentata dopo il precedente 504 — e stata salvata correttamente. Questo prova operativamente la continuita del lotto, ma non dimostra ancora l'assenza assoluta di futuri errori del fornitore.

## Fonti e limite della verifica

Per ogni caso sono stati confrontati:

1. checkpoint e report del runner singolo nella run root;
2. checkpoint persistenti di preflight comune, gate Infissi ed esecuzione ENEA, inclusi i `report.blockers`;
3. snapshot persistente in `enea-shadow-runner/terminal-observability/`, la fonte servita da `/api/case-truth` anche dopo la quiescenza.

La dashboard HTTP su porta 10036 non era raggiungibile al momento della redazione; per la terza fonte e stato quindi usato lo snapshot terminale persistito, come previsto dalla regola di verifica. Ogni divergenza e rimasta `INCONSISTENT`.
