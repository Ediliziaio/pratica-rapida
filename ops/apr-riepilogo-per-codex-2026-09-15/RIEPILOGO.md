# Cosa è cambiato in questo albero mentre Codex era fermo (15/09/2026, ~11:00–13:30)

Autore delle modifiche: Claude, con autorizzazione esplicita di Giuliano
(«sono d'accordo»: scrittore unico temporaneo). Nessun commit. Nessun bundle
ricostruito. Nessun lotto lanciato: le 148 (run `apr-wide148-r126-20260915`)
girano ancora con il bundle r126 e NON vanno toccate.

## Patch applicate nell'albero (già presenti in `ops/`, ora anche nel sorgente)

1. `ops/apr-richiesta-superata-non-blocca-2026-09-14.patch`
   `crmLocalPreflight.ts` (+ test): il blocker `operator_response_pending_external_data`
   nasce solo se la richiesta è l'ULTIMA risposta attiva sulla pratica.
   Munafò: richiesta dell'11/09 + misure del 12/09 → misure applicate, nessun blocco.
   Test end-to-end con il preflight persistente. 143/143.
2. `ops/apr-sequencer-non-uccide-il-salvataggio-provato-2026-09-15.patch`
   `ops/apr-global-controller-test10-2026-08-29/sequencerPreflightGuard.mjs` (+ test):
   `filling` + `resolved_saved` con prova completa → `wait_for_worker_resume`,
   non più `state_status_mismatch`. Riprodotto sul checkpoint reale di Droghetti
   (coorte 9218). 24/24 vitest, 20/20 node:test.

## Modifiche nuove, non ancora in patch separata (sono direttamente nell'albero)

3. **Il worker legge l'errore del portale** — file toccati:
   - `scripts/enea-shadow-runner/aprEneaBrowserWorker.ts`: interfaccia driver
     estesa con `lastPageSaveRejection?(pkg, draftId, pageId)`; nel ramo
     `if (!verifiedEvidence)` di `save_page_once`, se il driver riporta
     `invalidControlIds` non vuoti → `isolateCase` immediato con motivo
     `Il portale ENEA rifiuta la pagina <pageId>: campo <ids> (<messaggi>). Nessun recupero…`
     Nessun ciclo di salvataggio incerto viene aperto.
   - `scripts/enea-shadow-runner/cdpEneaBrowserDriver.ts`: implementazione
     `lastPageSaveRejection` in sola lettura dal proprio checkpoint
     (`pageSaveDiagnostics[].postClick.invalidControlIds` + `alerts` brevi).
     Verificato sui checkpoint reali r125: Bellini → `id-telefono`
     «Inserire solo numeri.», Fiorini → `id-gtot` «Valore obbligatorio.»,
     De Filippo → `id-gg` «Valore obbligatorio.».
   - `scripts/enea-shadow-runner/aprStopDisposition.ts`: il motivo
     «Il portale ENEA rifiuta la pagina …» viene classificato: campi del
     cliente (telefono, email, indirizzo, civico, cap, date, comune, nome,
     cognome, codice fiscale) → `domanda_operatore` che nomina campo e
     messaggio; altri campi (gtot, gg, calcolati) → `guasto_apr` «mappatura
     nostra da chiudere».
   - Test: `aprEneaBrowserWorker.test.ts` (22/22, nuovo test con driver finto
     che riporta il rifiuto), `aprStopDisposition.test.ts` (14/14).

## Verifica complessiva

`npx vitest run scripts/enea-shadow-runner`: 1364/1367. I 3 rossi:
- 2 × «matrice regole APR» (bundle installato ≠ sorgente): attesi finché non
  si reinstalla; tornano verdi con il prossimo bundle;
- 1 × `cdpEneaBrowserDriver.test.ts` «apostrofo soltanto come query»: lancia
  un Chrome headless vero, timeout a 66 s mentre il Chrome di APR lavorava
  alle 148 sullo stesso Mac. Da rieseguire a lotto fermo.
Typecheck app e runner: puliti.

## Ancora aperto (non toccato)

- **De Filippo, `execution.status === "ready"` durante il recupero**: riprodotto
  sul checkpoint reale (coorte 9267): `singlePageRecoveryInFlightEligible`
  fallisce SOLO per `execution.status !== "running"`. Da decidere se il worker
  deve restare `running` o il validatore accettare `ready` in quella finestra.
  Nessuna modifica fatta.
- **Riconoscimento delle righe prodotto nelle fatture di fornitori nuovi**:
  nelle prime 40 delle 148, 10 pratiche ferme con «0 prodotti fisici» su
  fatture leggibili («FORNITURA E POSA N. 9 TENDE VENEZIANE», «N. 1 PERGOTENDA
  E N. 1 TENDA DA…», «N. 1 TENDA DA CM 310 X 220»). È il collo di bottiglia
  sulle pratiche mai viste. Lavoro di giorni, da pianificare.

## Cosa fare adesso

Niente, finché le 148 non finiscono. Poi: bundle con il CLI ufficiale,
allineamento, rilancio delle stesse 148. Prima di ogni modifica al sorgente,
rileggere questo file: lo stato dell'albero è quello descritto qui.
