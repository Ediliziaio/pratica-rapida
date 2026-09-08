# APR — replay locale r69 (100 pratiche, manifest originale)

Data: 2026-09-06T15:51:05.772Z
Manifest: `/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida/ops/apr-wide100-province-lineage-2026-09-02/manifest.json` (SHA-256 `51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0`)

**Sicurezza:** replay locale, sola lettura dei checkpoint gia' presenti su disco. Nessun accesso a Chrome, ENEA, keepalive o servizi persistenti.

## Aggregato

- Pratiche totali: 100
- **Procedibili in locale (`ready_local_plan`): 26**
- Bloccate (`blocked_case`): 74
- Non trovate nello stato locale: 0
- Errori di esecuzione: 0

## Frequenza blocker (tra le pratiche bloccate)

- `screenings_missing`: 54
- `invoice_332a5af9`: 36
- `gross_triple_reconciliation_failed`: 26
- `product_cardinality_form_invoice_mismatch`: 23
- `completion_over_90_days_operator_required`: 14
- `completion_date_portal_year_mismatch`: 11
- `screening_primary_measurements_missing`: 11
- `original_invoice_missing_or_unavailable`: 10
- `completion_date_missing`: 9
- `tax_code_missing_or_invalid`: 8
- `customer_form_missing`: 7
- `invoice_929a8665`: 7
- `permanent_supplier_automation_exclusion`: 3
- `bank_transfer_principal_exceeds_invoices`: 2
- `bank_transfer_invoice_cross_check_failed`: 1
- `co_beneficiary_invoice_identity_unresolved`: 1
- `draft_payload_mapping_incomplete`: 1
- `invoice_schedule_amount_missing`: 1
- `permanent_customer_automation_exclusion`: 1
- `persiana_measurement_ambiguous_1`: 1
- `product_unclassified_1`: 1
- `product_unclassified_2`: 1
- `product_unclassified_3`: 1
- `product_unclassified_4`: 1
- `product_unclassified_5`: 1
- `works_municipality_invoice_conflict`: 1

## Frequenza avvisi (override documento-su-CRM applicati)

- `enea_2026_june_25_ninety_day_window_applied`: 39
- `explicit_building_type_over_apartment_count`: 24
- `crm_fiscal_code_confirmed_by_invoice_customer_block`: 23
- `invoice_reference_unique_base_matched`: 10
- `building_units_defaulted_to_one`: 8
- `product_cardinality_form_invoice_difference_resolved`: 8
- `linea_sole_potito_paper_form_accepted`: 7
- `primary_beneficiary_identity_overridden_by_invoice`: 7
- `secondary_home_36_percent_allocation_planned`: 7
- `bank_transfer_below_invoice_total_audited_nonblocking`: 6
- `birth_country_resolved_from_reliable_belfiore_registry`: 5
- `co_beneficiary_form_overridden_by_invoice`: 4
- `original_non_fiscal_technical_source_applied`: 4
- `paper_form_birth_date_separator_ocr_repaired`: 4
- `bundled_professional_expense_gross_used`: 3
- `co_beneficiary_confirmed_by_invoice`: 2
- `bank_fees_excluded_invoice_total_authoritative`: 1
- `explicit_original_completion_date_applied`: 1
- `fiscal_code_single_ocr_confusable_repaired`: 1
- `original_pratica_rapida_paper_form_explicit_values_accepted`: 1
- `resolved_non_economic_total_blocker_retired`: 1
- `works_municipality_overridden_by_invoice`: 1

## Dettaglio per pratica

