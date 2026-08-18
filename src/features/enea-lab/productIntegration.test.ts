import { describe, expect, it, vi } from "vitest";
import {
  detectAprProductType,
  loadReadOnlyAprProductIntegrationInventory,
  mapAprProductInventoryRow,
  summarizeAprProductInventory,
  type AprProductInventoryRow,
} from "./productIntegration";

const baseRow = {
  id: "00000000-0000-4000-8000-000000000001",
  prodotto_installato: "Schermature solari",
  form_compilato_at: "2026-08-18T10:00:00.000Z",
  fatture_urls: ["00000000-0000-4000-8000-000000000001/fattura.pdf"],
  documenti_aggiuntivi_urls: [],
  pratica_enea_conclusa_urls: [],
  pipeline_stages: { stage_type: "pronte_da_fare" },
};

describe("integrazione multi-prodotto APR", () => {
  it("classifica i quattro prodotti supportati senza usare il fallback infissi", () => {
    expect(detectAprProductType("Infissi e serramenti")).toBe("infissi");
    expect(detectAprProductType("Tende e schermature solari")).toBe("schermature");
    expect(detectAprProductType("Pompa di calore")).toBe("impianto_termico");
    expect(detectAprProductType("Insufflaggio tetto")).toBe("insufflaggio");
    expect(detectAprProductType("Prodotto non ancora censito")).toBe("unknown");
  });

  it("mantiene gli altri prodotti in intake-only e impedisce sempre l'invio ufficiale", () => {
    const infissi = mapAprProductInventoryRow({ ...baseRow, prodotto_installato: "Infissi" });
    const impianto = mapAprProductInventoryRow({ ...baseRow, prodotto_installato: "Pompa di calore" });
    const insufflaggio = mapAprProductInventoryRow({ ...baseRow, prodotto_installato: "Insufflaggio" });
    const schermature = mapAprProductInventoryRow(baseRow);

    for (const row of [infissi, impianto, insufflaggio]) {
      expect(row?.integrationPhase).toBe("intake-only");
      expect(row?.shadowEvaluationAllowed).toBe(false);
      expect(row?.officialSubmissionAllowed).toBe(false);
    }
    expect(schermature?.integrationPhase).toBe("screenings-validated");
    expect(schermature?.shadowEvaluationAllowed).toBe(true);
    expect(schermature?.officialSubmissionAllowed).toBe(false);
  });

  it("produce metriche per scegliere il prossimo prodotto in base al corpus reale disponibile", () => {
    const rows = [
      mapAprProductInventoryRow(baseRow),
      mapAprProductInventoryRow({
        ...baseRow,
        id: "00000000-0000-4000-8000-000000000002",
        prodotto_installato: "Infissi",
      }),
      mapAprProductInventoryRow({
        ...baseRow,
        id: "00000000-0000-4000-8000-000000000003",
        prodotto_installato: "Infissi",
        pipeline_stages: { stage_type: "archiviate" },
        pratica_enea_conclusa_urls: ["00000000-0000-4000-8000-000000000003/enea.pdf"],
      }),
      mapAprProductInventoryRow({
        ...baseRow,
        id: "00000000-0000-4000-8000-000000000004",
        prodotto_installato: "Non classificato",
      }),
    ].filter((row): row is AprProductInventoryRow => row !== null);

    const summary = summarizeAprProductInventory(rows);
    expect(summary.total).toBe(4);
    expect(summary.unknown).toBe(1);
    expect(summary.byProduct.infissi.total).toBe(2);
    expect(summary.byProduct.infissi.activeReady).toBe(1);
    expect(summary.byProduct.infissi.historicalWithCompletedEnea).toBe(1);
    expect(summary.byProduct.infissi.withInvoices).toBe(2);
  });

  it("carica l'inventario con sole SELECT e senza campi anagrafici del cliente", async () => {
    const calls: string[] = [];
    const query = {
      select: vi.fn((selection: string) => { calls.push(`select:${selection}`); return query; }),
      eq: vi.fn(() => { calls.push("eq"); return query; }),
      in: vi.fn(() => { calls.push("in"); return query; }),
      order: vi.fn(() => { calls.push("order"); return query; }),
      limit: vi.fn(() => { calls.push("limit"); return Promise.resolve({ data: [], error: null }); }),
      range: vi.fn(() => { calls.push("range"); return Promise.resolve({ data: [], error: null }); }),
    };
    const client = {
      from: vi.fn(() => { calls.push("from"); return query; }),
    };

    await loadReadOnlyAprProductIntegrationInventory(client as never);

    const selectCall = calls.find((call) => call.startsWith("select:")) ?? "";
    expect(client.from).toHaveBeenCalledWith("enea_practices_public");
    expect(calls.map((call) => call.split(":")[0])).toEqual([
      "from", "select", "eq", "in", "order", "order", "range",
    ]);
    expect(selectCall).not.toContain("cliente_nome");
    expect(selectCall).not.toContain("cliente_cognome");
    expect(selectCall).not.toContain("cliente_cf");
    expect(selectCall).not.toContain("cliente_email");
  });

  it("pagina l'inventario oltre 500 righe invece di troncare il corpus usato per le priorita APR", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      ...baseRow,
      id: `practice-${String(index + 1).padStart(4, "0")}`,
      prodotto_installato: "Infissi",
    }));
    const secondPage = [{
      ...baseRow,
      id: "practice-0501",
      prodotto_installato: "Impianto termico",
    }];
    const ranges: Array<[number, number]> = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve({ data: firstPage, error: null })),
      range: vi.fn((from: number, to: number) => {
        ranges.push([from, to]);
        const data = ranges.length === 1 ? firstPage : secondPage;
        return Promise.resolve({ data, error: null });
      }),
    };
    const client = { from: vi.fn(() => query) };

    const inventory = await loadReadOnlyAprProductIntegrationInventory(client as never);
    const summary = summarizeAprProductInventory(inventory);

    expect(ranges).toEqual([[0, 499], [500, 999]]);
    expect(inventory).toHaveLength(501);
    expect(summary.total).toBe(501);
    expect(summary.byProduct.infissi.total).toBe(500);
    expect(summary.byProduct.impianto_termico.total).toBe(1);
  });
});
