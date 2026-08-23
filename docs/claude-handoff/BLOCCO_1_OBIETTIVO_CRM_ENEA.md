# BLOCCO 1/3 — APR: obiettivo, CRM e portale ENEA

> Documento autonomo e sanitizzato per una revisione da parte di un assistente AI esterno.
> Non contiene credenziali, token, password, chiavi, URL privati, identificativi di pratiche o dati personali reali.
> I valori tra parentesi angolari sono placeholder.

## 1. OBIETTIVO DEL SOFTWARE

### Nome e scopo

APR significa **Automazione PraticaRapida**. ENEA è il primo modulo di APR.

In linguaggio semplice, APR deve:

1. individuare nel CRM PraticaRapida le pratiche entrate nella pipeline `Pronte da fare`;
2. leggere in sola lettura il dossier cliente, il form e gli allegati originari (fatture, documenti tecnici e, se presenti, bonifici);
3. estrarre e normalizzare i dati senza inventare valori;
4. applicare un registro unico di regole business con precedenze fra fonti, fallback autorizzati e audit degli ID regola;
5. riconoscere il prodotto dalle fonti originarie, anche quando l'etichetta CRM è errata;
6. validare anagrafica, immobile, date, prodotti, cardinalità tecnica e importi;
7. quando il caso è risolvibile, creare e salvare una **bozza ENEA**;
8. quando il caso non è risolvibile con regole già autorizzate, isolarlo in `Richiesto intervento operatore`, con motivo, fonti e domanda precisa, e proseguire con la pratica successiva;
9. mostrare su una dashboard locale stato, fase, pratica corrente, ultimo evento, prossima azione, coda e blocchi;
10. riprendere da checkpoint dopo crash, logout/login o riavvio del computer senza perdere o duplicare pratiche e bozze.

### Limite attuale del prodotto

La policy TEST corrente termina alla **bozza completa e salvata**. Sono vietati:

- anteprima finale;
- submit/invio;
- protocollazione;
- scarico o gestione della ricevuta;
- email, WhatsApp o altre comunicazioni.

Le funzioni future previste, ma non ancora operative, sono:

- invio ENEA con prova server `Inviata + CPID`;
- salvataggio nel CRM del PDF ENEA e della ricevuta/email;
- risposte automatiche a messaggi ricorrenti;
- richiesta automatica dei documenti mancanti.

### Utenti e contesto operativo

L'utilizzatore previsto è un operatore amministrativo che oggi prepara manualmente pratiche ENEA partendo da form e documenti presenti nel CRM. APR deve lavorare in modo persistente anche con la chat dell'assistente chiusa.

Il volume giornaliero reale **non è ancora stato formalizzato né misurato**. I collaudi hanno usato coorti da 5, 10, 15, 36 e 40 pratiche. Questi numeri sono dimensioni di test, non una stima attendibile delle pratiche/giorno. Il requisito qualitativo espresso è arrivare ad almeno l'85–90% di pratiche automaticamente lavorabili nei prodotti maturi, ma questo obiettivo non è stato ancora dimostrato.

L'urgenza è elevata: il sistema dovrebbe ridurre il lavoro manuale ed evitare che il processo dipenda dai turni di Codex. L'accuratezza è più importante della velocità perché errori su beneficiari, quantità o spese possono produrre danni economici.

## 2. FUNZIONAMENTO DEL CRM

### Natura dell'integrazione

Il CRM è PraticaRapida. APR non conosce né modifica direttamente lo schema fisico completo del database: il codice osservato usa un'API compatibile Supabase/PostgREST e lo Storage autenticato.

Stato verificato dell'integrazione:

- **lettura reale:** implementata tramite richieste HTTP `GET` autenticate;
- **lettura allegati:** implementata tramite `GET` allo storage autenticato;
- **scrittura pipeline/stati/allegati:** non collegata al CRM reale; esiste soltanto un contratto locale, idempotente e reversibile con `externalActionAllowed=false`;
- **query dirette al database:** non usate;
- **webhook in ingresso:** modellato come evento idempotente, ma l'acquisizione corrente avviene tramite polling `GET` della pipeline.

