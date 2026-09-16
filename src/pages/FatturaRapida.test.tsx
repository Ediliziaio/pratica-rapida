import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FatturaRapida from "./FatturaRapida";

describe("percorso locale FatturaRapida", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("completa preventivo, conversione e richiesta locale senza rete", () => {
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const webSocketSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    vi.stubGlobal("WebSocket", webSocketSpy);
    render(<FatturaRapida />);
    fireEvent.click(screen.getByRole("button", { name: "Apri la demo locale" }));
    fireEvent.click(screen.getByRole("button", { name: "Entra nell'area riservata demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Nuovo preventivo" }));
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Cliente Sintetico" } });
    fireEvent.change(screen.getByLabelText("CF / Partita IVA"), { target: { value: "DEMO0000000000" } });
    fireEvent.change(screen.getByLabelText("Indirizzo"), { target: { value: "Via Demo 1" } });
    fireEvent.change(screen.getByLabelText("Articolo catalogo"), { target: { value: "screening-awning" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi catalogo" }));
    fireEvent.change(screen.getByLabelText("Tipo schermatura"), { target: { value: "tende_da_sole" } });
    fireEvent.change(screen.getByLabelText("Direzione schermatura"), { target: { value: "sud" } });
    fireEvent.change(screen.getByLabelText("Larghezza schermatura"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Altezza schermatura"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Trasforma in bozza fattura" }));
    expect(screen.getByText(/Bozza fattura creata/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chiedi pratica ENEA" }));
    expect(screen.getByText(/Richiesta PraticaRapida simulata localmente/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(webSocketSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
