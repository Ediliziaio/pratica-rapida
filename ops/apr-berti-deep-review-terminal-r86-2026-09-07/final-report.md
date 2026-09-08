# Berti — diagnosi finalizzazione prematura e replay r86

## Verdetto

Il difetto osservato nella coorte 3425 apparteneva allo stesso schema strutturale già visto: il sequencer pubblicava un terminale prima che la fonte autorevole avesse concluso. Era però un ramo distinto non ancora protetto: il percorso rapido `preflight_blocked` chiudeva immediatamente il caso mentre `deep-case-review` risultava ancora `working`.

La correzione generale `system-sequencer-deep-review-terminal-gate-v1` è installata e verificata nel bundle `f6f8e746-deep-review-terminal-gate-r86-20260907`. Il replay pulito Berti, coorte 3426, dimostra che il sequencer ha atteso la fine reale della deep review e ha pubblicato lo stesso esito tipizzato.

## Prova della causa originaria (coorte 3425)

- Il report del sequencer era già `completed` e classificava Berti `operator_required`.
- Il preflight persistente era `completed/blocked_case` con `draft_payload_mapping_incomplete`.
- La deep review era ancora `working/reviewing`.
- Il servizio della coorte era già stato quiesciuto, quindi `/api/case-truth` non era disponibile.
- Nel codice il ramo `throwIfCommonPreflightBlocked()` lanciava immediatamente; il `catch` trasformava l'eccezione in terminale senza attendere la deep review.

Il verdetto formale della coorte 3425 resta `INCONSISTENT`.

## Correzione generale

- Il sequencer legge insieme preflight comune, preflight prodotto e deep review.
- Finché la deep review non è `completed`, il caso resta non terminale.
- La classificazione terminale deriva dalla deep review (`TECHNICAL_BLOCK`, `OPERATOR_REQUIRED` o `INCONSISTENT`).
- Se i codici blocker del preflight e quelli della deep review non coincidono, il gate chiude fail-closed come `INCONSISTENT`.
- Il report e lo snapshot terminale sono prodotti dalla stessa verità tipizzata; il vecchio bypass `case_operator_required_from_preflight` è stato eliminato.

## Gate monotono

- Suite formale: 444/444 file verdi, 1867/1867 test verdi.
- Prova socket/CDP fuori sandbox: 82/82 test verdi.
- Typecheck applicazione e runner: verde.
- Matrice: 174 regole; copertura registro verificata.
- Fingerprint sorgente: `aaeb720f727eec36ca81222f82d17ee4b8aaa41f82f0e0ea3bff46f529c00e39`.
- Hash installati e costruiti coincidenti:
  - supervisor `f384bedb9a2f93101f8baa224ab680cf377c2dc4f183d0e5f6b827db867a07d0`
  - worker `fbf41cdd351262848387183d76323769f7c2cd06de73dc370363d96cda491ce0`
  - watchdog `551118e02af5d2a9163f18d8663d7b332d173ff0ae28cffb9659dee9a33619f0`
- Stato post-installazione: `active_tested_deployed`.

## Replay operativo Berti (coorte 3426)

- Avvio: `2026-09-07T21:18:29.992Z`.
- Preflight terminale: `2026-09-07T21:19:35.863Z`.
- Deep review classificata: `2026-09-07T21:19:37.865Z`.
- Snapshot terminale pubblicato: `2026-09-07T21:19:39.147Z`.
- Sequencer concluso: `2026-09-07T21:19:40.727Z`.
- Esito concordante: `TECHNICAL_BLOCK` / `draft_payload_mapping_incomplete`.
- Bozza creata: no; nessuna scrittura ENEA è stata tentata perché il gate dati era chiuso.
- Anteprima, invio e comunicazioni: nessun tentativo.

Le tre fonti concordano:

1. `crm-local-preflight/report.blockers`: un blocker `draft_payload_mapping_incomplete`;
2. `deep-case-review`: `completed`, classificazione `TECHNICAL_REPAIR`, stesso codice;
3. snapshot terminale persistente: `TECHNICAL_BLOCK`, `CONSISTENT`, worker `quiesced`.

L'API della singola coorte non è più raggiungibile dopo la quiescenza, ma lo snapshot terminale persistente è disponibile in `terminal-observability` e porta l'identificativo `apr-terminal-apr-pilot-3426-global-controller-elena-marcella-berti-0c341817-b9e5-48cb-ae32-c7f7f3b7fba1`.

## Nuovo problema distinto emerso

La discrepanza di finalizzazione è risolta. Berti non arriva però alla bozza perché il mapping ENEA lascia 21 campi obbligatori senza fonte verificata: anagrafica di nascita/residenza, indirizzo e comune lavori, dati edificio e impianto. Le fonti economiche e prodotto sono invece state lette correttamente: due fatture da 660 euro, totale 1.320 euro riconciliato con due bonifici; una tenda 3000×2200, gTot 0,12.

- `classification`: `TECHNICAL_BLOCK`
- `exactCause`: il mapping non propaga al payload ENEA 21 campi obbligatori pur avendo completato l'analisi delle due fonti.
- `missingDocumentType`: `null` (non è ancora dimostrato che manchi un documento; la deep review lo classifica come riparazione tecnica).
- `operatorQuestion`: "Autorizzi la diagnosi separata e generale del mapping dei 21 campi ENEA mancanti su Berti, senza assumere che i documenti siano assenti?"
- `onboardingGap`: nessuno attribuibile finché non si distingue, campo per campo, tra dato realmente assente e dato presente ma non propagato.

Nessuna correzione è stata applicata a questo secondo problema.
