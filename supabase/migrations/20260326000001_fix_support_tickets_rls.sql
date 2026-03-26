-- Fix: allow internal users (admin_interno, operatore) to SELECT support_tickets
-- Previously only super_admin and company users could read tickets,
-- meaning admin_interno could update but never see any tickets.

DROP POLICY IF EXISTS "Users see own company tickets" ON public.support_tickets;

CREATE POLICY "Users see own company tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.is_internal(auth.uid())
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );
