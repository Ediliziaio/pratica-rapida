-- ============================================================
-- SISTEMA MODULI CLIENTE CON TOKEN UNIVOCI
-- Prompt 1: 4 tabelle + RLS + funzione get_token_info
-- ============================================================

-- Abilita pgcrypto per gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- TABELLA 1: token univoci per ogni modulo cliente
CREATE TABLE IF NOT EXISTS client_form_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pratica_id UUID NOT NULL REFERENCES pratiche(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  tipo_modulo TEXT NOT NULL CHECK (tipo_modulo IN ('schermature-solari', 'infissi', 'impianto-termico')),
  stato TEXT NOT NULL DEFAULT 'pending' CHECK (stato IN ('pending', 'inviato', 'compilato', 'scaduto')),
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  compiled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT now() + interval '30 days',
  reminder_count INTEGER DEFAULT 0,
  last_reminder_at TIMESTAMPTZ
);

-- TABELLA 2: risposte schermature solari
CREATE TABLE IF NOT EXISTS client_form_schermature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES client_form_tokens(id) ON DELETE CASCADE,
  pratica_id UUID NOT NULL REFERENCES pratiche(id),
  nome_cliente TEXT,
  cognome_cliente TEXT,
  indirizzo_intervento TEXT,
  tipologia_schermatura TEXT,
  larghezza_cm NUMERIC,
  altezza_cm NUMERIC,
  colore TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABELLA 3: risposte infissi
CREATE TABLE IF NOT EXISTS client_form_infissi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES client_form_tokens(id) ON DELETE CASCADE,
  pratica_id UUID NOT NULL REFERENCES pratiche(id),
  nome_cliente TEXT,
  cognome_cliente TEXT,
  indirizzo_intervento TEXT,
  tipologia_infisso TEXT,
  materiale TEXT,
  numero_infissi INTEGER,
  larghezza_cm NUMERIC,
  altezza_cm NUMERIC,
  trasmittanza_vecchio NUMERIC,
  trasmittanza_nuovo NUMERIC,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABELLA 4: risposte impianto termico
CREATE TABLE IF NOT EXISTS client_form_impianto_termico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES client_form_tokens(id) ON DELETE CASCADE,
  pratica_id UUID NOT NULL REFERENCES pratiche(id),
  nome_cliente TEXT,
  cognome_cliente TEXT,
  indirizzo_intervento TEXT,
  tipo_impianto_vecchio TEXT,
  tipo_impianto_nuovo TEXT,
  potenza_kw NUMERIC,
  anno_installazione INTEGER,
  classe_energetica TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── RLS ────────────────────────────────────────────────────────────────────

-- client_form_tokens: lettura pubblica, scrittura solo autenticati + update stato
ALTER TABLE client_form_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_tokens"
  ON client_form_tokens FOR SELECT USING (true);

CREATE POLICY "public_update_compilato"
  ON client_form_tokens FOR UPDATE
  USING (true)
  WITH CHECK (stato IN ('compilato'));

CREATE POLICY "auth_full_access_tokens"
  ON client_form_tokens FOR ALL
  USING (auth.role() = 'authenticated');

-- client_form_schermature
ALTER TABLE client_form_schermature ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_schermature"
  ON client_form_schermature FOR INSERT WITH CHECK (true);

CREATE POLICY "auth_full_access_schermature"
  ON client_form_schermature FOR ALL
  USING (auth.role() = 'authenticated');

-- client_form_infissi
ALTER TABLE client_form_infissi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_infissi"
  ON client_form_infissi FOR INSERT WITH CHECK (true);

CREATE POLICY "auth_full_access_infissi"
  ON client_form_infissi FOR ALL
  USING (auth.role() = 'authenticated');

-- client_form_impianto_termico
ALTER TABLE client_form_impianto_termico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_termico"
  ON client_form_impianto_termico FOR INSERT WITH CHECK (true);

CREATE POLICY "auth_full_access_termico"
  ON client_form_impianto_termico FOR ALL
  USING (auth.role() = 'authenticated');

-- ── FUNZIONE helper per pagina pubblica ────────────────────────────────────

CREATE OR REPLACE FUNCTION get_token_info(p_token TEXT)
RETURNS TABLE (
  token_id  UUID,
  pratica_id UUID,
  tipo_modulo TEXT,
  stato TEXT,
  expires_at TIMESTAMPTZ,
  nome_cliente TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id            AS token_id,
    t.pratica_id,
    t.tipo_modulo,
    t.stato,
    t.expires_at,
    COALESCE(cf.nome || ' ' || cf.cognome, p.titolo, '') AS nome_cliente
  FROM client_form_tokens t
  LEFT JOIN pratiche p ON p.id = t.pratica_id
  LEFT JOIN clienti_finali cf ON cf.id = (p.dati_pratica->>'cliente_finale_id')::uuid
  WHERE t.token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION get_token_info(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_token_info(TEXT) TO authenticated;
