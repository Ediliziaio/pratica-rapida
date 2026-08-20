# Impresa Leggera — Piano ecosistema PraticaRapida × FatturaRapida

Stato: laboratorio / progettazione. Questo documento non abilita integrazioni, migration, deploy, automazioni di contatto o invii ENEA.

## North Star

Costruire un ecosistema unico in cui il cliente non percepisca PraticaRapida e FatturaRapida come due strumenti separati, ma come due capacità della stessa relazione con Impresa Leggera:

- **PraticaRapida** riduce il lavoro necessario per produrre e gestire le pratiche ENEA;
- **FatturaRapida** riduce il lavoro commerciale/amministrativo prima e dopo la vendita;
- **CRM / AI Supervisor** identifica il prossimo collo di bottiglia del cliente;
- **Progetto 400** porta domanda e misura la conversione fino alla quinta pratica;
- **Impresa Leggera** diventa il livello comune di identità, dati, servizi, retention e cross-sell.

Formula di lavoro:

`valore ecosistema = acquisizione × attivazione × uso ripetuto × servizi per cliente × retention`

Il fine non è aumentare il numero di feature. È aumentare il numero di clienti che completano un lavoro reale con meno attrito e tornano a usare l'ecosistema.

## 1. Working backwards dal cliente

Percorso obiettivo:

1. un rivenditore/azienda entra una sola volta nell'ecosistema;
2. possiede una sola identità aziendale condivisa;
3. crea preventivo/fattura in FatturaRapida oppure inserisce direttamente una pratica in PraticaRapida;
4. i dati già disponibili non vengono richiesti una seconda volta;
5. quando una vendita richiede ENEA, FatturaRapida può preparare un handoff verso PraticaRapida;
6. APR prepara la capacità produttiva in shadow e, solo dopo i gate previsti, riduce il lavoro umano;
7. il Supervisor osserva dove il cliente si blocca: onboarding, prima pratica, seconda, quinta, fatturazione o ritorno;
8. ogni servizio aggiuntivo viene proposto solo quando esiste un bisogno osservabile e un motivo utile per il cliente.

Principio Bezos: prima definire l'esperienza finale, poi i sistemi necessari per renderla inevitabile.

## 2. Identità cliente condivisa — prerequisito architetturale

Obiettivo: una sola azienda deve avere una sola identità logica nell'ecosistema, anche se usa più servizi.

Identificatore canonico futuro:

`ecosystem_company_id`

Non deve essere creato o migrato in produzione finché non è stato verificato il modello dati di FatturaRapida. Nel frattempo la progettazione deve assumere una relazione 1:1 tra identità ecosistema e azienda, con eventuali account/utenti multipli associati.

Attributi condivisibili, da validare contro i due sistemi prima dell'implementazione:

- ragione sociale;
- partita IVA / codice fiscale aziendale;
- sede e dati di fatturazione;
- contatti principali;
- utenti e ruoli;
- stato cliente;
- servizi abilitati;
- consenso/contratti per servizio;
- origine commerciale;
- stato di onboarding.

Regola fail-closed: identità dubbie o duplicate non vengono unite automaticamente. Match forti e univoci possono essere proposti; conflitti vanno in review.

## 3. CRM comune: separare identità, servizio e attività

Il CRM comune deve distinguere tre livelli:

### Cliente

Chi è l'azienda e quale relazione complessiva ha con Impresa Leggera.

### Servizio

Quali capacità utilizza o può utilizzare:

- PraticaRapida;
- FatturaRapida;
- futuri servizi Impresa Leggera.

### Attività

Cosa sta facendo in quel momento:

- lead/onboarding;
- preventivo;
- fattura;
- pratica ENEA;
- richiesta assistenza;
- follow-up;
- riattivazione;
- cross-sell.

Questo evita di duplicare l'azienda ogni volta che entra in un nuovo prodotto.

## 4. Contratto dati FatturaRapida → PraticaRapida

