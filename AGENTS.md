# Istruzioni permanenti del progetto

Questo è l'**unico** libro delle regole del progetto, e vale per tutti gli
agenti che lavorano in questo repository.

Nasce dalla fusione di due file `AGENTS.md` diversi che esistevano in
parallelo su due rami, con contenuti in gran parte differenti: ciascun agente
leggeva il proprio e non vedeva le regole dell'altro. Nessuno dei due era in
`main`. Tutto il testo delle due versioni è conservato qui; dove le regole si
contraddicevano, la contraddizione è risolta e segnalata.

Se un caso non è coperto, o se due regole qui dentro sono in conflitto,
fermarsi al livello di autonomia già autorizzato e portare la decisione al
Titolare.

## Cabina di Regia

- Adotta come regola permanente il metodo **Grove + Bezos della Cabina di Regia** in ogni attività pertinente.
- La definizione ufficiale, controllata e versionata del metodo è in [`docs/CABINA_DI_REGIA.md`](docs/CABINA_DI_REGIA.md).
- Applica quella definizione senza introdurre criteri, soglie o livelli di autonomia di tua iniziativa.
- Se un caso non è coperto o due regole sono in conflitto, fermati al livello di autonomia già autorizzato e porta la decisione al Titolare.

## Verifica delle risposte

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

## APR: unica sede valida del risultato

- Ogni cambiamento deciso per APR deve essere integrato nell'ultima base aggiornata, installato in APR e verificato nel CRM realmente utilizzato dal Titolare.
- Una correzione presente soltanto nel sorgente, in una patch, in una copia locale o in un ambiente di prova non è un lavoro concluso e non deve essere presentata come tale.
- Verso il Titolare lo stato si esprime soltanto come **APR aggiornato** oppure **APR non aggiornato**. Non usare numeri di revisione, build o sigle analoghe come informazione principale.
- Non sostituirsi ad APR con lettori in ombra, repliche locali o coorti diagnostiche in sola lettura.
- Un replay locale, un test verde o una lettura diagnostica possono essere dichiarati esclusivamente come test o diagnostica. Non dimostrano che una pratica sia partita, terminata o fallita in APR.
- Per dichiarare che una funzione opera correttamente, deve essere stata eseguita da APR sulla pratica reale nel CRM usato dal Titolare, con prova dell'esito.
- Una pratica non risulta avviata finché APR non l'ha realmente avviata. Una lettura diagnostica non costituisce avvio.
- Un difetto corretto ma non ancora installato in APR deve essere considerato ancora presente.

## Avvio e riavvio delle pratiche

- **Una pratica ferma riparte soltanto per disposizione del Titolare.** Le sue
  disposizioni sono due, e nessun'altra: il riavvio che chiede
  esplicitamente, e la risposta che scrive nel riquadro della scheda — quella
  risposta è la sua disposizione per quella pratica.
- **Nessun agente rilancia o riprende una pratica ferma, e nessuno la corregge
  in corsa.** Nemmeno quando la correzione è evidente e il rilancio costerebbe
  un minuto. Avviare una pratica che il Titolare ha indicato è ammesso;
  riavviarne una che si è fermata non lo è.
- Nessun altro fatto autorizza un riavvio: non l'installazione di una
  correzione, non un riesame operativo successivo a una correzione, non
  l'appartenenza a una coorte autorizzata in precedenza, non l'evidenza che
  il rilancio funzionerebbe. **Dove altre istruzioni prevedono una ripresa
  automatica dopo una correzione, un riesame operativo o il rilancio di una
  coorte già autorizzata, questa regola prevale.**
- **La ripresa dopo una risposta del Titolare avviene autonomamente tramite APR
  persistente, senza comandi manuali di un agente.** La risposta che il Titolare
  scrive nel riquadro della scheda è la sua disposizione di riavvio per quella
  pratica: APR la legge e riprende da sé. Un agente non deve lanciare nulla per
  farla ripartire.
- Una pratica ferma **resta ferma e visibile** sulla sua scheda, con una riga
  che dice perché, scritta nel campo che il riquadro delle risposte legge.
  APR prosegue con le altre pratiche autorizzate.
- La correzione va nel codice **come regola generale**, registrata e legata a
  un test che attraversi il punto di decisione; non come aggiustamento valido
  per quella sola pratica.
- Le fermate si contano in due mucchi distinti: **ferme per progetto** (per
  esempio VEPA e pompe di calore che si fermano ai dati dell'intervento del
  Bonus Casa, come deciso dal Titolare) e **ferme per guasto o per dato
  mancante**. Nello stesso mucchio, molte fermate legittime nascondono le
  poche illegittime.
- Il numero da riferire al Titolare non è quante pratiche si sono chiuse, ma
  **quante si sono chiuse al primo avvio senza che nessuno abbia toccato il
  codice**, con il denominatore.

