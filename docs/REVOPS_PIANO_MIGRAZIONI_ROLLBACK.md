# Revenue Operations — Piano preventivo di migrazione e rollback

**Stato:** piano di prova, nessuna migrazione applicata  
**Versione:** 0.1  
**Data:** 31 agosto 2026  
**Vincolo prevalente:** continuità assoluta del CRM, `REVOPS_DECISIONI_TITOLARE.md` v1.4

## 1. Regola di ammissione

Una migrazione è candidabile alla produzione soltanto dopo una prova completa su staging isolato e rappresentativo:

`baseline -> up -> regressione -> down -> baseline ripristinata -> up -> down`

La prova è superata soltanto quando:

- il diff normalizzato dello schema precedente è zero;
- policy, grant, funzioni, viste e trigger preesistenti hanno la stessa impronta;
- conteggi e impronte dei dati preesistenti coincidono, senza riportare valori reali nel verbale;
- form pubblico, board, accessi, pratiche e comunicazioni superano gli stessi test della baseline;
- i dati creati nelle strutture RevOps sono esportabili e ripristinabili su ambiente isolato;
- il Controllore firma l'esito e il Titolare approva espressamente la produzione.

Un rollback soltanto descritto o una down migration mai eseguita equivalgono a **rollback non disponibile**.

## 2. Preparazione della baseline

Prima di ogni prova:

1. creare uno staging senza collegamenti a invii, pagamenti, Meta/ad-network o cruscotto in scrittura;
2. caricare fixture sintetiche per anonimo, rivenditore, operatore e super amministratore;
3. salvare schema-only normalizzato, policy, grant, funzioni e trigger;
4. calcolare conteggi e impronte dei soli dati preesistenti;
5. eseguire e salvare i test baseline di form, board, pratiche e comunicazioni;
6. verificare che la configurazione RevOps sia disattivata.

Gli artefatti non contengono password, token o valori aziendali.

## 3. Matrice delle otto migrazioni

### M1 — Estensioni nullable di `leads`

**Up:** enum `lead_lifecycle` e sole colonne nullable; nessun trigger, FK o irrigidimento RLS.

**Down:** esportare e provare il ripristino degli eventuali valori RevOps; rimuovere indici/colonne aggiunti e infine l'enum se privo di dipendenze.

**Prova preventiva:** form anonimo e board identici con RevOps spento; impronta delle colonne preesistenti invariata; schema dopo down uguale alla baseline.

### M2 — Campagne, costi, budget e snapshot

**Up:** nuove tabelle vuote e RLS `super_admin`; nessuna modifica a tabelle operative.

**Down:** export cifrato e restore drill delle nuove righe, quindi rimozione in ordine inverso di policy, indici e tabelle.

**Prova preventiva:** accesso negato a anonimo/rivenditore/operatore/AI; nessuna variazione agli oggetti preesistenti; export e restore verificati.

### M3 — Attività, bozze, audit e comunicazioni lead

**Up:** nuove tabelle `revops_activities`, `revops_lead_communication_log`, `revops_draft`, `revops_ai_vs_human`, `revops_decision_log`; `communication_log` resta invariata.

**Down:** export cifrato e restore drill, poi rimozione dei soli oggetti RevOps.

**Prova preventiva:** log pratica e relativa vista pubblica hanno impronta identica prima/dopo; registro decisioni append-only; nessuna comunicazione esterna.

### M4 — Eventi pratica e stato del proiettore

**Up:** nuove tabelle append-only `revops_practice_events`, `revops_lifecycle_events` e watermark del proiettore; nessun trigger su `pratiche` o `enea_practices`.

**Down:** fermare il proiettore, esportare/ripristinare gli eventi su ambiente isolato, rimuovere i soli oggetti RevOps.

**Prova preventiva:** creare e aggiornare pratiche con proiettore spento, attivo e in errore; risultato operativo identico; ripartenza dal watermark senza duplicati; impronte di tabelle e trigger sorgente invariate.

### M5 — Contratto cassa read-only

**Up:** vista/RPC di lettura protetta, snapshot e controllo versione; nessun grant di scrittura e nessuna modifica alle tabelle `cruscotto_*`.

**Down:** revocare eventuale identità tecnica, fermare la lettura, esportare/ripristinare gli snapshot, rimuovere RPC/vista e oggetti RevOps.

**Prova preventiva:** impronte di schema, grant e dati sorgente `cruscotto_*` identiche; query di scrittura negate; formula verificata soltanto con valori sintetici; revoca credenziale e impossibilità di nuovo accesso dimostrate.

### M6 — Vista canonica e regole deterministiche

**Up:** funzione `revops_pratiche_valide` e viste canonica, attivazione e sollecito, tutte read-only.

**Down:** rimuovere viste e funzione in ordine di dipendenza.

**Prova preventiva:** nessun oggetto operativo modificato; casi sintetici D1-D3 verdi; schema baseline ripristinato; nessun piano di query o lock sul percorso di creazione pratica.

### M7 — Attribuzione ed eccezioni

**Up:** viste `revops_lead_chain` e `revops_exceptions`, read-only.

**Down:** rimuovere esclusivamente le nuove viste.

**Prova preventiva:** riconciliazione a zero sulle fixture; rimozione completa; nessuna variazione ai risultati delle dashboard esistenti.

### M8 — Consenso pubblico coordinato

**Up:** dopo M1 e frontend compatibile verificato, sostituire soltanto la policy anonima con il `WITH CHECK` dei tre campi consenso.

**Down:** ripristinare testualmente la policy precedente; il frontend compatibile può continuare a inviare i campi extra senza rompere il vecchio comportamento.

**Prova preventiva:** sequenza colonne -> frontend -> smoke test -> policy; test anonimo positivo e negativo; down della policy e nuovo test positivo; confronto testuale policy e permessi con baseline. Se il test fallisce, M8 non viene applicata.

## 4. Rilascio applicativo `/revops`

La pagina e il proiettore sono rilasci separati dalle migrazioni e partono disattivati. Il rollback applicativo consiste nel disattivare la configurazione e ripristinare l'artefatto precedente. Prima dell'attivazione si dimostra che:

- il bundle precedente è nuovamente distribuibile;
- nessuna route o voce di menu esistente cambia;
- proiettore fermo e pagina spenta non modificano dati né prestazioni operative;
- i nuovi dati restano preservati nelle tabelle RevOps.

## 5. Evidenze da consegnare al Titolare

Per ogni migrazione:

- identificativo e checksum di up/down;
- esito dei due cicli completi up/down;
- diff schema normalizzato;
- esito impronte dati preesistenti;
- export/restore drill dei dati RevOps;
- risultati dei test baseline e RevOps;
- tempo e risultato del rollback;
- eccezioni e giudizio del Controllore.

Senza questo pacchetto non viene richiesto il checkpoint di produzione.
