# APR — modello operativo Shadow multi-prodotto

Stato: **pre-shadow, non produzione**.

## Obiettivo

Portare APR a una modalità OMBRA operativa capace di osservare e preparare le pratiche senza modificare il CRM di produzione e senza salvare o inviare dati sul portale ENEA.

Il gate operativo resta esplicito: fino alla comunicazione **“APR operativo ombra”**, APR non va considerato abilitato all'uso operativo. Anche dopo quel gate, la modalità resta shadow: nessun invio ufficiale senza autorizzazione separata.

## Principio di lavoro

La priorità è massimizzare la capacità produttiva senza aumentare il rischio. Il lavoro procede quindi per decisioni reversibili e misurabili:

1. acquisire il corpus reale in sola lettura;
2. separare dati comuni e dati specifici del prodotto;
3. costruire parser/mapping specifici su pratiche storiche concluse;
4. rendere ogni campo non dimostrato fail-closed;
5. confrontare in shadow APR con l'esito umano/ENEA;
6. trasformare ogni blocco o rigetto osservato in una regressione ripetibile.

## Matrice prodotti

| Prodotto | Stato APR | Shadow end-to-end | Workflow ufficiale |
| --- | --- | --- | --- |
| Schermature solari | sufficientemente validate per la fase shadow | sì, sotto gate globale | no |
| Infissi / serramenti | intake-only | non ancora | no |
| Impianto termico / pompe di calore | intake-only | non ancora | no |
| Insufflaggio | intake-only | non ancora | no |
| Etichetta prodotto sconosciuta | classificazione manuale | no | no |

“Intake-only” significa che APR può censire in sola lettura quante pratiche e quanti documenti reali sono disponibili per costruire il prodotto successivo, ma non deve riusare regole delle schermature né generare workflow ENEA specifici.

## Scelta del prossimo prodotto

Non fissare l'ordine per intuizione. Prima misurare per ciascun prodotto:

- pratiche totali disponibili;
- pratiche attive già complete lato cliente;
- pratiche storiche con PDF ENEA conclusivo;
- pratiche con almeno una fattura disponibile;
- percentuale di etichette prodotto non classificabili.

Il prodotto successivo è quello con la migliore combinazione di volume, disponibilità di ground truth storica e riuso dei moduli comuni. A parità di valore, preferire la decisione più reversibile e con il minor numero di campi ENEA non ancora osservati.

## Architettura di leva

I blocchi comuni già consolidati — beneficiario, immobile, intervento, impianto esistente, validazione operatore e difese numeriche — devono restare condivisi. Parser, mapping tecnico e contratto portale specifici vanno invece separati per prodotto.

Non duplicare il mapper schermature per creare tre copie divergenti. La direzione è:

- **core comune**: anagrafica, immobile, intervento, impianto, documenti, gate generali;
- **adapter prodotto**: infissi, schermature, impianto termico, insufflaggio;
- **parser documentale prodotto**: estrae soltanto campi dimostrabili;
- **audit storico prodotto**: confronto con PDF ENEA conclusivi;
- **capability gate**: impedisce a un prodotto incompleto di produrre workflow ufficiali.

## Feedback loop 2–3 mesi

Per ogni pratica che APR blocca o che, nel confronto umano, risulta errata:

1. classificare il motivo con un codice stabile;
2. verificare se il blocco è corretto, falso positivo o regola mancante;
3. aggiungere una fixture anonimizzata minima;
4. aggiungere prima il test che riproduce il caso;
5. correggere parser/mapping/gate;
6. rieseguire l'intera suite;
7. misurare se il motivo ricompare.

La revisione quotidiana dell'operatore è parte del sistema di apprendimento, non un'eccezione temporanea.

### Gate delle nuove regole

Un blocker candidato alla correzione non viene promosso soltanto perché il suo false-block rate è alto. Prima di considerare valida la nuova regola bisogna eseguire un replay sullo **stesso corpus già revisionato** e dimostrare che:

- tutti i false-block attribuiti al blocker target vengono rimossi;
- i casi in cui lo stesso blocker era corretto restano bloccati dallo stesso motivo;
- una pratica prima corretta non diventa errata;
- i blocker non correlati al target non cambiano;
- una correzione nata per ridurre un false-block non introduce il blocker target su casi che prima non avevano evidenza blocker-specifica.

Nei casi multi-causa una pratica può restare complessivamente bloccata per un altro falso blocker: la correzione del target è comunque valida se rimuove esclusivamente la causa attribuita e lascia invariato tutto il resto. Questo consente fix piccoli, reversibili e misurabili invece di accorpare più correzioni nello stesso commit.

## KPI Shadow

KPI principali **per prodotto**; l'aggregato complessivo è utile per capacità e copertura, ma non deve nascondere la qualità di un singolo adapter:

- **coverage** = pratiche shadow valutabili / pratiche entrate nel perimetro;
- **auto-map rate** = campi pronti senza intervento / campi richiesti;
- **blocker rate** = pratiche bloccate / pratiche valutate;
- **false-block rate** = blocchi che l'operatore giudica non necessari / blocchi totali;
- **escaped-error rate** = pratiche dichiarate ready da APR ma giudicate errate dall'operatore / pratiche dichiarate ready da APR;
- **historical match rate** = audit storici match / audit completabili;
- **median preparation time** = tempo umano necessario per portare una pratica da intake a pacchetto shadow completo;
- **unknown-product rate** = etichette prodotto non classificabili / pratiche censite.

Guardrail: l'escaped-error rate deve tendere a zero ed è condizionato alle pratiche dichiarate ready, non a tutte le pratiche valutate. In questo modo APR non può migliorare artificialmente il KPI semplicemente bloccando più pratiche. Se cresce, si aumenta il fail-closed; non si riducono i blocker per migliorare artificialmente la coverage.

## Gate

### Gate 1 — APR operativo ombra

Può essere dichiarato soltanto dall'utente. Prima di quel momento il sistema resta pre-shadow anche se le schermature sono tecnicamente mature.

### Gate 2 — prodotto aggiuntivo shadow end-to-end

Per infissi, impianto termico o insufflaggio servono almeno:

- parser specifico con fixture reali;
- mapping specifico separato dalle schermature;
- PDF ENEA conclusivi usati come ground truth quando disponibili;
- nessun campo non osservato trasformato in default;
- suite regressiva verde;
- capability gate che impedisce workflow ufficiali prematuri.

### Invio ufficiale

Fuori perimetro. Nessun prodotto, comprese le schermature, è autorizzato a salvare o inviare pratiche sul portale ENEA senza autorizzazione esplicita separata.