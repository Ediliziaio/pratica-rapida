# Resend — Setup deliverability dominio

Tutte le email transazionali di Pratica Rapida sono inviate tramite Resend (https://resend.com). La edge function `send-email` (e i path diretti in `notify-cliente` e `create-company-user`) usa il mittente:

```
Pratica Rapida <noreply@${EMAIL_FROM_DOMAIN}>
```

Con fallback `EMAIL_FROM_DOMAIN=praticarapida.it`. **Perché l'invio non finisca in spam** (o venga proprio rifiutato da Gmail/Outlook) il dominio `praticarapida.it` deve essere verificato in Resend con record DNS validi.

## Checklist

### 1. Verifica dominio in Resend
1. Login su https://resend.com/domains
2. Add Domain → `praticarapida.it`
3. Resend mostrerà 3 record da aggiungere nel DNS del dominio (tipicamente gestito dove è registrato il dominio — Register.it, OVH, Aruba, Cloudflare, ecc.):
   - 1 record **TXT** per SPF (es. `v=spf1 include:amazonses.com ~all`)
   - 2 record **CNAME/TXT** per DKIM (chiavi generate da Resend, uniche per account)
   - 1 record **MX** opzionale per il feedback
4. Aggiungi i record nel pannello DNS del registrar
5. Aspetta la propagazione (da 5 minuti a 24 ore)
6. Clicca **Verify** in Resend — tutti i record devono risultare verdi

### 2. DMARC (consigliato)
Aggiungi un record TXT su `_dmarc.praticarapida.it`:
```
v=DMARC1; p=quarantine; rua=mailto:dmarc@praticarapida.it; adkim=s; aspf=s
```
Inizia con `p=none` per monitorare, dopo qualche settimana alza a `quarantine`.

### 3. Supabase secrets
Verifica che in Supabase siano impostati:
- `RESEND_API_KEY` (re_XXXX) — il secret deve essere lo stesso account Resend dove il dominio è verificato
- `EMAIL_FROM_DOMAIN=praticarapida.it` (opzionale, default già corretto)

Comando per verificarlo:
```bash
supabase secrets list --project-ref xmkjrhwmmuzaqjqlvzxm
```

### 4. Test di invio
Dall'admin Pratica Rapida invia un'email di test (es. creare una pratica di test, oppure aprire un ticket supporto). Controlla:
- **Resend dashboard** → Emails: stato `delivered` entro 1 minuto
- **Destinatario**: email arriva inbox (non spam) e l'header `From:` mostra `Pratica Rapida <noreply@praticarapida.it>` senza avvertimenti "Mittente non verificato"
- **Mail-tester.com**: invia a un indirizzo di mail-tester e punteggio ≥ 9/10

## Debug invii falliti

Errori di Resend vengono loggati in:
- `error_reports` (tramite `reportError`)
- `email_logs.status = 'failed'`
- Edge function logs (`supabase functions logs send-email`)

Errori tipici:
- **`Domain is not verified`** → completare step 1
- **`From address domain is not verified`** → `EMAIL_FROM_DOMAIN` diverso dal dominio verificato
- **`Rate limit exceeded`** → piano gratuito Resend ha 100/day, 3000/month. Upgrade piano.
- **Hard bounce** (550 errors) → destinatario non esiste. Controllare validità email nella `companies` / `enea_practices`.
