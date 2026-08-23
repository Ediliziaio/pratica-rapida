# APR — gate piano esecutivo locale cohort-specific

Data verifica: 17 agosto 2026  
Coorte: `apr-pilot-40`  
Dashboard: `http://127.0.0.1:4472/`

## Esito

Gate locale completato. I due intake rilasciati sono stati trasformati in piani persistenti create/fill/save ed eseguiti esclusivamente dal simulatore locale APR:

- Luciano Javier Martinez: 9 checkpoint pagina, tutti fill/save esattamente una volta;
- Elisa Moro: 10 checkpoint pagina, tutti fill/save esattamente una volta;
- totale: 2 piani, 19 pagine, 19 salvataggi simulati checkpointati;
- una sola pratica attiva per volta;
- nessuna perdita e nessun duplicato dopo il riavvio del supervisore.

`simulated_saved_local` non significa che esista una bozza ENEA reale. Dimostra soltanto che APR sa trasformare il pacchetto in una sequenza persistente, ordinata e riprendibile.

## Mapping verificato

Ogni artefatto viene nuovamente validato prima della creazione del piano:

1. hash SHA-256 e identità pratica/pacchetto;
2. modalità `draft_test` e vincoli di sicurezza;
3. cardinalità delle schermature;
4. copertura dei campi del payload nel mapping preparato;
5. corrispondenza tra numero dei campi preparati e campi delle pagine;
6. presenza univoca delle sette sezioni obbligatorie.

Ordine checkpoint persistito:

1. Anagrafica Beneficiario;
2. Immobile;
3. Intervento;
4. Generatore dell'impianto termico;
5. Impianto termico esistente;
6. una pagina per ciascuna schermatura fisica;
7. riepilogo Schermature solari;
8. Calcolo costi e detrazioni.

## Persistenza e separazione

Nuovo checkpoint:

`crm-live-processing/runtime/crm-local-cohort-execution-plan/checkpoint.json`

Il componente dichiara e verifica:

- `historicalExecutionCheckpointImported=false`;
- `historicalExecutionPathRead=false`;
- `simulatorOnly=true`;
- `externalActionAllowed=false`;
- `browserAllowed=false`;
- `crmMutationAllowed=false`;
- `eneaActionAllowed=false`;
- `previewAllowed=false`;
- `submitAllowed=false`;
- `receiptAllowed=false`;
- `communicationsAllowed=false`.

Il vecchio `enea-draft-execution` non viene importato né usato per costruire la nuova coda cohort-specific.

## Collaudo

- Test automatici mirati: 22/22 verdi.
- TypeScript: verde.
- ESLint sui file modificati: verde.
- Crash simulato dopo il fill della prima pagina: lease recuperata e ripresa dal checkpoint, senza ripetere create/fill/save.
- Riavvio reale del LaunchAgent durante Luciano: PID supervisore da `52425` a `52451`; Luciano completato, poi Elisa avviata automaticamente.
- Contatori finali di entrambi i casi: create intent `1`, create simulato `1`, save finale intent `1`, save finale simulato `1`; ogni pagina fill `1`, save `1`.
- Checkpoint finale byte-idempotente dopo heartbeat successivi: SHA-256 `9e7be432e02759cf48d7c6736230024150538d333872eaf002f280984ae11cb0` invariato.
- Dashboard reale: `COMPLETED_LOCAL_SIMULATION`, `2/2` piani e `19/19` pagine.

## Limiti residui reali

- Nessuna bozza è stata creata o salvata sul portale ENEA.
- Il browser e il portale non sono stati aperti o interrogati.
- Il prossimo gate dovrà collegare questo piano all'adattatore ENEA verificato, mantenendo gli stessi checkpoint prima/dopo ogni azione.
- Anteprima, submit, ricevute, email e comunicazioni restano fuori ambito e tecnicamente disabilitati.
