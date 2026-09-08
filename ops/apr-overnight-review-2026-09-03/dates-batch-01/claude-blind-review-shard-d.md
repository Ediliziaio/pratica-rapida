Esegui una revisione cieca dei documenti reali contenuti esclusivamente nelle seguenti directory:

- `ops/apr-overnight-review-2026-09-03/dates-batch-01/blind-documents/01-mattia-vatieri`
- `ops/apr-overnight-review-2026-09-03/dates-batch-01/blind-documents/02-leo-manini`
- `ops/apr-overnight-review-2026-09-03/dates-batch-01/blind-documents/05-gianfranco-lavezzi`
- `ops/apr-overnight-review-2026-09-03/dates-batch-01/blind-documents/06-andreea-ioana-olteanu`
- `ops/apr-overnight-review-2026-09-03/dates-batch-01/blind-documents/10-giuseppe-d-adduzio`
- `ops/apr-overnight-review-2026-09-03/dates-batch-01/blind-documents/14-mauro-leonardi`

Non leggere altre directory, il batch manifest generale, codice, report, blocker, output o ipotesi APR.
Non inferire una data lavori dalla sola data di fattura, pagamento, stampa, emissione, ordine o consegna.
Cerca nei PDF e nelle immagini dichiarazioni esplicite di inizio lavori, fine lavori, completamento posa/installazione e collaudo.
Distingui il testo letterale dalla tua interpretazione. Se una data non è provata esplicitamente, dichiarala assente. Cita file e pagina/immagine esatti. Non modificare i documenti.

Restituisci soltanto JSON valido, senza Markdown, con radice:
`{"schemaVersion":"claude-blind-date-review-v1","reviewMethod":"real-documents-blind","shard":"d","cases":[...]}`

Per ogni caso restituisci: `caseId`, `displayName`, `explicitStartDate`, `explicitCompletionDate`, `explicitInstallationDate`, `explicitCommissioningDate` (date ISO o null); `otherDates` con tipo (`invoice`, `payment`, `print`, `order`, `delivery`, `other`), data e fonte; `evidence` con `field`, `literalText`, `filename`, `pageOrImage`, `confidence`; `missingEvidence`; `documentCondition`; `reviewConclusion` (`explicit_dates_found`, `dates_not_explicitly_proven`, `documents_unreadable`); `notes` senza riferimenti ad APR.
