import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EneaShadowCrm from "./EneaShadowCrm";
import { ENEA_SHADOW_IMPORT_STORAGE_KEY, IMPORT_CONFIRMATION_PHRASE, prepareSinglePracticeImport, saveImportedPractice } from "@/features/enea-shadow-crm/importBridge";

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
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<EneaShadowCrm />);

    expect(screen.getByText("LAB-SCH-001 — Cliente Demo Uno")).toBeInTheDocument();
    expect(screen.getByTestId("pilot-session-id")).toHaveTextContent("PILOT-CRM-ENEA-V1-LAB-SCHERMATURE-001");
    expect(screen.getByRole("heading", { name: "Procedura operativa del pilot" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Stampa riepilogo fixture" }));

    expect(screen.getByText(/Stato: Conclusa/)).toBeInTheDocument();
    expect(screen.getAllByText(/non inviata/).length).toBeGreaterThan(1);
    expect(screen.getByText(/versione 2/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Invia email$/ })).not.toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fixture-audit");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(printSpy).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /LAB-SCH-002/ }));
    expect(screen.getByText("LAB-SCH-002 — Cliente Demo Due")).toBeInTheDocument();
    expect(screen.getByText(/Stato: Ricevuta/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(socketSpy).not.toHaveBeenCalled();
  });

  it("allinea la checklist della fixture incompleta ai documenti DEMO validati", () => {
    render(<EneaShadowCrm />);
    fireEvent.click(screen.getByRole("button", { name: /LAB-SCH-002/ }));
    expect(screen.getByText("○ Analisi documentale fixture completata")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi fattura DEMO" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi bonifico DEMO" }));
    expect(screen.getByText("✓ Analisi documentale fixture completata")).toBeInTheDocument();
    expect(screen.getByText("✓ Dati sintetici pronti per istruttoria")).toBeInTheDocument();
  });

  it("richiede conferma e pulisce soltanto il pilot selezionato", () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fixture-full"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    localStorage.setItem("enea-shadow-crm:workflow:v1", JSON.stringify({ "lab-schermature-001": { stage: "assigned" }, "lab-schermature-002": { stage: "received" } }));
    render(<EneaShadowCrm />);
    const reset = screen.getByRole("button", { name: "Resetta singolo pilot fixture" });
    expect(reset).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Confermo la pulizia locale/));
    expect(reset).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Esporta pratica fixture JSON" }));
    expect(screen.getByText("Export preventivo: completato")).toBeInTheDocument();
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

  it("mostra soltanto contatti mascherati da uno snapshot sintetico importato", () => {
    const result = prepareSinglePracticeImport([{
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      code: "CRM-DEMO-002",
      cliente_nome: "NomeNonPersistibile",
      cliente_cognome: "CognomeNonPersistibile",
      cliente_email: "demo@example.invalid",
      cliente_telefono: "+39 000 765 4321",
      cliente_cf: "DMOSNT80A01F205X",
      prodotto_installato: "Schermature Solari",
      ricevuta_at: "2026-08-12T10:00:00Z",
      document_count: 3,
      form_complete: true,
    }], { confirmationPhrase: IMPORT_CONFIRMATION_PHRASE, singlePracticeConfirmed: true, localOnlyConfirmed: true, communicationsBlockedConfirmed: true });
    if (result.ok === false) throw new Error(result.reason);
    saveImportedPractice(localStorage, result.practice);
    render(<EneaShadowCrm />);
    expect(screen.getByTestId("masked-import")).toHaveTextContent("Cliente reale mascherato");
    expect(screen.getByTestId("masked-import")).toHaveTextContent("***@example.invalid");
    expect(screen.queryByText(/NomeNonPersistibile|CognomeNonPersistibile/)).not.toBeInTheDocument();
    expect(localStorage.getItem(ENEA_SHADOW_IMPORT_STORAGE_KEY)).not.toContain("NomeNonPersistibile");
  });
});