Regola decisa dal Titolare il 12 ottobre 2026, dopo la misura delle coorti
del 10 e 11 ottobre: cinque pratiche chiuse, tutte e cinque dopo un rilancio
con il codice cambiato, nessuna al primo avvio a codice fermo.

## Continuità APR

- Per avviare una singola pratica dalla coda CRM usare `npm run apr:crm-ready-one -- --plan/--run --only-practice-id <uuid>`: il comando risolve la coda dal bundle APR installato. Non eseguire direttamente l'artefatto della coda nell'albero di lavoro condiviso, che può contenere regole diverse da quelle installate.
- Le pratiche operative sono eseguite esclusivamente dal software persistente APR; Codex può soltanto sviluppare, correggere, installare e verificare APR.
- La conclusione di un turno Codex non deve arrestare o sospendere worker, supervisore, watchdog o coda APR.
- Prima di dichiarare attività in corso servono tre prove indipendenti: processo di sistema attivo, heartbeat/checkpoint aggiornato e stato leggibile dalla dashboard.
- Gli stati pubblici sono `WORKING`, `IDLE`, `OPERATOR_REQUIRED` e `TECHNICAL_BLOCK`; `IDLE` significa esplicitamente coda vuota e non va descritto come lavoro in corso.
- Un blocco per-pratica va isolato come `Richiesto intervento operatore` e non deve fermare le pratiche successive.
- Nell'uso esteso o non assistito, qualunque errore o impedimento circoscritto a una singola pratica deve: persistere motivazione e domanda operatore, rilasciare lock/lease della pratica, pubblicare `OPERATOR_REQUIRED` e proseguire automaticamente con la successiva pratica eseguibile. È vietato trasformare un errore per-pratica in uno stop globale della coda.
- Lo stop globale resta ammesso soltanto per un difetto tecnico comune che renda insicura l'esecuzione delle pratiche successive, oppure durante un collaudo assistito quando il mandato della coorte impone esplicitamente `stop alla prima anomalia`. Questa eccezione di collaudo deve essere auditata come policy della singola esecuzione e non modifica la regola permanente dell'uso esteso.
- Se esiste lavoro eseguibile e il checkpoint non avanza per cinque minuti, il watchdog deve diagnosticare
  e tentare una sola ripresa sicura e idempotente dal checkpoint. Questo vale **solo per uno stallo** —
  una pratica che era in corso e si è piantata — e **non si estende** a una pratica fermata per guasto,
  per dato mancante o per progetto, né alla ripresa dopo una correzione.
- Stato, fase, pratica corrente, prossima azione, lock, lease e audit devono sopravvivere a crash, riavvio dei processi, logout/login e riavvio del computer.
- Restano vietati anteprima, submit, ricevute, email e comunicazioni; Beatrice Ciotta resta esclusa.

## Apprendimento dai casi

- Ogni caso singolo esaminato e corretto deve essere trasformato in una regola operativa generale APR, salvo che l'utente lo dichiari esplicitamente override non propagabile.
- Una correzione non è considerata acquisita finché non possiede: ID nel registro unico, precedenza/fonti, azione deterministica, audit, test positivo, test negativo o fail-closed, voce nella matrice regole e bundle persistente installato corrispondente ai test.
- Il nome del cliente può apparire soltanto come fixture di regressione: il comportamento applicativo non deve dipendere dal cliente, dalla pratica o dalla coorte.
- Dopo ogni correzione, la prova è il test della regola, non il rilancio della pratica. **Una pratica ferma
  non si riesegue per verificare una correzione**: la verifica si fa con il test che attraversa il punto di
  decisione. La pratica riparte quando la riavvia il Titolare, e allora si verificano stato,
  `report.blockers` e `/api/case-truth`. Una correzione soltanto documentata o discussa non è una regola attiva.
- Gli override caso-specifici devono essere auditati come non propagabili e non possono diventare fallback generali.

## Autorizzazione dei test ENEA

- La prima trasmissione al portale ENEA TEST dei dati di una pratica o di una coorte richiede conferma esplicita dell'utente immediatamente prima dell'avvio operativo.
- Il rilancio dello stesso identico insieme di pratiche già autorizzato non richiede una nuova conferma
  **di trasmissione**: l'autorizzazione già data resta valida e non va richiesta di nuovo. Questo però
  **non costituisce permesso di riavviare una pratica che si è fermata**, né di ripeterla per verificare
  nuove regole o correzioni: il riavvio lo dispone soltanto il Titolare. Quando lo dispone, la coorte
  conserva identità, audit e idempotenza.
- L'aggiunta anche di una sola pratica mai trasmessa prima rende il nuovo insieme non già autorizzato e richiede una nuova conferma esplicita prima della trasmissione.
- L'autorizzazione al test consente esclusivamente creazione, compilazione e salvataggio di bozze TEST; anteprima, invio, protocollazione, ricevute, email e comunicazioni restano vietati salvo mandato futuro distinto.

