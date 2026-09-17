-- Espone al solo titolare del token l'indicatore necessario per mostrare
-- correttamente il totale di collaudo. Non espone note, scadenze o regole interne.

DROP FUNCTION IF EXISTS public.get_practice_by_form_token(text);
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
  reseller_name text,
  prodotto_installato text,
  dati_form jsonb,
  tipo_fatturazione text,
  pagamento_stato text,
  payment_required boolean,
  payment_status text,
  payment_url text,
  payment_is_test boolean
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
    c.ragione_sociale,
    ep.prodotto_installato,
    COALESCE(ep.dati_form, '{}'::jsonb),
    ep.tipo_fatturazione,
    ep.pagamento_stato::text,
    ep.tipo_fatturazione = 'cliente_finale'
      OR (
        COALESCE((SELECT (ps.value->>'enabled')::boolean
                  FROM public.platform_settings ps
                  WHERE ps.key = 'fic_tspay_rollout'), false)
        AND lower(COALESCE(ep.dati_form->'catastali'->>'recupero_richiesto', 'false')) IN ('true', '1', 'si', 'sì', 'yes')
      ),
    po.status,
    po.fic_document_url,
    COALESCE(po.is_test_payment, test_override.practice_id IS NOT NULL)
  FROM public.enea_practices ep
  LEFT JOIN public.companies c ON c.id = ep.reseller_id
  LEFT JOIN public.cf_payment_orders po ON po.practice_id = ep.id
  LEFT JOIN public.cf_payment_test_overrides test_override
    ON test_override.practice_id = ep.id
   AND test_override.enabled = true
   AND (test_override.consumed_at IS NOT NULL OR test_override.expires_at > now())
  WHERE ep.form_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_practice_by_form_token(text) TO anon, authenticated;

-- La pagina /paga/:token deve poter conoscere soltanto l'interruttore di
-- rollout per reindirizzare i vecchi link Stripe al nuovo modulo.
DROP POLICY IF EXISTS "Anon reads public pricing" ON public.platform_settings;
CREATE POLICY "Anon reads public pricing"
  ON public.platform_settings FOR SELECT TO anon
  USING (key IN (
    'prezzo_privato_enea',
    'prezzo_cf_standard',
    'prezzo_cf_sima_home',
    'prezzo_servizio_catastale',
    'fic_tspay_rollout'
  ));
