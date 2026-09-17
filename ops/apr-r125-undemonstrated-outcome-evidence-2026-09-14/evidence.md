# Evidenze read-only — esito non dimostrabile / worker fermato in r125

Run sorgente: `apr-workable83-operator-responses-payload-form-r125-20260914`  
Metodo: sola lettura di checkpoint worker, ledger CDP, checkpoint esecuzione, checkpoint supervisore e journal del sequencer persistiti.  
Orari: ISO 8601 UTC come registrati dagli artefatti originali.

Questo documento separa i fatti osservati dalle inferenze. In particolare, “worker sparito” non descrive correttamente tutti e sei i casi: quattro worker hanno pubblicato un esito terminale fail-closed e sono stati poi spenti pulitamente; negli altri due il sequencer ha richiesto la quiescenza mentre lo stato di esecuzione non era ancora terminale.

## Vincenzo Falconi — coorte 9284

- Bozza: `495721`; pagina interessata: `Anagrafica Beneficiario`; pagine contabilizzate dal sequencer: `0/9`.
- Ultimi eventi worker: preparazione conclusa alle `18:22:50Z`, primo `save_page_once` iniziato alle `18:22:52Z`; alle `18:23:53Z` la GET canonica ha provato `not_saved` e ha autorizzato l’unico recupero; secondo salvataggio iniziato alle `18:24:59Z`; isolamento alle `18:25:58Z`; worker fermato alle `18:26:00Z`.
- Verifica incerta: `inspect_persisted_page_values_readonly` (`cdp-server-13-3931c46121d328c42fc8`) ha visto tutti i campi significativi vuoti; la prova `server_redirect` è rimasta inconclusiva. Dopo il recupero, l’evidenza `cdp-server-18-3931c46121d328c42fc8` non ha dimostrato la persistenza.
- Portale osservato: bozza creata; la pagina beneficiario non risultava persistita alla GET canonica. Il secondo tentativo ha generato due POST HTTP 200, ma nessuna prova server conclusiva del salvataggio.
- Processo: non è morto inaspettatamente. Il worker ha pubblicato `case_isolated`, poi il supervisore ha ricevuto `SIGTERM` ed è terminato pulitamente alle `18:26:01Z`.
- Esito r125: `INCONSISTENT` nel sequencer (`case_inconsistent_after_worker_quiescence`), non una bozza salvata verificata.
- Fonti: `cohorts/apr-pilot-9284-global-controller-vincenzo-falconi/{enea-browser-worker/checkpoint.json,enea-browser-worker/cdp-driver.json,enea-draft-execution/checkpoint.json,supervisor/checkpoint.json}` e `runs/...r125.../case-9284-vincenzo-falconi/sequencer.log`.

## Gemma Minore — coorte 9290

- Bozza: `495737`; pagina interessata: `Anagrafica Beneficiario`; pagine contabilizzate dal sequencer: `0`.
- Ultimi eventi worker: sessione verificata alle `18:38:18Z`, recupero preso in carico alle `18:38:20Z`, pagina ripreparata alle `18:39:19Z`, salvataggio di recupero iniziato alle `18:39:21Z`, isolamento alle `18:40:20Z`, worker fermato alle `18:40:22Z`.
- Verifica incerta: la GET canonica del primo tentativo ha dato `not_saved`; la verifica del redirect è rimasta inconclusiva. Dopo l’unico recupero il worker ha registrato `uncertain_page_save_recovery_failed`.
- Portale osservato: bozza creata, ma nessuna persistenza della prima pagina dimostrata lato server.
- Processo: non è morto inaspettatamente. Ha isolato il caso in modo fail-closed ed è poi terminato pulitamente; il supervisore ha chiuso su `SIGTERM`.
- Esito r125: `INCONSISTENT` dopo la quiescenza, non una bozza salvata verificata.
- Fonti: `cohorts/apr-pilot-9290-global-controller-gemma-minore/{enea-browser-worker/checkpoint.json,enea-browser-worker/cdp-driver.json,enea-draft-execution/checkpoint.json,supervisor/checkpoint.json}` e `runs/...r125.../case-9290-gemma-minore/sequencer.log`.

## Paolino Bellini — coorte 9291

