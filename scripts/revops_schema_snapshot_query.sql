-- REVOPS: esportazione mediata del solo schema per E1-res/E2-res.
--
-- ESECUZIONE: esclusivamente dal Titolare nel SQL Editor di Supabase.
-- Questa query e' un singolo SELECT su pg_catalog:
-- - non legge righe, conteggi o valori delle tabelle applicative;
-- - non crea, modifica o elimina alcun oggetto;
-- - restituisce una sola cella JSON con metadati e hash strutturali.
--
-- Il risultato puo' essere consegnato a Codex/Claude. Non contiene password,
-- token, URL di connessione, corpi di funzioni o valori economici.

WITH target_relations AS (
  SELECT c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity,
         c.relforcerowsecurity, c.relacl
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (
      c.relname LIKE 'cruscotto\_%' ESCAPE '\'
      OR c.relname IN ('pratiche', 'enea_practices')
    )
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
),
columns_snapshot AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'object', r.relname,
      'position', a.attnum,
      'column', a.attname,
      'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull,
      'identity', a.attidentity,
      'generated', a.attgenerated,
      'default_hash', CASE
        WHEN d.adbin IS NULL THEN NULL
        ELSE md5(pg_catalog.pg_get_expr(d.adbin, d.adrelid))
      END
    ) ORDER BY r.relname, a.attnum
  ) AS value
  FROM target_relations r
  JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid
  LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped
),
relations_snapshot AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'object', r.relname,
      'kind', r.relkind,
      'rls', r.relrowsecurity,
      'force_rls', r.relforcerowsecurity,
      'acl_hash', md5(coalesce(r.relacl::text, '')),
      'anon_select', CASE WHEN pg_catalog.to_regrole('anon') IS NULL THEN NULL
                          ELSE pg_catalog.has_table_privilege('anon', r.oid, 'SELECT') END,
      'authenticated_select', CASE WHEN pg_catalog.to_regrole('authenticated') IS NULL THEN NULL
                                   ELSE pg_catalog.has_table_privilege('authenticated', r.oid, 'SELECT') END,
      'service_role_select', CASE WHEN pg_catalog.to_regrole('service_role') IS NULL THEN NULL
                                  ELSE pg_catalog.has_table_privilege('service_role', r.oid, 'SELECT') END
    ) ORDER BY r.relname
  ) AS value
  FROM target_relations r
),
constraints_snapshot AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'object', r.relname,
      'name', con.conname,
      'type', con.contype,
      'validated', con.convalidated,
      'definition_hash', md5(pg_catalog.pg_get_constraintdef(con.oid, true))
    ) ORDER BY r.relname, con.conname
  ) AS value
  FROM target_relations r
  JOIN pg_catalog.pg_constraint con ON con.conrelid = r.oid
),
indexes_snapshot AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'object', r.relname,
      'name', i.relname,
      'valid', x.indisvalid,
      'ready', x.indisready,
      'unique', x.indisunique,
      'definition_hash', md5(pg_catalog.pg_get_indexdef(x.indexrelid))
    ) ORDER BY r.relname, i.relname
  ) AS value
  FROM target_relations r
  JOIN pg_catalog.pg_index x ON x.indrelid = r.oid
  JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
),
policies_snapshot AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'object', r.relname,
      'name', p.polname,
      'command', p.polcmd,
      'permissive', p.polpermissive,
      'roles_hash', md5(coalesce(p.polroles::text, '')),
      'using_hash', md5(coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '')),
      'check_hash', md5(coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''))
    ) ORDER BY r.relname, p.polname
  ) AS value
  FROM target_relations r
  JOIN pg_catalog.pg_policy p ON p.polrelid = r.oid
),
triggers_snapshot AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'object', r.relname,
      'name', t.tgname,
      'enabled', t.tgenabled,
      'definition_hash', md5(pg_catalog.pg_get_triggerdef(t.oid, true))
    ) ORDER BY r.relname, t.tgname
  ) AS value
  FROM target_relations r
  JOIN pg_catalog.pg_trigger t ON t.tgrelid = r.oid
  WHERE NOT t.tgisinternal
),
functions_snapshot AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', p.proname,
      'identity_arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
      'result_type', pg_catalog.pg_get_function_result(p.oid),
      'language', l.lanname,
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'parallel', p.proparallel,
      'config_hash', md5(coalesce(p.proconfig::text, '')),
      'acl_hash', md5(coalesce(p.proacl::text, '')),
      'definition_hash', md5(pg_catalog.pg_get_functiondef(p.oid)),
      'anon_execute', CASE WHEN pg_catalog.to_regrole('anon') IS NULL THEN NULL
                           ELSE pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') END,
      'authenticated_execute', CASE WHEN pg_catalog.to_regrole('authenticated') IS NULL THEN NULL
                                    ELSE pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') END
    ) ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
  ) AS value
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND (
      p.proname LIKE 'cruscotto\_%' ESCAPE '\'
      OR p.proname IN ('cruscotto_is_owner', 'cruscotto_segnala_pratica_gestionale')
    )
),
enum_groups AS (
  SELECT typ.typname,
         md5(string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder)) AS labels_hash
  FROM pg_catalog.pg_type typ
  JOIN pg_catalog.pg_namespace n ON n.oid = typ.typnamespace
  JOIN pg_catalog.pg_enum e ON e.enumtypid = typ.oid
  WHERE n.nspname = 'public'
    AND EXISTS (
      SELECT 1
      FROM target_relations r
      JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid
      WHERE a.atttypid = typ.oid AND a.attnum > 0 AND NOT a.attisdropped
  )
  GROUP BY typ.typname
),
enums_snapshot AS (
  SELECT jsonb_agg(
    jsonb_build_object('type', typname, 'labels_hash', labels_hash)
    ORDER BY typname
  ) AS value
  FROM enum_groups
)
SELECT jsonb_pretty(jsonb_build_object(
  'snapshot_format', 'revops-schema-metadata-v1',
  'project_ref', 'xmkjrhwmmuzaqjqlvzxm',
  'data_rows_read', false,
  'relations', coalesce((SELECT value FROM relations_snapshot), '[]'::jsonb),
  'columns', coalesce((SELECT value FROM columns_snapshot), '[]'::jsonb),
  'constraints', coalesce((SELECT value FROM constraints_snapshot), '[]'::jsonb),
  'indexes', coalesce((SELECT value FROM indexes_snapshot), '[]'::jsonb),
  'policies', coalesce((SELECT value FROM policies_snapshot), '[]'::jsonb),
  'triggers', coalesce((SELECT value FROM triggers_snapshot), '[]'::jsonb),
  'functions', coalesce((SELECT value FROM functions_snapshot), '[]'::jsonb),
  'enums', coalesce((SELECT value FROM enums_snapshot), '[]'::jsonb)
)) AS revops_schema_snapshot;
