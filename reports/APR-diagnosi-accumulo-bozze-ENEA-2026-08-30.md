# DOCUMENTO SUPERATO — APR, bozze ENEA TEST (30 agosto 2026)

> **Correzione dell'utente:** le bozze multiple sono normali e accettate nell'ambiente SPID TEST. Non costituiscono un difetto, non richiedono pulizia, consolidamento, prevenzione o modifica della policy. Le proposte di pulizia e prevenzione contenute più sotto sono ritirate e non devono essere eseguite. La diagnosi corrente è in `APR-diagnosi-instabilita-operativa-2026-08-30.md`.

## Verdetto

- L'accumulo è reale e sistemico: i checkpoint APR contengono **327 ID bozza unici**, tutti confermati anche dal journal CDP. Di questi, **305** appartengono a **62 pratiche ripetute**; le altre 22 pratiche hanno una sola bozza registrata.
- Il conteggio seguente è esatto per le bozze create e non successivamente ritirate dai registri APR. Non è certificabile come conteggio corrente delle bozze ancora aperte sul portale perché, al momento della verifica, Chrome APR sulla porta 9331 era spento e non esisteva una sessione ENEA autenticata interrogabile. Sono presenti sette prove di cancellazione/assenza server, tutte relative a vecchie bozze già escluse dall'elenco seguente.
- L'origine è la policy di test persistita `preserve_and_ignore_for_new_test_draft`: i test storici conservano le bozze precedenti e ne creano una nuova a ogni rilancio.
- L'accumulo non è la causa dimostrata degli ultimi arresti di Cristina Ricchi e Zeno Righetti. Nei due ultimi tentativi APR aveva già identificato una singola bozza ed era arrivato a 5 pagine salvate; l'arresto è avvenuto dopo, durante la prova di persistenza di righe Schermature.

## Verifiche indipendenti

1. Checkpoint `enea-draft-execution`: 327 ID bozza unici; 62 pratiche con più di un ID, per complessive 305 bozze.
2. Journal `enea-browser-worker/cdp-driver.json`: tutti i 327 ID hanno una mappatura o un evento CDP corrispondente; zero ID privi di seconda evidenza.
3. Registro delle assenze/cancellazioni server: sette `retire_deleted_draft_mapping_after_server_absence`, nessuno riferito agli ID elencati sotto. La lettura live del portale non era disponibile: endpoint Chrome APR 9331 non attivo.

## Elenco completo delle pratiche ripetute

Il numero è il conteggio degli ID bozza distinti registrati e non ritirati localmente; gli ID permettono la successiva riconciliazione live.

