-- ============================================================
-- Fix Bug integration test — Notifiche rivenditore non arrivano
--
-- Problema scoperto in test: company "Prova Azienda" ha email="" (stringa
-- vuota). Notifica A (docs mancanti) e Notifica C (pratica disponibile)
-- leggono companies.email e non mandano nulla se vuota/null.
--
-- Fix: SECURITY DEFINER function che risolve l'email del rivenditore con
-- fallback intelligente:
-- 1) companies.email se presente
-- 2) email del primo azienda_admin/rivenditore della company
-- 3) NULL (edge function skip)
--
-- Chiamata dalle edge functions on-practice-created / on-stage-changed.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_reseller_contact_email(p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    -- 1) Email diretta della company se valorizzata
    NULLIF(TRIM((SELECT email FROM public.companies WHERE id = p_company_id)), ''),
    -- 2) Fallback: email del primo azienda_admin/rivenditore
    (
      SELECT u.email
      FROM public.user_company_assignments uca
      JOIN auth.users u ON u.id = uca.user_id
      JOIN public.user_roles ur ON ur.user_id = uca.user_id
      WHERE uca.company_id = p_company_id
        AND ur.role IN ('azienda_admin', 'rivenditore', 'admin_interno')
      ORDER BY
        -- priorità: rivenditore > azienda_admin > admin_interno
        CASE ur.role
          WHEN 'rivenditore' THEN 1
          WHEN 'azienda_admin' THEN 2
          WHEN 'admin_interno' THEN 3
        END
      LIMIT 1
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_reseller_contact_email(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_reseller_contact_email(uuid) IS
  'Risolve email di contatto per un company rivenditore con fallback: companies.email > primo azienda_admin/rivenditore della company. Usata da edge functions per Notifica A/B/C.';
