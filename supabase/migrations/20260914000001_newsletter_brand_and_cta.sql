-- Allinea il template realmente usato dagli invii massivi del CRM.
-- L'oggetto e il corpo restano compilati dal pannello Newsletter.
INSERT INTO public.email_templates (
  name,
  subject,
  html_body,
  trigger_event,
  is_active
)
VALUES (
  'Newsletter (custom)',
  '{{subject}}',
  $html$
<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="background:#ffffff;padding:20px 24px;border:1px solid #e5e7eb;border-bottom:none;border-radius:12px 12px 0 0;text-align:center;">
    <img src="https://www.praticarapida.it/pratica-rapida-logo.png" alt="Pratica Rapida" width="220" style="display:block;width:220px;max-width:100%;height:auto;margin:0 auto;">
  </div>
  <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:none;font-size:15px;line-height:1.6;">
    {{body_html}}
    <div style="margin-top:30px;padding:22px;background:#f3faf6;border:1px solid #cfe8d8;border-radius:10px;text-align:center;">
      <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#14532d;">Vuoi maggiori informazioni o inserire la prima pratica?</p>
      <a href="https://wa.me/390398682691?text=Vorrei%20ricevere%20maggiori%20informazioni" style="display:inline-block;margin:4px;background:#00843D;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700;">Chiedi informazioni</a>
      <a href="https://app.praticarapida.it/enea/nuova" style="display:inline-block;margin:4px;background:#ffffff;color:#00843D;border:1px solid #00843D;padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:700;">Inserisci una pratica</a>
    </div>
  </div>
  <div style="background:#f7f7f7;padding:16px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:12px;line-height:1.6;color:#6b7280;">
    Le risposte a questa email arrivano a modulistica@praticarapida.it.<br>
    Per assistenza puoi anche usare il pulsante “Chiedi informazioni”. · <a href="https://www.praticarapida.it" style="color:#00843D;">praticarapida.it</a><br>
    Non desideri ricevere altri aggiornamenti? <a href="https://wa.me/390398682691?text=Non%20desidero%20ricevere%20altri%20aggiornamenti" style="color:#00843D;">Richiedi la cancellazione</a>.
  </div>
</div>
$html$,
  'newsletter_custom',
  true
)
ON CONFLICT (trigger_event) DO UPDATE SET
  name = EXCLUDED.name,
  subject = EXCLUDED.subject,
  html_body = EXCLUDED.html_body,
  is_active = true;

-- La casella è stata confermata dal Titolare come monitorata.
INSERT INTO public.platform_settings (key, value)
VALUES (
  'email_config',
  '{"email_reply_to":"modulistica@praticarapida.it","email_from_name":"Pratica Rapida"}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  value = COALESCE(public.platform_settings.value, '{}'::jsonb) || EXCLUDED.value;
