# Revenue Operations — Decisioni del Titolare

**Stato:** approvato e vincolante  
**Versione:** 1.4  
**Data decisione:** 31 agosto 2026  
**Titolare della decisione:** il Titolare  
**Regola di governo:** `docs/CABINA_DI_REGIA.md`, versione 1.0

Questo documento registra le decisioni del Titolare assunte dopo il rapporto iniziale `report.md` e il secondo controllo `report_controllo_2.md`. In caso di divergenza, queste decisioni prevalgono sulle ipotesi e sulle raccomandazioni dei rapporti e della proposta iniziale `docs/PROGETTO_REVENUE_OPERATIONS.md`.

## D1 — Cliente consolidato

Un rivenditore diventa **cliente consolidato** quando raggiunge **5 pratiche entro 2 mesi dalla prima pratica arrivata**.

- Il conteggio parte dalla prima pratica, non dal primo contatto o preventivo.
- La regola è uguale per tutti i prodotti.
- La finestra precedente alla prima pratica è governata separatamente dai solleciti di D3.

## D2 — Pratica valida

Una pratica conta quando **nasce il record della pratica nel sistema**, cioè quando il rivenditore invia il cliente e la pratica viene creata. Non è necessario attendere l'invio all'ente, la chiusura, la fatturazione o l'incasso.

La stessa regola determina sia la prima pratica sia le pratiche successive.

## D3 — Solleciti

La regola è uguale per tutti i prodotti.

- **Livello 1 — soft:** dopo 30 giorni senza una nuova pratica, promemoria leggero.
- **Livello 2 — aggressivo/incentivo:** dopo 3 mesi totali senza una nuova pratica, proposta incentivante.

La regola vale sia prima della prima pratica sia per un cliente abituale che interrompe il ritmo.

Prima della prima pratica, entrambi i termini decorrono da **`commercial_activated_at`**: l'istante in cui il rivenditore accetta concretamente il servizio e inizia l'onboarding. Non decorrono dalla semplice creazione del lead.

I contenuti con incentivo economico restano bozze soggette ad approvazione finché il Titolare non autorizza per iscritto modelli, condizioni e limiti di spesa.

## D4 — Storico della spesa marketing

Il sistema parte dal 31 agosto 2026 con tracciamento pulito. I dati storici di Meta Ads saranno importati successivamente, se reperiti, con qualità **ricostruita** e non **certa**. L'assenza dello storico non blocca l'avvio.

## D5 — Disponibilità di cassa

La disponibilità di cassa destinabile al marketing deve provenire dal cruscotto economico esistente, senza un inserimento manuale separato nel CRM.

Il cruscotto è un'applicazione online separata, già raggiungibile dal CRM, e non un progetto presente sul computer del Titolare. Il codice attuale documenta un ponte in uscita dal CRM verso il cruscotto; il contratto tecnico per leggere la disponibilità di cassa deve essere verificato sulla connessione online o richiesto a chi gestisce l'applicazione.

L'integrazione sarà in sola lettura dal punto di vista Revenue Operations. Il sistema non potrà modificare la cassa né trasformare automaticamente la disponibilità rilevata in autorizzazione di spesa.

## D6 — Sede della reportistica

La reportistica Revenue Operations vive in questa applicazione, in una sezione accanto alla gestione di lead e pratiche. Il cruscotto economico rimane separato e fornisce il dato di cassa.

## D7 — Consenso commerciale

Il modulo pubblico raccoglie già il consenso esplicito tramite casella obbligatoria. Il record del lead deve conservarne la prova mediante i campi `consent_basis` e `consent_at`, senza cambiare l'esperienza visibile del modulo.

## D8 — Coesistenza tecnica delle pratiche

La coesistenza di `pratiche` ed `enea_practices` è affidata alla progettazione tecnica. Non costituisce una decisione ulteriore richiesta al Titolare, salvo che la bonifica renda necessaria una modifica irreversibile o una nuova regola commerciale.

## D9 — Priorità rispetto a FatturaRapida

Con APR già in avanzamento, la priorità successiva è costruire il sistema Revenue Operations per la gestione controllata di lead e marketing.

