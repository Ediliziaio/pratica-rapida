# Report finale — lotto naturale APR r55 esteso

- Esecuzione: 2026-09-05T02:42:34.679Z → 2026-09-05T03:55:38.441Z (73.06 minuti)
- Totale: 28; SAVED 2; OPERATOR_REQUIRED 15; TECHNICAL_BLOCK 8; INCONSISTENT 3.
- Bundle: `versions/92da8433-official-municipality-r55-20260905`
- Manifest SHA-256: `f638ac6487b3942fd1cea4f1c4b6edeabb08de90aeb83a97c0fa5c46c6455c26`
- Sicurezza: sole bozze; nessuna anteprima, invio, protocollazione, ricevuta o comunicazione.

## Esclusioni verificate

- **ANTONIO SACCO** — permanent_vendor_exclusion; fornitore: rm legno.
- **samuele beretta** — permanent_customer_exclusion; fornitore: Overthemol S.r.l..
- **luca ortensi** — permanent_vendor_exclusion; fornitore: vans tappezzeria.
- **Valter Migliori** — permanent_vendor_exclusion; fornitore: vans tappezzeria.
- **Elisa Moro** — permanent_vendor_exclusion; fornitore: vans tappezzeria.
- **Samuele Beretta** — permanent_customer_exclusion; fornitore: prova samu.

## Esito nome per nome

### 1. Santo Giuga — OPERATOR_REQUIRED

- Causa: Controllo incrociato bonifici/fatture non conclusivo: capitale non leggibile, lordo fatture € non verificato, riferimenti mancanti , 124/FE, 184/FE, 297/FE. Richiesto intervento operatore; nessun totale viene inventato. | Il totale di almeno un documento fiscale non è stato riconosciuto. | Tripla riconciliazione non dimostrata: terna-fattura-incerta:aac93e924179125e7c68dc78653dd210367f0653e736092a2fcc8ca8b4d3a525:invoice:264f0ccd0374.
- Blocker: bank_transfer_invoice_cross_check_failed, invoice_929a8665, gross_triple_reconciliation_failed.
- missingDocumentType: fatture e bonifici riconciliabili
- operatorQuestion: Inserisci o identifica le fatture e i bonifici corretti, indicando quale pagamento corrisponde a ciascuna fattura e il totale lordo da riconciliare.
- onboardingGap: Richiedere fatture e bonifici con riferimenti incrociati obbligatori e totali leggibili.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 2. CLAUDIA SELLATI — INCONSISTENT

- Causa: Richiesto intervento operatore sulla pagina screening:6: Tre prove read-only completate senza esito conclusivo.
- Bozza: 464267; pagine 5/13.
- operatorQuestion: Autorizzi una diagnosi separata read-only della bozza 464267 per stabilire se la pagina indicata è stata realmente salvata?
- Tripla verifica: INCONSISTENT (report, checkpoint, snapshot terminale/case-truth).

### 3. Marcella Capatti — OPERATOR_REQUIRED

- Causa: Fine lavori 2026-02-12: 205 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
- Blocker: completion_over_90_days_operator_required.
- operatorQuestion: Confermi che la pratica è ancora procedibile e indichi l’anno portale ENEA corretto per la data di fine lavori riportata nei documenti?
- onboardingGap: Validare data di fine lavori, anno portale e finestra di procedibilità già durante l’onboarding.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 4. GIOVANNA ATZENI — OPERATOR_REQUIRED

- Causa: Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi. | CF valido e coerente non disponibile nel form o nelle fatture originarie. | Fine lavori 2025-12-31: anno 2025 incompatibile con il portale ENEA 2026. Selezionare il portale annuale corretto senza modificare la data. | Fine lavori 2025-12-31: 248 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
- Blocker: customer_form_missing, tax_code_missing_or_invalid, completion_date_portal_year_mismatch, completion_over_90_days_operator_required.
- missingDocumentType: modulo cliente originario firmato
- operatorQuestion: Confermi che la pratica è ancora procedibile e indichi l’anno portale ENEA corretto per la data di fine lavori riportata nei documenti?
- onboardingGap: Validare data di fine lavori, anno portale e finestra di procedibilità già durante l’onboarding.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 5. ANNALISA LANZO — OPERATOR_REQUIRED

