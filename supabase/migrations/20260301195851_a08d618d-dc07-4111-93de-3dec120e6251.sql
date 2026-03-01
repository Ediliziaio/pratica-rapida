
-- Indexes for audit_log performance
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_company_id ON public.audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);

-- Trigger: auto-insert audit_log on pratica stato change
CREATE OR REPLACE FUNCTION public.audit_pratica_stato_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.stato IS DISTINCT FROM NEW.stato THEN
    INSERT INTO public.audit_log (azione, user_id, company_id, pratica_id, dettagli)
    VALUES (
      'cambio_stato_pratica',
      auth.uid(),
      NEW.company_id,
      NEW.id,
      jsonb_build_object('stato_precedente', OLD.stato, 'stato_nuovo', NEW.stato, 'titolo', NEW.titolo)
    );
  END IF;

  -- Audit assegnatario change
  IF OLD.assegnatario_id IS DISTINCT FROM NEW.assegnatario_id AND NEW.assegnatario_id IS NOT NULL THEN
    INSERT INTO public.audit_log (azione, user_id, company_id, pratica_id, dettagli)
    VALUES (
      'assegnazione_operatore',
      auth.uid(),
      NEW.company_id,
      NEW.id,
      jsonb_build_object('assegnatario_precedente', OLD.assegnatario_id, 'assegnatario_nuovo', NEW.assegnatario_id, 'titolo', NEW.titolo)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_pratica_stato_change
AFTER UPDATE ON public.pratiche
FOR EACH ROW
EXECUTE FUNCTION public.audit_pratica_stato_change();

-- Trigger: notify operator when assigned to a pratica
CREATE OR REPLACE FUNCTION public.notify_operator_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.assegnatario_id IS DISTINCT FROM NEW.assegnatario_id AND NEW.assegnatario_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, titolo, messaggio, tipo, pratica_id, link)
    VALUES (
      NEW.assegnatario_id,
      'Pratica assegnata a te',
      'Ti è stata assegnata la pratica "' || NEW.titolo || '"',
      'info',
      NEW.id,
      '/pratiche/' || NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_operator_assignment
AFTER UPDATE ON public.pratiche
FOR EACH ROW
EXECUTE FUNCTION public.notify_operator_assignment();

-- Trigger: notify all internal users when a new pratica is submitted (stato = 'inviata')
CREATE OR REPLACE FUNCTION public.notify_internals_new_pratica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _internal_user RECORD;
BEGIN
  -- On INSERT with stato='inviata' or UPDATE changing stato to 'inviata'
  IF (TG_OP = 'INSERT' AND NEW.stato = 'inviata') OR
     (TG_OP = 'UPDATE' AND OLD.stato IS DISTINCT FROM NEW.stato AND NEW.stato = 'inviata') THEN
    FOR _internal_user IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.role IN ('super_admin', 'admin_interno', 'operatore')
    LOOP
      INSERT INTO public.notifications (user_id, titolo, messaggio, tipo, pratica_id, link)
      VALUES (
        _internal_user.user_id,
        'Nuova pratica inviata',
        'È stata inviata una nuova pratica: "' || NEW.titolo || '"',
        'info',
        NEW.id,
        '/admin/pratiche'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_internals_new_pratica_insert
AFTER INSERT ON public.pratiche
FOR EACH ROW
EXECUTE FUNCTION public.notify_internals_new_pratica();

CREATE TRIGGER trg_notify_internals_new_pratica_update
AFTER UPDATE ON public.pratiche
FOR EACH ROW
EXECUTE FUNCTION public.notify_internals_new_pratica();

-- Allow audit_log inserts from triggers (SECURITY DEFINER bypasses RLS, but we need a permissive policy for trigger-inserted rows)
-- The existing INSERT policy requires user_id = auth.uid(), but triggers use SECURITY DEFINER
-- We need to add a permissive policy for internal functions
CREATE POLICY "Triggers can insert audit log"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Drop the restrictive insert policy that blocks triggers
DROP POLICY IF EXISTS "Authorized users insert audit log" ON public.audit_log;

-- Similarly for notifications, triggers need to insert for other users
-- Current policy: user_id = auth.uid() which blocks trigger inserts for other users
-- Add permissive policy
CREATE POLICY "Triggers can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Drop restrictive policy
DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;

-- Enable realtime for audit_log
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
