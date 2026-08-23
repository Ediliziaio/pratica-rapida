# APR cohort45 — analisi del test fallito e correzione salvataggio

> Nota di rettifica (cohort46, 18/08/2026): l'aspettativa locale `11/11` riportata in fondo a questo documento non costituiva una certificazione end-to-end sul portale. Il test successivo ha prodotto 8 bozze salvate e ha isolato tre rami UI non ancora certificati: autocomplete Comune, modale cointestatario e persistenza asincrona dell'allocazione 36%. Per Monica Ambra Fioravanti, l'evidenza successiva sostituisce anche l'ipotesi del solo timeout `Runtime.evaluate`: il Comune digitato non era stato selezionato dalla lista obbligatoria ENEA. L'analisi aggiornata e' in `APR_COHORT46_EIGHT_OF_ELEVEN_ANALYSIS_2026-08-18.md`.

Data verifica: 18/08/2026.

## Esito reale del test precedente

Il test non e' considerato superato: su 14 pratiche ammesse (Giovanni Dalle Donne escluso) APR ha prodotto 6 bozze salvate, ha isolato 3 casi gia' non eseguibili in preflight e ha isolato 5 casi per difetti tecnici del driver portale.

### Blocchi coperti dalle regole esistenti

- Vittorio Paolinelli: form cliente assente e codice fiscale non ricavabile in modo valido e coerente dalle fonti originarie consentite. Esito corretto: `Richiesto intervento operatore`; nessun valore inventato. Regole applicate: `core-form-first`, `user-2026-08-14-valid-original-document-cf-over-invalid-form`, `user-2026-08-16-fiscal-code-identity-cross-check`.
- Sara Lionti: prodotto VEPA riconosciuto, ma modulo VEPA non ancora abilitato. Esito corretto: caso parcheggiato. Regola applicata: `user-2026-08-16-vepa-deferred-until-module-enabled`.
- Gianluca Percaccioli: prodotto avvolgibile non ancora coperto e altezza documentale ambigua (229/2290). Esito corretto: `Richiesto intervento operatore`; nessuna conversione inferita.

### Blocchi che erano difetti APR

- Gianluca Dalle Donne, Tommaso Cecchi e Claudio Beghini: la GET canonica ha provato che la pagina Beneficiario non era stata persistita. La causa era il precedente controllo di salvataggio non sufficientemente robusto rispetto al mount/hydration React e all'effettivo evento fisico richiesto dal portale.
- Luca Callegari: il modale del cointestatario ignorava il click sintetico JavaScript. Il difetto e' stato riprodotto su fixture che accetta soltanto un evento attendibile, poi corretto usando un unico click fisico CDP sull'unico pulsante Salva gia' validato.
- Monica Ambra Fioravanti: una singola `Runtime.evaluate` lunga restava appesa durante il remount React e scadeva. La verifica post-salvataggio usa ora sonde brevi, indipendenti e solo read-only; non emette un secondo Salva durante l'attesa.

Il portale non ha quindi perso un salvataggio gia' accettato: nei casi documentati la richiesta di salvataggio non era stata accettata/persistita e la successiva GET mostrava i campi vuoti. APR ha correttamente evitato di dichiarare successo, ma il driver era la causa del mancato risultato.

## Correzioni software

- unico click fisico CDP per il Salva del cointestatario, dopo intento persistito e verifica di unicita'/visibilita' del controllo;
- polling post-GET composto da letture brevi e indipendenti, resistente al remount React;
- conservazione del principio fail-closed: nessuna bozza e' dichiarata salvata senza redirect server o rilettura GET coerente;
- nessuna modifica alle regole business; anteprima, submit e comunicazioni restano vietati.

## Verifiche indipendenti

1. Test mirati driver: salvataggio cointestatario, hydration e pagina Beneficiario — 3/3 verdi.
2. Suite driver/worker/checkpoint/servizio — 107/107 test verdi; typecheck verde.
3. Suite riavvio/dashboard/watchdog/lease — 42/42 test verdi. Dopo l'installazione il checkpoint esecuzione ha lo stesso SHA-256 prima e dopo il riavvio (`7406ac58961a8c9eafd8f7dc27ee36c2c17246ddf5d8963639439e4e5e16d1dd`), quindi nessun job e' stato perso o duplicato.

Bundle worker installato SHA-256: `859b1fe60f2e139c0250367389094a4a3a26e508ca8e51d014a81a13c738ba65`.

## Limite residuo

La correzione e' verificata localmente e installata, ma non e' ancora certificata da un nuovo salvataggio operativo sul portale reale. Le cinque pratiche isolate non sono state riaccodate o modificate durante questa riparazione. Il prossimo test operativo dovra' confermare il comportamento reale su nuove esecuzioni APR; Codex non deve compilare le pratiche.

## Decisioni successive dell'utente

- Vittorio Paolinelli, Sara Lionti e Gianluca Percaccioli sono esclusi da tutte le future coorti di test del modulo schermature. Lo storico resta immutato.
- Luca Callegari resta lavorabile. Il checkpoint preflight e quattro testi OCR originari concordano sul secondo beneficiario Maria Giovanna Angela Pinna, CF `PNNMGV84B43G203G`. Il blocco osservato era nel Salva del modale ENEA, non nella lettura della fattura.
- Il parser fattura riconosce ora la stessa identita' anche quando OCR separa descrizione, nominativo e CF su tre righe contigue; il test positivo e il controllo di payload sono verdi.
- Ripetendo il test precedente senza i tre esclusi, i cinque casi tecnicamente recuperabili sono Gianluca Dalle Donne, Luca Callegari, Tommaso Cecchi, Claudio Beghini e Monica Ambra Fioravanti. L'aspettativa locale e' 11/11 bozze sui casi ammissibili, da confermare con un nuovo test operativo APR sul portale reale.
