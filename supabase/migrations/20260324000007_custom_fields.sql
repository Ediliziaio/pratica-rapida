-- =============================================
-- PRATICA RAPIDA v2.0 — Migration 007
-- Custom Fields (area Admin stile GHL)
-- =============================================

CREATE TYPE public.custom_field_type AS ENUM(
  'text', 'textarea', 'number', 'date', 'boolean',
  'select', 'multi_select', 'email', 'phone', 'url'
);

CREATE TYPE public.custom_field_entity AS ENUM(
  'enea_practice', 'reseller', 'cliente'
);

CREATE TABLE public.custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity custom_field_entity NOT NULL DEFAULT 'enea_practice',
  field_key TEXT NOT NULL,        -- slug interno: es. "first_name", "cf_numero_matricola"
  field_label TEXT NOT NULL,      -- etichetta visibile: es. "Nome", "N° Matricola"
  field_type custom_field_type NOT NULL DEFAULT 'text',
  placeholder TEXT,
  default_value TEXT,
  options JSONB DEFAULT '[]'::jsonb,  -- per select/multi_select: [{"value":"a","label":"A"}]
  is_required BOOLEAN DEFAULT FALSE,
  is_visible_reseller BOOLEAN DEFAULT TRUE,
  is_visible_admin BOOLEAN DEFAULT TRUE,
  order_index INTEGER DEFAULT 0,
  group_name TEXT DEFAULT 'Generale',  -- gruppo/sezione del form
  description TEXT,                     -- tooltip/aiuto
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity, field_key)
);

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_custom_fields_updated_at
  BEFORE UPDATE ON public.custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Internal users manage custom fields"
  ON public.custom_fields FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE POLICY "Authenticated users read custom fields"
  ON public.custom_fields FOR SELECT
  TO authenticated
  USING (true);

-- Valori dei custom fields per ogni pratica/entità
CREATE TABLE public.custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,        -- ID della pratica/rivenditore/cliente
  entity_type custom_field_entity NOT NULL,
  value TEXT,
  value_json JSONB,               -- per multi_select o valori complessi
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(field_id, entity_id)
);

ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_custom_field_values_updated_at
  BEFORE UPDATE ON public.custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Internal users manage custom field values"
  ON public.custom_field_values FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE POLICY "Resellers manage own entity values"
  ON public.custom_field_values FOR ALL
  TO authenticated
  USING (
    entity_id IN (
      SELECT id FROM public.enea_practices
      WHERE reseller_id = public.get_reseller_company_id(auth.uid())
    )
  );

CREATE INDEX idx_custom_field_values_entity ON public.custom_field_values(entity_id, entity_type);
CREATE INDEX idx_custom_fields_entity ON public.custom_fields(entity, order_index);

-- Seed: campi standard ENEA (mappatura GHL-style)
INSERT INTO public.custom_fields (entity, field_key, field_label, field_type, order_index, group_name, is_required) VALUES
  ('enea_practice', 'first_name',        'Nome',                   'text',   1,  'Cliente',  true),
  ('enea_practice', 'last_name',         'Cognome',                'text',   2,  'Cliente',  true),
  ('enea_practice', 'email',             'Email',                  'email',  3,  'Cliente',  false),
  ('enea_practice', 'phone',             'Telefono',               'phone',  4,  'Cliente',  true),
  ('enea_practice', 'address',           'Indirizzo',              'text',   5,  'Cliente',  false),
  ('enea_practice', 'fiscal_code',       'Codice Fiscale',         'text',   6,  'Cliente',  false),
  ('enea_practice', 'brand',             'Brand',                  'select', 7,  'Pratica',  true),
  ('enea_practice', 'product_installed', 'Prodotto Installato',    'text',   8,  'Pratica',  true),
  ('enea_practice', 'supplier',          'Fornitore',              'text',   9,  'Pratica',  false),
  ('enea_practice', 'notes',             'Note',                   'textarea',10,'Pratica',  false),
  ('enea_practice', 'gross_earnings',    'Guadagno Lordo (€)',     'number', 11, 'Gestionale', false),
  ('enea_practice', 'net_earnings',      'Guadagno Netto (€)',     'number', 12, 'Gestionale', false),
  ('enea_practice', 'submission_date',   'Data Invio Pratica',     'date',   13, 'Gestionale', false),
  ('enea_practice', 'internal_notes',    'Note Interne',           'textarea',14,'Gestionale', false),
  ('enea_practice', 'review_stars',      'Stelle Recensione',      'number', 15, 'Recensione', false),
  ('enea_practice', 'review_text',       'Testo Recensione',       'textarea',16,'Recensione', false)
ON CONFLICT (entity, field_key) DO NOTHING;
