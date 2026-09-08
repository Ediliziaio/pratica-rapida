# APR r59 — fallback gTot 0,13 e replay operativo Lanzo

Data: 5 settembre 2026

## Esito

- La decisione `gTot 0,13` per tende da sole o schermature generiche senza gTot documentato non era attiva in r56. r56 applicava `0,33` alle zanzariere e `0,06` alle famiglie rigide, ma inviava ancora la tenda generica in `OPERATOR_REQUIRED`.
- La decisione è stata recuperata come regola generale `user-2026-09-05-generic-awning-missing-gtot-013-v1`, non legata al nome Lanzo.
- Il bundle canonico installato è `versions/9956e6e6-generic-awning-gtot-r59-20260905`.
- Il replay operativo APR della coorte 3131 ha creato e completato la bozza ENEA TEST `465308`: 8 pagine su 8 salvate e verificate lato server.
- Nessuna anteprima, submit, protocollazione, ricevuta o comunicazione è stata eseguita.

## Regola generale e precedenza

1. Un gTot esplicito e coerente nella fonte originaria prevale sempre.
2. Senza gTot esplicito, una zanzariera usa `0,33` secondo la regola specifica già esistente.
3. Senza gTot esplicito, pergola, persiana, tapparella e avvolgibile conservano la regola specifica già installata `0,06`.
4. Senza gTot esplicito, una tenda da sole o schermatura generica fisicamente riconosciuta usa `0,13`.
5. Cristal, descrizioni vuote, prodotti ignoti, righe soltanto economiche e fonti contraddittorie restano fail-closed.

## Gate monotono

- Il primo gate ha correttamente fallito: 1 test non superato su 1.749 perché il validatore finale del payload non riconosceva ancora il nuovo identificativo, anche se il classificatore lo aveva prodotto. Nessun bundle è stato installato in questa condizione.
- Dopo l'allineamento di tutti i punti di validazione, il gate completo ha superato 437/437 suite e 1.749/1.749 test.
- Registro: `enea-operational-registry-v143`.
- Matrice: `apr-enea-rule-test-matrix-v121`, 143 voci.
- Audit storico: 101 decisioni documentate; 95 già attive, 1 attivata in r59, 5 superseded, 0 decisioni documentate irrisolte.
- Attestazione: `certified_deployed`; fingerprint sorgente `6d62b58db5b6ca8ad8c6950ad4c799a43ea9834a1a77638ab4aaacc89aa8500f`.

## Replay Lanzo

- Pratica: Annalisa Lanzo (`b51df57d-dae2-4ddc-bf99-904673ebe50d`).
- Generazione: nuova e pulita; coorte 3131.
- Prodotto riconosciuto: tenda da sole a cassonetto, 2650 × 2200 mm, superficie 5,83 m².
- gTot: `0,13`, fonte `authorized_fallback`, regola `user-2026-09-05-generic-awning-missing-gtot-013-v1`.
- Preflight: `ready_local_plan`, zero blocker, payload completo.
- Bozza: `465308`, 8/8 pagine `saved`; ogni pagina ha un solo tentativo primario e zero tentativi di recovery.

## Tripla verifica

1. Processi: supervisore, worker e watchdog della coorte 3131 hanno attraversato l'esecuzione; keepalive e Chrome APR sono rimasti attivi.
2. Artefatti persistenti: checkpoint di esecuzione `completed`, report sequencer `saved=1`, journal `case_saved_after_worker_quiescence`, bozza `465308`, 8/8.
3. Osservatore indipendente: snapshot terminale `apr-pilot-3131-global-controller-annalisa-lanzo.json`, revisione 2, fonte `sequencer_finalizer`, coerenza `CONSISTENT`, dichiarazione “bozza TEST completa e verificata read-only”. L'endpoint legacy `/api/case-truth` conserva lo stato semantico `READY`, che secondo il contratto significa nessun problema; lo snapshot terminale contiene invece l'esito di esecuzione completo.

Conclusione: la regola generale è installata e il caso operativo Lanzo ha raggiunto una bozza completa verificata. Questo prova il percorso TEST fino alla bozza; non costituisce anteprima, invio o disponibilità di produzione.
