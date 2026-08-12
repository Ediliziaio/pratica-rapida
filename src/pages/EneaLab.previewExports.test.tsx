import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "@/features/enea-lab/mockPractices";
import EneaLab from "./EneaLab";

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

type CapturedBlob = {
  parts: unknown[];
  type: string;
};

const forbiddenExternalContent = /https?:\/\/|wss?:\/\/|supabase|service[_-]?role|anon[_-]?key|VITE_|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/i;

describe("EneaLab preview exports", () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

  beforeEach(() => {
    window.history.replaceState({}, "", "/admin/enea-lab-preview");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
    if (originalCreateObjectURL) Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
    else Reflect.deleteProperty(URL, "createObjectURL");
    if (originalRevokeObjectURL) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
    else Reflect.deleteProperty(URL, "revokeObjectURL");
    window.history.replaceState({}, "", "/");
  });

  it("copia soltanto payload e script derivati dalle fixture senza rete o azioni esterne", async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async (value: string) => copied.push(value)) },
    });
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const webSocketSpy = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    vi.stubGlobal("WebSocket", webSocketSpy);

    render(<EneaLab />);
    fireEvent.click(screen.getByRole("button", { name: "Genera pacchetto prova" }));

    const copyActions = [
      "Copia comando unico ENEA",
      "Copia prova",
      "Copia compilazione anagrafica",
      "Copia compilazione immobile",
      "Copia compilazione intervento",
      "Copia compilazione impianto",
      "Copia compilazione schermatura 1",
      "Copia bozza ufficiale",
    ];
    for (const name of copyActions) {
      fireEvent.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(copied).toHaveLength(copyActions.indexOf(name) + 1));
    }

    expect(screen.getByRole("button", { name: "Copia comando UFFICIALE ENEA" })).toBeDisabled();
    expect(copied).toHaveLength(copyActions.length);
    for (const content of copied) {
      expect(content).not.toMatch(forbiddenExternalContent);
      expect(content.length).toBeGreaterThan(100);
    }
    expect(JSON.parse(copied[1])).toMatchObject({ mode: "test", practiceCode: "LAB-SCH-001" });
    expect(JSON.parse(copied[7])).toMatchObject({ mode: "official", practiceCode: "LAB-SCH-001" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(webSocketSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("mantiene le sorgenti delle fixture prive di endpoint reali e credenziali", () => {
    const fixtures = JSON.stringify({
      practices: ENEA_LAB_MOCK_PRACTICES,
      analyses: ENEA_LAB_MOCK_ANALYSIS,
    });

    expect(fixtures).not.toMatch(forbiddenExternalContent);
    expect(fixtures).toContain("mock://fattura-01.pdf");
    expect(fixtures).toContain("cliente.uno@example.test");
    expect(fixtures).toContain("CF-DEMO-001-NON-VALIDO");
    expect(fixtures).not.toMatch(/(?:sk|sbp|eyJ)[_-][a-z0-9_-]{16,}/i);
  });

  it("scarica JSON fixture con filename e MIME locali e revoca gli object URL", () => {
    const blobs: CapturedBlob[] = [];
    class LocalBlob {
      readonly parts: unknown[];
      readonly type: string;

      constructor(parts: unknown[], options?: { type?: string }) {
        this.parts = parts;
        this.type = options?.type ?? "";
        blobs.push(this);
      }
    }
    vi.stubGlobal("Blob", LocalBlob);
    const createObjectURL = vi.fn((blob: CapturedBlob) => `blob:enea-lab-${blobs.indexOf(blob)}`);
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const downloads: Array<{ href: string; filename: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function captureDownload() {
      downloads.push({ href: this.href, filename: this.download });
    });
    const fetchSpy = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal("fetch", fetchSpy);

    render(<EneaLab />);
    fireEvent.click(screen.getByRole("button", { name: "Genera pacchetto prova" }));
    fireEvent.click(screen.getByRole("button", { name: "Scarica prova" }));
    fireEvent.click(screen.getByRole("button", { name: "Scarica bozza incompleta" }));

    expect(downloads).toEqual([
      { href: "blob:enea-lab-0", filename: "lab-sch-001-enea-test.json" },
      { href: "blob:enea-lab-1", filename: "lab-sch-001-enea-official.json" },
    ]);
    expect(blobs.map((blob) => blob.type)).toEqual(["application/json", "application/json"]);
    expect(revokeObjectURL).toHaveBeenNthCalledWith(1, "blob:enea-lab-0");
    expect(revokeObjectURL).toHaveBeenNthCalledWith(2, "blob:enea-lab-1");

    const payloads = blobs.map((blob) => JSON.parse(String(blob.parts[0])));
    expect(payloads).toMatchObject([
      { mode: "test", practiceCode: "LAB-SCH-001" },
      { mode: "official", practiceCode: "LAB-SCH-001" },
    ]);
    for (const payload of payloads) {
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toMatch(forbiddenExternalContent);
      expect(serialized).toContain("LAB-SCH-001");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
