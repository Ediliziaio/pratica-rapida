
-- Fix: restrict notification inserts - only the trigger (via security definer) or the user themselves can insert
DROP POLICY "Authenticated insert notifications" ON public.notifications;

CREATE POLICY "Users insert own notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
