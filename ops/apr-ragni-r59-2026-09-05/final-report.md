# Replay operativo pulito — Nadia Ragni — r59

## Esito

- Stato pubblico finale: `OPERATOR_REQUIRED`.
- Verità caso: `blocked_case`.
- Bozza ENEA creata: no.
- Pagine salvate: `0`.
- Technical block: no.
- Bundle eseguito: `versions/9956e6e6-generic-awning-gtot-r59-20260905`.
- Coorte pulita: `3132` (`apr-pilot-3132-global-controller-nadia-ragni`).
- Manifest SHA-256: `d1863e4f2b20d3ff7b8c3649f2b73c872b4fb944ea768dbf9bd0e1da99d0c73a`.

APR si è fermato nel preflight, prima di creare o modificare una bozza ENEA. Le due fatture sono state lette e riconciliate economicamente (`€ 5.000 + € 4.550 = € 9.550`, tre controlli verdi), ma non è stato riconosciuto alcun prodotto fisico di schermatura e non risultano misure primarie utilizzabili.

## Cause radice persistenti

1. `product_cardinality_form_invoice_mismatch`: il form descrive una riga di schermatura; dalle fatture APR riconcilia zero prodotti fisici.
2. `screenings_missing`: nessun prodotto fisico è stato riconciliato dalle fatture originali.
3. `screening_primary_measurements_missing`: nessuna fonte primaria riconosciuta riporta le misure fisiche del prodotto.

La dashboard espone anche cinque blocchi derivati del payload ENEA (`screening-list-empty`, `document-blocker-0` e i tre campi ENEA mancanti numero/superficie/risparmio). Sono conseguenze dei tre blocker radice, non cause ulteriori.

## Informazioni strutturate per l'operatore

- `classification`: `operator_required_data_documents`
- `exactCause`: il form indica una schermatura, ma APR non ha riconosciuto nelle due fatture né un prodotto fisico associabile in modo univoco né le sue misure primarie.
- `missingDocumentType`: `documento tecnico o riga fattura leggibile con prodotto, quantità e misure della schermatura`
- `operatorQuestion`: **Confermi quante schermature sono state installate e puoi indicare nei documenti originali, oppure inserire, il documento che riporta per ciascuna prodotto e misure fisiche?**
- `onboardingGap`: rendere obbligatoria l'acquisizione strutturata di quantità, tipologia e misure di ogni schermatura, con collegamento alla riga di fattura o alla scheda tecnica.

## Tripla verifica

1. **Processi e continuità:** supervisore coorte `3132` attivo con PID `6155`; worker di compilazione non avviato perché il gate non era verde; keepalive attivo con PID `55480`; Chrome APR attivo con PID `3785` e sessione CDP raggiungibile sulla porta `9331`.
2. **Persistenza:** checkpoint e report del sequencer concordano su `operator_required`, `saved=0`, `technicalBlock=0`; il checkpoint di esecuzione è `blocked_preflight`; `crm-local-preflight/checkpoint.json` registra i tre blocker radice.
3. **Dashboard/verità caso:** `/api/case-truth?customerKey=nadia-ragni` restituisce `BLOCKED`, `sourceState=blocked_case`, `reportOutcome=blocked_case`; lo snapshot terminale persistito dichiara `OPERATOR_REQUIRED`, `CONSISTENT`, tre blocker radice e worker `quiesced`.

## Sicurezza

- `previewAttempted=false`
- `submitAttempted=false`
- `communicationsAttempted=false`
- Nessuna bozza creata e nessun salvataggio ENEA eseguito.

