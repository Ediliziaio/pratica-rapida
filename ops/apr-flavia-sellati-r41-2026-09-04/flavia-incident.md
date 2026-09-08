# Arresto di sicurezza — Flavia Cipriani, coorte 3061

Esito corretto da dichiarare: **INCONSISTENT**, non blocco della pratica.

APR ha creato la bozza TEST 460574 e ha salvato con prova server le prime cinque pagine. Durante la terza riga prodotto, il salvataggio non e stato immediatamente dimostrabile. Il worker ha persistito `uncertainPageSave.status=probing`, ma prima che potesse completare le sonde read-only il sequencer ha interpretato lo stato transitorio `operator_intervention` come terminale e ha spento il worker. Il checkpoint conserva quindi zero sonde e non permette di affermare se `screening:3` sia stata salvata oppure no.

La causa e una race generale worker/sequencer, distinta dalla regressione `recovery_queued` di Sellati: il nuovo percorso r41 entra in gioco solo dopo che una sonda canonica ha prodotto `not_saved`, mentre qui il worker e stato arrestato prima di poter persistere qualunque sonda.

Le tre fonti concordano soltanto su `INCONSISTENT`: servizi della coorte quiescenti, checkpoint/report persistenti incoerenti rispetto a un verdetto pratica, dashboard e snapshot terminale `INCONSISTENT`. Keepalive PID 98419 e Chrome APR PID 3785 sono rimasti vivi; anteprima, submit e comunicazioni sono rimasti a zero.

`operatorQuestion`: **Autorizzi la correzione generale del sequencer affinche `uncertainPageSave` in stato `probing` o `recovery_queued` non sia terminale e il worker possa completare le sole sonde read-only prima della classificazione, seguita da gate monotono e ripresa della stessa bozza Flavia 460574 senza nuovo salvataggio alla cieca?**

Sellati e il lotto notturno non sono stati avviati.
