# Progetto 400 — Piano operativo Grove + Bezos

Stato: laboratorio / preparazione. Nessuna campagna, prezzo, migration o contatto automatico viene attivato da questo documento.

## North Star

Portare PraticaRapida a **400 pratiche ENEA/mese** in modo sostenibile.

La metrica non va ottenuta aumentando indiscriminatamente i lead: il collo di bottiglia da misurare e migliorare è la trasformazione **lead → prima pratica → seconda pratica → quinta pratica**, perché la quinta pratica è il proxy operativo di cliente realmente acquisito/abituale.

Formula di lavoro:

`pratiche mensili = base clienti ricorrenti + riattivazione + nuove coorti convertite`

Il modello numerico è implementato in `project400Model.ts`; tassi e volumi devono arrivare da dati osservati, non da percentuali fissate nel codice.

## 1. Funnel obbligatorio

Misurare per coorte e canale:

1. lead contattabile;
2. prima pratica;
3. seconda pratica;
4. quinta pratica;
5. pratiche/mese dopo il raggiungimento della quinta pratica.

KPI minimi:

- lead → prima pratica;
- prima → seconda pratica;
- seconda → quinta pratica;
- lead → quinta pratica;
- giorni mediani lead → prima;
- giorni mediani prima → seconda;
- giorni mediani seconda → quinta;
- pratiche medie/mese dei clienti che hanno raggiunto la quinta;
- tasso di clienti che si fermano a 0, 1 e 2–4 pratiche;
- contributo mensile per canale/coorte;
- costo per cliente arrivato alla quinta pratica, quando esiste un costo attribuibile.

Regola: nessun denominatore viene nascosto. Se la provenienza o l'identità non sono affidabili, la metrica resta `unknown`, non viene stimata.

## 2. Working backwards da 400

Input da aggiornare a ogni ciclo di pianificazione:

- pratiche/mese attuali;
- gap verso 400;
- pratiche medie/mese prodotte da un cliente che ha raggiunto la quinta pratica;
- conversioni osservate lead→prima, prima→seconda, seconda→quinta.

Output:

- nuovi clienti alla quinta pratica necessari;
- seconde pratiche necessarie;
- prime pratiche necessarie;
- lead necessari;
- quota del gap coperta da ciascun canale;
- gap residuo ancora senza sorgente.

Se il portafoglio di canali non copre il gap, il sistema deve mostrare il gap residuo: non deve gonfiare le conversioni per far tornare il piano.

## 3. Identità lead → azienda: prerequisito della truth commerciale

La tabella `leads` non contiene un `company_id`. Senza riconciliare lead e aziende non è possibile misurare in modo affidabile il percorso lead → quinta pratica.

`project400Identity.ts` applica quindi una risoluzione fail-closed:

- email esatta normalizzata: evidenza forte;
- telefono esatto normalizzato: evidenza forte;
- sola equivalenza numero nazionale / +39: **revisione**, mai merge automatico;
- email o telefono che indicano aziende diverse: `ambiguous`;
- duplicati: `ambiguous`;
- nessuna evidenza: `unmatched`.

Prima di usare il funnel per decisioni economiche bisogna rendere visibili almeno quattro bucket: `matched`, `needs_review`, `ambiguous`, `unmatched`.

## 4. Database storico del vecchio CRM (~600 contatti)

Questa audience è **warm legacy**, non fredda: aveva già risposto a lead e ha già ricevuto messaggi/video. Di conseguenza è vietato trattarla come una nuova lista da bombardare con lo stesso messaggio.

Segmentazione minima prima di qualunque contatto:

- nessuna pratica attribuita;
- una pratica;
- 2–4 pratiche;
- ≥5 pratiche / cliente già attivo: escluso dalla normale riattivazione;
- identità ambigua/non riconciliata: solo revisione dati.

Motion predefinita del modello: `segmented-reactivation`.

Principio working backwards dal cliente: ogni nuovo contatto deve avere un **motivo nuovo e utile per rispondere**, non essere il replay di video o messaggi già inviati. Le leve possono essere testate solo quando realmente disponibili e autorizzate, per esempio accompagnamento guidato alla pratica, rimozione di un attrito emerso, oppure una novità reale di prodotto/processo. APR o FatturaRapida non possono essere promessi come capacità attive prima dei rispettivi gate espliciti.

L'esecuzione deve partire per piccoli lotti umanamente revisionabili, con misura di risposta e avanzamento di funnel prima di ampliare il segmento. Nessun mass blast è parte del piano.

## 5. Canali in ordine di leva e costo-opportunità

Ordine iniziale di lavoro, da cambiare solo se i dati dimostrano un collo di bottiglia diverso:

1. **clienti esistenti a 1–4 pratiche** — distanza minore dalla quinta;
2. **warm legacy del vecchio CRM** — costo di acquisizione già in parte sostenuto, ma rischio di fatigue;
3. **clienti inattivi / in calo** — retention recovery, senza confonderli con nuovi lead;
4. **referral / passaparola da clienti sani**;
5. **inbound corrente** — ottimizzare conversione prima di aumentare traffico;
6. **nuova acquisizione a pagamento** — scalare solo dopo aver misurato il costo per quinta pratica.

Regola Grove: se il collo di bottiglia è conversione iniziale, comprare più lead prima di sistemare il funnel ha basso leverage e alto costo-opportunità.

## 6. Esperimenti di conversione e pricing

Tutti gli esperimenti devono essere reversibili, per coorte e con una sola variabile primaria alla volta.

Possibili ipotesi da valutare, non attivate automaticamente:

- accompagnamento guidato alla prima pratica;
- follow-up specifico tra prima e seconda pratica;
- incentivo collegato alla progressione verso la seconda/quinta pratica anziché sconto indiscriminato sul primo contatto;
- test di prezzo per coorte usando la capacità già esistente di prezzo per azienda, senza modificare il listino globale;
- bundle/credito solo se il margine e il comportamento di ritorno lo giustificano.

Per ogni test: gruppo/coorte, ipotesi, durata, conversione attesa, conversione osservata, margine, costo per cliente alla quinta, criterio di stop.

## 7. Budget

Non fissare un budget advertising assoluto prima di conoscere il valore economico della quinta pratica.

Budget massimo per acquisizione:

`CAC5 massimo = margine di contribuzione atteso nel periodo di payback × quota massima reinvestibile`

Per ogni canale pagato misurare:

- spesa;
- lead attribuiti;
- prime, seconde e quinte pratiche;
- CAC prima pratica;
- **CAC quinta pratica (CAC5)**;
- costo per pratica mensile incrementale prodotta dalla coorte;
- payback.

Finché margine e CAC5 non sono misurati, la decisione corretta è raccogliere dati, non aumentare il budget.

## 8. Cronoprogramma per output, non per attività

### Output A — Truth set commerciale

- identità lead→azienda riconciliata con bucket espliciti;
- baseline funnel per fonte/coorte;
- baseline pratiche/mese e gap verso 400;
- clienti 0 / 1 / 2–4 / ≥5 pratiche segmentati.

Gate: nessuna campagna prima che i numeri possano essere attribuiti senza merge arbitrari.

### Output B — Riattivazione misurabile

- vecchio CRM importato/classificato come `warm_legacy`;
- segmenti distinti per storia pratica;
- primi piccoli lotti revisionati umanamente;
- tasso risposta → prima → seconda → quinta misurato.

Gate: ampliare soltanto il segmento/messaggio che dimostra avanzamento reale nel funnel.

### Output C — Conversion engine

- Supervisor evidenzia il prossimo collo di bottiglia individuale: prima, seconda o quinta pratica;
- follow-up suggeriti, non auto-inviati;
- metriche settimanali per coorte.

### Output D — Domanda scalabile

Solo dopo A–C:

- referral/inbound ottimizzati;
- paid acquisition testabile con CAC5;
- budget incrementale legato al rendimento osservato, non ai lead grezzi.

## 9. Review cadence Grove

Settimanale:

- pratiche mese corrente e run-rate;
- gap verso 400;
- lead→prima→seconda→quinta per coorte;
- numero e valore dei clienti bloccati a 0, 1, 2–4;
- top 3 colli di bottiglia;
- esperimenti: keep / change / stop;
- budget impiegato e CAC5 quando disponibile.

Mensile:

- quota delle 400 pratiche proveniente da base, reactivation e new acquisition;
- variazione del numero di clienti alla quinta pratica;
- pratiche/mese medie dei clienti acquisiti;
- retention delle nuove coorti.

## 10. Gate di sicurezza

Fino ad autorizzazione esplicita:

- nessun contatto automatico;
- nessuna migration applicata al database reale;
- nessun merge su `main`;
- nessun deploy Vercel/produzione;
- nessun cambio prezzo globale;
- nessun messaggio massivo ai ~600 contatti;
- nessun claim commerciale su APR o FatturaRapida prima dei rispettivi gate.

Le decisioni reversibili sono modellazione, segmentazione read-only, simulazioni, test offline e piccoli esperimenti umanamente approvati. Le decisioni potenzialmente irreversibili — invii massivi, pricing globale, migration, deploy, automazioni di contatto — restano fuori dal laboratorio.
