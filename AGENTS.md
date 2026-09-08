# Regola permanente di verifica delle risposte

Prima di fornire all'utente una conclusione, uno stato o un'indicazione operativa:

1. eseguire una prima verifica sulla fonte primaria pertinente;
2. ripetere la verifica con un secondo metodo e una seconda fonte indipendenti dalla prima;
3. eseguire una terza verifica con un metodo e una fonte indipendenti dalle prime due;
4. se i tre riscontri non concordano, non dichiarare il dato verificato e spiegare chiaramente la discrepanza;
5. distinguere sempre fra test automatici/locali, test operativi con sistemi reali e disponibilità in produzione;
6. non usare genericamente «pronto per i test»: specificare sempre quale categoria di test è pronta e quale non lo è.
7. prima di affermare che una pratica APR ha un problema o un blocco, verificare obbligatoriamente la verità caso tramite checkpoint persistente, `report.blockers` e API dashboard `/api/case-truth`; la parola «blocco» è ammessa solo con stato `blocked_case` e almeno un blocker coerente;
8. se la verità caso è `READY`, dichiarare esplicitamente «nessun problema» e non trasformare il solo limite globale `externalActionAllowed=false` in un blocco della pratica;
9. se stato, report e dashboard non concordano, dichiarare esclusivamente `INCONSISTENT` e correggere il software prima di fornire una diagnosi del caso.

Questa regola si applica a tutte le future attività e chat che operano in questo repository.

# Regola permanente di continuità APR

- Le pratiche operative sono eseguite esclusivamente dal software persistente APR; Codex può soltanto sviluppare, correggere, installare e verificare APR.
- La conclusione di un turno Codex non deve arrestare o sospendere worker, supervisore, watchdog o coda APR.
- Prima di dichiarare attività in corso servono tre prove indipendenti: processo di sistema attivo, heartbeat/checkpoint aggiornato e stato leggibile dalla dashboard.
- Gli stati pubblici sono `WORKING`, `IDLE`, `OPERATOR_REQUIRED` e `TECHNICAL_BLOCK`; `IDLE` significa esplicitamente coda vuota e non va descritto come lavoro in corso.
- Un blocco per-pratica va isolato come `Richiesto intervento operatore` e non deve fermare le pratiche successive.
- Nell'uso esteso o non assistito, qualunque errore o impedimento circoscritto a una singola pratica deve: persistere motivazione e domanda operatore, rilasciare lock/lease della pratica, pubblicare `OPERATOR_REQUIRED` e proseguire automaticamente con la successiva pratica eseguibile. È vietato trasformare un errore per-pratica in uno stop globale della coda.
- Lo stop globale resta ammesso soltanto per un difetto tecnico comune che renda insicura l'esecuzione delle pratiche successive, oppure durante un collaudo assistito quando il mandato della coorte impone esplicitamente `stop alla prima anomalia`. Questa eccezione di collaudo deve essere auditata come policy della singola esecuzione e non modifica la regola permanente dell'uso esteso.
- Se esiste lavoro eseguibile e il checkpoint non avanza per cinque minuti, il watchdog deve diagnosticare e tentare una sola ripresa sicura e idempotente dal checkpoint.
- Stato, fase, pratica corrente, prossima azione, lock, lease e audit devono sopravvivere a crash, riavvio dei processi, logout/login e riavvio del computer.
- Restano vietati anteprima, submit, ricevute, email e comunicazioni; Beatrice Ciotta resta esclusa.

# Regola permanente di apprendimento APR dai casi

- Ogni caso singolo esaminato e corretto deve essere trasformato in una regola operativa generale APR, salvo che l'utente lo dichiari esplicitamente override non propagabile.
- Una correzione non è considerata acquisita finché non possiede: ID nel registro unico, precedenza/fonti, azione deterministica, audit, test positivo, test negativo o fail-closed, voce nella matrice regole e bundle persistente installato corrispondente ai test.
- Il nome del cliente può apparire soltanto come fixture di regressione: il comportamento applicativo non deve dipendere dal cliente, dalla pratica o dalla coorte.
- Dopo ogni correzione, rieseguire il caso dal checkpoint con APR e verificare stato, `report.blockers` e `/api/case-truth`; una correzione soltanto documentata o discussa non è una regola attiva.
- Gli override caso-specifici devono essere auditati come non propagabili e non possono diventare fallback generali.

# Regola permanente di autorizzazione dei test ENEA

- La prima trasmissione al portale ENEA TEST dei dati di una pratica o di una coorte richiede conferma esplicita dell'utente immediatamente prima dell'avvio operativo.
- Il rilancio dello stesso identico insieme di pratiche già autorizzato non richiede una nuova conferma: APR può ripeterlo direttamente per verificare nuove regole o correzioni, conservando identità della coorte, audit e idempotenza.
- L'aggiunta anche di una sola pratica mai trasmessa prima rende il nuovo insieme non già autorizzato e richiede una nuova conferma esplicita prima della trasmissione.
- L'autorizzazione al test consente esclusivamente creazione, compilazione e salvataggio di bozze TEST; anteprima, invio, protocollazione, ricevute, email e comunicazioni restano vietati salvo mandato futuro distinto.

# Regola permanente di campionamento dei lotti APR

- I nuovi lotti non devono privilegiare le pratiche più semplici o con meno fatture per aumentare artificialmente il tasso di successo.
- La selezione deve essere casuale e rappresentativa del corpus autorizzato, con seed persistito e auditabile, includendo un mix di numerosità fatture, righe prodotto, moduli e casi limite economici già osservati.
- Il report del lotto deve mostrare la distribuzione della complessità selezionata, così da distinguere un collaudo rappresentativo da un campione facilitato.

# Regola permanente di continuità della sessione ENEA durante manutenzione

