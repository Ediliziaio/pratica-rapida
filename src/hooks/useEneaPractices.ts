import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { EneaPractice, PipelineStage } from "@/integrations/supabase/types";

export function usePipelineStages(brand?: string) {
  const { resellerId, isInternal } = useAuth();

  return useQuery({
    queryKey: ["pipeline_stages", brand, resellerId],
    queryFn: async () => {
      let q = supabase
        .from("pipeline_stages")
        .select("*")
        .eq("is_visible", true)
        .order("order_index");

      if (brand) q = q.eq("brand", brand);

      // Rivenditore vede: stage di sistema (reseller_id IS NULL) + propri
      if (!isInternal && resellerId) {
        q = q.or(`reseller_id.is.null,reseller_id.eq.${resellerId}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as PipelineStage[];
    },
  });
}

export function useEneaPractices(filters?: {
  brand?: string;
  resellerId?: string;
  operatoreId?: string;
  search?: string;
  includeArchived?: boolean;
}) {
  const { resellerId: myResellerId, isInternal } = useAuth();

  return useQuery({
    queryKey: ["enea_practices", filters, myResellerId],
    queryFn: async () => {
      let q = supabase
        .from("enea_practices")
        .select(`
          *,
          pipeline_stages(id, name, name_reseller, tooltip_text, is_visible_reseller, color, stage_type, brand),
          companies:reseller_id(id, ragione_sociale)
        `)
        .order("created_at", { ascending: false });

      if (filters?.brand) q = q.eq("brand", filters.brand);
      if (filters?.operatoreId) q = q.eq("operatore_id", filters.operatoreId);
      if (!filters?.includeArchived) q = q.is("archived_at", null);

      if (filters?.search) {
        // Rimuove virgole e punti che rompono la sintassi or() di PostgREST
        const safeSearch = filters.search.replace(/[,.()'"%]/g, " ").trim();
        if (safeSearch) {
          q = q.or(
            `cliente_nome.ilike.%${safeSearch}%,cliente_cognome.ilike.%${safeSearch}%`
          );
        }
      }

      // Rivenditore vede solo le proprie
      if (!isInternal && myResellerId) {
        q = q.eq("reseller_id", myResellerId);
      } else if (filters?.resellerId) {
        q = q.eq("reseller_id", filters.resellerId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as (EneaPractice & {
        pipeline_stages: PipelineStage | null;
        companies: { id: string; ragione_sociale: string } | null;
      })[];
    },
  });
}

export function useMoveStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      practiceId,
      newStageId,
      oldStageName,
      newStageName,
      userId,
    }: {
      practiceId: string;
      newStageId: string;
      oldStageName: string;
      newStageName: string;
      userId: string;
    }) => {
      // 1. Update stage
      const { error } = await supabase
        .from("enea_practices")
        .update({ current_stage_id: newStageId })
        .eq("id", practiceId);
      if (error) throw error;

      // 2. Log in communication_log (non-bloccante — ignoriamo errori di logging)
      supabase.from("communication_log").insert({
        practice_id: practiceId,
        channel: "system",
        direction: "outbound",
        recipient: userId,
        body_preview: `Stage: "${oldStageName}" → "${newStageName}"`,
        status: "sent",
      }).then(({ error }) => {
        if (error) console.warn("communication_log insert failed:", error.message);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enea_practices"] });
    },
  });
}

export function useUpdateEneaPractice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<EneaPractice> }) => {
      const { error } = await supabase
        .from("enea_practices")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enea_practices"] });
    },
  });
}
