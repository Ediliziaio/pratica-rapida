-- Le email credenziali devono puntare alla pagina di accesso realmente attiva.
-- Il template e' DB-first, quindi aggiorniamo anche la copia gia' in produzione.
UPDATE public.email_templates
SET
  html_body = replace(
    html_body,
    'pannello.praticarapida.it',
    'app.praticarapida.it/auth'
  ),
  updated_at = now()
WHERE trigger_event = 'benvenuto_azienda'
  AND html_body LIKE '%pannello.praticarapida.it%';