- Bozza: `495743`; pagina interessata: `Anagrafica Beneficiario`; pagine contabilizzate dal sequencer: `0/8`.
- Ultimi eventi worker: primo salvataggio iniziato alle `18:42:01Z`; GET canonica `not_saved` e recupero autorizzato alle `18:43:01Z`; preparazione di recupero conclusa alle `18:44:03Z`; secondo salvataggio iniziato alle `18:44:05Z`; isolamento alle `18:45:04Z`; worker fermato alle `18:45:06Z`.
- Verifica incerta: `persisted_fields_get` (`cdp-server-13-973574f95047983964f2`) ha visto tutti i campi significativi vuoti; `server_redirect` è rimasto inconclusivo. Dopo il recupero, l’evidenza `cdp-server-18-973574f95047983964f2` non ha dimostrato il salvataggio.
- Portale osservato: bozza creata; ENEA segnalava `id-telefono` non valido (`Inserire solo numeri`). Nel recupero sono comparsi due POST HTTP 200, senza prova server conclusiva di persistenza.
- Processo: non è morto inaspettatamente. Il worker si è isolato, poi è stato reso quiescente; supervisore chiuso pulitamente su `SIGTERM` alle `18:45:07Z`.
- Esito r125: `INCONSISTENT` dopo la quiescenza, non una bozza salvata verificata.
- Fonti: `cohorts/apr-pilot-9291-global-controller-paolino-bellini/{enea-browser-worker/checkpoint.json,enea-browser-worker/cdp-driver.json,enea-draft-execution/checkpoint.json,supervisor/checkpoint.json}` e `runs/...r125.../case-9291-paolino-bellini/sequencer.log`.

## Milena Fiorini — coorte 9214

- Bozza: `493927`; pagina interessata: `screening:1`; cinque pagine risultavano già completate, dodici attese.
- Ultimi eventi worker: preparazione screening conclusa alle `13:00:27Z`; primo salvataggio alle `13:00:35Z`; GET canonica `not_saved` e recupero autorizzato alle `13:01:27Z`; recupero salvato alle `13:01:57Z`; seconda verifica diagnostica alle `13:02:30Z` e `13:03:04Z`; isolamento alle `13:03:04Z`; worker fermato alle `13:03:06Z`.
- Verifica incerta: la GET canonica (`cdp-server-41-6d25c9e04ab0ced190f0`) ha visto lo screening non persistito; il redirect è rimasto inconclusivo. Dopo il recupero, `verify_screening_post_save_failed_readonly_diagnostic` non ha prodotto una prova server positiva.
- Portale osservato: bozza e prime cinque pagine presenti; sullo screening il DOM segnalava `id-gtot` non valido sia al primo tentativo sia al recupero. I POST di salvataggio hanno risposto HTTP 200, ma lo screening non è stato dimostrato persistito.
- Processo: non è morto inaspettatamente. Il worker ha pubblicato `case_isolated`; supervisore terminato pulitamente su `SIGTERM` alle `13:03:07Z`.
- Esito r125: `INCONSISTENT` dopo quiescenza, con ragione “Rilettura server senza prova dopo l’unico recupero autorizzato”.
- Fonti: `cohorts/apr-pilot-9214-global-controller-milena-fiorini/{enea-browser-worker/checkpoint.json,enea-browser-worker/cdp-driver.json,enea-draft-execution/checkpoint.json,supervisor/checkpoint.json}` e `runs/...r125.../case-9214-milena-fiorini/sequencer.log`.

## Lucia Droghetti — coorte 9218

