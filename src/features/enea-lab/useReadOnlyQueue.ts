import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

function isLocalPreview(): boolean {
  return import.meta.env.DEV && window.location.pathname === "/admin/enea-lab-preview";
}

export function useReadOnlyEneaQueue(scope: EneaLabQueueScope = "active") {
  const preview = isLocalPreview();

  useEffect(() => {
    if (!import.meta.env.DEV || preview) return undefined;
    window.__ENEA_LAB_AUDIT_5__ = () => runHistoricalEneaBatchAudit(supabase, 5);
    return () => {
      delete window.__ENEA_LAB_AUDIT_5__;
    };
  }, [preview]);

  return useQuery({
    queryKey: ["enea-lab", "read-only-queue", preview ? "preview" : "crm", scope],
    queryFn: () => {
      if (preview) return Promise.resolve(ENEA_LAB_MOCK_PRACTICES);
      return scope === "historical"
        ? loadReadOnlyEneaHistoricalQueue(supabase)
        : loadReadOnlyEneaQueue(supabase);
    },
    refetchInterval: preview ? false : 30_000,
    staleTime: 15_000,
  });
}
