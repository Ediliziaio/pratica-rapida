# Correzione sequencer APR e ripresa lotto — 28 agosto 2026

## Correzioni installate

1. Commit `b7cbdad` — riconciliazione autorevole Infissi/Schermature eseguita nello stesso comando che prepara il gate Infissi, prima dell'attesa del sequencer.
2. Commit `6d78d00` — qualunque errore o incoerenza non marcata e verificata come tecnica comune viene isolata come `OPERATOR_REQUIRED`; worker e watchdog della sola pratica vengono fermati, la motivazione e la domanda sono persistite e la coda prosegue.
3. Commit `de050e6` — identificativo audit della ripresa autorizzata.

Lo stop globale resta ammesso solo per codici comuni espliciti: sessione indisponibile dopo la soglia, worker indisponibile dopo la soglia o crash di sistema verificato. Una semplice stringa che cita sessione/login non basta.

## Prove locali

- test sequencer/policy/session guard: 12/12 verdi;
- test riconciliazione e preflight: 62/62 verdi;
- typecheck runner: verde;
- replay isolato del checkpoint Pieraldo: preflight comune `blocked_case` -> `ready_local_plan`, gate Infissi invariato `ready_local_plan`, blocker 2 -> 0, revisione `infissi-authoritative-product-applicability-v66` applicata;
- build bundle persistenti: verde;
- SHA-256 dei tre bundle costruiti identici ai tre bundle canonici installati.

## Installazione e stato operativo

- sequencer installato con SHA-256 identico alla sorgente pulita del commit `de050e6`;
- policy di isolamento installata con SHA-256 identico alla sorgente pulita;
- sorgente runtime fissata al worktree pulito `/private/tmp/apr-night50-gate.oxJkqB/repo`;
- supervisor/keepalive della coorte Pieraldo non interrotto durante build e installazione;
- ripresa auditata con `user-2026-08-28-resume-night50-after-routing-isolation-fix`;
- Pieraldo: preflight comune riconciliato, worker APR attivo, bozza ENEA `439501` creata, compilazione avanzata da 0 a 2 pagine su 12 durante la verifica;
- dashboard: `WORKING`, pratica corrente `pieraldo-casini`;
- contatori vietati: preview 0, submit 0, comunicazioni 0.

Il monitor ricorrente `monitora-ripresa-lotto-apr-50` e' stato aggiornato: segue le 36 pratiche residue, preserva i 14 risultati terminali e avvisa solo a terminalita completa o per un problema tecnico comune reale.
