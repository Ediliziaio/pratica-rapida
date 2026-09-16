-- SOSPESO: NON ESEGUIRE IN PRODUZIONE E NON ESEGUIRE COME MIGRAZIONE.
-- Vedi docs/REVOPS_ACCESSO_SCHEMA_ONLY.md v0.2: i privilegi ereditati da
-- PUBLIC impediscono di dimostrare l'isolamento richiesto senza un clone.
-- Provisioning temporaneo, da provare prima su staging e poi eseguire soltanto
-- da un amministratore autorizzato. Password e scadenza arrivano da variabili
-- psql locali e non devono mai essere salvate nel repository.

\set ON_ERROR_STOP on
\if :{?auditor_password}
\else
  \echo 'Variabile auditor_password mancante'
  \quit 1
\endif
\if :{?auditor_valid_until}
\else
  \echo 'Variabile auditor_valid_until mancante'
  \quit 1
\endif

BEGIN;

CREATE ROLE revops_schema_auditor
  LOGIN
  PASSWORD :'auditor_password'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS
  CONNECTION LIMIT 1
  VALID UNTIL :'auditor_valid_until';

ALTER ROLE revops_schema_auditor SET default_transaction_read_only = on;
ALTER ROLE revops_schema_auditor SET statement_timeout = '30s';
ALTER ROLE revops_schema_auditor SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE revops_schema_auditor SET search_path = pg_catalog;

REVOKE ALL ON DATABASE postgres FROM revops_schema_auditor;
GRANT CONNECT ON DATABASE postgres TO revops_schema_auditor;
REVOKE ALL ON SCHEMA public FROM revops_schema_auditor;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM revops_schema_auditor;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM revops_schema_auditor;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM revops_schema_auditor;

DO $guard$
DECLARE
  unsafe boolean;
BEGIN
  IF has_schema_privilege('revops_schema_auditor', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'Provisioning negato: USAGE sullo schema public ancora effettivo';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        has_table_privilege('revops_schema_auditor', c.oid, 'SELECT')
        OR has_table_privilege('revops_schema_auditor', c.oid, 'INSERT')
        OR has_table_privilege('revops_schema_auditor', c.oid, 'UPDATE')
        OR has_table_privilege('revops_schema_auditor', c.oid, 'DELETE')
      )
  ) INTO unsafe;

  IF unsafe THEN
    RAISE EXCEPTION 'Provisioning negato: privilegio effettivo su oggetti applicativi';
  END IF;
END
$guard$;

COMMIT;
