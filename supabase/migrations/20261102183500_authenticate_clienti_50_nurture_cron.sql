-- Autenticazione forte dell'orologio lead-nurture. La RPC non espone dati e
-- può essere eseguita esclusivamente con una chiave riconosciuta da Supabase
-- nel ruolo service_role.

CREATE OR REPLACE FUNCTION public.authenticate_lead_nurture_cron()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true;
$$;

REVOKE ALL ON FUNCTION public.authenticate_lead_nurture_cron() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authenticate_lead_nurture_cron() FROM anon;
REVOKE ALL ON FUNCTION public.authenticate_lead_nurture_cron() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.authenticate_lead_nurture_cron() TO service_role;
