# APR — prova ripetuta cronometrata coorte 37

Data: 16 agosto 2026  
Esecutore operativo: `apr_persistent_runtime` tramite LaunchAgent `com.praticarapida.apr-enea-cohort37-worker`  
Worker PID osservato: `70119`  
Supervisor PID osservato: `70326`  
Watchdog PID osservato: `70121`

## Esito

Il test si è concluso con tre bozze ENEA nuove, complete e salvate in sequenza:

| Pratica | Bozza | Pagine | Creazione | Salvataggio finale | Tempo portale per pratica |
| --- | ---: | ---: | --- | --- | ---: |
| Amelia Lerose | 412018 | 10/10 | 16:36:02.284 | 16:37:26.502 | 1m 24.218s |
| Cataldo Cassone | 412021 | 8/8 | 16:37:30.698 | 16:38:50.720 | 1m 20.022s |
| Lea Dettori | 412025 | 8/8 | 16:38:54.967 | 16:40:09.726 | 1m 14.759s |

Ogni pratica ha `createAttemptCount=1`, `saveAttemptCount=1` e una sola operazione di salvataggio per ciascuna pagina. Le tre bozze hanno ID distinti. Anteprima, submit e comunicazioni sono rimasti a zero.

## Tempi

- Timer utente/attivazione LaunchAgent: 16:31:39.
- Prima acquisizione CRM read-only persistente: 16:35:14.482.
- Primo intento bozza ENEA: 16:36:02.284.
- Ultimo salvataggio verificato lato server: 16:40:09.726.
- Tempo totale misurato dal segnale di partenza: 8m 30.726s.
- Tempo pipeline persistente, dall'acquisizione del primo dossier all'ultima bozza salvata: 4m 55.244s.
- Tempo sequenza portale, dal primo intento di creazione all'ultimo salvataggio: 4m 07.442s.

Il tempo totale include circa 3m 35s di riparazione dell'entrypoint LaunchAgent del supervisore. Questa anomalia di avvio è separata dai tempi netti delle pratiche.

## Recuperi osservati

Il portale non ha reso immediatamente identificabile il risultato della creazione per Cataldo e Lea. APR ha registrato il blocco circoscritto, ha continuato la coda e ha eseguito discovery server-side sullo stesso intento persistente. Entrambe le bozze sono state ritrovate e riutilizzate senza una seconda creazione e senza intervento umano.

## Verifiche indipendenti

1. `launchctl` ha mostrato supervisor, worker e watchdog attivi con i PID sopra riportati.
2. Il checkpoint `enea-draft-execution/checkpoint.json` è `completed`, con tre elementi `saved`, 26/26 pagine completate, tre ID distinti e contatori di creazione/salvataggio uguali a uno.
3. La dashboard locale `http://127.0.0.1:4470/` ha riportato acquisizione CRM, allegati, preflight e bozze `completed`; worker `completed` e watchdog `IDLE — coda vuota`.

La compilazione del portale è stata eseguita dal processo APR persistente. Codex ha attivato/corretto il servizio e letto i checkpoint, senza usare un controller browser per compilare campi o salvare bozze.
