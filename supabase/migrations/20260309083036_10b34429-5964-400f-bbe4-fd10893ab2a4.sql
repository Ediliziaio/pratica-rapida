
-- #4 Fix: Allow internal users to send messages on any practice
DROP POLICY IF EXISTS "Users send messages" ON public.practice_messages;
CREATE POLICY "Users send messages"
ON public.practice_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND (
    is_internal(auth.uid()) OR
    company_id IN (SELECT get_user_company_ids(auth.uid()))
  )
);
