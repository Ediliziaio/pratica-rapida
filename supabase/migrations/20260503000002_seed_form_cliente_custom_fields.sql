-- ============================================================
-- Seed: registra tutti i campi del form pubblico cliente nella
-- tabella custom_fields, così il super_admin li vede e li può
-- gestire dalla pagina /admin/campi.
--
-- I campi seguono la struttura del JSONB enea_practices.dati_form
-- usato dal form pubblico (FormPubblico.tsx + Steps.tsx).
--
-- Nessuna duplicazione: ON CONFLICT (entity, field_key) DO NOTHING.
-- Idempotente: rieseguibile senza side-effect.
-- ============================================================

INSERT INTO public.custom_fields (
  entity, field_key, field_label, field_type, options,
  is_required, is_visible_reseller, is_visible_admin,
  order_index, group_name, description
)
VALUES
  -- ── Sezione 1 — Richiedente ─────────────────────────────────────
  ('enea_practice','form_richiedente_nome','Nome','text','[]'::jsonb, true,true,true, 100,'Form cliente · Richiedente','Compilato dal cliente nel form pubblico'),
  ('enea_practice','form_richiedente_cognome','Cognome','text','[]'::jsonb, true,true,true, 101,'Form cliente · Richiedente',null),
  ('enea_practice','form_richiedente_comune_nascita','Comune di nascita','text','[]'::jsonb, true,true,true, 102,'Form cliente · Richiedente',null),
  ('enea_practice','form_richiedente_provincia_nascita','Provincia di nascita','text','[]'::jsonb, true,true,true, 103,'Form cliente · Richiedente',null),
  ('enea_practice','form_richiedente_data_nascita','Data di nascita','date','[]'::jsonb, true,true,true, 104,'Form cliente · Richiedente',null),
  ('enea_practice','form_richiedente_cf','Codice fiscale','text','[]'::jsonb, true,true,true, 105,'Form cliente · Richiedente','16 caratteri formato italiano'),
  ('enea_practice','form_richiedente_email','Email','email','[]'::jsonb, true,true,true, 106,'Form cliente · Richiedente',null),
  ('enea_practice','form_richiedente_telefono','Telefono','phone','[]'::jsonb, true,true,true, 107,'Form cliente · Richiedente',null),
  ('enea_practice','form_richiedente_abitazione_principale','Abitazione principale','boolean','[]'::jsonb, true,true,true, 108,'Form cliente · Richiedente','La casa dove sono stati fatti i lavori è l''abitazione principale?'),

  -- ── Sezione 2 — Residenza ──────────────────────────────────────
  ('enea_practice','form_residenza_comune','Comune di residenza','text','[]'::jsonb, true,true,true, 200,'Form cliente · Residenza',null),
  ('enea_practice','form_residenza_provincia','Provincia di residenza','text','[]'::jsonb, true,true,true, 201,'Form cliente · Residenza',null),
  ('enea_practice','form_residenza_indirizzo','Indirizzo di residenza','text','[]'::jsonb, true,true,true, 202,'Form cliente · Residenza',null),
  ('enea_practice','form_residenza_civico','Numero civico','text','[]'::jsonb, true,true,true, 203,'Form cliente · Residenza',null),
  ('enea_practice','form_residenza_cap','CAP','text','[]'::jsonb, true,true,true, 204,'Form cliente · Residenza',null),
  ('enea_practice','form_residenza_stesso_indirizzo_lavori','Stesso indirizzo dei lavori','boolean','[]'::jsonb, true,true,true, 205,'Form cliente · Residenza','Se NO si chiedono i dati dell''appartamento dei lavori'),

  -- ── Sezione 2b — Appartamento dei lavori (condizionale) ────────
  ('enea_practice','form_appar_lavori_comune','Comune appartamento lavori','text','[]'::jsonb, false,true,true, 250,'Form cliente · Appartamento lavori','Solo se diverso dalla residenza'),
  ('enea_practice','form_appar_lavori_provincia','Provincia appartamento lavori','text','[]'::jsonb, false,true,true, 251,'Form cliente · Appartamento lavori',null),
  ('enea_practice','form_appar_lavori_indirizzo','Indirizzo appartamento lavori','text','[]'::jsonb, false,true,true, 252,'Form cliente · Appartamento lavori',null),
  ('enea_practice','form_appar_lavori_numero','Numero civico appartamento lavori','text','[]'::jsonb, false,true,true, 253,'Form cliente · Appartamento lavori',null),
  ('enea_practice','form_appar_lavori_cap','CAP appartamento lavori','text','[]'::jsonb, false,true,true, 254,'Form cliente · Appartamento lavori',null),

  -- ── Sezione 3 — Cointestazione (condizionale) ──────────────────
  ('enea_practice','form_cointest_presente','Pratica cointestata','boolean','[]'::jsonb, true,true,true, 300,'Form cliente · Cointestazione',null),
  ('enea_practice','form_cointest_nome','Nome cointestatario','text','[]'::jsonb, false,true,true, 301,'Form cliente · Cointestazione','Solo se cointestata'),
  ('enea_practice','form_cointest_cognome','Cognome cointestatario','text','[]'::jsonb, false,true,true, 302,'Form cliente · Cointestazione',null),
  ('enea_practice','form_cointest_cf','CF cointestatario','text','[]'::jsonb, false,true,true, 303,'Form cliente · Cointestazione',null),

  -- ── Sezione 4 — Dati catastali ─────────────────────────────────
  ('enea_practice','form_catastali_foglio','Foglio catastale','text','[]'::jsonb, false,true,true, 400,'Form cliente · Catastali',null),
  ('enea_practice','form_catastali_mappale','Mappale o particella','text','[]'::jsonb, false,true,true, 401,'Form cliente · Catastali',null),
  ('enea_practice','form_catastali_subalterno','Subalterno','text','[]'::jsonb, false,true,true, 402,'Form cliente · Catastali',null),
  ('enea_practice','form_catastali_recupero_richiesto','Recupero catastale richiesto (+€10)','boolean','[]'::jsonb, false,true,true, 403,'Form cliente · Catastali','Cliente non ha i dati catastali, chiede di recuperarli'),
  ('enea_practice','form_catastali_proprietario_nome','Nome proprietario casa','text','[]'::jsonb, false,true,true, 404,'Form cliente · Catastali','Solo se richiesto recupero'),
  ('enea_practice','form_catastali_proprietario_cognome','Cognome proprietario','text','[]'::jsonb, false,true,true, 405,'Form cliente · Catastali',null),
  ('enea_practice','form_catastali_proprietario_cf','CF proprietario','text','[]'::jsonb, false,true,true, 406,'Form cliente · Catastali',null),

  -- ── Sezione 5 — Edificio ───────────────────────────────────────
  ('enea_practice','form_edificio_anno_costruzione','Anno di costruzione','number','[]'::jsonb, true,true,true, 500,'Form cliente · Edificio','Anche presunto'),
  ('enea_practice','form_edificio_superficie_mq','Superficie appartamento (mq)','number','[]'::jsonb, true,true,true, 501,'Form cliente · Edificio',null),
  ('enea_practice','form_edificio_numero_appartamenti','Numero appartamenti edificio','number','[]'::jsonb, true,true,true, 502,'Form cliente · Edificio',null),
  ('enea_practice','form_edificio_titolo_richiedente','Titolo del richiedente','select',
    '[{"value":"proprietario_o_comproprietario","label":"Proprietario / comproprietario"},{"value":"detentore_o_affittuario","label":"Detentore / affittuario"},{"value":"familiare_o_convivente","label":"Familiare / convivente"}]'::jsonb,
    true,true,true, 503,'Form cliente · Edificio',null),
  ('enea_practice','form_edificio_tipologia','Tipologia edificio','select',
    '[{"value":"casa_singola_o_plurifamiliare","label":"Casa singola o plurifamiliare"},{"value":"edificio_fino_3_piani","label":"Edificio fino a 3 piani"},{"value":"edificio_oltre_3_piani","label":"Edificio oltre 3 piani (4+)"},{"value":"edificio_industriale_o_commerciale","label":"Edificio industriale o commerciale"}]'::jsonb,
    true,true,true, 504,'Form cliente · Edificio',null),

  -- ── Sezione 6 — Impianto termico ───────────────────────────────
  ('enea_practice','form_impianto_tipo','Tipo impianto','select',
    '[{"value":"autonomo","label":"Autonomo"},{"value":"centralizzato","label":"Centralizzato"},{"value":"centralizzato_con_termostato","label":"Centralizzato con termostato"}]'::jsonb,
    true,true,true, 600,'Form cliente · Impianto termico',null),
  ('enea_practice','form_impianto_terminali','Terminali di erogazione','select',
    '[{"value":"caloriferi","label":"Caloriferi"},{"value":"riscaldamento_pavimento","label":"Riscaldamento a pavimento"},{"value":"split","label":"Split"}]'::jsonb,
    true,true,true, 601,'Form cliente · Impianto termico',null),
  ('enea_practice','form_impianto_combustibile','Combustibile','select',
    '[{"value":"energia_elettrica","label":"Energia elettrica"},{"value":"gas_metano","label":"Gas metano"},{"value":"gpl","label":"GPL"},{"value":"gasolio","label":"Gasolio"},{"value":"teleriscaldamento","label":"Teleriscaldamento"}]'::jsonb,
    true,true,true, 602,'Form cliente · Impianto termico',null),
  ('enea_practice','form_impianto_tipo_caldaia','Tipo caldaia','select',
    '[{"value":"acqua_calda_standard","label":"Acqua calda standard"},{"value":"gas_a_condensazione","label":"Gas a condensazione"},{"value":"impianto_geotermico","label":"Impianto geotermico"},{"value":"caldaia_a_gpl","label":"Caldaia a GPL"},{"value":"energia_elettrica","label":"Energia elettrica"},{"value":"altro","label":"Altro"}]'::jsonb,
    true,true,true, 603,'Form cliente · Impianto termico',null),
  ('enea_practice','form_impianto_aria_condizionata','Aria condizionata','boolean','[]'::jsonb, true,true,true, 604,'Form cliente · Impianto termico',null),

  -- ── Variante Infissi ───────────────────────────────────────────
  ('enea_practice','form_infissi_materiale_vecchi','Materiale infissi vecchi','select',
    '[{"value":"legno","label":"Legno"},{"value":"pvc","label":"PVC"},{"value":"metallo","label":"Metallo"}]'::jsonb,
    false,true,true, 700,'Form cliente · Prodotto Infissi','Solo per pratiche infissi'),
  ('enea_practice','form_infissi_vetro_vecchi','Vetro infissi vecchi','select',
    '[{"value":"singolo","label":"Singolo"},{"value":"doppio","label":"Doppio"},{"value":"triplo","label":"Triplo"}]'::jsonb,
    false,true,true, 701,'Form cliente · Prodotto Infissi',null),
  ('enea_practice','form_infissi_materiale_nuovi','Materiale nuovi infissi','select',
    '[{"value":"legno","label":"Legno"},{"value":"pvc","label":"PVC"},{"value":"metallo","label":"Metallo"}]'::jsonb,
    false,true,true, 702,'Form cliente · Prodotto Infissi',null),
  ('enea_practice','form_infissi_vetro_nuovi','Vetro nuovi infissi','select',
    '[{"value":"singolo","label":"Singolo"},{"value":"doppio","label":"Doppio"},{"value":"triplo","label":"Triplo"}]'::jsonb,
    false,true,true, 703,'Form cliente · Prodotto Infissi',null),
  ('enea_practice','form_infissi_zanzariere','Zanzariere/tapparelle/persiane','boolean','[]'::jsonb, false,true,true, 704,'Form cliente · Prodotto Infissi',null),

  -- ── Variante Schermature solari ────────────────────────────────
  -- (array dinamico — ogni schermatura ha tipo + direzione; qui registriamo
  -- solo i campi-template; lato form l'utente può aggiungerne N)
  ('enea_practice','form_schermature_lista','Schermature solari (lista)','textarea','[]'::jsonb, false,true,true, 800,'Form cliente · Prodotto Schermature','Array dinamico: ciascuna con tipo e direzione'),

  -- ── Variante Impianto termico (prodotto) ───────────────────────
  ('enea_practice','form_prodotto_impianto_libretto','Libretto impianto (file)','url','[]'::jsonb, false,true,true, 900,'Form cliente · Prodotto Impianto','Path nel bucket enea-documents')

ON CONFLICT (entity, field_key) DO NOTHING;

-- Verifica counts post-seed
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.custom_fields WHERE entity = 'enea_practice' AND field_key LIKE 'form_%';
  RAISE NOTICE 'Custom fields form cliente seedati: % righe', v_count;
END $$;
