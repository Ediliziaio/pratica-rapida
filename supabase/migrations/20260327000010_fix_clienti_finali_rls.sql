-- Fix RLS: allow internal users and super_admin to insert/update clienti_finali and pratiche
-- when acting on behalf of a company (impersonation)

-- ── clienti_finali INSERT ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company users manage own clients" ON public.clienti_finali;
CREATE POLICY "Company users manage own clients"
  ON public.clienti_finali FOR INSERT TO authenticated
  WITH CHECK (
    public.is_internal(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

-- ── clienti_finali UPDATE ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company users update own clients" ON public.clienti_finali;
CREATE POLICY "Company users update own clients"
  ON public.clienti_finali FOR UPDATE TO authenticated
  USING (
    public.is_internal(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

-- ── clienti_finali SELECT ─────────────────────────────────────────────────────
-- Also allow is_internal to see all clienti_finali (needed for search / gestionale)
DROP POLICY IF EXISTS "Users see own company clients" ON public.clienti_finali;
CREATE POLICY "Users see own company clients"
  ON public.clienti_finali FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.is_internal(auth.uid())
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

-- ── pratiche INSERT ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company users create practices" ON public.pratiche;
CREATE POLICY "Company users create practices"
  ON public.pratiche FOR INSERT TO authenticated
  WITH CHECK (
    public.is_internal(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );
