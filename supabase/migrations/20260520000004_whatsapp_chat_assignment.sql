-- ============================================================
-- Assignment chat WhatsApp a utente staff specifico.
--
-- La colonna `assigned_to` su whatsapp_conversations esiste già
-- (migration 20260520000001). Qui aggiungiamo:
--  - RPC per ottenere la lista degli utenti staff assegnabili
--    (super_admin + operatore) con nome leggibile dalla UI
--  - Trigger per generare notifica quando una chat viene assegnata
-- ============================================================

-- RPC: lista internal users assegnabili
CREATE OR REPLACE FUNCTION public.list_chat_assignees()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role app_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_internal(auth.uid()) THEN
    RAISE EXCEPTION 'access denied: internal users only';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    p.id AS user_id,
    u.email::text,
    p.full_name,
    ur.role
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('super_admin', 'operatore')
  ORDER BY p.full_name NULLS LAST, u.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_chat_assignees() TO authenticated;

-- Trigger: notifica l'utente assegnato quando la conversation gli viene
-- assegnata (e l'assegnatario è cambiato — non vogliamo spam su ogni update)
CREATE OR REPLACE FUNCTION public.notify_chat_assigned()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_phone TEXT;
  v_name TEXT;
BEGIN
  -- Skip se assigned_to non è cambiato o se è NULL (unassignment)
  IF NEW.assigned_to IS NULL OR NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;
  -- Skip se sto assegnando a me stesso (caso "prendo in carico")
  IF NEW.assigned_to = auth.uid() THEN
    RETURN NEW;
  END IF;

  v_phone := NEW.phone;
  v_name := COALESCE(NEW.display_name, '+' || v_phone);

  INSERT INTO public.notifications (user_id, tipo, titolo, messaggio, link)
  VALUES (
    NEW.assigned_to,
    'chat_assigned',
    'Chat WhatsApp assegnata',
    'Ti è stata assegnata la chat con ' || v_name,
    '/admin/whatsapp-chat'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_conv_notify_assigned ON public.whatsapp_conversations;
CREATE TRIGGER trg_wa_conv_notify_assigned
  AFTER UPDATE OF assigned_to ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.notify_chat_assigned();

COMMENT ON FUNCTION public.list_chat_assignees() IS
  'Lista utenti staff (super_admin + operatore) assegnabili a una chat WhatsApp.';
