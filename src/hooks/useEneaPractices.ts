import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCompany } from "./useCompany";
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
  archivedOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const { resellerId: myResellerId, isInternal } = useAuth();
  // Quando un super_admin impersona un'azienda (CompanyContext.companyId override),
  // il JWT resta del super_admin (RLS bypassa filter tenant) — DEVE filtrare client-side
  const { companyId: impersonatedCompanyId, isImpersonating } = useCompany();
  const effectiveResellerScope = isImpersonating
    ? impersonatedCompanyId
    : (!isInternal ? myResellerId : null);

  return useQuery({
    queryKey: ["enea_practices", filters, effectiveResellerScope],
    queryFn: async () => {
      const archivedOnly = !!filters?.archivedOnly;
      let q = supabase
        .from("enea_practices_public")
        .select(`
          *,
          pipeline_stages(id, name, name_reseller, tooltip_text, is_visible_reseller, color, stage_type, brand),
          companies:reseller_id(id, ragione_sociale)
        `);

      // Order: archived-only viste ordinano per archived_at desc (più recenti)
      if (archivedOnly) {
        q = q.order("archived_at", { ascending: false });
      } else {
        q = q.order("created_at", { ascending: false });
      }

      if (filters?.brand) q = q.eq("brand", filters.brand);
      if (filters?.operatoreId) q = q.eq("operatore_id", filters.operatoreId);

      if (archivedOnly) {
        // Solo archiviate
        q = q.not("archived_at", "is", null);
      } else if (!filters?.includeArchived) {
        // Default: escludi archiviate
        q = q.is("archived_at", null);
      }

      if (filters?.search) {
        // Rimuove virgole e punti che rompono la sintassi or() di PostgREST
        const safeSearch = filters.search.replace(/[,.()'"%]/g, " ").trim();
        if (safeSearch) {
          q = q.or(
            `cliente_nome.ilike.%${safeSearch}%,cliente_cognome.ilike.%${safeSearch}%`
          );
        }
      }

      // Tenant scoping (in ordine di priorità):
      //   1) impersonation attiva (super_admin che agisce come azienda)
      //   2) reseller naturale (azienda_admin/rivenditore non-staff)
      //   3) filtro esplicito (es. operatore vuole vedere solo una company)
      if (effectiveResellerScope) {
        q = q.eq("reseller_id", effectiveResellerScope);
      } else if (filters?.resellerId) {
        q = q.eq("reseller_id", filters.resellerId);
      }

      // Pagination applied only if limit/offset esplicitamente passati.
      // Default (senza limit): nessun range applicato → Supabase default (1000 righe max).
      if (filters?.limit != null || filters?.offset != null) {
        const limit = filters.limit ?? 100;
        const offset = filters.offset ?? 0;
        q = q.range(offset, offset + limit - 1);
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

      // Audit trail cambio stage — lasciato vuoto per ora.
      // communication_log è riservato a comunicazioni cliente reali (email/WA/phone),
      // non per log interni. Per tracking stage history aggiungere una tabella dedicata
      // stage_history se necessario in futuro.
      void oldStageName;
      void newStageName;
      void userId;
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
