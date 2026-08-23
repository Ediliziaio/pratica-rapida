# BLOCCO 2/3 — APR: architettura attuale, stato reale e problemi noti

> Documento autonomo e sanitizzato. Non contiene dati personali, segreti o URL privati.

## 4. ARCHITETTURA ATTUALE DEL SOFTWARE

### Stack tecnico

- **Linguaggio:** TypeScript 5.8 / JavaScript ESM.
- **Runtime:** Node.js.
- **Interfaccia:** React 18 + Vite 5.
- **Test:** Vitest 3, JSDOM per i contratti DOM locali.
- **Validazione:** Zod in alcune parti; molte strutture persistenti hanno validatori manuali.
- **PDF:** `pdfjs-dist` per estrazione testo.
- **OCR:** estrazione nativa PDF più helper macOS Vision (`aprPdfOcr.m`) per immagini/scansioni.
- **Browser automation:** client CDP proprietario su WebSocket (`ws`); **non** Playwright e **non** Selenium.
- **CRM:** REST/PostgREST e Storage compatibili Supabase, con soli `GET` nell'adattatore reale corrente.
- **Persistenza operativa:** file JSON append-only/checkpoint, lock atomici e SHA-256 sul filesystem locale.
- **Servizi macOS:** LaunchAgent separati per supervisor, worker e watchdog.
- **Build persistente:** bundle ESM creati con esbuild tramite script dedicato.

### Struttura principale del repository

```text
.
├── src/
│   ├── features/
│   │   ├── enea-shadow-crm/
│   │   │   ├── operationalRegistry.ts        # registro unico delle regole
│   │   │   ├── ruleTestMatrix.ts             # matrice regola -> test/evidenza
│   │   │   ├── documentedProductRouting.ts   # routing dalla fonte, non dall'etichetta
│   │   │   ├── aprCrmIntegrationContract.ts  # contratti futuri CRM mutativi
│   │   │   ├── aprCrmReadOnlyContract.ts     # allowlist del CRM read-only
│   │   │   ├── financialReconciliation.ts    # fatture/bonifici/totali
│   │   │   ├── productCardinalityPolicy.ts   # cardinalità fisica 1:1
│   │   │   ├── infissi*.ts                   # regole, parser e payload Infissi
│   │   │   └── vepaModule.ts                 # routing/contratto VEPA incompleto
│   │   └── enea-lab/
│   │       ├── invoiceParser.ts               # parsing fatture e descrizioni
│   │       ├── mapper.ts                      # form+fonti -> campi normalizzati
│   │       ├── portal*.ts                     # contratti delle pagine ENEA
│   │       └── screeningRules.ts              # mapping schermature
│   ├── pages/
│   │   └── EneaShadowCrm.tsx                  # interfaccia di revisione/laboratorio
│   └── types/
│       └── form-cliente.*                     # struttura del form cliente
├── scripts/enea-shadow-runner/
│   ├── runner.ts / types.ts                   # coda, stato, audit, checkpoint
│   ├── supervisorRuntime.ts                   # dashboard e coordinamento
│   ├── aprWatchdogRuntime.ts                  # rilevazione stallo/ripresa
│   ├── aprEneaBrowserWorker.ts                # esecutore persistente APR
│   ├── cdpClient.ts                           # protocollo Chrome DevTools
│   ├── cdpEneaBrowserDriver.ts                # driver reale delle pagine ENEA
│   ├── crmAuth.ts                             # autenticazione CRM locale
│   ├── crmIncomingReadOnly.ts                 # polling Pronte da fare
│   ├── crmAuthenticatedReadOnly.ts            # acquisizione dossier
│   ├── crmOriginalDocuments.ts                # download allegati originari
│   ├── crmDocumentAnalysis.ts                 # PDF/OCR e classificazione
│   ├── crmLocalPreflight.ts                   # validazione comune
│   ├── infissiBatchPreflight.ts               # gate specifico Infissi
│   ├── infissiDraftPackage.ts                 # workflow tecnico Infissi
│   ├── eneaDraftExecution.ts                  # intenti, pagine, prove server
│   ├── caseStatusTruth.ts                     # verità caso per dashboard
│   ├── deepCaseReview.ts                      # revisione dei blocker
│   ├── dashboard.ts / localDashboardServer.ts # dashboard/API loopback
│   └── buildPersistentBundles.mjs             # build dei servizi installabili
├── docs/                                      # report e runbook storici
├── config/                                    # configurazioni locali: non allegare senza sanitizzazione
├── vitest.infissi.config.ts
└── vitest.infissi-related.config.ts
```

