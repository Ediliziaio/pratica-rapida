-- =============================================
-- Fix 1: documenti INSERT policy
-- Allow internal users (super_admin, admin_interno, operatore) to upload
-- documents to any company, not just their assigned ones.
-- =============================================
DROP POLICY IF EXISTS "Company users upload documents" ON public.documenti;

CREATE POLICY "Company users upload documents"
  ON public.documenti FOR INSERT TO authenticated
  WITH CHECK (
    public.is_internal(auth.uid())
    OR company_id IN (SELECT public.get_user_company_ids(auth.uid()))
  );

-- =============================================
-- Fix 2: completata_at — accurate billing timestamp
-- =============================================
ALTER TABLE public.pratiche
  ADD COLUMN IF NOT EXISTS completata_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill existing completed practices (use updated_at as approximation)
UPDATE public.pratiche
  SET completata_at = updated_at
  WHERE stato = 'completata' AND completata_at IS NULL;

-- Trigger: auto-set completata_at when stato → 'completata'
CREATE OR REPLACE FUNCTION public.set_completata_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stato = 'completata' AND (OLD.stato IS DISTINCT FROM 'completata') THEN
    NEW.completata_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_completata_at ON public.pratiche;
CREATE TRIGGER trg_set_completata_at
  BEFORE UPDATE ON public.pratiche
  FOR EACH ROW
  EXECUTE FUNCTION public.set_completata_at();
