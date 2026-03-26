-- =============================================
-- PRATICA RAPIDA v2.0 — Migration 006
-- Call Bookings (calendario prenotazioni chiamate)
-- =============================================

CREATE TABLE public.call_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID REFERENCES public.enea_practices(id),
  cliente_nome TEXT NOT NULL,
  cliente_email TEXT NOT NULL,
  cliente_telefono TEXT,
  slot_datetime TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  -- pending, confirmed, completed, cancelled, no_show
  meeting_link TEXT,
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.call_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users manage bookings"
  ON public.call_bookings FOR ALL
  TO authenticated
  USING (public.is_internal(auth.uid()));

CREATE POLICY "Resellers read own practice bookings"
  ON public.call_bookings FOR SELECT
  TO authenticated
  USING (
    practice_id IN (
      SELECT id FROM public.enea_practices
      WHERE reseller_id = public.get_reseller_company_id(auth.uid())
    )
  );

CREATE INDEX idx_call_bookings_slot ON public.call_bookings(slot_datetime);
CREATE INDEX idx_call_bookings_practice ON public.call_bookings(practice_id);
CREATE INDEX idx_call_bookings_status ON public.call_bookings(status);