## Campionamento dei lotti

- I nuovi lotti non devono privilegiare le pratiche più semplici o con meno fatture per aumentare artificialmente il tasso di successo.
- La selezione deve essere casuale e rappresentativa del corpus autorizzato, con seed persistito e auditabile, includendo un mix di numerosità fatture, righe prodotto, moduli e casi limite economici già osservati.
- Il report del lotto deve mostrare la distribuzione della complessità selezionata, così da distinguere un collaudo rappresentativo da un campione facilitato.

## Continuità della sessione ENEA durante la manutenzione

- Il keepalive ENEA read-only deve restare attivo anche durante build, test e preparazione di una nuova installazione locale.
- Worker/supervisore/watchdog del lotto attivo possono essere arrestati soltanto quando il nuovo bundle è già costruito e verificato; il riavvio deve essere immediato e la finestra senza keepalive deve restare inferiore all'intervallo configurato.
- Un sequencer non deve spegnere il processo che mantiene la sessione prima che esista un successore verificato, salvo arresto di sicurezza imposto da un rischio mutativo; in quel caso deve dichiarare esplicitamente che il keepalive è sospeso.

## Quiescenza delle coorti terminali

- Un worker di coorte deve rilasciare il controller browser e terminare pulitamente quando checkpoint esecuzione e stato servizio concordano su `completed` e non esiste una pratica corrente.
- Il LaunchAgent del worker deve riavviarlo dopo un'uscita anomala, ma non dopo un'uscita terminale riuscita. Chrome APR e il keepalive indipendente non devono essere arrestati.
- Se worker, supervisore o watchdog di una coorte verificata terminale restano attivi senza lavoro e trattengono o contendono inutilmente il controller browser, Codex è permanentemente autorizzato a renderli quiescenti senza nuova conferma, dopo aver verificato checkpoint terminale, assenza di pratica corrente e identità esatta dei servizi. Questa autorizzazione non si estende a servizi non terminali, Chrome, keepalive o altri problemi nuovi/rischiosi.

## Diagnostica macOS non intrusiva

- È vietato invocare `system_profiler` nelle attività APR/Codex: le precedenti invocazioni diagnostiche hanno interferito con il lavoro dell'utente aprendo la finestra di informazioni del Mac.
- Per controlli hardware o di processo usare esclusivamente fonti CLI non grafiche e mirate (`ps`, `ioreg`, `launchctl`, log già persistiti), senza `open`, AppleScript o comandi che attivino applicazioni di sistema.
- Causa radice diagnosticata l'8/9/2026: il problema non era (solo) una singola invocazione di comando, ma **decine di LaunchAgent macOS reali installati direttamente in `~/Library/LaunchAgents/` o via `launchctl load/bootstrap/submit`** durante verifiche una tantum (uno di questi, dell'8/2026, era esplicitamente chiamato "immortal", con `KeepAlive`+`RunAtLoad`, mai rimosso: attivo per giorni, 38.936 fork). Questi processi vivono fuori da git e da questo repository: nessuna correzione del codice sorgente li tocca o li ferma mai. Per questo il problema si è ripresentato più volte nonostante correzioni dichiarate risolte.
- **È permanentemente vietato usare `launchctl load`, `launchctl bootstrap` o `launchctl submit` per qualunque task una tantum, esperimento, verifica o batch di test.** Un processo in background per un task del genere deve restare un processo di sessione ordinario (termina con la sessione/terminale che lo ha avviato), mai un LaunchAgent persistente.
- L'unica eccezione ammessa è un servizio APR permanente e deliberato (es. il worker/supervisore/watchdog di produzione, o il keepalive ENEA read-only già documentato altrove in questo file), installato esclusivamente tramite il flusso già sottoposto a revisione (`prepareLaunchAgent`/`launchAgentService.ts`), mai con un comando `launchctl` scritto a mano su un file scratch dentro `ops/`.
- Chi installa un LaunchAgent per un'eccezione legittima deve registrarne l'esistenza (percorso del plist, motivo, data) e rimuoverlo esplicitamente (`launchctl bootout` + cancellazione del file) non appena il suo scopo è concluso: nessun LaunchAgent deve restare caricato "per abitudine" oltre la fine del task che lo ha giustificato.
- Prima di dichiarare una diagnostica di questo tipo conclusa, verificare sempre `launchctl list | grep praticarapida` e l'assenza di file `com.praticarapida.*` non tracciati in `~/Library/LaunchAgents/`: una correzione nel codice senza questa verifica non è una correzione completa.

## Domande operatore

