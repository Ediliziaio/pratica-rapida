# Servizio persistente macOS

## Stato attuale

Il LaunchAgent è **installato e caricato** nella sessione utente macOS, dopo consenso esplicito ricevuto il 14 agosto 2026. L'etichetta è `com.praticarapida.enea-shadow-supervisor`; `RunAtLoad` e `KeepAlive` assicurano avvio dopo login e ripresa del processo.

Il servizio usa un bundle Node autonomo e non dipende dal worktree o da `node_modules`:

```text
/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/supervisor.mjs
/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state
```

Il plist installato, con permessi `0600`, è:

```text
/Users/giulianolavoro/Library/LaunchAgents/com.praticarapida.enea-shadow-supervisor.plist
```

## Preparazione e verifica sicure

```sh
npm run enea:service -- prepare
npm run enea:service -- verify
```

I controlli verificano percorsi, eseguibile Node, bundle autonomo, directory stato scrivibile, `RunAtLoad`, `KeepAlive`, porta loopback 4317, token template, assenza di comandi loader, sintassi con `plutil`, permessi e piattaforma macOS.

Il comando di preparazione resta non privilegiato e non carica da solo il servizio; i suoi campi attestano questo comportamento, non lo stato launchd esterno:

```text
installationOrLoadPerformed: false
systemInstallationState: not_checked_by_design
requiresExplicitConsent: true
```

## Esecuzione autonoma e osservabilità

Quando il supervisore è attivo, la dashboard `http://127.0.0.1:4317/` è di osservazione e non contiene comandi per avviare, fermare o modificare pratiche. Il LaunchAgent ospita anche l'esecutore locale: un batch già preparato e armato viene lavorato senza dipendere da chat o turni Codex. Un blocco per-pratica viene persistito e la coda prosegue; un gate tecnico globale non reclama pratiche.

L'unica form locale ammessa è `http://127.0.0.1:4317/auth/crm`, dedicata alla sessione CRM APR. La richiesta è limitata a loopback, origin esatto, CSRF, `application/x-www-form-urlencoded` e corpo massimo 16 KiB. Email e password sono inviate soltanto all'endpoint Supabase Auth allowlist; la password non viene persistita. Il refresh token viene salvato nel Portachiavi macOS con servizio `it.praticarapida.apr.crm.session`, senza passarlo nella riga di comando; access token e refresh token non compaiono in checkpoint, log, API o dashboard. Il POST di autenticazione non abilita POST/PUT/PATCH/DELETE sui dati CRM e non apre il gate delle pratiche.

La configurazione pubblica viene estratta dal bundle pubblico CRM e validata contro l'origine esatta, senza leggere cookie, local storage o token Chrome:

```sh
npm run apr:enea -- crm-auth-configure \
  --root "/percorso/runtime/state" \
  --public-bundle "/percorso/bundle-crm-pubblico.js"
```

`GET /api/crm-auth` espone soltanto stato, account mascherato, fingerprint, scadenza e audit con ID regola. Il supervisore riprende la sessione dal Portachiavi dopo un riavvio e ruota il refresh token con prova server; un rifiuto reale del server riporta il gate CRM a `login_required` senza acquisire pratiche.

Gli avvisi di blocco/completamento usano il Centro notifiche macOS con fallback nell'inbox durevole del runtime. `GET /api/notifications` espone l'ultimo esito di consegna. Nessuna notifica usa rete, Codex o OpenAI.

## Verifica del servizio installato

```sh
launchctl print gui/501/com.praticarapida.enea-shadow-supervisor
curl -fsS http://127.0.0.1:4317/healthz
curl -fsS http://127.0.0.1:4317/api/status
curl -fsS http://127.0.0.1:4317/api/notifications
curl -fsS http://127.0.0.1:4317/api/crm-auth
```

Il LaunchAgent parte al login dell'utente, non prima del login. `KeepAlive` riavvia il processo; `ThrottleInterval=15` evita un loop serrato ed è coerente con la lease di recupero del supervisore.

La prova reale del 14 agosto 2026 ha osservato stato `running`, cambio PID da 14276 a 14292 dopo `kickstart -k`, `restartCount = 1`, dashboard HTTP 200 e ripresa auditata con `supervisor_restarted`. Il deploy readiness/lease ha portato il servizio a `runs = 4`; il successivo deploy adattatore fixture a `runs = 5`, PID 17383 e `restartCount = 4`. `/api/readiness` e `/api/adapter` riportano entrambi il gate pratiche chiuso. Il checkpoint runner è rimasto byte-per-byte invariato in tutti i deploy.

La prova reale del 15 agosto 2026 del servizio autonomo ha osservato `runs = 25`, cambio PID `89605 → 89621`, heartbeat HTTP attivo dopo il riavvio, hash checkpoint runner invariato `7721fad2b170f9a3cf8b3cf1f14b6b9ab3d972d7a368a3aac0f55be7f637383c` e una sola notifica persistita prima/dopo il restart. La suite locale indipendente ha inoltre ripreso un elemento già reclamato e concluso il batch `2/2` senza duplicati o perdite.
