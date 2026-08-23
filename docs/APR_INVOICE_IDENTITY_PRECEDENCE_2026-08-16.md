# APR — precedenza identità fattura e controllo CF

Data: 16/08/2026  
Registro: `enea-operational-registry-v23`  
Matrice: `apr-enea-rule-test-matrix-v6`

## Regola di fonte

Per beneficiario e cointestatario, il blocco cliente e il codice fiscale espliciti nelle fatture originarie prevalgono sul form cliente. Se tutte le fatture riconciliate identificano un solo cliente e non riportano il cointestatario presente nel form, APR prepara la bozza senza cointestatario e conserva la divergenza in audit.

La sola assenza di una persona in testo non strutturato non è sufficiente: APR richiede che il beneficiario principale della fattura sia identificato con un CF unico, valido e coerente. Se le fatture sono ambigue o riportano più beneficiari, il caso viene instradato a `Richiesto intervento operatore` e la coda prosegue.

ID regola: `user-2026-08-16-invoice-identity-over-customer-form`.

## Controllo del codice fiscale

Un CF documentale è accettato soltanto quando:

1. è esplicito in una fattura originaria;
2. supera formato e checksum;
3. è unico tra le fatture riconciliate;
4. coincide con i segmenti verificabili di nome, cognome, data di nascita e sesso;
5. coincide anche con il codice catastale/Belfiore del luogo di nascita quando tale codice è disponibile da una fonte attendibile.

APR non ricava per supposizione il codice Belfiore dal solo nome del Comune. Candidati multipli, assonanze non risolte o segmenti contrari richiedono l’operatore.

ID regola: `user-2026-08-16-fiscal-code-identity-cross-check`.

## Evidenza Lea Dettori

- Form: cointestatario Luigi Bellenchia, CF `BLLLGU65E28F205E`.
- Fattura originaria 1: cliente Lea Dettori, CF `DTTLEA66C62F205Q`.
- Fattura originaria 2: cliente Lea Dettori, CF `DTTLEA66C62F205Q`.
- Esito APR ricalcolato: `excluded_by_invoice`, `present=false`, nessun blocker.
- Mapping: `beneficiario.cointestazione=No`, fonte `Fattura`, ID regola registrato.

## Verifiche

- Test mirati: 61/61 verdi.
- Typecheck runner: verde.
- Build applicazione: verde.
- Ricalcolo sul dossier congelato Lea: `ready_local_plan`, nessun campo cointestatario nel payload portale.

I test HTTP della dashboard che richiedono apertura di porte loopback non sono eseguibili nel sandbox ristretto (`listen EPERM`); non costituiscono un errore di questa regola.

## Osservazioni operative da implementare — Vittorio Paolinelli

Stato: **non ancora attive**; richiedono correzione del parser e test automatici prima dell'inserimento nel registro operativo.

- La ricerca del CF deve esaminare tutte le pagine della fattura originaria e associare il candidato al nome e cognome dell'intestatario prima della validazione formale e anagrafica.
- L'estrazione economica deve esaminare tutte le pagine del documento: in una fattura multipagina il totale può comparire soltanto nell'ultima pagina.
- Se il form cliente manca realmente, la pratica resta `Richiesto intervento operatore`/lavorazione manuale; l'integrazione CRM futura dovrà rendere esplicita questa causa senza arrestare la coda.
- Caso di regressione da aggiungere: fattura Vittorio Paolinelli, CF associato all'intestatario e totale esposto nella seconda pagina.

## Verifica comparativa Vittorio Paolinelli / Lucia Lagrasta

Stato: **difetti tecnici confermati, non ancora corretti**.

- Le due fatture sono dello stesso fornitore, hanno entrambe due pagine e lo stesso impianto grafico.
- In entrambe il CF esplicito compare nella prima pagina accanto al destinatario; entrambi i CF superano il checksum e i segmenti di cognome/nome coincidono con l'intestatario.
- APR ha accettato il CF di Lucia perché il form disponibile consentiva il controllo aggiuntivo di data e sesso. Ha invece classificato male quello di Vittorio come `missing_or_invalid` perché il form mancava, non perché il CF non fosse stato estratto. Il messaggio dovrà distinguere `CF estratto ma verifica indipendente incompleta` da `CF assente/invalido`.
- In entrambe il totale finale è stampato nella seconda pagina (`EUR 1.900,00` per Vittorio; `EUR 3.140,00` per Lucia) ed è presente anche nel testo estratto. Il parser ha quindi un difetto nel riconoscimento del totale multipagina.
- Nel caso Lucia la fattura distingue una tenda da sole e tre zanzariere. Il tipo esplicito per riga della fattura deve prevalere sulla descrizione generale del form: non è un conflitto e non deve produrre `product_group_primary_type_conflict`.
- Le tre zanzariere restano `Altra schermatura solare`, cardinalità 1:1, materiale `Misto`, movimentazione `Manuale`, gTot `0,33` solo fallback; la regola è già presente nel registro e il test deve impedire regressioni.

Casi di regressione da aggiungere prima di rendere attive le correzioni: stesso layout fornitore con CF/totale su pagine diverse; fattura mista tenda+zanzariere con descrizione generale nel form; verifica che la fattura prevalga senza perdere gli attributi 1:1.

## Correzione attiva — Mauro Seleni / gruppo Vans

Stato: **implementata, testata e installata** il 16/08/2026.

- I due PDF erano già leggibili come testo nativo: il difetto non era OCR, ma il mancato riconoscimento della frase raggruppata Vans.
- APR riconosce ora `4 tende verticali in PVC trasparente + 4 tende da sole integrate`, espande le misure di ogni struttura e conserva otto prodotti tecnici distinti.
- Le misure riconciliate per ciascuna famiglia sono: due pezzi `2550×1590 mm`, uno `2760×2695 mm`, uno `2750×1625 mm`; gTot documentato `0,10` su tutti i pezzi.
- Acconto `85/2026` (€ 3.222,00) e saldo `247/2026` (€ 7.518,01) restano due fonti economiche, ma il gruppo tecnico ripetuto è contato una sola volta: totale € 10.740,01 e otto righe tecniche, non sedici.
- Il tipo prodotto esplicito della fattura prevale sul tipo generico/difforme della riga form; il form può fornire soltanto esposizione e attributi compatibili. La sola differenza di tipo non genera più un blocco.
- Registro attivo: `enea-operational-registry-v27`; matrice: `apr-enea-rule-test-matrix-v10`.
- Verifiche: 58 test mirati verdi, typecheck generale e runner verdi, ricalcolo su copia del checkpoint reale verde, quindi installazione e ricalcolo persistente reale. Mauro risulta `ready_local_plan`, 8 prodotti, nessun blocker, totale € 10.740,01.
