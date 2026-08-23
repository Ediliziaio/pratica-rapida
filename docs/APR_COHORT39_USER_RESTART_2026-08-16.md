# APR cohort39 — riavvio reale con dieci nomi utente

Coorte richiesta dall'utente il 16 agosto 2026. La coda versionata è `config/apr/cohort39-user-ten-screenings.json`.

Il cronometro operativo parte dal primo checkpoint APR successivo al riavvio in cui CRM e ENEA risultano autenticati e la coda è eseguibile. Termina quando tutte le dieci pratiche sono terminali: bozza completa e salvata oppure `Richiesto intervento operatore`. Il report conserva anche tempo di avvio del servizio, attese di login, tempi per fase e durata complessiva, così il tempo macchina non viene confuso con l'attesa umana.

Vincoli: esecutore `apr_persistent_runtime`; una pratica alla volta; blocchi isolati; nessuna perdita o duplicazione; stop alla bozza salvata; anteprima, submit, ricevute, email e comunicazioni vietati. Prima dell'avvio ogni nome deve essere risolto dal CRM in sola lettura in una sola pratica ENEA; pratiche assenti o ambigue vengono isolate senza fermare le altre.
