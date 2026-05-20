-- ============================================================
-- Storage bucket `whatsapp-media` per allegati outbound dalla chat
-- in-app. I file caricati qui generano un signed URL che Meta scarica
-- al momento dell'invio del messaggio (Meta API supporta sia `link`
-- pubblico/signed che `media_id` dopo upload diretto).
--
-- Strategia: signed URL (più semplice, no upload multipart a Meta).
-- TTL signed URL: 24h (sufficiente per Meta a scaricare immediatamente).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  false, -- non public: serve signed URL
  16 * 1024 * 1024, -- 16 MB (limite Meta per immagini)
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'audio/mpeg', 'audio/ogg', 'audio/amr',
    'video/mp4', 'video/3gpp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: solo internal users possono leggere/scrivere
CREATE POLICY "Internal users upload whatsapp media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND public.is_internal(auth.uid())
  );

CREATE POLICY "Internal users read whatsapp media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND public.is_internal(auth.uid())
  );

CREATE POLICY "Internal users delete whatsapp media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND public.is_internal(auth.uid())
  );

COMMENT ON COLUMN public.whatsapp_messages.media_url IS
  'Per outbound: signed URL Supabase Storage (bucket whatsapp-media). Per inbound: URL Meta da scaricare via API.';
