import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadReadOnlyEneaQueue } from "./readOnlySource";

export function useReadOnlyEneaQueue() {
  return useQuery({
    queryKey: ["enea-lab", "read-only-queue"],
    queryFn: () => loadReadOnlyEneaQueue(supabase),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
