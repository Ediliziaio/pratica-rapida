# Audit generale di affidabilità APR — stato finale r39 del 3 settembre 2026

## Esito esecutivo

L'audit è rimasto interamente locale e read-only verso ENEA/CRM. Sul campione congelato di 100 pratiche sono stati verificati 359 documenti originali (293.624.565 byte, zero hash discordanti).

Il bundle canonico attivo è **r39**: `versions/6481c58d-technical-source-binding-r39-20260903`. r37/r38 erano stati quarantinati perché una lettura cieca dei documenti originali di Gemma Minore aveva dimostrato l'assenza del legame univoco tra commessa tecnica e pratica cliente. r39 introduce prima quel gate generale e reintegra poi le due estrazioni tecniche. Il replay locale sui 100 fascicoli resta prudentemente a **29 `READY_LOCAL` e 71 `OPERATOR_REQUIRED_LOCAL`**: Claudia Sellati si sblocca, mentre Flavia Cipriani passa da READY a richiesta operatore per una reale assenza di raccordo documentale.

Nessuna azione ENEA è stata eseguita: niente compilazione, bozza, anteprima, salvataggio, submit, protocollazione, ricevute o comunicazioni.

## Correzioni dimostrate e attive

### r35 — documenti fiscali e copie OCR

- `system-rotated-ocr-fiscal-reading-order-total-invoice-v2`: riconosce l'ancora `TOTALE FATTURA` nella ricostruzione OCR ruotata di 180°, senza allentare le altre condizioni.
- `system-native-ocr-fiscal-duplicate-authority-v1`: ritira una copia OCR soltanto se numero/data fattura, CF, P.IVA e firma tecnica prodotto coincidono con un PDF fiscale nativo univoco.
- Risultato locale: Monica Molteni e Claudia Campagna perdono falsi blocker; 98 casi invariati.

### r36 — tabella posizionale del produttore

- `system-producer-position-table-infissi-v1`: estrae quantità, Largh., Alt. e Uw soltanto quando ogni posizione della dichiarazione Internorm è completa e univoca.
- Risultato locale: Massimo Cappello passa a `READY_LOCAL`; 99 casi invariati.

Queste correzioni restano incluse nel bundle r39 attivo. La loro baseline r36 era verde: 444 gruppi, 1.698 test, zero fallimenti; registro `v112`, matrice `v90`, 111/111 regole provate.

### r39 — collegamento univoco del documento tecnico alla pratica

- `user-2026-09-03-technical-document-practice-binding-v1`: un documento tecnico non può essere accettato soltanto perché contiene misure e Uw plausibili. Deve essere collegato alle fatture della pratica tramite cliente/cantiere, un riferimento ordine/commessa e la firma completa dei prodotti.
- Il controllo è fail-closed e persiste `infissi_technical_document_practice_binding_unverified` con causa, tipo documento mancante, `operatorQuestion` e `onboardingGap`.
- Prova positiva: Claudia Sellati, sei prodotti identici tra DoP e fatture, cliente coerente e un solo ordine fatturato.
- Prova negativa dossier estraneo: il documento proposto per Gemma Minore è intestato a CISAM INFISSI, fornitura 15040/2026, e descrive un prodotto diverso.
- Prova negativa riferimenti non raccordati: le fatture di Flavia Cipriani riportano commessa 1394/2026 e non contengono la firma tecnica dei prodotti; il documento tecnico anagrafico riporta fornitura 1613/2026. Nessun originale collega i due riferimenti.
- La suite r39 è verde: 444 gruppi, 1.708 test, zero fallimenti; registro `v115`, matrice `v93`, 114/114 regole provate.

## Correzioni r37/r38 inizialmente ritirate e ora riattivate sotto r39

### r37 — dichiarazione energetica a prodotto singolo

La regola estraeva una sola riga quando una dichiarazione energetica mostrava una sola tipologia, quantità, misura e Uw. La fixture locale di Gemma Minore passava tecnicamente, ma il successivo controllo cieco ha provato che:

