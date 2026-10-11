import { supabase } from "@/integrations/supabase/client";
import { cfNetPriceEurFromSettings, type CfPriceSettingRow } from "@/lib/cfPracticePrice";

export async function resolveCfNetPriceEur(resellerId: string): Promise<number> {
  const keys = ["prezzo_cf_standard", "prezzo_cf_sima_home", "cf_sima_home_company_id"];
  const { data, error } = await supabase
    .from("platform_settings")
    .select("key,value")
    .in("key", keys);
  if (error) throw error;
  return cfNetPriceEurFromSettings((data ?? []) as CfPriceSettingRow[], resellerId);
}