- 14 — Mara Elena Maddiotto — 424831, 424881, 425508, 427354, 429426, 431585, 431845, 433111, 435356, 440013, 442007, 442292, 442436, 442518
- 13 — Tommasina Desando — 411579, 424875, 424877, 425437, 427257, 429399, 431578, 431842, 433071, 435285, 438641, 438708, 438758
- 12 — Amelia Lerose — 411950, 412018, 424972, 425434, 427240, 429378, 431572, 431838, 433049, 441760, 442633, 443143
- 12 — Luca Callegari — 414538, 414587, 414603, 414614, 415656, 415838, 416725, 435268, 440109, 442459, 442540, 442895
- 12 — Luca Cigognetti — 424883, 425462, 427412, 429464, 431591, 431849, 433143, 435358, 440051, 442452, 442592, 442956
- 11 — Cristina Ricchi — 412180, 414445, 414593, 414608, 414620, 415683, 435302, 435382, 440178, 442602, 442968
- 9 — Claudio Beghini — 414540, 414589, 414605, 414616, 415665, 435327, 440228, 442528, 442874
- 9 — Massimiliano Gaetano Khemara — 414564, 414594, 414609, 414621, 415686, 435332, 435387, 440212, 442461
- 9 — Tommaso Cecchi — 414439, 414588, 414604, 414615, 415662, 435312, 438639, 438717, 438761
- 9 — Zeno Righetti — 414449, 414596, 414611, 414623, 415693, 435341, 440131, 442583, 442941
- 8 — Armando Ranzoni — 431593, 431850, 433174, 435342, 439982, 442448, 442654, 443116
- 8 — Romeo Ropa — 424884, 425439, 427278, 429410, 431584, 431843, 433096, 435355
- 7 — Monica Ambra Fioravanti — 412277, 414442, 414591, 414606, 414617, 415672, 435320
- 6 — Danila Serpa — 411593, 435266, 435379, 440237, 442625, 443145
- 6 — Emanuela Parolo — 411583, 435278, 438074, 439930, 442610, 442991
- 6 — Federigo Cileo — 414443, 414592, 414607, 414618, 415678, 435330
- 6 — Flavio Ceriani — 411596, 424880, 425446, 427310, 435287, 435380
- 6 — Gianluigi Chiolini — 412301, 414452, 414598, 414612, 414624, 415701
- 6 — Matteo Maranesi — 414446, 414595, 414610, 414622, 415689, 435338
- 6 — Milena Albertoni — 411867, 435296, 435381, 440150, 442561, 442913
- 5 — Eleonora Meggiarin — 424882, 425458, 427397, 441755, 443110
- 5 — Fabio Sartori — 412171, 435305, 438637, 438705, 438757
- 5 — Flavia Cipriani — 425099, 425463, 427433, 441753, 443105
- 5 — Gabriella Bruno — 412302, 435272, 440241, 442556, 442906
- 5 — Gianluca Dalle Donne — 414477, 414584, 414602, 414613, 415649
- 5 — Lia Chiericati — 416675, 424879, 425445, 427301, 435251
- 5 — Lucia Lagrasta — 435314, 435385, 440136, 442568, 442922
- 5 — Luigi Carfora — 411578, 435281, 438596, 438711, 438759
- 5 — Noemi Fumagalli — 411595, 435291, 438630, 438716, 438760
- 4 — Barbara Melis — 424840, 424864, 441752, 442860
- 4 — Cataldo Cassone — 411954, 412021, 435259, 435378
- 4 — Daniela Guidotti — 435264, 440203, 442575, 442930
- 4 — Kitenge Ebambi — 424842, 424867, 441750, 442883
- 4 — Luca Ronconi — 425199, 425443, 427294, 435354
- 4 — Roberto Marcello — 424843, 424869, 441749, 443097
- 4 — Sebastian Costel Volf — 424830, 425010, 425454, 427329
- 3 — Donata Zangrossi — 425014, 425455, 427375
- 3 — Fares Hassairi — 435265, 440251, 442467
- 3 — Lea Dettori — 411957, 412025, 435253
- 3 — Luca Maestri — 411601, 424876, 424878
- 3 — Monica Molteni — 411597, 425101, 435275
- 2 — Alessandra Vacca — 438724, 438764
- 2 — Andrea Trabucco — 438727, 438767
- 2 — Andreea Ioana Olteanu — 424841, 424865
- 2 — Angelina Stricelli — 438729, 439076
- 2 — Annita Lucidi — 435254, 438266
- 2 — Betti Boato — 438739, 439094
- 2 — Cristina Dassi — 435262, 440189
- 2 — Elena Depalma — 438752, 439116
- 2 — Elisa Moro — 416583, 416890
- 2 — Fabrizio Ceci — 438746, 439142
- 2 — Gianfranca Proserpio — 411589, 435250
- 2 — Gianluca Percaccioli — 435308, 435383
- 2 — Giovanni Zucchini — 416646, 435351
- 2 — Giuseppe Bonaventura — 438753, 439155
- 2 — Lucia Droghetti — 435321, 435386
- 2 — Marco Dall'Ara — 438747, 439198
- 2 — Marco Fecondini — 412314, 435325
- 2 — Mauro Ballabio — 435310, 435384
- 2 — Orietta Artuso — 438754, 439214
- 2 — Pieraldo Casini — 438748, 439501
- 2 — Silvio Proia — 424844, 424871

## Sovrapposizione dei casi non completati

