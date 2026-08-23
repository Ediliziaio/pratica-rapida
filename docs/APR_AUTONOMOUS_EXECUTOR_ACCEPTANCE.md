# APR — criterio vincolante di autonomia ENEA

## Separazione dei ruoli

Codex può esclusivamente sviluppare, testare localmente, installare e osservare APR. Codex non può compilare, salvare o guidare tramite il proprio controller browser le pratiche usate per certificare l'autonomia.

APR è autonomo soltanto quando un processo persistente APR distinto da Codex:

1. mantiene una propria connessione browser e una sessione ENEA stabile;
2. acquisisce dalla coda almeno due pratiche consecutive;
3. crea una sola bozza per pratica dopo intento persistente;
4. compila e salva ogni pagina dopo checkpoint e intento persistenti;
5. riprende dopo arresto/riavvio senza perdere o duplicare pratiche, bozze o salvataggi;
6. si ferma alla bozza completa e salvata, senza anteprima, submit o comunicazioni;
7. conserva Beatrice Ciotta esclusa.

## Prova obbligatoria

La dichiarazione «APR autonomo» richiede tre prove indipendenti:

- audit del worker APR con PID/istanza, comandi idempotenti e prove server;
- checkpoint della coda con due bozze distinte, complete, salvate e un solo tentativo per transizione;
- osservazione server/dashboard ENEA coerente, senza chiamate browser eseguite da Codex durante il run.

Fixture locali, pacchetti pronti o una pratica compilata da Codex non soddisfano questo criterio.
