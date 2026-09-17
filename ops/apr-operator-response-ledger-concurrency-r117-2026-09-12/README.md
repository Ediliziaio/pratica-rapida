# APR r117 — serializzazione del registro risposte operatore

Intervento circoscritto alla concorrenza sul registro globale delle risposte operatore.

- Difetto provato: worker persistente e CLI Infissi possono registrare quasi simultaneamente applicazioni sullo stesso ledger; il precedente lock falliva immediatamente al primo `EEXIST`.
- Regola: `system-operator-response-ledger-concurrency-v1`.
- Azione: attesa breve e limitata soltanto sulla contesa transitoria, acquisizione esclusiva, rilettura del checkpoint e mutazione idempotente; oltre il budget il comportamento resta fail-closed.
- Nessuna modifica alle regole di business e nessun lotto ENEA in questo intervento.

