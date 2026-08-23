# APR — richiesta automatica di documenti (capacità futura)

Stato: **non implementata e non autorizzata all'esecuzione**.

Quando una pratica è bloccata per fattura o altro documento originario mancante, APR oggi registra il motivo in `Richiesto intervento operatore`, continua la coda e riprende la stessa pratica dopo un nuovo allegato e il ritorno in `Pronte da fare`.

Evoluzione richiesta dall'utente per una fase futura: APR potrà chiedere direttamente al cliente o al rivenditore il documento mancante tramite WhatsApp o email. Prima dell'attivazione serviranno un contratto dedicato, destinatario e pratica inequivoci, template approvati, consenso e base giuridica verificati, idempotenza/limite invii, audit, gestione risposte e disattivazione sicura.

Finché questi gate non saranno implementati e testati restano vietati invii, email, WhatsApp e altre comunicazioni.
