-- Seed default email templates for modulo cliente (primo invio + reminder)
-- These can be customized via the Automazioni page

INSERT INTO public.email_templates (name, subject, html_body, trigger_event, is_active)
VALUES (
  'Modulo Cliente — Primo Invio',
  'Compila il tuo modulo ENEA — {{tipo_modulo}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
    <p style="color:#aaaacc;margin:6px 0 0;font-size:13px;">Pratiche ENEA e Conto Termico</p>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333;line-height:1.7;">
    <h2 style="color:#1a1a2e;margin-top:0;">Abbiamo bisogno di alcune informazioni</h2>
    <p>Ciao <strong>{{nome}}</strong>,</p>
    <p>Per procedere con la tua pratica ENEA (<strong>{{tipo_modulo}}</strong>) abbiamo bisogno di alcune informazioni tecniche da parte tua.</p>
    <p>Ci vogliono solo <strong>5 minuti</strong> per completare il modulo online.</p>
    <div style="text-align:center;margin:28px 0">
      <a href="{{link}}" style="background:#e94560;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">
        Compila il modulo ora →
      </a>
    </div>
    <p style="color:#888;font-size:13px;">Oppure copia questo link nel browser:<br>
      <a href="{{link}}" style="color:#e94560;word-break:break-all;">{{link}}</a>
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:13px;color:#888;">Per assistenza: <a href="mailto:supporto@praticarapida.it" style="color:#e94560;">supporto@praticarapida.it</a></p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · I tuoi dati sono trattati nel rispetto del GDPR.
  </td></tr>
</table></td></tr></table></body></html>',
  'modulo_cliente_invio',
  true
),
(
  'Modulo Cliente — Reminder',
  'Ricordati di completare il modulo ENEA — {{tipo_modulo}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
    <p style="color:#aaaacc;margin:6px 0 0;font-size:13px;">Pratiche ENEA e Conto Termico</p>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333;line-height:1.7;">
    <h2 style="color:#1a1a2e;margin-top:0;">Ricordati di compilare il modulo!</h2>
    <p>Ciao <strong>{{nome}}</strong>,</p>
    <p>Ti ricordiamo che hai ancora un modulo in attesa di compilazione per la tua pratica ENEA (<strong>{{tipo_modulo}}</strong>).</p>
    <p>Bastano <strong>5 minuti</strong> per completarlo e permetterci di procedere con la tua pratica.</p>
    <div style="text-align:center;margin:28px 0">
      <a href="{{link}}" style="background:#e94560;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">
        Completa il modulo →
      </a>
    </div>
    <p style="color:#888;font-size:13px;">Oppure copia questo link nel browser:<br>
      <a href="{{link}}" style="color:#e94560;word-break:break-all;">{{link}}</a>
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:13px;color:#888;">Per assistenza: <a href="mailto:supporto@praticarapida.it" style="color:#e94560;">supporto@praticarapida.it</a></p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © Pratica Rapida · I tuoi dati sono trattati nel rispetto del GDPR.
  </td></tr>
</table></td></tr></table></body></html>',
  'modulo_cliente_reminder',
  true
)
ON CONFLICT DO NOTHING;
