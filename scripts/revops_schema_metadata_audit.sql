-- Audit E1-res/E2-res: solo metadati allowlist, nessuna lettura di record.
\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

-- Identità e garanzie della sessione.
SELECT
  current_user = 'revops_schema_auditor' AS expected_identity,
  current_setting('transaction_read_only')::boolean AS transaction_read_only,
  NOT has_schema_privilege(current_user, 'public', 'USAGE') AS no_public_schema_usage;

-- Tabelle/vista allowlist e relativi tipi di colonna. Nessun accesso ai dati.
SELECT
  n.nspname AS schema_name,
  c.relname AS object_name,
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  a.attnotnull AS not_null
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN (
    'cruscotto_impostazioni',
    'cruscotto_spese',
    'cruscotto_crediti',
    'cruscotto_ricorrenze',
    'pratiche',
    'enea_practices'
  )
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;

-- Policy e grant strutturali, senza definizioni contenenti valori.
SELECT
  n.nspname AS schema_name,
  c.relname AS object_name,
  p.polname AS policy_name,
  p.polcmd AS command,
  p.polpermissive AS permissive,
  md5(COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '')) AS using_hash,
  md5(COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')) AS check_hash
FROM pg_catalog.pg_policy p
JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'cruscotto\_%' ESCAPE '\'
ORDER BY c.relname, p.polname;

-- Metadati della funzione owner; nessuna esecuzione e nessuna stampa del corpo.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
  md5(pg_catalog.pg_get_functiondef(p.oid)) AS definition_hash
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'cruscotto_is_owner';

-- Il ruolo non deve avere privilegi sui dati allowlist.
SELECT
  c.relname AS object_name,
  has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
  has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
  has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update,
  has_table_privilege(current_user, c.oid, 'DELETE') AS can_delete
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'cruscotto_impostazioni',
    'cruscotto_spese',
    'pratiche',
    'enea_practices'
  )
ORDER BY c.relname;

ROLLBACK;
