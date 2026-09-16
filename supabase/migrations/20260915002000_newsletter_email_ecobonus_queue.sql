-- Coda server-side per completare la newsletter Ecobonus 2027.
-- Pubblico congelato: 650 email uniche di aziende + lead rivenditori,
-- meno 197 gia' inviate e 6 indirizzi con dominio palesemente errato.

CREATE TABLE IF NOT EXISTS public.newsletter_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key text NOT NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  source_type text NOT NULL CHECK (source_type IN ('company', 'lead')),
  source_id uuid NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'paused')),
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  sent_at timestamptz,
  resend_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_key, recipient_email)
);

ALTER TABLE public.newsletter_email_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS newsletter_email_queue_campaign_status_idx
  ON public.newsletter_email_queue (campaign_key, status, created_at);

WITH raw AS (
  SELECT
    'company'::text AS source_type,
    id AS source_id,
    ragione_sociale::text AS recipient_name,
    lower(trim(email)) AS recipient_email
  FROM public.companies
  WHERE email IS NOT NULL AND trim(email) <> ''

  UNION ALL

  SELECT
    'lead'::text,
    id,
    btrim(concat_ws(' ', nome, cognome)),
    lower(trim(email))
  FROM public.leads
  WHERE email IS NOT NULL AND trim(email) <> ''
), valid AS (
  SELECT *
  FROM raw
  WHERE recipient_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    AND split_part(recipient_email, '@', 2) NOT IN (
      'gmail.coma', 'gmail.comgmai', 'gmail.con',
      'hormail.it', 'gmail.cqom', 'gmail.comm'
    )
), dedup AS (
  SELECT DISTINCT ON (recipient_email) *
  FROM valid
  ORDER BY recipient_email,
    CASE WHEN source_type = 'company' THEN 0 ELSE 1 END
), remaining AS (
  SELECT d.*
  FROM dedup d
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.email_logs e
    WHERE e.subject = 'Ecobonus 2027 al 65%? Facciamo chiarezza'
      AND e.status = 'sent'
      AND lower(trim(e.to_email)) = d.recipient_email
  )
)
INSERT INTO public.newsletter_email_queue (
  campaign_key, recipient_email, recipient_name, source_type, source_id,
  subject, body_html
)
SELECT
  'ecobonus-2027-20260914',
  recipient_email,
  nullif(recipient_name, ''),
  source_type,
  source_id,
  'Ecobonus 2027 al 65%? Facciamo chiarezza',
  $body$
    <p>Buongiorno,</p>
    <p>nelle ultime ore si è tornati a parlare di un possibile Ecobonus al 65% per alcuni interventi di efficientamento energetico a partire dal 2027.</p>
    <p>È una notizia importante, ma occorre prudenza: al momento si tratta soltanto di un’ipotesi allo studio del Governo, non di una misura già approvata.</p>
    <p>Secondo le anticipazioni, il possibile aumento potrebbe riguardare interventi come infissi, pompe di calore, sistemi ibridi, solare termico, schermature solari e cappotti.</p>
    <p>Abbiamo preparato un breve approfondimento per distinguere ciò che è già previsto dalla normativa da quello che deve ancora essere deciso:</p>
    <p><a href="https://www.praticarapida.it/blog/ecobonus-2027-ipotesi-65-percento" style="color:#00843D;font-weight:700;">Leggi l’articolo</a></p>
    <p>PraticaRapida continua a seguire gli aggiornamenti. Attraverso la nostra area riservata puoi inserire nuove richieste, seguire in tempo reale lo stato delle pratiche affidateci e trovare documenti e ricevute disponibili.</p>
    <p>Il team di PraticaRapida</p>
  $body$
