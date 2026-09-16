# Progetto Revenue Operations — Marketing, Lead, Pratiche e Cassa

**Stato:** impianto approvato; decisioni operative registrate in `docs/REVOPS_DECISIONI_TITOLARE.md`  
**Data:** 31 agosto 2026  
**Regola di governo:** `docs/CABINA_DI_REGIA.md`, versione 1.0  
**Responsabile unico proposto:** Responsabile Revenue Operations AI  
**Livello iniziale proposto:** Livello 1 — modalità ombra

## 1. Risultato atteso

Trasformare il marketing da spesa mensile poco verificata a sistema governato che collega, per ogni euro e per ogni contatto:

1. disponibilità di cassa;
2. budget autorizzato;
3. campagna, canale e messaggio;
4. lead generato;
5. strategia di contatto;
6. attività e comunicazioni svolte;
7. prima pratica;
8. pratiche successive;
9. incassi e margine;
10. consolidamento del cliente oppure sollecito motivato.

Il sistema non considera concluso il lavoro al primo acquisto. Il risultato commerciale è un cliente che raggiunge **5 pratiche entro 2 mesi dalla prima pratica arrivata**, secondo la decisione D1 del Titolare.

## 2. Scelta progettuale

Non costruire un reparto social separato e non acquistare subito un nuovo CRM.

Costruire sopra l'applicazione esistente un sistema unico di **Revenue Operations**, nel quale marketing, vendita, onboarding, utilizzo del servizio e incasso condividono lo stesso dato cliente e lo stesso percorso.

La scelta deriva da quattro principi:

- il modello Bowtie di Winning by Design estende il percorso oltre la vendita e collega acquisizione, attivazione, mantenimento ed espansione;
- il modello quantitativo associato a Mark Roberge tratta la crescita commerciale come processo misurabile e migliorabile, non come somma di impressioni;
- il Customer Lifecycle Management collega acquisizione, valore del cliente e costo di acquisizione;
- la Cabina di Regia richiede responsabile unico, indicatori anticipatori, controllo per eccezione, prove e autorizzazioni.

## 3. Base già presente nel progetto

Il progetto contiene già componenti riutilizzabili:

- tabella `leads` con origine, fase e primo contatto;
- pipeline visuale in `AziendePipeline`;
- tabella `companies`, che rappresenta aziende e rivenditori;
- tabella `enea_practices`, collegata all'azienda/rivenditore;
- prezzo, stato del pagamento e data di incasso sulle pratiche;
- registro delle comunicazioni email, WhatsApp, SMS e telefono;
- solleciti, calendario chiamate e automazioni;
- dashboard operativa delle pratiche e ponte verso il cruscotto economico separato.

La verifica tecnica ha inoltre accertato che `pratiche` ed `enea_practices` hanno ancora percorsi di creazione attivi distinti. I conteggi Revenue Operations dovranno quindi usare una vista canonica deduplicata, come definito in `docs/REVOPS_PROGETTAZIONE_TECNICA.md`.

Il limite attuale è strutturale: il record del lead non conserva ancora campagna, costo attribuito, responsabile, strategia, prossima azione, esito dettagliato e collegamento esplicito all'azienda che nasce dal lead. Di conseguenza non è ancora possibile ricostruire in modo affidabile il percorso completo dalla spesa alle pratiche e agli incassi.

## 4. Modello del ciclo cliente

Il CRM dovrà usare fasi con criteri di entrata e uscita verificabili.

| Fase | Significato | Prova minima di avanzamento |
|---|---|---|
| Acquisito | Il contatto è entrato nel sistema | fonte, campagna o origine registrata |
| Da qualificare | Mancano informazioni per valutarlo | attività di qualificazione assegnata |
| Qualificato | Esiste una possibile corrispondenza commerciale | bisogno, tipo di azienda e potenziale documentati |
| Strategia pronta | È stato scelto come approcciare il lead | strategia, canale, messaggio e responsabile |
| In contatto | È iniziata la relazione | comunicazione o chiamata registrata |
| Opportunità | Il lead manifesta interesse concreto | prossimo passo concordato e datato |
| Onboarding | Il soggetto sta diventando operativo | azienda collegata e attività di avvio aperte |
| Prima pratica | È stata presentata almeno una pratica valida | pratica collegata nel gestionale |
| In attivazione | Ha generato pratiche, ma non ha raggiunto la soglia | conteggio pratiche inferiore alla soglia |
| Cliente consolidato | Ha raggiunto 5 pratiche entro 2 mesi dalla prima | quinta pratica valida nella finestra approvata |
| Da sollecitare | Non avanza o non raggiunge la soglia | motivo, ultima interazione e prossima azione |
| Perso / non idoneo | Non deve essere ulteriormente lavorato | motivo codificato e prova |

