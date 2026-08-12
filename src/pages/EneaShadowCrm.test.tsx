import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EneaShadowCrm from "./EneaShadowCrm";

describe("CRM ombra ENEA locale", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lavora più pratiche fixture senza rete né invio email", () => {
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const socketSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    vi.stubGlobal("WebSocket", socketSpy);
    const createObjectURL = vi.fn(() => "blob:fixture-audit");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<EneaShadowCrm />);

    expect(screen.getByText("LAB-SCH-001 — Cliente Demo Uno")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi fattura DEMO" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi bonifico DEMO" }));
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi DEMO-FATTURA.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi fattura DEMO" }));
    fireEvent.change(screen.getByLabelText("Assegnatario"), { target: { value: "operatore-demo-anna" } });
    fireEvent.change(screen.getByLabelText("Priorità"), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: "Avvia lavorazione" }));
    fireEvent.click(screen.getByRole("button", { name: "Invia a revisione" }));
    fireEvent.click(screen.getByRole("button", { name: "Crea bozza aggiornamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Crea bozza aggiornamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Crea bozza documenti mancanti" }));
    expect(screen.getByText("Readiness pilot interno: PRONTA")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Concludi pratica fixture" }));
    fireEvent.click(screen.getByRole("button", { name: "Esporta audit fixture JSON" }));

    expect(screen.getByText(/Stato: Conclusa/)).toBeInTheDocument();
    expect(screen.getAllByText(/non inviata/).length).toBeGreaterThan(1);
    expect(screen.getByText(/versione 2/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Invia email$/ })).not.toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fixture-audit");
    expect(clickSpy).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /LAB-SCH-002/ }));
    expect(screen.getByText("LAB-SCH-002 — Cliente Demo Due")).toBeInTheDocument();
    expect(screen.getByText(/Stato: Ricevuta/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(socketSpy).not.toHaveBeenCalled();
  });

  it("richiede conferma e pulisce soltanto il pilot selezionato", () => {
    localStorage.setItem("enea-shadow-crm:workflow:v1", JSON.stringify({ "lab-schermature-001": { stage: "assigned" }, "lab-schermature-002": { stage: "received" } }));
    render(<EneaShadowCrm />);
    const reset = screen.getByRole("button", { name: "Resetta singolo pilot fixture" });
    expect(reset).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Confermo la pulizia locale/));
    fireEvent.click(reset);
    const persisted = JSON.parse(localStorage.getItem("enea-shadow-crm:workflow:v1") ?? "{}");
    expect(persisted).not.toHaveProperty("lab-schermature-001");
    expect(persisted).toHaveProperty("lab-schermature-002");
    expect(screen.getByText(/Stato: Ricevuta/)).toBeInTheDocument();
  });

  it("ricerca e filtra la coda per stato e assegnatario sintetico", () => {
    render(<EneaShadowCrm />);
    fireEvent.change(screen.getByLabelText("Cerca pratiche"), { target: { value: "Demo Due" } });
    expect(screen.getByRole("button", { name: /LAB-SCH-002/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /LAB-SCH-001/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cerca pratiche"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Assegnatario"), { target: { value: "operatore-demo-luca" } });
    expect(screen.getByLabelText("Riepilogo stati")).toHaveTextContent("Assegnate 1");
    fireEvent.change(screen.getByLabelText("Filtra per assegnatario"), { target: { value: "operatore-demo-luca" } });
    expect(screen.getByRole("button", { name: /LAB-SCH-001/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /LAB-SCH-002/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filtra per stato"), { target: { value: "received" } });
    expect(screen.getByText("Nessuna pratica fixture trovata.")).toBeInTheDocument();
  });
});
