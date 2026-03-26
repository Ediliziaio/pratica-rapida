-- =============================================
-- PRATICA RAPIDA v2.0 — Migration 008
-- Seed: Pipeline Stages di sistema (reseller_id = NULL)
-- =============================================

INSERT INTO public.pipeline_stages (reseller_id, name, stage_type, order_index, color, brand, is_visible) VALUES
  -- ENEA stages
  (NULL, 'Inviata',                      'inviata',             1, '#6366f1', 'enea', true),
  (NULL, 'In attesa compilazione',       'attesa_compilazione', 2, '#f59e0b', 'enea', true),
  (NULL, 'Pronte da fare',               'pronte_da_fare',      3, '#0ea5e9', 'enea', true),
  (NULL, 'Documenti mancanti',           'documenti_mancanti',  4, '#ef4444', 'enea', true),
  (NULL, 'Da inviare',                   'da_inviare',          5, '#8b5cf6', 'enea', true),
  (NULL, 'Da inserire su gestionale',    'gestionale',          6, '#06b6d4', 'enea', true),
  (NULL, 'Recensione',                   'recensione',          7, '#10b981', 'enea', true),
  (NULL, 'Archiviate',                   'archiviate',          8, '#64748b', 'enea', true),
  -- Conto Termico stages (stessi tipi, colori leggermente diversi)
  (NULL, 'Inviata',                      'inviata',             1, '#7c3aed', 'conto_termico', true),
  (NULL, 'In attesa compilazione',       'attesa_compilazione', 2, '#d97706', 'conto_termico', true),
  (NULL, 'Pronte da fare',               'pronte_da_fare',      3, '#0284c7', 'conto_termico', true),
  (NULL, 'Documenti mancanti',           'documenti_mancanti',  4, '#dc2626', 'conto_termico', true),
  (NULL, 'Da inviare',                   'da_inviare',          5, '#7e22ce', 'conto_termico', true),
  (NULL, 'Da inserire su gestionale',    'gestionale',          6, '#0891b2', 'conto_termico', true),
  (NULL, 'Recensione',                   'recensione',          7, '#059669', 'conto_termico', true),
  (NULL, 'Archiviate',                   'archiviate',          8, '#475569', 'conto_termico', true)
ON CONFLICT DO NOTHING;

-- Seed: Automation Rules di default
INSERT INTO public.automation_rules (name, description, trigger_event, channel, template_id, category, order_index, is_enabled) VALUES
  ('Primo contatto privato',         'Invia WA+mail al cliente appena la pratica è creata',           'practice_created',             'whatsapp', 'contatta_cliente',                'onboarding',  1,  true),
  ('Conferma ricezione pratica',     'Invia email al rivenditore alla creazione della pratica',        'practice_created',             'email',    'pratica_ricevuta',                'onboarding',  2,  true),
  ('Sollecito settimanale privato',  'Sollecita cliente ogni 7 giorni se form non compilato',          'days_waiting_7',               'whatsapp', 'sollecito_compilazione',          'solleciti',   3,  true),
  ('Avviso 30 giorni fornitore',     'Notifica rivenditore dopo 30 giorni senza aggiornamenti',        'days_waiting_fornitore_30',    'email',    'sollecito_fornitore',             'fornitori',   4,  true),
  ('Avviso 60 giorni fornitore',     'Notifica rivenditore dopo 60 giorni senza aggiornamenti',        'days_waiting_fornitore_60',    'email',    'sollecito_fornitore',             'fornitori',   5,  true),
  ('Avviso 90 giorni fornitore',     'Notifica rivenditore dopo 90 giorni senza aggiornamenti',        'days_waiting_fornitore_90',    'email',    'sollecito_fornitore',             'fornitori',   6,  true),
  ('Form compilato - conferma',      'Invia conferma a cliente e rivenditore quando form compilato',   'form_compiled',                'email',    'form_compilato',                  'onboarding',  7,  true),
  ('Richiesta recensione',           'Invia richiesta recensione quando pratica va in stage Recensione','stage_changed',               'whatsapp', 'richiesta_recensione',            'recensione',  8,  true),
  ('Sollecito recensione 7gg',       'Sollecita recensione se non arriva dopo 7 giorni',               'recensione_7d_followup',       'email',    'sollecito_recensione',            'recensione',  9,  true),
  ('Sync Google Sheets',             'Aggiorna foglio Google Sheets quando si salva nel gestionale',   'gestionale_saved',             'whatsapp', NULL,                              'gestionale',  10, false)
ON CONFLICT DO NOTHING;
