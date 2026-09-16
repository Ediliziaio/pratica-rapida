# Revenue Operations — Accesso sicuro per E1-res ed E2-res

**Stato:** procedura preparata, nessuna credenziale creata  
**Versione:** 0.2  
**Data:** 31 agosto 2026

## 1. Obiettivo

Consentire al Controllore di verificare schema, tipi, policy e permessi senza leggere record o valori aziendali/economici e senza poter modificare il database.

Nessuna password, URL completo, token o chiave viene salvato nel repository, nei rapporti o nella chat.

## 2. Percorso autorizzato sul piano Free: esportazione mediata

Il Titolare esegue personalmente nel SQL Editor Supabase
`scripts/revops_schema_snapshot_query.sql`. Codex e Claude non accedono alla
sessione amministrativa, non ricevono password, token o stringhe di connessione
e lavorano soltanto sul risultato JSON salvato localmente.

La query e' un singolo `SELECT` limitato a `pg_catalog`. Non legge record,
conteggi o valori delle tabelle applicative e non esegue funzioni applicative.
Il risultato contiene nomi e tipi strutturali e hash delle definizioni, non i
corpi delle funzioni o eventuali costanti.

Questo percorso non richiede Supabase Pro, Branching, Docker o l'installazione
di strumenti sul computer.

## 3. Percorso futuro: clone schema-only

Un amministratore fidato esporta esclusivamente lo schema del progetto condiviso e lo ripristina in un database temporaneo privo di dati reali. Nel clone vengono aggiunte soltanto fixture sintetiche per i test E1-res/E2-res.

Claude Code riceve una credenziale read-only del clone, non del database operativo. Questo percorso permette di verificare struttura, SQL e riconciliazione senza possibilità tecnica di vedere valori reali.

La verifica runtime di `cruscotto_is_owner()` sull'utente reale resta un test a un solo bit (`true`/`false`) eseguito dall'identità autorizzata, senza mostrare dati o identificatori.

## 4. Percorso diretto: sospeso

Il precedente ruolo `revops_schema_auditor` non viene creato in produzione.
Un ruolo PostgreSQL eredita i privilegi concessi a `PUBLIC`; la revoca sul solo
ruolo non garantisce di neutralizzare l'esecuzione di tutte le funzioni
`SECURITY DEFINER`. Revocare i privilegi a `PUBLIC` sulla produzione potrebbe
alterare il CRM e viola il vincolo primario di continuita'.

Gli script di provisioning e revoca restano materiale di progettazione, ma non
sono autorizzati all'esecuzione finche' non esiste un database isolato sul quale
provare creazione, uso e revoca senza conseguenze sul CRM.

<!-- Procedura storica, non autorizzata sulla produzione:

Se è necessario collegarsi direttamente al database condiviso:

1. un amministratore prova prima su staging la creazione e la revoca del ruolo temporaneo;
2. esegue `scripts/revops_schema_auditor_provision.sql` fornendo password casuale e scadenza breve tramite variabili locali;
3. lo script deve fallire se il ruolo possiede `USAGE` sullo schema applicativo o qualsiasi privilegio sulle tabelle;
4. la stringa di connessione viene inserita soltanto in una variabile di ambiente locale `REVOPS_SCHEMA_AUDIT_URL` nella sessione di Claude Code;
5. Claude esegue esclusivamente `scripts/revops_schema_metadata_audit.sql`;
6. terminato il controllo, l'amministratore esegue `scripts/revops_schema_auditor_revoke.sql` e dimostra che il login non è più possibile.

La credenziale ha `default_transaction_read_only=on`, una sola connessione, timeout breve, nessuna appartenenza a ruoli applicativi, nessun accesso alle tabelle e nessun uso dello schema `public`. Se anche una sola verifica dei privilegi non passa, la transazione di provisioning si annulla e si torna al clone schema-only.
-->

## 5. Limiti della verifica

Sono consentiti:

- `pg_catalog` e metadati strutturali;
- nomi e tipi dei campi allowlist `cruscotto_*`, `pratiche`, `enea_practices`;
- definizione strutturale di policy, grant e proprietà delle funzioni;
- test con `VALUES` sintetici dentro una transazione read-only;
- impronte/hash delle definizioni, senza stamparne eventuali costanti sensibili.

Sono vietati:

- `SELECT` di record applicativi, anche con `LIMIT 1`;
- conteggi, somme o campionamenti su dati reali;
- accesso a `auth.users` o identificatori personali;
- esecuzione di funzioni applicative sul database condiviso;
- DDL, DML, storage, Edge Functions o Management API durante il controllo;
- copia della credenziale in file, prompt, output o cronologia shell.

E2-res viene quindi dimostrata con compatibilità dello schema reale e riconciliazione a zero su fixture sintetiche nel clone/staging. La riconciliazione dei dati di produzione, prima dei KPI, sarà eseguita dalla pipeline controllata restituendo soltanto esito e impronte, mai righe o valori.

## 6. Caso `cruscotto_is_owner()`

Il Controllore verifica dai metadati se la funzione è presente, `SECURITY DEFINER/INVOKER`, proprietario, grant ed elementi logici senza riportare costanti. Il Titolare o il servizio autorizzato esegue separatamente il test booleano con la propria sessione.

Se l'esito è falso, D15 autorizza la progettazione di un'identità tecnica dedicata. La sua creazione farà parte di M5, con:

- accesso soltanto alla vista/RPC della formula cassa;
- nessun accesso generico alle tabelle sorgente;
- `default_transaction_read_only=on`;
- rotazione e revoca;
- rollback provato prima della produzione.

## 7. Evidenze finali

Il rapporto di Claude deve contenere soltanto:

- PASS/FAIL per esistenza e tipi;
- PASS/FAIL per policy e permessi;
- PASS/FAIL per assenza di scrittura;
- PASS/FAIL della formula sintetica;
- PASS/FAIL della riconciliazione E2 sintetica;
- hash delle definizioni rilevanti;
- conferma della revoca della credenziale.

Nessun valore aziendale deve apparire nel rapporto.
