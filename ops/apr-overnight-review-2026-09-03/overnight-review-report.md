# APR — revisione locale identità, prodotti e date (3 settembre 2026)

## Ambito e sicurezza

- Attività esclusivamente locale/replay; nessuna creazione o modifica di bozze ENEA, anteprima, submit o comunicazione.
- Campione operativo originario immutato: 100 casi, manifest SHA-256 `51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0`.
- Metodo manuale: documenti reali materializzati per pratica, lettura cieca Claude Code, confronto successivo con APR.
- La metrica contrattuale sarà autonomia tecnica sui soli casi documentalmente completi e procedibili. I documenti realmente assenti non entrano nel denominatore; gli errori APR su documenti presenti restano invece fallimenti tecnici.

## Replay locale corrente sui 100

- Artefatto: `../apr-wide100-local-replay-current-2026-09-03/local-replay-current-source.json`.
- Stato corrente: 28 `READY_LOCAL`, 72 con classificazione ancora richiesta.
- Famiglie per pratica dopo il replay corrente (non mutuamente esclusive): finanziaria 51, prodotti/misure 52, date/procedibilità 25, identità 12, altro 1.
- Questi numeri non sono il tasso di autonomia tecnica: comprendono falsi blocker e assenze documentali non ancora separate.

## Identità — 4 casi più Marco De Marinis

Artefatti:

- documenti e manifest: `../apr-manual-review-identity-batch-01-2026-09-03/blind-documents/`;
- lettura cieca: `../apr-manual-review-identity-batch-01-2026-09-03/claude-blind-review.json`;
- confronto: `../apr-manual-review-identity-batch-01-2026-09-03/apr-vs-blind-comparison.json`.

Esiti:

- Enrico Amos Maria Berneri: falso blocker CF risolto con regola generale su candidato documentale valido e riconciliato.
- Francesca Maria Monti: falso blocker CF risolto con `system-invoice-customer-block-crm-cf-v1`; il CF CRM è accettato solo se checksum, prefissi fiscali e blocco `CLIENTE` della stessa pagina concordano. CF presenti soltanto nei bonifici o nomi discordanti restano fail-closed.
- Sabrina Eustomi: lacuna reale; fattura con nome/CF ma data e luogo di nascita assenti. Documento mancante: modulo cliente firmato o documento d'identità con data e luogo di nascita. Domanda: “Inserisci il modulo cliente completo e firmato oppure un documento leggibile che riporti data e luogo di nascita della beneficiaria.”
- Massimiliano Montemorra: il CRM associa la pratica a `rm legno` e lascia nullo il campo `fornitore`, mentre dichiarazione del produttore e fatture 87F/157F identificano Erre Emme S.r.l. APR ha letto parte dei dati Erre Emme, ma non correttamente nel complesso: ha duplicato le sei aperture fisiche in dodici righe tra acconto e saldo, non ha riconciliato i totali espliciti e non ha promosso il modulo raccolta firmato che espone identità e CF. Decisione residua: autorità del modulo raccolta. `operatorQuestion`: “Confermi che la scheda firmata del 31/03/2026 in 07-supporting.pdf, pagina 2, proveniente dal fascicolo Erre Emme/RM Legno, è un modulo cliente autorevole da cui usare anagrafica e codice fiscale di Massimiliano Montemorra?”
- Marco De Marinis: €4.090,91 è l'imponibile della fattura 312/FE, non una fattura d'acconto mancante. Il falso riferimento è risolto da `system-explicit-advance-invoice-reference-marker-v1`. Resta da chiarire la differenza di €840,20 fra fattura 317/FE (€10.000,00) e bonifico (€9.159,80).

## Prodotti/misure — 9 casi

Artefatti:

- documenti: `products-batch-01/blind-documents/`;
- lettura cieca: `products-batch-01/claude-blind-review.json`;
- confronto: `products-batch-01/apr-vs-blind-comparison.json`.

Falsi blocker tecnici risolti:

