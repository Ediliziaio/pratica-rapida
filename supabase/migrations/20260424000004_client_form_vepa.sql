-- ── VEPA — Vetrate Panoramiche ─────────────────────────────────────────────
-- Mirrors client_form_infissi minus:
--   • tipologia_infisso           ("tipologia infisso")
--   • trasmittanza_vecchio        ("vetro dell'infisso vecchio")

-- 1. Expand the tipo_modulo CHECK constraint on client_form_tokens
ALTER TABLE client_form_tokens
  DROP CONSTRAINT IF EXISTS client_form_tokens_tipo_modulo_check;

ALTER TABLE client_form_tokens
  ADD CONSTRAINT client_form_tokens_tipo_modulo_check
  CHECK (tipo_modulo IN ('schermature-solari', 'infissi', 'impianto-termico', 'vepa'));

-- 2. VEPA answers table
CREATE TABLE IF NOT EXISTS client_form_vepa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES client_form_tokens(id) ON DELETE CASCADE,
  pratica_id UUID NOT NULL REFERENCES pratiche(id),
  nome_cliente TEXT,
  cognome_cliente TEXT,
  indirizzo_intervento TEXT,
  materiale TEXT,
  numero_infissi INTEGER,
  larghezza_cm NUMERIC,
  altezza_cm NUMERIC,
  trasmittanza_nuovo NUMERIC,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS
ALTER TABLE client_form_vepa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_vepa"
  ON client_form_vepa FOR INSERT WITH CHECK (true);

CREATE POLICY "auth_full_access_vepa"
  ON client_form_vepa FOR ALL
  USING (auth.role() = 'authenticated');
