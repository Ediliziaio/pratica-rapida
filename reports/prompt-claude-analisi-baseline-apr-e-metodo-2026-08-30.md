# Prompt per Claude — revisione critica APR dopo baseline L5 30 × 3

Claude, agisci come project manager e revisore indipendente del progetto APR. Analizza criticamente i fatti verificati, le domande di Giuliano e le risposte fornite da Codex riportate qui sotto.

Non limitarti a confermare le conclusioni di Codex. Evidenzia:

1. conclusioni che condividi e conclusioni che contesti;
2. eventuali errori di ragionamento, metriche scorrette o cause non dimostrate;
3. responsabilità metodologiche e tecniche principali;
4. probabilità realistica di raggiungere il 90% e a quali condizioni;
5. piano operativo prioritario, con attività da interrompere, mantenere o introdurre;
6. divisione di responsabilità fra Giuliano, Claude, Codex, APR ed eventuale QA indipendente;
7. proposta concreta per uno scambio asincrono Claude–Codex che non richieda Giuliano come intermediario continuo;
8. punti nei quali l'autorità umana deve restare obbligatoria;
9. criteri quantitativi per decidere se continuare, restringere il perimetro o sostituire il livello browser;
10. rischi che Codex potrebbe avere sottovalutato.

Separa sempre:

- fatti verificati dalla baseline;
- valutazioni retrospettive;
- proposte ancora da validare;
- decisioni che spettano a Giuliano.

## A. Fatti verificati: baseline L5 strutturale 30 × 3

È stato eseguito lo stesso corpus di 30 pratiche per tre giri consecutivi con:

- stesso manifest;
- stesso sequencer;
- stesso bundle certificato;
- nessuna modifica o installazione fra i giri;
- sole bozze ENEA, senza anteprima, invio o comunicazioni.

Esiti aggregati:

| Indicatore | Giro 1 | Giro 2 | Giro 3 |
|---|---:|---:|---:|
| Processate | 30 | 30 | 30 |
| Bozze complete | 7 | 5 | 4 |
| Intervento operatore | 23 | 25 | 26 |
| Technical block nel report | 0 | 0 | 0 |

Confronto fra i tre giri:

- 24 pratiche hanno mantenuto lo stesso esito semantico;
- 6 pratiche hanno cambiato stato, numero di pagine o causa;
- soltanto 3 pratiche sono risultate complete in tutti e tre i giri: Daniela Guidotti, Emanuela Parolo e Armando Ranzoni;
- 8 pratiche sono riuscite almeno una volta, ma non tutte in modo ripetibile;
- criterio concordato: qualunque differenza rende la baseline non stabile;
- verdetto: **baseline L5 non stabile**.

### Matrice completa

