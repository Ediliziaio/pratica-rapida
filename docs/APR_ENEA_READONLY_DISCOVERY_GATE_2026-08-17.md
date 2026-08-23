# APR — gate discovery operativo ENEA read-only

Data: 17 agosto 2026  
Coorte: `apr-pilot-40`  
Dashboard: <http://127.0.0.1:4472/>

## Esito

Il controller persistente `apr_persistent_enea_readonly_discovery` ha trasformato il safety gate passivo in un piano locale versionato, auditato e ripristinabile. Il piano è completato `5/5` e il successivo gate `real_enea_readonly_attach` è stato accodato automaticamente.

Non sono stati aperti browser, finestre o schede; non sono stati collegati CRM o ENEA e non è stata eseguita alcuna richiesta esterna.

## Contratto verificato

- riuso esclusivo del profilo e delle schede esistenti;
- nessuna nuova finestra, scheda, profilo privato o navigazione;
- cinque superfici pianificate: indice CRM `GET`, metadati allegato `HEAD`, corpo allegato `GET`, autenticazione ENEA `GET`, keepalive ENEA `HEAD`;
- nessun corpo richiesta o intento mutativo;
- autenticazione basata su prova server e marcatore DOM;
- `login_required` soltanto con prova server di logout;
- mismatch identità come blocco tecnico globale;
- allegato mancante come blocco per-pratica, senza fermare le altre.

## Collaudo

- typecheck runner verde;
- 48 test controller/pipeline/watchdog/readiness/adattatore verdi;
- 9 test dashboard/riavvio verdi;
- riavvio del LaunchAgent supervisor verificato;
- hash di checkpoint, piano discovery e orchestratore identici prima/dopo il riavvio;
- supervisor, worker e watchdog `running`;
- dashboard e API mostrano `completed_local_discovery`, piano `5/5` e gate successivo.

## Limite residuo reale

`real_enea_readonly_attach` resta `waiting_safety_gate`. Questo è il primo gate che richiederebbe un collegamento reale alla sessione browser esistente. Fino alla sua verifica tecnica restano `false`: browser, nuove schede, navigazione, mutazioni CRM, azioni ENEA, preview, submit, ricevute e comunicazioni.

## Percorsi

- checkpoint: `~/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-40/crm-live-processing/runtime/apr-enea-readonly-discovery/checkpoint.json`;
- piano: `~/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-40/crm-live-processing/runtime/apr-enea-readonly-discovery/plan/discovery-plan.json`;
- API: <http://127.0.0.1:4472/api/apr-enea-readonly-discovery>.
