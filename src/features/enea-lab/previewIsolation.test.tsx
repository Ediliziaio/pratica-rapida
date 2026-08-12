import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRootComponent, reloadIntoIsolatedEneaPreview, reloadIntoIsolatedEneaShell } from "@/appBootstrap";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { useDocumentAnalysis } from "./useDocumentAnalysis";
import { useReadOnlyEneaQueue } from "./useReadOnlyQueue";

const supabaseAccess = vi.hoisted(() => vi.fn());
const supabaseInitialization = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => {
  supabaseInitialization();
  return { supabase: new Proxy({}, {
    get: (_target, property) => {
      supabaseAccess(String(property));
      throw new Error(`La preview non deve accedere a Supabase: ${String(property)}`);
    },
  }) };
});

describe("isolamento fixture della preview ENEA", () => {
  let queryClient: QueryClient;
  const fetchSpy = vi.fn();
  const xhrSpy = vi.fn();
  const webSocketSpy = vi.fn();

  beforeEach(() => {
    window.history.replaceState({}, "", "/admin/enea-lab-preview");
    supabaseAccess.mockClear();
    supabaseInitialization.mockClear();
    fetchSpy.mockClear();
    xhrSpy.mockClear();
    webSocketSpy.mockClear();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    vi.stubGlobal("WebSocket", webSocketSpy);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  it("usa soltanto fixture locali senza rete, client reale o polling", async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const practice = ENEA_LAB_MOCK_PRACTICES[0];
    const queue = renderHook(() => useReadOnlyEneaQueue(), { wrapper });
    const analysis = renderHook(() => useDocumentAnalysis(practice), { wrapper });

    await waitFor(() => {
      expect(queue.result.current.data).toEqual(ENEA_LAB_MOCK_PRACTICES);
      expect(analysis.result.current.data).toEqual(ENEA_LAB_MOCK_ANALYSIS[practice.id]);
    });

    const queueQuery = queryClient.getQueryCache().find({
      queryKey: ["enea-lab", "read-only-queue", "preview", "active"],
    });
    expect((queueQuery?.options as { refetchInterval?: unknown }).refetchInterval).toBe(false);
    expect(supabaseAccess).not.toHaveBeenCalled();
    expect(supabaseInitialization).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(webSocketSpy).not.toHaveBeenCalled();
    expect(window.__ENEA_LAB_AUDIT_5__).toBeUndefined();
  });

  it("carica la shell isolata senza importare App/AuthProvider", async () => {
    const app = vi.fn();
    const preview = vi.fn().mockResolvedValue({ default: () => null });

    await loadRootComponent(true, "/admin/enea-lab-preview", { app, preview });

    expect(preview).toHaveBeenCalledOnce();
    expect(app).not.toHaveBeenCalled();
    expect(supabaseInitialization).not.toHaveBeenCalled();
  });

  it("considera lo slash finale parte della stessa preview isolata", async () => {
    const app = vi.fn();
    const preview = vi.fn().mockResolvedValue({ default: () => null });

    await loadRootComponent(true, "/admin/enea-lab-preview/", { app, preview });

    expect(preview).toHaveBeenCalledOnce();
    expect(app).not.toHaveBeenCalled();
  });

  it("carica anche il CRM ombra nella shell isolata solo in DEV", async () => {
    const app = vi.fn().mockResolvedValue({ default: () => null });
    const preview = vi.fn().mockResolvedValue({ default: () => null });
    await loadRootComponent(true, "/admin/enea-crm-ombra/", { app, preview });
    await loadRootComponent(false, "/admin/enea-crm-ombra", { app, preview });
    expect(preview).toHaveBeenCalledOnce();
    expect(app).toHaveBeenCalledOnce();
  });

  it("preserva query e hash nell'handoff isolato del CRM ombra", () => {
    const replace = vi.fn();
    reloadIntoIsolatedEneaShell({ search: "?pratica=lab", hash: "#audit", replace }, "/admin/enea-crm-ombra");
    expect(replace).toHaveBeenCalledWith("/admin/enea-crm-ombra?pratica=lab#audit");
  });

  it("trasforma l'ingresso SPA in un reload canonico preservando query e hash", () => {
    const replace = vi.fn();

    reloadIntoIsolatedEneaPreview({ search: "?audit=local", hash: "#fixture", replace });

    expect(replace).toHaveBeenCalledWith("/admin/enea-lab-preview?audit=local#fixture");
  });

  it("mantiene tutte le route non-preview e la production sulla shell reale", async () => {
    const app = vi.fn().mockResolvedValue({ default: () => null });
    const preview = vi.fn();

    await loadRootComponent(true, "/admin/enea-lab", { app, preview });
    await loadRootComponent(false, "/admin/enea-lab-preview", { app, preview });

    expect(app).toHaveBeenCalledTimes(2);
    expect(preview).not.toHaveBeenCalled();
  });
});
