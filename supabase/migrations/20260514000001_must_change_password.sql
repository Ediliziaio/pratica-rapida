-- ============================================================
-- profiles.must_change_password
--
-- Flag che il super_admin imposta quando assegna manualmente una password
-- temporanea a un'azienda. Al primo login con quella password l'utente
-- viene forzato a cambiarla prima di poter usare il portale.
--
-- Workflow:
--  1. super_admin va su /aziende/:id → "Cambia password" → digita pwd
--  2. Edge function `set-company-password`:
--     - aggiorna auth.users password via supabase.auth.admin.updateUserById
--     - imposta profiles.must_change_password = true
--  3. L'azienda accede con la pwd temporanea
--  4. useAuth rileva must_change_password = true → ProtectedRoute redirect
--     a /cambia-password (blocking, niente sidebar/navigazione)
--  5. L'utente sceglie nuova password → updateUser → trigger DB azzera il flag
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'True quando il super_admin ha forzato una password temporanea. L''utente deve cambiarla al primo accesso.';

-- ============================================================
-- RPC `clear_must_change_password()` — invocata dal client dopo updateUser
-- per togliere il flag. SECURITY DEFINER così l'utente può azzerarlo
-- solo per se stesso (controllo auth.uid()).
-- ============================================================
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.profiles
  SET must_change_password = false, updated_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;