- Ogni caso residuo, bloccato o ambiguo deve includere nei report e negli artefatti strutturati un campo `operatorQuestion`; una descrizione soltanto tecnica non è sufficiente.
- `operatorQuestion` deve essere una domanda diretta, specifica per il documento, il dato o la decisione concreta, e deve poter ricevere come risposta un sì/no oppure un'informazione precisa.
- Quando manca un documento, indicare anche `missingDocumentType` con il tipo esatto (per esempio fattura di acconto, modulo cliente firmato o verbale datato di fine lavori), evitando formule generiche.
- La domanda deve restare informativa e non va inviata automaticamente al cliente, rivenditore o operatore senza un'autorizzazione separata alle comunicazioni.

## Esclusione fornitori

- Le pratiche collegate a Erre Emme / RM Legno, oltre a Beatrice Ciotta e alla pratica interna Overthemol / Samuele Beretta, non devono entrare nell'elaborazione automatica APR.
- **Vans è stato rimosso da questo elenco il 28/09/2026** per decisione del Titolare: sulle pratiche nuove il fornitore consegna le fatture, quindi il motivo dell'esclusione non esiste più. Una pratica Vans priva di fatture segue la strada ordinaria del documento mancante, non un'esclusione per nome.
- Il controllo deve usare sia il fornitore testuale sia la relazione CRM del rivenditore/azienda; una corrispondenza porta direttamente la singola pratica in `OPERATOR_REQUIRED`, prima del download o dell'analisi degli allegati e senza fermare la coda.

## Precedenza anagrafica

- Per nome, cognome e altri campi anagrafici, una fonte fiscale o ufficiale coerente con il codice fiscale prevale sui dati digitati manualmente nel CRM o nel form.
- La precedenza è: documento ufficiale d'identità o sanitario, poi documento fiscale, poi CRM/form manuale. Fonti documentali discordanti o non univoche devono chiudere il gate e richiedere l'operatore; non sono ammessi completamenti dedotti.

## Fasce operative WhatsApp

- Gli invii WhatsApp ai clienti sono consentiti, nel fuso orario `Europe/Rome`, esclusivamente:
  - dal lunedì al venerdì, dalle 08:30 incluse alle 22:00 escluse;
  - il sabato, dalle 08:30 incluse alle 14:00 escluse;
  - mai la domenica.
- Fuori fascia, non inviare e non anticipare messaggi: prepararli o lasciarli in attesa per la prima fascia utile.
- Eccezione permanente decisa dal Titolare: i soli solleciti di compilazione, via WhatsApp o e-mail, possono essere inviati H24 e 7 giorni su 7, inclusi sabato e domenica. L'eccezione non si estende a primi messaggi, solleciti di pagamento, richieste di recensione o altre comunicazioni.
- Al di fuori dell'eccezione permanente per i solleciti di compilazione, un'eccezione vale soltanto per il singolo invio espressamente autorizzato dal Titolare e non modifica la regola generale.
- Prima di un invio multiplo, verificare tre volte: destinatari, assenza di precedenti invii riusciti dello stesso tipo e correttezza del template/link. Non includere automaticamente solleciti o richieste recensione in un lotto di primi messaggi.

## Invio fatture mensili

- Per le fatture di fine mese intestate a **G.A. Servizi**, inviare sempre la fattura sia all'indirizzo e-mail memorizzato nell'anagrafica di Fatture in Cloud, sia a `gaidroclima@gmail.com`.
- L'indirizzo aggiuntivo non sostituisce quello presente in Fatture in Cloud: entrambi devono ricevere la fattura.

---

## Nota sulla fusione delle due versioni

Dalla versione che leggeva Codex è stata conservata anche la clausola secondo
cui la ripresa dopo una risposta dell'operatore avviene autonomamente tramite
APR persistente, senza comandi manuali di un agente. Resta valida: la
risposta scritta dal Titolare nel riquadro della scheda **è** la sua
disposizione di riavvio per quella pratica, e APR la esegue da sé.

Tre punti delle regole precedenti sono stati corretti perché autorizzavano un
riavvio che la regola del 12 ottobre non ammette:

1. **Apprendimento dai casi** — prevedeva di rieseguire il caso dal
   checkpoint dopo ogni correzione. Ora la prova della correzione è il test
   della regola; la pratica riparte solo su disposizione del Titolare.
2. **Autorizzazione dei test ENEA** — prevedeva che il rilancio di un insieme
   già autorizzato non richiedesse conferma e potesse essere ripetuto per
   verificare nuove regole. Ora quell'autorizzazione vale come permesso di
   *trasmissione*, non come permesso di *riavvio*.
3. **Continuità APR** — prevedeva una ripresa del watchdog quando il
   checkpoint non avanza. Resta, ma limitata allo **stallo** di una pratica in
   corso: non si estende a una pratica fermata né alla ripresa dopo una
   correzione.
