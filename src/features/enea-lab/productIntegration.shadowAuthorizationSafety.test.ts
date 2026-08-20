import { describe, expect, it, vi } from "vitest";
import { loadReadOnlyAprProductIntegrationInventory } from "./productIntegration";

function buildReadOnlyClient() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return {
    client: { from: vi.fn(() => query) },
    query,
  };
}

describe("inventario multi-prodotto APR prima del gate OMBRA", () => {
  it("non legge il CRM reale senza autorizzazione esplicita dell'utente", async () => {
    const { client } = buildReadOnlyClient();

    const rows = await loadReadOnlyAprProductIntegrationInventory(client as never);

    expect(rows).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("consente la sola lettura read-only dopo la frase canonica dell'utente", async () => {
    const { client } = buildReadOnlyClient();

    const rows = await loadReadOnlyAprProductIntegrationInventory(
      client as never,
      { source: "user", phrase: "APR operativo ombra" },
    );

    expect(rows).toEqual([]);
    expect(client.from).toHaveBeenCalledWith("enea_practices_public");
  });

  it("non considera equivalenti frasi quasi uguali ricostruite a runtime", async () => {
    const { client } = buildReadOnlyClient();

    const rows = await loadReadOnlyAprProductIntegrationInventory(
      client as never,
      { source: "user", phrase: "APR operativo ombra " } as never,
    );

    expect(rows).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
});
