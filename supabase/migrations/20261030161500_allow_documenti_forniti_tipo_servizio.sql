-- Allinea il vincolo DB al nome usato dall'interfaccia per il servizio
-- "Documenti forniti". Manteniamo anche `pratica_only` per le pratiche
-- storiche e per i client già aperti durante il rilascio.
ALTER TABLE public.enea_practices
  DROP CONSTRAINT IF EXISTS enea_practices_tipo_servizio_check;

ALTER TABLE public.enea_practices
  ADD CONSTRAINT enea_practices_tipo_servizio_check
  CHECK (tipo_servizio IN ('servizio_completo', 'pratica_only', 'documenti_forniti'));
