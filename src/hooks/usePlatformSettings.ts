import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SLASettings {
  presaInCaricoOre: number;
  completamentoOre: number;
}

const DEFAULT_SLA: SLASettings = { presaInCaricoOre: 24, completamentoOre: 120 };

export function useSLASettings() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-settings", "sla_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "sla_settings")
        .maybeSingle();
      return (data?.value as unknown as SLASettings) ?? DEFAULT_SLA;
    },
    staleTime: 5 * 60 * 1000,
  });

  return { sla: data ?? DEFAULT_SLA, loading: isLoading };
}