- la commessa STARPUR 15040/2026 è intestata a CISAM INFISSI;
- descrive una portafinestra 1090x2075 mm;
- le fatture di Gemma citano preventivi 20/2026 e 25/2026;
- la fattura di saldo descrive invece un portoncino a due ante asimmetriche;
- nessun riferimento univoco collega la commessa tecnica alla pratica cliente.

Quindi il miglioramento apparente non era affidabile: il problema non era l'estrazione delle misure, ma l'assenza di un **gate generale di source-binding cliente/ordine/prodotto**. r37 non è stato lasciato attivo da solo; il parser a prodotto singolo è ora presente in r39 ma può produrre evidenza soltanto dopo il nuovo gate.

- `classification`: `AMBIGUOUS_SOURCE_ASSOCIATION_TECHNICAL_REGRESSION`
- `missingDocumentType`: documento che colleghi univocamente commessa STARPUR e pratica Gemma, oppure scheda tecnica del portoncino fatturato.
- `operatorQuestion`: “Per Gemma Minore, la commessa STARPUR 15040/2026 con portafinestra 1090x2075 mm è davvero la sua fornitura, oppure va usato il portoncino del preventivo 25/2026?”
- `onboardingGap`: richiedere un riferimento comune fra fattura cliente, preventivo e commessa produttore.

### r38 — DoP con `Trasmittanza termica (Uw)`

La correzione r38 è tecnicamente deterministica e ha risolto localmente Claudia Sellati: sei posizioni complete, accessori 0x0 esclusi, quantità/misure/Uw nello stesso blocco. Ha superato test positivi e negativi, e gli altri 99 casi erano invariati rispetto a r37.

Tuttavia r38 incorporava r37. Quando il difetto di source-binding è emerso, l'intero bundle r38 è stato quarantinato. La correzione Claudia Sellati è ora riproposta in r39 sopra il nuovo gate di legame documentale ed è nuovamente verde nel replay locale.

## Verifica cieca prodotti/misure

Sono stati riesaminati 17 casi usando copie locali dei documenti originali, lettura cieca Claude Code e confronto successivo con APR. Gli output strutturati sono `product-review-shard-{a,b,c}.json`.

### Falsi blocker dimostrati

1. **Massimo Cappello** — 12 posizioni complete; già corretto e attivo in r36.
2. **Claudia Sellati** — 6 posizioni DoP complete; la correzione nata in r38 è ora attiva in r39 dietro il gate di source-binding e il caso è `READY_LOCAL`.
3. **Eugenio Codognato** — fattura 619 con 8 infissi, righe visive complete `NR 1,00` e `(L=...;A=...;)`. APR non ricostruisce l'associazione perché l'estrazione testuale separa le colonne quantità e descrizione. Nessuna correzione applicata: servirebbe parsing geometrico della tabella, non un regex permissivo.
4. **Leo Manini** — fattura con 7 infissi e 1 persiana, misure decimali in centimetri e cardinalità complessiva verificabile. APR non riconosce in sicurezza quantità implicite e decimali nel layout. Nessuna correzione applicata per evitare deduzioni errate.

### Dati parziali o ambigui, correttamente fail-closed

