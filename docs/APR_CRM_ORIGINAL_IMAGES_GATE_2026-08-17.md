# APR · gate allegati originari immagine CRM

Data collaudo: 17 agosto 2026  
Coorte persistente: `apr-pilot-40`  
Dashboard locale: `http://127.0.0.1:4472/`

## Esito

Gate locale completato. APR accetta ora, esclusivamente in lettura, allegati originari PDF, PNG e JPEG provenienti dai percorsi CRM consentiti. Il contenuto viene validato tramite firma binaria, salvato con fingerprint, analizzato localmente e collegato al preflight senza ripetere dossier o PDF già acquisiti.

Le due immagini presenti nella coorte sono state scaricate una sola volta dal server dopo l'aggiornamento del contratto, analizzate con OCR macOS locale e riconosciute come loghi PraticaRapida privi di segnali fiscali. Sono conservate come provenienza, ma escluse da fatture, importi e calcoli.

## Evidenze persistenti

- Dossier: `10/10` acquisiti.
- Allegati originari: `38/38` scaricati, `0` bloccati.
- Analisi locali: `38/38` concluse, `0` bloccate.
- Immagini non fiscali: `2`, entrambe escluse dai calcoli.
- Preflight: `10` terminali, `0` pronti e `10` in `Richiesto intervento operatore` per blocchi residui di parser/fonti, non per il formato immagine.
- Azioni esterne: `externalActionAllowed=false`, `crmMutationAllowed=false`, `eneaActionAllowed=false`.

Fingerprint delle immagini:

- `af2295ab063fc9afe0bd0f2ace759f26f5217145fde1e7e4dd7b999900b594ff`
- `cee27761dffdb8f5e3bd72d7469fc26224d7c7c37bd78af7b72efa4c5aa70eb4`

Fingerprint dei checkpoint dopo il riavvio:

- allegati: `9aeca95794cdcd00d4085f44b439a1c52804908c222bcda0a674f679f896d071`
- analisi: `884a9d08390b5b6aa28aab65f894c42d363104bbbd59fdc3817bad945be9e603`
- preflight: `822f2a1034dd9764516065246a7b95873547a1d8c679ac383830ca63beaa60af`

I fingerprint dei tre checkpoint sono rimasti invariati dopo due riavvii del supervisore: nessun allegato, OCR o preflight è stato duplicato o perso.

## Tripla verifica

1. Servizi di sistema: supervisor, worker e watchdog risultano `running`; il supervisor è ripartito con un nuovo PID e contatore `runs=42`.
2. Checkpoint e journal: 38 allegati, 38 analisi, 2 esclusioni non fiscali e 10 preflight terminali; revisioni e fingerprint sono rimasti stabili dopo il riavvio.
3. Dashboard/API: `/healthz`, `/api/crm-live-processing` e la pagina HTML concordano su `operator_required`, 38 allegati/analisi, 2 immagini non fiscali e azioni esterne vietate.

## Collaudi software

- Suite completa precedente alle sole rifiniture di visibilità: `115` file e `689` test verdi.
- Test mirati contratto immagini/dashboard: `29/29` verdi.
- Test finali integrazione live/dashboard: `13/13` verdi.
- Typecheck runner: verde.
- Build applicazione: verde.
- Controllo sintattico bundle permanente: verde.

Bundle installato:

- supervisor SHA-256: `15132d7772e9a266f657384d44f2eaa258081e4e6c092410d05f2e784ddaf0d4`
- OCR SHA-256: `2707d56b04d969cc3c136ed057ad1f2d340098e92c6de7fb4fb9af3079efcaf5`

## Limiti residui reali

- Il supporto immagine è verificato localmente e sul flusso CRM read-only della coorte; non abilita mutazioni CRM né operazioni ENEA.
- I dieci preflight restano bloccati da problemi reali di estrazione o riconciliazione: righe prodotto non riconosciute, totali/documenti fiscali incerti, date o codice fiscale assenti in alcuni casi.
- Anteprima, submit, ricevute, email e comunicazioni restano vietati.

Il gate successivo deve lavorare esclusivamente sui 38 documenti già persistiti, riducendo una classe di blocco del parser alla volta, con test e senza inventare valori.
