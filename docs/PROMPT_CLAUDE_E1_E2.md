# Prompt Claude Code — Verifiche E1-res, E2-res e rollback

Incollare integralmente il testo seguente in Claude Code soltanto dopo che il
Titolare ha salvato localmente il risultato di
`scripts/revops_schema_snapshot_query.sql`, secondo
`docs/REVOPS_ACCESSO_SCHEMA_ONLY.md` v0.2.

---

Agisci come Controllore indipendente. Non modificare file, database, utenti, ruoli, configurazioni o applicazioni.

Leggi integralmente:

- `AGENTS.md`
- `docs/CABINA_DI_REGIA.md`
- `report_controllo_3.md`
- `docs/REVOPS_DECISIONI_TITOLARE.md` v1.4
- `docs/REVOPS_PROGETTAZIONE_TECNICA.md` v0.4
- `docs/REVOPS_ACCESSO_SCHEMA_ONLY.md`
- `docs/REVOPS_PIANO_MIGRAZIONI_ROLLBACK.md`
- gli script `scripts/revops_*audit*.sql` e `scripts/revops_e1_synthetic_cash_formula.sql`, `scripts/revops_e2_synthetic_reconciliation.sql`

## Vincolo prevalente

Il CRM deve continuare a funzionare esattamente come oggi. Non approvare nessuna soluzione che possa alterare o bloccare form pubblico, board, accessi, pratiche o comunicazioni prima che il rollback sia stato realmente eseguito e dimostrato.

## Sicurezza della verifica

1. Non collegarti a Supabase e non richiedere alcuna variabile di connessione.
2. Non cercare password, token, file `.env`, keychain o credenziali alternative.
3. Non usare Supabase Management API, service role o dashboard amministrativa.
4. Verifica che lo snapshot dichiari `snapshot_format = revops-schema-metadata-v1`,
   il project ref atteso e `data_rows_read = false`.
5. Se il file contiene righe applicative, valori economici, corpi di funzioni,
   credenziali o URL di connessione, interrompi il controllo e segnalalo senza
   riprodurre il contenuto sensibile.
6. Usa soltanto lo snapshot strutturale, le migrazioni locali e fixture
   sintetiche.

## E1-res

Verifica esclusivamente tramite metadati:

- esistenza e tipi delle fonti allowlist del cruscotto;
- presenza, proprietà, modalità security e hash di `cruscotto_is_owner()`, senza stampare il corpo o eventuali costanti;
- policy e grant rilevanti;
- grant e policy strutturali rilevanti, senza accesso ai dati;
- compatibilità strutturale del contratto cassa v0.4;
- allarme previsto in caso di rinomina campi o cambio formula.

Esegui `scripts/revops_e1_synthetic_cash_formula.sql`, che usa soltanto valori sintetici. Il test runtime di `cruscotto_is_owner()` sull'identità reale deve essere riportato come verifica booleana separata da svolgere con la sessione autorizzata; non richiedere né mostrare credenziali personali.

## E2-res

Verifica dal repository e dai metadati:

- compatibilità degli stati/colonne delle due tabelle pratica;
- assenza di trigger RevOps nel percorso operativo della v0.4;
- progettazione del proiettore asincrono, watermark e idempotenza;
- deduplicazione per UUID con precedenza `enea_practices`;
- esclusione della bozza e uso della prima transizione di invio;
- impossibilità che un guasto RevOps blocchi una pratica.

Esegui `scripts/revops_e2_synthetic_reconciliation.sql`. Non riconciliare dati reali. Indica chiaramente che la riconciliazione finale di produzione resta un gate pre-KPI eseguito dalla pipeline controllata con solo esito/impronte.

## Rollback

Controlla ciascuna delle otto righe di `docs/REVOPS_PIANO_MIGRAZIONI_ROLLBACK.md`. Per ogni migrazione stabilisci se:

- non altera il comportamento corrente quando RevOps è spento;
- down e ordine delle dipendenze sono deterministici;
- dati RevOps sono preservabili e ripristinabili;
- schema, policy, grant e impronte preesistenti possono tornare identici;
- esiste una prova preventiva concreta e non soltanto descritta.

Non eseguire migrazioni: valuta il piano e indica le prove mancanti da implementare nello staging.

## Chiusura e revoca

Nessuna credenziale temporanea viene creata o consegnata al Controllore, quindi
non esiste una credenziale da revocare. Verifica che il rapporto riporti
`Credenziale temporanea: NON CREATA` e che non siano presenti segreti.

Produci il rapporto nel formato Cabina di Regia:

1. Risultato
2. Stato
3. Eccezioni
4. Decisioni richieste
5. Prossime azioni

Concludi separatamente con:

- E1-res: PASS / FAIL / BLOCCATO
- E2-res strutturale e sintetica: PASS / FAIL / BLOCCATO
- Piano rollback preventivo: APPROVATO / DA CORREGGERE / NON APPROVATO
- Credenziale temporanea: NON CREATA / VIOLAZIONE

Non applicare correzioni e non scrivere codice.
