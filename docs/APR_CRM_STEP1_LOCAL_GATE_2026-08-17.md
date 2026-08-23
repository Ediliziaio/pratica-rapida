# APR · gate locale ciclo CRM step 1

Data verifica: 17 agosto 2026.

## Esito

Il primo gate incompleto è stato completato **esclusivamente in locale**. APR dispone ora di un ciclo CRM persistente che rappresenta e verifica:

1. ingresso idempotente di una pratica ENEA dalla pipeline `Pronte da fare`;
2. acquisizione e avanzamento locale della stessa pratica;
3. esito `bozza salvata` oppure `Richiesto intervento operatore`;
4. domanda strutturata con motivo, campo, fonte e prove;
5. risposta operatore persistente;
6. riaccodamento idempotente della stessa pratica in `Pronte da fare`;
7. ripresa da una nuova revisione CRM senza creare un secondo caso.

Ogni comando viene prima registrato come intento persistente. Audit e transizioni riportano gli ID delle regole applicate. Un arresto fra intento e applicazione viene recuperato senza perdita e senza duplicazione.

## Sicurezze preservate

- `externalActionAllowed=false` resta vincolante.
- Nessuna chiamata o modifica al CRM reale è stata effettuata.
- Nessuna azione su ENEA o sul browser reale è stata effettuata in questo gate.
- Anteprima, submit, ricevute, email e comunicazioni restano vietati.
- Gli automatismi CRM esistenti e l'integrazione CRM→Cruscotto sono rappresentati da impronte invarianti e non vengono modificati.
- Beatrice Ciotta è esclusa anche all'ingresso del ciclo.

## Collaudi verdi

- Regressione completa seriale: **113 file, 676 test superati**.
- Ciclo CRM persistente: due pratiche consecutive, blocco isolato della prima, prosecuzione della seconda, crash fra intento e applicazione, risposta operatore e riaccodamento senza duplicazioni.
- Dashboard: risposta operatore tramite endpoint locale protetto, persistenza e visibilità dopo riavvio.
- Batch locale: 15 input, duplicato e blocchi per-pratica senza perdita della coda.
- Driver Chrome su fixture esclusivamente locale: 24 test verdi, incluso riavvio, due pratiche consecutive e allocazione 36%; nessun uso del browser o di ENEA reali.
- Controllo tipi del runner e build applicativa: verdi.

## Runtime installato

- Dashboard: `http://127.0.0.1:4472/`
- API ciclo CRM locale: `http://127.0.0.1:4472/api/crm-integration-workflow`
- Stato persistente: `~/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-40/crm-integration-workflow/checkpoint.json`
- Bundle supervisore installato, SHA-256: `219250994a574cf62296bffa6e6afdfa4a1c852159e4df35779d195ca6b2b79a`
- Servizi LaunchAgent verificati: supervisor, worker e watchdog attivi sotto `gui/501`.

Lo stato pubblico corretto a coda vuota è `IDLE — coda CRM locale vuota`; non viene presentato come lavoro in corso.

## Limiti reali residui

Questo gate non costituisce integrazione CRM reale né disponibilità in produzione. Il prossimo gate richiede un adattatore CRM reale separatamente autorizzato e verificato, con mappatura degli identificativi effettivi di pipeline/stati e prove di non interferenza con gli automatismi esistenti. Fino a quel gate APR non legge né sposta pratiche nel CRM reale e il ciclo installato resta una macchina a stati locale osservabile.

L'invio ENEA, l'acquisizione della mail/ricevuta, il PDF finale, WhatsApp e le comunicazioni appartengono a gate successivi e restano disabilitati.