- Mimosa Freni: 6 prodotti P01–P06 conservati 1:1 dal documento tecnico posizionale.
- Elena Marcella Berti: 1 prodotto con misura inline L3000x2200.
- Riccardo Coda: 1 prodotto L4600x2200; regole generali per acconto/saldo percentuale e quantità SdI omessa soltanto quando prezzo unitario = importo riga.

Lacune/ambiguità reali residue:

- Nadia Ragni: mancano quantità/misure delle tende a caduta laterali e resta conflitto sul tessuto.
- Maria Sofia Tosatti: dimensioni prodotto assenti; 140x240 è solo la finestra protetta; manca anche pagina 4/5 modulo cliente.
- Antonella Ferletic: 75x220 e 400x220 possono essere due tende o due moduli di una tenda.
- Giulia Kasermann: quantità e dimensioni della Dubai 350 assenti.
- Sarah Mondini: duplicati di due sole fatture; misure prodotto assenti.
- Roberta Di Cesare: L/H assenti e pagina 5/5 del modulo cliente mancante.

Le domande precise e `missingDocumentType` sono nel confronto strutturato.

## Date/procedibilità — 14 casi

Artefatti:

- 58 documenti reali, 230 pagine OCR e relativi render in `dates-batch-01/blind-documents/`;
- hash aggregato documenti: `d9b2272647d0779b634be757701629cd3e3f3e89c470281581c6a21757952214`;
- manifest SHA-256: `37755445ae50e0449d2835b3be63ccc3b1ed473cffc208069dfb12858ed3fe6d`;
- 501 contesti data OCR persistiti in `dates-batch-01/persisted-ocr-date-candidates.json`, SHA-256 `20cd6ce3dfbf365480418d95e979fea72d1d6a1ae98554190d2482ba6042bbbd`;
- protocollo cieco: `dates-batch-01/claude-blind-review-prompt.md`;
- quattro letture cieche: `dates-batch-01/claude-blind-review-shard-{a,b,c,d}.json`;
- lettura cieca unificata: `dates-batch-01/claude-blind-review.json`, SHA-256 `626be0c1ed0094ddc799acefb4eecd6b4bad9bc2dbe8228e488a37222c7cfe40`;
- confronto strutturato: `dates-batch-01/apr-vs-blind-comparison.json`.

Esito cieco nome per nome:

- Mattia Vatieri — nessuna data esplicita di fine lavori/posa;
- Leo Manini — nessuna data esplicita di fine lavori/posa;
- Maurizia Coreggioli — nessuna data esplicita di fine lavori/posa;
- Antonino Formisabo/Formisano — nessuna data esplicita di fine lavori/posa. Tessera sanitaria, carta d'identità, tre fatture e dichiarazione tecnica riportano concordemente `FORMISANO`; APR ha mantenuto `FORMISABO` dal campo cliente CRM, nonostante nello stesso dossier il campo proprietario riporti `Formisano`. Non è ambiguità dei documenti né errore OCR: è una precedenza errata della fonte CRM. `operatorQuestion`: “Confermi che il cognome corretto è FORMISANO e che FORMISABO nel campo cliente del CRM è un refuso da correggere?”;
- Gianfranco Lavezzi — nessuna data esplicita di fine lavori/posa;
- Andreea Ioana Olteanu — nessuna data esplicita di fine lavori/posa;
- Vito Fusillo — nessuna data esplicita di fine lavori/posa;
- Giovanni Amadu — nessuna data esplicita di fine lavori/posa;
- Ida Gigliotti — nessuna data esplicita di fine lavori/posa;
- Giuseppe D'Adduzio — dichiarazione esplicita: “I lavori di installazione sono terminati in data 17.07.2026”; APR usava erroneamente la fattura del 04/07/2025;
- Giovanna Atzeni — nessuna data esplicita di fine lavori/posa;
- Marcella Capatti — dichiarazione di collaudo finale della posa in opera datata 12/02/2026; APR usava erroneamente la fattura del 05/08/2025;
- Caterina Claudia Garbato — nessuna data esplicita di fine lavori/posa;
- Mauro Leonardi — nessuna data esplicita di fine lavori/posa.