### Flusso dati end-to-end attuale

```text
CRM Pronte da fare (GET)
        │
        ▼
evento persistito + deduplica + revisione
        │
        ▼
dossier CRM read-only + allegati Storage GET
        │
        ▼
PDF text extraction / OCR / segmentazione fatture
        │
        ▼
routing prodotto da fonti originarie
        │
        ▼
normalizzazione form + fatture + documenti tecnici
        │
        ▼
registro regole + precedenze + riconciliazione + cardinalità
        │
        ├── ambiguo/non coperto ──> domanda operatore locale; coda continua
        │
        ▼
preflight comune + gate prodotto
        │
        ▼
pacchetto bozza auditato e fingerprintato
        │
        ▼
worker APR via CDP, una pratica alla volta
        │
        ▼
intento persistente -> compilazione -> Salva -> prova server
        │
        ▼
dashboard/checkpoint/audit
```

### Regole e audit

Il registro unico è `operationalRegistry.ts` (versione osservata: `enea-operational-registry-v75`). Una regola operativa contiene in sostanza:

- ID stabile;
- fase/protocol step;
- condizione;
- ordine di precedenza delle fonti;
- azione deterministica;
- dati da registrare in audit;
- esito: continuare, bloccare il caso o bloccare globalmente.

Una correzione dovrebbe essere considerata attiva soltanto se possiede:

1. ID nel registro;
2. precedenza/fonti;
3. azione deterministica;
4. audit;
5. test positivo;
6. test negativo o fail-closed;
7. riga nella matrice regole;
8. fingerprint della versione;
9. bundle installato identico a quello testato;
10. replay del caso tramite APR.

Il codice contiene una regola di chiusura dell'apprendimento, ma l'applicazione uniforme di questo gate è uno dei problemi principali descritti più avanti.

### Persistenza e continuità

Ogni coorte possiede una directory separata con:

- checkpoint per acquisizione CRM, documenti, analisi, preflight ed esecuzione;
- checkpoint del supervisor, worker e watchdog;
- audit e report giornalieri;
- bundle installati;
- dashboard statica/JSON;
- log stdout/stderr;
- LaunchAgent dedicati.

Prima di creare o salvare una bozza, APR registra l'intento. Dopo un crash:

- creazione incerta → discovery read-only della bozza esistente;
- salvataggio incerto → verifica read-only, mai secondo Salva alla cieca;
- blocker per-pratica → isolamento e passaggio al caso successivo;
- logout ENEA provato → blocco globale `login_required`.

### Come dovrebbe cambiare lo stato CRM

Il comportamento progettato è:

- caso acquisito: mantenere/aggiornare stato di lavorazione;
- bozza salvata: stato `APR ENEA · bozza salvata`;
- caso ambiguo: pipeline `Richiesto intervento operatore`, con domanda strutturata;
- risposta operatore acquisita: ritorno a `Pronte da fare` e ripresa dal checkpoint;
- futuro PDF/ricevuta: collegamento idempotente allo stesso cliente.

**Queste mutazioni non sono ancora collegate al CRM reale.** Oggi APR produce solo comandi locali simulati e reversibili.

## 5. STATO ATTUALE E PROBLEMI NOTI

### Stato al momento di questo handoff

Su richiesta dell'utente, la coorte operativa corrente è stata **sospesa in modo reversibile** prima di generare questi documenti. Le tre verifiche concordavano:

1. i label LaunchAgent di supervisor, worker e watchdog non risultavano più caricati;
2. il checkpoint supervisor era `stopped`;
3. l'API dashboard della coorte non era raggiungibile.

Quindi lo stato corretto è **PAUSED/STOPPED**, non “APR sta lavorando”. Checkpoint e bozze non sono stati cancellati.

### Cosa funziona già

#### Implementato e provato almeno localmente

- coda persistente, lock, lease, idempotenza e audit;
- checkpoint atomici e ripresa dopo crash simulato;
- supervisor e watchdog come processi separati;
- dashboard locale e API loopback;
- autenticazione CRM mediata da pagina locale e sessione protetta;
- lettura reale del CRM via GET e download degli allegati originari;
- estrazione testo PDF, OCR immagini e fingerprint dei documenti;
- routing prodotto basato sui documenti anziché sull'etichetta CRM;
- registro regole e matrice regola → test;
- preflight per schermature e infissi;
- mapping pagine condivise ENEA;
- driver CDP per Chrome e compilazione/salvataggio di bozze TEST;
- ripresa della stessa bozza e gestione del Salva incerto;
- protezioni permanenti `previewAllowed=false`, `submitAllowed=false`, `communicationsAllowed=false`;
- confronto read-only con benchmark storico, isolato dal mapper.

#### Osservato in test operativi reali

- creazione e salvataggio di più bozze sul portale;
- compilazione di schermature e infissi;
- selezione autorevole dei comuni ENEA;
- pagina del 36%;
- modale cointestatario;
- ripresa della stessa bozza dopo checkpoint;
- keepalive read-only e verifica della sessione.

Queste osservazioni **non equivalgono a disponibilità in produzione**.

### Snapshot anonimo dell'ultima coorte

I checkpoint della coorte più recente non descrivono tutti lo stesso denominatore, e questo è già un problema di osservabilità:

- preflight comune: 36 casi, 8 `ready_local_plan`, 28 `blocked_case`;
- gate Infissi: 16 casi, 6 `ready_local_plan`, 10 `blocked_case`;
- esecuzione bozza: 12 casi, 9 `saved`, 3 `operator_intervention`;
- deep review: 23 casi, 3 `technical_repair`, 20 `operator_required`.

Non si deve trasformare questo snapshot in una percentuale unica di successo: i gate hanno popolazioni diverse e la dashboard/case truth non era disponibile al taglio del documento. Il target 85–90% non è dimostrato.

### Problema principale: le correzioni non diventano sempre comportamento attivo

L'utente ha rilevato correttamente che ripetendo casi già analizzati il numero di pratiche concluse non cresceva in modo monotono e talvolta diminuiva.

Cause tecniche osservate:

1. **Troppe revisioni applicate manualmente.** Nel runner esistono circa 119 chiamate a `applyValidationRevision(...)`. Una nuova regola può essere presente nel registro ma non attivata in tutte le pipeline/coorti.
2. **Gate duplicati.** Preflight comune, gate Infissi, deep review, execution gate e driver possono classificare lo stesso caso in modi diversi.
3. **Baseline non sempre obbligatoria.** Esistono baseline, replay e learning gate, ma non tutti i percorsi di deploy rifiutano automaticamente una regressione rispetto alla baseline precedente.
4. **Confusione fra stati.** `READY` locale, ammesso all'esecuzione, pagina salvata e bozza completa sono risultati diversi; alcuni report storici li hanno aggregati impropriamente.
5. **Regola registrata ma bundle non dimostrato.** La presenza nel TypeScript o nei test non prova che supervisor/worker/watchdog installati contengano la stessa versione.
6. **Correzioni troppo vicine al caso.** Alcune riparazioni storiche hanno conservato nomi/chiavi di fixture o revisioni coorte-specifiche; il comportamento dovrebbe dipendere dal blocker e dalla fonte, mai dal cliente.
7. **Revisione profonda troppo superficiale.** Il classificatore usa spesso codici blocker, ma non sempre riesegue parser, fonti e regole per distinguere un vero dato mancante da un difetto tecnico.

### Incoerenze interne del codice

- `infissiDraftPackage.ts` contiene un mapping tecnico reale e può costruire pacchetti operativi.
- `infissiModule.ts`, invece, dichiara ancora `technicalMapping: pending_user_guided_gate`, `draftAllowed: false` e `realDraft: disabled`.
- `ruleTestMatrix.ts` contiene ancora una descrizione storica secondo cui il mapping tecnico Infissi è disabilitato.

Queste fonti non concordano e possono fuorviare dashboard, gate e assistenti. Devono essere sostituite da una singola capability manifest generata dal codice effettivamente installato.

### Fragilità del parsing e dei documenti

- PDF multipagina: numero fattura, CF, righe tecniche e totale possono trovarsi su pagine diverse;
- scansioni/foto poco leggibili e moduli scritti a mano;
- righe narrative senza tabella tecnica;
- quantità che si applica a più righe descrittive;
- certificati tecnici multipagina, una pagina per prodotto;
- copie/acconti/saldi che possono duplicare o nascondere importi;
- unità di misura assenti o OCR confuse fra mm e cm;
- prodotti misti nello stesso documento;
- conflitti tra form, fattura e certificato.

Il parser deve produrre evidenze e confidenza, non soltanto valori finali. Quando la regola non risolve il conflitto, deve fallire chiuso.

### Fragilità del driver ENEA

- dipendenza da ID/selettori osservati nel DOM 2026;
- React asincrono e hydration tardiva;
- autocomplete comune con codice ISTAT e callback React interna;
- click “Salva” che può partire ma perdere il contesto CDP;
- prova server ottenuta troppo presto, prima del completamento della richiesta;
- frame/target Chrome non più disponibile;
- più schede o profili Chrome che rendono l'attach ambiguo;
- route diverse per tipo intervento/anno;
- dati salvati che possono non comparire immediatamente alla GET.

### Errori tipici anonimizzati

Esempi di codici/messaggi da conservare nel pacchetto diagnostico, senza dati cliente:

```text
blocked_case: source_measurements_missing
blocked_case: invoice_certificate_cardinality_mismatch
blocked_case: explicit_source_conflict
blocked_case: original_invoice_missing
operator_required: shading_closures_form_answer_missing_or_ambiguous
technical_repair: parser_did_not_merge_all_document_pages
technical_repair: product_routing_used_crm_label_instead_of_sources
technical_block: autocomplete_authoritative_selection_failed
uncertain_page_save: click_observed_but_server_proof_inconclusive
login_required: server_logout_proven
INCONSISTENT: checkpoint, report.blockers and /api/case-truth disagree
```

### Test e qualità: cosa si può affermare onestamente

- Esistono suite dedicate `test:infissi` e `test:infissi:related`.
- Esistono test per 20 combinazioni della matrice del vecchio infisso e fallback 6,0.
- Esistono test per cardinalità, trasmittanza, area, materiale/vetro, chiusure oscuranti e omissione del risparmio energetico.
- Esistono test di restart, lock, watchdog, idempotenza, salvataggio incerto e dashboard.
- Un audit storico dichiarava una suite molto ampia verde e bundle installati coincidenti, ma è precedente alle modifiche più recenti e **non certifica il working tree corrente**.
- Le ultimissime aggiunte `aprRuleRuntimeRevision.ts` e `aprMonotonicLearningGate.ts`, con relativi test, erano in lavorazione e **non sono state rieseguite né certificate** prima della richiesta di stop.
- Il working tree contiene molte modifiche non committate e file non tracciati. Non esiste al momento un commit pulito che rappresenti inequivocabilmente la release corrente.
- In una sessione recente una suite monolitica è rimasta appesa per diversi minuti; suite focalizzate e typecheck erano verdi, ma non è una prova equivalente a una full suite corrente.

### Parti ancora incomplete

- scrittura reale degli stati/pipeline CRM;
- reinserimento automatico dopo risposta operatore;
- modulo VEPA/Bonus Casa completo;
- moduli pompe di calore e insufflaggio;
- invio finale ENEA e prova `Inviata + CPID`;
- allegare PDF/ricevuta al CRM;
- comunicazioni automatiche;
- un unico modello di verità che riconcili tutti i gate;
- promozione automatica e monotona delle regole apprese;
- una release riproducibile da commit/tag pulito;
- un test operativo rappresentativo che dimostri stabilmente il target 85–90%.

### Vincoli di sicurezza e privacy per qualunque revisione esterna

- non includere dossier, PDF o screenshot reali;
- non esportare `config/`, directory runtime, Portachiavi, log grezzi o checkpoint di coorte;
- usare fixture sintetiche con nomi, CF, email, telefoni e indirizzi fittizi;
- non permettere che una fixture cliente diventi una condizione applicativa;
- mantenere `preview/submit/communications=false` finché non esiste un gate separato e autorizzato;
- nessuna proposta deve richiedere di disabilitare gli automatismi CRM esistenti.

### Domande tecniche utili per la revisione di Claude

1. Come ridurre i molti gate/revisioni manuali a una singola pipeline dichiarativa?
2. Come generare parser, matrice test e capability manifest dalla stessa definizione di regola?
3. Come imporre un confronto monotono tra baseline N e N+1 prima del deploy?
4. Come separare nettamente `source missing`, `business ambiguity`, `parser defect`, `portal defect` e `session defect`?
5. Come rendere il driver ENEA più robusto senza introdurre retry mutativi rischiosi?
6. Come costruire un corpus sintetico/anonimizzato che riproduca PDF multipagina e OCR difficili?
7. Come garantire che la metrica sia “bozza completa provata dal server”, non un risultato intermedio?

---

**Fine BLOCCO 2/3.** Il blocco successivo contiene il manifest dei file e gli estratti di codice sanitizzati.