FROM remaining
ON CONFLICT (campaign_key, recipient_email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.process_newsletter_email_campaign()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, vault
AS $function$
DECLARE
  r public.newsletter_email_queue%ROWTYPE;
  queued integer := 0;
BEGIN
  -- Riconcilia prima le risposte delle chiamate asincrone precedenti.
  UPDATE public.newsletter_email_queue q
  SET status = 'sent',
      sent_at = (
        SELECT el.sent_at
        FROM public.email_logs el
        WHERE lower(trim(el.to_email)) = q.recipient_email
          AND el.subject = q.subject
          AND el.status = 'sent'
          AND el.sent_at >= q.locked_at
        ORDER BY el.sent_at DESC
        LIMIT 1
      ),
      resend_id = (
        SELECT el.resend_id
        FROM public.email_logs el
        WHERE lower(trim(el.to_email)) = q.recipient_email
          AND el.subject = q.subject
          AND el.status = 'sent'
          AND el.sent_at >= q.locked_at
        ORDER BY el.sent_at DESC
        LIMIT 1
      ),
      error_message = NULL,
      updated_at = now()
  WHERE q.campaign_key = 'ecobonus-2027-20260914'
    AND q.status = 'processing'
    AND EXISTS (
      SELECT 1
      FROM public.email_logs el
      WHERE lower(trim(el.to_email)) = q.recipient_email
        AND el.subject = q.subject
        AND el.status = 'sent'
        AND el.sent_at >= q.locked_at
    );

  UPDATE public.newsletter_email_queue q
  SET status = CASE WHEN q.attempts >= 3 THEN 'failed' ELSE 'pending' END,
      error_message = 'Invio rifiutato dal provider; vedi email_logs',
      locked_at = NULL,
      updated_at = now()
  WHERE q.campaign_key = 'ecobonus-2027-20260914'
    AND q.status = 'processing'
    AND EXISTS (
      SELECT 1
      FROM public.email_logs el
      WHERE lower(trim(el.to_email)) = q.recipient_email
        AND el.subject = q.subject
        AND el.status = 'failed'
        AND el.sent_at >= q.locked_at
    );

  UPDATE public.newsletter_email_queue q
  SET status = CASE WHEN q.attempts >= 3 THEN 'failed' ELSE 'pending' END,
      error_message = 'Timeout senza esito registrato',
      locked_at = NULL,
      updated_at = now()
  WHERE q.campaign_key = 'ecobonus-2027-20260914'
    AND q.status = 'processing'
    AND q.locked_at < now() - interval '10 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM public.email_logs el
      WHERE lower(trim(el.to_email)) = q.recipient_email
        AND el.subject = q.subject
        AND el.sent_at >= q.locked_at
    );

  FOR r IN
    UPDATE public.newsletter_email_queue q
    SET status = 'processing',
        attempts = attempts + 1,
        locked_at = now(),
        updated_at = now()
    WHERE q.id IN (
      SELECT id
      FROM public.newsletter_email_queue
      WHERE campaign_key = 'ecobonus-2027-20260914'
        AND status = 'pending'
      ORDER BY created_at, recipient_email
      FOR UPDATE SKIP LOCKED
      LIMIT 2
    )
    RETURNING q.*
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'service_role_key'
            LIMIT 1
          )
        ),
        body := jsonb_build_object(
          'to', r.recipient_email,
          'template', 'newsletter_custom',
          'data', jsonb_build_object(
            'subject', r.subject,
            'body_html', r.body_html
          ),
          'idempotency_key',
            'newsletter.ecobonus-2027-20260914.' || md5(r.recipient_email)
        )
      );
      queued := queued + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.newsletter_email_queue
      SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
          error_message = SQLERRM,
          locked_at = NULL,
          updated_at = now()
      WHERE id = r.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'queued', queued,
    'counts', (
      SELECT jsonb_object_agg(status, n)
      FROM (
        SELECT status, count(*) n
        FROM public.newsletter_email_queue
        WHERE campaign_key = 'ecobonus-2027-20260914'
        GROUP BY status
      ) s
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_newsletter_email_campaign() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_newsletter_email_campaign() TO postgres, service_role;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'newsletter-email-ecobonus-2027';

SELECT cron.schedule(
  'newsletter-email-ecobonus-2027',
  '* * * * *',
  'SELECT public.process_newsletter_email_campaign();'
);
