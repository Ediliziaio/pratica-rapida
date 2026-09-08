# Collaudo mirato APR r40 — 5 pratiche

Data operativa: 3–4 settembre 2026. Bundle: `versions/eb9e54dd-rinaldi-exclusions-r40-20260904`.

## Esito

Il lotto autorizzato comprendeva esattamente cinque pratiche del campione congelato delle 100. Esito terminale: **3 SAVED**, **1 OPERATOR_REQUIRED**, **1 INCONSISTENT**. Nessuna anteprima, submit, protocollazione o comunicazione è stata tentata.

| Pratica | Esito | Bozza | Confronto con pratica umana |
|---|---:|---:|---|
| Luca Ronconi | SAVED | 460567 | 35/35 campi confrontabili identici. |
| Claudia Campagna | SAVED | 460568 | 34/35 identici. Unica differenza: APR `Tenda o veneziana`, storico umano `Altra schermatura solare`. La spesa Rinaldi di €2.276,06 coincide; la differenza residua è una classificazione controllata, non un errore economico dimostrato. |
| Massimo Cappello | SAVED | 460569 | 77/88 identici. Le 11 differenze riguardano solo la superficie: APR arrotonda al decimo le aree calcolate dalle misure originali, mentre lo storico umano le tronca di 0,1 m². Esempio: 1,177 × 1,497 = 1,761969 m² → APR 1,8, umano 1,7. Il dato APR è più accurato. |
| Claudia Sellati | INCONSISTENT | 460570, non completata | Nessun confronto finale possibile. Il GET canonico ha provato `not_saved` e ha autorizzato un solo recupero con budget residuo uno, ma il worker ha isolato il caso prima di eseguire quel recupero. È una regressione del percorso `recovery_queued`, non un blocker della pratica. |
| Flavia Cipriani | OPERATOR_REQUIRED | nessuna | Nessun confronto di una nuova bozza, perché il gate ha fermato la pratica prima di ENEA: il documento tecnico non è collegabile in modo univoco a cliente/cantiere, ordine 1394/2026 e prodotti fatturati. |

Sui tre casi completati sono stati confrontati **158 campi**: **146 identici**, **11 differenze in cui APR è più accurato dello storico umano**, **1 differenza categoriale controllata non dimostrata come errore**.

## Verifica “in dubbio, fermati”

Il meccanismo fail-closed ha funzionato in entrambi i punti di dubbio:

- Sellati: nessun secondo salvataggio alla cieca; il caso è stato isolato dopo l'esito incerto. La classificazione finale resta però `INCONSISTENT`, perché la prova successiva autorizzava un unico recupero che non è stato eseguito.
- Cipriani: `blocked_case` nel preflight Infissi, `OPERATOR_REQUIRED` nella verità terminale, nessuna bozza creata. Domanda prodotta nel blocker: **«Confermi che il documento tecnico con riferimento non leggibile appartiene agli ordini fatturati 1394/2026 della pratica di Flavia Cipriani e descrive esattamente gli stessi infissi?»**

Per Flavia il blocker secondario `infissi_dimensions_and_cardinality_missing` è conseguenza del mancato collegamento della fonte tecnica, non un invito a indovinare misure o cardinalità.

## Tripla verifica

- Processo: il sequencer ha concluso una sola esecuzione; i servizi delle coorti 3056–3060 risultano quiescenti. Il keepalive resta attivo con PID 98419 e Chrome APR resta in ascolto su 127.0.0.1:9331 con PID 3785.
- Persistenza: checkpoint e report del lotto concordano su 3 saved, 1 operator_required e 1 inconsistent. Hash finali: checkpoint `c7778108fe31a8af91d6b639fc6cbe0ee11c0ef4c017b85503079dba691d0e74`; report `2c81acf40e421556b46b86b4837dc8e71e28d5f444911fadeee6fbf5920052d8`.
- Dashboard/snapshot terminale: Ronconi, Campagna e Cappello sono `IDLE` dopo bozza completa; Cipriani è `OPERATOR_REQUIRED`; Sellati è esclusivamente `INCONSISTENT`. Nessun verdetto diverso è attribuito a Sellati.

Il manifest finale ha SHA-256 `d28f5b07433fe2c93e30f933efa1094a91a46853873dacac0aa03d280375a667`; tutte le cinque pratiche appartengono al manifest congelato delle 100.

## Nuove pratiche CRM

Dal controllo-base del 2 settembre 2026 alle 06:57:46Z risultano **4 nuove pratiche** nelle tre fasi richieste: **0 Archiviate, 0 Da inserire su Excel, 4 Recensione**. Sono Francesco Fumagalli, Milena Malavolta, Giovanna Conti e Nelson Malagoli. Il conteggio è stato ripetuto con filtro server per fase, query complete per fase con filtro locale e query combinata con partizione locale; i tre risultati concordano.

## Prossima azione necessaria

Prima di rilanciare Sellati va corretta e nuovamente sottoposta a gate la regressione generale: quando `persisted_fields_get=not_saved` autorizza `recovery_queued` con budget residuo uno, il worker non deve pubblicare prematuramente l'isolamento del caso. Nessuna correzione è stata applicata durante questo collaudo.
