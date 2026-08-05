import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { analyzePracticeDocuments } from "./documentAnalysis";
import { ENEA_LAB_MOCK_ANALYSIS } from "./mockPractices";
import type { EneaLabSourcePractice } from "./types";

export function useDocumentAnalysis(practice: EneaLabSourcePractice | undefined) {
  const preview = import.meta.env.DEV && window.location.pathname === "/admin/enea-lab-preview";
  return useQuery({
    queryKey: [
      "enea-lab",
      "document-analysis",
      practice?.id,
      practice?.documentPaths.map(({ path }) => path).join("|"),
    ],
    queryFn: () => preview
      ? Promise.resolve(ENEA_LAB_MOCK_ANALYSIS[practice!.id])
      : analyzePracticeDocuments(supabase, practice!),
    enabled: Boolean(practice && practice.queueStatus === "ready"),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