- Guido Calvacchi: misure fattura discordanti dalle misure con/senza coprifili SIDEL. Domanda: “Quali sono le misure definitive installate dei tre serramenti: quelle L/H della fattura o quelle della dichiarazione SIDEL?”
- Marcella Capatti: 7 unità e L/H presenti, ma unità/cross-reference DoP non espliciti. Domanda: “Confermi che le quote sono in millimetri e quale DoP corrisponde a ciascuna unità?”
- Nicla Biagioni: DoP ordine 92 contro fatture ordine 225; zanzariere senza misure. Domanda: “I due ordini coincidono e quali sono quantità/misure delle zanzariere?”
- Loretta Riviera: tre posizioni complete ma manca il DDT 70 che le colleghi al Contratto 62. Domanda: “Le tre posizioni DoP corrispondono in ordine ai tre infissi fatturati e puoi inserire il DDT 70?”
- Cesare Imperiali: tre righe manoscritte con sovrascritture e quarta nota ambigua. Domanda: “Confermi le tre misure e chiarisci se la nota `PORTICATO T.1A Bagno 80x160` indica un quarto serramento?”
- Mauro Leonardi: ordine WnD con 4 posizioni ma consegna Bovisio Masciago, mentre la fattura cliente riguarda Valganna; mancano misure persiane. Domanda: “L'ordine WnD 260062615000004 appartiene davvero al cantiere di Mauro a Valganna? Se sì, indica anche le misure delle quattro persiane.”
- Caterina Claudia Garbato: presente solo luce architettonica, non misura di taglio. Domanda: “Quali sono le misure di taglio effettive della persiana?”
- Marian Maeschi: persiane complete, serramenti con tipo misura/ubicazione illeggibili. Domanda: “Le tre quote sono del prodotto o del vano e a quale ambiente appartengono?”
- Mattia Vatieri: persiane complete; zanzariere e blindato senza schede. Domanda: “Inserisci le schede con misure delle cinque zanzariere e del blindato.”
- Gemma Minore: associazione documentale contraddittoria, descritta sopra.
- Flavia Cipriani: fatture su commessa 1394/2026, documento tecnico su fornitura 1613/2026, nessuna firma prodotto nelle fatture. `missingDocumentType`: documento di collegamento tra commessa fatturata e fornitura tecnica. `operatorQuestion`: “La fornitura tecnica 1613/2026 appartiene davvero alla commessa fatturata 1394/2026 di Flavia Cipriani? Se sì, inserisci il documento che collega esplicitamente i due riferimenti e i sei infissi.”

### Documenti realmente mancanti o caso interno

- Gabriele Girelli: unico file disponibile è il logo PraticaRapida. Domanda: “Inserisci il documento originale con le righe prodotto e le misure.”
- Stefano Buosi: fatture generiche Greenevo 76 3D senza quantità/misure. Domanda: “Inserisci il preventivo, ordine o scheda tecnica con quantità e misure di ogni serramento.”
- `prova rivenditore 1 30/04`: unico file è materiale promozionale interno. Domanda: “Confermi che è una pratica interna da escludere permanentemente dall'automazione?”

## Decisione economica lasciata aperta

Claudia Campagna resta intenzionalmente sospesa. Le fatture originali totalizzano 2.960,00 EUR, mentre una regola esplicitamente autorizzata seleziona 3.134,06 EUR come spesa ammissibile/congrua.

- `classification`: `AMBIGUOUS_AUTHORIZED_FINANCIAL_PRECEDENCE`
- `missingDocumentType`: `null`
- `operatorQuestion`: “Per Claudia Campagna, confermi che su ENEA la spesa ammissibile deve restare 3.134,06 EUR invece del totale lordo fatture di 2.960,00 EUR?”
- `onboardingGap`: distinguere totale lordo, pagato e ammissibile/congruo.

## Difetto dello strumento di replay

Un tentativo di rigenerare da zero l'OCR r38 ha fallito su 64 pratiche perché il binario di replay corrente non riapre alcuni PDF validi ma cifrati/copy-disabled. Il risultato 26/74 è **invalido per i verdetti** e non è stato usato nel gate. La riclassificazione r38 era invece basata sullo stato OCR precedente con 359 documenti verificati, zero hash discordanti e zero analisi fallite. Questo è un limite del collaudo, non un errore attribuito al percorso operativo APR.

## Gate, installazione e tripla verifica