Il bottone futuro **“Chiedi Pratica ENEA”** non deve copiare alla cieca un'intera fattura nel CRM ENEA. Deve produrre un handoff versionato e tracciabile.

Payload logico minimo da progettare:

- `ecosystem_company_id` o riferimento azienda verificato;
- ID documento sorgente FatturaRapida;
- tipo documento: preventivo/fattura/acconto/saldo;
- cliente finale/beneficiario quando disponibile;
- indirizzo intervento quando disponibile;
- prodotto/linee di prodotto;
- importi rilevanti;
- date disponibili;
- documenti allegati;
- dati tecnici realmente presenti nella sorgente;
- versione del payload;
- timestamp e origine.

Regola fondamentale: **trasferire evidenza, non inventare dati ENEA**. APR/PraticaRapida decide successivamente quali campi sono utilizzabili, mancanti o da verificare.

## 5. Handoff in due stadi

### Stadio A — reversibile / laboratorio

FatturaRapida genera una preview read-only dell'handoff:

- mostra cosa verrebbe trasferito;
- evidenzia campi mancanti;
- non crea pratiche reali;
- non scrive in produzione;
- non attiva APR.

### Stadio B — operativo

Solo dopo il gate **“FatturaRapida sufficientemente testato”** e dopo verifica del contratto dati:

- il cliente conferma la richiesta ENEA;
- PraticaRapida crea o precompila la pratica;
- l'origine resta tracciata come FatturaRapida;
- eventuali modifiche successive non riscrivono retroattivamente il documento sorgente.

L'attivazione di APR resta governata dal gate indipendente **“APR operativo ombra”** e non deriva dal gate FatturaRapida.

## 6. Cross-sell working backwards

Il cross-sell deve partire da un bisogno osservato, non da campagne generiche.

Trigger candidati, da misurare prima di automatizzarli:

- cliente PraticaRapida che crea frequentemente pratiche ma gestisce manualmente preventivi/fatture → candidato FatturaRapida;
- cliente FatturaRapida che fattura prodotti con obbligo/opportunità ENEA → candidato PraticaRapida;
- cliente fermo tra prima e quinta pratica → prima risolvere il collo di bottiglia di attivazione, non aggiungere un altro servizio;
- cliente sano e ricorrente → candidato referral o servizi aggiuntivi;
- cliente in calo/inattivo → prima diagnosi del motivo, poi proposta pertinente.

Regola: nessun cross-sell deve ridurre la probabilità che il cliente completi il job principale che sta già cercando di fare.

## 7. Retention loop

Il valore dell'ecosistema aumenta quando ogni attività riduce il costo della successiva.

Loop obiettivo:

`preventivo → fattura → pratica ENEA → storico cliente → prossimo preventivo/pratica più semplice`

Leve di retention da misurare:

- tempo medio per creare il secondo documento/pratica rispetto al primo;
- percentuale di dati riutilizzati senza reinserimento;
- tempo umano risparmiato per pratica/documento;
- ritorno entro 30/60/90 giorni;
- conversione prima → seconda → quinta pratica;
- adozione di un secondo servizio;
- retention dei clienti multi-servizio vs mono-servizio;
- ticket/supporto per cliente e per transazione.

## 8. KPI ecosistema

North Star operativa iniziale:

**numero di aziende attive che completano almeno un job reale/mese nell'ecosistema**.

KPI secondari:

- aziende mono-servizio vs multi-servizio;
- activation rate per servizio;
- tempo onboarding → primo job;
- conversione PraticaRapida → FatturaRapida;
- conversione FatturaRapida → PraticaRapida;
- percentuale handoff ENEA completati;
- percentuale handoff bloccati per dati mancanti;
- pratiche/mese dei clienti multi-servizio;
- retention 30/60/90 giorni;
- ARPA/margine per cliente quando i dati economici saranno affidabili;
- support minutes per job.

Nessun KPI deve usare identità cliente non riconciliate come se fossero certe.

## 9. Priorità per leva e costo-opportunità

