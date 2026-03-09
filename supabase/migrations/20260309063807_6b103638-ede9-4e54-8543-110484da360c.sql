CREATE POLICY "Company users delete own draft practices"
ON public.pratiche FOR DELETE TO authenticated
USING (
  (stato = 'bozza' AND company_id IN (SELECT get_user_company_ids(auth.uid())))
  OR has_role(auth.uid(), 'super_admin')
);