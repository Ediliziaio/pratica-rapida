-- ============================================================
-- Fix CRITICAL — client_form_* cross-tenant leak
--
-- Problema: le policy RLS di queste tabelle
--   client_form_tokens
--   client_form_schermature
--   client_form_infissi
--   client_form_impianto_termico
--   client_form_vepa
-- usavano `auth.role() = 'authenticated'` per `auth_full_access_*`,
-- concedendo accesso completo a TUTTI gli utenti autenticati.
--
-- Conseguenza: un azienda_admin del tenant A poteva leggere i moduli
-- cliente compilati da un tenant B (dati anagrafici del cliente finale,
-- dimensioni infissi, impianti termici, ecc.).
--
-- Fix: le policy sono ri-scritte per autorizzare solo:
--   - staff Praticarapida (is_internal = super_admin/operatore)
--   - azienda membri del tenant che POSSIEDE la pratica collegata
--     (tramite pratiche.company_id → user_company_assignments)
--
-- La policy `public_insert_*` (usata dal form pubblico servito tramite
-- token) resta com'è: chiunque conosca il token può inserire le proprie
-- risposte — l'autorizzazione è implicita nel possesso del token.
-- ============================================================

-- client_form_tokens --------------------------------------------------------
DROP POLICY IF EXISTS "auth_full_access_tokens" ON client_form_tokens;

CREATE POLICY "Tenant + staff manage own tokens"
  ON client_form_tokens
  FOR ALL
  TO authenticated
  USING (
    is_internal(auth.uid())
    OR pratica_id IN (
      SELECT id FROM pratiche
      WHERE company_id IN (SELECT get_user_company_ids(auth.uid()))
    )
  )
  WITH CHECK (
    is_internal(auth.uid())
    OR pratica_id IN (
      SELECT id FROM pratiche
      WHERE company_id IN (SELECT get_user_company_ids(auth.uid()))
    )
  );

-- client_form_schermature ---------------------------------------------------
DROP POLICY IF EXISTS "auth_full_access_schermature" ON client_form_schermature;

CREATE POLICY "Tenant + staff manage own schermature forms"
  ON client_form_schermature
  FOR ALL
  TO authenticated
  USING (
    is_internal(auth.uid())
    OR pratica_id IN (
      SELECT id FROM pratiche
      WHERE company_id IN (SELECT get_user_company_ids(auth.uid()))
    )
  )
  WITH CHECK (
    is_internal(auth.uid())
    OR pratica_id IN (
      SELECT id FROM pratiche
      WHERE company_id IN (SELECT get_user_company_ids(auth.uid()))
    )
  );

-- client_form_infissi -------------------------------------------------------
DROP POLICY IF EXISTS "auth_full_access_infissi" ON client_form_infissi;

CREATE POLICY "Tenant + staff manage own infissi forms"
  ON client_form_infissi
  FOR ALL
  TO authenticated
  USING (
    is_internal(auth.uid())
    OR pratica_id IN (
      SELECT id FROM pratiche
      WHERE company_id IN (SELECT get_user_company_ids(auth.uid()))
    )
  )
  WITH CHECK (
    is_internal(auth.uid())
    OR pratica_id IN (
      SELECT id FROM pratiche
      WHERE company_id IN (SELECT get_user_company_ids(auth.uid()))
    )
  );

-- client_form_impianto_termico ----------------------------------------------
DROP POLICY IF EXISTS "auth_full_access_termico" ON client_form_impianto_termico;

CREATE POLICY "Tenant + staff manage own termico forms"
  ON client_form_impianto_termico
  FOR ALL
  TO authenticated
  USING (
    is_internal(auth.uid())
    OR pratica_id IN (
      SELECT id FROM pratiche
      WHERE company_id IN (SELECT get_user_company_ids(auth.uid()))
    )
  )
  WITH CHECK (
    is_internal(auth.uid())
    OR pratica_id IN (
      SELECT id FROM pratiche
      WHERE company_id IN (SELECT get_user_company_ids(auth.uid()))
    )
  );

-- client_form_vepa ----------------------------------------------------------
DROP POLICY IF EXISTS "auth_full_access_vepa" ON client_form_vepa;

CREATE POLICY "Tenant + staff manage own vepa forms"
  ON client_form_vepa
  FOR ALL
  TO authenticated
  USING (
    is_internal(auth.uid())
    OR pratica_id IN (
      SELECT id FROM pratiche
      WHERE company_id IN (SELECT get_user_company_ids(auth.uid()))
    )
  )
  WITH CHECK (
    is_internal(auth.uid())
    OR pratica_id IN (
      SELECT id FROM pratiche
      WHERE company_id IN (SELECT get_user_company_ids(auth.uid()))
    )
  );
