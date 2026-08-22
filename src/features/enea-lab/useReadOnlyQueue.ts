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
import {
  loadAprInfissiTargetSession,
  type AprInfissiTargetSession,
} from "./infissiTargetSession";

export type EneaLabQueueScope = "active" | "historical";
export type EneaLabQueueMode = "preview" | "pre-shadow" | "live-shadow";

declare global {
  interface Window {
    __ENEA_LAB_AUDIT_5__?: () => Promise<HistoricalBatchAuditReport>;
    __APR_INFISSI_SEBASTIAN_READONLY__?: () => Promise<AprInfissiTargetSession>;
  }
}

function isLocalPreview(): boolean {
  return import.meta.env.DEV && window.location.pathname === "/admin/enea-lab-preview";
}

/**
 * Il laboratorio puo continuare a essere sviluppato sui mock prima del gate,
 * ma la sorgente CRM reale generale appartiene alla modalita OMBRA operativa.
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
    if (!import.meta.env.DEV) return undefined;

    // Eccezione di collaudo strettamente nominativa richiesta dall'utente:
    // una sola pratica Infissi, SELECT/download soltanto, Erremme esclusa.
    // Non modifica il gate OMBRA globale e non abilita la coda CRM generale.
    window.__APR_INFISSI_SEBASTIAN_READONLY__ = () => loadAprInfissiTargetSession(supabase);

    if (queueMode === "live-shadow") {
      window.__ENEA_LAB_AUDIT_5__ = () => runHistoricalEneaBatchAudit(supabase, 5);
    }

    return () => {
      delete window.__APR_INFISSI_SEBASTIAN_READONLY__;
      delete window.__ENEA_LAB_AUDIT_5__;
    };
  }, [queueMode]);

  return useQuery({
    queryKey: ["enea-lab", "read-only-queue", queueMode, scope],
    queryFn: () => {
      // La coda generale resta mock finché il gate canonico non è concesso.
      if (queueMode !== "live-shadow") return Promise.resolve(ENEA_LAB_MOCK_PRACTICES);
      return scope === "historical"
        ? loadReadOnlyEneaHistoricalQueue(supabase)
        : loadReadOnlyEneaQueue(supabase);
    },
    refetchInterval: queueMode === "live-shadow" ? 30_000 : false,
    staleTime: 15_000,
  });
}
