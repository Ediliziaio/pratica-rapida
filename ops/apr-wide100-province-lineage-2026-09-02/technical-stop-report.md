# APR — arresto tecnico prima del test ampio

Data: 2 settembre 2026

## Correzione province storiche e replay Roberto Marcello

La correzione generale basata sul catalogo ufficiale ISTAT è installata e il replay operativo APR di Roberto Marcello è concluso con esito `saved`: bozza TEST 452111, 16/16 pagine salvate e verificate read-only. Checkpoint, report persistente e snapshot dashboard concordano; nessun blocker, nessun esito tecnico o incoerente. L'attestazione completa con hash è in `../apr-province-lineage-r24-2026-09-02/roberto-replay-attestation.json`.

## Esito

Il campione è numericamente fattibile: il GET CRM read-only ha restituito 326 pratiche nelle tre fasi richieste e 254 sono risultate eleggibili dopo i soli filtri autorizzati. È stato congelato un campione deterministico e rappresentativo di 100 pratiche: 87 Archiviate, 3 Da inserire su Excel e 10 Recensione; 40 Infissi e 60 Schermature; 41 semplici, 40 medie e 19 complesse.

Il test ampio non è stato avviato. Il gate APR lo rifiuta prima di qualsiasi azione ENEA per due incompatibilità preesistenti con il mandato:

1. `aprCohortSeed` ammette come `expectedStageType` soltanto `archiviate`, `recensione` e `pronte_da_fare`; rifiuta `gestionale`, che è il tipo CRM della fase Da inserire su Excel. Tutte e tre le pratiche selezionate da quella fase producono `apr_cohort_seed_practice_scope_invalid`.
2. `aprCohortSeed` applica ancora quattro esclusioni storiche oltre a Beatrice Ciotta. Nel campione deterministico sono presenti Nicoletta Garbarino e Vittorio Paolinelli; entrambe vengono rifiutate con `apr_cohort_seed_future_test_customer_excluded:*`. Rimuoverle o cambiare seed costituirebbe un'esclusione ulteriore e altererebbe il campionamento richiesto.

La correzione di questi due gate sarebbe una modifica di codice distinta dalla gestione delle province storiche. Non è stata applicata, in osservanza del divieto esplicito di ulteriori correzioni senza approvazione.

## Tripla prova

1. Fonte primaria: `scripts/enea-shadow-runner/aprCohortSeed.ts`, righe 151-159, contiene entrambi i rifiuti.
2. Esecuzione indipendente del validatore sui cinque casi selezionati: `gate-diagnosis.json` registra tre rifiuti di fase e due rifiuti per esclusione storica, senza azione esterna.
3. Snapshot CRM e manifest congelato: `selection-evidence.json` prova 254 eleggibili e il manifest include realmente i cinque casi che attivano i gate.

## Integrità e sicurezza

- Manifest SHA-256: `055ac846a6caba0edf35a7111b3db7b53bb5ac505eaa8f591146be4eaa5cbb70`
- Selection evidence SHA-256: `b5add9ca1599ac1429fbb6f711452a50d402a7dd6f841c01fb57c79b501c9980`
- Gate diagnosis SHA-256: `7e2f15c9472fd5b43b5feb54f65bcad5e21897063a7b6251a0f29b4d852935f9`
- Nessuna azione ENEA del test ampio è stata tentata.
- Nessuna anteprima, invio, protocollazione, ricevuta, email o comunicazione è stata eseguita.
- La notifica ntfy finale non è stata inviata, perché l'intero mandato non è completato.
- L'elenco categorizzato dei blocker dati/documenti del nuovo campione non è stato fabbricato: senza esecuzione non esistono checkpoint, `report.blockers` e `/api/case-truth` della coorte su cui attribuire blocker conformi alla tripla verifica.

## Sblocco richiesto

Serve approvazione esplicita per una correzione generale dei gate di ingresso che:

- ammetta e verifichi in modo fail-closed la fase CRM `gestionale` solo quando il nome autorevole è `Da inserire su Excel`;
- riconcili il registro delle esclusioni persistenti con l'elenco esatto autorizzato per questa coorte, senza bypass caso-specifici e mantenendo Beatrice Ciotta permanentemente esclusa.
