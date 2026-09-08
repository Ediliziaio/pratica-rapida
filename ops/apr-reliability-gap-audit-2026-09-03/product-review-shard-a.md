Esegui una lettura cieca e indipendente dei documenti originali elencati sotto. Non leggere codice, report APR, checkpoint, OCR persistiti, file di confronto o blocker. Leggi soltanto i PDF/immagini presenti ricorsivamente nelle cartelle `crm-original-documents/files` indicate.

Scopo: stabilire se quantità, larghezza, altezza/sporgenza e associazione delle righe prodotto sono esplicite nei documenti originali. Non dedurre misure della finestra come misure del prodotto e non trasformare nomi modello o importi in misure. Segnala documenti duplicati, acconto/saldo che ripetono gli stessi prodotti e qualsiasi ambiguità reale.

Casi:

1. GUIDO CALVACCHI — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/guido-calvacchi`
2. Marcella Capatti — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/marcella-capatti`
3. Nicla Biagioni — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/nicla-biagioni`
4. EUGENIO CODOGNATO — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/eugenio-codognato`
5. Gabriele Girelli — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/gabriele-girelli`
6. Loretta Riviera — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/loretta-riviera`

Restituisci soltanto JSON valido, senza markdown, con struttura:
{"schemaVersion":"blind-product-review-v1","cases":[{"displayName":"...","documentFilesReviewed":["..."],"physicalProductCount":null,"products":[{"sourceFile":"...","page":1,"description":"...","quantity":null,"width":null,"heightOrProjection":null,"unit":null,"exactVisibleText":"..."}],"duplicateOrRepeatedDocuments":[],"classification":"EXPLICIT_COMPLETE|EXPLICIT_PARTIAL|GENUINELY_MISSING|AMBIGUOUS","exactCause":"...","missingDocumentType":null,"operatorQuestion":"...","onboardingGap":"..."}]}

Ogni `operatorQuestion` deve essere una domanda diretta e specifica. Se i dati sono completi, usa `null` per `missingDocumentType`, `operatorQuestion` e `onboardingGap`.