| customerKey | coorte | esito | blocker | avvisi |
|---|---|---|---|---|
| guido-calvacchi | 2921 | blocked_case | gross_triple_reconciliation_failed | bundled_professional_expense_gross_used, enea_2026_june_25_ninety_day_window_applied |
| sarah-mondini | 2922 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, screening_primary_measurements_missing | explicit_building_type_over_apartment_count |
| lucia-droghetti | 2923 | ready_local_plan | - | - |
| stefania-spina | 2924 | blocked_case | permanent_supplier_automation_exclusion | - |
| andreea-ioana-olteanu | 2925 | blocked_case | screenings_missing, completion_date_portal_year_mismatch, completion_over_90_days_operator_required, invoice_332a5af9 | birth_country_resolved_from_reliable_belfiore_registry, co_beneficiary_form_overridden_by_invoice |
| filippo-bigalli | 2926 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, original_invoice_missing_or_unavailable, completion_date_missing, gross_triple_reconciliation_failed | - |
| angela-tuttolani | 2927 | blocked_case | invoice_929a8665, gross_triple_reconciliation_failed | explicit_building_type_over_apartment_count, product_cardinality_form_invoice_difference_resolved |
| maria-sofia-tosatti | 2928 | blocked_case | screenings_missing, screening_primary_measurements_missing | linea_sole_potito_paper_form_accepted, paper_form_birth_date_separator_ocr_repaired, crm_fiscal_code_confirmed_by_invoice_customer_block, building_units_defaulted_to_one |
| alessandro-zaniboni | 2929 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, original_invoice_missing_or_unavailable, completion_date_missing, gross_triple_reconciliation_failed | - |
| gianfranco-lavezzi | 2930 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, completion_over_90_days_operator_required, invoice_332a5af9, gross_triple_reconciliation_failed | secondary_home_36_percent_allocation_planned |
| roberta-di-cesare | 2931 | blocked_case | customer_form_missing, screenings_missing, screening_primary_measurements_missing | crm_fiscal_code_confirmed_by_invoice_customer_block, primary_beneficiary_identity_overridden_by_invoice |
| marco-de-marinis | 2932 | blocked_case | screenings_missing, completion_date_portal_year_mismatch, completion_over_90_days_operator_required, invoice_332a5af9, invoice_929a8665, gross_triple_reconciliation_failed | works_municipality_overridden_by_invoice |
| marcella-capatti | 2933 | blocked_case | screenings_missing, completion_over_90_days_operator_required, invoice_332a5af9 | explicit_original_completion_date_applied |
| matteo-capitanelli | 2934 | blocked_case | gross_triple_reconciliation_failed | secondary_home_36_percent_allocation_planned, enea_2026_june_25_ninety_day_window_applied |
| nicla-biagioni | 2935 | blocked_case | original_invoice_missing_or_unavailable, screenings_missing, completion_date_missing, screening_primary_measurements_missing, gross_triple_reconciliation_failed | - |
| eugenio-codognato | 2936 | blocked_case | screenings_missing, screening_primary_measurements_missing | invoice_reference_unique_base_matched, enea_2026_june_25_ninety_day_window_applied |
| giulia-kasermann | 2937 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, screening_primary_measurements_missing | enea_2026_june_25_ninety_day_window_applied |
| gabriele-girelli | 2938 | blocked_case | screenings_missing, original_invoice_missing_or_unavailable, completion_date_missing, gross_triple_reconciliation_failed | - |
| vincenzo-falconi | 2939 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9 | explicit_building_type_over_apartment_count, enea_2026_june_25_ninety_day_window_applied |
| gregorio-fusco | 2940 | blocked_case | screenings_missing, invoice_332a5af9 | secondary_home_36_percent_allocation_planned, enea_2026_june_25_ninety_day_window_applied |
| rossella-munafo | 2941 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9 | crm_fiscal_code_confirmed_by_invoice_customer_block, explicit_building_type_over_apartment_count, enea_2026_june_25_ninety_day_window_applied |
| luca-ronconi | 2942 | ready_local_plan | - | co_beneficiary_confirmed_by_invoice, explicit_building_type_over_apartment_count, bank_transfer_below_invoice_total_audited_nonblocking |
| giovanna-atzeni | 2943 | blocked_case | customer_form_missing, tax_code_missing_or_invalid, screenings_missing, bank_transfer_principal_exceeds_invoices, completion_date_portal_year_mismatch, completion_over_90_days_operator_required, invoice_332a5af9 | - |
| andrea-trabucco | 2944 | blocked_case | screenings_missing, invoice_332a5af9 | enea_2026_june_25_ninety_day_window_applied |
| vera-buracchi | 2945 | blocked_case | original_invoice_missing_or_unavailable, screenings_missing, invoice_332a5af9 | secondary_home_36_percent_allocation_planned, enea_2026_june_25_ninety_day_window_applied |
| antonella-ferletic | 2946 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, screening_primary_measurements_missing | explicit_building_type_over_apartment_count, enea_2026_june_25_ninety_day_window_applied |
| luca-cigognetti | 2947 | ready_local_plan | - | original_non_fiscal_technical_source_applied, crm_fiscal_code_confirmed_by_invoice_customer_block, enea_2026_june_25_ninety_day_window_applied |
| giuseppe-d-adduzio | 2948 | blocked_case | permanent_supplier_automation_exclusion | - |
| lia-chiericati | 2949 | ready_local_plan | - | - |
| della-maria-carla-vigetti | 2950 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9 | primary_beneficiary_identity_overridden_by_invoice, enea_2026_june_25_ninety_day_window_applied |
| gabriello-manso | 2951 | blocked_case | gross_triple_reconciliation_failed | invoice_reference_unique_base_matched |
| monica-molteni | 2952 | ready_local_plan | - | invoice_reference_unique_base_matched, enea_2026_june_25_ninety_day_window_applied |
| santo-giuga | 2953 | blocked_case | screenings_missing, bank_transfer_invoice_cross_check_failed, screening_primary_measurements_missing, invoice_929a8665, gross_triple_reconciliation_failed | - |
| patrizia-muzzi | 2954 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, completion_date_missing, gross_triple_reconciliation_failed | secondary_home_36_percent_allocation_planned |
| claudia-campagna | 2955 | ready_local_plan | - | - |
| ida-gigliotti | 2956 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, completion_date_portal_year_mismatch, completion_over_90_days_operator_required, invoice_332a5af9 | crm_fiscal_code_confirmed_by_invoice_customer_block |
| loretta-riviera | 2957 | blocked_case | original_invoice_missing_or_unavailable, screenings_missing, completion_date_missing, invoice_332a5af9, gross_triple_reconciliation_failed | - |
| fabio-sartori | 2958 | ready_local_plan | - | explicit_building_type_over_apartment_count, enea_2026_june_25_ninety_day_window_applied |
| annalisa-lanzo | 2959 | ready_local_plan | - | invoice_reference_unique_base_matched, explicit_building_type_over_apartment_count |
| armando-ranzoni | 2960 | ready_local_plan | - | crm_fiscal_code_confirmed_by_invoice_customer_block |
| monica-ambra-fioravanti | 2961 | ready_local_plan | - | invoice_reference_unique_base_matched, product_cardinality_form_invoice_difference_resolved |
| massimiliano-montemorra | 2962 | blocked_case | permanent_supplier_automation_exclusion | - |
| adelfio-pietro-spinelli | 2963 | ready_local_plan | - | invoice_reference_unique_base_matched, enea_2026_june_25_ninety_day_window_applied |
| sabrina-eustomi | 2964 | blocked_case | customer_form_missing, tax_code_missing_or_invalid | enea_2026_june_25_ninety_day_window_applied |
| cesare-imperiali | 2965 | blocked_case | screenings_missing, invoice_332a5af9 | crm_fiscal_code_confirmed_by_invoice_customer_block, secondary_home_36_percent_allocation_planned, enea_2026_june_25_ninety_day_window_applied |
| natale-tiraboschi | 2966 | blocked_case | works_municipality_invoice_conflict, product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9, invoice_929a8665, gross_triple_reconciliation_failed | enea_2026_june_25_ninety_day_window_applied |
| paolino-bellini | 2967 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9, invoice_929a8665, gross_triple_reconciliation_failed | explicit_building_type_over_apartment_count |
| lea-dettori | 2968 | ready_local_plan | - | crm_fiscal_code_confirmed_by_invoice_customer_block, co_beneficiary_form_overridden_by_invoice, explicit_building_type_over_apartment_count, enea_2026_june_25_ninety_day_window_applied |
| riccardo-coda | 2969 | blocked_case | invoice_929a8665, gross_triple_reconciliation_failed | linea_sole_potito_paper_form_accepted, crm_fiscal_code_confirmed_by_invoice_customer_block, primary_beneficiary_identity_overridden_by_invoice, building_units_defaulted_to_one, enea_2026_june_25_ninety_day_window_applied |
| massimo-cappello | 2970 | blocked_case | screenings_missing, invoice_332a5af9 | invoice_reference_unique_base_matched, enea_2026_june_25_ninety_day_window_applied |
| giovanni-pescatori | 2971 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9 | explicit_building_type_over_apartment_count, enea_2026_june_25_ninety_day_window_applied |
| gavina-emanuela-cannas | 2972 | blocked_case | customer_form_missing, tax_code_missing_or_invalid, screenings_missing, invoice_332a5af9 | bank_transfer_below_invoice_total_audited_nonblocking, enea_2026_june_25_ninety_day_window_applied |
| diego-mario-mocenighi | 2973 | blocked_case | screenings_missing, invoice_332a5af9 | linea_sole_potito_paper_form_accepted, paper_form_birth_date_separator_ocr_repaired, building_units_defaulted_to_one, bank_transfer_below_invoice_total_audited_nonblocking, bundled_professional_expense_gross_used, enea_2026_june_25_ninety_day_window_applied |
| stefano-buosi | 2974 | blocked_case | screenings_missing, invoice_332a5af9 | enea_2026_june_25_ninety_day_window_applied |
| prova-rivenditore-1-30-04 | 2975 | blocked_case | permanent_customer_automation_exclusion | - |
| vito-fusillo | 2976 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, completion_date_portal_year_mismatch, completion_over_90_days_operator_required, invoice_332a5af9 | crm_fiscal_code_confirmed_by_invoice_customer_block, explicit_building_type_over_apartment_count |
| fares-hassairi | 2977 | ready_local_plan | - | crm_fiscal_code_confirmed_by_invoice_customer_block, birth_country_resolved_from_reliable_belfiore_registry |
| ivana-mastrangelo | 2978 | blocked_case | screenings_missing, invoice_332a5af9, invoice_929a8665, gross_triple_reconciliation_failed | - |
| liliana-gloria | 2979 | blocked_case | gross_triple_reconciliation_failed | linea_sole_potito_paper_form_accepted, crm_fiscal_code_confirmed_by_invoice_customer_block, building_units_defaulted_to_one, bank_transfer_below_invoice_total_audited_nonblocking |
| lucia-lagrasta | 2980 | ready_local_plan | - | explicit_building_type_over_apartment_count, product_cardinality_form_invoice_difference_resolved, enea_2026_june_25_ninety_day_window_applied |
| angelina-stricelli | 2981 | blocked_case | screenings_missing, invoice_332a5af9 | - |
| nadia-ragni | 2982 | ready_local_plan | - | secondary_home_36_percent_allocation_planned |
| gloria-padoani | 2983 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9, gross_triple_reconciliation_failed | explicit_building_type_over_apartment_count |
| milena-albertoni | 2984 | ready_local_plan | - | crm_fiscal_code_confirmed_by_invoice_customer_block |
| cataldo-cassone | 2985 | ready_local_plan | - | crm_fiscal_code_confirmed_by_invoice_customer_block, explicit_building_type_over_apartment_count |
| marco-tocchetti | 2986 | blocked_case | original_invoice_missing_or_unavailable, gross_triple_reconciliation_failed | invoice_reference_unique_base_matched, product_cardinality_form_invoice_difference_resolved, enea_2026_june_25_ninety_day_window_applied |
| romeo-ropa | 2987 | ready_local_plan | - | fiscal_code_single_ocr_confusable_repaired, explicit_building_type_over_apartment_count |
| claudia-sellati | 2988 | ready_local_plan | - | original_non_fiscal_technical_source_applied, enea_2026_june_25_ninety_day_window_applied |
| rocco-giacotto | 2989 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, original_invoice_missing_or_unavailable, completion_date_missing, gross_triple_reconciliation_failed | birth_country_resolved_from_reliable_belfiore_registry, explicit_building_type_over_apartment_count |
| maurizia-coreggioli | 2990 | blocked_case | customer_form_missing, tax_code_missing_or_invalid, completion_over_90_days_operator_required | resolved_non_economic_total_blocker_retired |
| milena-fiorini | 2991 | blocked_case | product_unclassified_1, product_unclassified_2, product_unclassified_3, product_unclassified_4, product_unclassified_5 | explicit_building_type_over_apartment_count, product_cardinality_form_invoice_difference_resolved, bundled_professional_expense_gross_used, enea_2026_june_25_ninety_day_window_applied |
| elena-marcella-berti | 2992 | blocked_case | tax_code_missing_or_invalid | linea_sole_potito_paper_form_accepted, building_units_defaulted_to_one, bank_transfer_below_invoice_total_audited_nonblocking, bank_fees_excluded_invoice_total_authoritative, enea_2026_june_25_ninety_day_window_applied |
| elena-depalma | 2993 | blocked_case | screenings_missing, invoice_332a5af9 | crm_fiscal_code_confirmed_by_invoice_customer_block |
| mauro-ballabio | 2994 | ready_local_plan | - | invoice_reference_unique_base_matched, explicit_building_type_over_apartment_count |
| francesca-pisanu | 2995 | blocked_case | customer_form_missing, tax_code_missing_or_invalid, screenings_missing, invoice_332a5af9, gross_triple_reconciliation_failed | enea_2026_june_25_ninety_day_window_applied |
| mauro-leonardi | 2996 | blocked_case | screenings_missing, completion_date_portal_year_mismatch, completion_over_90_days_operator_required, screening_primary_measurements_missing | crm_fiscal_code_confirmed_by_invoice_customer_block, explicit_building_type_over_apartment_count |
| caterina-claudia-garbato | 2997 | blocked_case | persiana_measurement_ambiguous_1, completion_date_portal_year_mismatch, completion_over_90_days_operator_required | original_non_fiscal_technical_source_applied, crm_fiscal_code_confirmed_by_invoice_customer_block, primary_beneficiary_identity_overridden_by_invoice, birth_country_resolved_from_reliable_belfiore_registry |
| flavia-cipriani | 2998 | blocked_case | screenings_missing, invoice_332a5af9 | bank_transfer_below_invoice_total_audited_nonblocking |
| giovanni-amadu | 2999 | blocked_case | customer_form_missing, tax_code_missing_or_invalid, screenings_missing, completion_date_portal_year_mismatch, completion_over_90_days_operator_required, invoice_332a5af9 | - |
| francesca-monti | 3000 | blocked_case | screenings_missing, invoice_332a5af9 | linea_sole_potito_paper_form_accepted, crm_fiscal_code_confirmed_by_invoice_customer_block, primary_beneficiary_identity_overridden_by_invoice, building_units_defaulted_to_one, enea_2026_june_25_ninety_day_window_applied |
| rosa-toscano | 3001 | blocked_case | original_invoice_missing_or_unavailable | invoice_reference_unique_base_matched, product_cardinality_form_invoice_difference_resolved, enea_2026_june_25_ninety_day_window_applied |
| marian-maeschi | 3002 | blocked_case | screenings_missing, screening_primary_measurements_missing | crm_fiscal_code_confirmed_by_invoice_customer_block, birth_country_resolved_from_reliable_belfiore_registry, enea_2026_june_25_ninety_day_window_applied |
| claudio-beghini | 3003 | ready_local_plan | - | - |
| luigi-carfora | 3004 | ready_local_plan | - | enea_2026_june_25_ninety_day_window_applied |
| gemma-minore | 3005 | blocked_case | co_beneficiary_invoice_identity_unresolved, screenings_missing, invoice_332a5af9 | - |
| enrico-amos-maria-berneri | 3006 | blocked_case | screenings_missing, invoice_332a5af9 | linea_sole_potito_paper_form_accepted, paper_form_birth_date_separator_ocr_repaired, crm_fiscal_code_confirmed_by_invoice_customer_block, building_units_defaulted_to_one, enea_2026_june_25_ninety_day_window_applied |
| zeno-righetti | 3007 | ready_local_plan | - | crm_fiscal_code_confirmed_by_invoice_customer_block, explicit_building_type_over_apartment_count, product_cardinality_form_invoice_difference_resolved |
| gianluigi-chiolini | 3008 | ready_local_plan | - | primary_beneficiary_identity_overridden_by_invoice, explicit_building_type_over_apartment_count, product_cardinality_form_invoice_difference_resolved |
| stefania-venturi | 3009 | blocked_case | draft_payload_mapping_incomplete | original_pratica_rapida_paper_form_explicit_values_accepted, paper_form_birth_date_separator_ocr_repaired, building_units_defaulted_to_one |
| francesco-laurelli | 3010 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9, invoice_schedule_amount_missing, gross_triple_reconciliation_failed | co_beneficiary_form_overridden_by_invoice, explicit_building_type_over_apartment_count |
| fausta-de-filippo | 3011 | blocked_case | product_cardinality_form_invoice_mismatch | explicit_building_type_over_apartment_count, enea_2026_june_25_ninety_day_window_applied |
| danila-serpa | 3012 | ready_local_plan | - | - |
| smaj-hhhhh | 3013 | blocked_case | tax_code_missing_or_invalid, product_cardinality_form_invoice_mismatch, screenings_missing, completion_date_missing, gross_triple_reconciliation_failed | - |
| antonio-scaparrotta | 3014 | blocked_case | screenings_missing, bank_transfer_principal_exceeds_invoices, invoice_332a5af9, gross_triple_reconciliation_failed | - |
| fabrizio-pelizzari | 3015 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, invoice_332a5af9 | enea_2026_june_25_ninety_day_window_applied |
| franco-screpanti | 3016 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, original_invoice_missing_or_unavailable, completion_date_missing, gross_triple_reconciliation_failed | - |
| mattia-vatieri | 3017 | blocked_case | product_cardinality_form_invoice_mismatch, screenings_missing, completion_date_portal_year_mismatch, completion_over_90_days_operator_required, screening_primary_measurements_missing | crm_fiscal_code_confirmed_by_invoice_customer_block |
| mimosa-freni | 3018 | ready_local_plan | - | original_non_fiscal_technical_source_applied, crm_fiscal_code_confirmed_by_invoice_customer_block, co_beneficiary_confirmed_by_invoice, enea_2026_june_25_ninety_day_window_applied |
| antonino-formisabo | 3019 | blocked_case | screenings_missing, completion_date_portal_year_mismatch, completion_over_90_days_operator_required, invoice_332a5af9 | primary_beneficiary_identity_overridden_by_invoice, co_beneficiary_form_overridden_by_invoice |
| leo-manini | 3020 | blocked_case | completion_date_portal_year_mismatch, completion_over_90_days_operator_required | - |

