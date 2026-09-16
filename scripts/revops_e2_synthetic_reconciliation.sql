-- E2-res: prova esclusivamente sintetica della deduplicazione e delle bozze.
-- Non interroga pratiche o dati reali.
\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

WITH
enea(id, reseller_id, created_at) AS (
  VALUES
    ('00000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '2026-01-01T10:00:00Z'::timestamptz),
    ('00000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '2026-01-02T10:00:00Z'::timestamptz)
),
legacy(id, reseller_id, created_at, stato, submitted_at) AS (
  VALUES
    -- stesso UUID della moderna: deve essere deduplicato
    ('00000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '2026-01-01T10:00:00Z'::timestamptz, 'inviata', '2026-01-01T10:00:00Z'::timestamptz),
    -- legacy nata già inviata: conta alla creazione
    ('00000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '2026-01-03T10:00:00Z'::timestamptz, 'inviata', '2026-01-03T10:00:00Z'::timestamptz),
    -- bozza mai inviata: non conta
    ('00000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '2026-01-04T10:00:00Z'::timestamptz, 'bozza', NULL::timestamptz),
    -- bozza poi inviata: conta alla transizione
    ('00000000-0000-0000-0000-000000000005'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '2026-01-05T10:00:00Z'::timestamptz, 'inviata', '2026-01-08T12:00:00Z'::timestamptz)
),
candidates AS (
  SELECT id, reseller_id, created_at AS valid_at, 'enea_practices'::text AS source_table, 1 AS priority
  FROM enea
  UNION ALL
  SELECT id, reseller_id, submitted_at AS valid_at, 'pratiche'::text AS source_table, 2 AS priority
  FROM legacy
  WHERE stato <> 'bozza' AND submitted_at IS NOT NULL
),
ranked AS (
  SELECT *, row_number() OVER (PARTITION BY id ORDER BY priority) AS rn
  FROM candidates
),
canonical AS (
  SELECT * FROM ranked WHERE rn = 1
)
SELECT
  (SELECT count(*) FROM canonical) = 4 AS canonical_count_ok,
  (SELECT count(*) FROM canonical WHERE id = '00000000-0000-0000-0000-000000000001'::uuid) = 1 AS duplicate_removed,
  NOT EXISTS (
    SELECT 1 FROM canonical WHERE id = '00000000-0000-0000-0000-000000000004'::uuid
  ) AS draft_excluded,
  EXISTS (
    SELECT 1
    FROM canonical
    WHERE id = '00000000-0000-0000-0000-000000000005'::uuid
      AND valid_at = '2026-01-08T12:00:00Z'::timestamptz
  ) AS transition_timestamp_used,
  (SELECT count(*) FROM canonical) = (
    SELECT count(DISTINCT id) FROM candidates
  ) AS reconciliation_zero;

ROLLBACK;
