# Revenue Operations — Progettazione tecnica controllata

**Stato:** progetto tecnico v0.4, nessuna migrazione applicata  
**Versione:** 0.4  
**Data:** 31 agosto 2026  
**Responsabile:** Responsabile Revenue Operations AI  
**Autonomia:** Livello 1 — modalità ombra  
**Decisioni applicate:** `docs/REVOPS_DECISIONI_TITOLARE.md`  
**Regola di governo:** `docs/CABINA_DI_REGIA.md`, versione 1.0

## 1. Risultato

Realizzare nella stessa applicazione una catena verificabile:

`spesa -> campagna -> lead -> rivenditore -> pratica -> consolidamento -> ricavi/incassi`

La prima versione deve osservare, calcolare, preparare strategie e segnalare eccezioni. Non invia comunicazioni, non pubblica campagne e non impegna budget senza un'approvazione registrata.

### Vincolo di continuità

Il comportamento attuale del CRM è una baseline invariabile. La prima tranche non sostituisce né intercetta i percorsi esistenti di form pubblico, board, creazione/aggiornamento pratiche o comunicazioni. Ogni funzione RevOps è additiva, disattivata per impostazione predefinita e separabile tramite configurazione. Nessuna migrazione può arrivare in produzione prima che il relativo rollback sia stato eseguito con successo su un ambiente rappresentativo e abbia ripristinato schema, dati preesistenti e test della baseline.

Il modello resta trasversale ai prodotti: origine, campagna, interesse e collegamento azienda possono rappresentare PraticaRapida, APR o FatturaRapida senza creare pipeline incompatibili.

La logica di classificazione, strategia e scoring del modello AI vive esclusivamente nel livello applicativo ed è sostituibile senza migrazioni. Nessun prompt, chiamata a modello o decisione probabilistica viene collocato in funzioni, viste o trigger PostgreSQL. Nel database restano soltanto regole deterministiche approvate, dati, audit e bozze.

## 2. Stato verificato del sistema

### Lead e consenso

Il componente `src/components/landing/LeadRequestModal.tsx` rende obbligatoria la casella privacy, ma l'inserimento attuale in `leads` non registra né la base né l'istante del consenso. La policy pubblica controlla `source='public_form'`, ma non controlla ancora la prova del consenso.

### Pratiche

`enea_practices` è la base del flusso ENEA/Conto Termico moderno, ma `pratiche` non è soltanto uno storico: esistono ancora pagine che vi creano nuove pratiche e bozze. La migrazione del 24 aprile 2026 ha copiato le righe allora esistenti preservando gli UUID. I trigger successivi sincronizzano lo stato soltanto quando lo stesso UUID esiste in entrambe le tabelle; non sincronizzano le nuove creazioni.

Di conseguenza, contare soltanto `enea_practices` perderebbe pratiche; sommare le due tabelle senza deduplicazione produrrebbe doppi conteggi.

### Cassa

`src/pages/EneaDashboard.tsx` è una dashboard operativa delle pratiche, non una fonte della disponibilità di cassa. Il menu collega il cruscotto di cassa e produzione come applicazione separata. In questo repository esiste il ponte CRM verso quel cruscotto (`cruscotto_pratiche_da_crm`), ma non esiste ancora il percorso inverso per leggere la cassa.

Il cruscotto è un'applicazione online configurata in `src/components/AppSidebar.tsx`, non un repository locale disponibile sul computer del Titolare. Il ponte applicativo esistente è unidirezionale: il CRM scrive eventi pratica che il cruscotto legge.

La verifica pubblica e in sola lettura del bundle distribuito dal cruscotto il 31 agosto 2026 ha accertato che entrambe le applicazioni usano lo stesso progetto Supabase `xmkjrhwmmuzaqjqlvzxm`. Il cruscotto legge `cruscotto_impostazioni`, `cruscotto_spese`, `cruscotto_crediti`, `cruscotto_ricorrenze` e altre tabelle dedicate; l'accesso è verificato tramite `cruscotto_is_owner()`. Non sono stati interrogati record aziendali.

