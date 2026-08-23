# APR — gate attach reale Chrome read-only

Data: 17 agosto 2026  
Coorte: `apr-pilot-40`  
Dashboard: <http://127.0.0.1:4472/>

## Esito reale

Il gate `real_enea_readonly_attach` è ora implementato, persistente e visibile. Il tentativo controllato non ha creato finestre o schede, non ha navigato e non ha emesso richieste di rete.

Il primo risultato operativo era `TECHNICAL_BLOCK`: Chrome Default era in esecuzione, l'estensione ChatGPT installata e abilitata e il native host corretto, ma il browser client non otteneva il canale di comunicazione. Dopo l'autorizzazione è stata aperta una sola finestra di riaggancio `about:blank` nel profilo Default e il controller si è collegato.

L'utente ha poi aperto manualmente le sole schede CRM ed ENEA richieste. Il canale dell'estensione Browser era caduto dopo il primo attach; il plugin Chrome è stato disinstallato e reinstallato dalla UI Codex, quindi Chrome è stato riavviato una volta con worker e watchdog temporaneamente sospesi.

Il nuovo attach ha enumerato esattamente CRM `https://app.praticarapida.it/kanban` ed ENEA `https://bonusfiscali.enea.it/dashboard`. I DOM già caricati hanno provato rispettivamente la pipeline CRM autenticata e il banner ENEA `Utente connesso` con dashboard disponibile. Lo stato corrente è `completed_readonly_attach`, con prova live fresca, allowlist degli host e impronte SHA-256 dei due DOM. Nessuna scheda è stata creata, nessuna navigazione o richiesta è stata emessa dal controller e nessuna mutazione è stata eseguita.

Dopo la riattivazione, il profilo Chrome persistente del worker APR è stato autenticato dall'utente via SPID. Il worker è `setup_ready`, il contratto DOM ENEA è verde e la prova server GET innocua è auditata; l'operatività sulle pratiche resta disabilitata in attesa del gate minimo di coda.

Il gate successivo `real_enea_server_readonly_probe` è stato completato alle `2026-08-17T14:14:57.380Z`: prova GET server fresca e contratto dashboard concordano, i contatori mutativi sono a zero e il fingerprint persistente è `89166bef2d4bcfb6f1417cda043adf3e69cbbae74b4b2756a130695bf87d10e4`.

## Correzione software

- nuovo controller `apr_persistent_enea_real_readonly_attach`;
- checkpoint atomico con fingerprint delle prove;
- distinzione esplicita tra trasporto controller, schede, DOM, logout server e blocchi per-pratica;
- blocco globale, senza ticket su una pratica;
- audit con ID delle regole applicate;
- API e sezione dashboard dedicate;
- watchdog aggiornato per mostrare il motivo e la prossima azione del gate;
- nuovo validatore persistente del gate server read-only, che rifiuta prove scadute, contatori mutativi non nulli, configurazione operativa o associazioni a pratica/bozza;
- ripresa idempotente: checkpoint attach e orchestratore invariati dopo riavvio del supervisore.

## Collaudo

- typecheck runner verde;
- 17 test mirati prova live/controller/gate/watchdog verdi, incluse scadenza della prova, host errato, mutazione vietata e trasporto instabile dopo attach;
- 28 test controller/pipeline/gate/watchdog verdi nel collaudo completo precedente;
- 9 test dashboard/riavvio verdi;
- supervisor, worker e watchdog `running` sotto `gui/501`;
- dashboard e API raggiungibili dopo riavvio;
- sei gate consecutivi completati, incluso `real_enea_server_readonly_probe`;
- stato pubblico dopo il riavvio: worker `setup_ready`, CRM processing `operator_required` per otto casi storici isolati, watchdog `OPERATOR_REQUIRED`, coda eseguibile vuota;
- hash checkpoint attach invariato: `add547651f611004462ee9f2d557c540127a46a499cd338d26dcfe7656b795a4`;
- hash orchestratore invariato: `c2a784fde1af70a2eb0a69eb6a0c88b8901bb15d16ee310ef93c133bee3bf301`.

## Limite residuo preciso

Il trasporto Chrome, l'attach DOM reale e il gate server read-only sono verdi. Il worker APR è autenticato e `setup_ready`, ma `operationalEnabled=false`: nessuna pratica verrà selezionata finché non esisterà e non sarà verificata una coda minima eseguibile. Questo non è ancora un collaudo operativo di compilazione ENEA.

Restano `false`: nuove schede, navigazione, richieste di rete, mutazioni CRM, azioni ENEA, preview, submit, ricevute e comunicazioni.

## Percorsi

- checkpoint: `~/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-40/crm-live-processing/runtime/apr-enea-real-readonly-attach/checkpoint.json`;
- API: <http://127.0.0.1:4472/api/apr-enea-real-readonly-attach>;
- dashboard: <http://127.0.0.1:4472/>.
