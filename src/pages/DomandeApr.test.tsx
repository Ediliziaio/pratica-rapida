import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DOMANDE = {
  readAt: "2026-09-14T08:00:00.000Z",
  run: { runId: "apr-workable76-r123", status: "completed", cohorts: ["a", "b"] },
  count: 2,
  questions: [
    { id: "stop:rossella-munafo:1", displayName: "Rossella Munafò", field: "operator.pendingData", prompt: "Puoi fornire il dato mancante indicato nella richiesta?", pendingRequest: { question: "Indica le misure della bioclimatica.", missingDocumentType: "foglio manoscritto", requestedAt: "2026-09-11T09:37:00.000Z", previousAnswer: "Non ancora identificato." } },
    { id: "measure:sarah-mondini:1", displayName: "Sarah Mondini", field: "screenings.1.dimensions", prompt: "Mancano le misure della pergotenda.", pendingRequest: null },
  ],
};

async function pagina(ombra: boolean) {
  vi.resetModules();
  vi.stubEnv("VITE_CRM_OMBRA", ombra ? "true" : "");
  const { default: DomandeApr } = await import("./DomandeApr");
  return DomandeApr;
}

describe("pagina Domande APR nel CRM ombra", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("fuori dall'ombra non mostra nulla e non chiama il server", async () => {
    const DomandeApr = await pagina(false);
    render(<DomandeApr />);
    expect(screen.getByText("Questa pagina esiste solo nel CRM ombra.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("legge le domande dal server locale, mostra il dato richiesto e registra la risposta", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/open-questions")) return new Response(JSON.stringify(DOMANDE));
      if (String(url).endsWith("/api/answers")) {
        expect(JSON.parse(String(init?.body))).toEqual({ questionId: "stop:rossella-munafo:1", answer: "Bioclimatica 400x300 cm" });
        return new Response(JSON.stringify({ ok: true, note: null, supersededResponseIds: ["a", "b"], supersededRuleConfirmations: [{ responseId: "response:rule:x" }] }));
      }
      throw new Error(`url inattesa ${url}`);
    });
    const DomandeApr = await pagina(true);
    render(<DomandeApr />);
    await screen.findByText("Rossella Munafò");
    expect(screen.getByText(/2 domande aperte · giro apr-workable76-r123 \(completed, 2 pratiche lavorate\)/)).toBeInTheDocument();
    expect(screen.getByText("Dato richiesto: Indica le misure della bioclimatica.")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8790/api/open-questions");

    const campi = screen.getAllByPlaceholderText("Scrivi la risposta");
    fireEvent.change(campi[0], { target: { value: "Bioclimatica 400x300 cm" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Registra" })[0]);
    await waitFor(() => expect(screen.getByText("Registrata. Sostituisce 2 risposta/e precedente/i.")).toBeInTheDocument());
    expect(screen.getByText(/ha superato una conferma di regola generale/)).toBeInTheDocument();
  });

  it("se il server locale non risponde lo dice, con il comando per avviarlo", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));
    const DomandeApr = await pagina(true);
    render(<DomandeApr />);
    await screen.findByText(/Server delle domande non raggiungibile su http:\/\/127\.0\.0\.1:8790/);
    expect(screen.getByText(/node src\/features\/enea-shadow-crm\/operator-answers\/server\.ts/)).toBeInTheDocument();
  });
});
