import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { loadReadOnlyEneaQueue } from "./readOnlySource";

function isLocalPreview(): boolean {
  return import.meta.env.DEV && window.location.pathname === "/admin/enea-lab-preview";
}

export function useReadOnlyEneaQueue() {
  const preview = isLocalPreview();
  return useQuery({
    queryKey: ["enea-lab", "read-only-queue", preview ? "preview" : "crm"],
    queryFn: () => preview ? Promise.resolve(ENEA_LAB_MOCK_PRACTICES) : loadReadOnlyEneaQueue(supabase),
    refetchInterval: preview ? false : 30_000,
    staleTime: 15_000,
  });
}
