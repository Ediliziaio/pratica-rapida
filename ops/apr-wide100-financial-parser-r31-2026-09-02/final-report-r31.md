# Ri-verifica finanziaria APR r31 — report finale

Generato: 2026-09-02T21:55:09.689Z

## Esito aggregato

- 17/17 casi terminali: 0 saved, 17 operator_required, 0 technical_block, 0 inconsistent.
- I sette errori finanziari confermati dalla revisione manuale sono risolti; Gabriele Girelli resta correttamente bloccato per fattura realmente assente.
- Maurizia Coreggioli: riconciliazione €5.000/€5.000 verde; il blocker finanziario superstite è stato ritirato, restano soltanto blocker non finanziari.
- Anteprima, submit, protocollazione, ricevute, email e comunicazioni: mai consentiti.

## Esito nome per nome

### GIOVANNA ATZENI

- Stato: OPERATOR_REQUIRED (coorte 3038)
- Confronto: Errore APR originario: veniva letta una sola fattura del fascicolo; r30 riconcilia ora entrambe.
- Finanza: totale fatture €7900; tripla riconciliazione verde
- Blocker residui:
  - customer_form_missing [customer_form] — Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
    - Domanda operatore: Per GIOVANNA ATZENI, può inviare il modulo cliente ENEA originale compilato e firmato, con tutti i dati anagrafici e dell'immobile? Dettaglio rilevato: Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
  - tax_code_missing_or_invalid [beneficiary.taxCode] — CF valido e coerente non disponibile nel form o nelle fatture originarie.
    - Domanda operatore: Per GIOVANNA ATZENI, può confermare il codice fiscale corretto e inviare un documento leggibile o il modulo cliente che lo attesti? Dettaglio rilevato: CF valido e coerente non disponibile nel form o nelle fatture originarie.
  - completion_date_portal_year_mismatch [dates.completion] — Fine lavori 2025-12-31: anno 2025 incompatibile con il portale ENEA 2026. Selezionare il portale annuale corretto senza modificare la data.
    - Domanda operatore: Per GIOVANNA ATZENI, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori 2025-12-31: anno 2025 incompatibile con il portale ENEA 2026. Selezionare il portale annuale corretto senza modificare la data.
  - completion_over_90_days_operator_required [dates.completion] — Fine lavori 2025-12-31: 245 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
    - Domanda operatore: Per GIOVANNA ATZENI, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori 2025-12-31: 245 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.

### ELENA MARCELLA BERTI

- Stato: OPERATOR_REQUIRED (coorte 3039)
- Confronto: Errore APR originario: veniva letta una sola fattura acconto/saldo; r30 riconcilia ora entrambe.
- Finanza: totale fatture €1320; tripla riconciliazione verde
- Blocker residui:
  - tax_code_missing_or_invalid [beneficiary.taxCode] — CF valido e coerente non disponibile nel form o nelle fatture originarie.
    - Domanda operatore: Per ELENA MARCELLA BERTI, può confermare il codice fiscale corretto e inviare un documento leggibile o il modulo cliente che lo attesti? Dettaglio rilevato: CF valido e coerente non disponibile nel form o nelle fatture originarie.
  - screenings_missing [screenings] — Nessun prodotto fisico riconciliato dalle fatture originarie.
    - Domanda operatore: Per ELENA MARCELLA BERTI, può inviare la scheda tecnica o il riepilogo ordine completo con numero dei prodotti, tipologia e misure larghezza × altezza di ogni elemento? Dettaglio rilevato: Nessun prodotto fisico riconciliato dalle fatture originarie.
  - screening_primary_measurements_missing [screenings.dimensions] — La fattura descrive la schermatura ma nessuna fonte primaria riporta le misure fisiche del prodotto. APR non usa le misure della finestra protetta come misure del prodotto: acquisire o confermare le misure e rimettere la pratica in Pronte da fare.
    - Domanda operatore: Per ELENA MARCELLA BERTI, può inviare la scheda tecnica o il riepilogo ordine completo con numero dei prodotti, tipologia e misure larghezza × altezza di ogni elemento? Dettaglio rilevato: La fattura descrive la schermatura ma nessuna fonte primaria riporta le misure fisiche del prodotto. APR non usa le misure della finestra protetta come misure del prodotto: acquisire o confermare le misure e rimettere la pratica in Pronte da fare.

