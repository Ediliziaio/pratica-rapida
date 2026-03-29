ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS design_json JSONB;
