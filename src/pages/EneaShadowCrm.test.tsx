import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EneaShadowCrm from "./EneaShadowCrm";

describe("CRM ombra ENEA locale", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("lavora più pratiche fixture senza rete né invio email", () => {
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const socketSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    vi.stubGlobal("WebSocket", socketSpy);
    render(<EneaShadowCrm />);

    expect(screen.getByText("LAB-SCH-001 — Cliente Demo Uno")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Assegnatario"), { target: { value: "operatore-demo-anna" } });
    fireEvent.change(screen.getByLabelText("Priorità"), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: "Avvia lavorazione" }));
    fireEvent.click(screen.getByRole("button", { name: "Invia a revisione" }));
    fireEvent.click(screen.getByRole("button", { name: "Prepara bozza email" }));
    fireEvent.click(screen.getByRole("button", { name: "Concludi pratica fixture" }));

    expect(screen.getByText(/Stato: Conclusa/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Questa bozza non è stata inviata/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Invia email$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /LAB-SCH-002/ }));
    expect(screen.getByText("LAB-SCH-002 — Cliente Demo Due")).toBeInTheDocument();
    expect(screen.getByText(/Stato: Ricevuta/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(socketSpy).not.toHaveBeenCalled();
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
