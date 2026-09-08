Esegui una lettura cieca e indipendente dei documenti originali elencati sotto. Non leggere codice, report APR, checkpoint, OCR persistiti, file di confronto o blocker. Leggi soltanto i PDF/immagini presenti ricorsivamente nelle cartelle `crm-original-documents/files` indicate.

Scopo: stabilire se quantità, larghezza, altezza/sporgenza e associazione delle righe prodotto sono esplicite nei documenti originali. Non dedurre misure della finestra come misure del prodotto e non trasformare nomi modello o importi in misure. Segnala documenti duplicati, acconto/saldo che ripetono gli stessi prodotti e qualsiasi ambiguità reale.

Casi:

1. Cesare Imperiali — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/cesare-imperiali`
2. Massimo Cappello — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/massimo-cappello`
3. Stefano Buosi — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/stefano-buosi`
4. prova rivenditore 1 30/04 — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/prova-rivenditore-1-30-04`
5. CLAUDIA SELLATI — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/claudia-sellati`
6. Mauro Leonardi — `ops/apr-reliability-gap-audit-2026-09-03/product-review-documents/mauro-leonardi`

Restituisci soltanto JSON valido, senza markdown, con struttura:
{"schemaVersion":"blind-product-review-v1","cases":[{"displayName":"...","documentFilesReviewed":["..."],"physicalProductCount":null,"products":[{"sourceFile":"...","page":1,"description":"...","quantity":null,"width":null,"heightOrProjection":null,"unit":null,"exactVisibleText":"..."}],"duplicateOrRepeatedDocuments":[],"classification":"EXPLICIT_COMPLETE|EXPLICIT_PARTIAL|GENUINELY_MISSING|AMBIGUOUS","exactCause":"...","missingDocumentType":null,"operatorQuestion":"...","onboardingGap":"..."}]}

Ogni `operatorQuestion` deve essere una domanda diretta e specifica. Se i dati sono completi, usa `null` per `missingDocumentType`, `operatorQuestion` e `onboardingGap`.
