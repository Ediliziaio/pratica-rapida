-- ============================================================
-- Tickets — supporto conversazione thread (non solo Q&A)
--
-- Problemi attuali:
-- 1) support_tickets ha un singolo campo `risposta` → solo 1 round-trip
-- 2) Nessuna email al rivenditore quando staff risponde
-- 3) Cliente non può ribattere dopo la prima risposta
--
-- Fix:
-- - Nuova tabella support_ticket_messages (thread)
-- - Backfill messaggi esistenti (oggetto+descrizione → primo messaggio cliente,
--   risposta → secondo messaggio staff)
-- - Trigger DB che invia email all'altra parte ad ogni nuovo messaggio
-- - Stato ticket riapre quando il cliente ribatte
-- ============================================================

-- 1. Tabella messaggi (thread)
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('client', 'staff')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.support_ticket_messages(ticket_id, created_at);

-- 2. RLS: cliente vede messaggi del proprio ticket (via tenant), staff vede tutti
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant + staff read ticket messages"
  ON public.support_ticket_messages FOR SELECT
  TO authenticated
  USING (
    public.is_internal(auth.uid())
    OR ticket_id IN (
      SELECT id FROM public.support_tickets
      WHERE company_id IN (SELECT public.get_user_company_ids(auth.uid()))
    )
  );

CREATE POLICY "Tenant + staff insert own messages"
  ON public.support_ticket_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (
      (author_role = 'staff' AND public.is_internal(auth.uid()))
      OR (author_role = 'client' AND ticket_id IN (
        SELECT id FROM public.support_tickets
        WHERE company_id IN (SELECT public.get_user_company_ids(auth.uid()))
      ))
    )
  );

-- 3. Backfill messaggi esistenti
-- (a) primo messaggio cliente = oggetto + descrizione
INSERT INTO public.support_ticket_messages (ticket_id, author_user_id, author_role, body, created_at)
SELECT id, user_id, 'client', E'**' || oggetto || E'**\n\n' || COALESCE(descrizione, ''), created_at
FROM public.support_tickets
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_ticket_messages m WHERE m.ticket_id = support_tickets.id
);

-- (b) risposta esistente → messaggio staff (se presente, attribuisce al primo super_admin disponibile)
INSERT INTO public.support_ticket_messages (ticket_id, author_user_id, author_role, body, created_at)
SELECT
  st.id,
  COALESCE(
    (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin' LIMIT 1),
    st.user_id  -- fallback estremo (non dovrebbe accadere)
  ),
  'staff',
  st.risposta,
  COALESCE(st.updated_at, st.created_at)
FROM public.support_tickets st
WHERE st.risposta IS NOT NULL
  AND TRIM(st.risposta) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.support_ticket_messages m
    WHERE m.ticket_id = st.id AND m.author_role = 'staff'
  );

-- 4. Trigger: ad ogni nuovo messaggio invia email all'altra parte + riapre ticket se chiuso
CREATE OR REPLACE FUNCTION public.notify_ticket_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ticket RECORD;
  v_recipient_email text;
  v_recipient_name text;
  v_template text;
  v_subject text;
BEGIN
  SELECT st.*, c.ragione_sociale, c.email AS company_email
  INTO v_ticket
  FROM public.support_tickets st
  LEFT JOIN public.companies c ON c.id = st.company_id
  WHERE st.id = NEW.ticket_id;

  IF NEW.author_role = 'staff' THEN
    -- Risposta staff → notifica cliente (rivenditore)
    -- Email del proprietario del ticket (preferito) o fallback a company.email
    SELECT email INTO v_recipient_email FROM auth.users WHERE id = v_ticket.user_id;
    IF v_recipient_email IS NULL OR TRIM(v_recipient_email) = '' THEN
      v_recipient_email := public.get_reseller_contact_email(v_ticket.company_id);
    END IF;
    v_recipient_name := COALESCE(v_ticket.ragione_sociale, 'Cliente');
    v_template := 'ticket_risposta_staff';
    v_subject := 'Risposta al tuo ticket: ' || v_ticket.oggetto;
  ELSE
    -- Cliente ribatte → notifica staff
    v_recipient_email := 'supporto@praticarapida.it';
    v_recipient_name := 'Team supporto';
    v_template := 'ticket_replica_cliente';
    v_subject := 'Nuova replica ticket: ' || v_ticket.oggetto;

    -- Riapre ticket se era chiuso
    UPDATE public.support_tickets
    SET stato = CASE WHEN stato = 'chiuso' THEN 'in_lavorazione'::ticket_stato ELSE stato END,
        updated_at = now()
    WHERE id = NEW.ticket_id;
  END IF;

  -- Touch updated_at del ticket per ordinamento
  UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;

  -- Invio email via edge function (non-blocking; il job continua se fallisce)
  IF v_recipient_email IS NOT NULL AND TRIM(v_recipient_email) <> '' THEN
    PERFORM net.http_post(
      url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/send-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'service_role_key' LIMIT 1
        )
      ),
      body := jsonb_build_object(
        'to', v_recipient_email,
        'template', v_template,
        'data', jsonb_build_object(
          'nome', v_recipient_name,
          'oggetto', v_ticket.oggetto,
          'messaggio', NEW.body,
          'company', COALESCE(v_ticket.ragione_sociale, ''),
          'subject', v_subject,
          'ticket_link', 'https://app.praticarapida.it/' || CASE WHEN NEW.author_role = 'staff' THEN 'assistenza' ELSE 'admin/ticket' END
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_ticket_message_trigger ON public.support_ticket_messages;
CREATE TRIGGER notify_ticket_message_trigger
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_ticket_message();

COMMENT ON TABLE public.support_ticket_messages IS
  'Thread conversazione ticket. Trigger notify_ticket_message invia email all''altra parte ad ogni messaggio e riapre ticket chiuso se cliente ribatte.';
