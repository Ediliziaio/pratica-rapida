# Verifica E1-res / E2-res — Progetto Revenue Operations

Verifica in corso, autorizzata dal Titolare (vedi `docs/REVOPS_DECISIONI_TITOLARE.md`, Round 3), tramite accesso diretto in sola lettura al progetto Supabase condiviso (`xmkjrhwmmuzaqjqlvzxm`). Solo schema/metadati, mai valori aziendali/economici reali, secondo la procedura approvata `docs/REVOPS_ACCESSO_SCHEMA_ONLY.md`.

## Metodo

Lo snapshot è stato ottenuto tramite una query eseguita manualmente dal Titolare nell'SQL editor di Supabase (formato `revops-schema-metadata-v1`, `data_rows_read: false`) e incollato in chat. Riporta solo struttura e hash delle espressioni (nessun valore reale, nessun testo di funzione/policy — solo `*_hash`).

**Correzione (31/08/2026, dopo revisione del Controllore):** le due query di follow-up proposte in precedenza (`pg_get_functiondef()` su `cruscotto_is_owner`, lettura di `pg_policies.qual`/`with_check`) sono **ritirate e non eseguite**. Restituirebbero testo integrale che può contenere email, UUID o altre costanti, in contraddizione con la procedura approvata (`REVOPS_ACCESSO_SCHEMA_ONLY.md`, riga 83). Il comportamento di `cruscotto_is_owner()` per `super_admin` è stato invece verificato con un **test a un solo bit** (vero/falso), eseguito dal Titolare in una sessione applicativa reale con ruolo `super_admin`, senza mai esporre corpo della funzione, policy, identità o dati.

## Esito (31/08/2026)

### E1-res — campi cassa, `cruscotto_is_owner()`, permessi di scrittura

Stato: **VERIFICATA per l'accesso in lettura di `super_admin`**.

**Confermato dallo snapshot (schema):**
- Le 9 tabelle `cruscotto_*` esistono nel progetto condiviso: `cruscotto_archivio`, `cruscotto_crediti`, `cruscotto_impostazioni`, `cruscotto_pratiche`, `cruscotto_pratiche_da_crm`, `cruscotto_ricorrenze`, `cruscotto_ricorrenze_escluse`, `cruscotto_rivenditori`, `cruscotto_spese` (tutte `force_rls: true`), più la view `cruscotto_v_crm_pratiche_chiuse` (senza RLS, come da natura di view).
- Ogni tabella base ha una sola policy, dichiarata per tutti i comandi (`command: "*"`), e tutte e nove condividono lo stesso `using_hash`/`check_hash` (`2bec6983d092975361d16c1df3ac8a52`).
- `anon_select: false` su tutte le tabelle `cruscotto_*`.
- Esiste `cruscotto_is_owner()` — funzione SQL, `security_definer: true`, eseguibile da `authenticated` ma non da `anon`.

**Limiti di questa evidenza da schema (correzioni rispetto al rapporto precedente, ancora valide):**
- L'hash uguale tra le nove policy dimostra solo che **usano tutte la stessa espressione**, non dimostra **quale sia** quell'espressione né che sia effettivamente `cruscotto_is_owner()` — è una deduzione plausibile, non una prova da schema.
- Lo snapshot (`anon_select`, `service_role_select`, `authenticated_select`) ha verificato **solo il permesso `SELECT`**. Non dice nulla, da solo, su `INSERT`, `UPDATE`, `DELETE`.
- Una policy `command: "*"` (`FOR ALL`) copre potenzialmente anche le scritture: da schema soltanto, non era prova dell'assenza di permessi di scrittura.

**Test runtime a un solo bit (31/08/2026):** il Titolare ha eseguito il test manualmente — accesso normale a Pratica Rapida con l'account `super_admin`, apertura del Cruscotto dal menu.

`TEST SUPER_ADMIN: TRUE — cruscotto aperto`

Esito: `super_admin` è riconosciuto come owner e accede normalmente al cruscotto tramite l'interfaccia applicativa reale, senza bisogno di verificare testo di funzioni o policy.

**E1-res: chiusa per lo scopo previsto** (accesso in lettura di `super_admin` al dato di cassa, per alimentare `cash_snapshots`/la vista Revenue Operations in sola lettura, come da decisione D5/D11 del Titolare). L'assenza di scritture indesiderate da parte del futuro percorso RevOps resta un requisito vincolante della progettazione: nessun codice RevOps dovrà scrivere su `cruscotto_*`. La sua effettiva applicazione sarà dimostrata nell'ambiente locale isolato prima di qualsiasi migrazione in produzione; non è dedotta dal testo delle policy, che resta escluso dal metodo approvato.

### E2-res — riconciliazione `revops_practice_events` vs `pratiche`/`enea_practices`

Stato: **NON APPLICABILE**.

`revops_practice_events` non esiste in questo snapshot — coerente con lo stato pre-migrazione. Resta non applicabile fino alla creazione e al collaudo delle migrazioni in un **ambiente locale isolato**, mai direttamente in produzione.

**Nota tecnica da correggere rispetto alla versione precedente:** i trigger `sync_enea_to_pratiche_trigger` e `sync_pratiche_to_enea_trigger` tra `pratiche` ed `enea_practices` **non vanno descritti come sincronizzazione completa** delle due tabelle. Sincronizzano determinati aggiornamenti solo quando gli UUID tra le due tabelle già coincidono — è un dettaglio più limitato di quanto lasciato intendere in precedenza, da tenere presente nel disegno della vista di riconciliazione.

## Stato complessivo

E1-res: **verificata** per l'accesso in lettura di `super_admin` al cruscotto — chiusa.
E2-res: **non applicabile** — da verificare solo dopo migrazioni collaudate in ambiente locale isolato, mai in produzione.

Nessuna modifica a codice o database effettuata in questa fase.
