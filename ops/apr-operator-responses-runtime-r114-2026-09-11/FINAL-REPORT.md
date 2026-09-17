# APR — canale runtime delle risposte operatore r114

## Esito

Il difetto è chiuso: le risposte operatore non restano più in un file di audit passivo. APR dispone ora di un registro runtime globale, condiviso fra coorti, con payload strutturati, hash del contenuto, scrittura atomica, ricevute applicative e consumo nei preflight comune e Infissi.

Il bundle installato è `8f1f1648-operator-responses-scope-r114-20260911`. Il worker installato ha SHA-256 `1c4649f78adf39d9fe908790accf95fd918846ebae76ac93176b7b150f2618ce`.

Non è stata eseguita alcuna pratica e non è stata effettuata alcuna azione su CRM o ENEA.

## Risposte migrate

Sono state importate 34 risposte attive nel registro globale:

- 7 richieste di riacquisizione documenti: Bigalli, Zaniboni, Giacotto, Bellini, Girelli, Lomartire, Buosi;
- 3 disposizioni pratica: Gerbaudo non lavorabile, Formisabo/Formisano rimossa dal CRM, Maeschi chiusa;
- 2 risposte complete su prodotti/misure: Mondini 540 × 400 cm, Kasermann 300 × 200 cm;
- 1 risposta catastale: Maggi, foglio 9 e particella 6642;
- 1 risposta vecchi infissi: Depalma, metallo e vetro doppio per cinque infissi;
- 1 cardinalità fisica: Capatti, sette infissi;
- 2 casi ancora in attesa di dato esterno: Munafò e Juscamaita;
- 17 conferme di regole generali già certificate: misure nella descrizione, prima finestra per la zanzariera, esclusione cassonetti dai prodotti ENEA e precedenza della data fine lavori del form rivenditore.

Il registro runtime è in `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state/operator-responses/checkpoint.json`, revisione 1, SHA-256 logico `53d25a6dc0c67418019a0156302d6fd534bbbb5a0613bc47b10a7ab4bf91de9b`.

## Verifica su fascicoli reali già persistiti

Un replay locale read-only, ricostruito dai dossier e dalle analisi reali delle coorti storiche, ha verificato il percorso completo senza accedere al portale:

- Mondini: prodotto 5400 × 4000 mm consumato e ricevuta persistita;
- Kasermann: prodotto 3000 × 2000 mm consumato e ricevuta persistita;
- Maggi: foglio 9 e particella 6642 applicati e ricevuta persistita;
- Depalma: metallo/vetro doppio consumati dal preflight Infissi su cinque righe e ricevuta persistita;
- Maeschi: `closed_externally` applicato prima del preflight e ricevuta persistita.

Capatti e Cigognetti sono correttamente presenti nel registro, ma non vengono falsamente marcati come applicati: sui loro vecchi fascicoli il percorso si arresta prima, rispettivamente su conflitto delle fonti tecniche e prova fattura incompleta per le chiusure. La risposta resta disponibile per una futura generazione che superi quelle precondizioni.

## Sicurezza aggiuntiva r114

La verifica reale ha portato a chiudere un margine fail-closed: una risposta associata a un `practiceId` non è più visibile a un chiamante che omette l’ID o presenta un ID differente. È utilizzabile soltanto sulla pratica esatta; le sole risposte deliberatamente globali possono essere riusate senza quell’associazione.

## Test e governo

- Typecheck runner: verde.
- Suite non-CDP seriale: 1930/1930.
- Suite CDP/socket nell’ambiente corretto: 82/82.
- Totale: 2012/2012.
- Gate di attivazione: `PASS`.
- Registro operativo: `enea-operational-registry-v165`.
- Matrice: `apr-enea-rule-test-matrix-v178`, 220 voci.
- Ammissione governance: tutti e tre gli eseguibili `admitted`.
- Hash installati e ricevuta concordano con il puntatore canonico corrente.

Restano soltanto i quattro gap storici del 6 agosto già esplicitamente autorizzati e due debiti di collegamento legacy preesistenti; nessuno è stato introdotto da r114.

## Limite della prova

L’affidabilità locale e l’installazione sono dimostrate. Non è stato eseguito un test operativo su ENEA in questo lavoro; le ricevute nel registro globale verranno create quando una futura esecuzione autorizzata consumerà davvero le risposte.

Dettaglio macchina: `verification-summary.json` nella stessa cartella.
