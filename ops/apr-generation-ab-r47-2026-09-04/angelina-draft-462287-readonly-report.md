# Verifica read-only ENEA — bozza 462287

## Esito

La bozza 462287 esiste ed è ancora in lavorazione, ma **nessun dato della pagina Beneficiario è persistito**. L'API ufficiale restituisce come contenuto della pratica soltanto `ver: 0`; la sezione `beneficiario` è assente. Inoltre `data_inserimento` e `data_modifica` coincidono (`2026-09-04 10:26:43`) e l'elenco versioni è vuoto.

Tre GET fresche e indipendenti della stessa risorsa hanno restituito HTTP 200 e lo stesso fingerprint del payload. Il risultato chiarisce quindi l'esito dei tre eventi `save_page_once`: nessuno ha scritto la pagina Beneficiario sul server.

## Sicurezza della verifica

- La bozza non è stata aperta nell'interfaccia e il form React non è stato inizializzato.
- Nessuna navigazione, nuova scheda, compilazione, click, evento `input/change`, salvataggio o autosave.
- Il filtro di rete era attivo prima della sonda e consentiva soltanto `GET/HEAD` sulla sola origine ENEA.
- La sonda conclusiva ha osservato esattamente tre richieste, tutte `GET`, senza corpo; zero `POST/PUT/PATCH/DELETE` e zero richieste bloccate.
- I test locali positivi e negativi del guard sono passati prima della verifica reale.

## Integrità e quarantena

Gli hash di checkpoint esecuzione, checkpoint worker e ledger CDP coincidono con quelli precedenti alla verifica. Il worker Angelina non è caricato; keepalive, Chrome, supervisore e watchdog restano vivi. Non è stata creata alcuna bozza duplicata e non è avvenuta una quarta mutazione.

La generazione `generation-8f2843ab5ddf4fee25c1ec65` resta in quarantena e non deve essere ripresa. La dashboard continua correttamente a esporre `INCONSISTENT`, perché checkpoint e stato worker non concordano; la sonda server non altera tale stato pubblico.

Una nuova generazione pulita non è stata creata né autorizzata in questa verifica. Potrà essere valutata soltanto dopo il consolidamento del ledger mutativo.
