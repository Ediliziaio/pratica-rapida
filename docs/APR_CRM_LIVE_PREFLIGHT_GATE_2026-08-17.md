# APR CRM live → preflight locale · gate 2026-08-17

## Esito

Gate completato per la coorte persistente `apr-pilot-40`.

- APR ha consumato i 10 eventi CRM reali gia' intercettati dalla pipeline `Pronte da fare`.
- Ogni dossier e' stato acquisito con un GET esatto per ID e salvato con fingerprint.
- Gli allegati originari sono stati acquisiti e analizzati localmente, una fonte alla volta.
- Il preflight e' terminato per tutte le 10 pratiche; ogni blocco e' rimasto confinato alla relativa pratica.
- Nessuna mutazione CRM, azione ENEA, preview, submit o comunicazione e' stata abilitata.

## Evidenza operativa

Intervallo del run: `2026-08-17T09:50:51.086Z` → `2026-08-17T10:00:32.816Z` (circa 9 minuti e 42 secondi, inclusa la diagnosi e riparazione OCR).

| Evidenza | Risultato |
| --- | ---: |
| Eventi CRM elaborati | 10/10 |
| Dossier acquisiti | 10/10 |
| Fonti inventariate | 38 |
| PDF acquisiti e fingerprintati | 36 |
| PDF analizzati localmente | 36 |
| Allegati non PDF bloccati prima della rete | 2 PNG |
| Preflight terminali | 10/10 |
| Piani locali verdi | 0 |
| Casi isolati per intervento operatore | 10 |

La prima installazione non trovava `apr-pdf-ocr` dal runtime annidato. La ricerca del componente e' stata resa indipendente dalla working directory e `pdf-analyzer-live-runtime-path-v2` ha riarmato esclusivamente le analisi fallite, riusando i PDF gia' acquisiti. Dopo la riparazione: 36 analisi concluse, zero blocchi OCR.

## Riavvio e idempotenza

Dopo il completamento il supervisore e' passato dal PID `42522` al PID `42771`. Prima e dopo il riavvio sono rimasti identici:

- checkpoint orchestratore: `a9f7d12165ca94c54dc558c4a3b418e9dee74917e9057381610f19de21e06be5`;
- dossier: `6aaf0d3f1f19f25a446e036a58ed7ade21867a080f5f4730927cdafd209c4965`;
- allegati: `3651f907fdda9292d4efc51d4bf3ebf10f6d3cc69355029bf1d6234be8474bb9`;
- analisi: `9869da2d0ab3a4ccea6622044394c732efdc83a078b7374f70029946caff9bbb`;
- preflight: `cb22fe26c60fa9867ac08f9dabcf6f715f3f22ab760fdef4881ae78f96fd725b`.

I contatori sono rimasti invariati: 10 GET dossier, 36 GET PDF, 36 documenti analizzati e 10 preflight. I 70 tentativi di analisi includono i 34 tentativi iniziali falliti per percorso OCR e le 36 riprese locali autorizzate; nessun download CRM e' stato ripetuto.

## Verifiche software

- test mirati CRM live/dashboard/ripresa: 20/20 verdi;
- test mirati riparazione OCR: 7/7 verdi;
- suite completa ripetuta dopo la riparazione OCR: 115 file e 686 test verdi;
- typecheck runner e build applicazione: verdi.

## Visibilita'

- dashboard: `http://127.0.0.1:4472/`;
- API: `http://127.0.0.1:4472/api/crm-live-processing`;
- stato terminale: `OPERATOR_REQUIRED`, fase `completed`;
- dashboard mostra pratica, fase, fonti, motivi, prossima azione e regole applicate.

## Limiti residui reali

1. Il contratto allegati accetta attualmente PDF; due PNG originari sono stati bloccati senza GET. Serve un gate locale dedicato per immagini originali con fingerprint e OCR.
2. I 10 preflight sono terminali ma non verdi: i blocker ricorrenti riguardano riconoscimento delle righe tecniche, totale IVA compresa, classificazione documenti, una data e un CF. Non sono state inventate correzioni.
3. La coorte live e' una fotografia immutabile dei 10 eventi gia' intercettati. L'estensione incrementale a eventi arrivati dopo la preparazione richiede un gate separato.
4. L'instradamento verso la pipeline CRM `Richiesto intervento operatore` e' ancora soltanto simulato/localmente contrattualizzato; nessuna mutazione CRM reale e' stata eseguita.
5. ENEA resta fuori da questo gate: readiness/lease non acquisita e azioni ENEA disabilitate.
6. Il watchdog globale mostra ancora un `OPERATOR_REQUIRED` storico della coorte precedente; non rappresenta un arresto del nuovo runtime CRM live, ma va separato dal suo stato nel gate successivo.
