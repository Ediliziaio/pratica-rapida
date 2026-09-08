# Audit generale di affidabilità APR — esito r35 — 2026-09-03

## Esito sintetico

L'audit locale e read-only ha ricostruito da zero 100 pratiche partendo da 359 documenti originali (293.624.565 byte), con verifica degli hash delle fonti e senza riusare OCR, analisi o blocker storici. Sono stati dimostrati e corretti due pattern generali capaci di produrre falsi blocchi nel percorso corrente: lettura semantica incompleta di pagine OCR ruotate di 180 gradi e doppio conteggio/conflitto fra PDF fiscale nativo e sua copia scansita. Il replay dopo la correzione passa da 26 a 28 `READY_LOCAL`; Monica Molteni e Claudia Campagna sono i soli due casi migliorati e gli altri 98 restano invariati.

Il bundle r35 è stato selezionato nel percorso canonico solo dopo gate monotono interamente verde. Non è stato eseguito alcun test operativo r35 su ENEA. Il keepalive già residente non è stato riavviato e mantiene in memoria il codice r34; il prossimo processo APR avviato ex novo caricherà r35.

## Perimetro e sicurezza

- Manifest congelato: 100 casi, SHA-256 `51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0`.
- Documenti originali analizzati: 359; hash non coincidenti: 0; analisi fallite: 0.
- Nessun accesso mutativo a ENEA o CRM.
- Nessuna compilazione, bozza, anteprima, salvataggio, submit, protocollazione, ricevuta o comunicazione.
- Chrome APR PID 3785 e keepalive PID 98419 sono rimasti vivi e non sono stati riavviati.

## Errori del percorso APR trovati e corretti

### 1. Ordine semantico OCR a 180 gradi incompleto

**Prova concreta.** Nei documenti originali di Monica Molteni erano presenti le fatture native n. 161 del 14/05/2026 da 750,00 EUR e n. 229 del 18/06/2026 da 1.750,00 EUR, oltre alle rispettive copie scansite. La copia ruotata della fattura 229 conteneva l'etichetta esplicita `TOTALE FATTURA`, ma la normalizzazione dell'ordine OCR ruotato riconosceva altre etichette di totale e non questa. Il segmento poteva quindi ereditare il riferimento alla fattura 161 o perdere il totale, generando falsi blocker finanziari.

**Correzione generale.** La regola `system-rotated-ocr-fiscal-reading-order-total-invoice-v2` include `TOTALE FATTURA` fra le ancore semantiche della ricostruzione a 180 gradi. Non contiene nomi o ID di pratica.

**Risultato.** Il replay fresco riconosce due fatture uniche, 750,00 + 1.750,00 = 2.500,00 EUR, ritira le copie e porta il caso a `READY_LOCAL`.

### 2. PDF fiscale nativo e copia OCR trattati come documenti economici distinti

**Prova concreta.** Nei documenti originali di Claudia Campagna erano presenti la fattura 729/26 da 858,00 EUR, la fattura nativa 869/26 da 2.102,00 EUR e una copia scansita della stessa 869/26. Sulla copia OCR il parser selezionava 2.236,36 EUR da una riga tecnica anziché il lordo 2.102,00 EUR. Il confronto pre-correzione manteneva entrambe le rappresentazioni e produceva un falso conflitto economico.

**Correzione generale e fail-closed.** La regola `system-native-ocr-fiscal-duplicate-authority-v1` attribuisce autorità al PDF nativo e ritira la copia OCR soltanto se coincidono numero fattura e data, codice fiscale valido condiviso, partita IVA condivisa, firma tecnica dei prodotti identica e candidato nativo univoco. Se manca anche una sola ancora, entrambe le fonti restano e il gate continua a chiudersi. L'audit persiste gli ID delle copie scartate.

**Risultato.** Il replay fresco conserva 729/26 da 858,00 EUR e 869/26 da 2.102,00 EUR, elimina il falso duplicato e porta il caso a `READY_LOCAL`.

### Adeguamento parser collegato

Per i documenti scansiti, il fallback `FATTURA ACCOMPAGNATORIA <numero>` è ammesso soltanto quando nell'intera pagina esiste una sola data valida distinta. È un irrigidimento fail-closed necessario a impedire associazioni arbitrarie, non un fallback permissivo.

## Problemi trovati ma non corretti

### Ambiguità economica autorizzata — Claudia Campagna

Il totale lordo delle due fatture originali è 2.960,00 EUR. Una regola esplicitamente autorizzata in precedenza usa invece 3.134,06 EUR come spesa ammissibile: 858,00 EUR di acconto più 2.276,06 EUR stampati nella fattura finale come “spese congrue sostenute in base ai massimali ammessi”. La distinzione può essere contabilmente corretta, ma la descrizione delle tre verifiche come “somma totali lordi” è incompatibile con il valore selezionato.

Non è classificato come errore APR: esistono due interpretazioni plausibili e la precedenza deriva da una regola esplicita già acquisita. Nessuna modifica è stata applicata.

- `classification`: `AMBIGUOUS_AUTHORIZED_FINANCIAL_PRECEDENCE`
- `exactCause`: totale lordo fatture 2.960,00 EUR contro spesa congrua/ammissibile selezionata 3.134,06 EUR.
- `missingDocumentType`: `null`
- `operatorQuestion`: “Per Claudia Campagna, confermi che su ENEA la spesa ammissibile deve restare 3.134,06 EUR (858,00 EUR di acconto + 2.276,06 EUR indicati come ‘spese congrue’) invece del totale lordo delle due fatture pari a 2.960,00 EUR?”
- `onboardingGap`: distinguere all'origine totale lordo, totale pagato e importo ammissibile/congruo ENEA.

### Ventisei differenze di insieme blocker

Ventisei pratiche mantengono lo stesso esito complessivo `OPERATOR_REQUIRED_LOCAL`, ma il replay fresco e quello persistito differiscono nell'insieme preciso dei blocker. Non sono state dichiarate né errori APR né mancanze documentali reali: ciascuna richiede confronto umano sui documenti originali prima di qualunque nuova regola. Per tutte sono già presenti `classification`, `exactCause`, `missingDocumentType`, `operatorQuestion` e `onboardingGap` in `residual-review-questions.json`.

Fra queste è presente “prova rivenditore 1 30/04”: il nome suggerisce un test interno, ma non basta per aggiungerlo autonomamente alle esclusioni. La decisione richiesta è se sia una pratica interna da escludere permanentemente.

### Debito lint preesistente

`crmLocalPreflight.ts` presenta sei segnalazioni `no-useless-escape`. La stessa verifica eseguita sul file a `HEAD` produce le medesime sei segnalazioni: non sono una regressione r35 e non sono state corrette durante questo audit.

## Difetti esclusivi del replay o degli strumenti di test

1. Il vecchio replay `local-replay-current-source.json` riusava OCR e analisi persistiti e poteva far ricomparire segnali già ritirati. È stato sostituito, per questo audit, da un replay che riparte dai documenti originali e ne verifica gli hash.
2. La suite completa non era valida in sandbox per il divieto di loopback e, con il runner `vmThreads`, per l'assenza di `crypto.randomUUID`. Le stesse prove sono state rieseguite nell'ambiente corretto.
3. Nove processi Chrome headless creati da fixture di test e rimasti orfani rallentavano una prova CDP fino al timeout. Sono stati terminati soltanto quei nove PID di fixture; Chrome APR PID 3785 è stato escluso esplicitamente e verificato vivo. Con l'ambiente pulito, la prova passa con il timeout originale di 45 secondi. Nessun timeout di produzione è stato ridotto o allargato.

Questi tre punti non sono classificati come errori del percorso operativo APR.

## Falsi blocchi eliminabili e blocchi documentali legittimi

- Falsi blocchi dimostrati ed eliminati nel replay locale corrente: 2 pratiche, Monica Molteni e Claudia Campagna.
- Casi invariati dal candidato: 98 su 100.
- Esito fresco complessivo: 28 `READY_LOCAL`, 72 `OPERATOR_REQUIRED_LOCAL`, 0 analisi fallite.
- Le 72 pratiche non sono automaticamente “blocchi documentali legittimi”: l'audit non ha svolto una nuova adjudication umana completa di tutte le fonti per ciascuna.
- Gabriele Girelli resta l'esempio già verificato manualmente di blocco documentale legittimo: manca realmente la fattura. `missingDocumentType`: fattura; `operatorQuestion`: “Inserisci la fattura mancante.”

L'autonomia contrattuale va calcolata soltanto sulle pratiche documentalmente complete e procedibili. I documenti realmente assenti, che impedirebbero anche a un operatore umano di completare la pratica, non entrano nel denominatore dell'autonomia tecnica.

## Priorità residue

1. **Alta — decisione economica Claudia Campagna.** Rischio: salvare un valore semanticamente errato pur senza generare un blocco. Frequenza osservata: 1. Correzione automatica non sicura.
2. **Media — 26 differenze di blocker.** Potenziale presenza di altri falsi blocchi, ma nessuna correzione è ammissibile senza verifica dei documenti originali caso per caso.
3. **Media — freschezza obbligatoria del replay.** Il problema è nel collaudo: ogni futuro gate dovrebbe invalidare gli artefatti prodotti da revisioni diverse e ricalcolare dai documenti originali.
4. **Bassa — teardown delle fixture browser.** Rischio confinato alla stabilità della suite; non è stata trovata evidenza di impatto sulla coda operativa.

Non è emerso un nuovo difetto comune capace di fermare impropriamente l'intera coda. Questa assenza è dimostrata solo dalla suite e dal replay locale, non da un'esecuzione operativa r35.

## Correzioni acquisite e gate monotono

- Registro: `enea-operational-registry-v111`.
- Matrice: `apr-enea-rule-test-matrix-v89`.
- Regole con prova positiva e negativa/fail-closed: 110/110.
- Suite completa: 444 suite, 1.696 test unici, 0 fallimenti.
- Baseline r34: 444 suite, 1.693 test.
- Test mirati segmentazione: 35/35 verdi.
- Test mirati registro, materializzazione e segmentazione: 81 verdi.
- Typecheck runner ENEA: verde.
- Replay originale prima/dopo: 26→28 `READY_LOCAL`, 74→72 `OPERATOR_REQUIRED_LOCAL`, 98 casi invariati, 0 analisi fallite.

Ogni regola nuova ha ID, precedenza/fonti, azione deterministica, audit, fixture positiva, fixture negativa/fail-closed, voce nella matrice e presenza nel bundle installato.

## Bundle installato e limite di attivazione

Bundle canonico selezionato: `versions/f68568da-fiscal-copy-reliability-r35-20260903`.

- worker SHA-256: `f68568da7275322f7c76068dbfb130e7b65118ffec44aa7aabe6102a28bb7898`
- supervisor SHA-256: `68a235d2dc4e2ce2066fac62fcaec0802ddb7b170d7ba2498438487bb12a3e7d`
- watchdog SHA-256: `551118e02af5d2a9163f18d8663d7b332d173ff0ae28cffb9659dee9a33619f0`
- OCR SHA-256: `4c41c9a6832b11b9d19eace538100270a533dddc05e475e5842711968393327f`

La selezione canonica è installata. Per rispettare la continuità, il keepalive residente non è stato riavviato: il suo codice in memoria precede r35. Quindi “installato” non significa “già esercitato dal processo operativo residente”.

## Tripla verifica post-installazione

1. **Processi/launchctl:** keepalive `com.praticarapida.apr-enea-immortal-keepalive` attivo, PID 98419; Chrome APR PID 3785 attivo; nessun riavvio.
2. **Checkpoint/journal persistenti:** servizio `apr-enea-worker-service-v1`, revisione 13647, stato `setup_ready`, contratto DOM verde, zero tentativi di anteprima, submit o comunicazione.
3. **Dashboard/sessione:** endpoint CDP locale mostra la pagina ENEA “Bonus Fiscali - ENEA” sulla dashboard, target `1C3153562376BE798125C283D8021102`.

Questa tripla verifica prova la continuità della sessione e la selezione del bundle; non sostituisce un replay operativo r35 pratica per pratica.

## Conclusione per categoria di prova

### Affidabilità dimostrata dai test locali

Il candidato r35 ha analizzato da documenti originali 100 pratiche e 359 allegati senza errori di analisi, ha eliminato due falsi blocchi riproducibili, non ha cambiato gli altri 98 casi e ha superato 1.696 test e 110 gate di regola. Questa è evidenza locale forte della monotonia della correzione.

### Aspetti che richiedono ancora replay

- Eseguire con un processo APR nato dopo la selezione r35 un replay locale dal checkpoint almeno di Monica Molteni e Claudia Campagna.
- Risolvere prima la domanda sull'importo ammissibile di Claudia o mantenere il gate chiuso sul relativo valore.
- Adjudicare sui documenti originali le 26 differenze di insieme blocker; fino ad allora restano `pending_manual_classification` rispetto alla diagnosi dettagliata, pur mantenendo l'esito complessivo locale `OPERATOR_REQUIRED_LOCAL`.

### Aspetti che richiedono un futuro test operativo autorizzato

La verifica che r35 produca lo stesso comportamento nel percorso persistente reale, con checkpoint, `report.blockers` e `/api/case-truth` concordanti, richiede un futuro replay operativo autorizzato. Non è stato eseguito in questo audit.

### Rischio residuo prima del collaudo

Rischio residuo **medio**: le due regressioni riproducibili sono corrette con gate monotono, ma rimangono una decisione economica potenzialmente mutativa, 26 differenze di diagnosi non ancora adjudicate e l'assenza di una verifica operativa r35. Non è corretto dichiarare APR genericamente “pronto”; è dimostrata la solidità locale del candidato, non ancora la sua equivalenza operativa completa.

## Artefatti principali

- `fresh-original-replay-v2.json`: baseline fresca pre-correzione.
- `fresh-original-replay-v3-candidate.json`: replay fresco post-correzione.
- `fiscal-copy-diagnostic-r35.json`: prova riga/segmento dei due pattern.
- `residual-review-questions.json`: 26 casi con campi operatore strutturati.
- `manual-decisions-required.json`: decisioni non sicure da automatizzare.
- `full-vitest-r35-final.json`: suite completa.
- `rule-gate-r35/rule-test-evidence.json`: prove delle regole.
- `preinstall-gate-attestation-r35.json`: gate monotono.
- `bundle-install-receipt-r35.json`: installazione canonica.
- `postinstall-attestation-r35.json`: tripla verifica e limite di attivazione.