- Causa: Controllo incrociato ripetuto: il form descrive 1 righe e le fatture 0 prodotti fisici non riconciliabili in modo univoco per famiglia. Richiesto intervento operatore: confermare la cardinalita fisica e l'assegnazione degli attributi form. | Nessun prodotto fisico riconciliato dalle fatture originarie. | Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture.
- Blocker: product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9.
- missingDocumentType: documento tecnico con numero prodotti, misure e prestazione gTot
- operatorQuestion: Conferma il numero esatto dei prodotti installati e inserisci il documento tecnico che riporta, per ciascuno, larghezza, altezza e gTot.
- onboardingGap: Richiedere un documento tecnico standard con una riga per prodotto e campi obbligatori quantità, larghezza, altezza e gTot.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 6. Nadia Ragni — OPERATOR_REQUIRED

- Causa: Controllo incrociato ripetuto: il form descrive 1 righe e le fatture 0 prodotti fisici non riconciliabili in modo univoco per famiglia. Richiesto intervento operatore: confermare la cardinalita fisica e l'assegnazione degli attributi form. | Nessun prodotto fisico riconciliato dalle fatture originarie. | La fattura descrive la schermatura ma nessuna fonte primaria riporta le misure fisiche del prodotto. APR non usa le misure della finestra protetta come misure del prodotto: acquisire o confermare le misure e rimettere la pratica in Pronte da fare.
- Blocker: product_cardinality_form_invoice_mismatch, screenings_missing, screening_primary_measurements_missing.
- missingDocumentType: documento tecnico con numero prodotti, misure e prestazione gTot
- operatorQuestion: Conferma il numero esatto dei prodotti installati e inserisci il documento tecnico che riporta, per ciascuno, larghezza, altezza e gTot.
- onboardingGap: Richiedere un documento tecnico standard con una riga per prodotto e campi obbligatori quantità, larghezza, altezza e gTot.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 7. MARIA SOFIA TOSATTI — OPERATOR_REQUIRED

- Causa: Nessun prodotto fisico riconciliato dalle fatture originarie. | La fattura descrive la schermatura ma nessuna fonte primaria riporta le misure fisiche del prodotto. APR non usa le misure della finestra protetta come misure del prodotto: acquisire o confermare le misure e rimettere la pratica in Pronte da fare.
- Blocker: screenings_missing, screening_primary_measurements_missing.
- missingDocumentType: documento tecnico con numero prodotti, misure e prestazione gTot
- operatorQuestion: Conferma il numero esatto dei prodotti installati e inserisci il documento tecnico che riporta, per ciascuno, larghezza, altezza e gTot.
- onboardingGap: Richiedere un documento tecnico standard con una riga per prodotto e campi obbligatori quantità, larghezza, altezza e gTot.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 8. Stefania Venturi — OPERATOR_REQUIRED

- Causa: Il preflight delle fonti non presenta conflitti, ma il payload ENEA non e completo: Titolo sull'immobile: Intervento umano richiesto.; Anno di costruzione: Intervento umano richiesto.; Superficie utile: Intervento umano richiesto.; Tipo impianto: Intervento umano richiesto.; Terminali: Intervento umano richiesto.; Tipo generatore: Intervento umano richiesto.; Numero generatori: Intervento umano richiesto.; Vettore energetico: Intervento umano richiesto.; Climatizzazione estiva: Intervento umano richiesto.. Correggere il mapping locale prima di accodare la pratica; nessuna azione esterna consentita.
- Blocker: draft_payload_mapping_incomplete.
- missingDocumentType: dati tecnici e catastali completi dell’immobile e dell’impianto
- operatorQuestion: Inserisci i dati mancanti richiesti da ENEA: Il preflight delle fonti non presenta conflitti, ma il payload ENEA non e completo: Titolo sull'immobile: Intervento umano richiesto.; Anno di costruzione: Intervento umano richiesto.; Superficie utile: Intervento umano richiesto.; Tipo impianto: Intervento umano richiesto.; Terminali: Intervento umano richiesto.; Tipo generatore: Intervento umano richiesto.; Numero generatori: Intervento umano richiesto.; Vettore energetico: Intervento umano richiesto.; Climatizzazione estiva: Intervento umano richiesto.. Correggere il mapping locale prima di accodare la pratica; nessuna azione esterna consentita.
- onboardingGap: Il form iniziale deve rendere obbligatori tutti i campi tecnici e catastali richiesti dal payload ENEA.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 9. Andrea Trabucco — INCONSISTENT

- Causa: Richiesto intervento operatore sulla pagina page:Serramenti e infissi: Tre prove read-only completate senza esito conclusivo.
- Bozza: 464268; pagine 5/8.
- operatorQuestion: Autorizzi una diagnosi separata read-only della bozza 464268 per stabilire se la pagina indicata è stata realmente salvata?
- Tripla verifica: INCONSISTENT (report, checkpoint, snapshot terminale/case-truth).

### 10. ELENA DEPALMA — INCONSISTENT

- Causa: Richiesto intervento operatore sulla pagina screening:3: Tre prove read-only completate senza esito conclusivo.
- Bozza: 464269; pagine 5/12.
- operatorQuestion: Autorizzi una diagnosi separata read-only della bozza 464269 per stabilire se la pagina indicata è stata realmente salvata?
- Tripla verifica: INCONSISTENT (report, checkpoint, snapshot terminale/case-truth).

### 11. Monica Molteni — SAVED

- Causa: Bozza 464270 completata: 9/9 pagine salvate.
- Bozza: 464270; pagine 9/9.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 12. Luca Ronconi — TECHNICAL_BLOCK

- Causa: Il salvataggio del co-beneficiario ENEA non è stato verificato dalle sonde read-only; APR si è fermato senza procedere alla cieca.
- Bozza: 464271; pagine 0/8.
- operatorQuestion: Autorizzi la diagnosi generale del difetto tecnico “Il salvataggio del co-beneficiario ENEA non è stato verificato dalle sonde read-only; APR si è fermato senza procedere alla cieca.” prima di un nuovo replay pulito?
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 13. Saimir Ajdini — OPERATOR_REQUIRED

- Causa: Fine lavori assente e data fattura non ricavabile. | Tripla riconciliazione non dimostrata: terna-fattura-incerta:cb4d5953b88b94365c029648088ecaf502f7a7dd8e74d572ec2ccaaa7126c3d6:invoice:264f0ccd0374, nessuna-fattura-economica-valida.
- Blocker: completion_date_missing, gross_triple_reconciliation_failed.
- missingDocumentType: documento datato di fine lavori
- operatorQuestion: Qual è la data esatta di fine lavori? Inserisci il documento che la attesta.
- onboardingGap: Richiedere all’origine un documento datato e un campo strutturato per la fine lavori.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 14. Chiara Chierichetti — TECHNICAL_BLOCK

- Causa: Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.
- operatorQuestion: Autorizzi la diagnosi generale del difetto tecnico “Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.” prima di un nuovo replay pulito?
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 15. MASSIMO COTTA — TECHNICAL_BLOCK

- Causa: Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.
- operatorQuestion: Autorizzi la diagnosi generale del difetto tecnico “Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.” prima di un nuovo replay pulito?
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 16. Mario Ruggeri — OPERATOR_REQUIRED

- Causa: mario-ruggeri:preflight_blocked:Mario Ruggeri: 2 blocker Infissi coerenti registrati; la coda prosegue.
- Blocker: infissi_dimensions_and_cardinality_missing, infissi_dimensions_and_cardinality_missing.
- missingDocumentType: documento tecnico con numero prodotti, misure e prestazione gTot
- operatorQuestion: Conferma il numero esatto dei prodotti installati e inserisci il documento tecnico che riporta, per ciascuno, larghezza, altezza e gTot.
- onboardingGap: Richiedere un documento tecnico standard con una riga per prodotto e campi obbligatori quantità, larghezza, altezza e gTot.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 17. Francesca Scalia — TECHNICAL_BLOCK

- Causa: Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.
- operatorQuestion: Autorizzi la diagnosi generale del difetto tecnico “Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.” prima di un nuovo replay pulito?
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 18. Floriana Genova — SAVED

