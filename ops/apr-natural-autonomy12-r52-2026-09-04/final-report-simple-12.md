# Lotto naturale APR — report finale 12 pratiche

Data: 5 settembre 2026  
Modalità: APR reale, una pratica per volta, sole bozze ENEA  
Esito della tripla verifica: **CONSISTENT**

## Risultato

- **3 READY / bozze complete**: Andrea Trabucco, Elena Depalma, Monica Molteni.
- **7 OPERATOR_REQUIRED**: Santo Giuga, Marcella Capatti, Giovanna Atzeni, Annalisa Lanzo, Nadia Ragni, Maria Sofia Tosatti, Stefania Venturi.
- **2 TECHNICAL_BLOCK**: Claudia Sellati, Luca Ronconi.
- **0 INCONSISTENT**.
- **0 timeout**: nessuna pratica ha raggiunto né i 7 minuti senza progresso materiale né il limite assoluto di 25 minuti.

Il lotto semplificato di 11 pratiche è durato 36 minuti e 16 secondi. Il processo esterno è terminato con codice 0; tutti i worker, supervisori e watchdog delle coorti sono spenti. Keepalive e Chrome APR restano attivi.

## Bozze completate

| Pratica | Bozza | Pagine | Tempo della pratica |
|---|---:|---:|---:|
| Andrea Trabucco | 464258 | 8/8 | 4m 43s |
| Elena Depalma | 464259 | 12/12 | 6m 15s |
| Monica Molteni | 464261 | 9/9 | 7m 58s |

Per tutte e tre: checkpoint `saved`, nessun blocker, case-truth `READY`, finalizzatore concorde e verifica read-only completata. **Nessun problema.**

## Richiesto intervento operatore

### Santo Giuga

Cause: controllo bonifici/fatture non conclusivo; almeno un totale fiscale non riconosciuto; tripla riconciliazione non dimostrata. Il preflight conserva inoltre collegamento non verificato del documento tecnico e misure/cardinalità mancanti come condizioni di riparazione.

`operatorQuestion`: **Confermi che il documento tecnico appartiene agli ordini della pratica e puoi indicare il totale lordo della fattura non leggibile, abbinando i bonifici alle fatture 124/FE, 184/FE e 297/FE?**

### Marcella Capatti

Causa operatore: fine lavori 12 febbraio 2026, 204 giorni prima della lavorazione. Il preflight conserva separatamente conflitto tra fonti Infissi e misure/cardinalità mancanti come condizioni di riparazione.

`operatorQuestion`: **Confermi che la pratica con fine lavori 12 febbraio 2026 è ancora procedibile sul portale ENEA 2026 nonostante siano trascorsi più di 90 giorni?**

### Giovanna Atzeni

Cause: modulo cliente originario assente, CF valido assente, fine lavori 31 dicembre 2025 incompatibile con il portale 2026 e oltre 90 giorni. È conservata anche un’ambiguità preflight sulle chiusure oscuranti.

`missingDocumentType`: modulo cliente originario compilato con codice fiscale valido.  
`operatorQuestion`: **Puoi inserire il modulo cliente originario con un codice fiscale valido e confermare se la fine lavori 31 dicembre 2025 è ancora procedibile sul portale ENEA 2025?**

### Annalisa Lanzo

Cause: il form descrive una riga, ma dalle fatture non è stato riconciliato alcun prodotto fisico; nessuna riga riporta dimensioni e gTot in modo riconoscibile.

`missingDocumentType`: elenco o scheda tecnica delle schermature con quantità, misure e gTot.  
`operatorQuestion`: **Quante schermature fisiche sono state installate e puoi inserire un documento che riporti per ciascuna misure e gTot?**

### Nadia Ragni

Cause: una riga nel form, zero prodotti fisici riconciliati; nessuna fonte primaria con le misure della schermatura.

`missingDocumentType`: scheda tecnica, ordine o conferma d’ordine con quantità e misure fisiche.  
`operatorQuestion`: **Quante schermature fisiche sono state installate e quali sono larghezza e altezza di ciascuna, come risultano da una fonte primaria?**

### Maria Sofia Tosatti

Cause: nessun prodotto fisico riconciliato e nessuna fonte primaria con le misure delle schermature.

`missingDocumentType`: scheda tecnica, ordine o conferma d’ordine con quantità e misure fisiche.  
`operatorQuestion`: **Puoi indicare il numero delle schermature installate e inserire una fonte primaria con larghezza e altezza di ciascuna?**

### Stefania Venturi

Causa: prodotto e valori economici leggibili, ma il payload manca di titolo sull’immobile, anno di costruzione, superficie utile e dati completi dell’impianto termico.

`missingDocumentType`: modulo cliente integrativo con dati dell’immobile e dell’impianto.  
`operatorQuestion`: **Puoi indicare titolo sull’immobile, anno di costruzione, superficie utile, tipo e terminali dell’impianto, tipo e numero dei generatori, combustibile e presenza della climatizzazione estiva?**

## Blocchi tecnici

### Claudia Sellati

La nuova coorte pulita si è fermata prima della creazione della bozza: lo stadio delle revisioni richieste ha trovato non pronto il gate di riconciliazione dell’applicabilità comune Infissi (`infissi_common_applicability_reconciliation_gate_not_ready`).

`operatorQuestion`: **Vuoi autorizzare una diagnosi separata del gate di applicabilità Infissi che ha fermato Sellati prima della creazione della bozza?**

### Luca Ronconi

È stata creata la bozza 464262, ma il salvataggio della pagina beneficiario non è risultato verificabile (`apr_cdp_enea_co_beneficiary_save_unverified`). APR non ha ritentato né salvato alla cieca; 0/8 pagine risultano completate.

`operatorQuestion`: **Vuoi autorizzare una diagnosi separata della verifica di salvataggio della pagina beneficiario sulla bozza 464262?**

## Sicurezza e verifica

- Anteprima: mai eseguita.
- Submit/protocollazione: mai eseguiti.
- Comunicazioni: mai eseguite.
- Ogni verdetto è stato confrontato tra processo/servizi, report e checkpoint persistenti, e snapshot terminale immutabile usato dalla dashboard per `/api/case-truth`.
- Nei tre casi in cui il riepilogo del sequencer conta più condizioni rispetto a `caseTruth`, la differenza è intenzionale: il primo conta anche condizioni di riparazione tecnica, mentre `caseTruth` elenca i soli `operatorGateBlockers`. Stato terminale e cause conservate sono concordi.

Il catalogo completo, con percorsi delle tre prove per ogni pratica, `missingDocumentType`, `operatorQuestion` e `onboardingGap`, è nel report JSON affiancato.