Gli endpoint reali e le chiavi pubbliche non sono inclusi. Usare i placeholder:

- `<CRM_API_ORIGIN>`
- `<CRM_REST_BASE>`
- `<CRM_STORAGE_BASE>`
- `<CRM_PUBLIC_CLIENT_KEY>`

### Entità concettuali verificate

#### Cliente / beneficiario

Campi rilevanti osservati nel dossier:

| Campo logico | Tipo | Note |
|---|---|---|
| `customerId` / `practiceId` | UUID/stringa | Nell'implementazione attuale spesso coincidono nell'evento in ingresso |
| `cliente_nome` | stringa | Dato personale; non incluso nelle fixture di questo handoff |
| `cliente_cognome` | stringa | Dato personale |
| `cliente_cf` | stringa | Codice fiscale; validato e incrociato con identità |
| `cliente_email` | stringa/null | Letto ma non usato per comunicazioni |
| `cliente_telefono` | stringa/null | Letto ma non usato per comunicazioni |
| residenza/nascita | oggetto nel form | Comune, indirizzo, CAP, data/sesso/nazione di nascita |

#### Pratica ENEA

| Campo logico | Tipo | Relazione/uso |
|---|---|---|
| `id` | UUID | Identità primaria della pratica |
| `prodotto_installato` | stringa | Etichetta informativa; non è fonte autorevole per il routing |
| `dati_form` | JSON | Form cliente strutturato |
| `fatture_urls` | array di stringhe | Percorsi nello storage degli allegati fiscali |
| `documenti_aggiuntivi_urls` | array di stringhe | Percorsi di documenti tecnici/altro |
| `fornitore` | stringa/null | Usato soltanto per regole con scope fornitore inequivoco |
| `reseller_id` | relazione | Collega la pratica al rivenditore/azienda |
| `current_stage_id` | UUID/null | Stato corrente nella pipeline |
| `form_compilato_at` | timestamp/null | Data disponibilità form |
| `created_at` | timestamp | Creazione |
| `updated_at` | timestamp | Usato come revisione ottimistica dell'evento |

#### Allegato originario

| Campo logico | Tipo | Note |
|---|---|---|
| `documentKey` | SHA-256/stringa | Identificatore locale derivato da pratica, tipo e percorso |
| `practiceId` | UUID | Relazione con la pratica |
| `kind` | enum | Fattura o documento aggiuntivo |
| `sourcePath` | stringa | Percorso relativo nello storage; validato contro la pratica |
| `contentType` | stringa | MIME verificato |
| `byteLength` | intero | Limite corrente 20 MB |
| `responseSha256` | SHA-256 | Fingerprint del contenuto acquisito |
| `localPath` | stringa/null | Copia locale protetta usata dal parser |
| `state` | enum | queued/downloading/downloaded/blocked |

#### Pipeline e stato

Entità concettuale `pipeline_stage`:

| Campo | Tipo | Uso |
|---|---|---|
| `id` | UUID | Collegato a `current_stage_id` |
| `stage_type` | stringa | Valore tecnico interrogato dall'adattatore |
| nome visuale | stringa | Nome mostrato all'operatore |

Pipeline/stati rilevanti:

- `Pronte da fare` / `pronte_da_fare`: fonte ordinaria delle pratiche che APR deve acquisire;
- `Archiviate`: usata in molti collaudi per leggere pratiche già lavorate;
- `Recensione`: usata in alcuni collaudi come sorgente storica;
- `Richiesto intervento operatore`: destinazione progettata per casi non risolvibili automaticamente;
- stato locale `APR ENEA · bozza salvata <ID>`: proposta contrattuale, non ancora scrittura CRM reale;
- stato locale `APR ENEA · intervento richiesto`: proposta contrattuale con domanda strutturata.

### Flusso CRM attuale