## 3. Modello dati proposto

Tutte le modifiche della prima tranche sono additive e reversibili.

### Estensioni di `leads`

- `owner_id uuid null`: responsabile unico;
- `campaign_id uuid null`: campagna attribuita;
- `company_id uuid null`: rivenditore nato o riconosciuto dal lead;
- `product_interest text null`: linea di servizio dichiarata o verificata, senza enum rigido nella prima tranche;
- `commercial_activated_at timestamptz null`: accettazione concreta del servizio e avvio onboarding;
- `commercial_activated_by uuid null`: persona che registra l'evento;
- `lifecycle lead_lifecycle null`: stato minimo e verificabile del ciclo;
- `segment text null`;
- `need text null`;
- `qualification jsonb null`: valutazione motivata;
- `strategy jsonb null`: approccio, canale, obiettivo e dati mancanti;
- `consent_basis text null`;
- `consent_at timestamptz null`;
- `consent_text_version text null`: versione della dichiarazione accettata;
- `next_action_at timestamptz null`;
- `next_action_owner uuid null`;
- `outcome_code text null`;
- `outcome_reason text null`;
- `first_contact_at timestamptz null`;
- `data_quality text null`: `certain`, `reconstructed` o `missing`;
- `converted_at timestamptz null`.

`lead_lifecycle` contiene gli stati minimi `acquisito`, `qualificato`, `strategia_pronta`, `opportunita`, `azienda_collegata`, `prima_pratica`, `in_attivazione`, `consolidato`, `da_sollecitare` e `perso_non_idoneo`. Le viste espongono le fasi più descrittive senza creare ulteriori stati fisici. Le altre enumerazioni commerciali modificabili restano in tabelle/configurazioni controllate e non vengono duplicate nel codice della pagina.

La corrispondenza lessicale è vincolante: `certain` = certo, `reconstructed` = ricostruito, `missing` = mancante. Non esiste un quarto livello “stimato”.

La colonna `lifecycle` è una proiezione consultabile, non la fonte primaria: viene aggiornata soltanto dal proiettore deterministico dopo un evento staff o pratica. Le modifiche manuali dirette sono negate; in caso di divergenza prevalgono eventi e viste e viene aperta un'eccezione.

### Nuove entità

- `campaigns`: canale, fornitore, periodo, stato e responsabile;
- `campaign_costs`: importo, data, campagna, fonte, evidenza e qualità del dato; registra soltanto costi già sostenuti oppure già autorizzati, mai prenotazioni o ordini di spesa;
- `marketing_budget_periods`: nella prima tranche contiene periodo, importo autorizzato, impegnato e speso, oltre a chi/quando ha autorizzato;
- `revops_activities`: attività sul lead/rivenditore, esito e prossima azione;
- `revops_draft`: strategie e testi preparati dall'AI, con stato `bozza`, `approvata` o `scartata`; non contiene uno stato di invio;
- `revops_ai_vs_human`: decisione proposta, decisione umana, divergenza ed esito del confronto in modalità ombra;
- `revops_decision_log`: regola applicata, dati usati, decisione, controllo e possibilità di annullamento;
- `cash_snapshots`: copia locale in sola lettura del valore proveniente dal cruscotto, con istante, fonte, identificativo esterno e stato di sincronizzazione.

`cash_snapshots` non è una seconda contabilità e non consente inserimento manuale ordinario. Conserva snapshot immutabili per dimostrare quale dato era disponibile quando è stata preparata una proposta di budget.

Il modello completo di budget con categorie/canali, limiti per campagna o esperimento, criteri di prosecuzione e `soglia_nuova_decisione` è rinviato a una tranche successiva. Finché non viene approvato, ogni proposta o riallocazione resta in `revops_draft` e richiede la decisione del Titolare: l'assenza di soglie non amplia l'autonomia.

### Eventi deterministici

