# Angelina — nuova generazione pulita r48 (diagnosi rettificata)

## Rettifica definitiva

Non è stato dimostrato un difetto nell'ordine del gate. Il sequencer è stato arrestato alle
15:39:21Z mentre attendeva correttamente il preflight Infissi; il checkpoint specializzato
ha raggiunto `ready_local_plan` alle 15:39:32Z, undici secondi dopo. La divergenza era quindi
uno snapshot transitorio reso permanente dall'arresto anticipato del solo sequencer.

La correzione software inizialmente proposta non viene applicata: sarebbe priva di una causa
operativa dimostrata e violerebbe la disciplina fail-closed. La stessa generazione pulita può
essere ripresa senza adottare la bozza 462287, perché non era ancora stato avviato alcun worker
e non era stata creata alcuna nuova bozza.

## Esito

L'osservazione iniziale non aveva ancora raggiunto ENEA. La nuova coorte 3067 e stata creata con stato completamente separato dalla generazione 462287, ma il worker non era ancora partito e non era stata creata alcuna nuova bozza.

Lo snapshot al momento dell'arresto era **INCONSISTENT**, ma non costituiva un verdetto terminale:

- il preflight comune conserva due blocker Schermature (`screenings_missing` e `invoice_332a5af9`);
- il preflight Infissi dimostra invece sette prodotti riconciliati uno a uno, totale di 10.500,87 euro e zero blocker;
- `/api/case-truth` pubblica `READY`, mentre `enea-draft-execution` resta `blocked_preflight` senza elementi.

## Causa esatta

Il preflight specializzato ha completato correttamente undici secondi dopo l'arresto del sequencer. Il guard gia presente attende quel completamento e, sul checkpoint terminale, sceglie il prodotto Infissi prima della riconciliazione. Non esiste una prova concreta di un difetto software da correggere.

## Sicurezza

Il sequencer e stato arrestato prima dell'avvio del worker. Nessuna nuova bozza, compilazione o chiamata mutativa ENEA e stata eseguita. La generazione 462287 resta abbandonata e non riprendibile; Chrome APR e keepalive restano intatti.

## Decisione richiesta

Nessuna decisione ulteriore richiesta: l'autorizzazione ricevuta viene applicata alla validazione e alla ripresa della stessa generazione pulita, senza introdurre una modifica non giustificata.

Flavia non e stata avviata: il passaggio era subordinato al completamento concordante di Angelina.
