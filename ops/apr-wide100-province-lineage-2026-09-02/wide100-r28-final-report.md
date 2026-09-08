# Report finale APR wide100 — bridge corrente r28

Generato: 2026-09-02T15:28:26.980Z
Esecuzione operativa reale su ENEA TEST (sole bozze): 2026-09-02T08:39:26.589Z — 2026-09-02T15:23:41.946Z
Stato verificato: COMPLETED, tre fonti concordi

## Esito

- Campione congelato: 100/100, SHA-256 `51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0`
- Bundle canonico: `versions/064100d8-recovery-queued-gate-r28-20260902`
- Saved: 24
- Operator required (dati/documenti): 73
- Technical block: 3
- Incoerenti: 0
- Anteprima, submit, protocollazione, ricevute, email e comunicazioni: vietati e non eseguiti.
- Keepalive ENEA e sessione Chrome APR: mantenuti vivi; il solo sequencer del lotto è terminato con exit code 0.

## Tripla verifica conclusiva

1. `launchctl`: sequencer terminato con exit code 0; keepalive ancora running.
2. Persistenza: checkpoint e report del run concordano su 100 terminali (24/73/3).
3. Snapshot terminali: ogni coorte saved è `IDLE` con bozza TEST verificata, ogni operator_required è `OPERATOR_REQUIRED` con `blocked_case` e blocker, ogni technical_block è `TECHNICAL_BLOCK`.

## Lettura dell'esito

La quota bassa di saved è dovuta soprattutto al campione mai testato: 73 casi hanno blocker dati/documenti verificati. Restano però 3 problemi tecnici distinti, elencati sotto; quindi il test ampio è concluso, ma il software non è dichiarato privo di difetti tecnici.

## Blocchi tecnici

- **Luca Ronconi** (caso 22, coorte 2942): `apr_cdp_enea_co_beneficiary_save_unverified`
  - Prove: checkpoint run; snapshot terminale `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-2942-global-controller-luca-ronconi/dashboard/status.json`; journal del sequencer.
- **Gianluigi Chiolini** (caso 88, coorte 3008): `crm_enea_draft_package_fingerprint_mismatch`
  - Prove: checkpoint run; snapshot terminale `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-3008-global-controller-gianluigi-chiolini/dashboard/status.json`; journal del sequencer.
- **Danila Serpa** (caso 92, coorte 3012): `apr_cdp_enea_field_verification_failed:id-comune_nascita`
  - Prove: checkpoint run; snapshot terminale `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-3012-global-controller-danila-serpa/dashboard/status.json`; journal del sequencer.

## Frequenza cause dati/documenti

Una pratica può contribuire a più codici; questa tabella non deve quindi essere sommata per ricavare 73.

- 57 pratiche — `screenings_missing`
- 33 pratiche — `gross_triple_reconciliation_failed`
- 32 pratiche — `invoice_332a5af9`
- 26 pratiche — `product_cardinality_form_invoice_mismatch`
- 15 pratiche — `completion_over_90_days_operator_required`
- 15 pratiche — `screening_primary_measurements_missing`
- 15 pratiche — `tax_code_missing_or_invalid`
- 13 pratiche — `completion_date_portal_year_mismatch`
- 12 pratiche — `completion_date_missing`
- 11 pratiche — `customer_form_missing`
- 10 pratiche — `invoice_929a8665`
- 9 pratiche — `original_invoice_missing_or_unavailable`
- 3 pratiche — `bank_transfer_principal_exceeds_invoices`
- 3 pratiche — `bundled_professional_expense_unitemized`
- 3 pratiche — `infissi_dimensions_and_cardinality_missing`
- 3 pratiche — `infissi_financial_triple_reconciliation_required`
- 2 pratiche — `draft_payload_mapping_incomplete`
- 2 pratiche — `screening_gtot_missing_operator_required_1`
- 2 pratiche — `screening_gtot_missing_operator_required_2`
- 1 pratiche — `bank_transfer_invoice_cross_check_failed`
- 1 pratiche — `co_beneficiary_invoice_identity_unresolved`
- 1 pratiche — `infissi_shading_closures_form_answer_missing_or_ambiguous`
- 1 pratiche — `invoice_schedule_amount_missing`
- 1 pratiche — `persiana_measurement_ambiguous_1`
- 1 pratiche — `screening_gtot_missing_operator_required_3`
- 1 pratiche — `screening_gtot_missing_operator_required_4`
- 1 pratiche — `screening_gtot_missing_operator_required_5`

## Incoerenze

- Nessuna.

## Artefatti

- Report nativo: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-wide100-current-cohort-bridge-r25/report.json`
- Checkpoint nativo: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-wide100-current-cohort-bridge-r25/checkpoint.json`
- Elenco dettagliato operator_required: `operator-required-by-cause-final.md`.

