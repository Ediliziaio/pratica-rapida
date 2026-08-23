# APR — verifica autonoma a due pratiche del 16 agosto 2026

## Esito reale

APR ha ripreso in sequenza, senza intervento umano e senza controller Codex sul browser:

- Luigi Carfora, bozza ENEA `411578`;
- Tommasina Desando, bozza ENEA `411579`.

Per entrambi APR ha:

1. riallineato in sola lettura il ledger cliente↔bozza;
2. provato via GET canonica che il primo salvataggio della pagina impianto non era persistito;
3. ricompilato la pagina prima del recupero;
4. emesso un solo salvataggio di recupero;
5. ripetuto soltanto la verifica GET dopo il timeout;
6. isolato il caso e proseguito automaticamente al successivo.

La GET finale ha dimostrato che anche il recupero non era persistito. Le due bozze restano quindi in `operator_intervention`; APR non effettuerà un terzo salvataggio.

## Causa verificata

I due checkpoint erano legacy e conservavano l'ordine:

`Anagrafica → Immobile → Intervento → Impianto → Generatore`

La pagina impianto era stata quindi tentata prima di aver inserito il generatore annidato. Il contratto corrente di APR impone invece:

`Anagrafica → Immobile → Intervento → Generatore → Impianto`

La normalizzazione è applicata sia alla creazione delle nuove code sia al caricamento dei checkpoint persistenti. Il test di regressione verifica che l'ordine venga corretto dopo riavvio senza cambiare ID bozza o contatori.

## Sicurezza e idempotenza

- bozze create nel ledger: `2` (immutato);
- eventi `save_page_once`: `10` totali nel ledger storico, inclusi i due unici recuperi di questa esecuzione;
- eventi preview: `0`;
- eventi submit: `0`;
- comunicazioni: `0`;
- nessuna nuova bozza creata durante il recupero;
- un terzo salvataggio è rifiutato dal checkpoint.

## Evidenze automatiche

- 40 test del checkpoint/esecuzione/gate worker verdi;
- 3 test mirati del worker multi-pratica verdi, compresi riavvio, passaggio al caso successivo e divieto del terzo salvataggio;
- typecheck del runner verde;
- tre prove su copie dei checkpoint reali verdi: migrazione mapping, recupero pre-click e verifica post-recupero;
- bundle installato verificato con hash SHA-256 `4c8c195bb8d0274a31ccaddd1dcd45c7e55a7a72718e1bdf35d04c32fd5bb42f`.

## Stato operativo

Dashboard della coorte: `http://127.0.0.1:4337/`

LaunchAgent supervisore e worker risultano attivi. Il prossimo test utile deve usare due pratiche fresche, preparate con l'ordine corretto fin dall'inizio; non è sicuro riutilizzare Luigi o Tommasina per ulteriori salvataggi.