### FRANCESCA PISANU

- Stato: OPERATOR_REQUIRED (coorte 3040)
- Confronto: Errori APR originari: seconda fattura omessa e OCR 180° invertito; r30 corregge entrambi.
- Finanza: totale fatture €5500; tripla riconciliazione verde
- Blocker residui:
  - customer_form_missing [customer_form] — Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
    - Domanda operatore: Per FRANCESCA PISANU, può inviare il modulo cliente ENEA originale compilato e firmato, con tutti i dati anagrafici e dell'immobile? Dettaglio rilevato: Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
  - tax_code_missing_or_invalid [beneficiary.taxCode] — CF valido e coerente non disponibile nel form o nelle fatture originarie.
    - Domanda operatore: Per FRANCESCA PISANU, può confermare il codice fiscale corretto e inviare un documento leggibile o il modulo cliente che lo attesti? Dettaglio rilevato: CF valido e coerente non disponibile nel form o nelle fatture originarie.

### CLAUDIA SELLATI

- Stato: OPERATOR_REQUIRED (coorte 3041)
- Confronto: Errori APR originari: seconda fattura omessa e valori presi da celle non etichettate; r30 riconcilia ora i documenti.
- Finanza: totale fatture €6230; tripla riconciliazione verde
- Blocker residui:
  - infissi_dimensions_and_cardinality_missing [technical_dimensions]
    - Domanda operatore: Per CLAUDIA SELLATI, può inviare la scheda tecnica o il riepilogo ordine completo con numero dei prodotti, tipologia e misure larghezza × altezza di ogni elemento?
  - infissi_dimensions_and_cardinality_missing [technical_rows]
    - Domanda operatore: Per CLAUDIA SELLATI, può inviare la scheda tecnica o il riepilogo ordine completo con numero dei prodotti, tipologia e misure larghezza × altezza di ogni elemento?

### GIOVANNI AMADU

- Stato: OPERATOR_REQUIRED (coorte 3042)
- Confronto: Errore APR originario: valori presi da celle errate; r30 usa le etichette fiscali.
- Finanza: totale fatture €7800; tripla riconciliazione verde
- Blocker residui:
  - customer_form_missing [customer_form] — Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
    - Domanda operatore: Per GIOVANNI AMADU, può inviare il modulo cliente ENEA originale compilato e firmato, con tutti i dati anagrafici e dell'immobile? Dettaglio rilevato: Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
  - tax_code_missing_or_invalid [beneficiary.taxCode] — CF valido e coerente non disponibile nel form o nelle fatture originarie.
    - Domanda operatore: Per GIOVANNI AMADU, può confermare il codice fiscale corretto e inviare un documento leggibile o il modulo cliente che lo attesti? Dettaglio rilevato: CF valido e coerente non disponibile nel form o nelle fatture originarie.
  - completion_date_portal_year_mismatch [dates.completion] — Fine lavori 2025-12-19: anno 2025 incompatibile con il portale ENEA 2026. Selezionare il portale annuale corretto senza modificare la data.
    - Domanda operatore: Per GIOVANNI AMADU, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori 2025-12-19: anno 2025 incompatibile con il portale ENEA 2026. Selezionare il portale annuale corretto senza modificare la data.
  - completion_over_90_days_operator_required [dates.completion] — Fine lavori 2025-12-19: 257 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
    - Domanda operatore: Per GIOVANNI AMADU, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori 2025-12-19: 257 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.

### massimo cappello

- Stato: OPERATOR_REQUIRED (coorte 3043)
- Confronto: Errore APR originario: layout SdI/PA-Digitale non letto; r30 legge il riepilogo IVA e totali.
- Finanza: totale fatture €16505; tripla riconciliazione verde
- Blocker residui:
  - infissi_dimensions_and_cardinality_missing [technical_dimensions]
    - Domanda operatore: Per massimo cappello, può inviare la scheda tecnica o il riepilogo ordine completo con numero dei prodotti, tipologia e misure larghezza × altezza di ogni elemento?
  - infissi_dimensions_and_cardinality_missing [technical_rows]
    - Domanda operatore: Per massimo cappello, può inviare la scheda tecnica o il riepilogo ordine completo con numero dei prodotti, tipologia e misure larghezza × altezza di ogni elemento?

