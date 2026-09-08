# APR — Chiusura finale Fase 0

Data: 27 agosto 2026  
Stato: `CLOSED_BASELINE_VERIFIED_WITH_REGISTERED_TECHNICAL_DEBT`  
Fase 1: non avviata; richiede conferma esplicita dell'utente.

## Ambito certificato

La Fase 0 certifica inventario, congelamento, riproducibilita della baseline e identificazione univoca degli artefatti. Non certifica disponibilita in produzione, esecuzione operativa CRM/ENEA o completamento della successiva certificazione locale prevista dal programma.

## Gate

### 1. Sorgente e governance — PASS

- Codice applicativo congelato: commit `4cccfd97eb56b80b2c09f20d1d7daa0ff94bc6ee`.
- Tree applicativo congelato: `52e05ecb7cb69b6bed2c68195e69192ceb87636e`.
- Regola permanente di autorizzazione ENEA approvata e committata separatamente: `b7474556919e40dd30582a617e7ffbc039631dc3`.
- Il commit di governance modifica soltanto `AGENTS.md` e non cambia il bundle applicativo congelato.

### 2. Inventario persistente — PASS

- Corpus, manifest, checkpoint e prove server censiti.
- Gli otto elementi documentali storici sono stati archiviati/indicizzati conservando gli SHA-256 originari.
- Nessun file storico e stato reinterpretato come prova runtime corrente.

### 3. Bundle canonico — PASS

- Bundle canonico designato: coorte 76, directory `apr-pilot-76-night-new-balanced-10/install`.
- Puntatore atomico: `canonical-bundle/current`.
- Ricevuta append-only: artifact `66ccc2fbecd4ca2950feaee2276f442fdafe5c2dbdf141ade0bcee3f68588016`, stato `PASS`.
- Hash riletti attraverso il puntatore:
  - supervisor: `ba6fa4897762ab727560c616b0c86c1806701462e626c51709b458611a1cda72`;
  - worker: `908791c85f446636cae9b9172eb12728f5b5d78c38f30d0d183061de73077107`;
  - watchdog: `f2c5e9f7d75abd88454b9e18dd2e778141b4423e69612c9fec4b9339174d3663`.
- I tre hash coincidono con la ricostruzione deterministica dal commit applicativo congelato e con la coorte 75; il bundle designato non e una variante diversa da quello verificato.
- Nessun bundle copiato o installato durante la designazione; nessun servizio avviato.

### 4. Stato processi della coorte canonica — PASS (`STOPPED` verificato)

- `launchctl`: supervisor, worker e watchdog della coorte 76 non caricati.
- Porta dashboard 4501: nessun listener.
- Checkpoint supervisor: `stopped`.

I tre riscontri concordano sullo stato spento. Questo non equivale a disponibilita operativa o produzione.

### 5. Replay locale corrente — PASS

- Manifest sorgente: 126 casi, SHA-256 `5dd703d3dc4712454968ca16f99d9cb524d29476934c7ea1fcace88243b745a2`.
- Replay: 125 casi; Vittorio Paolinelli escluso solo dal corpus, non tramite regola permanente.
- Vans presenti nel manifest: 0.
- Due esecuzioni indipendenti hanno prodotto la stessa proiezione SHA-256: `7f19b8d5f761635c4e8d584ac731d4a7d81d6e0d32064439d93f6cbcc40b3968`.
- Esito: 45 READY, 80 BLOCKED; 8 miglioramenti e 7 READY storiche riclassificate BLOCKED.
- `gross_triple_reconciliation_failed`: 49/125 (39,2%) storico -> 22/125 (17,6%) corrente.

### 6. Sette regressioni apparenti — PASS, tutte spiegate

- Regressioni accidentali introdotte dalle ultime correzioni: 0.
- False READY storiche riclassificate correttamente: 5.
- Difetti reali preesistenti del resolver zanzariere resi visibili dalla guardia fail-closed: 2 (Amelia Lerose e Renzo Paolo De Grandi).
- La correzione non e stata eseguita fuori piano; e registrata in Fase 2B come `APR-P2B-SCREENING-FAMILY-MATERIAL-001`.

### 7. Test automatici locali — PASS per la baseline, debito di stabilita registrato

- Typecheck runner ENEA: PASS.
- Suite mirate di gate, corpus, verita caso e matrice: verdi.
- Suite composta fuori sandbox: verde sui gruppi pertinenti.
- Suite monolitica: 1.368/1.370 test PASS; due timeout nella fixture CDP/macOS.
- Ripetizione isolata degli stessi due test: 2/2 PASS (29,725 s e 91,767 s).

Non emerge un difetto funzionale deterministico, ma il giro monolitico unico non viene dichiarato verde. La sensibilita al carico delle fixture CDP/macOS resta debito tecnico esplicito da affrontare nel laboratorio/certificazione locale; non e nascosta come successo pieno.

### 8. Azioni esterne — PASS per assenza

- Nessun accesso CRM o ENEA durante la Fase 0.
- Nessun test operativo, creazione bozza, preview, submit, invio, ricevuta, email o comunicazione.
- Nessuna disponibilita in produzione dichiarata.

## Debiti trasferiti, non bloccanti per l'avvio controllato della Fase 1

1. `APR-P2B-SCREENING-FAMILY-MATERIAL-001`: passare la famiglia fattura+form riconciliata al resolver del materiale prima del fallback zanzariere; non implementare prima della Fase 2B.
2. Stabilizzare i due test CDP/macOS sensibili al carico prima della certificazione locale monolitica.
3. Le prove server storiche restano inventario; la Fase 1 e le fasi di certificazione dovranno mantenere separati test locali, test operativi e produzione.

## Verdetto

La Fase 0 e conclusa come baseline verificabile e riproducibile. La chiusura non dichiara APR pronto per test operativi o produzione. La Fase 1, laboratorio deterministico a cinque livelli, puo iniziare soltanto dopo conferma esplicita dell'utente.
