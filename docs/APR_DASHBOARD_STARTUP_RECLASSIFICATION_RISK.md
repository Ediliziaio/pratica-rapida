# APR — rischio di riclassificazione all'avvio della dashboard

## Stato

Promemoria tecnico aperto. Questo documento non modifica il comportamento di APR e non autorizza alcuna correzione implicita.

## Comportamento osservato

`LocalDashboardSupervisor.start()` non si limita a leggere e pubblicare i checkpoint persistenti. Durante l'avvio:

1. inizializza gli store persistenti;
2. riapplica le revisioni correnti del parser e della validazione al preflight comune;
3. riapplica le revisioni di validazione del gate Infissi;
4. esegue `infissiBatchPreflight.tick(now)`;
5. prepara l'esecuzione ENEA, se assente, a partire dallo stato appena ricalcolato.

Di conseguenza, il solo avvio della dashboard può cambiare la classificazione pubblica di una pratica anche quando non è stata aggiunta o modificata alcuna regola business durante quell'avvio.

La riproduzione isolata su una copia di checkpoint storici ha mostrato un possibile stato misto: preflight comune ricalcolato e bloccato, gate Infissi appena accodato, ma checkpoint execution storico ancora `saved`. In questa condizione legacy e unified devono dichiarare `INCONSISTENT` e non scegliere silenziosamente uno dei checkpoint.

## Rischio

Un riavvio del servizio reale dopo un aggiornamento può rendere visibile un cambiamento apparente non causato dalla pratica o da una nuova regola business, ma dal ricalcolo automatico e non atomico di checkpoint appartenenti a generazioni diverse. Questo meccanismo può quindi simulare regressioni o avanzamenti e contaminare confronti storici se la dashboard viene usata come lettore del campione.

Per confronti legacy/unified su uno snapshot congelato, la fonte deve restare una copia statica letta senza avviare `LocalDashboardSupervisor`.

## Gate futuro obbligatorio

Prima dell'integrazione reale con `launchctl` e prima di affidare riavvii automatici al servizio in produzione, questo comportamento deve essere indagato e reso sicuro con una soluzione esplicita. Le alternative da valutare sono:

- riallineare atomicamente tutti i checkpoint coinvolti sotto la stessa generazione/revisione;
- separare l'avvio in sola lettura dal comando esplicito di ricalcolo;
- rendere il ricalcolo un'operazione comandata, auditata e completata atomicamente prima di pubblicare una nuova verità caso.

Fino alla chiusura di questo gate, ogni `INCONSISTENT` comparso immediatamente dopo un riavvio deve essere verificato distinguendo i dati della pratica da un possibile stato misto prodotto dal ricalcolo di startup.

## Vincolo di questa nota

Non cambiare la logica di `LocalDashboardSupervisor.start()` come effetto di questo documento. La correzione richiederà un'attività dedicata con test di riavvio, atomicità, idempotenza e confronto dei checkpoint prima/dopo.