Ordine di costruzione:

1. **contratto identità condivisa** — senza questo ogni integrazione crea debito e duplicati;
2. **contratto dati FatturaRapida → ENEA** in preview read-only;
3. **telemetria funnel/cross-sell** — sapere dove si perde il cliente;
4. **handoff reale** dopo il gate FatturaRapida;
5. **Supervisor ecosistema** — prossimo miglior intervento per cliente;
6. **cross-sell assistito** e solo dopo automazioni a basso rischio;
7. futuri servizi sulla stessa identità.

Grove: l'integrazione con più leva è quella che rimuove una duplicazione o un passaggio manuale ripetuto per molti clienti, non quella con più feature visibili.

## 10. Decisioni reversibili vs irreversibili

### Reversibili — preparabili subito

- schema concettuale identità;
- payload/versioning handoff;
- mapping read-only;
- preview handoff;
- simulazioni funnel;
- dashboard KPI;
- regole Supervisor in laboratorio;
- segmentazione cross-sell;
- test offline con dati sintetici/de-identificati.

### Irreversibili o ad alto costo — richiedono gate

- migration su database reale;
- merge identità clienti;
- provisioning automatico account tra prodotti;
- creazione automatica di pratiche ENEA;
- invio automatico di comunicazioni;
- cambi prezzo/global bundle;
- deploy produzione;
- invio ufficiale ENEA.

## 11. Milestone per output

### E1 — Identity Contract

Output:

- fonte autorevole per ogni attributo azienda;
- chiave comune prevista;
- regole di match/conflitto;
- strategia account/ruoli;
- nessuna migration.

Gate: identity review completata sui due sistemi.

### E2 — ENEA Handoff Contract

Output:

- payload versionato;
- mapping sorgente → destinazione;
- campi obbligatori/opzionali;
- blocker espliciti;
- preview read-only.

Gate: nessuna pratica reale creata.

### E3 — Shared Funnel

Output:

- eventi di onboarding/uso normalizzati;
- KPI mono-servizio/multi-servizio;
- cross-sell opportunity queue read-only;
- integrazione concettuale con Progetto 400.

### E4 — Operational Handoff

Prerequisiti:

- frase **“FatturaRapida sufficientemente testato”**;
- contratto dati verificato;
- regressioni verdi sulla stessa revisione;
- rollback definito.

Output: richiesta ENEA creabile da FatturaRapida con conferma esplicita e audit trail.

### E5 — Ecosystem Supervisor

Output:

- una coda unica per prossimo miglior intervento;
- separazione tra retention, conversione, supporto e cross-sell;
- nessuna automazione di contatto senza ulteriore autorizzazione.

## 12. Relazione con Progetto 400

L'ecosistema non sostituisce Progetto 400: ne aumenta la leva.

- Progetto 400 misura e genera domanda;
- APR aumenta capacità produttiva;
- Supervisor riduce dispersione e individua il collo di bottiglia;
- FatturaRapida aumenta superficie di utilizzo e retention;
- identità comune permette di misurare il valore reale delle coorti.

Metriche da incrociare quando l'identità sarà affidabile:

- probabilità di arrivare alla quinta pratica per clienti mono vs multi-servizio;
- pratiche/mese dopo adozione FatturaRapida;
- tempo prima→seconda pratica prima/dopo handoff;
- CAC5 e payback per clienti che adottano uno o più servizi;
- churn/reactivation per tipo di servizio.

## 13. Gate attuali

Fino a nuova comunicazione:

- **“APR operativo ombra” non è concesso**;
- **“FatturaRapida sufficientemente testato” non è concesso**;
- nessun invio ENEA ufficiale;
- nessun claim commerciale che presenti capacità non ancora operative;
- nessun contatto automatico;
- nessuna migration/merge/deploy derivante da questo piano.

Il lavoro autonomo corretto è quindi preparare contratti dati, metriche, preview, test e code read-only, preservando la possibilità di cambiare direzione a basso costo.
