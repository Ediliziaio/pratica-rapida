import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PromoType {
  id: string;
  name: string;
  description: string | null;
  type: "free_pratiche" | "discount_percent" | "discount_fixed";
  value: number | null;
  max_pratiche: number | null;
  validity_days: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ClientPromo {
  id: string;
  client_id: string;
  promo_type_id: string;
  activated_at: string;
  expires_at: string | null;
  pratiche_used: number;
  pratiche_free_remaining: number | null;
  status: "active" | "expired" | "exhausted";
  assigned_by: string | null;
  notes: string | null;
  promo_types?: PromoType;
}

// -----------------------------------------------
// Hook principale
// -----------------------------------------------
export function usePromo(clientId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Promo attiva del cliente
  const { data: activePromo, isLoading } = useQuery({
    queryKey: ["client-promo", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_promos")
        .select("*, promo_types(*)")
        .eq("client_id", clientId!)
        .eq("status", "active")
        .lte("activated_at", new Date().toISOString())
        .order("activated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ClientPromo | null;
    },
  });

  // Applica promo a una pratica
  const applyPromo = useMutation({
    mutationFn: async (praticaId: string) => {
      if (!activePromo || !clientId) throw new Error("Nessuna promo attiva");

      const newUsed = (activePromo.pratiche_used ?? 0) + 1;
      const newRemaining = activePromo.pratiche_free_remaining != null
        ? activePromo.pratiche_free_remaining - 1
        : null;
      const exhausted = newRemaining !== null && newRemaining <= 0;

      // Aggiorna promo
      const { error: promoErr } = await supabase
        .from("client_promos")
        .update({
          pratiche_used: newUsed,
          pratiche_free_remaining: newRemaining,
          status: exhausted ? "exhausted" : "active",
        })
        .eq("id", activePromo.id);
      if (promoErr) throw promoErr;

      // Marca pratica come gratuita
      const { error: praticaErr } = await supabase
        .from("pratiche")
        .update({ is_free: true })
        .eq("id", praticaId);
      if (praticaErr) throw praticaErr;

      return { exhausted, remaining: newRemaining };
    },
    onSuccess: ({ exhausted, remaining }) => {
      queryClient.invalidateQueries({ queryKey: ["client-promo", clientId] });
      if (exhausted) {
        toast({ title: "Promo esaurita", description: "Hai utilizzato tutte le pratiche gratuite." });
      } else {
        toast({ title: "Promo applicata ✓", description: `Pratiche gratuite rimaste: ${remaining}` });
      }
    },
    onError: () => toast({ title: "Errore applicazione promo", variant: "destructive" }),
  });

  // Helpers
  const isPromoApplicable = !!activePromo &&
    activePromo.status === "active" &&
    (activePromo.pratiche_free_remaining == null || activePromo.pratiche_free_remaining > 0) &&
    (!activePromo.expires_at || new Date(activePromo.expires_at) > new Date());

  const daysToExpiry = activePromo?.expires_at
    ? Math.ceil((new Date(activePromo.expires_at).getTime() - Date.now()) / 86400000)
    : null;

  return {
    activePromo,
    isLoading,
    isPromoApplicable,
    daysToExpiry,
    applyPromo: applyPromo.mutateAsync,
    isApplying: applyPromo.isPending,
  };
}

// -----------------------------------------------
// Hook admin: lista tutte le promo types
// -----------------------------------------------
export function usePromoTypes() {
  return useQuery({
    queryKey: ["promo-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_types")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PromoType[];
    },
  });
}

// -----------------------------------------------
// Hook admin: assegnazioni clienti
// -----------------------------------------------
export function useClientPromos(filters?: { status?: string }) {
  return useQuery({
    queryKey: ["client-promos", filters],
    queryFn: async () => {
      let q = supabase
        .from("client_promos")
        .select("*, promo_types(*), profiles!client_promos_client_id_fkey(nome, cognome, email)")
        .order("created_at", { ascending: false });
      if (filters?.status) q = q.eq("status", filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}