- r38: 444 gruppi, 1.704 test, zero fallimenti; registro `v114`, matrice `v92`, 113/113 regole provate.
- Il gate automatico r38 è risultato insufficiente sul requisito di legame fra fonti: una suite verde non ha compensato la mancanza di una fixture negativa cross-pratica.
- r38 è stato ritirato atomicamente; r36 è stato ripristinato senza riavviare keepalive o Chrome.
- r39: 444 gruppi, 1.708 test, zero fallimenti; registro `v115`, matrice `v93`, 114/114 regole provate. Il gate monotono ha verificato bundle, replay dei 359 documenti originali, delta esatto di otto pratiche e domande strutturate residue.
- r39 è stato promosso atomicamente senza riavviare keepalive o Chrome. Il processo residente antecede r39; il prossimo nuovo processo APR caricherà il bundle r39. Nessun replay operativo è stato eseguito.
- Verifica 1, processi: keepalive PID 98419 e Chrome APR PID 3785 vivi.
- Verifica 2, checkpoint: stato `setup_ready`, revisione 14031, heartbeat aggiornato, contatori anteprima/submit/comunicazioni tutti zero.
- Verifica 3, dashboard: target CDP `Bonus Fiscali - ENEA` presente sulla dashboard; nessuna mutazione eseguita.

## Stato per categoria di prova

- **Affidabilità locale dimostrata:** r39, 29/100 `READY_LOCAL`, 71/100 `OPERATOR_REQUIRED_LOCAL`, 0 analisi fallite; non è una percentuale contrattuale.
- **Autonomia tecnica contrattuale:** deve essere calcolata solo sulle pratiche documentalmente complete e procedibili; i documenti realmente assenti non entrano nel denominatore. La nuova adjudication non è ancora completa abbastanza per fissare il denominatore finale.
- **Replay richiesto:** un futuro replay operativo autorizzato deve confermare r39 su APR nato dopo la promozione. Eugenio/Leo restano candidati soltanto a futuri estrattori geometrici/quantità con prove più forti; nessuna regola permissiva è stata applicata.
- **Test operativo richiesto:** nessuna delle modifiche di oggi è stata provata su ENEA; un futuro test operativo richiede l'autorizzazione prevista.
- **Rischio residuo:** medio. Il gate generale di source-binding ora esiste ed è provato localmente; restano ambiguità documentali reali, layout tabellari non estratti in sicurezza e l'assenza di un replay operativo r39.

## Decisioni richieste a Giuliano

1. Rispondere alla domanda economica di Claudia Campagna.
2. Per Flavia Cipriani, confermare o negare il raccordo fra commessa 1394/2026 e fornitura 1613/2026 e, se esiste, fornire il documento che lo prova.
3. Confermare se `prova rivenditore 1 30/04` è un test interno da escludere.
4. Rispondere alle domande documentali dei casi ambigui elencati sopra; nessuna comunicazione è stata inviata.

## Artefatti principali

- `fresh-original-replay-r36-products.json`: baseline affidabile corrente.
- `product-review-shard-{a,b,c}.json`: letture cieche strutturate prodotti/misure.
- `single-product-declaration-after-r37.json`: prova di estrazione r37, ora insufficiente per source-binding.
- `parenthesized-uw-after-r38.json`: prova positiva della correzione Claudia Sellati.
- `full-vitest-r38-final.json`: suite r38, verde ma non sufficiente.
- `preinstall-gate-attestation-r38.json` e `bundle-install-receipt-r38.json`: promozione poi invalidata dalla nuova evidenza.
- `quarantine-r38-rollback-r36.json`: ritiro r38 e ripristino r36.
- `postinstall-attestation-r36.json`: tripla verifica dopo il ripristino.
- `technical-source-binding-diagnostic-r39.json`: prove originali positive e negative del nuovo gate.
- `fresh-original-replay-r39-products.json`: replay locale r39 sui 100 casi e 359 documenti.
- `full-vitest-r39-final.json` e `rule-gate-r39/rule-test-evidence.json`: suite completa e prove 114/114.
- `preinstall-gate-attestation-r39.json`, `bundle-install-receipt-r39.json` e `postinstall-attestation-r39.json`: gate monotono, promozione e tripla verifica.
- `residual-review-questions-r39.json`: 29 casi cambiati ancora non READY con `classification`, `exactCause`, `missingDocumentType`, `operatorQuestion` e `onboardingGap`.