- `revops_practice_events`: registro append-only degli eventi pratica validi, con `practice_id`, `source_table`, `reseller_id`, `valid_at`, `data_quality` e prova sorgente;
- `revops_lifecycle_events`: registro append-only delle transizioni derivate, con lead, stato precedente/nuovo, evento sorgente e istante.

Questi registri separano gli eventi reali dalle proiezioni del CRM e consentono di ricostruire ogni passaggio senza affidarsi a una colonna modificabile manualmente. Nella prima tranche sono alimentati da un proiettore RevOps separato e idempotente, non da trigger sulle tabelle operative.

### Comunicazioni lead isolate

La prima tranche non modifica `communication_log`, il suo `practice_id NOT NULL`, le policy o la vista pubblica esistente. Le interazioni precedenti alla pratica vivono nella nuova tabella staff-only `revops_lead_communication_log`, collegata al lead e append-only. La vista interna RevOps può unire in lettura i due registri, senza alterare il comportamento delle comunicazioni correnti. Questa scelta sostituisce l'estensione precedentemente proposta e rende il rollback indipendente dai dati operativi esistenti.

### Viste calcolate

- `revops_practices_canonical`: un'unica lista deduplicata delle pratiche valide;
- `revops_reseller_activation`: prima pratica, conteggio nella finestra e stato di consolidamento;
- `revops_reseller_followup`: ultima pratica e scadenze dei due livelli di sollecito;
- `revops_lead_chain`: attribuzione completa da campagna a risultato economico;
- `revops_exceptions`: dati mancanti, collegamenti ambigui, cassa obsoleta e anomalie.

Le condizioni derivate vivono inizialmente nelle viste, non vengono copiate in colonne modificabili manualmente.

### Derivazione dagli eventi reali

Il percorso pubblico `INSERT` di `leads` resta isolato:

- nessun nuovo trigger viene eseguito sull'inserimento anonimo;
- nessuna nuova foreign key viene aggiunta alla tabella `leads` nella prima tranche, così l'inserimento anonimo non acquista nuove dipendenze;
- il nuovo lead entra con `lifecycle null`; la vista effettiva lo espone come `acquisito` in base all'esistenza del record e a `source`;
- `AziendePipeline.tsx` e la configurazione `platform_settings` non vengono modificate in questa fase.

Le transizioni successive derivano così:

1. una persona staff qualifica il lead e salva dati e responsabile;
2. nella nuova scheda `/revops/leads/:id`, l'azione controllata **“Avvia onboarding”**, visibile ai ruoli esistenti `super_admin` e `operatore` e protetta da conferma, registra una sola volta `commercial_activated_at`, `commercial_activated_by` e l'evento audit; una correzione successiva è riservata al `super_admin` e genera una nuova voce nel registro decisioni;
3. l'azione **“Collega rivenditore”** seleziona un'azienda esistente o appena creata e registra `company_id` e `converted_at`; non si usa un abbinamento automatico ambiguo;
4. un proiettore asincrono RevOps, avviato fuori dalla transazione delle pratiche e disattivabile, legge con watermark `created_at`/`updated_at` e alimenta `revops_practice_events` in modo idempotente; un suo errore non raggiunge mai il flusso operativo;
5. le viste deterministiche calcolano `prima_pratica`, `in_attivazione`, `consolidato` e `da_sollecitare`; lo stesso proiettore registra le transizioni in `revops_lifecycle_events`, mentre la vista resta la fonte di verità anche se la proiezione non è disponibile.

Nessun evento pratica modifica automaticamente campagne, budget, cassa o comunicazioni.

## 4. Regole di calcolo

### Pratica canonica e D2

La vista canonica usa l'UUID come prima chiave di deduplicazione e dà precedenza a `enea_practices` quando lo stesso UUID è presente in entrambe le tabelle. Mantiene sempre `source_table` e `source_record_id` per audit.

Per i nuovi percorsi, il momento valido è `created_at` del record nato dall'invio del cliente. `revops_practice_events` risolve la differenza tecnica tra i due percorsi:

