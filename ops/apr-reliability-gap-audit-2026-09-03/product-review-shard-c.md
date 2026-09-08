Esegui una lettura cieca e indipendente dei documenti originali elencati sotto. Non leggere codice, report APR, checkpoint, OCR persistiti, file di confronto o blocker. Leggi soltanto i PDF/immagini presenti ricorsivamente nelle cartelle `crm-original-documents/files` indicate.

Scopo: stabilire se quantità, larghezza, altezza/sporgenza e associazione delle righe prodotto sono esplicite nei documenti originali. Non dedurre misure della finestra come misure del prodotto e non trasformare nomi modello o importi in misure. Segnala documenti duplicati, acconto/saldo che ripetono gli stessi prodotti e qualsiasi ambiguità reale.

Casi:

1. Caterina Claudia Garbato — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/caterina-claudia-garbato`
2. Marian Maeschi — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/marian-maeschi`
3. Gemma Minore — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/gemma-minore`
4. Mattia Vatieri — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/mattia-vatieri`
5. Leo Manini — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/leo-manini`

Restituisci soltanto JSON valido, senza markdown, con struttura:
{"schemaVersion":"blind-product-review-v1","cases":[{"displayName":"...","documentFilesReviewed":["..."],"physicalProductCount":null,"products":[{"sourceFile":"...","page":1,"description":"...","quantity":null,"width":null,"heightOrProjection":null,"unit":null,"exactVisibleText":"..."}],"duplicateOrRepeatedDocuments":[],"classification":"EXPLICIT_COMPLETE|EXPLICIT_PARTIAL|GENUINELY_MISSING|AMBIGUOUS","exactCause":"...","missingDocumentType":null,"operatorQuestion":"...","onboardingGap":"..."}]}

Ogni `operatorQuestion` deve essere una domanda diretta e specifica. Se i dati sono completi, usa `null` per `missingDocumentType`, `operatorQuestion` e `onboardingGap`.
