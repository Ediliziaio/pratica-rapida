# APR — test operativo casuale di tre pratiche (cohort50)

Data: 18 agosto 2026

## Ambito

Il test ha selezionato tre pratiche tra i quattro nominativi indicati:

- Elisa Moro — pipeline `pronte_da_fare`
- Lia Chiericati — pipeline `archiviate`
- Giovanni Zucchini — pipeline `archiviate`

Carlotta Ceniti non e stata inclusa nel campione di tre.

Le pratiche sono state eseguite dal worker persistente APR. Il gate del test era la bozza ENEA completa e salvata. Anteprima, submit, ricevute, email e comunicazioni sono rimasti disabilitati.

## Esito operativo reale

| Pratica | Esito | ID bozza ENEA | Pagine verificate | Tentativi creazione |
| --- | --- | ---: | ---: | ---: |
| Elisa Moro | Bozza completa e salvata | 416583 | 10/10 | 1 |
| Lia Chiericati | Bozza completa e salvata | 416675 | 8/8 | 1 |
| Giovanni Zucchini | Bozza completa e salvata | 416646 | 8/8 | 1 |

Risultato terminale: 3 salvate, 0 bloccate, 0 differite, 0 in coda. Non sono state create bozze duplicate.

Il tempo misurato dal checkpoint `prepared` della coda al checkpoint finale `draft_saved` e stato di **28 minuti e 54,607 secondi** (15:16:13.967Z–15:45:08.574Z).

## Correzioni consolidate durante il test

1. La verifica delle superfici delle schermature accetta il normale arrotondamento del portale a due decimali, mantenendo rigidi gli altri attributi tecnici.
2. Il parser Rinaldi riconosce anche la notazione dimensionale `SP.CM.` con il punto dopo `CM`.
3. Nei layout Rinaldi il totale IVA non viene confuso con l'imponibile: viene privilegiato l'importo esplicitamente marcato con euro e viene usata la sezione `Scadenze Pagamenti` come prova economica distinta.
4. Se le righe schermatura risultano perse prima del salvataggio del riepilogo, APR puo eseguire un solo recupero dopo prova server read-only di riepilogo vuoto e verificare la riga recuperata senza un secondo salvataggio cieco.
5. Il recupero di un intento di creazione non materializzato usa anche l'ultima bozza realmente materializzata come generazione idempotente, evitando collisioni fra pratiche consecutive senza azzerare il contatore.

## Verifica tripla

1. **Processi di sistema:** `supervisor`, `worker` e `watchdog` cohort50 risultano `running`, con PID distinti.
2. **Checkpoint e journal persistenti:** revisione esecuzione 141, tre elementi `saved`, tre ID bozza distinti, un tentativo di creazione e un tentativo finale di salvataggio per pratica; ogni evento di transizione contiene gli ID regola applicati.
3. **Dashboard HTTP reale:** `http://127.0.0.1:4481/api/enea-draft-execution` restituisce `completed`, progresso 3/3 salvate e ultimo evento `draft_saved` per Lia Chiericati; il watchdog restituisce `IDLE — coda vuota` con heartbeat successivo al completamento.

Il journal del driver registra zero tentativi di anteprima, submit o comunicazione e zero azioni vietate.

## Test automatici

- 141 test mirati passati sui parser, prove finanziarie, acquisizione/elaborazione CRM locale, persistenza della coda, ripresa idempotente e worker APR.
- 1 test mirato aggiuntivo passato sulla tolleranza di arrotondamento delle superfici ENEA.
- TypeScript: controllo tipi completato senza errori.

La suite completa del driver CDP e stata interrotta per assenza di avanzamento nel processo di test; il test mirato della modifica e invece verde. Questo limite riguarda il collaudo automatico completo del driver, non l'esito operativo delle tre bozze, verificato separatamente tramite checkpoint, journal e dashboard.

## Limiti residui

- Questo e un test operativo reale fino alla **bozza ENEA salvata**, non un test di anteprima o invio e non una dichiarazione di disponibilita in produzione.
- Non sono state eseguite mutazioni delle pipeline CRM ne il confronto con le pratiche manuali chiuse nel CRM.
- Le correzioni hanno superato i test mirati e il campione operativo corrente; servono ulteriori coorti indipendenti per misurare l'affidabilita generale.
