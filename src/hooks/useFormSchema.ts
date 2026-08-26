import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { findFormModuleByProdotto } from "@/lib/formModuleMatching";
import type { FormModule } from "@/types/form-module";

// ============================================================
// useFormModuleByProdotto
//
// Cerca il modulo del form pubblico DB-first dato il `prodotto_installato`
// della pratica (string) — match per pattern lower-case su `prodotto_match`.
//
// FormPubblico usa il modulo restituito come schema principale; in assenza di
// match mantiene il fallback hardcoded per compatibilita con i prodotti legacy.
// ============================================================

export function useFormModuleByProdotto(prodotto: string | null | undefined) {
  return useQuery<FormModule | null>({
    queryKey: ["form-module-by-prodotto", prodotto],
    queryFn: async () => {
      if (!prodotto) return null;
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("form_modules" as any)
        .select("*")
        .eq("is_active", true)
        .order("order_index");
      if (error) {
        // tabella eventualmente non ancora migrata o RLS → fail-safe
        return null;
      }
      if (!data) return null;
      const list = data as unknown as FormModule[];
      return findFormModuleByProdotto(list, prodotto);
    },
    enabled: !!prodotto,
    staleTime: 5 * 60 * 1000, // 5min
  });
}

export function useFormModules() {
  return useQuery<FormModule[]>({
    queryKey: ["form-modules-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("form_modules" as any)
        .select("*")
        .order("order_index");
      if (error) throw error;
      return (data as unknown as FormModule[]) ?? [];
    },
  });
}
