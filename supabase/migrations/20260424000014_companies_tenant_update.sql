-- ============================================================
-- Fix A — companies UPDATE policy per tenant
--
-- Problema: ImpostazioniAzienda.tsx chiama supabase.from("companies").update(...)
-- ma la tabella ha solo:
--   [ALL]    Super admin manages companies — solo super_admin
--   [SELECT] Users see assigned companies — tenant read
-- Manca UPDATE per tenant → la pagina "Dati Azienda" falliva silenziosamente
-- (RLS nega, 0 righe aggiornate, nessun errore mostrato all'utente).
--
-- Fix: policy UPDATE per tenant sui propri dati azienda, MA bloccando
-- le colonne amministrative (blocked_at, blocked_by, wallet_balance, brand_type).
-- ============================================================

-- UPDATE solo sulla propria company
CREATE POLICY "Tenants update own company profile"
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (
    id IN (SELECT public.get_user_company_ids(auth.uid()))
  )
  WITH CHECK (
    id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

-- Trigger che impedisce modifiche a colonne admin-only anche se l'UPDATE
-- passa la policy sopra. Le colonne amministrative devono restare
-- modificabili SOLO da super_admin (via "Super admin manages companies").
CREATE OR REPLACE FUNCTION public.protect_companies_admin_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Se super_admin, bypass
  IF public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  -- Bloccare modifica colonne admin
  IF NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.blocked_by IS DISTINCT FROM OLD.blocked_by
     OR NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance
     OR NEW.brand_type IS DISTINCT FROM OLD.brand_type THEN
    RAISE EXCEPTION 'Not authorized to modify admin-only company fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_companies_admin_cols_trg ON public.companies;
CREATE TRIGGER protect_companies_admin_cols_trg
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_companies_admin_cols();