Conclusione: 12 lacune documentali reali e 2 errori tecnici generali di precedenza/estrazione. Per i 12 casi senza prova il documento mancante è `dichiarazione o verbale con data esplicita di fine lavori/posa`; domanda operatore: “Inserisci un documento che dichiari esplicitamente la data di fine lavori o di completamento della posa.”; gap onboarding: richiedere obbligatoriamente un documento datato di fine lavori/posa distinto da fatture e pagamenti.

Correzione generale `system-explicit-original-completion-date-v1`: una dichiarazione originaria inequivoca di fine installazione o un collaudo finale datato della posa prevalgono sul fallback fattura. Date amministrative, fatture, pagamenti e descrizioni generiche non valgono; date esplicite divergenti restano fail-closed. Il replay locale ripetuto sui 100 ha SHA canonico `1cf3820f35f3fec303e58bc6aae3f976d5d4673618b5fba63b594052ed0b7bdf`: Giuseppe non ha più blocker data; Marcella usa 12/02/2026 e conserva soltanto il controllo procedurale oltre 90 giorni.

## Gate e installazione

- Gate completo pre-correzione identità: 220 file, 1.674 test, tutti verdi.
- Gate mirato post-correzione identità: 3 file, 114 test, tutti verdi.
- Gate mirato finale: 3 file, 117 test, tutti verdi.
- Gate completo finale ripetuto sul sorgente esatto installato: 442 suite, 1.679 test, tutti verdi; report SHA-256 `f1b3055eb6b800b762af66cce7b354cd9ff35977dff33749b736049ab20a0192`.
- Registro `enea-operational-registry-v108`; matrice `apr-enea-rule-test-matrix-v86`; 106/106 regole con due prove distinte materializzate.
- Gate monotono rispetto al bundle r31 installato: 1.679 test candidati contro 1.662 baseline, nessuna regressione.
- Bundle locale installato atomicamente: `versions/24fcd1bf-overnight-review-r32-20260903`; worker SHA-256 `24fcd1bf222fee8a472c5e3b2232784ea6d8150cda929d7b02a89be5e6dfdb57`.
- Certificazione macchina: `rule-gate-r32/rule-activation/checkpoint.json`, stato `active_tested_deployed`, hash costruiti e installati identici.
- Il keepalive non è stato riavviato: PID 35873 invariato; Chrome APR PID 3785 invariato; heartbeat e prova server read-only aggiornati; contatori anteprima/submit/comunicazioni tutti zero.
- Categoria verificata: test automatici/locali, replay locale sui 100 e installazione bundle locale. Non è stato eseguito alcun test operativo ENEA e non viene dichiarata disponibilità in produzione.

## Decisioni/verifiche residue

1. Massimiliano Montemorra — `operatorQuestion`: “Confermi che la scheda firmata del 31/03/2026 in 07-supporting.pdf, pagina 2, proveniente dal fascicolo Erre Emme/RM Legno, è un modulo cliente autorevole da cui usare anagrafica e codice fiscale di Massimiliano Montemorra?”;
2. Antonino Formisabo/Formisano — `operatorQuestion`: “Confermi che il cognome corretto è FORMISANO e che FORMISABO nel campo cliente del CRM è un refuso da correggere?”;
3. campione umano del 20% sui casi in cui Claude e APR concordano, con numerosità e selezione congelate dalle matrici prima dell'ispezione umana;
4. decisioni procedurali sui casi oltre 90 giorni, inclusa Marcella Capatti: la data è ora corretta, ma APR non deve decidere autonomamente il portale/ammissibilità;
5. collaudo operativo ENEA soltanto il 7-8 settembre, con autorizzazione e disciplina distinta; questa attività ha validato esclusivamente replay locale e software.