FatturaRapida non viene cancellata: resta un prodotto da validare e potrà essere portata a un pilota limitato, ma il lancio e gli investimenti di crescita verranno governati attraverso il sistema Revenue Operations. La motivazione è evitare che i lead generati dal marketing continuino a entrare senza attribuzione, responsabile, prossima azione e verifica del risultato.

## Secondo controllo — Decisioni sulla progettazione

### D10 — Budget della prima tranche

La prima tranche usa un modello ridotto con soli importi **autorizzato**, **impegnato** e **speso**. Categorie/canali ammessi, limiti per campagna o esperimento, criteri di prosecuzione e soglia di nuova decisione saranno aggiunti in una fase successiva.

Finché il modello completo non sarà approvato, l'assenza di soglie non autorizza l'AI a decidere: ogni nuova proposta o riallocazione di spesa resta una bozza da sottoporre al Titolare.

### D11 — Via tecnica per la cassa

Il team tecnico sceglie fra lettura diretta dal database condiviso e richiesta al gestore del cruscotto. Restano vincolanti la sola lettura della fonte, l'assenza di inserimento manuale nel CRM e il divieto di scrittura della cassa da parte dell'AI.

### D12 — Qualità dei dati

I livelli sono esattamente tre: **certo**, **ricostruito**, **mancante**. Il livello “stimato” non viene utilizzato.

### D13 — Gate di controllo

Le correzioni minori di dettaglio o esplicitazione possono essere recepite senza ripetere ogni volta il controllo completo. Modifiche sostanziali riguardanti decisioni del Titolare, sicurezza, autonomia AI o soglie richiedono il controllo completo di Claude Code e l'approvazione esplicita del Titolare prima di migrazioni o codice.

## Rapporto finale — Vincolo primario e autorizzazioni

### Vincolo primario — Continuità assoluta del CRM

Il CRM è vitale e deve continuare a funzionare esattamente come oggi per rivenditori, staff, form pubblico, board, pratiche e comunicazioni.

Ogni migrazione deve essere completamente annullabile, ripristinando lo stato precedente senza perdita di dati o funzionalità. Il rollback deve essere provato **prima** dell'applicazione della migrazione in produzione. Finché tale prova non esiste, la migrazione non è autorizzabile. In caso di conflitto, questo vincolo prevale su tutte le decisioni precedenti.

### D14 — Verifiche E1-res ed E2-res

Claude Code è autorizzato a collegarsi al progetto Supabase condiviso `xmkjrhwmmuzaqjqlvzxm` in sola lettura per verificare esclusivamente schema, nomi e tipi di tabelle/campi, policy e permessi. Non è autorizzato a leggere valori aziendali, economici o record applicativi.

### D15 — Identità tecnica per la cassa

Se il percorso `super_admin` non soddisfa `cruscotto_is_owner()`, è autorizzata senza ulteriore decisione una identità tecnica dedicata, limitata alla sola lettura del contratto cassa. Deve avere durata e privilegi minimi, nessun accesso ai valori tramite strumenti generici, nessun diritto di scrittura e revoca verificabile.

### D16 — Produzione

Anche dopo l'esito positivo di E1-res ed E2-res resta obbligatoria l'approvazione esplicita del Titolare prima di applicare qualsiasi migrazione in produzione. Il checkpoint deve includere le prove già eseguite del rollback di ogni migrazione.

## Registro

| Versione | Data | Modifica | Approvazione |
|---|---|---|---|
| 1.0 | 31 agosto 2026 | Registrazione delle decisioni D1-D8 | Titolare |
| 1.1 | 31 agosto 2026 | Approvato `commercial_activated_at`; precisata la natura online del cruscotto di cassa | Titolare |
| 1.2 | 31 agosto 2026 | Revenue Operations prioritario rispetto al lancio completo di FatturaRapida | Titolare |
| 1.3 | 31 agosto 2026 | Decisioni del secondo controllo: budget ridotto, via tecnica cassa, tre livelli qualità, gate di controllo | Titolare |
| 1.4 | 31 agosto 2026 | Continuità assoluta CRM; mandato schema-only; identità tecnica cassa; rollback provato prima della produzione | Titolare |
