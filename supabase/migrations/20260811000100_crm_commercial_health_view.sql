-- ============================================================
-- CRM Commerciale / Lead & Retention — salute rivenditori
-- Laboratorio: sola lettura, nessuna automazione o messaggio viene inviato.
--
-- Obiettivo: dare al Supervisor AI un'unica sorgente deterministica per
-- distinguere clienti nuovi, mai attivati, stabili, in crescita, in calo e
-- a rischio, usando l'attivita' reale delle pratiche ENEA.
-- ============================================================

CREATE OR REPLACE VIEW public.crm_commercial_health
WITH (security_invoker = true)
AS
WITH practice_activity AS (
  SELECT
    c.id AS company_id,
    c.ragione_sociale,
    c.email,
    c.telefono,
    c.settore,
    c.created_at AS company_created_at,
    c.is_active,
    c.blocked_at,
    COUNT(p.id) FILTER (WHERE p.brand = 'enea')::integer AS total_practices,
    COUNT(p.id) FILTER (
      WHERE p.brand = 'enea'
        AND p.created_at >= now() - interval '30 days'
    )::integer AS practices_last_30d,
    COUNT(p.id) FILTER (
      WHERE p.brand = 'enea'
        AND p.created_at >= now() - interval '60 days'
        AND p.created_at <  now() - interval '30 days'
    )::integer AS practices_prev_30d,
    COUNT(p.id) FILTER (
      WHERE p.brand = 'enea'
        AND p.created_at >= date_trunc('month', now())
    )::integer AS practices_current_month,
    COUNT(p.id) FILTER (
      WHERE p.brand = 'enea'
        AND p.created_at >= date_trunc('month', now()) - interval '1 month'
        AND p.created_at <  date_trunc('month', now())
    )::integer AS practices_previous_month,
    MAX(p.created_at) FILTER (WHERE p.brand = 'enea') AS last_practice_at,
    MIN(p.created_at) FILTER (WHERE p.brand = 'enea') AS first_practice_at
  FROM public.companies c
  -- archived_at e' un flag di auto-archiviazione/UI, non una cancellazione
  -- della pratica: escluderlo falserebbe lo storico commerciale e potrebbe
  -- far apparire "mai attivato" un rivenditore con sole pratiche archiviate.
  LEFT JOIN public.enea_practices p
    ON p.reseller_id = c.id
  GROUP BY
    c.id,
    c.ragione_sociale,
    c.email,
    c.telefono,
    c.settore,
    c.created_at,
    c.is_active,
    c.blocked_at
), scored AS (
  SELECT
    pa.*,
    CASE
      WHEN pa.practices_prev_30d = 0 THEN NULL
      ELSE round(
        ((pa.practices_last_30d - pa.practices_prev_30d)::numeric
          / pa.practices_prev_30d::numeric) * 100,
        1
      )
    END AS change_30d_pct,
    CASE
      WHEN pa.total_practices = 0 THEN 'mai_attivato'
      WHEN pa.last_practice_at < now() - interval '60 days' THEN 'inattivo'
      -- Una prima attivazione recente resta sotto onboarding: non va
      -- classificata come semplice crescita solo perché il periodo prima era 0.
      WHEN pa.first_practice_at >= now() - interval '30 days' THEN 'nuovo_attivo'
      WHEN pa.practices_last_30d = 0 AND pa.practices_prev_30d >= 2 THEN 'a_rischio'
      WHEN pa.practices_prev_30d >= 4
       AND pa.practices_last_30d <= floor(pa.practices_prev_30d * 0.5) THEN 'a_rischio'
      WHEN pa.practices_last_30d < pa.practices_prev_30d THEN 'in_calo'
      WHEN pa.practices_last_30d > pa.practices_prev_30d THEN 'in_crescita'
      ELSE 'stabile'
    END AS health_status
  FROM practice_activity pa
)
SELECT
  s.*,
  CASE s.health_status
    WHEN 'a_rischio'    THEN 100
    WHEN 'inattivo'     THEN 90
    WHEN 'in_calo'      THEN 70
    WHEN 'mai_attivato' THEN 60
    WHEN 'nuovo_attivo' THEN 40
    WHEN 'stabile'      THEN 20
    WHEN 'in_crescita'  THEN 10
    ELSE 0
  END AS attention_score,
  CASE s.health_status
    WHEN 'a_rischio' THEN 'Contatto prioritario: calo forte o stop recente rispetto al periodo precedente.'
    WHEN 'inattivo' THEN 'Cliente senza nuove pratiche da oltre 60 giorni.'
    WHEN 'in_calo' THEN 'Volume pratiche inferiore ai 30 giorni precedenti.'
    WHEN 'mai_attivato' THEN 'Azienda registrata ma senza alcuna pratica: verificare onboarding e prima attivazione.'
    WHEN 'nuovo_attivo' THEN 'Prima pratica recente: seguire onboarding e seconda pratica.'
    WHEN 'in_crescita' THEN 'Volume in crescita: nessuna azione urgente, valutare opportunita di espansione.'
    ELSE 'Andamento stabile: mantenere monitoraggio ordinario.'
  END AS supervisor_reason
FROM scored s;

COMMENT ON VIEW public.crm_commercial_health IS
  'Vista read-only per CRM commerciale: volumi 30gg/mese, variazione, stato salute e priorita di attenzione per rivenditore.';