### MAURIZIA COREGGIOLI

- Stato: OPERATOR_REQUIRED (coorte 3046)
- Confronto: Errore APR originario: storno non economico a zero e blocker generico superstite; r31 ritira il solo blocker finanziario risolto.
- Finanza: totale fatture €5000; tripla riconciliazione verde
- Blocker residui:
  - customer_form_missing [customer_form] — Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
    - Domanda operatore: Per MAURIZIA COREGGIOLI, può inviare il modulo cliente ENEA originale compilato e firmato, con tutti i dati anagrafici e dell'immobile? Dettaglio rilevato: Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
  - tax_code_missing_or_invalid [beneficiary.taxCode] — CF valido e coerente non disponibile nel form o nelle fatture originarie.
    - Domanda operatore: Per MAURIZIA COREGGIOLI, può confermare il codice fiscale corretto e inviare un documento leggibile o il modulo cliente che lo attesti? Dettaglio rilevato: CF valido e coerente non disponibile nel form o nelle fatture originarie.
  - completion_over_90_days_operator_required [dates.completion] — Fine lavori 2026-04-07: 148 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
    - Domanda operatore: Per MAURIZIA COREGGIOLI, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori 2026-04-07: 148 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.

### Gabriele Girelli

- Stato: OPERATOR_REQUIRED (coorte 3045)
- Confronto: Blocco dati confermato dalla verifica manuale: la fattura richiesta manca realmente.
- Finanza: totale fatture €null; tripla riconciliazione non verificata
- Blocker residui:
  - original_invoice_missing_or_unavailable [economic_sources.invoice] — La fattura originaria dichiarata non e' acquisibile come documento valido: Richiesto intervento operatore. Dopo il nuovo allegato e il ritorno in Pronte da fare APR rieseguira' la pratica.
    - Domanda operatore: Per Gabriele Girelli, può inviare la fattura originale completa indicata come mancante, comprensiva di tutte le pagine e dei totali fiscali? Dettaglio rilevato: La fattura originaria dichiarata non e' acquisibile come documento valido: Richiesto intervento operatore. Dopo il nuovo allegato e il ritorno in Pronte da fare APR rieseguira' la pratica.
  - completion_date_missing [dates.completion] — Fine lavori assente e data fattura non ricavabile.
    - Domanda operatore: Per Gabriele Girelli, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori assente e data fattura non ricavabile.
  - gross_triple_reconciliation_failed [economic_sources.total] — Tripla riconciliazione non dimostrata: fonti-assenti, nessuna-fattura-economica-valida.
    - Domanda operatore: Per Gabriele Girelli, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Tripla riconciliazione non dimostrata: fonti-assenti, nessuna-fattura-economica-valida.

### GUIDO CALVACCHI

- Stato: OPERATOR_REQUIRED (coorte 3047)
- Confronto: Caso non incluso nella verifica manuale indipendente iniziale.
- Finanza: totale fatture €6135.03; tripla riconciliazione non verificata
- Blocker residui:
  - bundled_professional_expense_unitemized [economic_sources.eligibleTechnicalExpense] — Le fatture includono «Pratica Enea Compresa che allegheremo con quella» ma non quantificano separatamente il servizio. Lordo € 6135.03: indicare la sola spesa tecnica; APR non usera il lordo alla cieca.
    - Domanda operatore: Per GUIDO CALVACCHI, può fornire il documento o il dato necessario a risolvere “bundled_professional_expense_unitemized”? Dettaglio rilevato: Le fatture includono «Pratica Enea Compresa che allegheremo con quella» ma non quantificano separatamente il servizio. Lordo € 6135.03: indicare la sola spesa tecnica; APR non usera il lordo alla cieca.
  - completion_over_90_days_operator_required [dates.completion] — Fine lavori 2026-04-14: 141 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
    - Domanda operatore: Per GUIDO CALVACCHI, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori 2026-04-14: 141 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
  - gross_triple_reconciliation_failed [economic_sources.total] — Tripla riconciliazione non dimostrata: imponibile-iva-mismatch:6a55169f8d6d760faca9dd1380d29069b9d54c4067ae81f41e95bbde3741eef7:invoice:5a16ae68a177, imponibile-iva-mismatch:6a55169f8d6d760faca9dd1380d29069b9d54c4067ae81f41e95bbde3741eef7:invoice:352f42239cf6.
    - Domanda operatore: Per GUIDO CALVACCHI, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Tripla riconciliazione non dimostrata: imponibile-iva-mismatch:6a55169f8d6d760faca9dd1380d29069b9d54c4067ae81f41e95bbde3741eef7:invoice:5a16ae68a177, imponibile-iva-mismatch:6a55169f8d6d760faca9dd1380d29069b9d54c4067ae81f41e95bbde3741eef7:invoice:352f42239cf6.

