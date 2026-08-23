# APR — esecutore ENEA autonomo

## Confine operativo

Codex sviluppa, testa e distribuisce il software. Durante un run ENEA valido non controlla Chrome e non esegue click, compilazioni o salvataggi. Tali azioni appartengono esclusivamente al processo persistente `com.praticarapida.apr-enea-browser-worker`.

Il worker usa un profilo Chrome dedicato e persistente, una porta DevTools solo loopback, una coda durevole e checkpoint prima/dopo ogni azione. I contatori di anteprima, submit e comunicazioni devono restare sempre a zero.

## Gate

1. `setupEnabled=false`, `operationalEnabled=false`: servizio vivo ma nessuna finestra o azione ENEA.
2. `setupEnabled=true`, `operationalEnabled=false`: APR apre/riaggancia soltanto il proprio profilo e verifica il login. Nessuna pratica è selezionata.
3. `setupEnabled=true`, `operationalEnabled=true`: consentito soltanto dopo verifica DOM reale e coda con almeno due payload verdi. APR crea, compila e salva le bozze in sequenza; anteprima, submit, ricevute, email e comunicazioni restano vietati.

Con `autoArmWhenReady=true` non serve un turno Codex dopo il login: il servizio verifica autonomamente contratto DOM, cardinalità della coda, esclusione di Beatrice Ciotta e flag di sicurezza. Soltanto se tutti i gate sono verdi rende `operationalEnabled=true`; altrimenti resta fermo prima della selezione pratica e ripete il controllo in modo read-only.

Il keepalive ENEA è eseguito dal worker ogni 240 secondi con un solo `GET` autenticato alla root consentita. Continua anche dopo il completamento della coda; una prova server esplicita di logout produce `login_required` globale senza ticket pratica.

## Prove obbligatorie

- processo: PID/istanza del worker e PID/profilo Chrome APR nella dashboard;
- coda: checkpoint di almeno due casi terminali, un solo ID bozza e un solo tentativo per pagina;
- server: evidenze DOM/server con fingerprint e stato bozza salvata, prodotte dal driver APR.

Una compilazione eseguita dal controller browser di Codex non è una prova APR e deve essere esclusa dalla certificazione.
