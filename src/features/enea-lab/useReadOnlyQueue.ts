import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { runHistoricalEneaBatchAudit, type HistoricalBatchAuditReport } from "./historicalBatchAudit";
import {
  loadReadOnlyEneaHistoricalQueue,
  loadReadOnlyEneaQueue,
} from "./readOnlySource";
import {
  hasExplicitAprShadowAuthorization,
  type AprGlobalShadowUserAuthorization,
} from "./aprShadowAuthorization";
import { APR_SHADOW_RUNTIME_AUTHORIZATION } from "./aprShadowRuntimeAuthorization";

export type EneaLabQueueScope = "active" | "historical";
export type EneaLabQueueMode = "preview" | "pre-shadow" | "live-shadow";

declare global {
  interface Window {
    __ENEA_LAB_AUDIT_5__?: () => Promise<HistoricalBatchAuditReport>;
  }
}

function isLocalPreview(): boolean {
  return import.meta.env.DEV && window.location.pathname === "/admin/enea-lab-preview";
}

/**
 * Il laboratorio puo continuare a essere sviluppato sui mock prima del gate,
 * ma la sorgente CRM reale appartiene alla modalita OMBRA operativa e deve
 * quindi dipendere dalla stessa autorizzazione esplicita usata dal resto APR.
 */
export function resolveEneaLabQueueMode(
  preview: boolean,
  globalShadowAuthorization?: unknown,
): EneaLabQueueMode {
  if (preview) return "preview";
  return hasExplicitAprShadowAuthorization(globalShadowAuthorization)
    ? "live-shadow"
    : "pre-shadow";
}

export function useReadOnlyEneaQueue(
  scope: EneaLabQueueScope = "active",
  globalShadowAuthorization: AprGlobalShadowUserAuthorization | undefined = APR_SHADOW_RUNTIME_AUTHORIZATION,
) {
  const preview = isLocalPreview();
  const queueMode = resolveEneaLabQueueMode(preview, globalShadowAuthorization);

  useEffect(() => {
    // Anche l'audit storico legge pratiche CRM reali: prima del gate globale non
    // deve essere esposto tramite la scorciatoia DEV. La preview resta sempre mock.
    if (!import.meta.env.DEV || queueMode !== "live-shadow") return undefined;
    window.__ENEA_LAB_AUDIT_5__ = () => runHistoricalEneaBatchAudit(supabase, 5);
    return () => {
      delete window.__ENEA_LAB_AUDIT_5__;
    };
  }, [queueMode]);

  return useQuery({
    queryKey: ["enea-lab", "read-only-queue", queueMode, scope],
    queryFn: () => {
      // Pre-shadow e preview lavorano esclusivamente sui mock: nessuna SELECT
      // sulle pratiche reali finche l'utente non pronuncia il gate canonico.
      if (queueMode !== "live-shadow") return Promise.resolve(ENEA_LAB_MOCK_PRACTICES);
      return scope === "historical"
        ? loadReadOnlyEneaHistoricalQueue(supabase)
        : loadReadOnlyEneaQueue(supabase);
    },
    refetchInterval: queueMode === "live-shadow" ? 30_000 : false,
    staleTime: 15_000,
  });
}