- Bozza: `494037`; pagina interessata: `Anagrafica Beneficiario`; una pagina risultava salvata su otto attese.
- Ultimi eventi worker: bozza creata alle `13:12:26Z`; pagina preparata alle `13:12:52Z`; salvataggio iniziato alle `13:12:54Z`; alle `13:13:32Z` la verifica read-only ha risolto il salvataggio come `saved`; sessione nuovamente verificata alle `13:13:34Z`; recupero del checkpoint preso in carico alle `13:13:37Z`; worker fermato alle `13:13:39Z`.
- Verifica incerta: il click iniziale aveva esito incerto, ma `persisted_fields_get` (`cdp-server-13-7888883a4b35c43d04d7`) ha poi visto tutti i campi attesi e ha registrato `resolved_saved`.
- Portale osservato: prima pagina realmente persistita secondo la GET canonica. Non era necessario un secondo Salva.
- Processo: il sequencer ha interpretato la coppia stato `filling` / salvataggio `resolved_saved` come `uncertain_save_lifecycle_invalid:state_status_mismatch:filling:resolved_saved` alle `13:13:37Z`, ha isolato il caso e ha reso quiescente la coorte. Supervisore chiuso pulitamente su `SIGTERM` alle `13:13:40Z`.
- Esito r125: `TECHNICAL_BLOCK` del sequencer dovuto alla propria validazione dell’automa, mentre il checkpoint esecuzione era ancora `running/filling`; non è un “worker sparito”.
- Fonti: `cohorts/apr-pilot-9218-global-controller-lucia-droghetti/{enea-browser-worker/checkpoint.json,enea-browser-worker/cdp-driver.json,enea-draft-execution/checkpoint.json,supervisor/checkpoint.json}` e `runs/...r125.../case-9218-lucia-droghetti/sequencer.log`.

## Fausta De Filippo — coorte 9267

- Bozza: `495558`; pagina interessata: `Immobile`; `Anagrafica Beneficiario` risultava già salvata.
- Ultimi eventi worker: pagina Immobile preparata alle `17:00:15Z`; primo salvataggio alle `17:00:40Z`; GET canonica `not_saved` e recupero autorizzato alle `17:01:17Z`; recupero preso in carico alle `17:01:26Z`; pagina ripreparata alle `17:02:11Z`; secondo intento di salvataggio registrato alle `17:02:13Z`; worker rilevato non attivo alle `17:02:29Z`.
- Verifica incerta: `persisted_fields_get` (`cdp-server-17-c3beab10f09e36975737`) ha visto tutti i campi significativi della pagina Immobile vuoti; `server_redirect` è rimasto inconclusivo. L’unico recupero non è arrivato a una verifica server conclusiva.
- Portale osservato: bozza esistente e prima pagina salvata; pagina Immobile non persistita alla GET canonica. Il DOM riportava `id-gg` non valido.
- Processo: alle `17:02:13Z` il sequencer ha diagnosticato `uncertain_save_lifecycle_invalid:recovery_save_intent_checkpoint_invalid` mentre l’esecuzione era ancora `ready/save_intent_recorded`; nello stesso istante il servizio ha registrato `stop_requested` per `SIGTERM`. Alle `17:02:29Z` il PID worker non esisteva più e il sequencer ha chiuso l’intero run di singolo caso con `apr_case_finalizer_worker_not_quiescent`.
- Esito r125: divergenza strutturale tra sequencer e checkpoint durante il recupero; il worker è stato fermato dal percorso di quiescenza, non c’è evidenza di crash spontaneo.
- Fonti: `cohorts/apr-pilot-9267-global-controller-fausta-de-filippo/{enea-browser-worker/checkpoint.json,enea-browser-worker/cdp-driver.json,enea-draft-execution/checkpoint.json,enea-browser-worker/service.json,supervisor/checkpoint.json}` e `runs/...r125.../case-9267-fausta-de-filippo/{checkpoint.json,sequencer.log}`.

## Sintesi fattuale

- Quattro casi (`Falconi`, `Minore`, `Bellini`, `Fiorini`): il worker ha completato il proprio percorso fail-closed con `case_isolated`; non è sparito. Il problema osservato è l’assenza di una prova server conclusiva dopo il solo recupero ammesso.
- Un caso (`Droghetti`): la prova server era diventata positiva (`resolved_saved`), ma il sequencer ha considerato invalida la combinazione con lo stato ancora `filling` e ha fermato la coorte.
- Un caso (`De Filippo`): il sequencer ha considerato invalido il checkpoint dell’intento di recupero e ha richiesto `SIGTERM` mentre il worker era ancora nel percorso di salvataggio; il worker è poi risultato non attivo.
- In nessuno dei sei artefatti letti compare una prova di arresto causato da logout ENEA, crash del Mac o chiusura spontanea di Chrome.
