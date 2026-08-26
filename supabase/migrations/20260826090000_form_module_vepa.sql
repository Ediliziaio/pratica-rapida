-- Modulo dinamico VEPA per il form cliente /form/:token.
--
-- Le pratiche create sia dal sito (richiesta-pubblica) sia dall'area
-- riservata (NuovaPraticaEnea) salvano il prodotto in
-- enea_practices.prodotto_installato e inviano al cliente lo stesso link
-- tokenizzato. FormPubblico risolve poi il modulo attivo tramite
-- form_modules.prodotto_match.
--
-- Riutilizziamo le sezioni anagrafiche/immobile del modulo Infissi, che sono
-- comuni alla pratica ENEA, e sostituiamo soltanto lo step prodotto con i
-- dati specifici VEPA. In particolare non chiediamo la trasmittanza: per il
-- flusso VEPA servono i metri quadrati e, se non risultano dalla fattura, un
-- documento che riporti le misure.

DO $$
DECLARE
  v_common_steps jsonb;
  v_vepa_schema jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(step ORDER BY ordinality), '[]'::jsonb)
  INTO v_common_steps
  FROM public.form_modules AS module
  CROSS JOIN LATERAL jsonb_array_elements(module.schema->'steps')
    WITH ORDINALITY AS source(step, ordinality)
  WHERE module.slug = 'enea-infissi'
    AND step->>'key' <> 'prodotto';

  IF jsonb_array_length(v_common_steps) = 0 THEN
    RAISE EXCEPTION 'Impossibile creare enea-vepa: modulo base enea-infissi assente o senza step';
  END IF;

  v_vepa_schema := jsonb_build_object(
    'steps',
    v_common_steps || jsonb_build_array(
      $json${
        "key": "prodotto",
        "label": "Dati VEPA",
        "fields": [
          {
            "key": "materiale_struttura",
            "label": "Materiale della struttura o del telaio",
            "type": "text",
            "placeholder": "Es. alluminio",
            "help_text": "Indica il materiale della struttura che sostiene le vetrate"
          },
          {
            "key": "numero_vetrate",
            "label": "Numero di vetrate installate",
            "type": "number",
            "required": true,
            "min": 1
          },
          {
            "key": "superficie_totale_mq",
            "label": "Superficie totale delle VEPA (m²)",
            "type": "number",
            "required": true,
            "min": 0.01,
            "help_text": "Inserisci la somma dei metri quadrati di tutte le vetrate installate"
          },
          {
            "key": "fattura_riporta_mq",
            "label": "La fattura riporta i metri quadrati delle vetrate?",
            "type": "boolean",
            "required": true
          },
          {
            "key": "documento_misure_url",
            "label": "Documento con i metri quadrati delle VEPA",
            "type": "upload",
            "required": true,
            "visible_if": {
              "path": "prodotto.fattura_riporta_mq",
              "equals": false
            },
            "accept": ["pdf", "jpg", "jpeg", "png"],
            "max_size_mb": 20,
            "help_text": "Allega un documento del produttore o dell'installatore che riporti misure e superficie"
          },
          {
            "key": "fattura_url",
            "label": "Fattura VEPA (se non già inviata)",
            "type": "upload",
            "accept": ["pdf", "jpg", "jpeg", "png"],
            "max_size_mb": 20
          },
          {
            "key": "note",
            "label": "Note sulle vetrate",
            "type": "textarea",
            "placeholder": "Eventuali dettagli utili"
          }
        ]
      }$json$::jsonb
    )
  );

  INSERT INTO public.form_modules (
    slug,
    name,
    description,
    prodotto_match,
    schema,
    is_active,
    order_index
  )
  VALUES (
    'enea-vepa',
    'ENEA — VEPA / Vetrate panoramiche',
    'Form pubblico cliente per pratiche ENEA con vetrate panoramiche amovibili (VEPA)',
    ARRAY['vepa', 'vetrat'],
    v_vepa_schema,
    true,
    400
  )
  ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      prodotto_match = EXCLUDED.prodotto_match,
      schema = EXCLUDED.schema,
      is_active = true,
      order_index = EXCLUDED.order_index,
      updated_at = now();
END $$;