| Pratica | Giro 1 | Giro 2 | Giro 3 | Identica |
|---|---|---|---|---|
| Barbara Melis | Operatore — preflight, 2 blocker | Uguale | Uguale | Sì |
| Cesare Imperiali | Operatore — preflight, 2 blocker | Uguale | Uguale | Sì |
| Mara Elena Maddiotto | Completa 16/16 | Generatore non persistito, 3/16 | CDP Promise collected, 1/16 | No |
| Claudio Beghini | Completa 8/8 | Completa 8/8 | CDP Promise collected, 0/8 | No |
| Besenval Fortunato | Operatore — preflight, 2 blocker | Uguale | Uguale | Sì |
| Kitenge Ebambi | Operatore — preflight, 2 blocker | Uguale | Uguale | Sì |
| Vera Buracchi | Operatore — preflight, 3 blocker | Uguale | Uguale | Sì |
| Sabrina Eustomi | Operatore — preflight, 2 blocker | Uguale | Uguale | Sì |
| Luca Callegari | Verifica campi ENEA fallita, 5/11 | Completa 11/11 | Timeout CDP, 1/11 | No |
| Eugenio Codognato | Operatore — preflight, 2 blocker | Uguale | Uguale | Sì |
| Gabriella Bruno | Completa 8/8 | Timeout CDP, 3/8 | Timeout CDP, 2/8 | No |
| Milena Albertoni | Salva non confermato, 5/8 | Uguale | Uguale | Sì |
| Milena Fiorini | Operatore — preflight, 1 blocker | Uguale | Uguale | Sì |
| Lucia Lagrasta | Salva non confermato, 5/11 | Uguale | Uguale | Sì |
| Giovanni Pescatori | Operatore — preflight, 3 blocker | Uguale | Uguale | Sì |
| Daniela Guidotti | Completa 8/8 | Completa 8/8 | Completa 8/8 | Sì |
| Zeno Righetti | Salva non confermato, 5/19 | Uguale | Uguale | Sì |
| Luca Cigognetti | Completa 14/14 | Gate Infissi non pronto, 0/0 | Completa 14/14 | No |
| Cristina Ricchi | Salva non confermato, 5/10 | Uguale | Generatore non persistito, 3/10 | No |
| Emanuela Parolo | Completa 8/8 | Completa 8/8 | Completa 8/8 | Sì |
| Roberto Marcello | Operatore — preflight, 2 blocker | Uguale | Uguale | Sì |
| Flavia Cipriani | Operatore — preflight, 2 blocker | Uguale | Uguale | Sì |
| Mario Donnarumma | Operatore — preflight, 3 blocker | Uguale | Uguale | Sì |
| Marco Colombo | Operatore — preflight, 2 blocker | Uguale | Uguale | Sì |
| Danila Serpa | Verifica comune di nascita fallita, 0/8 | Uguale | Uguale | Sì |
| Amelia Lerose | Salva non confermato, 5/10 | Uguale | Uguale | Sì |
| Caterina Claudia Garbato | Operatore — preflight, 4 blocker | Uguale | Uguale | Sì |
| Eleonora Meggiarin | Operatore — preflight, 2 blocker | Uguale | Uguale | Sì |
| Armando Ranzoni | Completa 10/10 | Completa 10/10 | Completa 10/10 | Sì |
| Francesco Fumagalli | Operatore — preflight, 1 blocker | Uguale | Uguale | Sì |

### Sei pratiche non ripetibili

1. Mara Elena Maddiotto: completa, poi mancata persistenza del Generatore, poi errore CDP.
2. Claudio Beghini: completa due volte, poi errore CDP.
3. Luca Callegari: verifica campi fallita, poi completa, poi timeout CDP.
4. Gabriella Bruno: completa, poi due timeout CDP in pagine diverse.
5. Luca Cigognetti: completa, poi gate Infissi non pronto, poi completa.
6. Cristina Ricchi: due salvataggi screening non confermati, poi mancata persistenza del Generatore.

### Blocco comune fra giro 2 e giro 3

Fatti temporali:

- ultima verifica autenticata: 15:03:17Z;
- worker giro 2 spento: 15:03:21Z;
- giro 2 concluso: 15:03:49Z;
- giro 3 avviato: 15:12:49Z;
- `login_required` rilevato: 15:14:30Z.

Causa provata: circa undici minuti senza keepalive, perché l'isolamento spegne le coorti e non esiste un custode ENEA indipendente durante l'attesa fra i giri. Non era un blocco specifico di Mara. Dopo il nuovo SPID il terzo giro ha processato tutte le 30 pratiche.

## B. Domanda di Giuliano: come valutare un mese di lavoro con 3 successi ripetibili su 30?

### Risposta di Codex

Valutazione dichiarata: risultato operativo insufficiente. Le 3 pratiche rappresentano il 10% del corpus completo e sono le sole positive in tutti i replay; 8 hanno completato almeno una volta. Il lavoro non è inutile perché ha prodotto audit, sicurezza, gate e una baseline attendibile, ma APR non è ancora pronto all'uso autonomo. Codex ha giudicato insoddisfacente il rapporto fra tempo investito e valore operativo consegnato e ha proposto di fermare l'espansione per concentrarsi sulla stabilità L5.

## C. Domanda: quali errori hanno impedito di raggiungere il target del 90%?

### Risposta di Codex, sintetizzata integralmente

Codex ha individuato queste mancanze:

