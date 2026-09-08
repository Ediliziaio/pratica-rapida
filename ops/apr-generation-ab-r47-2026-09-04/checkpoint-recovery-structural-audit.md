# Audit strutturale checkpoint/recovery APR — Angelina / bozza 462287

## Esito

La generazione corrente non deve essere ripresa. `writeAtomic is not defined` era un evento storico del sequencer, gia eliminato dal codice; la dashboard lo ripubblicava erroneamente come se fosse lo stato corrente. Il problema attuale e piu profondo: il checkpoint applicativo, il journal del worker e il ledger CDP possono essere singolarmente validi ma non rappresentare la stessa cronologia mutativa.

Per Angelina il ledger CDP conserva **tre** eventi `save_page_once` sulla prima pagina della stessa bozza 462287 (revisioni 12, 20 e 28), mentre il checkpoint ricostruito rappresenta soltanto `saveAttemptCount=1` e `recoverySaveAttemptCount=1`. L'ultima prova conclusiva `not_saved` precede i due tentativi successivi; le letture successive sono inconcludenti. Un'altra mutazione non e quindi certificabile.

## Cosa ha trovato l'audit

1. **Manca un ledger mutativo unico per generazione.** Execution, worker e driver effettuano commit separati senza un `intentId` comune obbligatorio e senza riconciliazione prima della mutazione successiva.
2. **Alcune correzioni riaprono i contatori nella stessa generazione.** Diversi percorsi riportano a zero i budget di salvataggio conservando `generationId` e `canonicalDraftId`; l'espressione “nuova generazione” compare nell'audit ma non sempre corrisponde a una nuova identita tecnica.
3. **Il restore verifica la sintassi delle prove, non la loro referenzialita.** Tre `evidenceId` distinti non vengono obbligatoriamente ricercati nei ledger sorgente per verificarne scope, ordine temporale e numero di effetti esterni.
4. **`recovery_authorized` e sovraccarico.** Nella ricostruzione Angelina convive con `recoverySaveAttemptCount=1`: per un ramo significa “recupero ammesso”, per un altro “recupero gia consumato”.
5. **L'idempotenza e legata a dati ricostruibili.** L'identita di `save_page_once` incorpora revisione e contatori; una ricostruzione puo assegnare un ID nuovo alla stessa intenzione esterna.
6. **`validState` valida soprattutto la forma.** Non impone ancora tutte le relazioni tra stato globale, item, pagina, uncertainty, audit, `processedCommandIds` e ledger esterno.
7. **La superficie e ampia.** L'automa espone 6 stati execution, 9 stati item, 5 stati pagina, 5 stati uncertainty e 7 stati nested, con circa 99 metodi di transizione. I 110 test execution e 21 test worker sono verdi, ma verificano i percorsi dichiarati: non possono sostituire l'invariante esterna che oggi manca.
8. **Le altre tredici pagine di Angelina non sono state percorse.** Non attribuisco quindi alcuna garanzia su eventuali difetti portale distinti.

La scansione storica dei ledger locali ha inoltre trovato 36 gruppi coorte/cliente/bozza/pagina con oltre due eventi `save_page_once` su 5.752 eventi complessivi. È prova che la famiglia di discrepanze non e unica ad Angelina; non e prova che tutti i vecchi casi siano riproducibili nel bundle attuale.

## Correzione osservabilita

Ho introdotto la regola `system-terminal-observability-live-source-supersession-v1`: uno snapshot terminale rimane storia immutabile, ma puo essere mostrato come stato corrente soltanto se revisione e identita di ogni fonte live disponibile coincidono esattamente con quelle catturate dal finalizzatore.

Dopo il gate e l'aggiornamento del solo supervisore:

- `/api/status` espone `INCONSISTENT`, non il vecchio `TECHNICAL_BLOCK writeAtomic`;
- `/api/case-truth` per Angelina espone `INCONSISTENT`, zero blocker e nessun verdetto attribuito;
- lo snapshot storico resta disponibile nell'endpoint storico;
- worker e watchdog non sono stati sostituiti e il worker Angelina non e stato riattivato;
- gli hash di execution checkpoint, worker checkpoint e ledger CDP sono rimasti identici.

Il gate locale completo ha superato **1.707/1.707 test in 209 file**, inclusi 71 test del driver CDP. È un test automatico locale; non e un test operativo ENEA.

## Raccomandazione

La scelta migliore e **verificare prima in sola lettura la bozza esistente 462287**. È l'unica azione che puo chiarire l'esito server dei tre tentativi senza aggiungere una quarta mutazione o una nuova bozza. La verifica deve limitarsi a GET/lettura dei dati persistiti e non deve compilare o salvare alcun campo.

Anche se la lettura chiarisse la prima pagina, non raccomando di riprendere questa generazione: la sua cronologia e gia non riconciliata. Se la bozza non risultasse completa e coerente, va conservata come superseded/quarantined e si potra avviare una **nuova generazione pulita**, ma soltanto dopo avere introdotto e collaudato:

- ledger append-only per `generationId + canonicalDraftId + pageId + intentId`;
- riconciliazione obbligatoria execution/worker/CDP prima di ogni mutazione;
- divieto di azzerare budget nella stessa generazione;
- prove referenziali, non solo stringhe;
- `commandId` derivato da un intento immutabile;
- matrice crash locale su ogni confine intento/click/risposta/commit.

Domanda operatore: **Autorizzi una verifica esclusivamente read-only della bozza ENEA 462287, senza compilare o salvare alcun campo, per determinare lo stato server reale prima di decidere una nuova generazione pulita?**

