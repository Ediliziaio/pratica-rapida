# APR — certificazione pilota di due bozze ENEA reali

Data: 16 agosto 2026  
Ambito: portale ENEA reale, sole bozze TEST, nessuna anteprima, nessun submit, nessuna comunicazione.

## Esito

APR ha elaborato autonomamente una coda reale e ha completato due pratiche consecutive:

| Cliente | Bozza ENEA | Pagine salvate | Creazioni | Gate finali | Esito |
| --- | ---: | ---: | ---: | ---: | --- |
| Lorena Brendas | 411600 | 11/11 | 1 | 1 | bozza completa e salvata |
| Luca Maestri | 411601 | 8/8 | 1 | 1 | bozza completa e salvata |

Per entrambe le pratiche il driver ha registrato una prova server `verify_complete_draft_readonly`. Il contatore delle azioni vietate (`preview`, `submit`, ricevute, email, delete/update) è pari a zero.

Le azioni risultano attribuite al servizio APR permanente: LaunchAgent `com.praticarapida.apr-enea-cohort31-worker`, processo Node del bundle `apr-enea-worker.mjs`, identità browser persistente `apr-chrome-profile:0ffd88dd3d6c108727f75fdea9df20f642bcfd92afbde077ce27e6cf7ce4bc9b`. Durante l'esecuzione non è stato usato il controller browser di Codex.

## Prova di riavvio e idempotenza

Il LaunchAgent del worker è stato riavviato dopo il completamento. Prima e dopo il riavvio:

- hash SHA-256 del checkpoint di esecuzione invariato: `052fbceeeeb131577ee98a248cd28feca9cb33aa295b2122528c2893de25e357`;
- ID bozza invariati: `411600` e `411601`;
- contatori per ciascun caso invariati: una creazione e un gate finale;
- contatori globali delle mutazioni invariati: 3 `create_draft_once` e 22 `save_page_once`, comprendenti anche il caso isolato;
- nessun job perso e nessuna pagina già salvata ripetuta;
- worker e supervisore nuovamente attivi dopo il riavvio.

## Verifiche software

- `eneaDraftExecution.test.ts` e `aprEneaBrowserWorkerService.test.ts`: 28/28 test verdi;
- typecheck del runner ENEA: verde;
- dashboard locale: HTTP 200 e checkpoint `eneaDraftExecution.status=completed` visibile su `http://127.0.0.1:4464`.

La suite CDP estesa era già verde sulla revisione del driver usata dal worker. Una ripetizione finale della suite completa è rimasta nel teardown oltre il tempo operativo ed è stata interrotta; non viene quindi conteggiata come ulteriore prova verde. La modifica finale riguardava soltanto la selezione del prossimo checkpoint recuperabile ed è coperta dal risultato reale e dai 28 test mirati.

## Limite residuo reale

Federica Cappuccilli, bozza `411599`, resta isolata in `operator_intervention`: il portale ha prodotto un timeout dopo l'unico intento di salvataggio della pagina Intervento. APR non ha ripetuto il salvataggio incerto, come richiesto dall'idempotenza. Il limite riguarda quel caso e non ha arrestato la coda: Lorena e Luca sono state completate successivamente.

La certificazione prova l'autonomia del modulo APR per due pratiche supportate fino alla bozza salvata. Non autorizza anteprima, invio, ricevute, email o produzione senza i relativi gate futuri.

## Continuità sessione

Dopo la conclusione della coda il LaunchAgent è rimasto attivo e ha eseguito autonomamente il keepalive read-only periodico. Prova più recente della certificazione: evento `verify_session_dom_server_get`, revisione driver 154, `2026-08-16T02:18:17.793Z`, evidenza `cdp-server-154-9b4efbe80d3023335d01`. I contatori mutativi sono rimasti invariati e le azioni vietate sono rimaste a zero.