1. affidabilità reale misurata troppo tardi; test precedenti eseguiti con versioni diverse;
2. confusione fra accuratezza del preflight, successo tecnico L5 e ripetibilità;
3. architettura browser iniziale con più worker, watchdog e keepalive sulla stessa sessione;
4. lock talvolta limitato al singolo tick anziché all'intera pratica;
5. timeout gestiti senza cancellazione reale dell'esecuzione rimasta nel browser;
6. limite generico di cinque secondi applicato a operazioni legittimamente più lunghe;
7. verità finale scritta da percorsi diversi anziché da un finalizzatore unico;
8. policy “isola o ferma” duplicata e quindi aggirabile da errori nuovi;
9. keepalive legato al worker della coorte anziché a un custode indipendente;
10. correzioni dei sintomi prima di raggrupparli per famiglia causale;
11. eccessivo cambiamento del livello L5: 37 commit in 11 giorni;
12. disallineamenti temporanei fra sorgente, build, bundle installato e processi;
13. routing Infissi/Schermature replicato e incoerente;
14. contratti dati inizialmente permissivi: null, falsi zero, unità, righe perse, IVA e fallback;
15. osservabilità introdotta tardi, senza payload completo e stato prima/dopo;
16. contratto di salvataggio troppo debole: click o risposta non equivalgono a persistenza riletta;
17. campioni inizialmente troppo semplici e non sempre rappresentativi;
18. lotti aumentati prima di avere una canary ripetibile;
19. assenza di un simulatore fedele per DOM lento, salvataggi tardivi e cadute CDP;
20. diagnosi iniziali talvolta troppo rapide o non provate;
21. regole permanenti ripetute più volte dall'utente perché non trasformate subito in vincoli eseguibili;
22. priorità data al numero di correzioni e all'espansione invece che alla stabilità verticale completa.

Conclusione di Codex: il 90% non è stato mancato principalmente per carenza di regole documentali, ma per la mancata stabilizzazione precoce del livello browser, della sessione, della persistenza e della verità finale.

## D. Domanda: cosa fare per raggiungere il 90% e come organizzare il progetto?

### Risposta di Codex

Proposta organizzativa:

- definire separatamente accuratezza preflight, successo tecnico e ripetibilità;
- considerare completata una pratica solo con pagine salvate, rilettura dal portale e concordanza delle fonti di stato;
- congelare nuove funzioni e nuove slice;
- dividere il sistema in quattro aree: browser/sessione, orchestrazione/verità, dati/regole, QA indipendente;
- Giuliano come product owner e autorità di business;
- Claude come project manager, custode del piano e revisore dei requisiti;
- Codex come tech lead e implementatore principale;
- eventuale terza AI come QA ostile, senza autorità operativa;
- un solo soggetto modifica L5 in una determinata finestra;
- costruire un simulatore locale dei comportamenti ENEA problematici;
- trattare ogni pratica come transazione con lock, salvataggio, rilettura, checkpoint e finalizzazione;
- introdurre una sola macchina a stati autorevole;
- separare session keeper e worker;
- dare a ogni comando CDP timeout specifico, abort, cancellazione e tracciamento;
- considerare una pagina salvata solo dopo rilettura dei dati persistiti;
- correggere per famiglie: CDP, Generatore, Infissi, screening, keepalive;
- usare la gerarchia unit test → simulatore → canary mirata → 30×3 → campione 100;
- avanzare tramite gate quantitativi;
- congelare ogni versione dopo un ciclo di lavoro;
- usare un registro unico di difetti e decisioni.

Target proposti:

- simulatore verde per cento ripetizioni;
- sei pratiche instabili ripetute cinque volte senza variazioni;
- almeno 27/30 positive e ripetibili;
- poi almeno 90/100 su campione rappresentativo;
- infine esecuzione non assistita prolungata.

## E. Domanda: Claude e Codex dovrebbero comunicare senza usare Giuliano come intermediario continuo?

### Risposta di Codex

Codex ha risposto sì, proponendo autonomia tecnica delimitata e autorità finale umana.

Metodo suggerito:

- repository come memoria condivisa;
- pacchetto di lavoro preparato da Claude con problema, scope, prove e criteri;
- diagnosi, diff, test e certificato prodotti da Codex;
- revisione Claude con `APPROVED`, `CHANGES_REQUIRED` o `BLOCKED_REQUIRES_GIULIANO`;
- massimo due o tre cicli automatici prima dell'escalation;
- cartelle persistenti per backlog, attività, review, approvazioni, blocchi ed evidenze;
- lavoro autonomo consentito per letture, sviluppo locale, simulatori, test, bundle non installati e report;
- intervento umano obbligatorio per regole di business, nuovi insiemi ENEA, credenziali, azioni esterne, bypass, espansione scope e accettazione dei rischi;
- nessuna modifica concorrente degli stessi file da parte delle due AI.

Limite riconosciuto: Codex non dispone automaticamente di un canale verso un'istanza esterna di Claude. Occorre predisporre accesso condiviso al repository, API/connettore oppure orchestratore.

