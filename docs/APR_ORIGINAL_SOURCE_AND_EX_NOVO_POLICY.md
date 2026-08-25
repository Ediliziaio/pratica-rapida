# APR — fonti originarie ed elaborazione ex novo

Questa policy è vincolante per i test APR e per le future regole costruite con lo stesso metodo.

## Fonti tecniche ammesse

- La fattura originaria è fonte valida.
- Un certificato tecnico è fonte valida soltanto quando è esplicitamente classificato come certificato reale di terza parte.
- Il “documento tecnico” caricato nel CRM è prodotto internamente: non è una fonte tecnica terza e non può fornire quantità, misure, trasmittanze o altre specifiche.
- Un allegato generico (`additional`) non viene promosso implicitamente a certificato: in assenza di classificazione esplicita viene escluso e auditato.

Regola registro: `user-2026-08-25-crm-internal-technical-document-untrusted-v1`.

## Elaborazione ex novo

APR ricostruisce ogni test come se la pratica non fosse mai stata lavorata. Sono input ammessi soltanto fattura, form cliente e certificato tecnico reale di terza parte. Pipeline storica, decisioni dell’operatore, vecchie bozze o pratiche ENEA e documenti interni derivati non possono orientare mapping, blocker o payload. Un confronto con la lavorazione precedente è ammesso soltanto dopo l’esecuzione, in un benchmark read-only separato.

Regola registro: `user-2026-08-25-test-ex-novo-original-sources-only-v1`.