1. L'utente autentica APR tramite una pagina locale `<APR_LOCAL_CRM_AUTH_URL>`.
2. APR invia le credenziali direttamente al servizio di autenticazione CRM; le credenziali non sono salvate nel repository.
3. La sessione persistente usa il Portachiavi macOS per il materiale di sessione. Questo documento non contiene né esporta tali dati.
4. Il processo di ingresso interroga con `GET` le righe con `stage_type=pronte_da_fare`.
5. Ogni risposta viene limitata per dimensione, validata e fingerprintata.
6. APR persiste l'evento prima di inoltrarlo alla coda locale.
7. Il dossier viene letto via REST e gli allegati via Storage `GET`, uno alla volta.
8. Nessuna mutazione CRM viene eseguita nell'implementazione corrente.

### Contratto previsto per le future scritture CRM

Ogni comando futuro contiene:

- versione del contratto;
- `idempotencyKey`;
- evento, pratica e cliente;
- stato atteso con revisione CRM;
- stato desiderato;
- compensazione/reversibilità;
- motivo;
- ID regole applicate;
- flag `externalActionAllowed=false` finché l'adattatore reale non è abilitato.

Il vincolo è non modificare, duplicare o disabilitare gli automatismi CRM esistenti e non rompere l'integrazione CRM → Cruscotto.

## 3. FUNZIONAMENTO DEL PORTALE ENEA

### Login e sessione

APR non conosce, non memorizza e non inserisce credenziali SPID.

Meccanismo previsto e usato nei test reali:

1. l'utente apre Chrome con un profilo stabile;
2. l'utente apre il portale ENEA e completa personalmente SPID/OTP;
3. APR si collega alla stessa istanza Chrome tramite **Chrome DevTools Protocol (CDP)**;
4. APR verifica l'autenticazione tramite segnali DOM e prove server innocue, non solo tramite il percorso URL;
5. `login_required` globale è ammesso soltanto con prova server reale di logout;
6. un timeout o keepalive rifiutato produce lease scaduta/bloccata, non automaticamente logout;
7. la sessione viene mantenuta con `GET`/`HEAD` innocui e auditati verso dashboard/riepilogo.

Placeholder:

- `<ENEA_BASE_URL>`
- `<ENEA_DASHBOARD_URL>`
- `<SPID_LOGIN_URL>`
- `<CHROME_DEBUG_ENDPOINT>`

### Flusso Ecobonus condiviso

L'ordine applicativo osservato è:

1. **Creazione o riaggancio bozza**
   - prima dell'azione viene salvato un intento persistente;
   - dopo crash è vietata una seconda creazione alla cieca: APR deve cercare la bozza esistente in sola lettura.
2. **Beneficiario**
   - nome, cognome, CF, nascita, sesso;
   - nazione/comune di nascita;
   - residenza e contatti;
   - eventuali altri beneficiari, ma solo se confermati dalla fattura.
3. **Immobile**
   - comune con selezione obbligatoria dall'autocomplete ENEA;
   - indirizzo, civico, CAP;
   - dati catastali;
   - anno, superficie utile, numero unità;
   - titolo di possesso, destinazione e tipologia edificio.
4. **Intervento**
   - ambito dell'intervento;
   - unità interessate;
   - accorpamenti;
   - data inizio e fine lavori;
   - tipo intervento (diverso per schermature e infissi);
   - impianto centralizzato, quando richiesto.
5. **Impianto termico esistente**
   - tipologia, terminali, distribuzione, regolazione, combustibile, condizionamento;
   - alcuni campi restano automatici o sono esclusi se non pertinenti.
6. **Generatore esistente**
   - pagina condivisa quando richiesta dal portale.
7. **Pagina tecnica del prodotto**
   - schermature oppure serramenti/infissi; cardinalità fisica 1:1.
8. **Riepilogo tecnico e costo**
   - totale lordo IVA o importo detraibile esplicito secondo regole autorizzate.
9. **Calcolo costi e detrazioni**
   - abitazione principale: colonna applicabile del portale;
   - non abitazione principale: totale nella colonna 36% 2025–2026, 50% a zero;
   - per gli infissi il risparmio energetico è lasciato al calcolo automatico ENEA.
