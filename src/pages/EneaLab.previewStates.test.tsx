import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EneaLab from "./EneaLab";

const queueState = vi.hoisted(() => ({
  value: { data: [] as never[], error: null as Error | null, isPending: false, isFetching: false, refetch: vi.fn() },
}));
const supabaseAccess = vi.hoisted(() => vi.fn());

vi.mock("@/features/enea-lab/useReadOnlyQueue", () => ({
  useReadOnlyEneaQueue: () => queueState.value,
}));

vi.mock("@/features/enea-lab/useDocumentAnalysis", () => ({
  useDocumentAnalysis: () => ({ data: undefined, error: null, isPending: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: (_target, property) => supabaseAccess(String(property)) }),
}));

describe("stati preview fixture ENEA", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/admin/enea-lab-preview");
    queueState.value = { data: [], error: null, isPending: false, isFetching: false, refetch: vi.fn() };
    supabaseAccess.mockClear();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("XMLHttpRequest", vi.fn());
    vi.stubGlobal("WebSocket", vi.fn());
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  function expectNoExternalActivity() {
    expect(fetch).not.toHaveBeenCalled();
    expect(XMLHttpRequest).not.toHaveBeenCalled();
    expect(WebSocket).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(supabaseAccess).not.toHaveBeenCalled();
  }

  it("mostra il caricamento delle fixture senza citare o contattare il CRM", () => {
    queueState.value.isPending = true;
    render(<EneaLab />);
    expect(screen.getByText("Caricamento fixture locali in corso…")).toBeInTheDocument();
    expect(screen.queryByText(/coda CRM/i)).not.toBeInTheDocument();
    expectNoExternalActivity();
  });

  it("mostra una coda fixture vuota senza dichiarare polling", () => {
    render(<EneaLab />);
    expect(screen.getByText("Nessuna schermatura è presente nelle fixture locali.")).toBeInTheDocument();
    expect(screen.queryByText(/30 secondi/i)).not.toBeInTheDocument();
    expectNoExternalActivity();
  });

  it("diagnostica un errore fixture senza suggerire configurazioni reali", () => {
    queueState.value.error = new Error("fixture non disponibile");
    render(<EneaLab />);
    expect(screen.getByText("Le fixture locali non sono disponibili. Nessun servizio esterno è stato contattato.")).toBeInTheDocument();
    expect(screen.queryByText(/Supabase|sessione locale/i)).not.toBeInTheDocument();
    expectNoExternalActivity();
  });
});