### MARCO DE MARINIS

- Stato: OPERATOR_REQUIRED (coorte 3048)
- Confronto: Caso non incluso nella verifica manuale indipendente iniziale.
- Finanza: totale fatture €null; tripla riconciliazione non verificata
- Blocker residui:
  - original_invoice_missing_or_unavailable [economic_sources] — La fattura presente detrae o richiama una fattura di acconto non acquisita (4.090); APR non puo ricostruire il totale documentale completo senza la fonte fiscale originaria.
    - Domanda operatore: Per MARCO DE MARINIS, può inviare la fattura originale completa indicata come mancante, comprensiva di tutte le pagine e dei totali fiscali? Dettaglio rilevato: La fattura presente detrae o richiama una fattura di acconto non acquisita (4.090); APR non puo ricostruire il totale documentale completo senza la fonte fiscale originaria.
  - completion_date_portal_year_mismatch [dates.completion] — Fine lavori 2025-12-17: anno 2025 incompatibile con il portale ENEA 2026. Selezionare il portale annuale corretto senza modificare la data.
    - Domanda operatore: Per MARCO DE MARINIS, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori 2025-12-17: anno 2025 incompatibile con il portale ENEA 2026. Selezionare il portale annuale corretto senza modificare la data.
  - completion_over_90_days_operator_required [dates.completion] — Fine lavori 2025-12-17: 259 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
    - Domanda operatore: Per MARCO DE MARINIS, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori 2025-12-17: 259 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
  - invoice_929a8665 [economic_sources] — Il totale di almeno un documento fiscale non è stato riconosciuto.
    - Domanda operatore: Per MARCO DE MARINIS, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Il totale di almeno un documento fiscale non è stato riconosciuto.
  - gross_triple_reconciliation_failed [economic_sources.total] — Tripla riconciliazione non dimostrata: terna-fattura-incerta:14c4e20627c9baf7ab2358d60c2a78d4b71879e9afef943df4a588636ae9f67e:invoice:264f0ccd0374.
    - Domanda operatore: Per MARCO DE MARINIS, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Tripla riconciliazione non dimostrata: terna-fattura-incerta:14c4e20627c9baf7ab2358d60c2a78d4b71879e9afef943df4a588636ae9f67e:invoice:264f0ccd0374.

### Nicla Biagioni

- Stato: OPERATOR_REQUIRED (coorte 3049)
- Confronto: Caso non incluso nella verifica manuale indipendente iniziale.
- Finanza: totale fatture €4632; tripla riconciliazione non verificata
- Blocker residui:
  - completion_date_missing [dates.completion] — Fine lavori assente e data fattura non ricavabile.
    - Domanda operatore: Per Nicla Biagioni, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori assente e data fattura non ricavabile.
  - gross_triple_reconciliation_failed [economic_sources.total] — Tripla riconciliazione non dimostrata: terna-fattura-incerta:b908c99a486b131f5870cdfc8b2c2f203b0cdc7c56d360ddc3d57c4bb322e790:invoice:264f0ccd0374, terna-fattura-incerta:88e672c7ee4dd20d035135fa04b0b0bb4953f6915b4743d18cc0f6780d619d25:invoice:264f0ccd0374, terna-fattura-incerta:063d9e0d85b9e3fdd336c34957024f4ffb8fd57258af358f483b7fce40b053ac:invoice:264f0ccd0374, nessuna-fattura-economica-valida.
    - Domanda operatore: Per Nicla Biagioni, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Tripla riconciliazione non dimostrata: terna-fattura-incerta:b908c99a486b131f5870cdfc8b2c2f203b0cdc7c56d360ddc3d57c4bb322e790:invoice:264f0ccd0374, terna-fattura-incerta:88e672c7ee4dd20d035135fa04b0b0bb4953f6915b4743d18cc0f6780d619d25:invoice:264f0ccd0374, terna-fattura-incerta:063d9e0d85b9e3fdd336c34957024f4ffb8fd57258af358f483b7fce40b053ac:invoice:264f0ccd0374, nessuna-fattura-economica-valida.

