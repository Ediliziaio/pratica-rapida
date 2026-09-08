Esegui una revisione cieca dei documenti reali contenuti esclusivamente nelle seguenti directory:

- `ops/apr-overnight-review-2026-09-03/dates-batch-01/blind-documents/07-vito-fusillo`
- `ops/apr-overnight-review-2026-09-03/dates-batch-01/blind-documents/08-giovanni-amadu`
- `ops/apr-overnight-review-2026-09-03/dates-batch-01/blind-documents/09-ida-gigliotti`

Non leggere altre directory, il batch manifest generale, codice, report, blocker, output o ipotesi APR.
Non inferire una data lavori dalla sola data di fattura, pagamento, stampa, emissione, ordine o consegna.
Cerca nei PDF e nelle immagini dichiarazioni esplicite di inizio lavori, fine lavori, completamento posa/installazione e collaudo.
Distingui il testo letterale dalla tua interpretazione. Se una data non è provata esplicitamente, dichiarala assente. Cita file e pagina/immagine esatti. Non modificare i documenti.

Restituisci soltanto JSON valido, senza Markdown, con radice:
`{"schemaVersion":"claude-blind-date-review-v1","reviewMethod":"real-documents-blind","shard":"b","cases":[...]}`

Per ogni caso restituisci: `caseId`, `displayName`, `explicitStartDate`, `explicitCompletionDate`, `explicitInstallationDate`, `explicitCommissioningDate` (date ISO o null); `otherDates` con tipo (`invoice`, `payment`, `print`, `order`, `delivery`, `other`), data e fonte; `evidence` con `field`, `literalText`, `filename`, `pageOrImage`, `confidence`; `missingEvidence`; `documentCondition`; `reviewConclusion` (`explicit_dates_found`, `dates_not_explicitly_proven`, `documents_unreadable`); `notes` senza riferimenti ad APR.
