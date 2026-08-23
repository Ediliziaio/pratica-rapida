# APR — esecuzione reale autonoma cohort 36

Data: 2026-08-16  
Dashboard: `http://127.0.0.1:4469/`  
Runtime: `cohorts/apr-pilot-36`

## Esito

Il processo persistente APR ha acquisito, validato e lavorato la coda senza controller browser Codex. Tre pratiche verdi sono state create, compilate e fermate alla bozza completa e salvata:

| Pratica | ID bozza ENEA | Pagine | Creazioni | Salvataggi finali |
|---|---:|---:|---:|---:|
| Amelia Lerose | 411950 | 10/10 | 1 | 1 |
| Cataldo Cassone | 411954 | 8/8 | 1 | 1 |
| Lea Dettori | 411957 | 8/8 | 1 | 1 |

Ogni pagina ha `saveAttemptCount=1`. Gli ID bozza sono distinti. Anteprima, submit, ricevute e comunicazioni risultano sempre a zero.

## Ripresa e correzioni emerse

- Corretto l'auto-arm del worker: il gate coda viene rivalutato a ogni tick economico mentre la sessione è ancora valida, senza attendere il successivo keepalive.
- Corretto il gate finale: APR riconosce la catena durevole composta da un solo `save_page_once`, relativa verifica server per ciascuna pagina e redirect finale esatto a `/riepilogo/{draftId}`. Il recupero usa il journal già acquisito e non ripete alcun Salva.
- Il worker è stato riavviato due volte durante il collaudo e ha ripreso dagli stessi checkpoint. Gli audit riportano esclusivamente `executorKind=apr_browser_worker` con PID 66303 e 66872.
- Il watchdog deduplica ora i blocchi della stessa pratica osservati in fasi diverse.

## Verifiche

- Typecheck runner: verde.
- Test worker, esecuzione durevole e servizio: 55/55 verdi.
- Test watchdog/runtime: 4/4 verdi.
- LaunchAgent supervisor, worker e watchdog: tutti `running`.
- API dashboard: esecuzione `completed`, tre bozze `saved`.
- Hash worker installato: `f0a561c1baddadc54d49bc1b18b56053e95768a65b37735fbcac0239097bb96e`.
- Hash watchdog installato: `38b391f96e941dff993d4741f48af0fbe65786d6a36a2b20d4559f95238c5ea9`.

## Limiti residui reali

- Giovanna Lonardi resta in `Richiesto intervento operatore`: seconda abitazione e flusso portale 36% non ancora osservato insieme all'utente. APR non applica il 50% per default.
- Ivan Nalin resta in `Richiesto intervento operatore`: cardinalità form/fattura incoerente, schermature mancanti e riconciliazione economica non conclusiva.
- Il test si ferma alla bozza salvata. Anteprima e submit restano disabilitati per policy.
- Il watchdog espone correttamente `OPERATOR_REQUIRED` perché restano due casi bloccati; la coda lavorabile è conclusa.
