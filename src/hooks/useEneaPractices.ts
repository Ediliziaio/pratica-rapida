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
          pipeline_stages(id, name, color, stage_type, brand),
          companies:reseller_id(id, ragione_sociale)
        `)
        .order("created_at", { ascending: false });

      if (filters?.brand) q = q.eq("brand", filters.brand);
      if (filters?.operatoreId) q = q.eq("operatore_id", filters.operatoreId);
      if (!filters?.includeArchived) q = q.is("archived_at", null);

      if (filters?.search) {
        q = q.or(
          `cliente_nome.ilike.%${filters.search}%,cliente_cognome.ilike.%${filters.search}%`
        );
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

      // 2. Log in communication_log
      await supabase.from("communication_log").insert({
        practice_id: practiceId,
        channel: "phone",
        direction: "inbound",
        recipient: userId,
        body_preview: `Stage spostata da "${oldStageName}" a "${newStageName}"`,
        status: "sent",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enea_practices"] });
    },
  });
}
