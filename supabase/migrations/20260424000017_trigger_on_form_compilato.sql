-- ============================================================
-- Fix Bug — Messaggio 3 (form compilato) non parte se frontend fallisce
--
-- Problema: submit_form_by_token RPC sposta lo stage a pronte_da_fare e
-- setta form_compilato_at, ma NON invoca on-stage-changed. Il frontend
-- FormPubblico.tsx invoca l'edge function in modo fire-and-forget dopo
-- la RPC. Se il client ha un network blip fra RPC success e function
-- invoke, Messaggio 3 (email+WA conferma) non parte.
--
-- Fix: DB trigger che invoca on-stage-changed via pg_net.http_post quando
-- form_compilato_at passa da NULL a un timestamp. Server-side, atomico,
-- resiliente al crash del client.
-- ============================================================

-- Trigger function
CREATE OR REPLACE FUNCTION public.trigger_on_form_compilato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_stage_type text;
BEGIN
  -- Fire solo se form_compilato_at passa da NULL → NOT NULL
  IF OLD.form_compilato_at IS NULL AND NEW.form_compilato_at IS NOT NULL THEN
    -- Determina lo stage_type corrente per passarlo alla edge function
    SELECT stage_type::text INTO v_stage_type
    FROM public.pipeline_stages
    WHERE id = NEW.current_stage_id;

    -- Invoke on-stage-changed via pg_net (non-blocking)
    PERFORM net.http_post(
      url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/on-stage-changed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'service_role_key' LIMIT 1
        )
      ),
      body := jsonb_build_object(
        'practice_id', NEW.id,
        'new_stage_type', COALESCE(v_stage_type, 'pronte_da_fare')
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_form_compilato_trigger ON public.enea_practices;

CREATE TRIGGER on_form_compilato_trigger
  AFTER UPDATE OF form_compilato_at ON public.enea_practices
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_form_compilato();

COMMENT ON TRIGGER on_form_compilato_trigger ON public.enea_practices IS
  'Invoca on-stage-changed via pg_net quando form_compilato_at passa da NULL a un timestamp. Garantisce che Messaggio 3 parta anche se il frontend crasha dopo submit_form_by_token.';
