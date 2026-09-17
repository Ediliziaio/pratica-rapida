# Diagnosi interruzione 03:04 e guardia chiusure oscuranti

Data verifica: 2026-09-11, Europe/Rome.

## Interruzione del controller alle 03:04

Verdetto: il lotto non si e' fermato per scadenza della sessione ENEA, sospensione del Mac, memoria esaurita o crash del worker APR. E' scomparso il processo proprietario esterno che manteneva vivo il controller, avviato dentro una sessione transitoria di esecuzione Codex.

Prove concordanti:

- il journal esterno termina alle 03:04:01 CEST con avanzamento materiale di Lucia Lagrasta e non contiene un evento terminale di lotto;
- il report APR della singola pratica termina regolarmente alle 03:04:02 CEST: `saved`, bozza 484382, 11/11 pagine;
- checkpoint esecutivo, snapshot dashboard e checkpoint supervisore della coorte 5838 concordano su completamento lato server e arresto pulito della coorte;
- il log energetico macOS non registra uno sleep alle 03:04; i DiagnosticReports non contengono crash nel periodo; il log unificato non mostra memory pressure/OOM o segnali di crash per i PID coinvolti;
- Chrome APR e la sessione ENEA sono rimasti attivi; la bozza 484382 e' stata verificata lato server;
- il processo esterno non ha eseguito il successivo polling a 5 secondi che avrebbe importato l'esito di Lucia nel checkpoint del lotto.

Il sistema operativo non ha conservato il segnale di terminazione del wrapper transitorio, quindi non e' possibile attribuire onestamente il sottotipo (reclaim del processo o chiusura della sessione host). Il confine causale e' comunque dimostrato: perdita della sessione proprietaria del controller, non errore ENEA o APR per-pratica.

Mitigazione operativa applicata senza LaunchAgent: il controller e' stato riallineato atomicamente dopo Lucia e riavviato in una sessione terminale `screen` separata, sotto `caffeinate -i`, con log e PID persistenti. Nessuno dei primi 38 casi viene rieseguito.

## Perche' la regola "fattura silente = NO" non copre i sette casi

La regola e' installata ed e' stata invocata in tutti i sette casi (`user-2026-09-10-infissi-invoice-authoritative-shading-closures-v1`). Non richiede una prova positiva di assenza delle chiusure. Ha pero' una precondizione fail-closed: il silenzio vale come NO soltanto quando *tutti* gli allegati classificati come fattura sono presenti nella riconciliazione economica certa e la tripla riconciliazione e' verde. Il punto applicativo e' `scripts/enea-shadow-runner/infissiBatchPreflight.ts`, righe 529-548; la decisione e' in `src/features/enea-shadow-crm/infissiShadingClosureAllocation.ts`, righe 121-139.

| Pratica | Cosa manca esattamente | Perche' il NO non scatta | `operatorQuestion` |
|---|---|---|---|
| Matteo Capitanelli | Dei 13 allegati classificati come fattura, solo 4 sono collegati come evidenza economica certa; 9 restano `documentType=unknown`, senza totale/numero. Inoltre risultano 2 chiusure per 7 infissi. | Il fascicolo fatture non e' dimostrato completo e non e' silente: contiene evidenza positiva parziale di 2 chiusure. | Quali dei nove allegati senza numero e totale sono vere fatture fiscali, e le chiusure oscuranti riguardano soltanto 2 dei 7 infissi? |
| Eugenio Codognato | Un documento fiscale (`a35d359e...`) ha imponibile 1.097 e IVA letta 5.485, ma totale lordo nullo; la tripla riconciliazione e' rossa. Le chiusure sono comunque contate 8/8. | La precondizione economica non e' verde; non e' una richiesta di prova positiva sulle chiusure. | Qual e' il totale lordo corretto del documento fiscale `a35d359e...`? |
| Gregorio Fusco | 2 dei 7 allegati classificati come fattura (7 e 2 pagine OCR) restano `documentType=unknown`, senza numero e totale. | Il silenzio sulle chiusure non e' autorevole finche' quei due allegati non sono classificati come non fiscali o riconciliati come fatture. | I due allegati OCR da 7 e 2 pagine sono fatture fiscali oppure documenti tecnici/amministrativi? |
| Andrea Trabucco | 2 dei 6 allegati classificati come fattura (entrambi 2 pagine OCR) restano `documentType=unknown`, senza numero e totale. | Stessa guardia di completezza: non e' provato che il corpus fiscale sia completo. | I due allegati OCR da 2 pagine sono fatture fiscali oppure documenti tecnici/amministrativi? |
| Luca Cigognetti | Solo 1 dei 3 allegati classificati come fattura e' evidenza economica certa; restano un OCR da 2 pagine e un pacchetto tecnico nativo da 23 pagine. Nel pacchetto da 23 pagine compare una zanzariera, ma senza quantita'/associazione alle 7 finestre. | Non c'e' silenzio: c'e' evidenza positiva non allocata, oltre a un corpus fatture non completamente classificato. | Il PDF da 23 pagine e' un documento tecnico e quante delle 7 finestre hanno la zanzariera indicata? |
| Armando Ranzoni | Le due fatture native sono lette correttamente (FPR 176/26 e FPR 337/26, 3.446,50 euro ciascuna), ma nel preflight delle chiusure le evidenze economiche hanno tipo `advance`/`balance`, mentre il collegamento ammette solo `kind=invoice`; risultano quindi 0/2 collegate. | Difetto tecnico di lineage/tipizzazione, non dato mancante: la guardia vede falsamente un corpus incompleto. | Confermi che non serve alcun dato aggiuntivo e che le due fatture sono acconto e saldo della stessa pratica? |
| Massimo Cappello | 1 dei 3 allegati classificati come fattura, un OCR da 8 pagine, resta `documentType=unknown`, senza numero e totale. | Il silenzio non e' autorevole finche' il terzo allegato non e' classificato come non fiscale o riconciliato come fattura. | L'allegato OCR da 8 pagine e' una fattura fiscale oppure un documento tecnico/amministrativo? |

Quindi l'etichetta profonda "manca una regola business" e' fuorviante: la regola business esiste. Le cause residue sono classificazione/lineage del corpus fiscale, una riconciliazione economica fallita (Codognato) e, in alcuni casi, evidenza positiva parziale da allocare.

## Riallineamento e ripartenza

- Lucia Lagrasta: riconciliata come `saved`, bozza 484382, 11/11 pagine, con quattro fonti persistenti concordanti.
- Checkpoint esterno dopo il riallineamento: 38/70 terminali, 22 `saved`, 8 `operator_required`, 4 `technical_block`, 4 `inconsistent`, 32 residue.
- Ripartenza: dalla coorte 5839, senza rieseguire le coorti 5801-5838.
- Worker della coorte ripresa: SHA-256 `5beccb73cd8ee89d2fb440a45bdd70a2b7c668052bd5161c37be95595a551d79`, identico al bundle r110 autorizzato.
- Sicurezza: anteprima, submit e comunicazioni restano disabilitati.

Ricevuta di riallineamento: `ops/apr-workable70-r110-2026-09-11/lucia-reconciliation-receipt.json`.
