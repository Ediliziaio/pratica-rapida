
-- Seed data: Azienda "Mario Rossi Srl"
DO $$
DECLARE
  _company_id UUID := gen_random_uuid();
  _client_ids UUID[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,10));
  _service_id UUID;
  _pratica_ids UUID[];
  _i INT;
  _user_id UUID := '0d5e7e36-2af9-4a4d-bc31-106104ff4f40';
  _cats text[] := ARRAY['fatturazione','enea_bonus','finanziamenti','pratiche_edilizie','altro'];
  _stati text[] := ARRAY['bozza','inviata','in_lavorazione','in_attesa_documenti','completata','completata'];
  _nomi text[] := ARRAY['Marco','Luca','Anna','Elena','Paolo','Giulia','Roberto','Sara','Andrea','Francesca'];
  _cognomi text[] := ARRAY['Bianchi','Verdi','Neri','Russo','Ferrari','Colombo','Ricci','Marino','Greco','Bruno'];
BEGIN
  -- Create company
  INSERT INTO public.companies (id, ragione_sociale, piva, codice_fiscale, email, telefono, citta, indirizzo, cap, provincia, settore, wallet_balance)
  VALUES (_company_id, 'Mario Rossi Srl', '01234567890', 'RSSMRA80A01H501Z', 'info@mariorossi.it', '+39 02 1234567', 'Milano', 'Via Roma 1', '20100', 'MI', 'Servizi', 1500.00);

  -- Assign existing user to company
  INSERT INTO public.user_company_assignments (user_id, company_id) VALUES (_user_id, _company_id);

  -- Create 10 clienti finali
  FOR _i IN 1..10 LOOP
    INSERT INTO public.clienti_finali (id, company_id, nome, cognome, email, telefono, tipo, consenso_privacy, codice_fiscale)
    VALUES (_client_ids[_i], _company_id, _nomi[_i], _cognomi[_i],
      lower(_nomi[_i]) || '.' || lower(_cognomi[_i]) || '@email.it',
      '+39 333 ' || lpad((_i * 111)::text, 7, '0'),
      CASE WHEN _i <= 7 THEN 'persona' ELSE 'azienda' END,
      true, 'CF' || lpad(_i::text, 14, '0'));
  END LOOP;

  -- Get or create service
  SELECT id INTO _service_id FROM public.service_catalog WHERE attivo = true LIMIT 1;
  IF _service_id IS NULL THEN
    _service_id := gen_random_uuid();
    INSERT INTO public.service_catalog (id, nome, categoria, prezzo_base, descrizione, attivo, checklist_template)
    VALUES (_service_id, 'Fattura Elettronica', 'fatturazione', 25.00, 'Emissione fattura elettronica standard', true, '["Verifica dati cliente","Compilazione fattura","Invio SDI","Conferma ricezione"]'::jsonb);
  END IF;

  -- Create 12 pratiche
  _pratica_ids := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,12));
  FOR _i IN 1..12 LOOP
    INSERT INTO public.pratiche (id, company_id, titolo, categoria, stato, prezzo, cliente_finale_id, service_id, creato_da, priorita, descrizione, scadenza, pagamento_stato)
    VALUES (
      _pratica_ids[_i], _company_id, 'Pratica demo #' || _i,
      _cats[1 + ((_i - 1) % 5)]::service_category,
      _stati[1 + ((_i - 1) % 6)]::pratica_stato,
      25.00 + (_i * 10),
      _client_ids[1 + ((_i - 1) % 10)],
      _service_id, _user_id,
      CASE WHEN _i % 4 = 0 THEN 'alta' WHEN _i % 4 = 1 THEN 'urgente' ELSE 'normale' END::priorita,
      'Descrizione pratica di esempio numero ' || _i,
      CURRENT_DATE + (_i * 5),
      CASE WHEN _i <= 6 THEN 'pagata' ELSE 'non_pagata' END::pagamento_stato
    );
  END LOOP;

  -- 5 fatture
  FOR _i IN 1..5 LOOP
    INSERT INTO public.fatture (company_id, numero, imponibile, aliquota_iva, iva, totale, stato, cliente_finale_id, data_emissione)
    VALUES (_company_id, 'FT-2026-' || lpad(_i::text, 4, '0'), 100.00 * _i, 22, 22.00 * _i, 122.00 * _i,
      CASE WHEN _i <= 2 THEN 'pagata' WHEN _i <= 4 THEN 'emessa' ELSE 'bozza' END::stato_fattura,
      _client_ids[_i], CURRENT_DATE - (_i * 10));
  END LOOP;

  -- 1 nota di credito
  INSERT INTO public.note_credito (company_id, numero, importo, causale, data_emissione)
  VALUES (_company_id, 'NC-2026-0001', 122.00, 'Reso merce', CURRENT_DATE - 5);

  -- 3 proforma
  FOR _i IN 1..3 LOOP
    INSERT INTO public.proforma (company_id, numero, importo, scadenza, cliente_finale_id, data_emissione)
    VALUES (_company_id, 'PF-2026-' || lpad(_i::text, 4, '0'), 200.00 * _i, CURRENT_DATE + (_i * 15), _client_ids[_i], CURRENT_DATE - (_i * 3));
  END LOOP;

  -- Wallet movements
  INSERT INTO public.wallet_movements (company_id, tipo, importo, causale)
  VALUES
    (_company_id, 'credito', 2000.00, 'Ricarica iniziale'),
    (_company_id, 'debito', 250.00, 'Pagamento pratiche batch'),
    (_company_id, 'debito', 150.00, 'Pagamento pratica singola'),
    (_company_id, 'credito', 500.00, 'Ricarica wallet'),
    (_company_id, 'debito', 100.00, 'Pagamento fattura');
END $$;
