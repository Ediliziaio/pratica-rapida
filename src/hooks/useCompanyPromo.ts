import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyPromo {
  id: string;
  company_id: string;
  promo_type_id: string;
  pratiche_rimaste: number | null;
  ciclo_posizione: number;
  pratiche_usate: number;
  pratiche_gratuite_erogate: number;
  status: "active" | "paused" | "expired" | "exhausted";
  activated_at: string;
  expires_at: string | null;
  note: string;
  assigned_by: string | null;
  created_at: string;
  promo_types: {
    id: string;
    name: string;
    description: string | null;
    type: "free_pratiche" | "periodic_free" | "discount_percent" | "discount_fixed";
    value: number | null;
    ciclo_pratiche: number | null;
    free_per_ciclo: number | null;
    validity_days: number | null;
  };
}

export function useCompanyPromos(companyId?: string) {
  return useQuery({
    queryKey: ["company-promos", companyId],
    queryFn: async (): Promise<CompanyPromo[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("company_promos")
        .select("*, promo_types(*)")
        .eq("company_id", companyId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as unknown as CompanyPromo[];
    },
    enabled: !!companyId,
  });
}

export function computeNextIsFree(promo: CompanyPromo): boolean {
  const type = promo.promo_types.type;
  if (type === "free_pratiche") {
    return (promo.pratiche_rimaste ?? 0) > 0;
  }
  if (type === "periodic_free") {
    const pos = promo.ciclo_posizione;
    const N = promo.promo_types.ciclo_pratiche;
    const M = promo.promo_types.free_per_ciclo;
    if (N == null || M == null) return false;
    return pos >= N - M;
  }
  return false;
}

export function getPromoDisplayInfo(promo: CompanyPromo): {
  label: string;
  detail: string;
  rimaste: number | null;
} {
  const type = promo.promo_types.type;

  if (type === "free_pratiche") {
    const rimaste = promo.pratiche_rimaste;
    const r = rimaste ?? 0;
    const detail = `${r} pratica${r !== 1 ? "e" : ""} gratuita${r !== 1 ? "e" : ""} rimasta${r !== 1 ? "e" : ""}`;
    return {
      label: promo.promo_types.name,
      detail,
      rimaste,
    };
  }

  if (type === "periodic_free") {
    const N = promo.promo_types.ciclo_pratiche ?? 1;
    const M = promo.promo_types.free_per_ciclo ?? 1;
    const pos = promo.ciclo_posizione;
    const posInCycle = pos % N;
    const isFreeSlot = posInCycle >= N - M;

    if (isFreeSlot) {
      const rimaste = N - posInCycle;
      return {
        label: promo.promo_types.name,
        detail: `Pratica GRATUITA (${posInCycle + 1}/${N} nel ciclo)`,
        rimaste,
      };
    } else {
      return {
        label: promo.promo_types.name,
        detail: `${N - M - posInCycle} pratiche pagate, poi ${M} gratis (ciclo ${N})`,
        rimaste: null,
      };
    }
  }

  return {
    label: promo.promo_types.name,
    detail: "",
    rimaste: null,
  };
}

export function useApplyCompanyPromo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      promo,
      praticaId,
    }: {
      promo: CompanyPromo;
      praticaId: string;
    }): Promise<{ isFree: boolean }> => {
      const isFree = computeNextIsFree(promo);
      const type = promo.promo_types.type;

      const updates: Record<string, number | string> = {
        pratiche_usate: promo.pratiche_usate + 1,
      };

      if (type === "free_pratiche" && isFree) {
        const newRimaste = (promo.pratiche_rimaste ?? 0) - 1;
        updates.pratiche_rimaste = newRimaste;
        updates.pratiche_gratuite_erogate = promo.pratiche_gratuite_erogate + 1;
        if (newRimaste <= 0) {
          updates.status = "exhausted";
        }
      }

      if (type === "periodic_free") {
        const N = promo.promo_types.ciclo_pratiche!;
        updates.ciclo_posizione = (promo.ciclo_posizione + 1) % N;
        if (isFree) {
          updates.pratiche_gratuite_erogate = promo.pratiche_gratuite_erogate + 1;
        }
      }

      const { error: updateError } = await supabase
        .from("company_promos")
        .update(updates)
        .eq("id", promo.id);
      if (updateError) throw updateError;

      if (isFree) {
        const { error: praticaError } = await supabase
          .from("pratiche")
          .update({ is_free: true })
          .eq("id", praticaId);
        if (praticaError) throw praticaError;
      }

      return { isFree };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["company-promos", variables.promo.company_id] });
    },
  });
}
