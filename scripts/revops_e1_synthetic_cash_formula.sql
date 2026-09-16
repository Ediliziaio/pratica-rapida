-- E1-res: prova esclusivamente sintetica della formula cassa.
-- Non interroga tabelle o valori reali.
\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

WITH
settings AS (
  SELECT
    '2026-08'::text AS mese_aperto,
    10000::numeric AS qonto,
    2000::numeric AS bcc,
    1000::numeric AS mercury_pr,
    0::numeric AS altro,
    800::numeric AS iva_accantonata,
    1200::numeric AS buffer
),
spese(competenza, importo) AS (
  VALUES
    ('2026-08'::text, 1000::numeric),
    (NULL::text, 500::numeric),
    ('2026-09'::text, 700::numeric)
),
calcolo AS (
  SELECT
    s.qonto + s.bcc + s.mercury_pr + s.altro AS liquidita_lorda,
    COALESCE(sum(p.importo) FILTER (
      WHERE p.competenza IS NULL OR p.competenza = s.mese_aperto
    ), 0) AS spese_periodo,
    s.iva_accantonata,
    s.buffer,
    s.qonto + s.bcc + s.mercury_pr + s.altro
      - COALESCE(sum(p.importo) FILTER (
          WHERE p.competenza IS NULL OR p.competenza = s.mese_aperto
        ), 0)
      - s.iva_accantonata
      - s.buffer AS disponibilita,
    COALESCE(sum(p.importo) FILTER (
      WHERE p.competenza > s.mese_aperto
    ), 0) AS impegni_futuri
  FROM settings s
  CROSS JOIN spese p
  GROUP BY s.mese_aperto, s.qonto, s.bcc, s.mercury_pr, s.altro, s.iva_accantonata, s.buffer
)
SELECT
  liquidita_lorda = 13000 AS liquidita_ok,
  spese_periodo = 1500 AS spese_periodo_ok,
  disponibilita = 9500 AS disponibilita_ok,
  impegni_futuri = 700 AS impegni_futuri_separati_ok
FROM calcolo;

ROLLBACK;