10. **Verifica server della bozza salvata**
    - una pagina è considerata salvata solo dopo evidenza coerente;
    - preview e submit restano vietati.

### Schermature solari gestite

Famiglie attualmente modellate:

- tende da sole e tende Cristal;
- pergole/pergotende;
- zanzariere, come `Altra schermatura solare`;
- persiane;
- persiane avvolgibili.

Campi tecnici principali, uno per prodotto fisico:

- tipo;
- installazione;
- larghezza/altezza o sporgenza;
- superficie;
- superficie finestrata protetta, se richiesta;
- esposizione;
- modalità di calcolo;
- gTot;
- materiale schermante;
- movimentazione/regolazione;
- resistenza termica supplementare per persiane/avvolgibili.

Regole essenziali:

- il valore esplicito in una fonte originaria prevale sul fallback;
- mai aggregare più prodotti fisici in una sola riga tecnica;
- Cristal e zanzariere usano gTot 0,33 solo se assente un valore esplicito;
- pergole, persiane e avvolgibili usano gTot 0,08 solo come fallback;
- il materiale della struttura non sostituisce il materiale della superficie schermante;
- motore esplicito implica movimentazione automatica;
- persiane/avvolgibili hanno materiale alluminio/metallo e resistenza supplementare 0,17 secondo la policy autorizzata.

### Serramenti e infissi gestiti

Campi tecnici per ogni infisso fisico:

- superficie in m², arrotondata a un decimale per ENEA ma conservata esatta in audit;
- materiale telaio precedente;
- tipo vetro precedente;
- trasmittanza termica del vecchio infisso;
- materiale telaio nuovo;
- tipo vetro nuovo;
- trasmittanza termica del nuovo infisso;
- confine verso esterno;
- flag chiusure oscuranti.

Regole essenziali:

- numero e misure provengono da fattura o documenti tecnici originari;
- fattura e certificato con cardinalità incompatibile richiedono operatore;
- trasmittanza nuova esplicita prevale; se assente, fallback 1,3 W/m²K;
- se il valore sorgente supera il massimo accettato da ENEA, si conserva il sorgente in audit e si scrive 1,3 nel campo portale;
- materiale/vetro nuovi: valori espliciti prevalgono; fallback PVC e vetro basso emissivo;
- trasmittanza del vecchio infisso deriva dalla matrice materiale × vetro; dati mancanti/ambigui/dubbi usano 6,0 W/m²K;
- il risparmio energetico non è calcolato o scritto da APR: il portale lo calcola e APR potrà solo leggerlo in audit.

### Altri tipi di pratica

| Modulo | Stato reale |
|---|---|
| VEPA / vetrate scorrevoli | riconosciute e instradate a Bonus Casa; campi specifici non ancora mappati, quindi nessuna bozza operativa |
| Pompe di calore | previste nel piano, non implementate come modulo completo |
| Insufflaggio | previsto nel piano, non implementato come modulo completo |

### Vincoli e fragilità note del portale

- sessione SPID soggetta a timeout;
- necessità di mantenere una singola identità browser/profilo stabile;
- DOM React asincrono e pagine che possono essere montate prima dell'idratazione dei valori salvati;
- autocomplete dei comuni che richiede una scelta autorevole, non semplice testo;
- modali dinamiche per beneficiari e prodotti;
- salvataggi asincroni: un timeout dopo il click non dimostra né successo né fallimento;
- route e tabelle di riepilogo variabili per anno e tipo di pratica;
- selettori/ID osservati sul portale 2026 che possono cambiare;
- possibili errori CDP come contesto/frame perso o promessa JavaScript raccolta;
- nessun captcha è stato formalmente modellato; la presenza futura deve essere trattata fail-closed;
- l'anno della fine lavori può rendere incompatibile il portale scelto;
- una pratica oltre i termini previsti deve essere portata all'operatore secondo le regole temporali versionate.

---

**Fine BLOCCO 1/3.** Il blocco successivo descrive architettura, stato reale e problemi noti.
