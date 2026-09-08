# Arresto di sicurezza wide100 r25 — Luca Ronconi

- Rilevato: 2026-09-02 09:12 CEST
- Lotto: `apr-wide100-current-cohort-bridge-r25`
- Coorte: `2942`
- Pratica: Luca Ronconi (`98d44d99-86af-4fec-ba55-ffe24d208e83`)
- Manifest immutato: SHA-256 `51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0`
- Esito verificato: `TECHNICAL_BLOCK`
- Errore persistito: `apr_cdp_enea_co_beneficiary_save_unverified`
- Bozza individuata dal server: `453191`
- Pagine completate: `0/8`

## Riscontri indipendenti

1. Il checkpoint e il report del sequencer registrano `technical_block`, bozza `453191`, `0/8` pagine e lo stesso codice errore.
2. `enea-draft-execution/checkpoint.json` della coorte 2942 registra la bozza creata una sola volta, `saveAttemptCount: 0`, nessuna pagina completata e isolamento fail-closed dopo `driver-error-4ee3a81539d15b09`.
3. `dashboard/status.json` della coorte pubblica `TECHNICAL_BLOCK`, con la medesima causa e l'indicazione di correggere il difetto tecnico prima di una nuova esecuzione.

Il preflight locale era verde e senza blocker dati; il difetto si è manifestato durante la gestione ENEA del cointestatario, prima che fosse verificato il salvataggio della pagina beneficiario. Non viene attribuita qui una causa software più specifica senza una diagnosi separata.

## Azione di sicurezza

Il solo sequencer del lotto è stato scaricato da `launchctl` dopo il riscontro concorde. La coorte successiva 2943 non aveva ancora avviato il runner. Il keepalive ENEA (PID 3784), Chrome APR (PID 3785) e l'endpoint CDP locale sulla porta 9331 sono rimasti attivi e verificati. Nessun codice è stato modificato e nessun retry è stato eseguito.

Stato aggregato al fermo: 22/100 terminali; 2 `saved`, 19 `operator_required`, 1 `technical_block`, 0 `inconsistent`, 78 non eseguite.

## Diagnosi causale verificata e correzione generale

La causa non era nei dati del cointestatario. Il driver aveva persistito un solo intento `co_beneficiary_save_intent` e inviato un solo click CDP, ma per questo salvataggio modale non applicava le verifiche di consegna già usate per i salvataggi pagina: nuova misura dopo lo scroll, hit-test con `elementFromPoint` e osservazione delle richieste mutative same-origin. In alcuni remount React il browser accettava la sequenza pointer senza che React ricevesse il click; il DOM restava identico, la modale restava aperta e nessuna riga veniva aggiunta.

Prove concrete:

1. Per Luca Ronconi, tra `co_beneficiary_save_intent` delle 09:11:25 e `co_beneficiary_save_unverified_diagnostic` delle 09:11:42 il DOM SHA-256 è rimasto identico (`9f4b…`), la modale è rimasta aperta e la riga non è comparsa; i tre campi erano tutti `valid:true`, `ariaInvalid:false` e non era presente alcun alert di validazione ENEA.
2. Gli stessi identici dati di cointestatario usati per Luca Callegari sono stati salvati correttamente in più coorti e non consegnati in altre, senza variazioni dei dati. Questo esclude una causa anagrafica e dimostra una variabilità di consegna dell'evento pointer.
3. Il test d'integrazione macOS/Chrome riproduce il pointer ignorato e dimostra che lo stesso intento viene consegnato con `Space` soltanto quando non è stata osservata alcuna mutazione; il test negativo dimostra che, se il pointer ha già generato una richiesta mutativa, APR non invia una seconda attivazione.

La regola generale installata è `user-2026-09-02-co-beneficiary-single-intent-delivery-v1`: un solo intento persistito; scroll e nuova misura; hit-test; osservazione delle mutazioni; fallback trusted `Space` una sola volta esclusivamente dopo assenza provata di mutazioni e con modale/campi/pulsante ancora validi e univoci. In ogni caso ambiguo il comportamento resta fail-closed.

## Gate e attivazione

- Registry `enea-operational-registry-v100`; matrice `apr-enea-rule-test-matrix-v78`.
- Suite integrata: 1.630/1.630 test passati, zero falliti e zero saltati; report SHA-256 `61e2f60f6b6eecb320f50b6524612cfed12253ee879bc90ddf46823a629f2e40`.
- TypeScript, build produzione e typecheck runner: PASS.
- Gate monotono: `active_tested_deployed`, fingerprint sorgente `5554931fc8671369a585eb4a9aa5e805b70c58fc87a95ff06374adbd2e79336f`, 88 regole verificate.
- Bundle canonico: `versions/5b282fac-co-beneficiary-single-intent-r26-20260902`.
- SHA-256 worker `5b282facd50626ca14c188a6a91dc31eac7e35760edd4158c13f3b9e5f7ecfb3`, supervisor `8f12038cb501f933720c01e90e5a0acb29d8d425503adbc2e534af906b9f94b3`, watchdog `551118e02af5d2a9163f18d8663d7b332d173ff0ae28cffb9659dee9a33619f0`; build e installazione coincidono.
- Durante build, gate e attivazione il keepalive è rimasto sul PID 3784, Chrome APR sul PID 3785 e i contatori vietati sono rimasti a zero.
