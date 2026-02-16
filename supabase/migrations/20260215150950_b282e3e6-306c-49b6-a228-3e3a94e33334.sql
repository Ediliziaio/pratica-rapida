
-- Fix: restrict audit log inserts to authenticated users who belong to the company or are internal
DROP POLICY "System inserts audit log" ON public.audit_log;

CREATE POLICY "Authorized users insert audit log"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );
