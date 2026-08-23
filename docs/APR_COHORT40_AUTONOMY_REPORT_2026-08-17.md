# APR · rapporto autonomia e cohort 40

Data verifica: 17 agosto 2026  
Dashboard locale: <http://127.0.0.1:4472/>

## Esito

APR ha concluso la coda eseguibile fermandosi sempre alla bozza completa e salvata. Anteprima, submit, ricevute, email e comunicazioni non sono stati eseguiti.

| Pratica | Stato terminale | Bozza | Nota |
|---|---|---:|---|
| Gianluigi Chiolini | Bozza salvata | 412301 | 9/9 checkpoint verificati |
| Gabriella Bruno | Bozza salvata | 412302 | 8/8 checkpoint verificati |
| Roberto Muzzi | Bozza salvata | 412313 | 17/17 checkpoint verificati |
| Daniela D'Esposito | Bozza salvata | 412318 | Ripresa autonoma dopo correzione del pacchetto; 9/9 checkpoint verificati |
| Marco Fecondini | Richiesto intervento operatore | 412314 | La GET canonica ha provato che l'allocazione 36% non è persistita neppure dopo l'unico recupero consentito; vietati altri tentativi |
| Andrea Fiorentini | Richiesto intervento operatore | 412316 | Tre verifiche read-only non hanno determinato se la prima pagina fosse stata salvata; nessun retry alla cieca |
| Liliana Gloria | Richiesto intervento operatore | — | Il modulo cartaceo Linea Sole Potito è stato riconosciuto e i fallback autorizzati sono applicati; restano 11 campi ENEA originari mancanti/non verificati |
| Stefano Bianchi | Richiesto intervento operatore | — | Prodotti fisici e totale non riconciliabili dalle fonti estratte |
| Alessandra Brizzi | Richiesto intervento operatore | — | Prodotti, data fattura/fine lavori e totale non ricostruibili senza inventare dati |
| Patrizia Vaccani | Richiesto intervento operatore | — | Nessuna riga prodotto fisico riconciliata dalle fatture originarie |

## Correzioni rese permanenti

1. Il pacchetto operativo viene ricostruito con gli stessi valori risolti e auditati dal preflight, compreso il numero di unità immobiliari autorizzato. Questo elimina il falso blocco `crm_enea_draft_package_rebuild_blocked` visto su Daniela D'Esposito.
2. Un pacchetto corretto prima di qualunque chiamata ENEA viene rivalidato e riaccodato automaticamente sullo stesso contatore persistente; non viene creato un secondo job.
3. Il worker accoda autonomamente i casi diventati verdi dopo una nuova revisione delle regole, anche se il supervisore è temporaneamente indisponibile.
4. La dashboard classifica come `BLOCKED` anche un piano locale coerente che non dispone ancora di tutti i campi necessari alla bozza ENEA. Le regole Linea Sole Potito restano applicate, ma non mascherano dati originari mancanti.
5. Le regole già definite vengono applicate senza richiesta all'utente. Soltanto dati mancanti, conflitti non coperti o esiti server realmente indeterminabili vanno a `Richiesto intervento operatore`; la coda prosegue.

## Prove indipendenti

- Servizi di sistema: worker, supervisor e watchdog risultano `running` sotto `gui/501`.
- Checkpoint persistente: esecuzione revisione 367, stato `completed`; Daniela `saved`, bozza 412318, un tentativo di creazione e un tentativo finale di salvataggio.
- Dashboard/API: `/healthz` riporta supervisor `running`, esecuzione e worker `completed`, watchdog `OPERATOR_REQUIRED`; `/api/enea-draft-execution` espone gli stessi ID e stati.

Dopo il riavvio del worker i sei record dell'esecuzione sono rimasti univoci e nessun ID bozza, contatore o checkpoint è stato duplicato o perso. La revisione è passata da 367 a 368 esclusivamente per l'evento auditato di keepalive/sessione pronta, senza riaprire alcuna pratica.

## Test automatici

- 72 test verdi su preflight, coda/esecuzione ENEA e worker autonomo.
- 41 test verdi sulla suite di riavvio, lease, adattatore read-only, supervisore, dashboard e LaunchAgent.
- 12 test verdi sulla verità di stato della dashboard e sul server locale.
- TypeScript senza errori.

## Tempi osservati

- Daniela D'Esposito, percorso regolare dopo la correzione: 1 minuto 21 secondi dalla creazione della bozza al salvataggio verificato.
- Gianluigi Chiolini: 1 minuto 13 secondi.
- Gabriella Bruno: 1 minuto 3 secondi.
- Roberto Muzzi: 43 minuti 49 secondi, tempo non rappresentativo perché includeva diagnosi e correzioni durante il test.
- Intera finestra della cohort: 3 ore 9 minuti, comprensiva di pause, sviluppo e collaudi; non è una misura della velocità ordinaria APR.

## Limiti reali residui

- Il flusso 36% è verde nei test locali ma, sul caso Fecondini, il server ENEA non ha persistito il valore: il caso resta correttamente fail-closed.
- APR non inventa campi edilizi/impianto mancanti nei moduli Linea Sole Potito: serve una futura regola esplicita oppure dati originari.
- OCR/segmentazione non riconosce ancora in modo sufficiente le fatture di Bianchi, Brizzi e Vaccani.
- Un esito server inconcludente dopo un Salva, come Fiorentini, resta isolato per evitare duplicazioni.
- L'integrazione CRM mutativa, preview e submit restano fuori da questo collaudo.

## Gate per i prossimi test

Il runtime persistente, la coda autonoma, il passaggio al caso successivo, il riavvio e la dashboard sono verificati. È possibile avviare un nuovo lotto di pratiche schermature; APR applicherà autonomamente tutte le regole già registrate e produrrà alla fine un report unico dei soli blocchi nuovi o realmente irrisolti.
