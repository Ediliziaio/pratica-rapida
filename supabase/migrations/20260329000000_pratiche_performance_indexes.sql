-- ============================================================
-- Performance indexes for pratiche table
-- Run this in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/xmkjrhwmmuzaqjqlvzxm/sql
-- ============================================================

-- Compound: company scope + newest-first sort (company view main query)
CREATE INDEX IF NOT EXISTS idx_pratiche_company_created
  ON pratiche (company_id, created_at DESC);

-- Single stato (very frequent filter)
CREATE INDEX IF NOT EXISTS idx_pratiche_stato
  ON pratiche (stato);

-- Compound: company + stato (company view filtered by status)
CREATE INDEX IF NOT EXISTS idx_pratiche_company_stato
  ON pratiche (company_id, stato);

-- Assegnatario (operatore queries + restriction)
CREATE INDEX IF NOT EXISTS idx_pratiche_assegnatario
  ON pratiche (assegnatario_id);

-- Pagamento stato (payment filter in admin)
CREATE INDEX IF NOT EXISTS idx_pratiche_pagamento
  ON pratiche (pagamento_stato);

-- created_at DESC (admin global sort + date range filters)
CREATE INDEX IF NOT EXISTS idx_pratiche_created_at
  ON pratiche (created_at DESC);

-- updated_at DESC (KPI: completate this month)
CREATE INDEX IF NOT EXISTS idx_pratiche_updated_at
  ON pratiche (updated_at DESC);

-- Partial index: completata + non_pagata — very selective, powers "Da fatturare" KPI
CREATE INDEX IF NOT EXISTS idx_pratiche_da_fatturare
  ON pratiche (prezzo)
  WHERE stato = 'completata' AND pagamento_stato = 'non_pagata';

-- Functional index on JSON brand field (brand filter)
CREATE INDEX IF NOT EXISTS idx_pratiche_brand
  ON pratiche ((dati_pratica->>'brand'));