- `enea_practices`: l'evento viene registrato alla creazione, con `valid_at = created_at`;
- `pratiche` creata già non in bozza: evento alla creazione, con `valid_at = created_at`;
- `pratiche` creata come bozza: nessun evento; quando passa per la prima volta da `bozza` a uno stato di invio, viene registrato l'istante della transizione, perché quello è il momento in cui il record legacy assume il significato commerciale approvato da D2;
- bozza duplicata e mai inviata: non conta;
- righe storiche legacy non in bozza: backfill con `valid_at = created_at` e qualità `reconstructed`;
- stesso UUID nelle due fonti: un solo evento canonico, con precedenza a `enea_practices`.

Il backfill e il proiettore leggono ma non modificano le pratiche sorgente. Gli eventi sono append-only e i casi ambigui entrano in `revops_exceptions` invece di essere stimati. Questa soluzione chiude E2 per i KPI senza eliminare la tabella legacy, cambiare D2 o inserire logica nel percorso vitale delle pratiche.

### Consolidamento D1

Per ogni rivenditore:

1. `first_practice_at` è il minimo istante valido della vista canonica;
2. la finestra termina due mesi dopo `first_practice_at`;
3. il rivenditore è consolidato se nella finestra risultano almeno 5 pratiche canoniche;
4. `consolidated_at` è l'istante della quinta pratica, non la fine della finestra;
5. il conteggio è unico per rivenditore e comprende tutti i prodotti.

Il sistema conserva separatamente il numero di pratiche fuori finestra: queste hanno valore economico, ma non riscrivono retroattivamente l'esito dell'obiettivo di attivazione.

### Solleciti D3

Dopo almeno una pratica, l'ancora è `last_practice_at`:

- soft: `last_practice_at + 30 giorni`;
- incentivo: `last_practice_at + 3 mesi`.

La vista produce soltanto una segnalazione e una bozza. Un nuovo record pratica annulla la segnalazione precedente e ricalcola entrambe le scadenze.

Prima della prima pratica, l'ancora approvata è `commercial_activated_at`, registrata quando il rivenditore accetta concretamente il servizio e inizia l'onboarding:

- soft: `commercial_activated_at + 30 giorni`;
- incentivo: `commercial_activated_at + 3 mesi`.

La semplice data di creazione del lead non attiva il cronometro. L'evento è una scrittura umana tracciata nella prima versione; un'eventuale derivazione automatica richiederà una fonte certa e un'autorizzazione specifica.

### Storico D4

I costi registrati dal 31 agosto 2026 possono essere `certain` se provengono dalla fonte originale. Ogni importazione storica successiva usa `reconstructed`, conserva file/fonte e data di importazione e non modifica i dati certi già registrati.

### Cassa D5

Il contratto E1 usa una lettura diretta e protetta dallo stesso database Supabase, senza dipendere dal ponte `cruscotto_pratiche_da_crm` e senza modificare le tabelle del cruscotto.

Fonte e formula verificate nel bundle pubblico del cruscotto:

- `cruscotto_impostazioni`, chiave `saldi`: `Qonto`, `BCC`, `Mercury_PR`, `Altro`, `IVAacc`;
- `cruscotto_impostazioni`, chiave `settings`: almeno `buffer`;
- `cruscotto_impostazioni`, chiave `mese_aperto`: periodo operativo;
- `cruscotto_spese`: `importo` e `competenza`;
- liquidità lorda = `Qonto + BCC + Mercury_PR + Altro`;
- spese del periodo = somma degli importi senza competenza o con competenza uguale al mese aperto;
- disponibilità mostrata = liquidità lorda − spese del periodo − IVA accantonata − buffer;
- impegni futuri = somma degli importi con competenza successiva al mese aperto, esposta separatamente.

La lettura avviene lato server mediante una funzione/vista `security_invoker` oppure una RPC read-only che verifica sia il ruolo esistente `super_admin` sia `cruscotto_is_owner()`. L'AI e gli altri ruoli non leggono direttamente le tabelle `cruscotto_*`.

Ogni analisi di budget richiede una lettura live e registra automaticamente uno snapshot append-only con:

- liquidità lorda;
- spese del periodo, IVA accantonata e buffer;
- cassa disponibile calcolata;
- impegni futuri;
- mese aperto;
- `captured_at`, versione della formula e riferimenti agli aggiornamenti sorgente disponibili;
- esito della lettura e completezza dei campi.

Lo snapshot è scritto dal componente deterministico di integrazione, non dall'AI e non manualmente. Nessuna soglia temporale di obsolescenza viene inventata: se la lettura live fallisce, se `saldi`, `buffer` o `mese_aperto` mancano, oppure se il calcolo non è completo, la proposta di spesa resta bloccata e viene aperta un'eccezione. Il dato di cassa non equivale mai al budget autorizzato.

La versione del contratto conserva nomi dei campi e impronta della formula verificata. Una chiave rinominata, un tipo differente o una formula del cruscotto non più corrispondente produce `cash_contract_mismatch`, disabilita la lettura RevOps e richiede una nuova verifica; non viene applicato alcun adattamento silenzioso. La corrispondenza viene riverificata a ogni rilascio che dichiari modifiche al cruscotto e prima di ogni riattivazione dopo un mismatch.

### Consenso D7

Il modulo mantiene la casella attuale e, all'invio, registra:

- `consent_basis = 'explicit_contact_request'`;
- `consent_at` uguale all'istante di invio;
- `consent_text_version` uguale alla versione controllata del testo mostrato.

La policy RLS `INSERT` anonima mantiene il percorso esistente ma riceve un predicato `WITH CHECK` più stretto per richiedere i tre valori coerenti. È una modifica coordinata del predicato, non un trigger né una foreign key. I lead storici non vengono falsamente marcati come consenzienti: restano `consent_basis null` e sono un'eccezione da verificare.

## 5. Sicurezza e RLS

- `anon` può soltanto inserire un lead pubblico entro i vincoli esistenti e con prova del consenso; non può leggere né aggiornare lead.
- Solo i ruoli staff già autorizzati possono leggere e gestire dati RevOps.
- Nella prima tranche `cash_snapshots`, `marketing_budget_periods` e `campaign_costs` sono leggibili e scrivibili, nei limiti specifici di ciascuna tabella, soltanto dal ruolo esistente `super_admin`; rivenditori, operatori e AI non hanno accesso diretto. Un'eventuale apertura ad altri ruoli richiederà una decisione registrata.
- `revops_decision_log` e gli snapshot sono append-only: `UPDATE` e `DELETE` sono negati dalle policy e bloccati anche a livello database; eventuali correzioni avvengono con una nuova riga collegata alla precedente.
- L'identità applicativa dell'AI può scrivere soltanto bozze e confronti in modalità ombra; non può scrivere `campaigns`, `campaign_costs`, `marketing_budget_periods` o `cash_snapshots`.
- Le viste applicano le stesse restrizioni delle tabelle sorgente e non espongono dati personali ai rivenditori non pertinenti.
- Nessuna chiave del cruscotto economico viene inviata al browser: la sincronizzazione avviene lato server.
- Non viene creata alcuna regola in `automation_rules` per eventi lead o RevOps. Il processo esistente `process-automations` non riceve eventi RevOps e non può trasformare segnalazioni o bozze in invii.
- Non esistono integrazioni di pagamento, acquisto media o scrittura verso Meta/ad-network nel perimetro RevOps.

## 6. Migrazioni previste

La realizzazione sarà suddivisa in migrazioni piccole e verificabili:

1. enum `lead_lifecycle` ed estensioni nullable di `leads`, senza irrigidire ancora la RLS;
2. `campaigns`, `campaign_costs`, `marketing_budget_periods` e `cash_snapshots`;
3. `revops_activities`, `revops_lead_communication_log`, `revops_draft`, `revops_ai_vs_human` e `revops_decision_log`;
4. `revops_practice_events`, `revops_lifecycle_events` e stato del proiettore asincrono, senza trigger sulle sorgenti;
5. contratto di integrazione in sola lettura della cassa e snapshot;
6. funzione `revops_pratiche_valide(company_id)`, vista canonica e viste di attivazione/sollecito;
7. `revops_lead_chain` e vista delle eccezioni;
8. irrigidimento coordinato della policy anonima di consenso, dopo il frontend compatibile.

