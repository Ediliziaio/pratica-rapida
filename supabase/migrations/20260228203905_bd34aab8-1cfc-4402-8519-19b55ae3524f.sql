
-- Performance indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_pratiche_company_stato ON public.pratiche (company_id, stato);
CREATE INDEX IF NOT EXISTS idx_pratiche_created_at ON public.pratiche (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documenti_pratica_id ON public.documenti (pratica_id);
CREATE INDEX IF NOT EXISTS idx_clienti_finali_company_id ON public.clienti_finali (company_id);
CREATE INDEX IF NOT EXISTS idx_fatture_company_id ON public.fatture (company_id);
CREATE INDEX IF NOT EXISTS idx_wallet_movements_company_id ON public.wallet_movements (company_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_pratica_id ON public.checklist_items (pratica_id);
CREATE INDEX IF NOT EXISTS idx_practice_messages_pratica_id ON public.practice_messages (pratica_id);
