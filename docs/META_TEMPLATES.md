# WhatsApp Template Registration — Meta Business Manager

**Stato:** Pratica Rapida usa la WhatsApp Business Cloud API tramite `send-whatsapp` (e `notify-cliente`) edge function. Ogni template referenziato nel codice **deve essere registrato e APPROVATO** in Meta Business Manager (WhatsApp Manager → Message Templates) prima di poter essere inviato. Se un template non è approvato, ogni invio fallisce con errore `template not found` / `Template name does not exist`.

## Dove registrare

1. Login su https://business.facebook.com
2. Seleziona il Business Account collegato a Pratica Rapida
3. Apri **WhatsApp Manager** (dalla barra laterale Assets → WhatsApp Accounts)
4. Vai su **Message Templates** → **Create Template**
5. Scegli la categoria corretta (vedi sotto — **SEMPRE `UTILITY`** per i nostri template transazionali)
6. Imposta la lingua: **Italian (it)**
7. Incolla il body testuale usando i placeholder `{{1}}`, `{{2}}`, ecc. nell'ordine esatto indicato sotto
8. Salva e invia per approvazione. L'approvazione richiede 1-24 ore.

> ⚠️ Nota: Meta ha riclassificato automaticamente molti template `UTILITY` in `MARKETING` negli ultimi aggiornamenti. Se un template viene bocciato come "marketing-like", rimuovi linguaggio promozionale (esclamazioni, emoji multipli, CTA aggressive) e riprova come UTILITY.

---

## Template richiesti

### 1. `contatta_cliente`

- **Uso:** Primo contatto al cliente finale subito dopo che il rivenditore crea la pratica (flusso `on-practice-created` → servizio completo).
- **Categoria:** UTILITY
- **Lingua:** it
- **Parametri (body):** 3
  - `{{1}}` = nome cliente finale
  - `{{2}}` = nome rivenditore (ragione sociale)
  - `{{3}}` = URL del form pre-compilato (`https://app.praticarapida.it/form/{token}`)

**Esempio testo da registrare:**
```
Ciao {{1}}, siamo Pratica Rapida. Gestiamo la pratica ENEA per conto di {{2}} relativa al prodotto installato presso la tua abitazione.

Per procedere abbiamo bisogno di alcuni dati. Compila il modulo (5 minuti) qui: {{3}}

Rispondi a questo messaggio se hai domande.
```

---

### 2. `sollecito_compilazione`

- **Uso:** Sollecito al cliente finale dopo 7 giorni senza compilazione form (flusso `process-automations` → `days_waiting_7`).
- **Categoria:** UTILITY
- **Lingua:** it
- **Parametri (body):** 3
  - `{{1}}` = nome cliente finale
  - `{{2}}` = URL del form
  - `{{3}}` = scadenza testuale (es. "30 giorni")

**Esempio testo da registrare:**
```
Ciao {{1}}, ti ricordiamo che la tua pratica ENEA è in attesa. Per completarla serve che tu compili il modulo qui: {{2}}

La scadenza per la presentazione è di {{3}}. Ci vogliono solo 5 minuti.
```

---

### 3. `conferma_dati_ricevuti`

- **Uso:** Conferma al cliente finale dopo che ha compilato il form (flusso `on-stage-changed` → stage `pronte_da_fare`).
- **Categoria:** UTILITY
- **Lingua:** it
- **Parametri (body):** 1
  - `{{1}}` = nome cliente finale

**Esempio testo da registrare:**
```
Ciao {{1}}, abbiamo ricevuto correttamente i tuoi dati. La tua pratica ENEA è ora in lavorazione. Ti aggiorneremo non appena sarà completata.
```

---

### 4. `pratica_completata`

- **Uso:** Notifica al cliente finale quando la pratica passa a stato `da_inviare` / completata (flusso `on-stage-changed`).
- **Categoria:** UTILITY
- **Lingua:** it
- **Parametri (body):** 1
  - `{{1}}` = nome cliente finale

**Esempio testo da registrare:**
```
Ciao {{1}}, la tua pratica ENEA è stata completata e inviata correttamente. Riceverai a breve la conferma via email con i documenti.

Grazie per averci scelto.
```

---

### 5. `sollecito_recensione`

- **Uso:** Sollecito di recensione 7 giorni dopo `recensione_richiesta_at` se non ricevuta (flusso `process-automations` → `recensione_7d_followup`).
- **Categoria:** UTILITY
- **Lingua:** it
- **Parametri (body):** 1
  - `{{1}}` = nome cliente finale

**Esempio testo da registrare:**
```
Ciao {{1}}, la tua pratica ENEA si è conclusa la settimana scorsa. Ti chiediamo un minuto per lasciarci un feedback: la tua opinione ci aiuta a migliorare.

Hai ricevuto il link tramite email. Grazie!
```

---

### 6. `modulo_cliente_enea`

- **Uso:** Invio/reminder modulo cliente per pratiche di settore (schermature, infissi, impianto termico, VEPA) — usato da `notify-cliente`.
- **Categoria:** UTILITY
- **Lingua:** it
- **Parametri (body):** 2
  - `{{1}}` = nome cliente
  - `{{2}}` = URL del modulo

**Esempio testo da registrare:**
```
Ciao {{1}}, per procedere con la tua pratica ENEA abbiamo bisogno di alcune informazioni tecniche. Compila il modulo online (5 minuti): {{2}}
```

---

## Checklist post-approvazione

- [ ] Tutti i 6 template compaiono come **Approved** in WhatsApp Manager.
- [ ] La lingua del template è **it** (non `it_IT` né `en`).
- [ ] Nome esatto come nel codice (case-sensitive, underscore).
- [ ] Numero e ordine dei placeholder identico a quello documentato.
- [ ] Test manuale: inviare una pratica di prova da dashboard e verificare ricezione WhatsApp.
- [ ] Controllare `communication_log` e `whatsapp_logs` per `status = sent` e assenza di `error_message`.

## Debug invii falliti

Se un invio fallisce, l'errore completo Meta è loggato in `error_reports` (tramite `reportError`) e `whatsapp_logs.status = failed`.

Errori tipici:
- `(#132001) Template name does not exist` → template non registrato o non ancora approvato.
- `(#132012) Parameter format does not match format in the created template` → numero di parametri passati diverso da quelli registrati. Confronta con questa tabella.
- `(#131031) The Account is blocked` → WABA sospeso da Meta (serve ticket supporto).

## Riferimenti

- Meta Business Manager: https://business.facebook.com
- WhatsApp Cloud API docs: https://developers.facebook.com/docs/whatsapp/cloud-api
- Template categories policy: https://developers.facebook.com/docs/whatsapp/message-templates/guidelines
