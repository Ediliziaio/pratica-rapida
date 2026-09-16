# CRM ombra

Copia del CRM vero in cui, da «Pronte da fare» in poi, lavora APR al posto
dell'operatore. Stessa app, stessa interfaccia, stessa pipeline. Due differenze:

1. **Nessuna comunicazione esce**: mail, WhatsApp, chiamate, solleciti vengono
   registrati nella tabella `comunicazioni_bloccate` e non partono.
2. **Una finestra in più**, `/admin/domande-apr`, con le domande che APR fa
   all'operatore; le risposte finiscono nel ledger che APR rilegge al giro dopo.

Il CRM ombra è usa-e-getta: fatto il confronto operatore/APR, si butta via.
Non alimenta il cruscotto RevOps (progetto Supabase separato: non lo raggiunge
per costruzione).

## Come è fatto

| Pezzo | Dove | Stato |
|---|---|---|
| Modalità ombra nell'app (`VITE_CRM_OMBRA=true`) | `src/lib/crmOmbra.ts`, `src/components/OmbraBanner.tsx`, route in `src/App.tsx` | fatto |
| Blocco delle 5 funzioni in uscita | `supabase/functions/_shared/ombra.ts` + `ombraCore.ts`, chiamato da `send-email`, `send-whatsapp`, `notify-cliente`, `elevenlabs-call`, `send-reminders` | fatto |
| Tabella `comunicazioni_bloccate` | `supabase/ombra/comunicazioni_bloccate.sql` — **fuori** da `supabase/migrations`, si applica a mano SOLO al progetto ombra | fatto |
| Pagina «Comunicazioni bloccate» | `src/pages/ComunicazioniBloccate.tsx` → `/admin/comunicazioni-bloccate` | fatto |
| Pagina «Domande APR» | `src/pages/DomandeApr.tsx` → `/admin/domande-apr`, legge dal server locale `src/features/enea-shadow-crm/operator-answers/server.ts` | fatto |
| Test che le 5 funzioni in ombra scrivono in tabella e non chiamano fuori | `src/features/enea-shadow-crm/ombra/ombraGate.test.ts` | fatto (vedi «Cosa dimostra il test») |
| Bottone «Esporta per CRM ombra» nel CRM vero | `src/features/enea-shadow-crm/ombra-import/EsportaPerOmbraButton.tsx`, montato in `src/pages/KanbanBoard.tsx` — **modifica di produzione**, vedi sotto | fatto |
| Pagina «Importa pratica» nell'ombra | `src/pages/ImportaPratica.tsx` → `/admin/importa-pratica`; logica in `ombra-import/importaPratica.ts` | fatto |
| Test export/import (formato, firma, rifiuti, stessi id) | `src/features/enea-shadow-crm/ombra-import/ombraImport.test.ts` | fatto |
| Secondo progetto Supabase | supabase.com | **da fare, Giuliano** |

### Le tre serrature sulle comunicazioni

Indipendenti l'una dall'altra; ne basta una perché nulla parta.

1. **Le chiavi non esistono.** Nel progetto ombra NON vanno mai impostati i
   secret `RESEND_API_KEY`, `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`,
   `ELEVENLABS_API_KEY`, `WA_ELEVENLABS_PHONE_ID`, né alcuna configurazione
   openwa. Senza chiavi, i provider rifiutano.
2. **Il gate.** Ogni funzione, subito dopo aver letto la richiesta e prima di
   qualsiasi invio, chiama `bloccaSeOmbra(...)`: con il secret `CRM_OMBRA=true`
   scrive la riga in `comunicazioni_bloccate` e ritorna 200 `{blocked: true}`.
   Se la scrittura fallisce, ritorna 500: mai un invio.
3. **La guardia sul fetch.** Con `CRM_OMBRA=true`, al primo import di
   `_shared/ombra.ts` il `fetch` globale viene sostituito da uno che lascia
   passare solo l'host Supabase del progetto ombra e lancia
   `crm_ombra_fetch_bloccata:<host>` per qualsiasi altro host
   (api.resend.com, graph.facebook.com, api.elevenlabs.io, …).

In produzione il secret `CRM_OMBRA` non esiste: gate inerte, fetch intatto,
tabella vuota.

### Cosa dimostra il test (`ombraGate.test.ts`)

Deno non è installato su questo Mac, quindi le edge function non girano nei
test. Il test fa tre cose:

- esegue il **vero modulo** `_shared/ombra.ts` con `CRM_OMBRA=true` e senza
  alcuna chiave, per tutte e cinque le funzioni: verifica che scriva la riga
  nella tabella, risponda `blocked`, e che un `fetch` verso `api.resend.com`
  venga rifiutato dalla guardia;
- verifica che, se la scrittura in tabella fallisce, la risposta sia un errore
  e non un invio;
- legge il sorgente di ciascuna delle cinque funzioni e verifica che importi il
  gate e lo chiami **prima del primo `fetch`** nell'handler.

Manca la prova end-to-end su Deno. Si può fare in due modi, a scelta:
installare Deno e aggiungere un `deno test`, oppure — più fedele — dopo il
deploy nel progetto ombra invocare le cinque funzioni con `curl` e controllare
che la tabella si riempia e i log mostrino `[crm-ombra] modalità OMBRA attiva`.
Va fatto **prima** che entri la prima pratica.

## Messa in piedi (Giuliano)

1. Su supabase.com crea un progetto nuovo, es. `pratica-rapida-ombra`. Regione
   qualsiasi. Le chiavi restano tue: non incollarle in chat.
2. Applica le migrazioni normali (le stesse 95 del CRM vero):
   `supabase link --project-ref <ref-ombra>` poi `supabase db push`.
   Poi, **solo nel progetto ombra**, apri l'SQL editor e incolla
   `supabase/ombra/comunicazioni_bloccate.sql`. Quel file non sta in
   `supabase/migrations` apposta: in produzione non deve mai arrivare.
3. Secret delle funzioni nel progetto ombra — SOLO questi:
   `CRM_OMBRA=true`, più quelli che Supabase mette da sé
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Nessuna chiave di
   Resend/WhatsApp/ElevenLabs/openwa/Stripe/Sentry.
4. Deploy delle funzioni: `supabase functions deploy --project-ref <ref-ombra>`.
5. Prova le serrature, prima di qualsiasi pratica (vedi sopra: cinque `curl`,
   tabella piena, nessun invio).
6. Copia `.env.ombra.example` in `.env.ombra`, metti URL e chiave pubblica del
   progetto ombra, poi:
   `npx vite --mode ombra` → app su http://127.0.0.1:8080 con la striscia OMBRA.
7. Crea nel progetto ombra un utente staff «APR» (ruolo operatore): è lui che
   comparirà nel registro attività per quello che fa APR.

## Modifica al CRM di produzione (una sola)

Il bottone **«Esporta per CRM ombra»** nella scheda pratica del Kanban è
l'unica modifica al CRM vero legata al CRM ombra. Approvata dal titolare il
14/09/2026 a queste condizioni, che il codice rispetta e i test controllano:

- **sola lettura**: tre `select` (pratica, rivenditore, stage) e i download dei
  documenti; nessuna scrittura, nessun log, nessun update;
- **visibile solo al super_admin**; nel CRM ombra non compare;
- **nessuna automazione collegata**: niente trigger, niente funzione, niente
  invio; il file scende nel browser di chi ha premuto e basta.

Tutto il resto (gate, tabella, pagine ombra) o è inerte in produzione o non ci
arriva proprio.

## Ingresso delle pratiche: import di un file

APR legge il CRM di produzione in **sola lettura** (REST autenticato, solo GET,
`mutationAllowed false`). L'ingresso nell'ombra passa comunque per un file
esportato a mano, perché è la strada più sicura: nessun processo automatico
tocca la produzione, e chi esporta vede cosa esporta.

### 1. Esportazione (CRM vero, super_admin)

Scheda pratica nel Kanban → «Esporta per CRM ombra». Scende un solo file JSON,
senza librerie: `pratica-ombra-<practiceId>-<yyyymmdd-hhmm>.json`.

```
version         "crm-ombra-export-v1"
exportedAt / exportedBy
practiceId
practice        la riga enea_practices così com'è (stessi nomi di colonna, stesso id)
reseller        la riga companies del rivenditore, o null
stage           { stage_type, name, brand } dello stage corrente
documents[]     { origine, path, bucket, contentType, size, sha256, base64 }
contentSha256   sha256 di tutto quanto sopra
```

I documenti sono tutti i percorsi nelle quattro colonne `*_urls` più ogni
stringa dentro `dati_form` che comincia con `<practiceId>/` (è così che il
Kanban riconosce i file caricati dal cliente, qualunque sia il modulo). Ogni
file viene cercato nei bucket `documenti` e `enea-documents`; se non c'è da
nessuna parte resta un avviso, non un errore.

### 2. Importazione (CRM ombra, staff)

`/admin/importa-pratica`: si sceglie il file, si vede cosa contiene, si
conferma. Regole:

- il file è verificato **per intero** prima di toccare qualsiasi cosa: versione,
  `contentSha256`, sha256 e dimensione di ogni documento. Una cosa sola che non
  torna → rifiutato tutto;
- pratica già presente (stesso id) → **non si sovrascrive**, si ferma e lo dice.
  Una pratica in lavorazione da APR non va sostituita sotto i piedi;
- **stessi id** del CRM vero: pratica, rivenditore (creato nell'ombra se manca),
  percorsi dei documenti (stesso bucket, stesso path). Il confronto a fine corsa
  è per id, senza tabelle di corrispondenza;
- lo stage si rimappa per `(stage_type, brand)` sugli stage di sistema
  dell'ombra (gli id degli stage sono diversi fra i due database);
  `operatore_id` e `chiamate_assegnato_a` vanno a null, sono utenti del CRM
  vero;
- scrive con l'utente staff loggato nell'ombra, mai con la service role dal
  browser;
- nessuna automazione: i trigger di `enea_practices` scattano su UPDATE, non su
  INSERT; e comunque nell'ombra le funzioni in uscita sono bloccate.

### 3. APR trova la pratica

APR legge il database ombra come legge quello vero: stesso schema, stessa
forma. L'adapter puntato sull'ombra è lavoro del runner e sta fuori da qui.

### Da decidere

- Chi esporta e quando: proposta = l'operatore, appena la pratica arriva in
  «Pronte da fare». Alternativa: a fine giornata, tutte le pratiche entrate.
- Il formato del file va confermato con chi farà l'adapter del runner, così la
  fotografia contiene già tutto ciò che APR legge.
