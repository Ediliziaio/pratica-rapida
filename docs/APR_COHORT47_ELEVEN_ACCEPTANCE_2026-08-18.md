# APR cohort47 — collaudo operativo di accettazione 11/11

Autorizzazione utente: 18/08/2026.

## Criterio vincolante

Il test e' positivo soltanto se tutte le stesse undici pratiche della cohort46 raggiungono, mediante il solo processo persistente APR, lo stato di bozza ENEA completa e salvata con prova canonica del portale. Un risultato 10/11 o qualsiasi `Richiesto intervento operatore` rende il test non superato.

Restano vietati anteprima, submit, ricevute, email e comunicazioni. Codex puo' soltanto configurare, installare, verificare e correggere APR; non puo' compilare le pratiche.

## Cronometraggio

- inizio: primo checkpoint in cui CRM ed ENEA sono verificati e la prima pratica e' realmente eseguibile;
- fine: checkpoint server dell'undicesima bozza completa e salvata;
- il report finale deve indicare durata totale, attese di autenticazione e durata di ciascuna pratica;
- le attese di login non devono essere confuse con il tempo macchina APR.

## Sicurezza e continuita'

- una pratica alla volta, checkpoint prima di ogni azione;
- nessuna nuova bozza se esiste un intento incerto non risolto;
- i precedenti ID sono storico e non possono essere scambiati per il risultato della nuova coorte;
- worker, supervisore e watchdog persistenti;
- dashboard dedicata e audit degli ID regola applicati.

## Esito verificato

- risultato operativo: **11/11 bozze ENEA complete e salvate**;
- casi in `Richiesto intervento operatore` al termine: **0**;
- anteprima, submit, ricevute e comunicazioni: **0**;
- primo intento eseguibile persistito: `2026-08-18T00:43:31.094Z`;
- undicesima bozza terminale verificata: `2026-08-18T09:54:34.285Z`;
- durata totale a orologio: **9 h 11 min 03 s**;
- l'intervallo comprende diagnosi, correzioni, riavvii e attese: non va presentato come tempo macchina netto di una coorte liscia.

Bozze: Gianluca Dalle Donne `414613`, Luca Callegari `414614`, Tommaso Cecchi `414615`, Claudio Beghini `414616`, Monica Ambra Fioravanti `414617`, Federigo Cileo `414618`, Cristina Ricchi `414620`, Massimiliano Gaetano Khemara `414621`, Matteo Maranesi `414622`, Zeno Righetti `414623`, Gianluigi Chiolini `414624`.

Il recupero finale di Gianluca ha dimostrato il contratto reale della pagina Calcolo: il Salva del modale 36% aggiorna soltanto lo stato React; APR deve conservare lo staged, eseguire il successivo Salva esterno e solo dopo verificare lato server sia l'allocazione sia la pagina Calcolo.

## Tre riscontri indipendenti

1. `launchctl`: supervisor, worker e watchdog attivi sotto `gui/501`.
2. checkpoint/journal: esecuzione revisione `2874`, 11 `saved`, 0 `operator_intervention`; watchdog `IDLE`.
3. dashboard APR: `APR ATTIVO — IDLE, coda vuota`, `11` pratiche e `11` completate con prova.

## Confronto read-only e limite residuo

Il comparatore APR ha verificato le 11 bozze contro dossier CRM acquisiti read-only, fonti originarie, fingerprint di mapping e prove server per pagina: **0 discrepanze verificabili**. Il checkpoint e' in `crm-manual-comparison/checkpoint.json`.

Questo checkpoint verifica la coerenza con le fonti originarie, ma non completa da solo il confronto campo-per-campo con la pratica ENEA compilata dall'operatore. Il dossier CRM ordinario non espone quell'output in forma strutturata. Il registro autorizza tuttavia il passaggio separato `apr-historical-benchmark-cli`: dopo la bozza TEST salvata, il PDF ENEA storico puo' essere letto in sola lettura come benchmark isolato, mai come fonte del mapper e senza richiedere CPID alla bozza APR. La precedente dicitura che lo dichiarava indisponibile era una regressione del comparatore ed e' stata corretta.
