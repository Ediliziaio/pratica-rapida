-- Add configurable per-automation business-hours window
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS min_hour SMALLINT DEFAULT 9 CHECK (min_hour >= 0 AND min_hour <= 23),
  ADD COLUMN IF NOT EXISTS max_hour SMALLINT DEFAULT 18 CHECK (max_hour >= 0 AND max_hour <= 24);

COMMENT ON COLUMN public.automation_rules.min_hour IS 'Earliest hour (Rome time) this automation is allowed to fire. Default 9.';
COMMENT ON COLUMN public.automation_rules.max_hour IS 'Hour after which this automation stops firing (exclusive). Default 18.';
