
CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read settings"
ON public.platform_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Super admin manages settings"
ON public.platform_settings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'));

INSERT INTO public.platform_settings (key, value) VALUES
('sla_settings', '{"presaInCaricoOre": 24, "completamentoOre": 120}'::jsonb);
