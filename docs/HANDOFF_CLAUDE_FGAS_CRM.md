# Handoff a Claude — pacchetto ENEA + F-Gas e coordinamento con APR

## Prompt da consegnare integralmente a Claude

Sei il responsabile tecnico di APR, il programma che compila automaticamente le pratiche ENEA e aggiorna continuamente il CRM di PraticaRapida. Prima di modificare, fondere o pubblicare qualsiasi cosa, devi esaminare questo handoff e decidere esplicitamente chi deve essere il proprietario dell'integrazione: tu/APR oppure il lavoro locale già predisposto da Codex.

Non pubblicare automaticamente. Non eseguire migrazioni, deploy, push, merge o modifiche al CRM reale finché non hai:

1. confrontato il tuo stato di lavoro con la patch allegata `docs/fgas-crm-local-proposal.patch`;
2. identificato tutte le sovrapposizioni con i file e i dati che APR aggiorna;
3. verificato che non esistano scritture concorrenti distruttive su `enea_practices`, soprattutto sul JSON `dati_form`;
4. indicato al Titolare se raccomandi di integrare la patch locale oppure se preferisci reimplementare tu la funzionalità nella tua architettura;
5. presentato un piano di pubblicazione, collaudo e rollback;
6. ricevuto un'autorizzazione esplicita alla pubblicazione.

Questa è una decisione delicata e potenzialmente non facilmente reversibile. Il repository ha molte modifiche locali non correlate: non usare `git add .`, non sovrascrivere file in blocco e non scartare modifiche altrui. Lavora per hunk e conserva una copia dello stato precedente.

## Obiettivo aziendale e operativo

PraticaRapida vuole offrire agli installatori un pacchetto unico per pompe di calore:

- pratica ENEA;
- pratica F-Gas;
- prezzo del pacchetto: **90,00 euro netti + IVA 22%**;
- esperienza dell'installatore estremamente semplice;
- una sola commessa/un solo rettangolino nel CRM;
- due lavorazioni interne indipendenti, perché F-Gas può essere completata prima che il cliente finale compili i dati ENEA;
- chiusura e invio al cliente soltanto quando entrambe le lavorazioni sono concluse.

Il vantaggio commerciale di PraticaRapida è fare quasi tutto al posto dell'installatore. Il modulo non deve diventare una copia del portale F-Gas. L'installatore deve fornire il minimo indispensabile; i dati tecnici dettagliati devono essere ricavati dalla targhetta e, in futuro, eventualmente tramite OCR.

## Esperienza desiderata nel modulo del rivenditore

La proposta locale interviene nel form `NuovaPraticaEnea` quando il prodotto è una pompa di calore e il richiedente non è un privato.

Prima dell'invio compare la domanda:

> Vuoi anche la gestione della pratica F-Gas?

Se la risposta è **No**:

- il portale conferma che verrà lavorata soltanto la pratica ENEA;
- non vengono richiesti dati F-Gas.

Se la risposta è **Sì**:

- viene proposto il pacchetto ENEA + F-Gas a 90,00 euro + IVA 22%;
- sono richieste una o più foto leggibili della targhetta;
- si chiede se l'indirizzo di installazione coincide con quello della fattura;
- soltanto se non coincide viene chiesto l'indirizzo diverso;
- si chiede se è stato aggiunto o recuperato gas, con tre risposte semplici: `No`, `Sì`, `Non lo so`;
- il rapporto di intervento è facoltativo ed è richiesto solo come aiuto quando c'è stato movimento di gas o l'installatore non lo sa;
- la data di fine lavori già presente nel modulo ENEA viene riutilizzata come data proposta dell'intervento, ma l'operatore deve verificarla.

## Modello dati proposto

La bozza non introduce ancora una migrazione. Memorizza i dati in `enea_practices.dati_form.fgas`:

```json
{
  "requested": true,
  "package": "enea_fgas_full",
  "price_net_eur": 90,
  "status": "ricevuta_da_verificare",
  "address_same_as_invoice": true,
  "installation_address": null,
  "gas_movement": "no",
  "intervention_date_source": "YYYY-MM-DD",
  "completion_document_urls": [],
  "completed_at": null
}
```

Stati F-Gas previsti:

- `ricevuta_da_verificare`;
- `in_lavorazione`;
- `conclusa`.

I file iniziali vengono salvati nel bucket `enea-documents`:

- `{practice_id}/fgas_targhetta/...`;
- `{practice_id}/fgas_rapporto_intervento/...`.

Questi file vengono aggiunti anche a `documenti_aggiuntivi_urls` per renderli visibili nella scheda pratica.

La ricevuta finale F-Gas viene salvata in:

- `{practice_id}/fgas-conclusa/...`;

e il relativo percorso viene registrato in `dati_form.fgas.completion_document_urls`. Il caricamento della ricevuta porta automaticamente lo stato F-Gas a `conclusa` e registra `completed_at`.

## Funzionamento CRM proposto

Nel medesimo rettangolino della pratica appaiono due semafori:

- `ENEA · in attesa cliente / in lavorazione / conclusa`;
- `F-Gas · da verificare / in lavorazione / conclusa`.

La scadenza F-Gas proposta è calcolata a 30 giorni dalla data di fine lavori/intervento proposta. La data deve essere verificata dall'operatore: non va trattata come certezza automatica.

È presente un filtro rapido `F-Gas da lavorare`, che mostra solo i pacchetti F-Gas non conclusi.

Nella scheda del cliente lo staff può:

- cambiare lo stato F-Gas;
- caricare la ricevuta finale F-Gas;
- scaricare la ricevuta già caricata;
- vedere il termine proposto.

## Blocco di sicurezza finale

Per le sole pratiche con `dati_form.fgas.requested === true`, la bozza impedisce il passaggio verso gli stage finali:

- `da_inviare`;
- `gestionale`;
- `recensione`;
- `archiviate`.

Il passaggio è consentito soltanto se:

1. `pratica_enea_conclusa_urls` contiene almeno un documento ENEA conclusivo;
2. `dati_form.fgas.status === "conclusa"`;
3. `dati_form.fgas.completion_document_urls` contiene almeno una ricevuta F-Gas.

Il blocco copre:

- trascinamento della card;
- selezione manuale dello stage nella scheda;
- spostamento multiplo;
- archiviazione singola;
- archiviazione multipla.

Il messaggio deve dire chiaramente quale parte manca. Le pratiche senza pacchetto F-Gas non devono cambiare comportamento.

## Punto critico: convivenza con APR

APR aggiorna continuamente il CRM. Devi verificare con particolare attenzione se APR:

- sostituisce integralmente `dati_form` invece di effettuare un merge profondo;
- ricostruisce `dati_form.fgas` da una propria copia meno aggiornata;
- sposta automaticamente `current_stage_id` verso uno stage finale;
- carica o sostituisce `pratica_enea_conclusa_urls`;
- aggiorna la pratica con snapshot obsoleti;
- ha retry che possono rieseguire una scrittura precedente;
- possiede trigger, worker o automazioni che aggirano i controlli esclusivamente client-side.

Se una di queste condizioni è vera, la soluzione attuale basata soltanto su `dati_form` non è abbastanza robusta. In quel caso proponi una fonte di verità adatta alla concorrenza, ad esempio colonne dedicate o una tabella figlia `practice_workstreams`/`practice_fgas`, con aggiornamenti atomici e controllo server-side.

Non limitarti al controllo React: per la produzione il vincolo finale deve essere applicato anche nel backend o nella funzione che esegue lo spostamento/invio, perché APR o altri processi possono scrivere direttamente nel database e aggirare la UI.

## Gap ancora aperto e obbligatorio prima della pubblicazione

La funzione attuale di consegna `supabase/functions/on-stage-changed/index.ts` recupera e allega i file da `pratica_enea_conclusa_urls`. La bozza salva la ricevuta F-Gas in `dati_form.fgas.completion_document_urls`, ma non ha ancora modificato l'e-mail finale per allegarla.

Prima della pubblicazione devi quindi progettare e verificare:

1. lettura sicura di `dati_form.fgas.completion_document_urls`;
2. creazione degli URL firmati dal bucket corretto;
3. allegato della ricevuta F-Gas alla stessa e-mail finale dei documenti ENEA;
4. comportamento idempotente per evitare doppi invii;
5. log di consegna contenente l'elenco esatto degli allegati;
6. errore bloccante se il pacchetto richiede F-Gas ma il documento non è disponibile;
7. compatibilità con pratiche ENEA normali e pratiche storiche.

Obiettivo finale: il cliente riceve insieme tutti i documenti previsti; l'operatore non può chiudere una commessa incompleta.

## File toccati dalla proposta locale

Principali:

- `src/pages/rivenditore/NuovaPraticaEnea.tsx` — domanda F-Gas, campi minimi, validazione, upload e salvataggio;
- `supabase/functions/richiesta-pubblica/index.ts` — stesso contratto per le richieste pubbliche/multipart;
- `src/pages/KanbanBoard.tsx` — doppio stato, filtro, gestione ricevuta e blocco finale.

Collegati:

- `src/App.tsx` — route della pagina informativa;
- `src/pages/ServizioEneaFgas.tsx` — pagina informativa ENEA + F-Gas, attualmente file nuovo locale.

L'intero diff esatto è allegato in:

`docs/fgas-crm-local-proposal.patch`

Identificazione della base usata per generare il diff:

- branch locale: `agent/crm-ombra-enea-lab`;
- commit HEAD: `73f4877450c9392c7240aeba24653fca36d127a7`;
- SHA-256 della patch: `cea3ab1463a7c14e1ca04f7a7b6fa740b946485ad704edfb7292c53b01f55ab3`;
- patch: 1.480 righe, inclusa l'aggiunta completa della pagina informativa F-Gas.

Se il tuo HEAD o i file APR non coincidono con questa base, non applicare la patch automaticamente: effettua un confronto a tre vie e porta manualmente soltanto gli hunk compatibili.

Il repository contiene numerosi altri file modificati non pertinenti. Non includerli nella pubblicazione di questo progetto senza revisione separata.

## Verifiche già eseguite

- La proposta è stata sviluppata soltanto in locale/ombra.
- Nessuna pubblicazione della parte F-Gas è stata eseguita.
- `npm run build` termina con successo.
- Rimane un warning CSS già esistente: `Expected identifier but found "-"`; non è stato introdotto né risolto da questa attività.

## Verifiche che devi eseguire tu

1. Confronto semantico con il lavoro APR in corso.
2. Ricerca di tutte le scritture a `enea_practices.dati_form` e `current_stage_id`.
3. Test di concorrenza tra operatore CRM e aggiornamento APR.
4. Test di una pratica ENEA normale: nessuna regressione.
5. Test di un pacchetto F-Gas rifiutato: solo ENEA.
6. Test di un pacchetto F-Gas accettato mentre il cliente ENEA non ha ancora compilato.
7. Chiusura F-Gas prima di ENEA.
8. Chiusura ENEA prima di F-Gas.
9. Tentativo di invio con ENEA mancante: deve essere bloccato.
10. Tentativo di invio con F-Gas o ricevuta mancante: deve essere bloccato.
11. Tentativo di aggiramento via spostamento multiplo, automazione e scrittura backend.
12. Invio finale con allegati ENEA + F-Gas e verifica e-mail reale controllata.
13. Verifica del limite temporale F-Gas e della correttezza della data sorgente.
14. Rollback completo senza perdita di pratiche o documenti.

## Decisione che ti viene richiesta

Rispondi prima di intervenire con una delle due alternative:

### A — Integro io la proposta locale

Sceglila soltanto se la struttura è compatibile con APR. Indica:

- quali hunk accetti;
- quali modifichi;
- quali controlli server-side aggiungi;
- come completi l'invio dei documenti F-Gas;
- piano di test, pubblicazione e rollback.

### B — Gestisco io l'intera integrazione CRM/F-Gas

Sceglila se la patch entra in conflitto con APR o con la tua architettura. In tal caso:

- conserva gli obiettivi funzionali e l'esperienza minimale sopra descritti;
- spiega quali parti della patch locale non userai e perché;
- proponi la tua implementazione completa;
- garantisci compatibilità con le pratiche già presenti;
- non pubblicare finché il Titolare non approva il piano.

## Formato obbligatorio della tua risposta

1. **Raccomandazione:** A oppure B, con motivazione.
2. **Conflitti trovati:** file, funzioni, tabelle, automazioni e rischi di concorrenza.
3. **Architettura definitiva proposta:** fonte di verità, stati e responsabilità.
4. **Gap da chiudere:** soprattutto allegati F-Gas nell'e-mail finale e controllo backend.
5. **Piano di implementazione:** passi ordinati e reversibili.
6. **Piano di test:** casi normali, errori e concorrenza con APR.
7. **Piano di pubblicazione e rollback.**
8. **Decisione richiesta al Titolare:** una sola domanda chiara prima di qualsiasi deploy.
