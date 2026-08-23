# Regola permanente di verifica delle risposte

Prima di fornire all'utente una conclusione, uno stato o un'indicazione operativa:

1. eseguire una prima verifica sulla fonte primaria pertinente;
2. ripetere la verifica con un secondo metodo e una seconda fonte indipendenti dalla prima;
3. eseguire una terza verifica con un metodo e una fonte indipendenti dalle prime due;
4. se i tre riscontri non concordano, non dichiarare il dato verificato e spiegare chiaramente la discrepanza;
5. distinguere sempre fra test automatici/locali, test operativi con sistemi reali e disponibilità in produzione;
6. non usare genericamente «pronto per i test»: specificare sempre quale categoria di test è pronta e quale non lo è.
7. prima di affermare che una pratica APR ha un problema o un blocco, verificare obbligatoriamente la verità caso tramite checkpoint persistente, `report.blockers` e API dashboard `/api/case-truth`; la parola «blocco» è ammessa solo con stato `blocked_case` e almeno un blocker coerente;
8. se la verità caso è `READY`, dichiarare esplicitamente «nessun problema» e non trasformare il solo limite globale `externalActionAllowed=false` in un blocco della pratica;
9. se stato, report e dashboard non concordano, dichiarare esclusivamente `INCONSISTENT` e correggere il software prima di fornire una diagnosi del caso.

Questa regola si applica a tutte le future attività e chat che operano in questo repository.

# Regola permanente di continuità APR

- Le pratiche operative sono eseguite esclusivamente dal software persistente APR; Codex può soltanto sviluppare, correggere, installare e verificare APR.
- La conclusione di un turno Codex non deve arrestare o sospendere worker, supervisore, watchdog o coda APR.
- Prima di dichiarare attività in corso servono tre prove indipendenti: processo di sistema attivo, heartbeat/checkpoint aggiornato e stato leggibile dalla dashboard.
- Gli stati pubblici sono `WORKING`, `IDLE`, `OPERATOR_REQUIRED` e `TECHNICAL_BLOCK`; `IDLE` significa esplicitamente coda vuota e non va descritto come lavoro in corso.
- Un blocco per-pratica va isolato come `Richiesto intervento operatore` e non deve fermare le pratiche successive.
- Se esiste lavoro eseguibile e il checkpoint non avanza per cinque minuti, il watchdog deve diagnosticare e tentare una sola ripresa sicura e idempotente dal checkpoint.
- Stato, fase, pratica corrente, prossima azione, lock, lease e audit devono sopravvivere a crash, riavvio dei processi, logout/login e riavvio del computer.
- Restano vietati anteprima, submit, ricevute, email e comunicazioni; Beatrice Ciotta resta esclusa.

# Regola permanente di apprendimento APR dai casi

- Ogni caso singolo esaminato e corretto deve essere trasformato in una regola operativa generale APR, salvo che l'utente lo dichiari esplicitamente override non propagabile.
- Una correzione non è considerata acquisita finché non possiede: ID nel registro unico, precedenza/fonti, azione deterministica, audit, test positivo, test negativo o fail-closed, voce nella matrice regole e bundle persistente installato corrispondente ai test.
- Il nome del cliente può apparire soltanto come fixture di regressione: il comportamento applicativo non deve dipendere dal cliente, dalla pratica o dalla coorte.
- Dopo ogni correzione, rieseguire il caso dal checkpoint con APR e verificare stato, `report.blockers` e `/api/case-truth`; una correzione soltanto documentata o discussa non è una regola attiva.
- Gli override caso-specifici devono essere auditati come non propagabili e non possono diventare fallback generali.
