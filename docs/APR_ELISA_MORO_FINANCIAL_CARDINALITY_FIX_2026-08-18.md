# APR — correzione Elisa Moro: spesa e cardinalità

Data: 18/08/2026.

## Evidenze originarie

- Fattura 104/2026: lordo €375,00; tre prodotti dichiarati (due tende verticali e una tenda da sole); dicitura «Pratica ENEA compresa» senza importo separato.
- Fattura 202/2026: lordo €875,00; gli stessi tre prodotti; dicitura «Pratica ENEA compresa» senza importo separato.
- Bonifico riferito alla fattura 104: capitale €375,00 e tipo detrazione «Ristrutturazione edilizia».
- Bonifico riferito alla fattura 202: capitale €875,00 e tipo detrazione «Risparmio energetico».
- Somma lordi fatture e capitale bonificato: €1.250,00.
- Correzione operatore, valida soltanto per Elisa Moro: spesa tecnica ENEA €1.250,00; nessun importo va escluso.
- Bozza ENEA 416583 osservata in sola lettura: costo corretto di €1.250,00 ma due righe tecniche anziché tre. La bozza preesistente non è stata modificata.

## Cause corrette

1. Il preflight necessitava di una decisione caso-specifica sulla voce compresa non quantificata; per Elisa la decisione corretta è usare l'intero lordo di €1.250,00.
2. La verifica finale poteva accettare la catena di checkpoint intermedi senza imporre una nuova lettura completa del riepilogo server.
3. Il controllo dei bonifici non verificava obbligatoriamente riferimenti fattura e tipo fiscale.

## Vincoli installati

- `user-2026-08-18-bundled-professional-expense-separation`: nessun lordo con servizio compreso non quantificato diventa automaticamente spesa tecnica; serve ripartizione documentata o risposta caso-specifica.
- `user-2026-08-18-mandatory-bank-transfer-invoice-expense-cross-check`: associazione bonifico/fattura, capitale, commissioni, lordo, spesa tecnica ed esclusioni devono essere riconciliati; le anomalie economiche o documentali bloccano soltanto il caso.
- `user-2026-08-18-bank-transfer-tax-relief-label-nonblocking`: la sola dicitura fiscale Ristrutturazione/Risparmio energetico resta auditata e non blocca se gli altri requisiti sono coerenti.
- `user-2026-08-18-form-invoice-portal-cardinality-cross-check`: form, fatture, piano APR e riepilogo ENEA devono concordare oppure la pratica passa all'operatore.
- `system-final-draft-source-cardinality-and-cost-verification`: la bozza è completa soltanto con N righe server distinte per N prodotti e costo uguale in centesimi.

## Collaudo e installazione

- Suite completa parallela: 129 file e 848 test verdi.
- Certificazione seriale della matrice: 118 file e 811 test verdi.
- Regressione browser locale: dopo la perdita simulata di una riga, APR rifiuta il completamento e registra l'evento di integrità.
- Registro: `enea-operational-registry-v50`.
- Matrice: `apr-enea-rule-test-matrix-v30`, 41/41 voci collegate al registro e certificate.
- Bundle iniziali v50 installati e costruiti identici: supervisor `957b986d...`, worker `8c5573da...`, watchdog `8c6d8808...`.
- Servizi cohort51 riavviati dal checkpoint; dashboard `http://127.0.0.1:4482/` verificata.

## Repeat-test operativo APR cohort52

- La bozza precedente `416583` è stata eliminata dall'utente e APR ne ha verificato l'assenza lato server prima di armare la coda.
- Esecutore operativo: processo persistente APR; Codex ha soltanto corretto, installato e verificato il software.
- Nuova bozza: `416890`; una sola creazione, dieci checkpoint su dieci salvati.
- Esito server finale: tre righe tecniche distinte e costo `1250`; prova `cdp-server-82-b2be5b0c6dc2a698dd1f`.
- Finestra operativa dal primo evento caso `2026-08-18T17:52:47.469Z` alla chiusura durevole `2026-08-18T17:59:02.538Z`: circa 6 minuti e 15 secondi.
- Il portale ha perso le tre righe staged prima del Salva esterno. APR ha provato `Nessun elemento` con GET, ha ripristinato una sola volta le tre righe sulla stessa bozza e non ha duplicato la pratica.
- Anteprima, submit e comunicazioni: zero tentativi.

## Correzioni tecniche emerse dal repeat-test

- La prova GET di readiness prodotta dal recupero dashboard è ora riconosciuta dal gate server read-only.
- La verifica di una riga screening recuperata riconosce anche il diagnostico post-Salva read-only; l'accettazione finale resta subordinata alla rilettura server dell'intera tabella e del costo.
- Una bozza marcata `saved` dal checkpoint riceve una certificazione finale read-only separata; se cardinalità o costo non coincidono, il servizio passa a blocco tecnico e non dichiara il test concluso.
- Typecheck ENEA runner verde; regressioni mirate 87/87 e dashboard loopback 9/9 verdi. L'esecuzione completa non privilegiata ha incontrato esclusivamente il limite sandbox `listen EPERM` sui test loopback; gli stessi nove test sono stati rieseguiti con permesso locale e sono verdi.
- Bundle finali costruiti/installati identici: supervisor `2b75155e...`, worker `787d864a...`, watchdog `8c6d8808...`.
- Dashboard cohort52: `http://127.0.0.1:4483/`.

## Limite residuo

Il caso Elisa è certificato come bozza completa e salvata, ma non è stato confrontato in questo repeat-test con la pratica manuale chiusa nel CRM. Anteprima e invio restano intenzionalmente fuori ambito.
