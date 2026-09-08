# APR — Riepilogo finale Fase 0

Sì: la Fase 0 può essere dichiarata conclusa come baseline verificata, non come certificazione operativa o di produzione.

## Riepilogo finale dei gate

### 1. Sorgente e governance — PASS

- Codice applicativo congelato: `4cccfd97eb56b80b2c09f20d1d7daa0ff94bc6ee`.
- Regola ENEA committata separatamente: `b7474556919e40dd30582a617e7ffbc039631dc3`.
- Il commit modifica esclusivamente `AGENTS.md`.

### 2. Inventario persistente — PASS

- Corpus, manifest, checkpoint e prove server censiti.
- Documenti storici archiviati conservando gli hash originali.
- Nessun artefatto storico è stato presentato come prova runtime corrente.

### 3. Bundle canonico — PASS

- Bundle canonico: coorte 76.
- Puntatore atomico verificato.
- Ricevuta append-only `PASS`.
- I tre hash coincidono con coorte 76, coorte 75 e ricostruzione dal codice congelato.
- Nessuna installazione o riattivazione eseguita.

### 4. Stato processi — PASS: `STOPPED`

Tre riscontri concordano:

- LaunchAgent della coorte 76 non caricati;
- porta 4501 senza listener;
- checkpoint supervisor `stopped`.

### 5. Replay corrente — PASS

- 125 pratiche rigiocate localmente.
- Due esecuzioni indipendenti con identica proiezione.
- 45 `READY`, 80 `BLOCKED`.
- 8 miglioramenti rispetto allo storico.
- Il blocco economico è sceso dal 39,2% al 17,6%.

### 6. Sette regressioni — PASS, tutte spiegate

- 0 regressioni accidentali recenti.
- 5 false READY storiche riclassificate correttamente.
- 2 difetti reali preesistenti del resolver zanzariere.

La correzione Amelia/Renzo è registrata, ma non implementata, come `APR-P2B-SCREENING-FAMILY-MATERIAL-001` nel backlog Fase 2B.

### 7. Test automatici — baseline verificata con debito dichiarato

- Typecheck: PASS.
- Suite mirate: verdi.
- Suite monolitica: 1.368/1.370.
- I due timeout falliti nel giro monolitico passano isolatamente 2/2.

La suite monolitica non viene falsamente dichiarata verde: la sensibilità al carico delle fixture CDP/macOS resta debito tecnico per il laboratorio e la certificazione locale.

### 8. Azioni esterne — PASS per assenza

Durante la Fase 0:

- nessun accesso CRM o ENEA;
- nessun test operativo;
- nessuna bozza, preview o invio;
- nessuna dichiarazione di disponibilità in produzione.

## Verdetto

Stato ufficiale:

`CLOSED_BASELINE_VERIFIED_WITH_REGISTERED_TECHNICAL_DEBT`

La Fase 1 — laboratorio deterministico a cinque livelli — non è stata avviata e richiede conferma esplicita dell'utente.