### GIUSEPPE D'ADDUZIO

- Stato: OPERATOR_REQUIRED (coorte 3050)
- Confronto: Caso non incluso nella verifica manuale indipendente iniziale.
- Finanza: totale fatture €null; tripla riconciliazione non verificata
- Blocker residui:
  - customer_form_missing [customer_form] — Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
    - Domanda operatore: Per GIUSEPPE D'ADDUZIO, può inviare il modulo cliente ENEA originale compilato e firmato, con tutti i dati anagrafici e dell'immobile? Dettaglio rilevato: Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
  - tax_code_missing_or_invalid [beneficiary.taxCode] — CF valido e coerente non disponibile nel form o nelle fatture originarie.
    - Domanda operatore: Per GIUSEPPE D'ADDUZIO, può confermare il codice fiscale corretto e inviare un documento leggibile o il modulo cliente che lo attesti? Dettaglio rilevato: CF valido e coerente non disponibile nel form o nelle fatture originarie.
  - completion_date_portal_year_mismatch [dates.completion] — Fine lavori 2025-07-04: anno 2025 incompatibile con il portale ENEA 2026. Selezionare il portale annuale corretto senza modificare la data.
    - Domanda operatore: Per GIUSEPPE D'ADDUZIO, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori 2025-07-04: anno 2025 incompatibile con il portale ENEA 2026. Selezionare il portale annuale corretto senza modificare la data.
  - completion_over_90_days_operator_required [dates.completion] — Fine lavori 2025-07-04: 425 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
    - Domanda operatore: Per GIUSEPPE D'ADDUZIO, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori 2025-07-04: 425 giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.
  - invoice_929a8665 [economic_sources] — Il totale di almeno un documento fiscale non è stato riconosciuto.
    - Domanda operatore: Per GIUSEPPE D'ADDUZIO, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Il totale di almeno un documento fiscale non è stato riconosciuto.
  - gross_triple_reconciliation_failed [economic_sources.total] — Tripla riconciliazione non dimostrata: terna-fattura-incerta:6336f93652dffed6ed53494e4c5ec27fdaa808bf95df6ed3ec059bb2157c3032:invoice:264f0ccd0374, terna-fattura-incerta:6d573b23cae48a0da29a72d90818905ef34880addb7ed57041b3ab6892b3815a:invoice:264f0ccd0374, terna-fattura-incerta:8720c27d6ff3274da6d21cb8805bf9af2c56478b39d92010bd47a3d8dcac9111:invoice:264f0ccd0374.
    - Domanda operatore: Per GIUSEPPE D'ADDUZIO, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Tripla riconciliazione non dimostrata: terna-fattura-incerta:6336f93652dffed6ed53494e4c5ec27fdaa808bf95df6ed3ec059bb2157c3032:invoice:264f0ccd0374, terna-fattura-incerta:6d573b23cae48a0da29a72d90818905ef34880addb7ed57041b3ab6892b3815a:invoice:264f0ccd0374, terna-fattura-incerta:8720c27d6ff3274da6d21cb8805bf9af2c56478b39d92010bd47a3d8dcac9111:invoice:264f0ccd0374.

### Santo Giuga

