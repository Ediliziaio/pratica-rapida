-- SOSPESO: materiale di progettazione, non eseguire in produzione.
-- Revoca dell'identità temporanea. Eseguire solo su database isolato.
\set ON_ERROR_STOP on

ALTER ROLE revops_schema_auditor NOLOGIN;

SELECT pg_catalog.pg_terminate_backend(pid)
FROM pg_catalog.pg_stat_activity
WHERE usename = 'revops_schema_auditor'
  AND pid <> pg_catalog.pg_backend_pid();

DROP OWNED BY revops_schema_auditor;
DROP ROLE revops_schema_auditor;

SELECT NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'revops_schema_auditor'
) AS credential_revoked;
