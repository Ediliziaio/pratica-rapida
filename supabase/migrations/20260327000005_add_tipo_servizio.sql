-- Aggiunge il campo tipo_servizio a enea_practices
-- Valori: 'servizio_completo' (PR pensa a tutto) | 'pratica_only' (rivenditore fornisce docs)
ALTER TABLE enea_practices
  ADD COLUMN IF NOT EXISTS tipo_servizio TEXT
    CHECK (tipo_servizio IN ('servizio_completo', 'pratica_only'))
    DEFAULT 'pratica_only';

COMMENT ON COLUMN enea_practices.tipo_servizio IS
  'servizio_completo = Pratica Rapida raccoglie docs e contatta cliente; pratica_only = rivenditore fornisce tutto';
