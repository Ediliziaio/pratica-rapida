-- Sostituire __AUDITOR_UUID__ prima dell'esecuzione nella console SQL.
-- La transazione viene sempre annullata: anche un difetto di policy non lascia
-- modifiche persistenti. Qualunque RAISE EXCEPTION chiude il gate.

BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '__AUDITOR_UUID__',
    'role', 'authenticated'
  )::text,
  true
);

DO $$
DECLARE
  target_practice uuid;
  target_reseller uuid;
  target_object_id uuid;
  affected bigint;
BEGIN
  IF NOT public.is_enea_auditor(auth.uid()) THEN
    RAISE EXCEPTION 'auditor_membership_not_effective';
  END IF;

  IF public.is_internal(auth.uid()) THEN
    RAISE EXCEPTION 'auditor_is_internal';
  END IF;

  IF public.get_reseller_company_id(auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'auditor_has_company_scope';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE policyname LIKE 'ENEA auditors%'
      AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'auditor_mutative_policy_exists';
  END IF;

  PERFORM 1 FROM public.enea_practices_public LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'auditor_view_select_failed';
  END IF;

  SELECT id, reseller_id INTO target_practice, target_reseller
  FROM public.enea_practices
  WHERE brand = 'enea'
  ORDER BY created_at DESC
  LIMIT 1;

  IF target_practice IS NULL THEN
    RAISE EXCEPTION 'auditor_select_practice_failed';
  END IF;

  UPDATE public.enea_practices
  SET cliente_nome = cliente_nome
  WHERE id = target_practice;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'auditor_update_was_allowed:%', affected;
  END IF;

  DELETE FROM public.enea_practices
  WHERE id = target_practice;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'auditor_delete_was_allowed:%', affected;
  END IF;

  BEGIN
    INSERT INTO public.enea_practices (
      id, reseller_id, brand, cliente_nome, cliente_cognome
    ) VALUES (
      gen_random_uuid(), target_reseller, 'enea', 'AUDITOR', 'WRITE PROBE'
    );
    RAISE EXCEPTION 'auditor_insert_was_allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT id INTO target_object_id
  FROM storage.objects
  WHERE bucket_id = 'enea-documents'
  ORDER BY created_at DESC
  LIMIT 1;

  IF target_object_id IS NULL THEN
    RAISE EXCEPTION 'auditor_select_storage_failed';
  END IF;

  UPDATE storage.objects
  SET metadata = metadata
  WHERE id = target_object_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'auditor_storage_update_was_allowed:%', affected;
  END IF;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name, metadata)
    VALUES (
      'enea-documents',
      gen_random_uuid()::text || '/auditor-write-probe.pdf',
      '{}'::jsonb
    );
    RAISE EXCEPTION 'auditor_storage_insert_was_allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Supabase Storage protegge anche le DELETE SQL dirette con
  -- storage.protect_delete(). Entrambe le forme di rifiuto sono valide: zero
  -- righe per RLS oppure 42501 dal guard Storage. Qualunque riga cancellata
  -- chiude invece il gate; la transazione viene comunque annullata.
  BEGIN
    DELETE FROM storage.objects
    WHERE id = target_object_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
      RAISE EXCEPTION 'auditor_storage_delete_was_allowed:%', affected;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

ROLLBACK;

SELECT
  'PASS_READ_ONLY_FAIL_CLOSED' AS gate,
  2 AS select_policies,
  0 AS auditor_mutative_policies;
