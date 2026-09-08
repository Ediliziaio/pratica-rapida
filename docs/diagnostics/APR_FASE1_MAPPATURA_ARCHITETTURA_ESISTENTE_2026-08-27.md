# Fase 1 — Mappatura dell’architettura esistente

La struttura attuale contiene già gran parte dei cinque livelli, ma i confini non sono ancora netti. In particolare, il `preflight` oggi svolge contemporaneamente estrazione, applicazione delle regole business e mapping ENEA. È questa sovrapposizione che va eliminata nella Fase 1.

| Livello richiesto | Componenti esistenti | Stato reale | Problema strutturale |
|---|---|---|---|
| 1. Acquisizione documenti | `crmOriginalDocuments`, acquisizione CRM read-only, dossier locali | Parzialmente presente | Inventario file solido, ma manca un artefatto canonico per-pratica che elenchi anche ogni pagina letta |
| 2. Estrazione dei fatti | `crmDocumentAnalysis`, parser fatture, parser Infissi, parte di `crmLocalPreflight` | Presente ma frammentato | I fatti estratti sono già mescolati con fallback, precedenze e decisioni business |
| 3. Decisione business | `operationalRegistry`, `crmLocalPreflight`, regole prodotto, `deepCaseReview` | Ampiamente presente | Le regole vengono applicate in più punti; non esiste un unico motore puro che consumi solo fatti congelati |
| 4. Mapping ENEA | `mapper`, `crmEneaPayloadAudit`, pacchetti bozza, payload Infissi | Presente e browser-free | Il mapper applica ancora regole e in alcuni percorsi rilegge/riparsa documenti |
| 5. Esecuzione browser | `eneaDraftExecution`, `aprEneaBrowserWorker`, driver CDP | Presente e ben separato | Deve ricevere una prova esplicita che i livelli 1–4 siano verdi, anziché fidarsi soltanto del pacchetto finale |

## Livello 1 — Acquisizione documenti

Esiste già una buona base in `scripts/enea-shadow-runner/crmOriginalDocuments.ts`:

- inventario degli allegati;
- distinzione iniziale `invoice`/`additional`;
- `documentKey`, percorso originario e `practiceId`;
- salvataggio locale;
- SHA-256 del contenuto;
- dimensione, tipo MIME, tentativi e stato;
- checkpoint atomico e ripresa senza duplicazioni.

`scripts/enea-shadow-runner/crmDocumentAnalysis.ts` aggiunge:

- numero delle pagine;
- modalità di estrazione;
- hash del testo estratto;
- classificazione semantica del documento.

Manca però un unico `AcquisitionArtifact` immutabile per pratica contenente:

- elenco completo dei file ricevuti;
- impronta di ogni file;
- elenco esplicito delle pagine;
- stato di lettura di ogni pagina;
- eventuali pagine non lette o illeggibili;
- fingerprint complessivo dell’acquisizione.

Oggi viene registrato `pageCount`, ma non una matrice persistente pagina-per-pagina.

## Livello 2 — Estrazione dei fatti

Le funzioni necessarie esistono già, principalmente in:

- `scripts/enea-shadow-runner/crmDocumentAnalysis.ts`;
- `scripts/enea-shadow-runner/crmLocalPreflight.ts`;
- `src/features/enea-shadow-crm/infissiOriginalDocumentParser.ts`;
- parser economici, segmentazione fatture e documenti tecnici.

Sono già estratti molti fatti:

- identità e codice fiscale;
- date;
- fatture, imponibile, IVA e totale;
- bonifici;
- prodotti e quantità;
- misure e superfici;
- trasmittanze;
- materiale, vetro, movimentazione;
- documenti e fonti originarie.

Il limite è che non esiste ancora un modello canonico comune a tutti i prodotti. I dati sono distribuiti tra `invoiceResult`, `screeningItems`, report del preflight e report Infissi.

Inoltre alcuni oggetti chiamati “fatti” contengono già:

- fallback;
- precedenze;
- valori risolti;
- `appliedRuleIds`;
- decisioni su blocker e prontezza ENEA.

Quindi l’attuale `crmLocalPreflight` non corrisponde solamente al livello 2: attraversa i livelli 2, 3 e 4.

Serve separare:

```text
fatto osservato
→ decisione autorizzata
→ valore ENEA
```

Oggi questi tre passaggi spesso convivono nello stesso report.

## Livello 3 — Decisione business

Il registro unico è già molto sviluppato in `src/features/enea-shadow-crm/operationalRegistry.ts`. Le regole possiedono già:

- ID;
- fase;
- condizione;
- precedenza delle fonti;
- azione deterministica;
- audit;
- esito.

La `scripts/enea-shadow-runner/deepCaseReview.ts` distingue inoltre:

- `AUTO_RESOLVED`;
- `TECHNICAL_REPAIR`;
- `OPERATOR_REQUIRED`;
- `BUSINESS_RULE_REQUIRED`.

Questa è una buona base diagnostica, ma non è ancora il motore unico delle decisioni. Attualmente le decisioni vengono applicate anche:

- nel preflight comune;
- nel parser Infissi;
- nei resolver tecnici;
- nel mapper;
- in alcuni gate prodotto.

La ristrutturazione necessaria è un motore di decisione puro:

```text
CanonicalFacts congelati
        +
registro versionato
        ↓
BusinessDecisionArtifact
```

L’artefatto dovrebbe contenere, per ogni valore deciso:

- valore finale;
- fatti utilizzati;
- fonti;
- regola applicata;
- precedenza;
- motivazione;
- eventuale blocker;
- hash dell’input e dell’output.

`deepCaseReview` resterebbe un classificatore diagnostico dei fallimenti, non un secondo punto che reinterpreta le fonti.

## Livello 4 — Mapping ENEA

La trasformazione locale senza browser esiste già in:

- `src/features/enea-lab/mapper.ts`;
- `scripts/enea-shadow-runner/crmEneaPayloadAudit.ts`;
- pacchetti persistenti in `crmLocalDraftPackages`;
- payload Infissi;
- workflow e fingerprint del mapping.

Sono già presenti:

- `mappingFingerprint`;
- `workflowFingerprint`;
- conteggio dei campi obbligatori;
- gate `ready/blocked`;
- divieto di preview e submit;
- ricostruzione del pacchetto e confronto delle impronte.

Il problema è che il mapper non è ancora una trasformazione completamente “stupida”. In `src/features/enea-lab/mapper.ts` vengono ancora:

- applicate regole prodotto;
- scelti fallback;
- inferiti valori;
- risolti conflitti;
- calcolati alcuni valori business.

Inoltre `scripts/enea-shadow-runner/crmEneaPayloadAudit.ts` rilegge ancora testo e segmenti di fattura per ricostruire parte dell’analisi.

Questo viola il nuovo principio: il livello 4 deve consumare esclusivamente l’artefatto approvato del livello 3, senza rileggere fatture né scegliere fallback.

## Livello 5 — Esecuzione browser

È il livello oggi meglio separato.

I componenti principali sono:

- `scripts/enea-shadow-runner/eneaDraftExecution.ts`;
- `scripts/enea-shadow-runner/aprEneaBrowserWorker.ts`;
- driver CDP;
- checkpoint di pagina;
- prove di persistenza server.

Il worker riceve un `AprEneaDraftPackage` tipizzato e non importa direttamente parser di fatture o regole business. Gestisce:

- creazione bozza;
- preparazione pagina;
- salvataggio;
- verifica server;
- intenti persistenti;
- crash recovery;
- un solo tentativo mutativo;
- isolamento del caso;
- prosecuzione della coda.

Le sonde, i retry read-only e la gestione della persistenza appartengono correttamente al livello 5: sono decisioni di sicurezza dell’esecuzione, non decisioni fiscali o documentali.

Manca però una precondizione esplicita e verificabile del tipo:

```text
L1 PASS + L2 PASS + L3 PASS + L4 PASS
              ↓
     ammissione al livello 5
```

Oggi la stessa garanzia è rappresentata indirettamente da `draftReady`, `portalGate`, fingerprint e pacchetto verificato. È solida, ma non espone chiaramente i quattro gate distinti.

## Preflight, deep review e verità unica

La collocazione corretta è questa:

```text
CRM/documenti
   │
   ├─ crmOriginalDocuments ───────────── Livello 1
   │
   ├─ crmDocumentAnalysis/parser ─────── Livello 2
   │
   ├─ crmLocalPreflight ──────────────── oggi Livelli 2 + 3 + 4
   │
   ├─ deepCaseReview ─────────────────── diagnostica dei fallimenti L2/L3
   │
   ├─ crmEneaPayloadAudit/package ────── Livello 4
   │
   └─ draftExecution/browserWorker ───── Livello 5
```

`caseStatusTruth` e `aprCaseStatusResolver` non sono uno dei cinque livelli: sono uno strato superiore che riconcilia gli esiti pubblici di preflight, gate prodotto, deep review ed execution.

Attualmente la dashboard mostra molte sezioni separate e lo stato aggregato della pratica, ma non una matrice unica:

| Pratica | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|

Questa matrice manca e sarà necessaria.

## Conclusione del Punto 1

Non occorre riscrivere APR da capo. I componenti fondamentali esistono già.

La ristrutturazione necessaria consiste principalmente nel:

1. introdurre artefatti canonici e immutabili tra i livelli;
2. togliere dal preflight la sovrapposizione tra fatti, decisioni e mapping;
3. impedire al mapper di rileggere fonti o applicare nuove regole business;
4. ammettere il worker soltanto con quattro gate locali distintamente verdi;
5. mostrare in dashboard il PASS/FAIL per ciascun livello e pratica.

Verifiche effettuate con tre riscontri:

- lettura del flusso e delle dipendenze nel codice;
- confronto dei tipi e dei checkpoint persistenti;
- esecuzione delle suite locali pertinenti: **8 file di test, 149 test superati**.

Questi sono esclusivamente test automatici/locali. Non è stato eseguito alcun test operativo, accesso CRM/ENEA, replay browser, installazione o modifica di produzione.

Il piano di implementazione della Fase 1 non è ancora iniziato.
