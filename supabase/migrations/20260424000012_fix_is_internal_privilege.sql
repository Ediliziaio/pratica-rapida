-- ============================================================
-- Fix CRITICAL — is_internal() non deve includere admin_interno
--
-- Problema: `admin_interno` è un ruolo company-level (admin di un'azienda
-- specifica, tenant), NON staff Praticarapida. Ma la funzione is_internal()
-- lo includeva insieme a super_admin e operatore, dando accesso RLS "full"
-- a TUTTE le pratiche/comm_log/storage di TUTTI i tenant.
--
-- Privilege escalation: chiunque con ruolo admin_interno poteva leggere
-- dati di altri tenant.
--
-- Fix: admin_interno rimosso. Resta solo super_admin + operatore =
-- staff effettivo Praticarapida.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_internal(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'operatore')
  )
$$;

COMMENT ON FUNCTION public.is_internal(uuid) IS
  'TRUE solo per staff Praticarapida (super_admin, operatore). admin_interno RIMOSSO — era un privilege escalation bug. admin_interno è un ruolo tenant, non staff.';
