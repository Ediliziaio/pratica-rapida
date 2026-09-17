# Pagamenti CF — Stripe + Fatture in Cloud

## Risultato atteso

- CF ordinario: 150,00 EUR + IVA 22% = 183,00 EUR.
- CF del rivenditore Sima Home (`26796836-cc0e-4bfe-b3a5-0200b2098ed8`):
  100,00 EUR + IVA 22% = 122,00 EUR.
- Servizio ricerca dati catastali: 10,00 EUR + IVA 22% = 12,20 EUR.
- CF ordinario con ricerca catastale: 160,00 EUR + IVA 22% = 195,20 EUR.
- CF Sima Home con ricerca catastale: 110,00 EUR + IVA 22% = 134,20 EUR.
- Cliente non CF che richiede la sola ricerca catastale: 12,20 EUR IVA inclusa.
- Il cliente completa il modulo prima di pagare, così sono disponibili tutti i
  dati fiscali necessari.
- Il CRM crea una proforma tecnica Fatture in Cloud non mostrata al cliente e
  apre direttamente il checkout Stripe.
- Il checkout Stripe è forzato in EUR: la valuta adattiva è disattivata per
  evitare conversioni e commissioni presentate al cliente.
- Quando è acquistata la ricerca catastale, proforma e fattura espongono una
  riga separata dal servizio pratica e il CRM mostra il contrassegno `CATASTO`.
- Anche il cliente non CF paga direttamente la ricerca catastale e riceve la
  relativa fattura all'indirizzo e-mail indicato nel modulo.
- Solo un pagamento verificato porta alla creazione della fattura elettronica.
- La pratica passa a `pronte_da_fare` solo dopo pagamento, creazione fattura,
  invio allo SDI e conferma FIC dell'e-mail inviata al cliente.
- Qonto riceve gli accrediti Stripe; la riconciliazione cliente ↔ pratica
  avviene prima, tramite `cf_payment_orders`, Checkout Session e documento FIC.

## Autonomia e interruttori di sicurezza

Questa integrazione è una porta a una via sul piano fiscale. In base alla Cabina
di Regia, creazione/invio reale delle fatture richiede approvazione del Titolare.

- `FIC_PAYMENT_CREATION_ENABLED=false`: non crea proforme né link reali.
- `FIC_LIVE_INVOICING_ENABLED=false`: registra il pagamento ma non crea fatture.
- `FIC_SDI_DRY_RUN=true`: esegue i controlli SDI senza trasmettere la fattura.
- `CF_PAYMENT_PROVIDER=stripe`: abilita il checkout Stripe diretto. Se assente,
  resta attivo il precedente percorso TS Pay.
- `FIC_STRIPE_PAYMENT_ACCOUNT_ID`: ID del conto Qonto in Fatture in Cloud su
  cui registrare la fattura come pagata. È obbligatorio per la fatturazione live.
- `platform_settings.fic_tspay_rollout.enabled=false`: mantiene il nuovo flusso
  catastale dormiente finché backend e frontend non vengono attivati insieme.

I valori sicuri iniziali sono `false`, `false`, `true`, con rollout `false`.

## Credenziale Fatture in Cloud

Per un'integrazione interna su una sola azienda, la documentazione FIC consiglia
un token manuale conservato nel secret manager server-side. Il token non deve
mai essere inserito nel frontend, nel repository, nei log o in chat.

Permessi minimi:

- `issued_documents.proformas:a`
- `issued_documents.invoices:a`

Secret richiesti:

- `FIC_ACCESS_TOKEN`
- `FIC_COMPANY_ID`
- `FIC_WEBHOOK_URL`
- `FIC_WEBHOOK_PUBLIC_KEY_B64`
- `FIC_PAYMENT_CREATION_ENABLED`
- `FIC_LIVE_INVOICING_ENABLED`
- `FIC_SDI_DRY_RUN`
- `CF_PAYMENT_PROVIDER`
- `FIC_STRIPE_PAYMENT_ACCOUNT_ID`
- opzionale `FIC_VAT_TYPE_ID` (default API `0`, IVA 22%)

## Webhook

Endpoint:

`https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/fic-webhook`

Eventi da sottoscrivere:

- `it.fattureincloud.webhooks.issued_documents.proformas.update`
- `it.fattureincloud.webhooks.issued_documents.e_invoices.status_update`
- `it.fattureincloud.webhooks.issued_documents.invoices.email_sent`

Le richieste vengono accettate soltanto dopo verifica del JWT ES256 FIC. Gli
eventi sono registrati per `event_id` per impedire la doppia elaborazione.

## Collaudo obbligatorio

1. Applicare la migration e distribuire le funzioni con tutti i flag sicuri.
2. Verificare, senza creare proforme, i quattro scenari economici: CF ordinario,
   CF Sima Home, ciascuno con e senza ricerca catastale, e il caso non CF con la
   sola ricerca catastale.
3. Abilitare soltanto la creazione proforma/checkout e controllare importi e anagrafica.
4. Effettuare un pagamento reale di collaudo soltanto previa approvazione.
5. Trasformare in fattura con `FIC_SDI_DRY_RUN=true` e verificare XML/esito.
6. Con approvazione finale, impostare `FIC_LIVE_INVOICING_ENABLED=true` e
   `FIC_SDI_DRY_RUN=false`.
7. Verificare email cliente, quattro indicatori CRM, stato SDI e accredito Stripe su Qonto.

## Arresto e recupero

- Arresto immediato nuovi pagamenti: `FIC_PAYMENT_CREATION_ENABLED=false`.
- Arresto fatturazione automatica: `FIC_LIVE_INVOICING_ENABLED=false`.
- Un evento fallito resta in `fic_webhook_events`/`stripe_webhook_events` e l'ordine conserva
  `last_error_code`/`last_error_message`; non viene generata una seconda pratica.
- Le proforme e fatture non vengono mai cancellate automaticamente.
## Collaudo controllato da 1 euro

Il collaudo economico non modifica mai i prezzi globali. Una singola pratica CF
può essere autorizzata tramite una riga service-role in
`cf_payment_test_overrides`, vincolata contemporaneamente a:

- UUID esatto della pratica;
- nominativo atteso;
- scadenza;
- utilizzo monouso.

Il totale è 1,00 EUR IVA inclusa (0,82 EUR imponibile + 0,18 EUR IVA). Gli ordini
di collaudo sono marcati `is_test_payment = true`, ma dopo l'autorizzazione
fiscale esplicita del Titolare percorrono lo stesso flusso dei pagamenti
ordinari: proforma tecnica, fattura reale, invio SDI, e-mail al cliente e
passaggio in `pronte_da_fare`. La migrazione crea soltanto la struttura e non
abilita alcuna pratica.