- Il keepalive ENEA read-only deve restare attivo anche durante build, test e preparazione di una nuova installazione locale.
- Worker/supervisore/watchdog del lotto attivo possono essere arrestati soltanto quando il nuovo bundle è già costruito e verificato; il riavvio deve essere immediato e la finestra senza keepalive deve restare inferiore all'intervallo configurato.
- Un sequencer non deve spegnere il processo che mantiene la sessione prima che esista un successore verificato, salvo arresto di sicurezza imposto da un rischio mutativo; in quel caso deve dichiarare esplicitamente che il keepalive è sospeso.

# Regola permanente di quiescenza delle coorti terminali APR

- Un worker di coorte deve rilasciare il controller browser e terminare pulitamente quando checkpoint esecuzione e stato servizio concordano su `completed` e non esiste una pratica corrente.
- Il LaunchAgent del worker deve riavviarlo dopo un'uscita anomala, ma non dopo un'uscita terminale riuscita. Chrome APR e il keepalive indipendente non devono essere arrestati.
- Se worker, supervisore o watchdog di una coorte verificata terminale restano attivi senza lavoro e trattengono o contendono inutilmente il controller browser, Codex è permanentemente autorizzato a renderli quiescenti senza nuova conferma, dopo aver verificato checkpoint terminale, assenza di pratica corrente e identità esatta dei servizi. Questa autorizzazione non si estende a servizi non terminali, Chrome, keepalive o altri problemi nuovi/rischiosi.

# Regola permanente di diagnostica macOS non intrusiva

- È vietato invocare `system_profiler` nelle attività APR/Codex: le precedenti invocazioni diagnostiche hanno interferito con il lavoro dell'utente aprendo la finestra di informazioni del Mac.
- Per controlli hardware o di processo usare esclusivamente fonti CLI non grafiche e mirate (`ps`, `ioreg`, `launchctl`, log già persistiti), senza `open`, AppleScript o comandi che attivino applicazioni di sistema.
- Causa radice diagnosticata l'8/9/2026: il problema non era (solo) una singola invocazione di comando, ma **decine di LaunchAgent macOS reali installati direttamente in `~/Library/LaunchAgents/` o via `launchctl load/bootstrap/submit`** durante verifiche una tantum (uno di questi, dell'8/2026, era esplicitamente chiamato "immortal", con `KeepAlive`+`RunAtLoad`, mai rimosso: attivo per giorni, 38.936 fork). Questi processi vivono fuori da git e da questo repository: nessuna correzione del codice sorgente li tocca o li ferma mai. Per questo il problema si è ripresentato più volte nonostante correzioni dichiarate risolte.
- **È permanentemente vietato usare `launchctl load`, `launchctl bootstrap` o `launchctl submit` per qualunque task una tantum, esperimento, verifica o batch di test.** Un processo in background per un task del genere deve restare un processo di sessione ordinario (termina con la sessione/terminale che lo ha avviato), mai un LaunchAgent persistente.
- L'unica eccezione ammessa è un servizio APR permanente e deliberato (es. il worker/supervisore/watchdog di produzione, o il keepalive ENEA read-only già documentato altrove in questo file), installato esclusivamente tramite il flusso già sottoposto a revisione (`prepareLaunchAgent`/`launchAgentService.ts`), mai con un comando `launchctl` scritto a mano su un file scratch dentro `ops/`.
- Chi installa un LaunchAgent per un'eccezione legittima deve registrarne l'esistenza (percorso del plist, motivo, data) e rimuoverlo esplicitamente (`launchctl bootout` + cancellazione del file) non appena il suo scopo è concluso: nessun LaunchAgent deve restare caricato "per abitudine" oltre la fine del task che lo ha giustificato.
- Prima di dichiarare una diagnostica di questo tipo conclusa, verificare sempre `launchctl list | grep praticarapida` e l'assenza di file `com.praticarapida.*` non tracciati in `~/Library/LaunchAgents/`: una correzione nel codice senza questa verifica non è una correzione completa.

# Regola permanente delle domande operatore

- Ogni caso residuo, bloccato o ambiguo deve includere nei report e negli artefatti strutturati un campo `operatorQuestion`; una descrizione soltanto tecnica non è sufficiente.
- `operatorQuestion` deve essere una domanda diretta, specifica per il documento, il dato o la decisione concreta, e deve poter ricevere come risposta un sì/no oppure un'informazione precisa.
- Quando manca un documento, indicare anche `missingDocumentType` con il tipo esatto (per esempio fattura di acconto, modulo cliente firmato o verbale datato di fine lavori), evitando formule generiche.
- La domanda deve restare informativa e non va inviata automaticamente al cliente, rivenditore o operatore senza un'autorizzazione separata alle comunicazioni.

# Regola permanente di esclusione fornitori APR

- Le pratiche collegate a Erre Emme / RM Legno o Vans, oltre a Beatrice Ciotta e alla pratica interna Overthemol / Samuele Beretta, non devono entrare nell'elaborazione automatica APR.
- Il controllo deve usare sia il fornitore testuale sia la relazione CRM del rivenditore/azienda; una corrispondenza porta direttamente la singola pratica in `OPERATOR_REQUIRED`, prima del download o dell'analisi degli allegati e senza fermare la coda.

# Regola permanente di precedenza anagrafica

- Per nome, cognome e altri campi anagrafici, una fonte fiscale o ufficiale coerente con il codice fiscale prevale sui dati digitati manualmente nel CRM o nel form.
- La precedenza è: documento ufficiale d'identità o sanitario, poi documento fiscale, poi CRM/form manuale. Fonti documentali discordanti o non univoche devono chiudere il gate e richiedere l'operatore; non sono ammessi completamenti dedotti.
