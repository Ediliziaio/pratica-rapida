# APR — proposta dei tre test mancanti per il Commit 1

Data: 25 agosto 2026
Ambito: proposta testuale; nessun test e nessuna regola business implementati da questo documento.

## 1. Unita positive esplicite non ridotte dal fallback

- **Rule ID coperti:** `user-2026-08-16-default-single-unit-when-unspecified` e `user-2026-08-14-single-unit-building-over-floor-count`.
- **Fixture/input:** riusare la forma minima della fixture Daniela D'Esposito presente in `crmLocalPreflight.test.ts`, sostituendo `edificio.numero_appartamenti: 0` con `edificio.numero_appartamenti: 2`. Non serve una nuova fixture su disco; basta una variante locale del dato gia esistente.
- **Esecuzione proposta:** chiamare `buildCrmLocalPreflightReport(...)` con il dossier contenente il valore positivo esplicito `2`.
- **Asserzioni esatte:** `buildingUnitCount` deve essere `2`; `buildingQualification` deve essere `multi_unit`; `warnings` non deve contenere `building_units_defaulted_to_one`; nessun audit del caso deve dichiarare che il valore `1` deriva dal fallback.
- **Scopo negativo:** dimostrare che il fallback interviene soltanto per valore assente, vuoto o zero e non sovrascrive mai un numero positivo esplicito.

## 2. Fonte primaria esplicita plurifamiliare prevalente

- **Rule ID coperti:** `user-2026-08-18-explicit-building-type-over-affected-unit-count` e, come regola subordinata, `user-2026-08-14-single-unit-building-over-floor-count`.
- **Fixture/input:** serve una nuova fixture sintetica minima, senza dati cliente reali, con una fonte primaria che dichiara esplicitamente `condominio` oppure `piu unita`; il numero dei piani puo essere valorizzato ma deve restare soltanto descrittivo. La fixture deve conservare l'identificativo della fonte primaria e il testo esplicito usato per la classificazione.
- **Esecuzione proposta:** passare il dossier al resolver preflight/immobile che produce `buildingQualification` e l'audit del payload ENEA.
- **Asserzioni esatte:** `buildingQualification` deve essere `multi_unit`; gli `appliedRuleIds` devono contenere `user-2026-08-18-explicit-building-type-over-affected-unit-count`; la prova deve citare la fonte primaria esplicita; il risultato non deve essere derivato dalla sola fascia dei piani e non deve applicare il fallback a una unita.
- **Scopo positivo:** dimostrare che la pluralita viene riconosciuta quando, e soltanto quando, esiste una dichiarazione primaria esplicita.

## 3. Molti piani senza fonte plurifamiliare non riclassificano l'edificio

- **Rule ID coperti:** `user-2026-08-14-single-unit-building-over-floor-count` e `user-2026-08-18-explicit-building-type-over-affected-unit-count` in funzione fail-closed.
- **Fixture/input:** riusare il caso sintetizzato dalla fixture Federigo Cileo gia presente in `crmLocalPreflight.test.ts`: `numero_appartamenti: 1` e `tipologia: edificio_oltre_3_piani`, senza alcuna fonte primaria che dichiari condominio o piu unita. Non serve una nuova fixture; va estesa la verifica gia esistente.
- **Esecuzione proposta:** chiamare `buildCrmLocalPreflightReport(...)` e verificare anche l'audit/payload immobile prodotto dal caso.
- **Asserzioni esatte:** `buildingUnitCount` deve essere `1`; `buildingQualification` deve essere `single_unit`; deve essere presente il warning auditato `single_unit_over_floor_band` con `user-2026-08-14-single-unit-building-over-floor-count`; non deve esistere un blocker di conflitto edificio e non deve risultare applicata una classificazione plurima basata sul solo numero dei piani.
- **Scopo negativo/fail-closed:** dimostrare che la fascia `oltre tre piani` non costituisce una fonte primaria di pluralita e non puo trasformare una casa singola in condominio.

## Collocazione suggerita

I tre test appartengono principalmente a `scripts/enea-shadow-runner/crmLocalPreflight.test.ts`. Per il secondo e il terzo e utile aggiungere, nello stesso intervento futuro, un'asserzione di audit in `scripts/enea-shadow-runner/crmEneaPayloadAudit.test.ts`, senza duplicare la logica del resolver.
