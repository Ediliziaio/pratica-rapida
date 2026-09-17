# APR r118 — serializzazione della sessione CRM

Intervento circoscritto al rinnovo della sessione CRM condivisa tra dashboard, supervisori e worker APR.

- Difetto provato: processi distinti rileggevano e ruotavano lo stesso refresh token senza una sezione critica interprocesso; un rifiuto server cancellava inoltre il segreto anche quando era temporaneo o riferito a una copia superata.
- Regola: `system-apr-crm-refresh-serialization-v1`.
- Azione: lock globale atomico, rilettura del token dopo il lock, un solo recupero da rotazione concorrente, cancellazione soltanto su rifiuto definitivo 400/401 del token ancora corrente, timeout e 429/5xx trattati come difetti tecnici temporanei.
- Runner: qualsiasi stato CRM `login_required` arresta immediatamente il lotto, senza attendere sette minuti e senza attribuire un verdetto documentale alla pratica.
- Nessuna modifica alle regole di business e nessuna azione ENEA durante diagnosi, sviluppo e gate.

