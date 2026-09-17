# APR sul CRM ombra — dossier per Codex (16/09/2026)

## Cosa esiste da oggi (fatto da Claude con Giuliano, verificato su database vero)

- Progetto Supabase **ombra**: `https://boxvncaqpszeqpofazzr.supabase.co` (org Pratica Rapida Portale, Pro, eu-west-1).
  Schema = migrazioni del CRM (94 applicate; saltate di proposito `20260215192858` dati demo e
  `20260731120000` ponte cruscotto; enum `rivenditore`, funzione `get_practice_by_form_token` e vista
  `enea_practices_public` sistemate a mano). Vincolo `tipo_servizio` allineato alla produzione
  (`documenti_forniti`). Colonna `companies.prezzo_cf_imponibile_cents` esiste solo in produzione.
- Tabella solo-ombra `comunicazioni_bloccate`; funzioni installate con secret `CRM_OMBRA=true`;
  serrature provate: 5 chiamate, 5 righe, zero invii.
- **Colonna nuova solo-ombra**: enum `stage_type` + valore `intervento_operatore`; stage di sistema
  «Richiesto intervento operatore» (order_index 4, enea e conto_termico, non visibile ai rivenditori).
- App ombra: `npx vite --mode ombra` (config `.env.ombra`, ignorata da git), su 127.0.0.1:8081.
  Utente super_admin `modulistica@praticarapida.it`.
- **Travaso** `ops/crm-ombra-travaso-2026-09-16/travaso.ts`: legge il CRM vero con
  `PersistentAprCrmAuth` (GET soltanto), scrive nell'ombra con la chiave in
  `~/Library/Application Support/PraticaRapida/crm-ombra/service-role.key` (MAI in chat, MAI nel codice).
  Copia le pratiche in `pronte_da_fare` all'ingresso (stessi id, rivenditore, documenti in
  `enea-documents`), poi **aggiunge** i documenti nuovi comparsi nel vero (mai rimuove, mai tocca
  colonna/note). Gira come LaunchAgent `it.praticarapida.crm-ombra.travaso` ogni 600 s, battito in
  `crm-ombra/travaso/battito.json`, registro in `registro.json`, log `travaso.ndjson`.
  Oggi nell'ombra: 11 pratiche (le Pronte da fare del vero).

## Cosa serve adesso: l'adapter APR → ombra

APR deve lavorare **dall'ombra**, non dal vero. Oggi `crmAuth.ts` è cucito su
`APR_CRM_SUPABASE_ORIGIN` (verificato a ogni chiamata) e ammette solo GET: giusto per la produzione,
e resta così. Per l'ombra serve un secondo trasporto, separato e esplicito:

1. **Origine ombra** configurata, mai la stessa costante: `boxvncaqpszeqpofazzr`. Il gate che oggi
   rifiuta un'origine diversa deve restare per il trasporto di produzione.
2. **Sessione**: utente staff «APR» creato nell'ombra (Giuliano lo crea in Authentication; ruolo
   `operatore`), password nel Portachiavi con un servizio diverso da quello di produzione. Nel registro
   attività dell'ombra le azioni compaiono come «APR».
3. **Scrittura ammessa, solo nell'ombra**, e solo queste operazioni:
   - spostare la pratica di colonna (`current_stage_id`) fra: `pronte_da_fare` →
     `intervento_operatore` (domanda) / parcheggio bozza salvata (colonna da confermare con Giuliano:
     proposta `da_inviare`) / `archiviate` (solo dopo «non lavorabile» dichiarato dall'operatore);
   - scrivere la domanda nella scheda (`note_documenti_mancanti` + `documenti_mancanti`, gli stessi
     campi che il Kanban mostra per «Documenti mancanti»; da verificare che la card li renda anche
     nella colonna nuova, altrimenti piccola modifica UI);
   - leggere la risposta dell'operatore dallo stesso posto e importarla nel ledger
     (`operator-response-import`), poi rimettere la pratica in `pronte_da_fare`.
   - **Mai**: cancellare, toccare documenti, scrivere nel CRM vero.
4. **Lettura**: stessa forma di oggi (`enea_practices_public` + storage `enea-documents`), stessa
   acquisizione/coorte, così i moduli a valle non cambiano.

## Regole decise da Giuliano il 16/09 (valgono per l'adapter)

- **Nessuna pratica esce dall'ombra senza una decisione umana o una bozza salvata.**
- Quando APR si ferma, per qualunque motivo (dato mancante, fornitore manoscritto, prodotto senza
  modulo, fascicolo vuoto), la pratica va in **«Richiesto intervento operatore»** con la domanda
  scritta in italiano leggibile. Anche per Potito/Ideal/RM: «documenti manoscritti, APR non la compila:
  confermi che va fatta a mano?».
- Tre tipi di risposta: il dato mancante (riparte); **«non lavorabile»** (APR sposta in Archiviate con
  la ragione; conta nel denominatore come «fatta a mano»); una correzione.
- **Il «non lavorabile» lo dichiara l'operatore, APR lo propone.** Le esclusioni permanenti oggi nel
  codice diventano proposte pre-compilate («come le altre 6 di Potito: non lavorabile?»), e col tempo
  un campo del rivenditore.
- Ogni risposta deve far imparare: la stessa domanda sullo stesso fornitore/tipo non deve tornare.
- Bozza salvata = chiusa per l'ombra: parcheggio in colonna; il confronto con l'operatore lo fa
  `aprHistoricalBenchmark` su richiesta (settimanale), leggendo il PDF in `pratica_enea_conclusa_urls`
  del CRM **vero**.
- Percentuali sempre sul **lavorabile**.

## Cosa NON fare

- Non toccare il trasporto di produzione né le sue serrature.
- Non lanciare giri sull'ombra prima che l'adapter sia coperto da test con un finto ombra e da una
  prova reale su UNA pratica (proposta: Federico Marino, Brianza Serramenti) con Giuliano che guarda
  il Kanban.
- Non creare automazioni/monitoraggi propri: il travaso e le sentinelle sono di Claude.

## Aperto, non oggi

- Sessione ENEA scaduta senza avviso (dossier separato, `ops/apr-sessione-enea-scaduta-2026-09-15/`).
- Aggiornamento in tempo reale del Kanban ombra quando il travaso scrive (oggi serve ⌘R).
- Seconda direzione completa del travaso (spostamenti/chiusure del vero) — Giuliano ha deciso: non
  serve, le due lavorazioni restano separate; solo i documenti nuovi vengono aggiunti.

## Convivenza sul portale ENEA (aggiunto 16/09 sera, dopo chiarimento del titolare)

L'operatore del CRM vero lavora sullo **stesso portale ENEA e con lo stesso SPID** che usa APR.
Quindi nell'ombra APR e operatore lavorano le stesse pratiche, nello stesso elenco di bozze.
Condizioni per il via sulla prima pratica:

1. **APR tocca solo le bozze che ha creato lui.** `discover_or_create_draft` non deve mai adottare
   una bozza trovata nel portale che non sia registrata nel suo stato (draftId proprio). Se per quel
   cliente esiste una bozza non sua → `intervento_operatore` con domanda «esiste già una bozza sul
   portale non creata da APR: la lavora l'operatore?». Verificare il comportamento attuale con test.
2. **Le bozze di APR sono riconoscibili** nel portale (marcatore stabile in un campo descrittivo
   consentito), così l'operatore le distingue e non le invia per sbaglio.
3. **Sessione condivisa**: se ENEA chiude la sessione precedente quando lo stesso SPID accede da un
   altro browser, ogni accesso dell'operatore stacca APR. Prova da fare a freddo (Claude + Giuliano).
   In ogni caso APR deve riconoscere la pagina di login e mettersi in pausa con stato «sessione ENEA
   scaduta», non morire (dossier `apr-sessione-enea-scaduta-2026-09-15`).
4. **Avvio manuale, a operatore fermo** (decisione del titolare, 16/09 sera): i giri dell'ombra
   partono solo su via di Giuliano, quando sa che l'operatore non e' sul portale. Nessuna finestra
   oraria automatica per ora; la prova sulla sessione condivisa (punto 3) puo' aspettare.

## Decisioni del 16/09 sera, dopo la prima verifica di Codex (chiudono i punti aperti)

1. **Nessun marcatore dentro la bozza ENEA.** Non esiste un campo libero e non si sporca un dato
   vero. La riconoscibilita' sta nell'ombra: nella scheda della pratica APR scrive «Bozza ENEA n. <id>,
   creata da APR il <data>, <link>» (campo `note_interne`, in coda, senza cancellare quanto c'e').
   Il draftId resta anche nello stato di APR come oggi.
2. **Nessuna domanda «esiste una bozza altrui per questo cliente».** APR non apre bozze che non ha
   creato e non tenta di attribuirle. Regola: APR crea sempre la propria bozza e tocca solo quella
   (comportamento attuale di `discoverExistingDraft`, da coprire con un test che lo dimostri).
3. **Colonna di parcheggio della bozza salvata: `da_inviare` («Da inviare»).** Confermata dal titolare.
4. **Card del Kanban in `intervento_operatore`**: la mostra della domanda la fa Claude nell'app ombra
   (KanbanBoard, stessa resa di `documenti_mancanti`). Non e' compito dell'adapter.

Flusso finale dell'adapter, per pratica in `pronte_da_fare` nell'ombra:
- APR lavora → bozza salvata → sposta in `da_inviare` + nota «Bozza ENEA n. …».
- APR si ferma → sposta in `intervento_operatore` + domanda in `note_documenti_mancanti`
  (e `documenti_mancanti` se e' un documento).
- Operatore risponde nella scheda → al giro dopo APR legge la risposta, la importa nel ledger,
  rimette in `pronte_da_fare` (o in `archiviate` se la risposta e' «non lavorabile», con la ragione
  in `note_interne`).
- Avvio manuale su via del titolare, a operatore fermo.
