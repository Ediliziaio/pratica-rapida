-- ============================================================
-- Aggiunta regola automation_rules `stage_changed/email`
--
-- Bug riscontrato: quando la pratica veniva spostata su "Invio pratica
-- chiusa" (stage_type = da_inviare), `on-stage-changed` chiamava
-- isRuleEnabled("stage_changed", "email") che cadeva nel default
-- "enabled" perché il record non esisteva nel DB. L'email partiva
-- ma la regola NON era visibile in /admin/automazioni — quindi
-- impossibile disabilitarla dall'UI di amministrazione.
--
-- Fix: inseriamo il record mancante, così la pagina /admin/automazioni
-- lo mostra accanto a `stage_changed/whatsapp` (già presente) e
-- l'admin può toggle on/off come per le altre automazioni.
--
-- is_enabled = true (mantiene il comportamento attuale: email parte)
-- ============================================================

INSERT INTO public.automation_rules (
  name, description, trigger_event, channel, template_id, is_enabled, category
)
VALUES (
  'Stage cambiato → email',
  'Quando la pratica viene spostata in un nuovo stage Kanban, invia email: al cliente (M4 Pratica completata se stage = da_inviare) e al rivenditore (Notifica C archivio disponibile).',
  'stage_changed',
  'email',
  'pratica_inviata',
  true,
  'notifiche'
)
ON CONFLICT DO NOTHING;
