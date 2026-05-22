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
      // Select esplicito: evita colonne potenzialmente pesanti (es. eventuali
      // metadata/config JSONB future) e fa match con il type PipelineStage.
      // Riduce payload e rende esplicite le colonne effettivamente usate
      // dall'UI (filtro/grep più semplice quando si aggiungono colonne DB).
      let q = supabase
        .from("pipeline_stages")
        .select("id,reseller_id,name,name_reseller,tooltip_text,is_visible_reseller,stage_type,order_index,color,brand,is_visible,created_at")
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
    // Pipeline stages è configurazione quasi-statica (cambia solo via
    // /admin/impostazioni-piattaforma). Senza staleTime ogni mount del
    // Kanban / detail sheet / select "Sposta in..." rifa la fetch identica.
    staleTime: 10 * 60 * 1000, // 10min
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
      // 1. Update stage + verifica che la riga sia stata davvero modificata
      // (la RLS può non bloccare con error ma silenziosamente ritornare 0 rows
      // se la policy nega l'UPDATE → utente vede card "spostata" via optimistic
      // ma al refresh torna indietro perché il save non è mai stato applicato).
      // Forziamo .select() per ricevere le righe affette + .single() per
      // ottenere errore esplicito se 0 rows updated.
      const { data, error } = await supabase
        .from("enea_practices")
        .update({ current_stage_id: newStageId })
        .eq("id", practiceId)
        .select("id, current_stage_id")
        .single();

      if (error) {
        // Log dettagliato + rethrow con messaggio user-friendly
        console.error("[useMoveStage] UPDATE failed:", { practiceId, newStageId, error });
        throw new Error(
          error.message?.includes("policy")
            ? `Permessi insufficienti per spostare la pratica. Controlla le RLS o se il tuo ruolo permette UPDATE su enea_practices.`
            : `Save fallito: ${error.message ?? error.code ?? "errore sconosciuto"}`,
        );
      }
      if (!data || data.current_stage_id !== newStageId) {
        // Update silente: la query ha avuto successo ma 0 rows modificate o il
        // valore non corrisponde. Causa più comune: RLS che restringe l'UPDATE
        // (es. policy `USING (current_stage_id IN (lista valori del reseller))`)
        // O foreign key fallita lato DB. Forziamo error qui invece di lasciare
        // optimistic rollback silente.
        console.error("[useMoveStage] UPDATE 0 rows / mismatch:", { practiceId, newStageId, data });
        throw new Error("Save fallito: la pratica non è stata aggiornata (RLS o FK violation). Riprova o contatta l'admin.");
      }

      // Audit trail cambio stage — lasciato vuoto per ora.
      void oldStageName;
      void newStageName;
      void userId;
    },
    // Optimistic update: senza questo, dopo un drag&drop la card resta
    // visivamente "bloccata" sopra la pipeline finché il refetch (onSuccess)
    // non completa e ri-renderizza con i nuovi dati. Bug user-visible:
    // "card non sembra inserita, devo ricaricare la pagina".
    // Soluzione: aggiorniamo subito la cache react-query con il nuovo
    // current_stage_id + pipeline_stages (lookup), così il re-render
    // immediato post-mutation mostra la card già nella destination column.
    // onError fa rollback alla snapshot precedente per safety.
    onMutate: async ({ practiceId, newStageId }) => {
      // Cancella refetch in-flight per evitare race
      await queryClient.cancelQueries({ queryKey: ["enea_practices"] });

      // Snapshot di tutte le query enea_practices attive (per rollback)
      const previousData = queryClient.getQueriesData<EneaPractice[]>({
        queryKey: ["enea_practices"],
      });

      // Lookup del nuovo stage (per popolare il join pipeline_stages)
      const stagesCache = queryClient.getQueryData<PipelineStage[]>(["pipeline_stages"]);
      // Cerca in TUTTE le varianti di pipeline_stages (con brand filter)
      const allStageQueries = queryClient.getQueriesData<PipelineStage[]>({
        queryKey: ["pipeline_stages"],
      });
      const newStage = stagesCache?.find((s) => s.id === newStageId)
        ?? allStageQueries.flatMap(([, data]) => data ?? []).find((s) => s.id === newStageId)
        ?? null;

      // Update ottimistico: applica il nuovo current_stage_id + il join
      queryClient.setQueriesData<EneaPractice[]>(
        { queryKey: ["enea_practices"] },
        (old) => {
          if (!old) return old;
          return old.map((p) =>
            p.id === practiceId
              ? { ...p, current_stage_id: newStageId, pipeline_stages: newStage }
              : p,
          );
        },
      );

      return { previousData };
    },
    onError: (_err, _vars, context) => {
      // Rollback: ripristina tutte le query alla snapshot pre-mutation
      if (context?.previousData) {
        for (const [key, data] of context.previousData) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      // Allinea col server alla fine (sia success sia error), così se il
      // server ha rifiutato l'update vediamo lo stato reale.
      queryClient.invalidateQueries({ queryKey: ["enea_practices"] });
    },
  });
}

export function useUpdateEneaPractice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<EneaPractice> }) => {
      // Forziamo .select().single() come in useMoveStage per intercettare
      // UPDATE silenti (0 rows modificate per RLS / FK / trigger ribalta).
      // Senza questo, il caller riceve success ma in DB nulla è cambiato.
      const { data, error } = await supabase
        .from("enea_practices")
        .update(updates)
        .eq("id", id)
        .select("id")
        .single();
      if (error) {
        console.error("[useUpdateEneaPractice] UPDATE failed:", { id, updates, error });
        throw error;
      }
      if (!data) {
        throw new Error("Aggiornamento fallito: nessuna riga modificata (RLS o FK)");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enea_practices"] });
    },
    // Defense in depth: tutti i callsite ATTUALI usano mutateAsync con
    // try/catch ma se in futuro qualcuno usa .mutate() senza wrap, almeno
    // logghiamo l'errore in console invece di silent.
    onError: (err) => {
      console.error("[useUpdateEneaPractice] mutation error:", err);
    },
  });
}
