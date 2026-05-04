-- ============================================================
-- Form modules — gestione visuale moduli del form pubblico cliente
--
-- Permette al super_admin di creare/modificare/eliminare i moduli
-- (ENEA Infissi / ENEA Schermature / ENEA Impianto / Conto Termico ...)
-- senza toccare il codice. FormPubblico legge lo schema dal DB con
-- fallback al codice hardcoded esistente per backward compat.
--
-- Schema JSONB pratico:
-- {
--   "steps": [
--     {
--       "key": "richiedente",
--       "label": "Dati richiedente",
--       "fields": [
--         {
--           "key": "nome",
--           "label": "Nome",
--           "type": "text" | "number" | "date" | "email" | "phone" | "boolean"
--                   | "select" | "textarea" | "upload" | "array",
--           "required": true,
--           "placeholder": "...",
--           "help_text": "...",
--           "options": [{"value":"x","label":"X"}],   -- per select
--           "visible_if": {"field": "altro_field", "equals": "valore"},  -- condizionale
--           "min": 0, "max": 100,                      -- per number
--           "max_size_mb": 20,                         -- per upload
--           "accept": ["pdf","jpg"],                   -- per upload
--           "item_template": { ... }                   -- per array (template di sub-fields)
--         }
--       ]
--     }
--   ]
-- }
-- ============================================================

CREATE TABLE IF NOT EXISTS public.form_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,                  -- es. "enea-infissi", "enea-schermature"
  name TEXT NOT NULL,                          -- es. "ENEA — Infissi"
  description TEXT,
  prodotto_match TEXT[] DEFAULT ARRAY[]::text[],  -- array di pattern lower-case (es. ["infiss","serramenti"])
  schema JSONB NOT NULL DEFAULT '{"steps":[]}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_modules_slug ON public.form_modules(slug);
CREATE INDEX IF NOT EXISTS idx_form_modules_active ON public.form_modules(is_active, order_index);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_form_modules_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS form_modules_updated_at ON public.form_modules;
CREATE TRIGGER form_modules_updated_at
  BEFORE UPDATE ON public.form_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_form_modules_updated_at();

-- RLS
ALTER TABLE public.form_modules ENABLE ROW LEVEL SECURITY;

-- Tutti gli utenti (incluso anon — per il form pubblico) leggono i moduli ATTIVI
CREATE POLICY "Public read active form_modules"
  ON public.form_modules FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Solo super_admin scrive (CRUD completo)
CREATE POLICY "Super admin manage form_modules"
  ON public.form_modules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

COMMENT ON TABLE public.form_modules IS
  'Moduli del form pubblico cliente, gestibili dal super_admin via /admin/moduli senza toccare codice. FormPubblico legge schema con fallback al codice TS hardcoded.';

-- ============================================================
-- Seed dei 3 moduli ENEA esistenti (riproduce le 7 sezioni + variante)
-- Source of truth attuale: src/types/form-cliente.ts + src/components/form-cliente/Steps.tsx
-- Idempotente: ON CONFLICT (slug) DO NOTHING
-- ============================================================