- Stato: OPERATOR_REQUIRED (coorte 3051)
- Confronto: Caso non incluso nella verifica manuale indipendente iniziale.
- Finanza: totale fatture €null; tripla riconciliazione non verificata
- Blocker residui:
  - bank_transfer_invoice_cross_check_failed [economic_sources.bankTransfers] — Controllo incrociato bonifici/fatture non conclusivo: capitale non leggibile, lordo fatture € non verificato, riferimenti mancanti , 124/FE, 184/FE, 297/FE. Richiesto intervento operatore; nessun totale viene inventato.
    - Domanda operatore: Per Santo Giuga, può inviare la ricevuta completa e leggibile del bonifico parlante, con importo, CRO/TRN, beneficiario e riferimenti delle fatture pagate? Dettaglio rilevato: Controllo incrociato bonifici/fatture non conclusivo: capitale non leggibile, lordo fatture € non verificato, riferimenti mancanti , 124/FE, 184/FE, 297/FE. Richiesto intervento operatore; nessun totale viene inventato.
  - invoice_929a8665 [economic_sources] — Il totale di almeno un documento fiscale non è stato riconosciuto.
    - Domanda operatore: Per Santo Giuga, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Il totale di almeno un documento fiscale non è stato riconosciuto.
  - gross_triple_reconciliation_failed [economic_sources.total] — Tripla riconciliazione non dimostrata: terna-fattura-incerta:aac93e924179125e7c68dc78653dd210367f0653e736092a2fcc8ca8b4d3a525:invoice:264f0ccd0374.
    - Domanda operatore: Per Santo Giuga, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Tripla riconciliazione non dimostrata: terna-fattura-incerta:aac93e924179125e7c68dc78653dd210367f0653e736092a2fcc8ca8b4d3a525:invoice:264f0ccd0374.

### Loretta Riviera

- Stato: OPERATOR_REQUIRED (coorte 3052)
- Confronto: Caso non incluso nella verifica manuale indipendente iniziale.
- Finanza: totale fatture €10960; tripla riconciliazione non verificata
- Blocker residui:
  - completion_date_missing [dates.completion] — Fine lavori assente e data fattura non ricavabile.
    - Domanda operatore: Per Loretta Riviera, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori assente e data fattura non ricavabile.
  - invoice_schedule_amount_missing [economic_sources.schedule.amount] — Scadenza non leggibile, importo mancante: verificare l'importo dello scadenziario nella fattura originaria.
    - Domanda operatore: Per Loretta Riviera, può fornire il documento o il dato necessario a risolvere “invoice_schedule_amount_missing”? Dettaglio rilevato: Scadenza non leggibile, importo mancante: verificare l'importo dello scadenziario nella fattura originaria.
  - gross_triple_reconciliation_failed [economic_sources.total] — Tripla riconciliazione non dimostrata: terna-fattura-incerta:74375fcf67f81943d9708d3bf70c3a51c734b21e299cc675e532a5d2975f9a4d:invoice:264f0ccd0374, terna-fattura-incerta:266bf562ceed38cc5dcba4e2023c0040e0f6e074970953d3115df09bffd78dc6:invoice:264f0ccd0374, terna-fattura-incerta:c90b8d75ea368b0bf14705655f9df0bb963485d4369e42947ed9da7ae0186236:invoice:264f0ccd0374, nessuna-fattura-economica-valida.
    - Domanda operatore: Per Loretta Riviera, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Tripla riconciliazione non dimostrata: terna-fattura-incerta:74375fcf67f81943d9708d3bf70c3a51c734b21e299cc675e532a5d2975f9a4d:invoice:264f0ccd0374, terna-fattura-incerta:266bf562ceed38cc5dcba4e2023c0040e0f6e074970953d3115df09bffd78dc6:invoice:264f0ccd0374, terna-fattura-incerta:c90b8d75ea368b0bf14705655f9df0bb963485d4369e42947ed9da7ae0186236:invoice:264f0ccd0374, nessuna-fattura-economica-valida.

### prova rivenditore 1 30/04

- Stato: OPERATOR_REQUIRED (coorte 3053)
- Confronto: Caso non incluso nella verifica manuale indipendente iniziale.
- Finanza: totale fatture €null; tripla riconciliazione non verificata
- Blocker residui:
  - customer_form_missing [customer_form] — Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
    - Domanda operatore: Per prova rivenditore 1 30/04, può inviare il modulo cliente ENEA originale compilato e firmato, con tutti i dati anagrafici e dell'immobile? Dettaglio rilevato: Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.
  - tax_code_missing_or_invalid [beneficiary.taxCode] — CF valido e coerente non disponibile nel form o nelle fatture originarie.
    - Domanda operatore: Per prova rivenditore 1 30/04, può confermare il codice fiscale corretto e inviare un documento leggibile o il modulo cliente che lo attesti? Dettaglio rilevato: CF valido e coerente non disponibile nel form o nelle fatture originarie.
  - completion_date_missing [dates.completion] — Fine lavori assente e data fattura non ricavabile.
    - Domanda operatore: Per prova rivenditore 1 30/04, può confermare la data effettiva di fine lavori e inviare il documento che la prova (fattura di saldo, collaudo o dichiarazione di fine lavori)? Dettaglio rilevato: Fine lavori assente e data fattura non ricavabile.
  - gross_triple_reconciliation_failed [economic_sources.total] — Tripla riconciliazione non dimostrata: fonti-assenti, nessuna-fattura-economica-valida.
    - Domanda operatore: Per prova rivenditore 1 30/04, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Tripla riconciliazione non dimostrata: fonti-assenti, nessuna-fattura-economica-valida.

