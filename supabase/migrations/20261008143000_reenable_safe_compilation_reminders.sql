-- Riattiva il solo sollecito settimanale dopo il deploy delle barriere di sicurezza.
UPDATE public.automation_rules
SET is_enabled = true,
    updated_at = now()
WHERE id = '879d3a12-0ae5-41eb-b42a-83c734c540c0'
  AND name = 'Sollecito settimanale privato';
