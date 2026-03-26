-- Fix support_tickets RLS policies completely
-- SELECT: allow super_admin, internal users, and genuine company users
DROP POLICY IF EXISTS "Users see own company tickets" ON public.support_tickets;
CREATE POLICY "Users see own company tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.is_internal(auth.uid())
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

-- INSERT: allow super_admin, internal (impersonation), and genuine company users
DROP POLICY IF EXISTS "Company users create tickets" ON public.support_tickets;
CREATE POLICY "Company users create tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'super_admin')
      OR public.is_internal(auth.uid())
      OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
    )
  );

-- UPDATE: super_admin, internal, or the ticket owner
DROP POLICY IF EXISTS "Authorized users update tickets" ON public.support_tickets;
CREATE POLICY "Authorized users update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.is_internal(auth.uid())
    OR user_id = auth.uid()
  );