La fase non deve essere spostata soltanto manualmente: quando possibile deve derivare da eventi reali, per esempio creazione dell'azienda, prima pratica o raggiungimento della soglia.

## 5. Dato centrale

Il sistema deve mantenere una catena di attribuzione verificabile:

`spesa -> campagna -> lead -> azienda -> pratiche -> fatturato -> incassato -> margine`

Ogni lead dovrà avere almeno:

- origine e canale;
- campagna e contenuto, quando disponibili;
- data e costo attribuibile;
- consenso e base del contatto, dove necessari;
- data di attivazione commerciale, quando il rivenditore accetta il servizio e inizia l'onboarding;
- responsabile unico;
- segmento e bisogno;
- valutazione motivata, non soltanto un punteggio;
- strategia di approccio;
- prossima azione con data;
- storico delle interazioni;
- esito e motivo dell'esito;
- azienda collegata dopo la conversione;
- conteggio delle pratiche valide;
- ricavi, incassi e margine collegati;
- stato di attivazione o sollecito.

## 6. Strategia per singolo lead

Il Responsabile Revenue Operations AI prepara una scheda prima dell'azione:

1. **Problema o opportunità:** perché il lead potrebbe avere bisogno del servizio.
2. **Dati disponibili:** fonte, settore, dimensione, territorio, comportamento e interazioni.
3. **Dati mancanti:** ciò che occorre scoprire senza inventare.
4. **Valore potenziale:** stimato con ipotesi dichiarate e dati storici disponibili.
5. **Approccio:** messaggio, canale e obiettivo del contatto.
6. **Prossimo passo:** azione concreta, responsabile e data.
7. **Criterio di successo:** risposta o evento atteso.
8. **Controllo:** verifica dell'esito e decisione successiva.

Il sistema non deve produrre solleciti indistinti. Il contenuto e la frequenza dipendono dalla fase, dall'ultima interazione, dal bisogno e dalle autorizzazioni registrate.

## 7. Governo del budget e della cassa

Il budget marketing non deve essere una cifra rinnovata automaticamente perché spesa nel mese precedente.

Il modello completo prevede che il Titolare autorizzi:

- disponibilità massima del periodo;
- categorie e canali ammessi;
- limiti per singolo esperimento o campagna;
- criteri per continuare, correggere o interrompere;
- soglia oltre la quale è necessaria una nuova decisione.

Per la prima tranche, secondo D10, vengono registrati soltanto budget autorizzato, impegnato e speso. Le altre dimensioni saranno introdotte successivamente; fino ad allora ogni proposta o riallocazione di spesa richiede l'approvazione del Titolare e l'AI non applica soglie economiche implicite.

La Cabina produce, prima di proporre nuova spesa:

- cassa disponibile e impegni già assunti;
- spesa marketing autorizzata, impegnata e sostenuta;
- costo per lead per fonte;
- costo per lead qualificato;
- costo per prima pratica;
- costo per cliente consolidato;
- ricavi, incassi e margine attribuiti;
- tempo necessario per recuperare la spesa;
- qualità e completezza dei dati.

Le formule operative saranno:

- `CPL = spesa attribuita / lead validi`;
- `CPQL = spesa attribuita / lead qualificati`;
- `CAC prima pratica = spesa attribuita / aziende con prima pratica`;
- `CAC consolidato = spesa attribuita / aziende che raggiungono la soglia`;
- `conversione fase = uscite positive dalla fase / ingressi nella fase`;
- `tempo di attivazione = data soglia - data acquisizione lead`;
- `valore cliente = ricavi o margine delle pratiche attribuite nel periodo`;
- `recupero spesa = tempo necessario affinché il margine cumulato copra il CAC`.

Nessun valore soglia economico viene introdotto senza approvazione del Titolare.

## 8. Indicatori

### Indicatori di risultato

- clienti consolidati;
- pratiche per cliente acquisito;
- margine e incassi dei clienti acquisiti;
- costo per cliente consolidato;
- tempo medio di attivazione;
- quota di lead diventati clienti consolidati;
- ritorno per campagna e canale.

### Indicatori anticipatori

- lead senza responsabile;
- lead senza prossima azione;
- tempo al primo contatto;
- lead fermi oltre la regola approvata;
- percentuale di lead con origine/campagna riconoscibile;
- percentuale di attività completate;
- passaggi fra fasi;
- aziende ferme fra prima pratica e soglia;
- campagne con dati insufficienti;
- spesa impegnata rispetto alla disponibilità autorizzata.

## 9. Ruoli

### Titolare

Approva budget, soglie, comunicazioni con effetti esterni non già autorizzate, definizione di cliente consolidato e aumento dell'autonomia.

### CEO AI

Risolve conflitti fra cassa, marketing, operazioni e priorità; riceve le eccezioni e riferisce al Titolare.

### Responsabile Revenue Operations AI

È responsabile del percorso completo, non del numero di post o di lead. Coordina marketing, contatto commerciale, onboarding e riattivazione.

### Esecutore marketing

Prepara campagne, contenuti, segmenti e analisi entro brief e budget autorizzati.

### Esecutore commerciale

Esegue o prepara contatti e attività assegnate, registrandone l'esito.

### Controllore

Verifica attribuzione, avanzamenti, comunicazioni, conteggio delle pratiche e risultati economici. Non modifica di nascosto i dati controllati.

## 10. Autonomia iniziale

In modalità ombra il sistema può:

- leggere dati esistenti;
- ricostruire il percorso dei lead;
- segnalare dati mancanti e lead fermi;
- preparare strategie e comunicazioni;
- proporre riallocazioni di budget;
- simulare classificazioni e prossime azioni;
- produrre il rapporto al Titolare.

Non può, senza autorizzazione:

- pubblicare sui social;
- inviare comunicazioni commerciali;
- impegnare budget;
- cambiare soglie economiche o di attivazione;
- cancellare lead o modificare dati non recuperabili;
- introdurre nuovi usi di dati personali.

## 11. Realizzazione progressiva

### Fase 0 — Baseline verificata

- partire dal 31 agosto 2026 con tracciamento pulito di lead e spesa;
- importare in seguito lo storico disponibile come dato ricostruito;
- collegare, quando dimostrabile, lead, aziende e pratiche;
- misurare la qualità dei dati dei mesi precedenti;
- separare dato certo, dato ricostruito e dato mancante.

### Fase 1 — Fondazione Revenue Operations

- estendere il modello lead;
- introdurre campagne, costi, attività, responsabili ed esiti;
- creare il legame lead–azienda;
- calcolare automaticamente le pratiche dell'azienda;
- introdurre il registro delle decisioni e dei controlli.

### Fase 2 — Cruscotto operativo

- vista cassa e budget;
- vista campagne e attribuzione;
- coda quotidiana dei lead;
- clienti in attivazione;
- clienti da sollecitare;
- eccezioni e decisioni richieste.

### Fase 3 — Modalità ombra AI

- strategia suggerita per lead;
- bozze di contatto;
- rilevazione automatica di stalli;
- rapporto periodico;
- confronto fra decisione AI ed esito umano.

### Fase 4 — Autonomia controllata

Soltanto per categorie, modelli, soglie e canali autorizzati per iscritto dal Titolare, dopo verifica dei risultati della modalità ombra.

## 12. Decisioni e punti tecnici residui

Le decisioni D1-D8 sono state registrate in `docs/REVOPS_DECISIONI_TITOLARE.md` e non sono più aperte.

Restano da definire prima delle migrazioni:

1. il contratto tecnico di lettura della disponibilità di cassa dal cruscotto online separato;
2. la normalizzazione del percorso legacy che può creare bozze in `pratiche`.

L'evento precedente alla prima pratica è stato approvato: i solleciti decorrono da `commercial_activated_at`, registrato quando il rivenditore accetta concretamente il servizio e inizia l'onboarding.

Questi punti e le relative conseguenze sono descritti in `docs/REVOPS_PROGETTAZIONE_TECNICA.md`.

## 13. Criteri di completamento della prima versione

La prima versione non è completata perché mostra una nuova dashboard. È completata quando, per un campione reale di lead, permette di dimostrare:

- da dove è arrivato ciascun lead;
- quanto è costato o perché il costo non è attribuibile;
- chi ne è responsabile;
- quale strategia è stata scelta;
- quali azioni sono state svolte;
- quale azienda ne è derivata;
- quante pratiche ha prodotto;
- quanto è stato fatturato e incassato;
- se è consolidato, da sollecitare o perso;
- quale decisione è richiesta e sulla base di quali prove.
