-- Servizio facoltativo di preparazione schema unifilare.
-- Modifica esclusivamente la tabella fotovoltaico_practices: nessuna tabella,
-- pipeline o automazione ENEA viene toccata.

ALTER TABLE public.fotovoltaico_practices
  ADD COLUMN IF NOT EXISTS unifilare_choice TEXT
    CHECK (unifilare_choice IS NULL OR unifilare_choice IN (
      'fornito_dal_rivenditore',
      'richiesto_a_pratica_rapida'
    )),
  ADD COLUMN IF NOT EXISTS unifilare_status TEXT NOT NULL DEFAULT 'non_definito'
    CHECK (unifilare_status IN (
      'non_definito',
      'fornito_dal_rivenditore',
      'richiesto',
      'bozza_in_preparazione',
      'bozza_pronta',
      'inviato_da_firmare',
      'firmato_ricevuto'
    )),
  ADD COLUMN IF NOT EXISTS base_price_eur NUMERIC(10,2) NOT NULL DEFAULT 199.00,
  ADD COLUMN IF NOT EXISTS unifilare_price_eur NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS net_total_eur NUMERIC(10,2) NOT NULL DEFAULT 199.00,
  ADD COLUMN IF NOT EXISTS unifilare_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unifilare_draft_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unifilare_signed_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unifilare_last_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unifilare_reminder_count INTEGER NOT NULL DEFAULT 0
    CHECK (unifilare_reminder_count >= 0);

CREATE INDEX IF NOT EXISTS idx_fotovoltaico_unifilare_pending
  ON public.fotovoltaico_practices(unifilare_status, unifilare_draft_sent_at)
  WHERE unifilare_choice = 'richiesto_a_pratica_rapida'
    AND archived_at IS NULL;

COMMENT ON COLUMN public.fotovoltaico_practices.unifilare_status IS
  'Stato isolato del ciclo schema unifilare: richiesta, preparazione, firma e ricezione.';

-- Dopo l'invio della pratica il rivenditore non può modificarne i dati.
-- Questa policy apre esclusivamente il caricamento dello schema restituito
-- firmato/timbrato, senza concedere update generici alla pratica.
DROP POLICY IF EXISTS "Companies upload signed photovoltaic schema"
  ON public.fotovoltaico_attachments;
CREATE POLICY "Companies upload signed photovoltaic schema"
  ON public.fotovoltaico_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND category = 'schema_unifilare_firmato'
    AND EXISTS (
      SELECT 1
      FROM public.fotovoltaico_practices fp
      WHERE fp.id = practice_id
        AND fp.unifilare_status = 'inviato_da_firmare'
        AND fp.reseller_id IN (SELECT public.get_user_company_ids(auth.uid()))
    )
  );

-- Il rivenditore può comunicare la riconsegna soltanto se l'allegato firmato
-- esiste davvero, appartiene alla sua azienda ed è stato caricato da lui.
CREATE OR REPLACE FUNCTION public.submit_fotovoltaico_unifilare_signed(
  p_practice_id UUID,
  p_attachment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utente non autenticato';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.fotovoltaico_practices fp
    WHERE fp.id = p_practice_id
      AND fp.unifilare_status = 'inviato_da_firmare'
      AND fp.reseller_id IN (SELECT public.get_user_company_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Schema non disponibile per la riconsegna';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.fotovoltaico_attachments fa
    WHERE fa.id = p_attachment_id
      AND fa.practice_id = p_practice_id
      AND fa.category = 'schema_unifilare_firmato'
      AND fa.uploaded_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Allegato firmato non valido';
  END IF;

  UPDATE public.fotovoltaico_practices
  SET unifilare_status = 'firmato_ricevuto',
      unifilare_signed_received_at = now()
  WHERE id = p_practice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_fotovoltaico_unifilare_signed(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_fotovoltaico_unifilare_signed(UUID, UUID) TO authenticated;
