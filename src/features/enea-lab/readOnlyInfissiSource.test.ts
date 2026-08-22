import { describe, expect, it, vi } from "vitest";
import {
  loadReadOnlyInfissiPracticeByFullName,
  mapInfissiQueueRow,
} from "./readOnlyInfissiSource";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    cliente_nome: "Sebastian Costel",
    cliente_cognome: "Volf",
    cliente_email: "test@example.invalid",
    cliente_telefono: "000",
    cliente_cf: "",
    prodotto_installato: "Infissi / Serramenti",
    data_fine_lavori: "2026-07-31",
    fatture_urls: ["11111111-2222-3333-4444-555555555555/fatture/fattura.pdf"],
    documenti_aggiuntivi_urls: ["11111111-2222-3333-4444-555555555555/tecnici/scheda.pdf"],
    pratica_enea_conclusa_urls: ["11111111-2222-3333-4444-555555555555/enea/conclusa.pdf"],
    dati_form: {
      prodotto: {
        tipo: "infissi",
        vecchi_materiale: "legno",
        vecchi_vetro: "doppio",
        nuovi_materiale: "pvc",
        nuovi_vetro: "triplo",
        zanzariere_tapparelle: false,
      },
    },
    form_compilato_at: "2026-07-30T10:00:00Z",
    created_at: "2026-07-29T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
    pipeline_stages: { stage_type: "archiviate" },
    companies: { ragione_sociale: "Rivenditore Test" },
    ...overrides,
  } as never;
}

describe("APR read-only source infissi", () => {
  it("mappa pratica infissi storica e conserva solo path appartenenti alla pratica", () => {
    const practice = mapInfissiQueueRow(row());
    expect(practice).not.toBeNull();
    expect(practice?.clienteNome).toBe("Sebastian Costel");
    expect(practice?.clienteCognome).toBe("Volf");
    expect(practice?.queueStatus).toBe("historical");
    expect(practice?.fattureCount).toBe(1);
    expect(practice?.completedEneaPaths).toHaveLength(1);
  });

  it("Erremme è esclusa incondizionatamente dal mapper Infissi", () => {
    expect(mapInfissiQueueRow(row({ companies: { ragione_sociale: "ERREMME S.R.L." } }))).toBeNull();
  });

  it("non assorbe prodotti diversi dagli infissi", () => {
    expect(mapInfissiQueueRow(row({ prodotto_installato: "Schermature solari" }))).toBeNull();
  });

  it("il lookup nominativo usa soltanto la catena SELECT e richiede identità esatta", async () => {
    const calls: string[] = [];
    const chain = {
      select: vi.fn(() => { calls.push("select"); return chain; }),
      eq: vi.fn(() => { calls.push("eq"); return chain; }),
      ilike: vi.fn(() => { calls.push("ilike"); return chain; }),
      order: vi.fn(() => { calls.push("order"); return chain; }),
      limit: vi.fn(async () => { calls.push("limit"); return { data: [row()], error: null }; }),
    };
    const client = { from: vi.fn(() => { calls.push("from"); return chain; }) } as never;

    const practice = await loadReadOnlyInfissiPracticeByFullName(client, "Sebastian Costel Volf");
    expect(practice?.clienteCognome).toBe("Volf");
    expect(calls).toEqual(["from", "select", "eq", "ilike", "order", "limit"]);
  });

  it("non seleziona un quasi-match del nome", async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      ilike: () => chain,
      order: () => chain,
      limit: async () => ({ data: [row({ cliente_nome: "Sebastiano" })], error: null }),
    };
    const client = { from: () => chain } as never;
    expect(await loadReadOnlyInfissiPracticeByFullName(client, "Sebastian Costel Volf")).toBeNull();
  });
});
