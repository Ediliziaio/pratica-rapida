-- ============================================================
-- Fix D (continuation) — RPC functions per form pubblico anonimo
--
-- Problema: FormPubblico.tsx faceva SELECT/UPDATE su enea_practices
-- come anon user, ma non esiste policy per anon → query restituivano []
-- silenziosamente. Il flusso form pubblico era SEMPRE ROTTO per anon.
--
-- Soluzione: 2 funzioni SECURITY DEFINER che bypassano RLS in modo
-- controllato, accessibili solo tramite form_token (unguessable).
-- ============================================================

-- 1. Load practice by form_token (read path)
CREATE OR REPLACE FUNCTION public.get_practice_by_form_token(p_token text)
RETURNS TABLE (
  id uuid,
  brand text,
  current_stage_id uuid,
  cliente_nome text,
  cliente_cognome text,
  cliente_email text,
  cliente_telefono text,
  cliente_indirizzo text,
  cliente_cf text,
  note text,
  form_compilato_at timestamptz,
  archived_at timestamptz,
  reseller_id uuid,
  reseller_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    ep.id,
    ep.brand::text,
    ep.current_stage_id,
    ep.cliente_nome,
    ep.cliente_cognome,
    ep.cliente_email,
    ep.cliente_telefono,
    ep.cliente_indirizzo,
    ep.cliente_cf,
    ep.note,
    ep.form_compilato_at,
    ep.archived_at,
    ep.reseller_id,
    c.ragione_sociale
  FROM public.enea_practices ep
  LEFT JOIN public.companies c ON c.id = ep.reseller_id
  WHERE ep.form_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_practice_by_form_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_practice_by_form_token(text) IS
  'Public endpoint: carica una pratica tramite form_token per il form pubblico al cliente finale. Include solo dati cliente (no interni).';


-- 2. Submit form by form_token (write path)
CREATE OR REPLACE FUNCTION public.submit_form_by_token(
  p_token text,
  p_cliente_nome text,
  p_cliente_cognome text,
  p_cliente_email text,
  p_cliente_telefono text,
  p_cliente_indirizzo text,
  p_cliente_cf text,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_practice_id uuid;
  v_brand text;
  v_stage_id uuid;
BEGIN
  -- Trova pratica valida (non archiviata, non già compilata)
  SELECT id, brand::text INTO v_practice_id, v_brand
  FROM public.enea_practices
  WHERE form_token = p_token
    AND archived_at IS NULL
    AND form_compilato_at IS NULL
  LIMIT 1;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'Pratica non trovata, archiviata o già compilata'
      USING ERRCODE = 'P0002';
  END IF;

  -- Trova lo stage "pronte_da_fare" di sistema per il brand della pratica
  SELECT id INTO v_stage_id
  FROM public.pipeline_stages
  WHERE reseller_id IS NULL
    AND stage_type = 'pronte_da_fare'
    AND brand = v_brand
  LIMIT 1;

  -- Aggiorna pratica
  UPDATE public.enea_practices
  SET
    cliente_nome = COALESCE(NULLIF(p_cliente_nome, ''), cliente_nome),
    cliente_cognome = COALESCE(NULLIF(p_cliente_cognome, ''), cliente_cognome),
    cliente_email = NULLIF(p_cliente_email, ''),
    cliente_telefono = NULLIF(p_cliente_telefono, ''),
    cliente_indirizzo = NULLIF(p_cliente_indirizzo, ''),
    cliente_cf = NULLIF(p_cliente_cf, ''),
    note = NULLIF(p_note, ''),
    form_compilato_at = now(),
    current_stage_id = COALESCE(v_stage_id, current_stage_id)
  WHERE id = v_practice_id;

  RETURN v_practice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_form_by_token(text, text, text, text, text, text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_form_by_token IS
  'Public endpoint: cliente finale invia form via token. Aggiorna dati cliente + sposta pratica in pronte_da_fare. Fallisce se pratica archiviata/già compilata.';
