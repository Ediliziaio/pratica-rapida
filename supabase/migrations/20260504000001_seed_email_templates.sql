-- =====================================================================
-- Seed dei 14 template email finora hardcoded in supabase/functions/send-email
-- + UNIQUE constraint su trigger_event (idempotenza ON CONFLICT)
--
-- Da questo momento `send-email` legge prima dal DB; questi seed coprono
-- ogni case del switch presente nel renderTemplate hardcoded.
-- =====================================================================

-- 1) UNIQUE su trigger_event (necessario per ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_templates'::regclass
      AND conname = 'email_templates_trigger_event_key'
  ) THEN
    -- prima rimuovi eventuali duplicati lasciando il più recente
    DELETE FROM public.email_templates a
    USING public.email_templates b
    WHERE a.trigger_event = b.trigger_event
      AND a.created_at < b.created_at
      AND a.trigger_event IS NOT NULL;

    ALTER TABLE public.email_templates
      ADD CONSTRAINT email_templates_trigger_event_key UNIQUE (trigger_event);
  END IF;
END $$;

-- 2) Seed dei template
-- Tutti gli HTML replicano fedelmente il base() wrapper + content del case
-- nel renderTemplate dell'edge function send-email.

-- Wrapper di base usato in send-email (riprodotto 1:1)
-- bg_header = #1a1a2e, cta = #e94560, text = #333333

