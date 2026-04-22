-- ============================================================
-- Phase 1: Pipeline double naming + Practice new fields
-- ============================================================

-- 1. pipeline_stages: aggiungi nome rivenditore, tooltip, visibilità rivenditore
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS name_reseller   TEXT,
  ADD COLUMN IF NOT EXISTS tooltip_text    TEXT,
  ADD COLUMN IF NOT EXISTS is_visible_reseller BOOLEAN NOT NULL DEFAULT TRUE;

-- Popola i valori in base allo stage_type
UPDATE pipeline_stages SET
  name_reseller = CASE stage_type
    WHEN 'inviata'              THEN 'In lavorazione'
    WHEN 'attesa_compilazione'  THEN 'In lavorazione'
    WHEN 'documenti_mancanti'   THEN 'Documenti mancanti'
    WHEN 'pronte_da_fare'       THEN 'Trasmissione ad ENEA'
    WHEN 'da_inviare'           THEN 'Pratica inviata'
    WHEN 'gestionale'           THEN NULL
    WHEN 'recensione'           THEN NULL
    WHEN 'archiviate'           THEN 'Archiviate'
    ELSE name
  END,
  tooltip_text = CASE stage_type
    WHEN 'inviata'              THEN 'Abbiamo ricevuto la pratica e stiamo assistendo il cliente nella raccolta dei dati necessari.'
    WHEN 'attesa_compilazione'  THEN 'Abbiamo ricevuto la pratica e stiamo assistendo il cliente nella raccolta dei dati necessari.'
    WHEN 'documenti_mancanti'   THEN 'La pratica necessita di ulteriori documenti. Apri la card per vedere il dettaglio di quanto richiesto.'
    WHEN 'pronte_da_fare'       THEN 'Abbiamo ricevuto tutti i dati necessari e stiamo trasmettendo la pratica al portale ENEA.'
    WHEN 'da_inviare'           THEN 'La pratica è stata completata e inviata al cliente finale. Tra 10 giorni sarà spostata nelle pratiche archiviate.'
    WHEN 'archiviate'           THEN 'Raccoglie tutte le pratiche completate.'
    ELSE NULL
  END,
  is_visible_reseller = CASE stage_type
    WHEN 'gestionale'  THEN FALSE
    WHEN 'recensione'  THEN FALSE
    ELSE TRUE
  END;

-- 2. enea_practices: aggiungi tipo fatturazione e tipo soggetto
ALTER TABLE enea_practices
  ADD COLUMN IF NOT EXISTS tipo_fatturazione TEXT
    CHECK (tipo_fatturazione IN ('rivenditore', 'cliente_finale')),
  ADD COLUMN IF NOT EXISTS tipo_soggetto TEXT
    CHECK (tipo_soggetto IN ('persona_fisica', 'azienda_piva'));

-- Default retroattivo: le pratiche esistenti sono a carico rivenditore
UPDATE enea_practices
  SET tipo_fatturazione = 'rivenditore'
  WHERE tipo_fatturazione IS NULL;

-- 3. enea_practices: campo archivio per path Supabase Storage
ALTER TABLE enea_practices
  ADD COLUMN IF NOT EXISTS archivio_path TEXT;

-- 4. Indice utile per la query di auto-archive (pratiche in da_inviare da >10 giorni)
CREATE INDEX IF NOT EXISTS idx_enea_practices_stage_updated
  ON enea_practices(current_stage_id, updated_at);
