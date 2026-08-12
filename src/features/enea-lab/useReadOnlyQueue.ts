import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { isIsolatedEneaPreview } from "@/appBootstrap";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { runHistoricalEneaBatchAudit, type HistoricalBatchAuditReport } from "./historicalBatchAudit";
import {
  loadReadOnlyEneaHistoricalQueue,
  loadReadOnlyEneaQueue,
} from "./readOnlySource";

export type EneaLabQueueScope = "active" | "historical";

declare global {
  interface Window {
    __ENEA_LAB_AUDIT_5__?: () => Promise<HistoricalBatchAuditReport>;
  }
}

export function useReadOnlyEneaQueue(scope: EneaLabQueueScope = "active") {
  const preview = isIsolatedEneaPreview(import.meta.env.DEV, window.location.pathname);

  useEffect(() => {
    if (!import.meta.env.DEV || preview) return undefined;
    window.__ENEA_LAB_AUDIT_5__ = async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      return runHistoricalEneaBatchAudit(supabase, 5);
    };
    return () => {
      delete window.__ENEA_LAB_AUDIT_5__;
    };
  }, [preview]);

  return useQuery({
    queryKey: ["enea-lab", "read-only-queue", preview ? "preview" : "crm", scope],
    queryFn: async () => {
      if (preview) return Promise.resolve(ENEA_LAB_MOCK_PRACTICES);
      const { supabase } = await import("@/integrations/supabase/client");
      return scope === "historical"
        ? loadReadOnlyEneaHistoricalQueue(supabase)
        : loadReadOnlyEneaQueue(supabase);
    },
    refetchInterval: preview ? false : 30_000,
    staleTime: 15_000,
  });
}
