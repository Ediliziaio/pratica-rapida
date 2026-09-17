# APR r124 — giro A verificato

- Run: `apr-r124-short-round-a-20260914`
- Intervallo: 2026-09-14 09:39:27–11:38:06 CEST
- Manifest: `38770435ca0607e468b7aa33d61949bef36bb9f68a717c04a87e5652cc84f86c`
- Bundle: `c58ba2b3-patch-notte-r124-governed-20260914`
- Worker: `3c5d11fbb9040189cf77202f359ebc47134031fe4af95cd116730c1d95ea71d4`
- Sicurezza: sole bozze TEST; nessuna anteprima, invio o comunicazione.

## Standard di accettazione prodotto dal runner

- Salvate: 3
- Con domanda: 6
- Non conformi: 11
- Ritirate: 0

Questo conteggio automatico non è interamente concordante con la terza fonte: Milena Albertoni è `saved` in checkpoint/report, ma `BLOCKED` in `/api/case-truth`. Non viene quindi dichiarata `SAVED` verificata.

## Verdetto a tre fonti

- `SAVED` verificato: 2 — Santo Giuga, Massimo Cappello.
- `OPERATOR_REQUIRED`/`blocked_case` concordante: 3 — Rossella Munafò, Nicla Biagioni, Silvia Lomartire.
- `TECHNICAL_BLOCK` concordante: 6 — Lea Dettori, Gloria Padoani, Fausta De Filippo, Stefania Venturi, Eugenio Codognato, Patrizia Muzzi.
- `INCONSISTENT`: 9 — Milena Albertoni, Vincenzo Falconi, Gemma Minore, Paolino Bellini, Danila Serpa, Milena Fiorini, Cesare Imperiali, Mauro Leonardi, Gabriele Girelli.

## Esito nome per nome

| Pratica | Verdetto verificato | Bozza | Causa / prova |
|---|---|---:|---|
| Milena Albertoni | `INCONSISTENT` | 491958 | Checkpoint e report: `saved` 8/8. Dashboard: `BLOCKED` per `execution_case_operator_required`. |
| Vincenzo Falconi | `INCONSISTENT` | 492896 | Esito del salvataggio non dimostrabile dopo il recupero autorizzato. |
| Gemma Minore | `INCONSISTENT` | 492623 | Esito del salvataggio non dimostrabile dopo il recupero autorizzato. |
| Paolino Bellini | `INCONSISTENT` | 492663 | Esito del salvataggio non dimostrabile dopo il recupero autorizzato. |
| Lea Dettori | `TECHNICAL_BLOCK` | 492213 | `apr_cdp_enea_screening_react_contract_not_ready:screening:1`, dopo 5/9 pagine. |
| Gloria Padoani | `TECHNICAL_BLOCK` | 492743 | ENEA rifiuta comune di nascita e comune di residenza. |
| Fausta De Filippo | `TECHNICAL_BLOCK` | 492305 | ENEA rifiuta il comune di nascita. |
| Danila Serpa | `INCONSISTENT` | 492386 | Checkpoint/report: rifiuto ENEA del comune di nascita. Dashboard: `BLOCKED` per misure/cardinalità e chiusure oscuranti. |
| Milena Fiorini | `INCONSISTENT` | 492410 | Checkpoint/report: rilettura server senza prova dopo il recupero. Dashboard: `BLOCKED` per misure/cardinalità e chiusure oscuranti. |
| Stefania Venturi | `TECHNICAL_BLOCK` | — | `draft_payload_mapping_incomplete`. |
| Eugenio Codognato | `TECHNICAL_BLOCK` | — | `draft_payload_mapping_incomplete`. |
| Rossella Munafò | `OPERATOR_REQUIRED` | — | `operator_response_pending_external_data`; domanda persistita. |
| Patrizia Muzzi | `TECHNICAL_BLOCK` | — | `draft_payload_mapping_incomplete`. |
| Santo Giuga | `SAVED` | 492506 | 12/12 pagine; dashboard `READY`, nessun problema. |
| Massimo Cappello | `SAVED` | 492758 | 19/19 pagine al retry finale; dashboard `READY`, nessun problema. |
| Nicla Biagioni | `OPERATOR_REQUIRED` | — | Risposta su chiusure oscuranti mancante/ambigua; blocker e domanda concordanti. |
| Cesare Imperiali | `INCONSISTENT` | — | Misure/cardinalità Infissi mancanti; domanda persistita ma fonti terminali non concordanti. |
| Mauro Leonardi | `INCONSISTENT` | — | Anno portale/fine lavori oltre 90 giorni/misure mancanti; domanda persistita ma fonti non concordanti. |
| Gabriele Girelli | `INCONSISTENT` | — | Chiusure oscuranti ambigue; due domande persistite ma fonti non concordanti. |
| Silvia Lomartire | `OPERATOR_REQUIRED` | — | Form cliente e misure mancanti; blocker e domande concordanti. |

