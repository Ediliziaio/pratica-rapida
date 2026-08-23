# APR — test “lunedì mattina” da dieci pratiche

Autorizzazione utente: 2026-08-16.

Registro corrente: `enea-operational-registry-v26`  
Matrice corrente: `apr-enea-rule-test-matrix-v9`  
Regola: `user-2026-08-16-ten-case-monday-restart`

## Contratto

- La coorte ordinaria contiene esattamente dieci identità CRM univoche.
- Le identità provengono dalla pipeline `Archiviate`, letta esclusivamente in read-only, oppure da una coda locale con fonte equivalente verificata.
- Beatrice Ciotta e clienti già presenti nella storia bozze APR sono esclusi, salvo repeat-test esplicitamente auditato.
- APR acquisisce e valida una pratica alla volta.
- Un caso ambiguo viene conservato come `Richiesto intervento operatore`; la coda prosegue.
- Coda, ordine, lock, tentativi e audit sopravvivono a stop e riavvio.
- Soltanto il processo persistente APR può creare, compilare e salvare bozze.
- Anteprima, submit, ricevute, email e comunicazioni restano vietati.

## Prove automatiche richieste

1. Seed di dieci casi idempotente; nove, undici, duplicati, Beatrice e clienti con bozze pregresse vengono rifiutati.
2. Preflight di dieci dossier ricreato da checkpoint a ogni tick: dieci conclusi, nessuna perdita e un solo tentativo per caso.
3. Esecuzione ENEA con dieci casi: il primo viene isolato, il secondo viene reclamato dopo riavvio, nessun duplicato o salto d’ordine.
4. Dashboard, worker, supervisore e watchdog espongono lo stesso conteggio e la stessa fase.

La prova automatica è locale. Non dimostra selezione reale dalla pipeline CRM né compilazione reale ENEA; questi due gate vengono verificati soltanto nel test operativo successivo.
