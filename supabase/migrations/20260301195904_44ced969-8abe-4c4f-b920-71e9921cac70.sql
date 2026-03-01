
-- Fix overly permissive policies: since triggers use SECURITY DEFINER they bypass RLS,
-- so we can restore proper policies for direct user inserts

-- audit_log: only internal users should insert directly
DROP POLICY IF EXISTS "Triggers can insert audit log" ON public.audit_log;
CREATE POLICY "Internal users insert audit log"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (is_internal(auth.uid()) OR user_id = auth.uid());

-- notifications: users can only insert for themselves (triggers bypass RLS via SECURITY DEFINER)
DROP POLICY IF EXISTS "Triggers can insert notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