## Confronto esatto con r123

- Migliorate a `SAVED`: Santo Giuga (`technical_block` → `saved`), Massimo Cappello (`technical_block` → `saved`).
- Regressioni da `saved` in r123 a non salvata in r124: 0 secondo checkpoint/report.
- Il guardiano storico certifica comunque 2 regressioni con documenti invariati rispetto a precedenti run più vecchi: Eugenio Codognato e Lea Dettori.
- Tra i quattro casi attesi in miglioramento: Giuga e Cappello salvati; Muzzi ancora `draft_payload_mapping_incomplete`; Biagioni ora arriva a una domanda sulle chiusure oscuranti.

## Domande persistite nel solo run

- Rossella Munafò — “Puoi indicare le misure della bioclimatica riportate nel foglio manoscritto corretto per questa pratica?” Evidenza: il runtime non associa automaticamente il foglio manoscritto corretto.
- Nicla Biagioni — “Confermi se sono state installate chiusure oscuranti insieme agli infissi?” Evidenza: il percorso Infissi mantiene `infissi_shading_closures_form_answer_missing_or_ambiguous`.
- Cesare Imperiali — “Puoi indicare quanti serramenti sono stati installati e la misura di ciascuno?” Evidenza: misure e numero non ricostruiti dai documenti allegati.
- Mauro Leonardi — “Puoi confermare su quale portale annuale va inserita la pratica?” Evidenza: la data di fine lavori appartiene a un anno diverso da quello del portale aperto.
- Gabriele Girelli — “Confermi se sono state installate chiusure oscuranti insieme agli infissi?” Evidenza: risposta sulle chiusure oscuranti non risolta.
- Gabriele Girelli — “Puoi confermare su quale portale annuale va inserita la pratica?” Evidenza: anno della fine lavori diverso dal portale aperto.
- Silvia Lomartire — “Mancano le misure del prodotto (la veneziana) in tutti i documenti originari verificati. Inseriscile per far riprendere la pratica.” Documento mancante: scheda o documento con larghezza e altezza del prodotto.
- Silvia Lomartire — “Puoi allegare il form compilato del cliente?” Documento mancante: modulo cliente compilato.

## Guasti APR classificati dal runner

11: Danila Serpa, Eugenio Codognato, Fausta De Filippo, Gemma Minore, Gloria Padoani, Lea Dettori, Milena Fiorini, Paolino Bellini, Patrizia Muzzi, Stefania Venturi, Vincenzo Falconi.

## Fonti congelate

- Checkpoint SHA-256: `541a820476c08b8426433d669929a46117f9d4802ec95518c15dc92b16ec83be`
- Report SHA-256: `8692830862f5978a0792142e79010e66142a6b7b0d716d77f892e74b63e9f2ae`
- Acceptance SHA-256: `c7d5e229c8ebaf820d50eb9b10b90db811238eaef8b8bf3af8f7f84ea95eaa1b`
- Regression guard SHA-256: `777cb448b65ba5c8f41ecc2e5e51aafa264f4d578793f706f9833a85209fd781`
- Terza fonte: dashboard locale `/api/case-truth`, letta dopo la conclusione del run.
