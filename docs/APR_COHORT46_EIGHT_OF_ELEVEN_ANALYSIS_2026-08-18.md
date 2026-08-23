# APR cohort46 — analisi 8 bozze su 11 casi ammessi

Data verifica: 18/08/2026.

## Esito reale

La coda APR e' terminale: 8 bozze complete e salvate, 3 casi isolati come `Richiesto intervento operatore`, nessuna anteprima, nessun submit e nessuna comunicazione. Le tre bozze esistenti non sono state ricreate e i casi non sono stati rilanciati durante questa diagnosi.

La precedente definizione «11 pratiche compilabili» era troppo ampia. Le undici pratiche erano complete e coerenti sul piano di fonti, regole e preflight; non erano ancora tutte certificate sui rami UI reali del portale. La categoria corretta era quindi «11 data-ready», non «11 end-to-end portal-ready».

## Monica Ambra Fioravanti — bozza 414606

La causa indicata dall'utente e' confermata dai checkpoint APR e dal codice del driver. Il Comune di nascita atteso era `SESTO S.GIOVANNI`; APR digitava il testo nel controllo autocomplete, ma il vecchio driver considerava sufficiente la corrispondenza testuale e non provava la selezione di una voce della lista. Il portale lasciava percio' il controllo non valido e la GET canonica successiva mostrava vuoti i campi significativi della pagina Beneficiario. Anche l'unico recupero autorizzato non e' stato persistito.

Correzione:

- input fisico CDP nel controllo autocomplete;
- scelta fisica obbligatoria di una voce visibile;
- equivalenza controllata tra abbreviazioni come `S.` e `San`;
- blocco pre-Salva se manca la prova di selezione o `aria-invalid` e' vero;
- rilettura canonica GET come unica prova di persistenza.

Test di regressione: fixture con sorgente `Sesto S.Giovanni` e opzione portale `Sesto San Giovanni (MI)`, verde.

## Luca Callegari — bozza 414603

Il preflight era completo e il cointestatario era provato dalla fattura originaria: Maria Giovanna Angela Pinna, CF `PNNMGV84B43G203G`. Il blocco e' avvenuto nel modale «Altro beneficiario», prima di completare la prima pagina. L'intento di salvataggio e' auditato, ma la riga non e' stata riletta nella tabella.

Il driver compilava i campi controllati dal front-end con setter DOM ed eventi sintetici, poi eseguiva un click fisico su Salva. Quel contratto non garantiva che il front-end reale avesse acquisito nome, cognome e CF.

Correzione:

- digitazione fisica CDP dei tre campi;
- perdita del focus controllata e verifica di validita';
- un solo click fisico su Salva;
- diagnostica persistente di campi, messaggi e stato modale se la riga non compare;
- rilettura della riga salvata prima di proseguire.

Test di regressione del modale e della rilettura GET, verde.

## Gianluca Dalle Donne — bozza 414602

Sette pagine su nove erano gia' state salvate. Il solo blocco era `Calcolo costi e detrazioni`: il piano richiedeva EUR 0 al 50% ed EUR 3.050 al 36%, mentre la GET canonica leggeva ancora EUR 3.050 al 50% ed EUR 0 al 36%.

Il driver accettava l'aggiornamento ottimistico della tabella React subito dopo Salva e passava troppo presto alla rilettura canonica. Non attendeva realmente l'assestamento della richiesta asincrona del portale.

Correzione:

- dopo la chiusura del modale e la prima corrispondenza della tabella, APR resta sulla stessa route per l'assestamento;
- seconda verifica della tabella prima della GET canonica;
- successo soltanto se la GET canonica conserva l'allocazione 36%.

Test di regressione dell'allocazione generale 36%, verde.

## Verifiche indipendenti

1. Evidenze persistenti reali: checkpoint esecuzione, diagnostiche CDP e GET canoniche distinguono i tre difetti e confermano 8 `saved` + 3 `operator_intervention`.
2. Verifica software locale: 28/28 test completi del driver, 11/11 worker, 12/12 servizio e 56/56 checkpoint esecuzione; typecheck verde.
3. Verifica installazione: bundle ricostruito e worker installato hanno lo stesso SHA-256 `3e0e604328d0717aff331a15e8b58aae8e9f91df77cc59a18707f5e4c8a9ae5e`; worker, supervisore e watchdog risultano attivi e la dashboard espone la coda terminale 8+3.

## Limite residuo

Le correzioni sono collaudate localmente e installate, ma i tre rami non sono ancora certificati da un nuovo passaggio operativo APR sul portale reale. Non e' quindi corretto promettere 11/11 fino a quel collaudo. Codex non deve compilare le pratiche: il prossimo eventuale test operativo resta di esclusiva esecuzione APR.