INSERT INTO public.email_templates (name, subject, html_body, trigger_event, is_active)
VALUES
-- ── Pratica ricevuta (al rivenditore) ──────────────────────────────────────
(
  'ENEA — Conferma pratica ricevuta al rivenditore',
  'Pratica ricevuta — {{cliente_nome}} {{cliente_cognome}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2>Pratica ricevuta ✓</h2>
    <p>Ciao <strong>{{nome}}</strong>,</p>
    <p>Abbiamo ricevuto la pratica per il cliente <strong>{{cliente_nome}} {{cliente_cognome}}</strong>.</p>
    <p>La stiamo elaborando e ti aggiorneremo a breve.</p>
    <div style="text-align:center;margin:24px 0"><a href="{{link}}" style="background:#e94560;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Visualizza pratica</a></div>
    <p>Per assistenza: <a href="mailto:supporto@praticarapida.it">supporto@praticarapida.it</a></p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'pratica_ricevuta',
  true
),
-- ── Sollecito cliente finale (M2 — 7gg) ───────────────────────────────────
(
  'M2 — Sollecito compilazione cliente finale (7gg)',
  'Manca poco! Completa la tua pratica ENEA',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2>Ciao {{nome}},</h2>
    <p>La tua pratica ENEA è quasi completata! Abbiamo bisogno di alcuni tuoi dati per procedere.</p>
    <p>Ci vogliono solo <strong>5 minuti</strong>.</p>
    <div style="text-align:center;margin:24px 0"><a href="{{link}}" style="background:#e94560;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Compila il modulo ora</a></div>
    <p style="color:#888;font-size:13px;">Scadenza: entro 30 giorni dalla richiesta.</p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'sollecito_privato',
  true
),
-- ── Notifica B (sollecito al rivenditore 30/60/90gg) ──────────────────────
(
  'Notifica B — Sollecito rivenditore (30/60/90gg)',
  'Aggiornamento pratica cliente {{cliente_nome}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2>Aggiornamento pratica</h2>
    <p>Sono trascorsi <strong>{{giorni}}</strong> giorni dall''apertura della pratica per il cliente <strong>{{cliente_nome}} {{cliente_cognome}}</strong>.</p>
    <p>Stato attuale: <strong>{{stato}}</strong></p>
    <p>Tentativi di contatto: <strong>{{tentativi}}</strong></p>
    <div style="text-align:center;margin:24px 0"><a href="{{link}}" style="background:#e94560;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Apri pratica</a></div>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'sollecito_fornitore',
  true
),
-- ── M3 conferma form ───────────────────────────────────────────────────────
(
  'M3 — Conferma modulo compilato',
  'Modulo compilato — pratica in lavorazione',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2>Grazie {{nome}}!</h2>
    <p>I tuoi dati sono stati ricevuti correttamente.</p>
    <p>La tua pratica <strong>{{brand}}</strong> è ora in lavorazione. Ti contatteremo appena ci saranno aggiornamenti.</p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'form_compilato',
  true
),
-- ── M4 pratica completata ──────────────────────────────────────────────────
(
  'M4 — Pratica completata al cliente',
  'La tua pratica {{brand}} è stata completata',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2>Pratica completata! 🎉</h2>
    <p>Gentile <strong>{{nome}} {{cognome}}</strong>,</p>
    <p>La tua pratica <strong>{{brand}}</strong> è stata completata con successo.</p>
    <p>I documenti sono stati inviati via email.</p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'pratica_inviata',
  true
),
-- ── M5 sollecito recensione ────────────────────────────────────────────────
(
  'M5 — Sollecito recensione 5 stelle',
  'Come è andata la tua pratica ENEA?',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2>La tua opinione conta!</h2>
    <p>Gentile <strong>{{nome}}</strong>, ti chiediamo 1 minuto per valutare il servizio.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="text-align:center;padding:8px"><a href="{{base_url}}/recensione/{{token}}?stelle=1" style="display:inline-block;background:#1a1a2e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:18px;">⭐</a></td>
      <td style="text-align:center;padding:8px"><a href="{{base_url}}/recensione/{{token}}?stelle=2" style="display:inline-block;background:#1a1a2e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:18px;">⭐⭐</a></td>
      <td style="text-align:center;padding:8px"><a href="{{base_url}}/recensione/{{token}}?stelle=3" style="display:inline-block;background:#1a1a2e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:18px;">⭐⭐⭐</a></td>
      <td style="text-align:center;padding:8px"><a href="{{base_url}}/recensione/{{token}}?stelle=4" style="display:inline-block;background:#1a1a2e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:18px;">⭐⭐⭐⭐</a></td>
      <td style="text-align:center;padding:8px"><a href="{{base_url}}/recensione/{{token}}?stelle=5" style="display:inline-block;background:#1a1a2e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:18px;">⭐⭐⭐⭐⭐</a></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'recensione',
  true
),
-- ── Ticket aperto al cliente ───────────────────────────────────────────────
(
  'Ticket — Conferma apertura al cliente',
  '✓ Ticket ricevuto — {{oggetto}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2 style="margin-top:0">Ticket ricevuto ✓</h2>
    <p>Ciao <strong>{{nome}}</strong>,</p>
    <p>Il tuo ticket di assistenza è stato ricevuto. Ti risponderemo entro <strong>24 ore lavorative</strong>.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;background:#f9f9f9;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:10px 16px;font-weight:bold;color:#555;width:28%;border-bottom:1px solid #eee">Oggetto</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eee">{{oggetto}}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-weight:bold;color:#555;border-bottom:1px solid #eee">Priorità</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eee">{{priorita}}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-weight:bold;color:#555;vertical-align:top">Descrizione</td>
        <td style="padding:10px 16px;white-space:pre-wrap">{{descrizione}}</td>
      </tr>
    </table>
    <p style="color:#666;font-size:13px;margin-top:24px">Per ulteriori informazioni: <a href="mailto:supporto@praticarapida.it" style="color:#e94560">supporto@praticarapida.it</a></p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'ticket_conferma',
  true
),
-- ── Ticket: risposta staff → cliente ───────────────────────────────────────
(
  'Ticket — Risposta staff al cliente',
  '{{subject}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2 style="margin-top:0">Nuova risposta al tuo ticket</h2>
    <p>Ciao <strong>{{nome}}</strong>,</p>
    <p>Hai ricevuto una nuova risposta dal team di supporto sul ticket:</p>
    <p style="background:#f4f4f4;padding:12px 16px;border-left:3px solid #e94560;margin:16px 0;font-weight:bold;">{{oggetto}}</p>
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:16px;margin:16px 0;white-space:pre-wrap;">{{messaggio}}</div>
    <div style="text-align:center;margin:24px 0"><a href="{{ticket_link}}" style="background:#e94560;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Apri il ticket</a></div>
    <p style="color:#666;font-size:13px;margin-top:24px">Puoi rispondere direttamente da qui per continuare la conversazione.</p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'ticket_risposta_staff',
  true
),
-- ── Ticket: cliente ribatte → notifica staff ───────────────────────────────
(
  'Ticket — Cliente ribatte al team',
  '{{subject}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2 style="margin-top:0">Replica cliente sul ticket</h2>
    <p>Il cliente <strong>{{company}}</strong> ha aggiunto un messaggio al ticket:</p>
    <p style="background:#f4f4f4;padding:12px 16px;border-left:3px solid #e94560;margin:16px 0;font-weight:bold;">{{oggetto}}</p>
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:16px;margin:16px 0;white-space:pre-wrap;">{{messaggio}}</div>
    <div style="text-align:center;margin:24px 0"><a href="{{ticket_link}}" style="background:#e94560;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Apri il ticket</a></div>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'ticket_replica_cliente',
  true
),
-- ── Ticket: nuovo ticket → team interno ────────────────────────────────────
(
  'Ticket — Nuovo ticket al team interno',
  '[TICKET] {{priorita_upper}} — {{oggetto}} ({{company}})',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2 style="margin-top:0">Nuovo ticket di assistenza</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;background:#f9f9f9;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:10px 16px;font-weight:bold;color:#555;width:28%;border-bottom:1px solid #eee">Azienda</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eee"><strong>{{company}}</strong></td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-weight:bold;color:#555;border-bottom:1px solid #eee">Utente</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eee">{{nome}} &lt;{{email}}&gt;</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-weight:bold;color:#555;border-bottom:1px solid #eee">Oggetto</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eee">{{oggetto}}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-weight:bold;color:#555;border-bottom:1px solid #eee">Priorità</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eee">{{priorita_upper}}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-weight:bold;color:#555;vertical-align:top">Descrizione</td>
        <td style="padding:10px 16px;white-space:pre-wrap">{{descrizione}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0"><a href="{{link}}" style="background:#e94560;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Gestisci nel pannello</a></div>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'ticket_nuovo',
  true
),
-- ── Benvenuto nuova azienda ────────────────────────────────────────────────
(
  'Onboarding — Benvenuto nuova azienda con credenziali',
  '✅ Benvenuto su Pratica Rapida — Le tue credenziali di accesso',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2 style="margin-top:0;color:#1a1a2e;">Benvenuto su Pratica Rapida! 🎉</h2>
    <p>Ciao <strong>{{ragione_sociale}}</strong>,</p>
    <p>Il tuo account è stato creato con successo. Puoi accedere al tuo pannello con le seguenti credenziali:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;background:#f9f9f9;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:12px 18px;font-weight:bold;color:#555;width:32%;border-bottom:1px solid #eee;">🌐 Pannello</td>
        <td style="padding:12px 18px;border-bottom:1px solid #eee;"><a href="{{login_url}}" style="color:#00843D;font-weight:bold;">pannello.praticarapida.it</a></td>
      </tr>
      <tr>
        <td style="padding:12px 18px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">📧 Email</td>
        <td style="padding:12px 18px;border-bottom:1px solid #eee;">{{email}}</td>
      </tr>
      <tr>
        <td style="padding:12px 18px;font-weight:bold;color:#555;">🔑 Password</td>
        <td style="padding:12px 18px;font-family:monospace;font-size:15px;letter-spacing:1px;">{{password}}</td>
      </tr>
    </table>
    <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:12px 16px;margin:16px 0;font-size:13px;color:#795548;">
      ⚠️ <strong>Consiglio:</strong> al primo accesso ti suggeriamo di cambiare la password dalle impostazioni del tuo profilo.
    </div>
    <div style="text-align:center;margin:24px 0"><a href="{{login_url}}" style="background:#e94560;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Accedi ora →</a></div>
    <p style="color:#888;font-size:13px;margin-top:24px;">
      Per assistenza o domande: <a href="mailto:supporto@praticarapida.it" style="color:#00843D;">supporto@praticarapida.it</a><br>
      Oppure chiamaci al <a href="tel:+390398682691" style="color:#00843D;">+39 039 868 2691</a> (Lun-Ven 9:00-18:00)
    </p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'benvenuto_azienda',
  true
),
-- ── M1 richiesta compilazione form al cliente ─────────────────────────────
(
  'M1 — Richiesta compilazione modulo al cliente',
  'Compilazione modulo ENEA — {{prodotto}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2>Ciao {{nome}},</h2>
    <p><strong>{{reseller}}</strong> ci ha incaricati di gestire la tua pratica ENEA relativa all''installazione di <strong>{{prodotto}}</strong> presso la tua abitazione.</p>
    <p>Per procedere, ti chiediamo di compilare il modulo di raccolta dati (richiede circa 5 minuti).</p>
    <div style="text-align:center;margin:24px 0"><a href="{{link}}" style="background:#e94560;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Compila il modulo</a></div>
    <p style="color:#888;font-size:13px;">
      Per assistenza scrivi a <a href="mailto:supporto@praticarapida.it" style="color:#888;">supporto@praticarapida.it</a><br>
      oppure su WhatsApp (solo messaggi, no chiamate vocali).
    </p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'richiesta_form',
  true
),
-- ── Notifica A — Documenti mancanti al rivenditore ─────────────────────────
(
  'Notifica A — Documenti mancanti al rivenditore',
  'Documentazione mancante — {{cliente_nome}} {{cliente_cognome}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2>Documenti aggiuntivi richiesti</h2>
    <p>La pratica ENEA del cliente <strong>{{cliente_nome}} {{cliente_cognome}}</strong> richiede documentazione aggiuntiva per poter procedere.</p>
    <p><strong>Documenti richiesti:</strong></p>
    <div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:12px 16px;margin:12px 0;border-radius:0 6px 6px 0;white-space:pre-wrap;">{{note}}</div>
    <div style="text-align:center;margin:24px 0"><a href="{{link}}" style="background:#e94560;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Apri la pratica nel gestionale</a></div>
    <p style="color:#888;font-size:13px;">Per assistenza: <a href="mailto:supporto@praticarapida.it" style="color:#888;">supporto@praticarapida.it</a></p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'notifica_docs_mancanti',
  true
),
-- ── Notifica C — Pratica disponibile in archivio ──────────────────────────
(
  'Notifica C — Archivio pratica disponibile al rivenditore',
  'Pratica ENEA completata — {{cliente_nome}} {{cliente_cognome}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2>Pratica completata ✓</h2>
    <p>La pratica ENEA del cliente <strong>{{cliente_nome}} {{cliente_cognome}}</strong> è stata completata e inviata al cliente finale.</p>
    <p>La pratica è ora disponibile nella tua area riservata del portale PraticaRapida.</p>
    <div style="text-align:center;margin:24px 0"><a href="{{app_url}}" style="background:#e94560;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Vai all''area riservata</a></div>
    <p style="color:#888;font-size:13px;">Per assistenza: <a href="mailto:supporto@praticarapida.it" style="color:#888;">supporto@praticarapida.it</a></p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>',
  'notifica_pratica_disponibile',
  true
)
ON CONFLICT (trigger_event) DO NOTHING;

-- updated_at colonna se non esiste — utile per UI lista template
ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.email_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.email_templates_set_updated_at();