- Causa: Bozza 464272 completata: 9/9 pagine salvate.
- Bozza: 464272; pagine 9/9.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 19. Davide Papetti — OPERATOR_REQUIRED

- Causa: Controllo incrociato ripetuto: il form descrive 1 righe e le fatture 0 prodotti fisici non riconciliabili in modo univoco per famiglia. Richiesto intervento operatore: confermare la cardinalita fisica e l'assegnazione degli attributi form. | Nessun prodotto fisico riconciliato dalle fatture originarie. | Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture. | Il totale di almeno un documento fiscale non è stato riconosciuto. | Tripla riconciliazione non dimostrata: terna-fattura-incerta:52ee3c71fa9868da5aa0982395e2c7ee1a3cf23c4fa78bfe02d370bd28284b67:invoice:264f0ccd0374, terna-fattura-incerta:bee9a03700782157061da4166f1bd30a524b12b35dcfec9e00552eaf589fa54d:invoice:264f0ccd0374.
- Blocker: product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9, invoice_929a8665, gross_triple_reconciliation_failed.
- missingDocumentType: documento tecnico con numero prodotti, misure e prestazione gTot
- operatorQuestion: Conferma il numero esatto dei prodotti installati e inserisci il documento tecnico che riporta, per ciascuno, larghezza, altezza e gTot.
- onboardingGap: Richiedere un documento tecnico standard con una riga per prodotto e campi obbligatori quantità, larghezza, altezza e gTot.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 20. gregorio fusco — TECHNICAL_BLOCK

- Causa: Il seed fresh-generation rileva una bozza precedente e chiude fail-closed prima di creare una nuova generazione.
- operatorQuestion: Autorizzi la diagnosi generale del difetto tecnico “Il seed fresh-generation rileva una bozza precedente e chiude fail-closed prima di creare una nuova generazione.” prima di un nuovo replay pulito?
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 21. Rosaria Bucceri — OPERATOR_REQUIRED

- Causa: Controllo incrociato ripetuto: il form descrive 1 righe e le fatture 0 prodotti fisici non riconciliabili in modo univoco per famiglia. Richiesto intervento operatore: confermare la cardinalita fisica e l'assegnazione degli attributi form. | Nessun prodotto fisico riconciliato dalle fatture originarie. | Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture.
- Blocker: product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9.
- missingDocumentType: documento tecnico con numero prodotti, misure e prestazione gTot
- operatorQuestion: Conferma il numero esatto dei prodotti installati e inserisci il documento tecnico che riporta, per ciascuno, larghezza, altezza e gTot.
- onboardingGap: Richiedere un documento tecnico standard con una riga per prodotto e campi obbligatori quantità, larghezza, altezza e gTot.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 22. Daniele Buoncompagni — TECHNICAL_BLOCK

- Causa: Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.
- operatorQuestion: Autorizzi la diagnosi generale del difetto tecnico “Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.” prima di un nuovo replay pulito?
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 23. Flaviano Vitulli — OPERATOR_REQUIRED

- Causa: Controllo incrociato ripetuto: il form descrive 1 righe e le fatture 0 prodotti fisici non riconciliabili in modo univoco per famiglia. Richiesto intervento operatore: confermare la cardinalita fisica e l'assegnazione degli attributi form. | Nessun prodotto fisico riconciliato dalle fatture originarie. | Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture.
- Blocker: product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9.
- missingDocumentType: documento tecnico con numero prodotti, misure e prestazione gTot
- operatorQuestion: Conferma il numero esatto dei prodotti installati e inserisci il documento tecnico che riporta, per ciascuno, larghezza, altezza e gTot.
- onboardingGap: Richiedere un documento tecnico standard con una riga per prodotto e campi obbligatori quantità, larghezza, altezza e gTot.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 24. Franca Grassilli — OPERATOR_REQUIRED

