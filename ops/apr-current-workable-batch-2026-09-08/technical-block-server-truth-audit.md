# Audit server-side dei TECHNICAL_BLOCK r86

## Verdetto

L'ipotesi che 32 dei 38 `TECHNICAL_BLOCK` siano bozze ENEA completate ma classificate prematuramente non e supportata dalle fonti persistenti ed e contraddetta dalle verifiche server disponibili.

Il numero verificato resta **37 pratiche completate su 105**. Non e stato dimostrato alcun completamento aggiuntivo nascosto.

## Tre riscontri

1. Il checkpoint globale contiene 38 risultati `technical_block`; soltanto due hanno un `draftId` e nessuno dichiara pagine completate.
2. Tre GET autenticati e read-only per ciascuna delle bozze 470773 (Fausta De Filippo) e 470774 (Danila Serpa) hanno restituito risposte identiche: entrambe contengono soltanto la versione della pratica (`ver: 1`), senza beneficiario, immobile, intervento o calcolo. `createdAt` e `modifiedAt` coincidono. Sono involucri vuoti, non bozze completate.
3. Eugenio Codognato non possiede un `draftId`: il ledger registra un solo intento di creazione, zero salvataggi e zero pagine completate; il driver CDP non registra mapping o eventi. Non esiste prova con cui attribuirgli un completamento server.

Inoltre, 34 dei 38 risultati tecnici concordano tra checkpoint/report/snapshot terminale; quattro casi con timeout non concordano tra le fonti e devono restare `INCONSISTENT`, non essere promossi a completati.

## Decisione tecnica

Non e stata modificata la logica del finalizzatore. La causa proposta (32 finalizzazioni premature di bozze completate) non e dimostrata. Correggerla sulla base di questa ipotesi rischierebbe di indebolire i controlli fail-closed e trasformare errori reali di preflight, mapping, riconciliazione o verifica campo in falsi successi.

Le cause reali dei 38 esiti vanno trattate per famiglia gia documentata; l'unica divergenza di stato qui osservata riguarda i quattro timeout e richiede un audit separato del ciclo di vita, non una promozione a `saved`.

## Sicurezza della verifica

La verifica server ha consentito esclusivamente GET/HEAD verso l'origine ENEA. POST/PUT/PATCH/DELETE erano intercettati e rifiutati prima dell'invio. Non sono state caricate pagine di form e non sono state effettuate scritture.
