# Invariante operativa della coda ENEA

Questa regola sostituisce il precedente flusso Cabina → chat Codex → runner.

## Regola non derogabile

Una pratica può essere lavorata solo se appartiene a un **piano locale persistente armato**. Il piano e i suoi checkpoint vivono sul computer che esegue il software. Chat, dashboard e turni Codex sono esclusivamente osservatori: una loro chiusura, timeout o duplicazione non può né avviare né fermare una pratica.

## Metodo di lavoro

1. Il software salva la lista in modo atomico, deduplica gli input e marca i duplicati senza creare seconde bozze.
2. Solo l'esecutore locale con heartbeat può reclamare una pratica.
3. Prima di ogni passo mutativo, il software salva il checkpoint e verifica il gate di readiness.
4. Se un caso è bloccato, salva motivo e fonti, lo marca `blocked` e passa alla pratica successiva. Un blocco pratico non equivale a blocco globale.
5. Se manca la sessione/browser/readiness, il piano diventa `blocked_global`: non seleziona né muta pratiche finché il gate non è nuovamente verificato.
6. I test si fermano alla bozza ENEA completa e salvata; anteprima, submit e comunicazioni restano fuori dall'esecutore.
7. Lo stato visualizzato è valido solo se mostra sia l'ID del piano sia l'heartbeat dell'esecutore. “In corso” senza questi due dati è vietato.
8. Blocchi e completamenti generano una notifica locale deduplicata e una registrazione durevole. La chiusura di Codex non impedisce né l'esecuzione né l'avviso.

## Prove obbligatorie prima di una coda lunga

- test di riavvio dell'esecutore con piano armato;
- test di perdita della chat/dashboard senza perdita della coda;
- test blocco di una pratica e passaggio alla successiva;
- test input duplicato senza seconda bozza;
- test stop globale per sessione ENEA non verificata.

La coda dei 15 casi non si considera avviabile finché tutte le prove sono verdi e l'adattatore browser reale è collegato al solo esecutore locale.
