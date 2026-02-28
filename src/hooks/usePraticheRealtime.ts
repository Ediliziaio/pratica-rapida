import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { STATO_CONFIG } from "@/lib/pratiche-config";
import type { Database } from "@/integrations/supabase/types";

type PraticaStato = Database["public"]["Enums"]["pratica_stato"];

export function usePraticheRealtime() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel("pratiche-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pratiche",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;

          if (oldRow.stato !== newRow.stato) {
            const label = STATO_CONFIG[newRow.stato as PraticaStato]?.label ?? newRow.stato;
            toast.info(`Pratica "${newRow.titolo}" spostata in ${label}`);
          }

          queryClient.invalidateQueries({ queryKey: ["pratiche", companyId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pratiche",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["pratiche", companyId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);
}
