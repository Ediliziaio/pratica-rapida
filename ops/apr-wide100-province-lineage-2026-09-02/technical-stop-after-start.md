# Lotto ampio R24 — arresto tecnico controllato

Stato: **fermato**, non concluso. Nessuna notifica ntfy inviata.

Il lotto congelato da 100 pratiche è stato avviato una sola volta. Dopo 5 risultati terminali, la coorte 2826 era appena entrata in preflight quando è stata completata la quiescenza. Il report persistente, interrotto intenzionalmente, conserva `status=running`; lo stato operativo reale è invece fermo, provato dall'assenza del servizio e del processo del sequencer e dall'assenza dei servizi/processi della coorte 2826.

## Causa esatta

Il sequencer contiene un `sourceManifest` fisso che punta al corpus del 26 agosto (`sequencer.mjs`, riga 24). Per ogni pratica, il bridge passa quel file a `runEconomicVerticalForManifestCase` (`sequencer.mjs`, riga 278). La funzione cerca una corrispondenza esatta sul `customerKey` e genera `apr_economic_manifest_case_missing` se non la trova (`aprEconomicCorpusReplay.ts`, righe 142-146).

Per Lucia Droghetti la chiave corrente è `lucia-droghetti`, mentre nel corpus storico l'unica voce simile è scritta `luci-adroghetti`. Il bridge ha quindi fallito prima della creazione della bozza con:

`apr_economic_manifest_case_missing:lucia-droghetti`

Non è sicuro trattarlo come caso singolo: delle 100 pratiche selezionate, soltanto 52 sono presenti nel corpus storico e 48 sono assenti. Il difetto comune è dunque la dipendenza operativa da un corpus storico chiuso, non il contenuto della pratica Lucia.

## Tripla verifica Lucia

1. Report/checkpoint/log del sequencer registrano la stessa eccezione tecnica nel bridge.
2. Lo snapshot dashboard terminale pubblica `TECHNICAL_BLOCK` con la medesima eccezione e `statusSource=sequencer_finalizer`.
3. Le fonti persistenti del caso escludono un blocco dati: `crm-local-preflight` è `ready_local_plan`, `report.blockers=[]`; `enea-draft-execution` è `queued`, `operatorGateBlockers=[]`, 8 pagine ancora `pending`. Il checkpoint del bridge non esiste perché la preparazione è fallita prima dell'armamento.

Conclusione: **TECHNICAL_BLOCK del bridge**, con pratica dati `READY` e nessun problema dati/documenti attribuibile a Lucia.

## Stato del lotto al fermo

- Totale congelato: 100.
- Risultati terminali persistiti: 5.
- Saved: 0.
- Classificati dal report come operator-required: 4 (non promossi qui a diagnosi definitive perché il lotto non ha completato la verifica finale aggregata richiesta).
- Technical block: 1, Lucia Droghetti.
- Restanti secondo il report: 95.
- Anteprima, submit e comunicazioni: mai tentati.

## Continuità e sicurezza

- Sequencer del lotto: scaricato, nessun processo.
- Supervisore/worker/watchdog residui della coorte 2826: scaricati, nessun processo.
- Keepalive `com.praticarapida.apr-enea-immortal-keepalive`: attivo, PID 3784, `runs=1`.
- Chrome APR: attivo, PID 3785; CDP `127.0.0.1:9331` risponde con Chrome 152 / protocollo 1.3.

## Azione sospesa

Non ho modificato il codice perché il mandato vieta correzioni ulteriori senza consenso esplicito. Per riprendere serve autorizzare una correzione generale del bridge: costruire l'input economico dal dossier e dall'analisi correnti della coorte, senza richiedere che la pratica appartenga al corpus storico del 26 agosto; quindi gate fail-closed e rilancio dello stesso campione congelato/autorizzato.

Attestazione macchina: `technical-stop-attestation.json` nella stessa cartella.
