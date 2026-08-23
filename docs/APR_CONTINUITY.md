# Continuità operativa APR

La ripresa della fase ENEA TEST create/fill/save è specificata in
[APR_ENEA_DRAFT_EXECUTION.md](./APR_ENEA_DRAFT_EXECUTION.md).

APR usa livelli distinti; nessuno deve essere descritto come se fosse un altro.

1. Il LaunchAgent del supervisore mantiene attiva dashboard e orchestrazione
   locale dopo login e riavvia il processo dopo un arresto.
2. Un LaunchAgent separato mantiene attivo il worker APR. Il worker è l'unico
   esecutore ammesso per le pratiche; Codex non è un esecutore operativo.
3. Il LaunchAgent separato del watchdog osserva PID, heartbeat, checkpoint e
   lavoro eseguibile. Se manca un processo o un checkpoint eseguibile non
   avanza per 300 secondi, richiede un solo `kickstart -k` idempotente e ne
   verifica il nuovo PID o heartbeat entro 60 secondi.
4. I checkpoint atomici mantengono coda, tentativi, audit e report. Un riavvio
   del runtime non deve cambiare l'hash di un checkpoint concluso né reclamare
   due volte una pratica.
5. Lo sviluppo Codex è legato al goal persistente del task APR. L'automazione
   heartbeat `monitor-rigido-laboratorio-crm-enea` è il guardiano di riserva:
   ogni 10 minuti controlla questo stesso task e riprende il primo passo utile
   se non esiste già un turno attivo.

## Stati pubblici

- `WORKING`: esiste una pratica realmente eseguibile; dashboard e checkpoint
  espongono pratica, fase, inizio, ultimo avanzamento e prossima azione.
- `IDLE`: la coda eseguibile è vuota.
- `OPERATOR_REQUIRED`: non restano casi eseguibili e uno o più casi sono stati
  isolati in `Richiesto intervento operatore`.
- `TECHNICAL_BLOCK`: un blocco globale o una ripresa non verificata impedisce
  di proseguire in sicurezza.

Un caso bloccato non arresta la coda: viene isolato e APR passa al successivo.

## Identità vincolanti

- Task APR: `019fffd6-c4aa-76e1-be7e-df9c16c66459`
- Automazione: `monitor-rigido-laboratorio-crm-enea`
- Dashboard cohort installata: `http://127.0.0.1:4465/`
- Stato runtime: `~/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-32`
- Supervisore: `com.praticarapida.apr-enea-cohort32-supervisor`
- Worker: `com.praticarapida.apr-enea-cohort32-worker`
- Watchdog: `com.praticarapida.apr-enea-cohort32-watchdog`

Un heartbeat riferito a un task differente è una configurazione non valida.
L'automazione non deve creare task paralleli o lavorare su copie divergenti.

## Limiti reali

I LaunchAgent utente funzionano soltanto dopo il login macOS; non sono demoni
di sistema attivi prima del login. La ripresa Codex dipende
dall'app Codex disponibile, dal Mac acceso e connesso e dalla disponibilità del
servizio/crediti. Un'autorizzazione generale dell'utente non può sostituire una
conferma che la piattaforma richieda esplicitamente per un'azione sensibile.
In questi casi il guardiano deve registrare e notificare l'unica azione precisa
necessaria, senza dichiarare falsamente che lo sviluppo è in corso.

La continuità locale non dimostra da sola l'integrazione reale CRM/ENEA. Un run
reale richiede adapter verificati e prova server della bozza salvata. Anteprima,
submit, ricevute, email e comunicazioni restano vietati.

## Verifica minima dopo modifiche

- test automatici del supervisore/dashboard;
- typecheck del runner;
- `launchctl print` e `GET /healthz` come fonti indipendenti;
- cambio PID dopo `kickstart -k`;
- hash invariato dei checkpoint conclusi prima/dopo il riavvio;
- task id e intervallo verificati nel file persistente dell'automazione.
