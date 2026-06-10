/**
 * useWaProvider — quale provider WhatsApp è attivo lato server?
 *
 *  - "meta":   Cloud API ufficiale → vale la finestra 24h (testo libero
 *              solo entro 24h dall'ultimo inbound, altrimenti template)
 *  - "openwa": gateway self-hosted whatsapp-web.js → NESSUNA finestra,
 *              testo libero sempre consentito
 *
 * Legge il valore dall'edge function send-whatsapp (action "get_provider").
 * Cache infinita: il provider cambia solo via secrets + redeploy.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WaProvider = "meta" | "openwa";

export function useWaProvider(): { provider: WaProvider; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["wa-provider"],
    queryFn: async (): Promise<WaProvider> => {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { action: "get_provider" },
      });
      if (error) return "meta"; // fallback prudente: vincoli Meta
      return (data as { provider?: string })?.provider === "openwa" ? "openwa" : "meta";
    },
    // 5 min: il provider cambia raramente (solo via secret + redeploy), ma
    // non vogliamo richiedere un hard-reload per vederlo aggiornato.
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
  return { provider: data ?? "meta", isLoading };
}