- Causa: Controllo incrociato ripetuto: il form descrive 4 righe e le fatture 0 prodotti fisici non riconciliabili in modo univoco per famiglia. Richiesto intervento operatore: confermare la cardinalita fisica e l'assegnazione degli attributi form. | Nessun prodotto fisico riconciliato dalle fatture originarie. | Fine lavori assente e data fattura non ricavabile. | Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture. | Tripla riconciliazione non dimostrata: terna-fattura-incerta:8962b48744c8a58ff71ce9ab9b91b101c4e55c533420735d997d4c5cbd247a8e:invoice:264f0ccd0374, nessuna-fattura-economica-valida.
- Blocker: product_cardinality_form_invoice_mismatch, screenings_missing, completion_date_missing, invoice_332a5af9, gross_triple_reconciliation_failed.
- missingDocumentType: documento datato di fine lavori
- operatorQuestion: Qual è la data esatta di fine lavori? Inserisci il documento che la attesta.
- onboardingGap: Richiedere all’origine un documento datato e un campo strutturato per la fine lavori.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 25. Giovanni Pietro Sanvito — TECHNICAL_BLOCK

- Causa: Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.
- operatorQuestion: Autorizzi la diagnosi generale del difetto tecnico “Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.” prima di un nuovo replay pulito?
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 26. Fausta De Filippo — OPERATOR_REQUIRED

- Causa: Controllo incrociato ripetuto: il form descrive 3 righe e le fatture 2 prodotti fisici non riconciliabili in modo univoco per famiglia. Richiesto intervento operatore: confermare la cardinalita fisica e l'assegnazione degli attributi form.
- Blocker: product_cardinality_form_invoice_mismatch.
- missingDocumentType: documento tecnico con numero prodotti, misure e prestazione gTot
- operatorQuestion: Conferma il numero esatto dei prodotti installati e inserisci il documento tecnico che riporta, per ciascuno, larghezza, altezza e gTot.
- onboardingGap: Richiedere un documento tecnico standard con una riga per prodotto e campi obbligatori quantità, larghezza, altezza e gTot.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 27. Tanbir Awal — TECHNICAL_BLOCK

- Causa: Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.
- operatorQuestion: Autorizzi la diagnosi generale del difetto tecnico “Il seed della coorte rifiuta la pratica perché la configurazione dello stage non è associata correttamente al practiceId.” prima di un nuovo replay pulito?
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

### 28. Carlotta Ceniti — OPERATOR_REQUIRED

- Causa: Controllo incrociato ripetuto: il form descrive 1 righe e le fatture 0 prodotti fisici non riconciliabili in modo univoco per famiglia. Richiesto intervento operatore: confermare la cardinalita fisica e l'assegnazione degli attributi form. | Nessun prodotto fisico riconciliato dalle fatture originarie. | Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture. | Il totale di almeno un documento fiscale non è stato riconosciuto. | Tripla riconciliazione non dimostrata: terna-fattura-incerta:3ff22092e3f4e12e67c668e4dae6087a6e4bc44560f24e7a6f4ad9b36b0d0661:invoice:264f0ccd0374, terna-fattura-incerta:db92b4982fce960b93b94448797f5b51a08fa2c57f9ac56128230fd723d64e8f:invoice:264f0ccd0374, nessuna-fattura-economica-valida.
- Blocker: product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9, invoice_929a8665, gross_triple_reconciliation_failed.
- missingDocumentType: documento tecnico con numero prodotti, misure e prestazione gTot
- operatorQuestion: Conferma il numero esatto dei prodotti installati e inserisci il documento tecnico che riporta, per ciascuno, larghezza, altezza e gTot.
- onboardingGap: Richiedere un documento tecnico standard con una riga per prodotto e campi obbligatori quantità, larghezza, altezza e gTot.
- Tripla verifica: CONCORDANTE (report, checkpoint, snapshot terminale/case-truth).

## Lettura del risultato

- Le due pratiche SAVED dimostrano compilazione operativa reale fino alla bozza, non disponibilità generale in produzione.
- I 15 OPERATOR_REQUIRED sono blocchi per-pratica pubblicati con case-truth `blocked_case`; la coda ha proseguito.
- Gli 8 TECHNICAL_BLOCK e i 3 INCONSISTENT restano da diagnosticare in una fase separata: durante questo lotto non è stata applicata alcuna correzione.
- Le esclusioni fornitore sono avvenute prima dell’elaborazione automatica.