- Nell'ultimo replay da 30, tutte le 23 pratiche non completate erano già non completate nel giro immediatamente precedente: sovrapposizione **23/23 (100%)**. Questo è atteso perché il replay ha usato lo stesso corpus storico, non un nuovo campione casuale.
- Solo 12 delle 23 avevano più di una bozza registrata; 11 ne avevano zero o una. Viceversa, tutte le 7 pratiche completate nel replay avevano da 4 a 12 bozze registrate. L'accumulo non separa quindi i successi dai fallimenti.
- Sono presenti ricorrenze reali dei medesimi difetti: 13 delle 23 compaiono almeno quattro volte nei report disponibili. Questo dimostra che alcuni problemi non sono stati risolti dai replay; non dimostra che la causa sia il numero di bozze.

## Cristina Ricchi e Zeno Righetti

### Cristina Ricchi

- 11 bozze registrate.
- Sei tentativi tra il 16 e il 18 agosto risultano completati 10/10 anche se le bozze precedenti restavano presenti.
- Ultimo tentativo: bozza 442968, 5/10 pagine; APR aveva già identificato quella bozza e si è fermato su `screening:3`, con intento di salvataggio persistito e conferma server ancora mancante.
- Le tre fonti di verità non concordano: checkpoint non terminale, report `operator_required`, dashboard storica `TECHNICAL_BLOCK`. Lo stato corretto da dichiarare è quindi **INCONSISTENT**, non “blocco dati”.

### Zeno Righetti

- 9 bozze registrate.
- Cinque tentativi tra il 17 e il 18 agosto risultano completati 10/10 anche con bozze precedenti presenti.
- Ultimo tentativo: bozza 442941, 5/19 pagine; APR aveva già identificato quella bozza e si è fermato su `screening:2`, dopo una sonda read-only inconcludente per timeout CDP.
- Anche qui checkpoint, report e dashboard storica non concordano; lo stato verificabile è **INCONSISTENT**.

Conclusione causale: le bozze accumulate sono un grave difetto di igiene e idempotenza del test, ma i due arresti specifici sono successivi all'associazione a una bozza univoca e dipendono dalla conferma di persistenza/timeout. Non c'è evidenza che il portale abbia scelto la bozza sbagliata o che l'accumulo abbia provocato quei due arresti.

## Piano di ripulitura proposto

1. Ottenere, dopo login SPID, un inventario ENEA live in sola lettura e riconciliare ogni ID con l'elenco sopra. Nessuna cancellazione finché l'inventario non è completo.
2. Per ogni pratica scegliere una bozza canonica: prima quella completa con verifica server finale; se nessuna è completa, quella con più pagine server-verificate e checkpoint più recente. Le altre diventano candidate alla cancellazione.
3. Generare un manifest immutabile di pulizia con `practiceId`, bozza da conservare, bozze candidate, stato/pagine e prove. Farlo approvare esplicitamente prima dell'azione distruttiva.
4. Eseguire la pulizia esclusivamente tramite APR, una pratica alla volta: cancellazione delle sole bozze TEST approvate, rilettura server e ricevuta di audit che confermi una sola bozza attiva. ENEA non offre una vera fusione: “consolidare” significa conservare una bozza canonica ed eliminare le altre.

## Prevenzione permanente proposta

- Eliminare per i prossimi test la policy `preserve_and_ignore_for_new_test_draft` e sostituirla con un registro canonico unico `practiceId + anno portale + ambiente` → `draftId`.
- Prima di creare: inventario read-only obbligatorio. Zero bozze → creazione ammessa; una bozza → ripresa della stessa; più bozze → `TEST_ENVIRONMENT_DIRTY`, nessuna nuova creazione e richiesta di riconciliazione.
- Persistenza dell'intento di creazione prima del click e associazione server dopo il click; se l'esito è incerto, mai creare una seconda bozza.
- Il bypass anti-doppione di test non deve più significare “crea sempre”: può ignorare la storia business, ma non il registro tecnico delle bozze ENEA già create.
- A fine coorte, produrre automaticamente il manifest di pulizia e impedire un nuovo replay della stessa pratica finché non esiste una sola bozza canonica o un'eccezione esplicita auditata.
- Dashboard: mostrare `activeDraftCount`, `canonicalDraftId`, età delle bozze e gate rosso se il conteggio supera uno.

Nessun test, nessuna compilazione e nessuna cancellazione sono stati eseguiti durante questa diagnosi.
