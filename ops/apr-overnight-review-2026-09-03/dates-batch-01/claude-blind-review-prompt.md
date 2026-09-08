Esegui una revisione cieca dei documenti reali contenuti esclusivamente nella directory
`ops/apr-overnight-review-2026-09-03/dates-batch-01/blind-documents`.

Vincoli:

- Non leggere file esterni a quella directory, codice, report, blocker, output o ipotesi APR.
- Non inferire una data lavori dalla sola data di fattura, pagamento, stampa, emissione, ordine o consegna.
- Cerca nei PDF e nelle immagini le dichiarazioni esplicite di inizio lavori, fine lavori, completamento posa/installazione e collaudo.
- Distingui sempre il testo letterale del documento dalla tua interpretazione.
- Se una data non è provata esplicitamente, dichiarala assente; non colmare lacune.
- Cita per ogni evidenza il nome del file e la pagina/immagine esatta.
- Non modificare i documenti.

Per ognuno dei 14 casi elencati in `batch-manifest.json`, restituisci un oggetto JSON con:

- `caseId`, `displayName`;
- `explicitStartDate`: data ISO oppure null;
- `explicitCompletionDate`: data ISO oppure null;
- `explicitInstallationDate`: data ISO oppure null;
- `explicitCommissioningDate`: data ISO oppure null;
- `otherDates`: array di date non probatorie con tipo (`invoice`, `payment`, `print`, `order`, `delivery`, `other`), data ISO e fonte;
- `evidence`: array con `field`, `literalText`, `filename`, `pageOrImage`, `confidence` (`high`, `medium`, `low`);
- `missingEvidence`: elenco preciso delle prove realmente assenti;
- `documentCondition`: eventuali problemi reali di leggibilità/orientamento/completezza;
- `reviewConclusion`: `explicit_dates_found`, `dates_not_explicitly_proven` oppure `documents_unreadable`;
- `notes`: breve motivazione, senza riferimenti ad APR.

L'output deve essere JSON valido, senza Markdown, con schema radice:

`{"schemaVersion":"claude-blind-date-review-v1","reviewMethod":"real-documents-blind","cases":[...]}`
