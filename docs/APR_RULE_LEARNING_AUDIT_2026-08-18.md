# APR — audit apprendimento regole e confronto CRM

Data: 18/08/2026.

## Conclusione

L'impressione dell'utente era fondata: prima di questa correzione non esisteva un vincolo unico che dimostrasse che ogni correzione discussa fosse contemporaneamente registrata, testata e presente nei processi persistenti installati. Il dashboard della coorte 47 mostrava infatti `0/29` regole attive e mancava `rule-test-evidence.json`. Inoltre il supervisor costruito dal repository e quello installato avevano SHA-256 diversi.

La coorte 47 dimostra anche che il ritardo residuo non dipendeva soltanto dalle regole business. Sette casi sono arrivati rapidamente a bozza; quattro hanno richiesto recuperi successivi per rami tecnici del portale: selezione obbligatoria del Comune, modale cointestatario, persistenza asincrona del 36% e prova finale di un Salva incerto. Nelle coorti 45 e 46 gli stessi rami erano ancora difetti del driver, non dati mancanti.

Infine i repeat-test `come mai lavorati` erano stati deliberatamente configurati per rileggere CRM e fonti e non riusare dossier normalizzati, preflight o risultati precedenti. Questo rendeva il test indipendente, ma impediva di ottenere velocita' tramite cache. Le regole dovevano comunque essere riusate; i risultati e le letture del singolo caso no.

## Correzione applicata

- Nuova regola di sistema `system-apr-learning-closure-gate`: una correzione non puo' essere chiamata appresa finche' non esiste la catena incidente/blocco → ID del registro → test automatico → fingerprint del contenuto → bundle installato identico.
- Matrice portata a 32 regole, includendo esplicitamente selezione controllata del Comune e recupero idempotente del Salva incerto.
- Impronta SHA-256 della sostanza di registro e matrice: un cambio dimenticato senza incremento versione invalida comunque l'evidenza precedente.
- Gli stati sono ora distinti: `pending_test`, `tested_not_deployed`, `active_tested_deployed`.
- Il comando di certificazione verifica l'esistenza di tutti gli ID, esegue la suite deterministica a singolo worker, costruisce i tre bundle e confronta i loro SHA-256 con i file installati.
- Supervisor e worker v39 installati con copie precedenti recuperabili; watchdog invariato perche' gia' coincidente.

## Prove

1. Suite locale: 118 file e 779 test verdi; include coda, crash/ripresa, due pratiche consecutive, blocco isolato, Comune da lista, cointestatario, 36%, Salva incerto, dashboard e watchdog.
2. Deployment: SHA-256 costruiti e installati identici per supervisor `c522e9cf...`, worker `cdcb72ec...` e watchdog `8c6d8808...`; checkpoint `rule-activation` in stato `active_tested_deployed`.
3. Runtime: dashboard `http://127.0.0.1:4478/` mostra `32/32 attive/testate/installate`; supervisor, worker e watchdog sono `running` sotto `gui/501`.

## Perche' il confronto CRM era stato dichiarato impossibile

Era una regressione del comparatore nuovo, non un limite del CRM. `aprSavedDraftComparison` controllava soltanto dossier, fonti originarie, mapping e prove server e concludeva erroneamente che il benchmark dell'operatore richiedesse CPID o dati strutturati. Il registro gia' autorizzava invece, dopo la bozza TEST salvata, un secondo passaggio separato che legge in sola lettura il PDF ENEA storico del CRM esclusivamente come benchmark.

Le prove storiche confermano che questo percorso funzionava: coorte 44-v2, 6/6 PDF e 225 campi; coorte 46, 8/8 PDF e 311 campi. Il testo errato del comparatore e la documentazione della coorte 47 sono stati corretti.

Il confronto corretto e' stato poi eseguito anche sulla coorte 47: 11/11 PDF disponibili, 438 campi confrontati, 35 differenze registrate. I valori storici non sono stati propagati a mapper, regole o bozze. Campi esclusi: impianto termico, risparmio energetico, finestre protette e data fine lavori TEST.

## Limiti residui

- `active_tested_deployed` prova che la regola e' nel software installato e coperta dai test; la conferma definitiva di un ramo UI reale resta un test operativo APR sul portale.
- Un repeat-test completamente pulito continuera' a rileggere le fonti per scelta di indipendenza. Una normale ripresa della stessa pratica usa invece checkpoint e idempotenza e non deve ripetere azioni gia' provate.
- Le 35 differenze col benchmark storico non sono automaticamente errori APR: molte sono assunzioni operative intenzionali o differenze manuali prive di fonte. Devono essere classificate senza permettere al PDF storico di correggere il mapper.

