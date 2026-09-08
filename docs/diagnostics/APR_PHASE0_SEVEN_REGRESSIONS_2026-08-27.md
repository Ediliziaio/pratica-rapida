# APR — Fase 0: indagine sulle sette regressioni apparenti

Data: 27 agosto 2026  
HEAD: `4cccfd97eb56b80b2c09f20d1d7daa0ff94bc6ee`

Ambito: replay locale su copie temporanee di dossier, testi OCR e checkpoint. Nessun accesso a CRM, ENEA o browser; nessuna correzione applicata.

## Metodo di verifica

Per ogni pratica sono stati confrontati tre riscontri indipendenti:

1. classificazione e blocker del manifest storico;
2. report e payload audit del checkpoint persistente originario;
3. ricostruzione del preflight sull'HEAD, riapplicando parser e classificatore correnti ai testi locali.

## Risultati

### Amelia Lerose

- Storico: `READY`, nessun blocker.
- HEAD: `blocked_case` con tre blocker `screening_fallback_material_category_conflict_1..3`.
- Motivo: tre righe riconosciute come zanzariere ricevono dal resolver il fallback `Tessuto`; per le zanzariere il fallback autorizzato è `Misto`.
- Attribuzione: commit `47c00c4` (`fix(apr): fail closed on screening fallback material conflicts`).
- Valutazione: il nuovo controllo è corretto e ha reso visibile un difetto reale preesistente del resolver. Non è una regressione accidentale da rimuovere.

Dettaglio sul commit `47c00c4`: il commit non modificava `resolveProductTechnicalAttributes()` e non trasformava `Tessuto` in `Misto`. Introduceva invece `screeningFallbackMaterialCategoryBlocker()`, cioe il controllo fail-closed che blocca una riga classificata zanzariera quando il resolver restituisce un fallback diverso da `Misto`. Nel caso Amelia la fattura produce tre descrizioni generiche `Schermatura solare MOBILE`; il form le associa al gruppo `altro`, che il mapping riconosce come zanzariera. Il resolver del materiale, basandosi ancora sulla sola descrizione generica, non vede la parola `zanzariera`, cade sul default `Tessuto` e viene quindi correttamente fermato dalla nuova guardia. Il codice del resolver risale a `76598e7` e non e stato sovrascritto dopo `47c00c4`.

### Renzo Paolo De Grandi

- Storico: `READY`, nessun blocker.
- HEAD: `blocked_case` con quattro blocker `screening_fallback_material_category_conflict_1..4`.
- Motivo: quattro righe zanzariera ricevono il fallback `Tessuto` invece di `Misto`.
- Attribuzione: commit `47c00c4`.
- Valutazione: stesso difetto reale del resolver emerso in Amelia; fail-closed corretto.

### Gabriello Manso

- Storico: `READY`, ma il checkpoint storico conservava già `payload_incomplete`, `draftReady:false`.
- HEAD: `draft_payload_mapping_incomplete`.
- Motivo esatto: CAP residenza e CAP lavori non validi/non mappabili. Nel dossier il CAP di residenza è `209OO` con lettere `O`, non cinque cifre.
- Attribuzione: controllo di completezza consolidato nel commit `76598e7`; non introdotto dalle correzioni recenti.
- Valutazione: falsa READY storica. L'HEAD impedisce correttamente di trasformare un payload incompleto in pratica pronta.

### Liliana Gloria

- Storico: `READY`, ma il checkpoint storico conservava già 11 campi payload mancanti e `draftReady:false`.
- HEAD: `draft_payload_mapping_incomplete`.
- Motivo corrente: mancano titolo sull'immobile, abitazione principale e i campi dell'impianto (tipo, terminali, generatore, numero generatori, combustibile e climatizzazione estiva).
- Attribuzione: controllo di completezza `76598e7`, non una correzione recente.
- Valutazione: falsa READY storica; riclassificazione fail-closed attesa.

### Federica Cappuccilli

- Storico: `READY`.
- HEAD: `completion_date_portal_year_mismatch` e `completion_over_90_days_operator_required`.
- Motivo: fine lavori `2024-10-22`, incompatibile con il portale 2026 e distante 674 giorni dalla data di replay.
- Attribuzione: gate temporale consolidato nel commit `76598e7`.
- Valutazione: riclassificazione attesa; il checkpoint storico non aveva ricalcolato i gate temporali.

### Lorena Brendas

- Storico: `READY`.
- HEAD: `completion_over_90_days_operator_required`.
- Motivo: fine lavori `2026-02-03`, 205 giorni prima del replay. La data precede il 4 febbraio e quindi non beneficia della finestra straordinaria 2026 prevista per le date successive.
- Attribuzione: gate temporale `76598e7`.
- Valutazione: riclassificazione attesa.

### Milena Fiorini

- Storico: `READY`.
- HEAD: `bundled_professional_expense_unitemized`.
- Motivo: fattura lorda € 13.090 con la dicitura “Pratica ENEA compresa”, senza importo separato del servizio professionale. APR non può usare € 13.090 come spesa tecnica alla cieca.
- Attribuzione: regola di separazione della spesa professionale consolidata in `76598e7`.
- Valutazione: falsa READY storica; richiesta operatore già prevista dalla regola generale.

## Verdetto

- Regressioni accidentali introdotte dalle correzioni recenti: **0**.
- Difetti reali preesistenti del resolver zanzariere resi visibili dal fail-closed: **2 pratiche** (Amelia Lerose, Renzo Paolo De Grandi).
- False READY storiche dovute a checkpoint non ricalcolati o a payload già incompleti: **5 pratiche**.

Non è stata applicata alcuna correzione. Prima della Fase 1 resta da decidere separatamente come correggere in modo generale il resolver del materiale zanzariere; il controllo fail-closed non deve essere indebolito.
