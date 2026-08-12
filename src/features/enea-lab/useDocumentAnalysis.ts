import { useQuery } from "@tanstack/react-query";
import { isIsolatedEneaPreview } from "@/appBootstrap";
import { analyzePracticeDocuments } from "./documentAnalysis";
import { ENEA_LAB_MOCK_ANALYSIS } from "./mockPractices";
import type { EneaLabSourcePractice } from "./types";

export function useDocumentAnalysis(practice: EneaLabSourcePractice | undefined) {
  const preview = isIsolatedEneaPreview(import.meta.env.DEV, window.location.pathname);
  return useQuery({
    queryKey: [
      "enea-lab",
      "document-analysis",
      practice?.id,
      practice?.documentPaths.map(({ path }) => path).join("|"),
    ],
    queryFn: async () => {
      if (preview) return ENEA_LAB_MOCK_ANALYSIS[practice!.id];
      const { supabase } = await import("@/integrations/supabase/client");
      return analyzePracticeDocuments(supabase, practice!);
    },
    enabled: Boolean(practice && (practice.queueStatus === "ready" || practice.queueStatus === "historical")),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
