import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EneaLab from "./EneaLab";
import {
  ENEA_LAB_DRAFT_STORAGE_KEY,
  ENEA_LAB_PREVIEW_DRAFT_STORAGE_KEY,
} from "@/features/enea-lab/draftStorage";
import { ENEA_SHADOW_WORKFLOW_STORAGE_KEY } from "@/features/enea-lab/shadowWorkflow";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "@/features/enea-lab/mockPractices";

vi.mock("@/features/enea-lab/useReadOnlyQueue", () => ({
  useReadOnlyEneaQueue: () => ({
    data: ENEA_LAB_MOCK_PRACTICES,
    error: null,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/enea-lab/useDocumentAnalysis", () => ({
  useDocumentAnalysis: (practice: { id: string } | undefined) => ({
    data: practice ? ENEA_LAB_MOCK_ANALYSIS[practice.id] : undefined,
    error: null,
    isPending: false,
  }),
}));

describe("EneaLab", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("mostra la coda ombra e prepara una scheda senza chiamate esterne", () => {
    render(<EneaLab />);

    expect(screen.getByRole("heading", { name: "ENEA Lab" })).toBeInTheDocument();
    expect(screen.getAllByText("Cliente Demo Uno")).toHaveLength(2);
    expect(screen.getByText("Cliente Demo Due")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Genera pacchetto prova" }));

    expect(screen.getByText("Pacchetto di prova pronto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apri ENEA per prova" })).toBeEnabled();
    expect(screen.getByText("PROVA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copia comando unico ENEA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copia compilazione immobile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copia compilazione intervento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copia compilazione impianto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copia compilazione schermatura 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scarica bozza incompleta" })).toBeInTheDocument();
    expect(screen.getByText("nota-credito.pdf")).toBeInTheDocument();
  });

  it("non espone un comando ufficiale utilizzabile finché il gate pre-collaudo è bloccato", () => {
    render(<EneaLab />);

    fireEvent.click(screen.getByRole("button", { name: "Genera pacchetto prova" }));

    expect(screen.getByRole("button", { name: "Copia comando UFFICIALE ENEA" })).toBeDisabled();
    expect(screen.getByText(/Comando ufficiale bloccato:/)).toBeInTheDocument();
  });

  it("filtra la coda e mostra correttamente una ricerca senza risultati", () => {
    render(<EneaLab />);

    fireEvent.click(screen.getByRole("button", { name: "In attesa" }));
    expect(screen.getAllByText("Cliente Demo Due")).toHaveLength(2);
    expect(screen.queryByText("Cliente Demo Uno")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Cerca pratica" }), {
      target: { value: "codice inesistente" },
    });
    expect(screen.getByText(/Nessuna schermatura corrisponde ai filtri correnti\./)).toBeInTheDocument();
  });

  it("mantiene le correzioni durante il refresh e permette di azzerarle", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const firstRender = render(<EneaLab />);
    const input = screen.getByRole("textbox", { name: "Correzione Sesso" });
    fireEvent.change(input, { target: { value: "F" } });

    firstRender.unmount();
    render(<EneaLab />);

    expect(screen.getByText("F")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Azzera correzioni locali" }));
    expect(screen.getByRole("textbox", { name: "Correzione Sesso" })).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("mantiene modificabile una correzione e invalida il pacchetto precedente", () => {
    render(<EneaLab />);
    fireEvent.click(screen.getByRole("button", { name: "Genera pacchetto prova" }));
    expect(screen.getByRole("button", { name: "Apri ENEA per prova" })).toBeEnabled();

    const input = screen.getByRole("textbox", { name: "Correzione Sesso" });
    fireEvent.change(input, { target: { value: "F" } });

    expect(screen.getByRole("textbox", { name: "Correzione Sesso" })).toHaveValue("F");
    expect(screen.getByRole("button", { name: "Ripristina valore" })).toBeInTheDocument();
    expect(screen.getByText("Il pacchetto precedente non è più aggiornato")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apri ENEA per prova" })).toBeDisabled();
  });

  it("porta l'operatore dal blocco al campo da correggere", () => {
    render(<EneaLab />);

    fireEvent.click(screen.getByRole("button", {
      name: "Codice fiscale: Intervento umano richiesto.",
    }));

    expect(screen.getByRole("tab", { name: "1. Beneficiario" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("textbox", { name: "Correzione Codice fiscale" })).toBeInTheDocument();
  });

  it("permette di correggere anche un dato estratto che risultava gia pronto", () => {
    render(<EneaLab />);

    fireEvent.click(screen.getByRole("button", { name: "Correggi Nome" }));
    const input = screen.getByRole("textbox", { name: "Correzione Nome" });
    expect(input).toHaveValue("Cliente");

    fireEvent.change(input, { target: { value: "Nome Demo Corretto" } });
    expect(input).toHaveValue("Nome Demo Corretto");
    expect(screen.getByRole("button", { name: "Ripristina valore" })).toBeInTheDocument();
  });

  it("mantiene interazioni e persistenza nella preview senza aprire ENEA o usare rete", () => {
    window.history.replaceState({}, "", "/admin/enea-lab-preview");
    const crmDraft = JSON.stringify({
      overridesByPractice: { "crm-non-fixture": { "beneficiario.nome": "DATO-CRM-NON-FIXTURE" } },
      confirmedByPractice: {},
      preparedIds: ["crm-non-fixture"],
      preparedSnapshotsByPractice: {},
      savedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(ENEA_LAB_DRAFT_STORAGE_KEY, crmDraft);
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const webSocketSpy = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    vi.stubGlobal("WebSocket", webSocketSpy);

    render(<EneaLab />);
    fireEvent.click(screen.getByRole("button", { name: "In attesa" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca pratica" }), { target: { value: "Demo Due" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Correzione Sesso" }), { target: { value: "F" } });
    fireEvent.click(screen.getByRole("button", { name: "Genera pacchetto prova" }));

    expect(screen.getByRole("button", { name: "Apri ENEA per prova" })).toBeDisabled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(webSocketSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("DATO-CRM-NON-FIXTURE")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(ENEA_LAB_DRAFT_STORAGE_KEY)).toBe(crmDraft);
    expect(Object.keys(window.localStorage).sort()).toEqual([
      ENEA_LAB_DRAFT_STORAGE_KEY,
      ENEA_LAB_PREVIEW_DRAFT_STORAGE_KEY,
      ENEA_SHADOW_WORKFLOW_STORAGE_KEY,
    ].sort());
  });

  it("simula consenso SPID e lavorazione senza credenziali o servizi esterni", () => {
    window.history.replaceState({}, "", "/admin/enea-lab-preview");
    const fetchSpy = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal("fetch", fetchSpy);

    render(<EneaLab />);
    expect(screen.getByText("Richiesta SPID simulata")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /spid|password|otp/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Genera pacchetto prova" }));
    fireEvent.click(screen.getByRole("button", { name: "Acconsento alla simulazione SPID" }));
    fireEvent.click(screen.getByRole("button", { name: "Esegui lavorazione locale" }));

    expect(screen.getByText("Esito simulato: revisione richiesta")).toBeInTheDocument();
    const stored = window.localStorage.getItem(ENEA_SHADOW_WORKFLOW_STORAGE_KEY) ?? "";
    expect(stored).toContain("spid-demo-consent");
    expect(stored).toContain("local-review-required");
    expect(stored).not.toMatch(/Cliente Demo|example\.test|CF-DEMO|password|otp/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

});
