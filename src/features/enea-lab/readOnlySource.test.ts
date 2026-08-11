import { describe, expect, it, vi } from "vitest";
import {
  loadReadOnlyEneaHistoricalQueue,
  loadReadOnlyEneaQueue,
  mapQueueRow,
} from "./readOnlySource";

describe("mapQueueRow", () => {
  it("usa soltanto una catena SELECT per caricare la coda attiva", async () => {
    const calls: string[] = [];
    const query = {
      select: vi.fn(() => { calls.push("select"); return query; }),
      eq: vi.fn(() => { calls.push("eq"); return query; }),
      is: vi.fn(() => { calls.push("is"); return query; }),
      in: vi.fn(() => { calls.push("in"); return query; }),
      order: vi.fn(() => { calls.push("order"); return query; }),
      limit: vi.fn(() => { calls.push("limit"); return Promise.resolve({ data: [], error: null }); }),
    };
    const client = {
      from: vi.fn(() => { calls.push("from"); return query; }),
    };

    await loadReadOnlyEneaQueue(client as never);

    expect(calls).toEqual(["from", "select", "eq", "is", "in", "order", "limit"]);
    expect(client.from).toHaveBeenCalledWith("enea_practices_public");
  });

  it("carica lo storico con sole SELECT e senza filtrare archived_at", async () => {
    const calls: string[] = [];
    const query = {
      select: vi.fn(() => { calls.push("select"); return query; }),
      eq: vi.fn(() => { calls.push("eq"); return query; }),
      in: vi.fn(() => { calls.push("in"); return query; }),
      order: vi.fn(() => { calls.push("order"); return query; }),
      limit: vi.fn(() => { calls.push("limit"); return Promise.resolve({ data: [], error: null }); }),
    };
    const client = {
      from: vi.fn(() => { calls.push("from"); return query; }),
    };

    await loadReadOnlyEneaHistoricalQueue(client as never);

    expect(calls).toEqual(["from", "select", "eq", "in", "order", "limit"]);
    expect(client.from).toHaveBeenCalledWith("enea_practices_public");
  });

  it("riconosce il primo form del rivenditore senza fingere che il cliente abbia compilato", () => {
    const result = mapQueueRow({
      id: "00000000-0000-4000-8000-000000000001",
      cliente_nome: "Cliente",
      cliente_cognome: "Demo Uno",
      cliente_email: "demo@example.test",
      cliente_telefono: "+39 000 000 0000",
      cliente_cf: "CF-DEMO-NON-VALIDO",
      prodotto_installato: "Schermature Solari",
      data_fine_lavori: "2026-07-13",
      fatture_urls: ["00000000-0000-4000-8000-000000000001/fattura.pdf"],
      documenti_aggiuntivi_urls: [],
      pratica_enea_conclusa_urls: [],
      dati_form: null,
      form_compilato_at: null,
      created_at: "2026-07-13T09:00:00.000Z",
      updated_at: "2026-07-13T09:01:00.000Z",
      pipeline_stages: { stage_type: "inviata" },
      companies: { ragione_sociale: "Rivenditore Demo Uno" },
    });

    expect(result?.queueStatus).toBe("waiting_client");
    expect(result?.reseller).toBe("Rivenditore Demo Uno");
    expect(result?.form.richiedente.nome).toBe("Cliente");
    expect(result?.form.richiedente.email).toBe("demo@example.test");
    expect(result?.documentPaths).toEqual([
      { kind: "invoice", path: "00000000-0000-4000-8000-000000000001/fattura.pdf" },
    ]);
  });

  it("riconosce il secondo form e conta i documenti senza scrivere nel CRM", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const result = mapQueueRow({
      id,
      cliente_nome: "Cliente",
      cliente_cognome: "Demo Uno",
      cliente_email: "demo@example.test",
      cliente_telefono: "+39 000 000 0000",
      cliente_cf: "CF-DEMO-NON-VALIDO",
      prodotto_installato: "Schermature Solari",
      data_fine_lavori: "2026-07-13",
      fatture_urls: [`${id}/fattura-rivenditore.pdf`],
      documenti_aggiuntivi_urls: [`${id}/scheda.pdf`],
      pratica_enea_conclusa_urls: [],
      dati_form: {
        richiedente: { nome: "Cliente", cognome: "Demo Uno" },
        documenti: { fattura_url: `${id}/fattura-cliente.pdf` },
      },
      form_compilato_at: "2026-07-13T11:30:00.000Z",
      created_at: "2026-07-13T09:00:00.000Z",
      updated_at: "2026-07-13T11:30:00.000Z",
      pipeline_stages: { stage_type: "pronte_da_fare" },
      companies: { ragione_sociale: "Rivenditore Demo Uno" },
    });

    expect(result?.queueStatus).toBe("ready");
    expect(result?.form.richiedente.nome).toBe("Cliente");
    expect(result?.fattureCount).toBe(2);
    expect(result?.documentiCount).toBe(1);
    expect(result?.documentPaths).toHaveLength(3);
  });

  it("riconosce una pratica storica solo se esiste il PDF ENEA conclusivo", () => {
    const id = "00000000-0000-4000-8000-000000000002";
    const result = mapQueueRow({
      id,
      cliente_nome: "Cliente",
      cliente_cognome: "Storico",
      cliente_email: "storico@example.test",
      cliente_telefono: null,
      cliente_cf: null,
      prodotto_installato: "Tende da sole",
      data_fine_lavori: "2026-07-14",
      fatture_urls: [`${id}/fattura.pdf`],
      documenti_aggiuntivi_urls: [],
      pratica_enea_conclusa_urls: [`${id}/pratica-enea-conclusa.pdf`],
      dati_form: null,
      form_compilato_at: "2026-07-14T10:00:00.000Z",
      created_at: "2026-07-14T09:00:00.000Z",
      updated_at: "2026-07-14T12:00:00.000Z",
      pipeline_stages: { stage_type: "archiviate" },
      companies: { ragione_sociale: "Rivenditore Demo" },
    });

    expect(result?.queueStatus).toBe("historical");
    expect(result?.completedEneaPaths).toEqual([`${id}/pratica-enea-conclusa.pdf`]);
  });

  it("non scambia un'archiviata senza PDF conclusivo per una pratica storica valida", () => {
    const id = "00000000-0000-4000-8000-000000000004";
    const result = mapQueueRow({
      id,
      cliente_nome: "Cliente",
      cliente_cognome: "Archiviato",
      cliente_email: null,
      cliente_telefono: null,
      cliente_cf: null,
      prodotto_installato: "Tende da sole",
      data_fine_lavori: null,
      fatture_urls: [],
      documenti_aggiuntivi_urls: [],
      pratica_enea_conclusa_urls: [],
      dati_form: null,
      form_compilato_at: null,
      created_at: "2026-07-14T09:00:00.000Z",
      updated_at: "2026-07-14T12:00:00.000Z",
      pipeline_stages: { stage_type: "archiviate" },
      companies: { ragione_sociale: "Rivenditore Demo" },
    });

    expect(result?.queueStatus).toBe("waiting_client");
    expect(result?.completedEneaPaths).toEqual([]);
  });

  it("normalizza anche la struttura schermature usata dai moduli precedenti", () => {
    const id = "00000000-0000-4000-8000-000000000003";
    const result = mapQueueRow({
      id,
      cliente_nome: "Cliente",
      cliente_cognome: "Storico",
      cliente_email: null,
      cliente_telefono: null,
      cliente_cf: null,
      prodotto_installato: "Tende da sole",
      data_fine_lavori: "2026-07-13",
      fatture_urls: [],
      documenti_aggiuntivi_urls: [],
      pratica_enea_conclusa_urls: [],
      dati_form: {
        prodotto: {
          schermature: [{ tipo_prodotto: "tende_da_sole", direzione: "sud_ovest" }],
        },
      },
      form_compilato_at: "2026-07-13T11:30:00.000Z",
      created_at: "2026-07-13T09:00:00.000Z",
      updated_at: "2026-07-13T11:30:00.000Z",
      pipeline_stages: { stage_type: "pronte_da_fare" },
      companies: { ragione_sociale: "Rivenditore Demo" },
    });

    expect(result?.form.prodotto).toEqual({
      tipo: "schermature",
      items: [{ tipo: "tende_da_sole", direzione: "sud_ovest" }],
    });
  });
});
