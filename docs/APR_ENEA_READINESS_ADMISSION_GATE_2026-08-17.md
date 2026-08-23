# APR — gate admission readiness ENEA

Data: 17 agosto 2026  
Coorte persistente: `apr-pilot-40`  
Dashboard: <http://127.0.0.1:4472/>

## Esito

Il controller persistente `apr_persistent_enea_readiness_admission` ha completato il collaudo esclusivamente locale e ha accodato automaticamente il gate successivo `operational_enea_readonly_discovery`.

Il collaudo non ha aperto browser, CRM o ENEA e non ha eseguito richieste di rete. Tutte le capability esterne e mutative sono rimaste `false`; preview, submit, ricevute e comunicazioni restano vietati.

## Fasi checkpointate

1. integrità e contratto del manifest bridge;
2. identità persistente e allowlist tramite fixture locale;
3. cinque prove GET/HEAD, inclusa la lettura allegato simulata;
4. acquisizione lease readiness con dieci controlli verdi;
5. singolo keepalive HEAD innocuo e replay idempotente;
6. scadenza fail-closed senza inferire logout;
7. recupero con nuovo owner e completamento dell'admission.

Ogni transizione registra gli ID del registro unico:

- `system-readonly-adapter-contract`;
- `system-enea-lease-required`;
- `system-exclusive-runner-lease`;
- `system-atomic-checkpoint-resume`;
- `system-apr-crm-integration-boundary`.

## Collaudo

- typecheck runner: verde;
- controller/orchestratore/readiness/adapter/watchdog/pipeline: 44 test verdi;
- dashboard locale e riavvio supervisore: 9 test verdi;
- riavvio del LaunchAgent supervisor: checkpoint admission, orchestratore, adattatore e lease invariati byte-per-byte;
- servizi persistenti dopo riavvio: supervisor, worker e watchdog `running`;
- dashboard/API: admission `completed_local_admission`, fase `completed`, 7/7 fasi, gate successivo visibile.

## Checkpoint e prove

- admission: `~/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-40/crm-live-processing/runtime/apr-enea-readiness-admission/checkpoint.json`;
- orchestratore: `~/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-40/crm-live-processing/runtime/apr-gate-orchestrator/checkpoint.json`;
- API admission: <http://127.0.0.1:4472/api/apr-enea-readiness-admission>;
- API orchestratore: <http://127.0.0.1:4472/api/apr-gate-orchestrator>;
- health: <http://127.0.0.1:4472/healthz>.

## Limite residuo reale

Il gate successivo è `operational_enea_readonly_discovery` ed è intenzionalmente `waiting_safety_gate`. La dicitura pubblica `TECHNICAL_BLOCK` indica che il collegamento operativo reale non è ancora stato ammesso: non è un arresto silenzioso né una perdita della coda. Il prossimo lavoro deve implementare e verificare il discovery read-only reale prima di consentire qualunque collegamento a una sessione browser/ENEA.
