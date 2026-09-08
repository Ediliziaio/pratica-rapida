# APR — Riverifica manifest ed etichette tecniche

Data: 26 agosto 2026

Diagnosi eseguita esclusivamente in locale. Nessun accesso a CRM, ENEA o browser e nessuna correzione implementata.

## 1. Replay del manifest congelato

Sono stati rieseguiti i 126 casi primari del manifest con il codice attualmente installato.

| Esito | Manifest storico | Replay attuale |
|---|---:|---:|
| Localmente bozza-salvabili | 44 | 38 |
| Bloccate | 82 | 88 |
| Da bloccate a READY | — | 6 |
| Da READY a bloccate | — | 12 |
| Casi con blocker modificati | — | 63 |

Le sei pratiche ora sbloccate sono:

- Annita Lucidi
- Daniela Guidotti
- Fares Hassairi
- Manuela Macchi
- Gianluca Percaccioli
- Luci Adroghetti

Esistono quindi blocker storici “fantasma”, ma il risultato complessivo non migliora: sei casi vengono recuperati, mentre dodici precedentemente READY sono ora fermati da controlli correnti più severi.

### Confronto blocker per blocker

Formato: `storici → stesso blocker / blocker rimosso ma pratica ancora bloccata / pratica READY`.

| Blocker | Confronto |
|---|---:|
| `screenings_missing` | 69 → 60 / 5 / 4 |
| `invoice_332a5af9` | 63 → 43 / 16 / 4 |
| `gross_triple_reconciliation_failed` | 49 → 24 / 20 / 5 |
| `completion_date_missing` | 32 → 13 / 17 / 2 |
| `infissi_dimensions_and_cardinality_missing` | 26 → 24 / 2 / 0 |
| `invoice_929a8665` | 25 → 7 / 17 / 1 |
| `product_cardinality_form_invoice_mismatch` | 23 → 16 / 3 / 4 |
| `invoice_c1fef38b` | 16 → 0 / 16 / 0 |
| `tax_code_missing_or_invalid` | 9 → 7 / 2 / 0 |
| `infissi_financial_triple_reconciliation_required` | 8 → 8 / 0 / 0 |
| `completion_over_90_days_operator_required` | 6 → 6 / 0 / 0 |
| `customer_form_missing` | 6 → 6 / 0 / 0 |
| `original_invoice_missing_or_unavailable` | 5 → 5 / 0 / 0 |
| `completion_date_portal_year_mismatch` | 4 → 4 / 0 / 0 |
| `infissi_invoice_certificate_cardinality_mismatch` | 4 → 0 / 4 / 0 |
| `infissi_shading_closures_form_answer_missing_or_ambiguous` | 4 → 4 / 0 / 0 |
| `screening_primary_measurements_missing` | 4 → 4 / 0 / 0 |
| `bank_transfer_principal_exceeds_invoices` | 2 → 2 / 0 / 0 |
| `draft_payload_mapping_incomplete` | 2 → 2 / 0 / 0 |
| `infissi_performance_page_cardinality_mismatch` | 2 → 2 / 0 / 0 |
| Sei blocker `avvolgibile_module_not_enabled_*` | 6 → 0 / 0 / 6 |
| `infissi_automatic_source_conflict` | 1 → 1 / 0 / 0 |
| `invoice_78e3f1f0` | 1 → 0 / 1 / 0 |
| `persiana_material_contradiction_1` | 1 → 0 / 1 / 0 |
| `persiana_measurement_ambiguous_1` | 1 → 1 / 0 / 0 |

### Attribuzioni verificabili

- Daniela Guidotti: risolta dalla separazione Rinaldi tra lordo e importo esplicitamente detraibile.
- Fabrizio Bonfanti: il blocker economico è rimosso dalla correzione del parser IVA/totale, ma restano altri blocker.
- Gianluca Percaccioli: rimossi i sei blocker storici “modulo avvolgibili non abilitato”.
- Il classificatore Infissi ha riclassificato 17 documenti in 10 pratiche come certificati tecnici di terza parte. Nessuna di queste dieci diventa però completamente READY: permangono altri problemi.
- Altri 23 casi perdono `gross_triple_reconciliation_failed` grazie all’insieme delle regole finanziarie correnti; non è possibile attribuire onestamente ogni singolo caso a un solo commit.

Le dodici pratiche prima READY e oggi bloccate sono separate nel nuovo snapshot. Le cause principali sono:

- 6 fatture originarie oggi considerate mancanti/non disponibili;
- 2 mapping payload incompleti;
- 2 controlli sulle date;
- 1 spesa professionale incorporata e non separata;
- 1 riconciliazione economica fallita.

Non sono automaticamente classificate come regressioni software: richiedono diagnosi individuale. Sono tuttavia variazioni reali che impediscono di affermare che il manifest sia migliorato monotonamente.

## 2. Perdita della classificazione tecnica

Non è un caso isolato di Daniela.

Tra i 75 casi Schermature:

- 15 hanno evidenza deterministica di una categoria tecnica specifica nella fonte;
- 7 hanno prodotti estratti, ma l’etichetta specifica viene ridotta a una descrizione generica;
- 5 contengono una categoria specifica ma il parser non estrae alcun prodotto: sono fallimenti di estrazione più ampi, non semplice perdita dell’etichetta;
- 3 conservano correttamente la categoria.

I sette casi di perdita dell’etichetta sono:

- Lia Chiericati — pergola → tenda generica
- Daniela Guidotti — pergola Corradi → tenda generica
- Luca Callegari — pergotenda → tenda generica
- Gabriella Bruno — pergola → tenda generica
- Marco Fecondini — pergola → tenda generica
- Giovanni Zucchini — pergola → tenda generica
- Amelia Lerose — zanzariera/VEPA → schermatura generica

Nei primi sei casi l’impatto è solo descrittivo: il tipo finale viene recuperato da form o mapping successivo; misure, superficie, gTot esplicito e movimentazione restano corretti.

Amelia è diversa: la perdita coinvolge una fornitura mista zanzariera/VEPA. Le tre righe diventano genericamente `Schermatura solare MOBILE` con tipo `altro`. Misure, superfici e gTot esplicito restano disponibili, ma:

- si perde la distinzione tecnica fra zanzariera e VEPA;
- materiale e movimentazione derivano da fallback;
- il materiale risultante `Tessuto` non coincide con il fallback autorizzato `Misto` per le zanzariere.

Questo è quindi un impatto tecnico reale/potenziale, non solo estetico.

I cinque casi con categoria specifica ma zero prodotti estratti sono Enrica Moretti, Alessandra Ferrari, Caterina Claudia Garbato, Vito Fusillo e Sarah Mondini.

## Verifiche indipendenti

I risultati sono stati controllati con tre metodi:

1. replay completo dei 126 dossier tramite parser, preflight comune e gate prodotto correnti;
2. confronto SHA-256 tra bundle appena ricostruiti e bundle installati: worker, supervisor e watchdog coincidono esattamente;
3. replay individuale indipendente dei sei nuovi READY, più 79 test pertinenti verdi e typecheck verde.

Il manifest storico è rimasto intatto. Il nuovo snapshot separato è `docs/diagnostics/apr-wide-current-code-replay-2026-08-26.json`.

I 17 casi Vans erano soltanto elencati separatamente nel manifest, senza dossier/evidenze riproducibili, e quindi non fanno parte dei 126 casi sottoposti a replay. Il valore “38 bozza-salvabili” indica esclusivamente esito locale del replay, non bozze realmente create o salvate su ENEA.
