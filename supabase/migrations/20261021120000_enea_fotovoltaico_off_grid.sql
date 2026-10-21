-- Modulo cliente ENEA per fotovoltaico domestico off-grid.
-- È una normale pratica ENEA Bonus Casa: nessun flusso GSE/allaccio rete.
-- Le sezioni comuni derivano dal modulo Infissi; l'impianto termico viene
-- escluso e lo step prodotto è sostituito con i soli dati richiesti da ENEA.

DO $$
DECLARE
  v_steps jsonb;
  v_schema jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN step->>'key' = 'prodotto' THEN
        $json${
          "key": "prodotto",
          "label": "Dati fotovoltaico off-grid",
          "fields": [
            {
              "key": "impianti",
              "label": "Sezioni dell’impianto fotovoltaico",
              "type": "array",
              "required": true,
              "item_template": {
                "fields": [
                  {"key":"potenza_picco_kw","label":"Potenza di picco [kW]","type":"number","required":true,"min":0.01},
                  {"key":"installato_su","label":"Dove sono installati i pannelli?","type":"select","required":true,"options":[
                    {"value":"tetto_piano","label":"Tetto piano"},
                    {"value":"tetto_inclinato","label":"Tetto inclinato"},
                    {"value":"facciata","label":"In facciata"},
                    {"value":"a_terra","label":"A terra"}
                  ]},
                  {"key":"esposizione","label":"Esposizione dei pannelli","type":"select","required":true,"help_text":"Puoi aiutarti con la bussola dello smartphone.","options":[
                    {"value":"nord","label":"Nord"},
                    {"value":"nord_est","label":"Nord-Est"},
                    {"value":"est","label":"Est"},
                    {"value":"sud_est","label":"Sud-Est"},
                    {"value":"sud","label":"Sud"},
                    {"value":"sud_ovest","label":"Sud-Ovest"},
                    {"value":"ovest","label":"Ovest"},
                    {"value":"nord_ovest","label":"Nord-Ovest"}
                  ]},
                  {"key":"inclinazione_gradi","label":"Inclinazione [°]","type":"number","required":true,"min":0,"max":90}
                ]
              }
            },
            {
              "key": "capacita_accumulo_kwh",
              "label": "Nuova capacità di accumulo installata [kWh]",
              "type": "number",
              "required": true,
              "min": 0,
              "help_text": "Inserisci 0 se non è presente un nuovo accumulo."
            }
          ]
        }$json$::jsonb
      ELSE step
    END
    ORDER BY ordinality
  ), '[]'::jsonb)
  INTO v_steps
  FROM public.form_modules AS module
  CROSS JOIN LATERAL jsonb_array_elements(module.schema->'steps')
    WITH ORDINALITY AS source(step, ordinality)
  WHERE module.slug = 'enea-infissi'
    AND step->>'key' <> 'impianto';

  IF jsonb_array_length(v_steps) = 0 THEN
    RAISE EXCEPTION 'Impossibile creare enea-fotovoltaico-off-grid: modulo base enea-infissi assente';
  END IF;

  v_schema := jsonb_build_object('steps', v_steps);

  INSERT INTO public.form_modules (
    slug, name, description, prodotto_match, schema, is_active, order_index
  ) VALUES (
    'enea-fotovoltaico-off-grid',
    'ENEA — Fotovoltaico off-grid domestico',
    'Form cliente per impianto fotovoltaico domestico senza allaccio alla rete o al GSE',
    ARRAY['fotovoltaico off-grid', 'fotovoltaico off grid'],
    v_schema,
    true,
    500
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    prodotto_match = EXCLUDED.prodotto_match,
    schema = EXCLUDED.schema,
    is_active = true,
    order_index = EXCLUDED.order_index,
    updated_at = now();
END $$;
