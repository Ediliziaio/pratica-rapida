-- ============================================================
-- Phase 2: Pratica ENEA conclusa + Fatture insolute
-- ============================================================

-- 1. enea_practices: file pratica conclusa (caricati da superadmin)
ALTER TABLE enea_practices
  ADD COLUMN IF NOT EXISTS pratica_enea_conclusa_urls TEXT[] DEFAULT '{}';

-- 2. Tabella fatture insolute per rivenditore
CREATE TABLE IF NOT EXISTS fatture_insolute (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  note          TEXT,
  uploaded_by   UUID REFERENCES auth.users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fatture_insolute ENABLE ROW LEVEL SECURITY;

-- Staff (super_admin / operatore) ha accesso completo
CREATE POLICY "fatture_insolute_staff_all" ON fatture_insolute
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'operatore')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'operatore')
    )
  );

-- Rivenditore può solo leggere le proprie fatture
CREATE POLICY "fatture_insolute_reseller_select" ON fatture_insolute
  FOR SELECT TO authenticated
  USING (
    reseller_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- 3. Indice per query frequente per rivenditore
CREATE INDEX IF NOT EXISTS idx_fatture_insolute_reseller
  ON fatture_insolute(reseller_id, uploaded_at DESC);
