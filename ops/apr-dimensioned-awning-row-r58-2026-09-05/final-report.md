# APR r58 — riconoscimento righe tenda dimensionate senza gTot

Data: 2026-09-05

## Esito

La riga della fattura 260 di Annalisa Lanzo è ora riconosciuta come prodotto fisico: tenda da sole modello R51 Ponant, larghezza 2650 mm, sporgenza 2200 mm, superficie 5,83 m². La correzione è generale e non contiene riferimenti al cliente, alla pratica o alla coorte.

Lanzo non è stata dichiarata compilabile: nel documento originario manca il valore tecnico gTot. Il replay operativo si è quindi fermato correttamente con il solo blocker specifico `screening_gtot_missing_operator_required_1`. Il falso blocker generico `screenings_missing` è assente.

## Causa tecnica provata

1. Il parser riconosceva il formato `TENDA DA SOLE ... DIM. CM L ... x ... SP (=MQ ...)` soltanto quando trovava anche un gTot nello stesso match. In assenza del gTot eliminava impropriamente l'intera riga fisica, benché descrizione, misure e superficie fossero presenti e coerenti.
2. Dopo la prima correzione, il preflight aggiungeva ancora `screenings_missing` perché controllava l'array dei prodotti completi anziché il ledger delle righe fisiche riconosciute. Lo stesso prodotto risultava quindi contemporaneamente presente e assente.

## Correzioni generali

- `system-dimensioned-awning-row-preservation-v1`: conserva la riga fisica quando descrizione, larghezza, sporgenza e superficie esplicita concordano entro il 5%; lascia nullo il solo gTot e mantiene il gate chiuso su quell'attributo.
- `system-specific-incomplete-screening-blocker-v1`: se esiste una riga fisica incompleta, emette soltanto il blocker dell'attributo mancante; `screenings_missing` è ammesso esclusivamente quando non esiste alcuna riga fisica.
- Le righe di solo acconto, i riferimenti a fatture precedenti e le righe di detrazione senza firma tecnica completa non vengono promosse a prodotti.

## Verifiche

- Test positivi e negativi mirati: verdi.
- Gate completo: 437 suite e 1743 test verdi.
- Registro/matrice: 143 regole su 143 coperte; registro v142, matrice v120.
- Audit storico: 100 decisioni censite, 95 attive, 5 superate, 0 irrisolte.
- Corpus dei documenti originari: 17 documenti unici con lo stesso formato; 14 già completi di gTot sono rimasti invariati. Le tre righe prive di gTot ora preservate sono Annalisa Lanzo (2650×2200, 5,83 m²), Monica Molteni (4000×2400, 9,60 m²) e Marco Tocchetti (4000×3000, 12,00 m²).

## Replay operativo Lanzo

- Coorte: 3130, generazione pulita.
- Stato concordante: `OPERATOR_REQUIRED`, un solo blocker specifico.
- Analisi documento: fattura 260 con `itemCount=1` e riga fisica 2650×2200 / 5,83 m².
- Report/checkpoint/journal e snapshot terminale concordano; nessuno stato `INCONSISTENT` o `TECHNICAL_BLOCK`.
- Nessuna bozza ENEA è stata creata: il controllo fail-closed è intervenuto prima dell'azione esterna.
- Anteprima, invio e comunicazioni: non consentiti e non tentati.

## Installazione e continuità

- Bundle installato: `versions/f913ce00-specific-screening-blocker-r58-20260905`.
- Hash supervisor: `f913ce00f2be4dc5d3007469a3ab97199be875ad48239dad519f6c168591582c`.
- Hash worker: `8477587a92506607d8ec2d6aea3d19904c5598d91973c7035fd226ae1412ff9d`.
- Gate post-installazione: `active_tested_deployed`.
- Keepalive APR: attivo (`pid 55480`).
- Chrome APR: attivo con profilo persistente e porta CDP 9331 (`pid 3785`).

## Distinzione delle prove

I test automatici/locali dimostrano la regola generale e la non regressione sul corpus. Il replay APR operativo della coorte 3130 dimostra che la fattura reale di Lanzo viene ora letta correttamente dal percorso installato. Non è stato eseguito un salvataggio ENEA perché il gTot non è documentato e il gate ha fermato la pratica prima della bozza.
