import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import {
  loadReadOnlyEneaHistoricalQueue,
  loadReadOnlyEneaQueue,
} from "./readOnlySource";

export type EneaLabQueueScope = "active" | "historical";

function isLocalPreview(): boolean {
  return import.meta.env.DEV && window.location.pathname === "/admin/enea-lab-preview";
}

export function useReadOnlyEneaQueue(scope: EneaLabQueueScope = "active") {
  const preview = isLocalPreview();
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