### Ivana Mastrangelo

- Stato: OPERATOR_REQUIRED (coorte 3054)
- Confronto: Caso non incluso nella verifica manuale indipendente iniziale.
- Finanza: totale fatture €null; tripla riconciliazione non verificata
- Blocker residui:
  - invoice_929a8665 [economic_sources] — Il totale di almeno un documento fiscale non è stato riconosciuto.
    - Domanda operatore: Per Ivana Mastrangelo, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Il totale di almeno un documento fiscale non è stato riconosciuto.
  - gross_triple_reconciliation_failed [economic_sources.total] — Tripla riconciliazione non dimostrata: terna-fattura-incerta:20f8ac2cef0446fd292e844e36dca29a3c9c51c595a988be6f139f35218f9358:invoice:264f0ccd0374, terna-fattura-incerta:1ec68b4c6afbcb6c2efb184c2b36138bd51adb7a18c058198eda0a2925a7cd93:invoice:264f0ccd0374, terna-fattura-incerta:a306fba8bc7de79380b0b6c625c9d7e4ac836088c1266416b125c1522ee65425:invoice:264f0ccd0374.
    - Domanda operatore: Per Ivana Mastrangelo, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Tripla riconciliazione non dimostrata: terna-fattura-incerta:20f8ac2cef0446fd292e844e36dca29a3c9c51c595a988be6f139f35218f9358:invoice:264f0ccd0374, terna-fattura-incerta:1ec68b4c6afbcb6c2efb184c2b36138bd51adb7a18c058198eda0a2925a7cd93:invoice:264f0ccd0374, terna-fattura-incerta:a306fba8bc7de79380b0b6c625c9d7e4ac836088c1266416b125c1522ee65425:invoice:264f0ccd0374.

### Antonio Scaparrotta

- Stato: OPERATOR_REQUIRED (coorte 3055)
- Confronto: Caso non incluso nella verifica manuale indipendente iniziale.
- Finanza: totale fatture €8713.96; tripla riconciliazione non verificata
- Blocker residui:
  - bank_transfer_principal_exceeds_invoices [economic_sources.bankTransfers] — Il capitale bonificato supera le fatture di € 191.59: intervento operatore richiesto.
    - Domanda operatore: Per Antonio Scaparrotta, può inviare la ricevuta completa e leggibile del bonifico parlante, con importo, CRO/TRN, beneficiario e riferimenti delle fatture pagate? Dettaglio rilevato: Il capitale bonificato supera le fatture di € 191.59: intervento operatore richiesto.
  - gross_triple_reconciliation_failed [economic_sources.total] — Tripla riconciliazione non dimostrata: imponibile-iva-mismatch:41655d970c710618eb9f35ccfd9d1282d6b8dcd1fd23331e9d0f191614b0cf28:invoice:264f0ccd0374.
    - Domanda operatore: Per Antonio Scaparrotta, può inviare le fatture complete e le relative ricevute di bonifico necessarie a riconciliare esattamente imponibile, IVA e totale pagato? Dettaglio rilevato: Tripla riconciliazione non dimostrata: imponibile-iva-mismatch:41655d970c710618eb9f35ccfd9d1282d6b8dcd1fd23331e9d0f191614b0cf28:invoice:264f0ccd0374.

## Integrità

- final-report-r31.json SHA-256: ed35d7a161ecc3836b433811bea161e351f80f2a4618dc16f601e528fc1884fe
- operator-questions-r31.json SHA-256: 3a1239893e8c8ae81d0588c305d3a8a29a1c4aec3412186913464e13f4c497cb
