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
    enabled: Boolean(practice && (practice.queueStatus === "ready" || practice.queueStatus === "historical")),
    // I percorsi storage possono restare identici anche se una fattura viene
    // sostituita/corretta. Non possiamo quindi considerare l'analisi valida per
    // cinque minuti soltanto perché la query key non è cambiata: la ground truth
    // documentale va riletta con la stessa cadenza della coda e al ritorno nella
    // finestra, così un pacchetto preparato viene invalidato appena cambiano i
    // dati estratti dal documento corrente.
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: 1,
  });
}