INSERT INTO public.form_modules (slug, name, description, prodotto_match, order_index, schema)
VALUES
  -- ── Modulo INFISSI ──────────────────────────────────────────
  ('enea-infissi',
   'ENEA — Infissi / Serramenti',
   'Form pubblico cliente per pratiche ENEA con sostituzione infissi',
   ARRAY['infiss','serrament'],
   100,
   $json${
  "steps": [
    {
      "key": "richiedente",
      "label": "Dati richiedente",
      "fields": [
        {"key":"nome","label":"Nome","type":"text","required":true},
        {"key":"cognome","label":"Cognome","type":"text","required":true},
        {"key":"comune_nascita","label":"Comune di nascita","type":"text","required":true},
        {"key":"provincia_nascita","label":"Provincia di nascita","type":"text","required":true},
        {"key":"data_nascita","label":"Data di nascita","type":"date","required":true},
        {"key":"cf","label":"Codice fiscale","type":"text","required":true,"help_text":"16 caratteri formato italiano"},
        {"key":"email","label":"Email di riferimento","type":"email","required":true},
        {"key":"telefono","label":"Telefono di riferimento","type":"phone","required":true},
        {"key":"abitazione_principale","label":"La casa dove sono stati fatti i lavori è l'abitazione principale?","type":"boolean","required":true}
      ]
    },
    {
      "key": "residenza",
      "label": "Indirizzo di residenza",
      "fields": [
        {"key":"comune","label":"Comune di residenza","type":"text","required":true},
        {"key":"provincia","label":"Provincia di residenza","type":"text","required":true},
        {"key":"indirizzo","label":"Indirizzo di residenza","type":"text","required":true},
        {"key":"civico","label":"Numero civico","type":"text","required":true},
        {"key":"cap","label":"CAP","type":"text","required":true},
        {"key":"stesso_indirizzo_lavori","label":"L'appartamento dei lavori è lo stesso della residenza?","type":"boolean","required":true}
      ]
    },
    {
      "key": "appartamento_lavori",
      "label": "Appartamento dei lavori",
      "visible_if": {"path":"residenza.stesso_indirizzo_lavori","equals":false},
      "fields": [
        {"key":"comune","label":"Comune","type":"text","required":true},
        {"key":"provincia","label":"Provincia","type":"text","required":true},
        {"key":"indirizzo","label":"Indirizzo","type":"text","required":true},
        {"key":"numero","label":"Numero civico","type":"text","required":true},
        {"key":"cap","label":"CAP","type":"text","required":true}
      ]
    },
    {
      "key": "cointestazione",
      "label": "Cointestazione",
      "fields": [
        {"key":"presente","label":"La pratica è cointestata?","type":"boolean","required":true},
        {"key":"nome","label":"Nome cointestatario","type":"text","visible_if":{"path":"cointestazione.presente","equals":true},"required":true},
        {"key":"cognome","label":"Cognome cointestatario","type":"text","visible_if":{"path":"cointestazione.presente","equals":true},"required":true},
        {"key":"cf","label":"CF cointestatario","type":"text","visible_if":{"path":"cointestazione.presente","equals":true},"required":true}
      ]
    },
    {
      "key": "catastali",
      "label": "Dati catastali",
      "fields": [
        {"key":"foglio","label":"Foglio","type":"text"},
        {"key":"mappale","label":"Mappale o particella","type":"text"},
        {"key":"subalterno","label":"Subalterno","type":"text"},
        {"key":"recupero_richiesto","label":"Non li ho — voglio che li recuperate voi (+€10)","type":"boolean"},
        {"key":"proprietario_nome","label":"Nome proprietario casa","type":"text","visible_if":{"path":"catastali.recupero_richiesto","equals":true}},
        {"key":"proprietario_cognome","label":"Cognome proprietario","type":"text","visible_if":{"path":"catastali.recupero_richiesto","equals":true}},
        {"key":"proprietario_cf","label":"CF proprietario","type":"text","visible_if":{"path":"catastali.recupero_richiesto","equals":true}}
      ]
    },
    {
      "key": "edificio",
      "label": "Dati edificio",
      "fields": [
        {"key":"anno_costruzione","label":"Anno di costruzione","type":"number","required":true,"help_text":"Anche presunto"},
        {"key":"superficie_mq","label":"Superficie appartamento (mq)","type":"number","required":true},
        {"key":"numero_appartamenti","label":"Numero appartamenti edificio","type":"number","required":true},
        {"key":"titolo_richiedente","label":"Titolo del richiedente","type":"select","required":true,"options":[
          {"value":"proprietario_o_comproprietario","label":"Proprietario / comproprietario"},
          {"value":"detentore_o_affittuario","label":"Detentore / affittuario"},
          {"value":"familiare_o_convivente","label":"Familiare / convivente"}
        ]},
        {"key":"tipologia","label":"Tipologia edificio","type":"select","required":true,"options":[
          {"value":"casa_singola_o_plurifamiliare","label":"Casa singola o plurifamiliare"},
          {"value":"edificio_fino_3_piani","label":"Edificio fino a 3 piani"},
          {"value":"edificio_oltre_3_piani","label":"Edificio oltre 3 piani (4+)"},
          {"value":"edificio_industriale_o_commerciale","label":"Edificio industriale o commerciale"}
        ]}
      ]
    },
    {
      "key": "impianto",
      "label": "Impianto termico",
      "fields": [
        {"key":"tipo","label":"Tipo impianto","type":"select","required":true,"options":[
          {"value":"autonomo","label":"Autonomo"},
          {"value":"centralizzato","label":"Centralizzato"},
          {"value":"centralizzato_con_termostato","label":"Centralizzato con termostato"}
        ]},
        {"key":"terminali","label":"Terminali di erogazione","type":"select","required":true,"options":[
          {"value":"caloriferi","label":"Caloriferi"},
          {"value":"riscaldamento_pavimento","label":"Riscaldamento a pavimento"},
          {"value":"split","label":"Split"}
        ]},
        {"key":"combustibile","label":"Combustibile","type":"select","required":true,"options":[
          {"value":"energia_elettrica","label":"Energia elettrica"},
          {"value":"gas_metano","label":"Gas metano"},
          {"value":"gpl","label":"GPL"},
          {"value":"gasolio","label":"Gasolio"},
          {"value":"teleriscaldamento","label":"Teleriscaldamento"}
        ]},
        {"key":"tipo_caldaia","label":"Tipo caldaia","type":"select","required":true,"options":[
          {"value":"acqua_calda_standard","label":"Acqua calda standard"},
          {"value":"gas_a_condensazione","label":"Gas a condensazione"},
          {"value":"impianto_geotermico","label":"Impianto geotermico"},
          {"value":"caldaia_a_gpl","label":"Caldaia a GPL"},
          {"value":"energia_elettrica","label":"Energia elettrica"},
          {"value":"altro","label":"Altro"}
        ]},
        {"key":"aria_condizionata","label":"Aria condizionata","type":"boolean","required":true}
      ]
    },
    {
      "key": "prodotto",
      "label": "Dati infissi",
      "fields": [
        {"key":"materiale_vecchi","label":"Materiale infissi vecchi","type":"select","options":[
          {"value":"legno","label":"Legno"},{"value":"pvc","label":"PVC"},{"value":"metallo","label":"Metallo"}
        ]},
        {"key":"vetro_vecchi","label":"Vetro infissi vecchi","type":"select","options":[
          {"value":"singolo","label":"Singolo"},{"value":"doppio","label":"Doppio"},{"value":"triplo","label":"Triplo"}
        ]},
        {"key":"materiale_nuovi","label":"Materiale nuovi infissi","type":"select","options":[
          {"value":"legno","label":"Legno"},{"value":"pvc","label":"PVC"},{"value":"metallo","label":"Metallo"}
        ]},
        {"key":"vetro_nuovi","label":"Vetro nuovi infissi","type":"select","options":[
          {"value":"singolo","label":"Singolo"},{"value":"doppio","label":"Doppio"},{"value":"triplo","label":"Triplo"}
        ]},
        {"key":"zanzariere_tapparelle_persiane","label":"Sono state montate zanzariere/tapparelle/persiane?","type":"boolean"}
      ]
    }
  ]
}$json$::jsonb),

  -- ── Modulo SCHERMATURE ──────────────────────────────────────
  ('enea-schermature',
   'ENEA — Schermature solari',
   'Form pubblico cliente per pratiche ENEA con schermature solari (tende, pergotende, pergole)',
   ARRAY['schermat','tend','pergot'],
   200,
   $json${
  "steps": [
    {"key":"richiedente","label":"Dati richiedente","fields":[
      {"key":"nome","label":"Nome","type":"text","required":true},
      {"key":"cognome","label":"Cognome","type":"text","required":true},
      {"key":"comune_nascita","label":"Comune di nascita","type":"text","required":true},
      {"key":"provincia_nascita","label":"Provincia di nascita","type":"text","required":true},
      {"key":"data_nascita","label":"Data di nascita","type":"date","required":true},
      {"key":"cf","label":"Codice fiscale","type":"text","required":true},
      {"key":"email","label":"Email","type":"email","required":true},
      {"key":"telefono","label":"Telefono","type":"phone","required":true},
      {"key":"abitazione_principale","label":"Abitazione principale?","type":"boolean","required":true}
    ]},
    {"key":"residenza","label":"Indirizzo di residenza","fields":[
      {"key":"comune","label":"Comune","type":"text","required":true},
      {"key":"provincia","label":"Provincia","type":"text","required":true},
      {"key":"indirizzo","label":"Indirizzo","type":"text","required":true},
      {"key":"civico","label":"Civico","type":"text","required":true},
      {"key":"cap","label":"CAP","type":"text","required":true},
      {"key":"stesso_indirizzo_lavori","label":"Stesso indirizzo dei lavori?","type":"boolean","required":true}
    ]},
    {"key":"appartamento_lavori","label":"Appartamento dei lavori","visible_if":{"path":"residenza.stesso_indirizzo_lavori","equals":false},"fields":[
      {"key":"comune","label":"Comune","type":"text","required":true},
      {"key":"provincia","label":"Provincia","type":"text","required":true},
      {"key":"indirizzo","label":"Indirizzo","type":"text","required":true},
      {"key":"numero","label":"Numero","type":"text","required":true},
      {"key":"cap","label":"CAP","type":"text","required":true}
    ]},
    {"key":"cointestazione","label":"Cointestazione","fields":[
      {"key":"presente","label":"Pratica cointestata?","type":"boolean","required":true},
      {"key":"nome","label":"Nome cointestatario","type":"text","visible_if":{"path":"cointestazione.presente","equals":true},"required":true},
      {"key":"cognome","label":"Cognome cointestatario","type":"text","visible_if":{"path":"cointestazione.presente","equals":true},"required":true},
      {"key":"cf","label":"CF cointestatario","type":"text","visible_if":{"path":"cointestazione.presente","equals":true},"required":true}
    ]},
    {"key":"catastali","label":"Dati catastali","fields":[
      {"key":"foglio","label":"Foglio","type":"text"},
      {"key":"mappale","label":"Mappale","type":"text"},
      {"key":"subalterno","label":"Subalterno","type":"text"},
      {"key":"recupero_richiesto","label":"Recupero catastale (+€10)","type":"boolean"},
      {"key":"proprietario_nome","label":"Nome proprietario","type":"text","visible_if":{"path":"catastali.recupero_richiesto","equals":true}},
      {"key":"proprietario_cognome","label":"Cognome proprietario","type":"text","visible_if":{"path":"catastali.recupero_richiesto","equals":true}},
      {"key":"proprietario_cf","label":"CF proprietario","type":"text","visible_if":{"path":"catastali.recupero_richiesto","equals":true}}
    ]},
    {"key":"edificio","label":"Edificio","fields":[
      {"key":"anno_costruzione","label":"Anno costruzione","type":"number","required":true},
      {"key":"superficie_mq","label":"Superficie mq","type":"number","required":true},
      {"key":"numero_appartamenti","label":"N. appartamenti","type":"number","required":true},
      {"key":"titolo_richiedente","label":"Titolo richiedente","type":"select","required":true,"options":[
        {"value":"proprietario_o_comproprietario","label":"Proprietario / comproprietario"},
        {"value":"detentore_o_affittuario","label":"Detentore / affittuario"},
        {"value":"familiare_o_convivente","label":"Familiare / convivente"}
      ]},
      {"key":"tipologia","label":"Tipologia edificio","type":"select","required":true,"options":[
        {"value":"casa_singola_o_plurifamiliare","label":"Casa singola o plurifamiliare"},
        {"value":"edificio_fino_3_piani","label":"Edificio fino a 3 piani"},
        {"value":"edificio_oltre_3_piani","label":"Edificio oltre 3 piani"},
        {"value":"edificio_industriale_o_commerciale","label":"Industriale / commerciale"}
      ]}
    ]},
    {"key":"impianto","label":"Impianto termico","fields":[
      {"key":"tipo","label":"Tipo","type":"select","required":true,"options":[
        {"value":"autonomo","label":"Autonomo"},{"value":"centralizzato","label":"Centralizzato"},{"value":"centralizzato_con_termostato","label":"Centralizzato con termostato"}
      ]},
      {"key":"terminali","label":"Terminali","type":"select","required":true,"options":[
        {"value":"caloriferi","label":"Caloriferi"},{"value":"riscaldamento_pavimento","label":"Riscaldamento a pavimento"},{"value":"split","label":"Split"}
      ]},
      {"key":"combustibile","label":"Combustibile","type":"select","required":true,"options":[
        {"value":"energia_elettrica","label":"Energia elettrica"},{"value":"gas_metano","label":"Gas metano"},{"value":"gpl","label":"GPL"},{"value":"gasolio","label":"Gasolio"},{"value":"teleriscaldamento","label":"Teleriscaldamento"}
      ]},
      {"key":"tipo_caldaia","label":"Tipo caldaia","type":"select","required":true,"options":[
        {"value":"acqua_calda_standard","label":"Acqua calda standard"},{"value":"gas_a_condensazione","label":"Gas a condensazione"},{"value":"impianto_geotermico","label":"Impianto geotermico"},{"value":"caldaia_a_gpl","label":"Caldaia a GPL"},{"value":"energia_elettrica","label":"Energia elettrica"},{"value":"altro","label":"Altro"}
      ]},
      {"key":"aria_condizionata","label":"Aria condizionata","type":"boolean","required":true}
    ]},
    {"key":"prodotto","label":"Schermature solari (lista)","fields":[
      {"key":"schermature","label":"Aggiungi una schermatura per ogni installazione","type":"array","required":true,"item_template":{
        "fields":[
          {"key":"tipo_prodotto","label":"Tipo prodotto","type":"select","required":true,"options":[
            {"value":"tende_da_sole","label":"Tende da sole"},
            {"value":"pergotenda","label":"Pergotenda"},
            {"value":"pergola","label":"Pergola"},
            {"value":"altro","label":"Altro"}
          ]},
          {"key":"direzione","label":"Direzione","type":"select","required":true,"options":[
            {"value":"sud","label":"Sud"},{"value":"sud_est","label":"Sud-Est"},{"value":"sud_ovest","label":"Sud-Ovest"},
            {"value":"est","label":"Est"},{"value":"ovest","label":"Ovest"}
          ]}
        ]
      }}
    ]}
  ]
}$json$::jsonb),

  -- ── Modulo IMPIANTO TERMICO ─────────────────────────────────
  ('enea-impianto-termico',
   'ENEA — Impianto termico / Pompa di calore',
   'Form pubblico cliente per pratiche ENEA con sostituzione impianto termico o pompa di calore',
   ARRAY['termico','pompa','calor','caldaia'],
   300,
   $json${
  "steps": [
    {"key":"richiedente","label":"Dati richiedente","fields":[
      {"key":"nome","label":"Nome","type":"text","required":true},
      {"key":"cognome","label":"Cognome","type":"text","required":true},
      {"key":"comune_nascita","label":"Comune di nascita","type":"text","required":true},
      {"key":"provincia_nascita","label":"Provincia di nascita","type":"text","required":true},
      {"key":"data_nascita","label":"Data di nascita","type":"date","required":true},
      {"key":"cf","label":"Codice fiscale","type":"text","required":true},
      {"key":"email","label":"Email","type":"email","required":true},
      {"key":"telefono","label":"Telefono","type":"phone","required":true},
      {"key":"abitazione_principale","label":"Abitazione principale?","type":"boolean","required":true}
    ]},
    {"key":"residenza","label":"Indirizzo di residenza","fields":[
      {"key":"comune","label":"Comune","type":"text","required":true},
      {"key":"provincia","label":"Provincia","type":"text","required":true},
      {"key":"indirizzo","label":"Indirizzo","type":"text","required":true},
      {"key":"civico","label":"Civico","type":"text","required":true},
      {"key":"cap","label":"CAP","type":"text","required":true},
      {"key":"stesso_indirizzo_lavori","label":"Stesso indirizzo dei lavori?","type":"boolean","required":true}
    ]},
    {"key":"appartamento_lavori","label":"Appartamento dei lavori","visible_if":{"path":"residenza.stesso_indirizzo_lavori","equals":false},"fields":[
      {"key":"comune","label":"Comune","type":"text","required":true},
      {"key":"provincia","label":"Provincia","type":"text","required":true},
      {"key":"indirizzo","label":"Indirizzo","type":"text","required":true},
      {"key":"numero","label":"Numero","type":"text","required":true},
      {"key":"cap","label":"CAP","type":"text","required":true}
    ]},
    {"key":"cointestazione","label":"Cointestazione","fields":[
      {"key":"presente","label":"Pratica cointestata?","type":"boolean","required":true},
      {"key":"nome","label":"Nome cointestatario","type":"text","visible_if":{"path":"cointestazione.presente","equals":true},"required":true},
      {"key":"cognome","label":"Cognome cointestatario","type":"text","visible_if":{"path":"cointestazione.presente","equals":true},"required":true},
      {"key":"cf","label":"CF cointestatario","type":"text","visible_if":{"path":"cointestazione.presente","equals":true},"required":true}
    ]},
    {"key":"catastali","label":"Dati catastali","fields":[
      {"key":"foglio","label":"Foglio","type":"text"},
      {"key":"mappale","label":"Mappale","type":"text"},
      {"key":"subalterno","label":"Subalterno","type":"text"},
      {"key":"recupero_richiesto","label":"Recupero catastale (+€10)","type":"boolean"},
      {"key":"proprietario_nome","label":"Nome proprietario","type":"text","visible_if":{"path":"catastali.recupero_richiesto","equals":true}},
      {"key":"proprietario_cognome","label":"Cognome proprietario","type":"text","visible_if":{"path":"catastali.recupero_richiesto","equals":true}},
      {"key":"proprietario_cf","label":"CF proprietario","type":"text","visible_if":{"path":"catastali.recupero_richiesto","equals":true}}
    ]},
    {"key":"edificio","label":"Edificio","fields":[
      {"key":"anno_costruzione","label":"Anno costruzione","type":"number","required":true},
      {"key":"superficie_mq","label":"Superficie mq","type":"number","required":true},
      {"key":"numero_appartamenti","label":"N. appartamenti","type":"number","required":true},
      {"key":"titolo_richiedente","label":"Titolo richiedente","type":"select","required":true,"options":[
        {"value":"proprietario_o_comproprietario","label":"Proprietario / comproprietario"},
        {"value":"detentore_o_affittuario","label":"Detentore / affittuario"},
        {"value":"familiare_o_convivente","label":"Familiare / convivente"}
      ]},
      {"key":"tipologia","label":"Tipologia edificio","type":"select","required":true,"options":[
        {"value":"casa_singola_o_plurifamiliare","label":"Casa singola o plurifamiliare"},
        {"value":"edificio_fino_3_piani","label":"Edificio fino a 3 piani"},
        {"value":"edificio_oltre_3_piani","label":"Edificio oltre 3 piani"},
        {"value":"edificio_industriale_o_commerciale","label":"Industriale / commerciale"}
      ]}
    ]},
    {"key":"impianto","label":"Impianto termico esistente","fields":[
      {"key":"tipo","label":"Tipo","type":"select","required":true,"options":[
        {"value":"autonomo","label":"Autonomo"},{"value":"centralizzato","label":"Centralizzato"},{"value":"centralizzato_con_termostato","label":"Centralizzato con termostato"}
      ]},
      {"key":"terminali","label":"Terminali","type":"select","required":true,"options":[
        {"value":"caloriferi","label":"Caloriferi"},{"value":"riscaldamento_pavimento","label":"Riscaldamento a pavimento"},{"value":"split","label":"Split"}
      ]},
      {"key":"combustibile","label":"Combustibile","type":"select","required":true,"options":[
        {"value":"energia_elettrica","label":"Energia elettrica"},{"value":"gas_metano","label":"Gas metano"},{"value":"gpl","label":"GPL"},{"value":"gasolio","label":"Gasolio"},{"value":"teleriscaldamento","label":"Teleriscaldamento"}
      ]},
      {"key":"tipo_caldaia","label":"Tipo caldaia","type":"select","required":true,"options":[
        {"value":"acqua_calda_standard","label":"Acqua calda standard"},{"value":"gas_a_condensazione","label":"Gas a condensazione"},{"value":"impianto_geotermico","label":"Impianto geotermico"},{"value":"caldaia_a_gpl","label":"Caldaia a GPL"},{"value":"energia_elettrica","label":"Energia elettrica"},{"value":"altro","label":"Altro"}
      ]},
      {"key":"aria_condizionata","label":"Aria condizionata","type":"boolean","required":true}
    ]},
    {"key":"prodotto","label":"Libretto impianto nuovo","fields":[
      {"key":"libretto_url","label":"Carica il libretto dell'impianto installato","type":"upload","required":true,"accept":["pdf","jpg","jpeg","png"],"max_size_mb":20,"help_text":"Il libretto deve riportare marca e modello dell'impianto installato"}
    ]}
  ]
}$json$::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Verifica
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.form_modules;
  RAISE NOTICE 'Form modules totali: %', v_count;
END $$;