La pagina `/revops` è un rilascio applicativo separato, dietro configurazione disattivata per impostazione predefinita. Ogni migrazione ha una inversa dedicata e la prova preventiva descritta in `docs/REVOPS_PIANO_MIGRAZIONI_ROLLBACK.md`. La rimozione futura di `pratiche` resta un progetto separato.

### Rilascio coordinato del consenso

Colonne, frontend e RLS costituiscono un unico pacchetto di rilascio controllato:

1. applicare le sole colonne nullable, mantenendo temporaneamente compatibile la policy esistente;
2. distribuire `LeadRequestModal.tsx` che invia `consent_basis`, `consent_at` e `consent_text_version`;
3. eseguire immediatamente lo smoke test pubblico su staging e poi sull'ambiente rilasciato;
4. irrigidire la policy RLS soltanto dopo che il frontend attivo ha dimostrato di inviare i tre campi;
5. ripetere il test anonimo positivo e quello negativo senza consenso.

Se uno dei controlli fallisce, non si irrigidisce la RLS e si ripristina il frontend precedente. Il form pubblico non viene lasciato in uno stato in cui tutti gli inserimenti falliscono.

## 7. Piano di test

### Dati e conteggi

- stesso UUID in entrambe le tabelle: una sola pratica;
- UUID presente in una sola tabella: una pratica, con fonte corretta;
- quinta pratica prima del limite: consolidato alla data della quinta;
- quattro pratiche nella finestra: non consolidato;
- pratiche di prodotti diversi: conteggio comune;
- pratica creata, non inviata all'ente e non incassata: conta;
- bozza/duplicato legacy: non produce un falso avanzamento e genera eccezione se ambiguo;
- pratica legacy creata in bozza e poi inviata: un solo evento valido alla prima transizione di invio;
- errore o arresto del proiettore: pratica invariata, watermark non avanzato e ripartenza idempotente;
- storico Meta importato: `reconstructed`, mai `certain` per effetto dell'importazione.

### Solleciti

- lead senza `commercial_activated_at` e senza pratiche: nessun cronometro inventato;
- rivenditore attivato senza prima pratica per 29 giorni: nessun soft;
- rivenditore attivato senza prima pratica al compimento dei 30 giorni: soft;
- rivenditore attivato senza prima pratica al compimento dei 3 mesi: incentivo in bozza;
- azione “Avvia onboarding”: solo staff, conferma esplicita, autore e istante registrati;
- nessuna nuova pratica per 29 giorni: nessun soft;
- al compimento dei 30 giorni: soft;
- prima dei 3 mesi: nessun incentivo;
- al compimento dei 3 mesi: incentivo in bozza;
- nuova pratica: azzera e ricalcola le scadenze;
- nessun invio esterno automatico in Livello 1.

### Consenso e RLS

- invio pubblico senza consenso registrato: rifiutato;
- invio pubblico valido: consentito senza cambiare il modulo visibile;
- anonimo: impossibile leggere o aggiornare lead;
- lead storico: nessun consenso inventato;
- ruoli non economici: nessun accesso a cassa e budget se non autorizzati.
- rivenditore: accesso negato a tutte le tabelle RevOps interne;
- `revops_decision_log`: tentativi di aggiornamento e cancellazione rifiutati;
- comunicazione pratica esistente: comportamento invariato in `communication_log`;
- comunicazione lead: scritta soltanto in `revops_lead_communication_log`, invisibile ai rivenditori;

### Cassa e resilienza

