-- ============================================================
-- RPC `get_cron_health` — espone l'ultimo run di ogni cron job
-- al frontend (super_admin only).
--
-- Problema: lo schema `cron` non è esposto via PostgREST, quindi le
-- query supabase.from("cron.job") falliscono. Serve un wrapper RPC
-- SECURITY DEFINER per leggere i dati.
--
-- Usato da: src/pages/admin/Integrazioni.tsx (health check page)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_cron_health()
RETURNS TABLE (
  jobname text,
  schedule text,
  active boolean,
  status text,
  start_time timestamptz,
  return_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, pg_catalog
AS $$
BEGIN
  -- Solo super_admin può vedere lo stato dei cron
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'access denied: super_admin required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (j.jobname)
    j.jobname::text,
    j.schedule::text,
    j.active,
    jrd.status::text,
    jrd.start_time,
    COALESCE(jrd.return_message, '')::text
  FROM cron.job j
  LEFT JOIN cron.job_run_details jrd ON jrd.jobid = j.jobid
  ORDER BY j.jobname, jrd.start_time DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_health() TO authenticated;

COMMENT ON FUNCTION public.get_cron_health() IS
  'Health check cron jobs: ultimo run per ogni job. Usato dal pannello admin /admin/integrazioni.';
