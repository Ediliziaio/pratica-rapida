ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS priorita TEXT DEFAULT 'media'
    CHECK (priorita IN ('bassa', 'media', 'alta', 'urgente')),
  ADD COLUMN IF NOT EXISTS scadenza DATE,
  ADD COLUMN IF NOT EXISTS note TEXT;