- fonte disponibile: snapshot immutabile e datato;
- formula cassa riconciliata con liquidità, spese del mese, IVA e buffer del cruscotto;
- impegni futuri esposti separatamente e non sottratti due volte;
- utente `super_admin` autorizzato e ruoli diversi negati dalla sorgente e dagli snapshot;
- fonte non disponibile: eccezione, nessuna autorizzazione di spesa implicita;
- lettura live fallita o campi sorgente incompleti: eccezione e nessuna proposta esecutiva;
- errore del cruscotto: il CRM e la creazione delle pratiche continuano a funzionare.

### Riconciliazione

- totali della vista canonica riconciliati separatamente con entrambe le sorgenti;
- differenze classificate come duplicati, solo legacy, solo moderne o ambigue;
- catena lead-rivenditore non attribuita automaticamente in presenza di più candidati.
- `revops_lead_chain` riconciliata a zero con i totali canonici di pratiche, fatturato e incasso; ogni differenza rende la vista non approvabile.

### Regressione applicativa

- modulo pubblico invariato nell'esperienza e ancora funzionante;
- board `AziendePipeline` e configurazione `platform_settings` non modificati;
- log comunicazioni delle pratiche esistenti ancora funzionante;
- creazione e aggiornamento pratiche con RevOps attivo, disattivo o in errore: stessi esiti e tempi entro la tolleranza della baseline approvata dal Controllore;
- typecheck, lint e suite Vitest verdi;
- nessuna chiamata di invio email/WhatsApp dal percorso AI in modalità ombra.
- nessuna riga `automation_rules` creata per trigger lead o RevOps;
- nessuna chiamata a pagamenti, acquisto media o API ad-network;
- sostituzione del provider/modello AI senza modifica dello schema database;
- ispezione di funzioni e trigger: nessun prompt, scoring, classificazione o strategia AI in PostgreSQL;
- rilascio consenso provato nell'ordine colonne -> frontend -> smoke test -> RLS, con inserimento pubblico sempre disponibile;
- budget ridotto: ogni proposta o riallocazione resta in bozza e richiede approvazione, in assenza di soglie autorizzate.

## 8. Rollback e arresto di sicurezza

- Prima di ogni migrazione si crea una baseline di schema, policy, permessi e test funzionali correnti; per i dati preesistenti si confrontano soltanto conteggi e impronte, senza esportare valori nei rapporti.
- La prova obbligatoria è `baseline -> up -> test regressione -> down -> test baseline -> up -> down` su staging isolato con dati sintetici rappresentativi.
- Il rollback è approvato soltanto se il diff normalizzato dello schema precedente è zero, le impronte dei dati preesistenti coincidono e tutti i test del CRM corrente tornano verdi.
- Gli eventuali dati creati nelle sole strutture RevOps vengono esportati in un archivio cifrato, ne viene verificato il ripristino su ambiente isolato e soltanto dopo possono essere rimosse le strutture nuove.
- Le nuove pagine sono dietro una configurazione disattivabile.
- Le viste possono essere rimosse senza modificare i dati operativi.
- Le colonne aggiunte a `leads` restano nullable durante il rilascio; il vecchio CRM continua a funzionare.
- La sincronizzazione cassa può essere fermata senza bloccare lead e pratiche.
- Le automazioni RevOps restano in ombra: disattivarle non altera le comunicazioni correnti.
- Prima di qualsiasi rollback si esportano conteggi e registro delle eccezioni; non si cancellano dati storici automaticamente.
- `communication_log` non viene modificato: il suo rollback coincide con la baseline e le comunicazioni lead nuove sono preservate separatamente.
- Ogni prova produce artefatti firmati: schema prima/dopo, risultati test, impronte dati, export/restore delle strutture RevOps e verbale del Controllore.
- Nessuna esecuzione in produzione è consentita senza esito positivo della matrice di rollback e approvazione esplicita del Titolare.

## 9. Ordine di esecuzione proposto

1. **Baseline da oggi:** registrare fonti, campagne e costi nuovi con qualità certa.
2. **Contratto tecnico cassa:** usare la fonte Supabase condivisa e la formula verificata, previa approvazione del Controllore.
3. **Fondazione dati:** migrazioni additive, RLS e test automatici.
4. **Riconciliazione pratiche:** vista canonica in ombra e confronto con i totali correnti.
5. **Cruscotto RevOps:** pagina interna con code, eccezioni e KPI.
6. **Pilota ombra:** campione reale, confronto AI/persona e rapporto al Titolare.
7. **Controllo indipendente:** revisione del codice, delle RLS, dei conteggi e del rollback prima di qualsiasi automazione esterna.

## 10. Chiusura delle eccezioni tecniche

### E1 — Contratto della fonte cassa: chiusa in progettazione

La verifica pubblica del frontend online ha dimostrato che il cruscotto usa lo stesso progetto Supabase del CRM, ha identificato fonti, formula e controllo `cruscotto_is_owner()`. Il contratto della sezione 4 usa lettura live owner-only e snapshot automatico append-only. Non richiede accesso a un repository esterno, inserimento manuale o scrittura dell'AI.

Prima della migrazione il Controllore dovrà verificare sullo schema effettivo, senza leggere valori aziendali:

1. esistenza e tipi dei campi identificati;
2. comportamento di `cruscotto_is_owner()` per `super_admin` e diniego agli altri ruoli;
3. riconciliazione della formula su un ambiente di prova o con valori sintetici;
4. assenza di permessi di scrittura alla fonte dal percorso RevOps.

### E2 — Bozze nella tabella legacy: chiusa in progettazione

`revops_practice_events` distingue creazione valida, bozza e prima transizione di invio; la vista canonica deduplica gli UUID e il backfill legacy è classificato `reconstructed`. Nessuna tabella viene eliminata e nessuna pratica viene riscritta. Il Controllore dovrà verificare proiettore asincrono, backfill e riconciliazione a zero prima dell'attivazione dei KPI.

## 11. Criterio di passaggio alla realizzazione

La progettazione può diventare migrazione soltanto dopo:

- esito positivo delle verifiche E1-res ed E2-res autorizzate in D14;
- prova preventiva del rollback per ciascuna migrazione secondo il piano v0.4;
- controllo di Claude Code sulle modifiche introdotte dal vincolo primario;
- approvazione esplicita del Titolare dopo il rapporto del Controllore;
- checkpoint umano esplicito per l'avvio delle modifiche strutturali.

Correzioni future puramente editoriali o di esplicitazione possono seguire il gate rapido D13. Qualunque modifica a decisioni del Titolare, sicurezza, autonomia AI o soglie riapre invece il controllo completo prima di codice o migrazioni.

## 12. Matrice di recepimento mantenuta nella v0.4

| Correzione | Recepimento v0.4 |
|---|---|
| C1 Budget | Prima tranche ridotta ad autorizzato/impegnato/speso; ogni proposta resta soggetta al Titolare |
| C2 Eventi | Percorso anonimo senza trigger/FK; azioni staff; registri eventi; proiettore asincrono fuori dalle transazioni operative |
| C3 Portabilità AI | Modello solo applicativo; database limitato a regole deterministiche e audit; test di sostituzione provider |
| C4 Qualità | Solo `certain`, `reconstructed`, `missing` |
| C5 Comunicazioni | `communication_log` resta invariato; nuovo registro lead separato e completamente rimovibile |
| C6 Ruolo economico | Accesso finanziario della prima tranche limitato a `super_admin` |
| C7 Automazioni | Nessuna regola lead/RevOps in `automation_rules`; test esplicito |
| C8 Attivazione commerciale | Pulsante “Avvia onboarding” nella nuova scheda RevOps, conferma e autore auditato |
| C9 Consenso | Rilascio coordinato colonne, frontend, smoke test e irrigidimento RLS |
| C10 Spesa esterna | Solo costi sostenuti/autorizzati; nessun pagamento o collegamento di acquisto ad-network |

| Eccezione | Soluzione v0.4 |
|---|---|
| E1 Cassa | Stesso Supabase verificato; fonti, formula, controllo owner e snapshot deterministico documentati |
| E2 Legacy | Registro eventi append-only alimentato fuori dal flusso operativo, gestione bozze e deduplicazione UUID |
