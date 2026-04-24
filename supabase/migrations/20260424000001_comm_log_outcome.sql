-- Add outcome and notes columns to communication_log for manual phone call entries
ALTER TABLE public.communication_log
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;
