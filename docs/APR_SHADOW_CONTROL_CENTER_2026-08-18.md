# APR SHADOW — centro di controllo e avvio esplicito

Data: 2026-08-18

## Flusso implementato

1. Il servizio APR persistente può restare acceso con ingresso chiuso.
2. L'utente preme `Avvia APR` nella dashboard locale.
3. Solo da quel momento il runtime live può interrogare in lettura la pipeline CRM `Pronte da fare`.
4. APR prende in carico una pratica alla volta e conserva checkpoint e audit.
5. Una pratica non risolvibile viene mostrata fra le bloccate con motivo e prossima azione; la coda può proseguire.
6. Una pratica conclusa compare fra le lavorate fino alla fine con ID bozza e conteggio delle pagine verificate.
7. Quando entrambi i risultati sono sigillati, il comparatore mostra differenze APR ↔ operatore CRM e relativa fonte.

## Protezioni permanenti

- nessuna acquisizione prima del via esplicito;
- nessuna coorte interroga il CRM senza via; il via esplicito abilita il runtime installato senza ricreare i servizi e senza cancellare lo storico;
- il via sopravvive al riavvio ed è idempotente;
- la sospensione chiude soltanto nuove prese in carico;
- mutazioni CRM, preview, submit, ricevute e comunicazioni restano vietati;
- Beatrice Ciotta resta esclusa.

## Evidenze richieste prima dell'uso operativo reale

- test automatico del gate chiuso/aperto e della persistenza dopo riavvio;
- test HTTP locale con protezione origin/CSRF;
- typecheck e bundle persistenti verdi;
- tre riscontri runtime: LaunchAgent attivi, checkpoint aggiornato, dashboard/API concordi.

L'installazione del controllo non equivale all'avvio del periodo SHADOW reale: il checkpoint installato deve restare `stopped` fino al comando dell'utente.

## Esito del collaudo e installazione

- typecheck runner: verde;
- test del modello/control/comparatore: 17/17 verdi;
- suite riavvio APR: 44/44 verde;
- dashboard HTTP, comando CSRF e ripresa del via dopo riavvio: 11/11 verdi;
- build applicazione: verde;
- supervisor installato SHA-256 `e6c56e7b5c8b4d4f65dff84b0b94659ca640cff3518cf33f1ff85ca9cb2708b3`;
- supervisor, worker e watchdog LaunchAgent `cohort52`: `running`;
- dashboard: `http://127.0.0.1:4483/`;
- checkpoint installato: `stopped`, `intakeAllowed=false`;
- dashboard e API concordi su `APR NON AVVIATO`;
- log stderr dei tre servizi vuoti dopo il riavvio controllato.

## Limite operativo residuo

Il controllo e il flusso sono installati, ma non è stato premuto `Avvia APR`: nessuna nuova pratica reale è stata acquisita in questa consegna. Il primo collaudo operativo reale dovrà verificare su una nuova pratica in `Pronte da fare` l'intera sequenza CRM read-only → dossier → preflight → bozza salvata → confronto con il risultato umano. La produzione e l'invio ENEA restano non autorizzati.