## F. Domanda: suggerimenti ulteriori oltre alle richieste dirette

### Risposta di Codex

Proposte aggiuntive:

1. verificare se alcune operazioni possano usare in modo legittimo e sicuro gli endpoint strutturati già usati dal portale, anziché il DOM;
2. confrontare sperimentalmente CDP grezzo e Playwright prima di decidere se riscrivere L5;
3. certificare inizialmente un perimetro più ristretto ma affidabile;
4. introdurre un budget di complessità per ogni nuova funzione;
5. fissare una data di decisione per continuare, restringere, sostituire o sospendere;
6. usare target intermedi 15/30, 21/30 e 27/30;
7. richiedere una revisione tecnica umana indipendente su concorrenza e persistenza;
8. progettare un'interfaccia efficace per `OPERATOR_REQUIRED`;
9. misurare anche tempo risparmiato e costo degli interventi;
10. separare affidabilità e correttezza campo per campo;
11. creare un gold standard umano congelato;
12. proteggere payload e dati personali usati nei replay;
13. verificare formalmente condizioni d'uso e responsabilità sul portale;
14. mantenere un registro dei rischi;
15. predisporre backup e disaster recovery;
16. mostrare sempre commit, bundle, manifest e processo autorevole nella dashboard;
17. dopo due patch fallite della stessa famiglia imporre revisione architetturale;
18. usare l'autonomia notturna per sviluppo e test locali, non per mutazioni incontrollate del runtime.

## G. Domanda: si può costruire un sistema nel quale Giuliano insegna i casi non coperti e Claude/Codex li trasformano in regole APR?

### Risposta di Codex

Codex considera questo il modello più adatto, purché la risposta umana non venga usata direttamente come istruzione libera dal runtime.

Flusso proposto:

1. APR isola la pratica in `OPERATOR_REQUIRED`, rilascia il lock e prosegue con la coda.
2. APR produce un pacchetto con documento, valori, conflitti, regole tentate e domanda precisa.
3. Claude trasforma il problema tecnico in una domanda comprensibile per Giuliano.
4. Giuliano descrive cosa farebbe un operatore e dichiara se vale in generale o solo per il caso.
5. Claude formalizza fonti, precedenza, condizione, esito e casi limite.
6. Codex implementa una regola generale, con ID, audit e test.
7. Claude revisiona indipendentemente la corrispondenza con la decisione umana.
8. Gate monotono, certificazione e installazione autorizzata.
9. APR riprende la pratica dallo stesso checkpoint e verifica le tre fonti di verità.

Ciclo di vita suggerito per le regole:

`OBSERVED → HUMAN_INPUT_REQUIRED → HUMAN_DECISION_RECORDED → SPECIFIED_BY_CLAUDE → IMPLEMENTED_BY_CODEX → INDEPENDENTLY_REVIEWED → TESTED → CERTIFIED → ACTIVE`

Con possibili uscite `REJECTED` e `CASE_OVERRIDE_ONLY`.

Il runtime APR dovrebbe applicare esclusivamente regole deterministiche certificate; Claude e Codex aiutano a costruirle, ma non decidono liberamente cosa scrivere sul portale durante l'esecuzione.

## H. Domande finali per la tua revisione

Fornisci ora un rapporto con questa struttura:

1. **Verdetto indipendente sul mese di lavoro.**
2. **Interpretazione corretta dei numeri 3/30, 4/30, 8/30 e 24/30.**
3. **Cinque cause principali ordinate per impatto e forza delle prove.**
4. **Cosa Codex ha diagnosticato correttamente.**
5. **Cosa Codex potrebbe avere diagnosticato male o con eccessiva sicurezza.**
6. **Piano per arrivare al 90%, con ordine e criteri di stop.**
7. **Valutazione: continuare con CDP, provare Playwright o studiare gli endpoint del portale.**
8. **Organizzazione Claude–Codex–Giuliano–APR.**
9. **Progetto minimo dell'orchestratore di collaborazione fra le due AI.**
10. **Decisioni che chiedi ora a Giuliano.**

Non proporre un nuovo grande programma architetturale senza indicare quale problema verificato risolve e quale metrica dovrebbe migliorare. Se ritieni irrealistico raggiungere il 90% nei tempi disponibili, dichiaralo esplicitamente e proponi un perimetro alternativo misurabile.
