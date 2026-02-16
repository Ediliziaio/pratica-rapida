
-- =============================================
-- PHASE 4: Messages, Notifications
-- =============================================

-- 1. Practice messages (chat)
CREATE TABLE public.practice_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pratica_id UUID NOT NULL REFERENCES public.pratiche(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  messaggio TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.practice_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_practice_messages_pratica ON public.practice_messages(pratica_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.practice_messages;

-- RLS: users in same company or internal can see messages
CREATE POLICY "Users see practice messages"
  ON public.practice_messages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Users send messages"
  ON public.practice_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

-- 2. Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titolo TEXT NOT NULL,
  messaggio TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'info',
  letto BOOLEAN NOT NULL DEFAULT false,
  link TEXT DEFAULT '',
  pratica_id UUID REFERENCES public.pratiche(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, letto) WHERE letto = false;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- RLS: users see only their own notifications
CREATE POLICY "Users see own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- System can insert notifications for any user
CREATE POLICY "Authenticated insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3. Function to create notification on practice state change
CREATE OR REPLACE FUNCTION public.notify_practice_state_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify practice creator
  IF NEW.stato <> OLD.stato THEN
    INSERT INTO public.notifications (user_id, titolo, messaggio, tipo, pratica_id, link)
    VALUES (
      NEW.creato_da,
      'Stato pratica aggiornato',
      'La pratica "' || NEW.titolo || '" è ora in stato: ' || NEW.stato,
      CASE
        WHEN NEW.stato = 'completata' THEN 'success'
        WHEN NEW.stato = 'in_attesa_documenti' THEN 'warning'
        WHEN NEW.stato = 'annullata' THEN 'error'
        ELSE 'info'
      END,
      NEW.id,
      '/pratiche/' || NEW.id
    );
    
    -- Also notify assignee if different from creator
    IF NEW.assegnatario_id IS NOT NULL AND NEW.assegnatario_id <> NEW.creato_da THEN
      INSERT INTO public.notifications (user_id, titolo, messaggio, tipo, pratica_id, link)
      VALUES (
        NEW.assegnatario_id,
        'Stato pratica aggiornato',
        'La pratica "' || NEW.titolo || '" è ora in stato: ' || NEW.stato,
        'info',
        NEW.id,
        '/pratiche/' || NEW.id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_practice_state_change
  AFTER UPDATE OF stato ON public.pratiche
  FOR EACH ROW EXECUTE FUNCTION public.notify_practice_state_change();
