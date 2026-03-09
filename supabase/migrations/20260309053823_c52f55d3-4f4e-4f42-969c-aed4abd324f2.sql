
CREATE TYPE public.ticket_stato AS ENUM ('aperto', 'in_lavorazione', 'risolto', 'chiuso');
CREATE TYPE public.ticket_priorita AS ENUM ('bassa', 'normale', 'alta');

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  oggetto text NOT NULL,
  descrizione text NOT NULL DEFAULT '',
  stato public.ticket_stato NOT NULL DEFAULT 'aperto',
  priorita public.ticket_priorita NOT NULL DEFAULT 'normale',
  risposta text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own company tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR company_id IN (SELECT public.get_user_company_ids(auth.uid())));

CREATE POLICY "Company users create tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id IN (SELECT public.get_user_company_ids(auth.uid())));

CREATE POLICY "Authorized users update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.is_internal(auth.uid()) OR (user_id = auth.uid()));

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
