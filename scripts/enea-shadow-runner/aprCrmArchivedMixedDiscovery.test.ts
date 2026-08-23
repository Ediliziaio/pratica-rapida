import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PersistentAprCrmArchivedMixedDiscovery } from "./aprCrmArchivedMixedDiscovery";

const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const row = (index: number, module: "screening" | "infissi") => ({
  id: uuid(index), cliente_nome: module === "screening" ? `Sole${index}` : `Finestra${index}`, cliente_cognome: `Cliente${index}`,
  prodotto_installato: module === "screening" ? "Schermature solari" : "Infissi / Serramenti", updated_at: "2026-08-23T00:00:00Z",
  pipeline_stages: { stage_type: index % 2 ? "archiviate" : "recensione" },
});
function transport(rows: unknown[]) {
  return {
    snapshot: vi.fn(() => ({ status: "authenticated" })),
    readOnlyGet: vi.fn(async (_pathname: string, params: URLSearchParams) => {
      expect(params.get("pipeline_stages.stage_type")).toBe("in.(archiviate,recensione)"); expect(params.get("limit")).toBe("1000");
      return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
    }),
  };
}

describe("discovery CRM misto 40 pratiche", () => {
  it("congela esattamente 20 schermature e 20 Infissi, con pipeline e ordine deterministici", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-mixed-40-")); const history = mkdtempSync(path.join(tmpdir(), "apr-mixed-history-"));
    const rows = [...Array.from({ length: 25 }, (_, index) => row(index + 1, "screening")), ...Array.from({ length: 25 }, (_, index) => row(index + 101, "infissi"))];
    const first = await new PersistentAprCrmArchivedMixedDiscovery(root, transport(rows), history, "reliability-40-v1").discover(new Date("2026-08-23T08:00:00Z"));
    expect(first).toMatchObject({ status: "selected", counts: { screening: 20, infissi: 20, total: 40 }, externalActionAllowed: false, mutationAllowed: false });
    expect(new Set(first.selected.map((item) => item.customerKey)).size).toBe(40); expect(new Set(first.selected.map((item) => item.practiceId)).size).toBe(40);
    expect(first.selected.every((item) => ["archiviate", "recensione"].includes(item.expectedStageType))).toBe(true);
    const replayTransport = transport([]); const replay = await new PersistentAprCrmArchivedMixedDiscovery(root, replayTransport, history, "ignored-after-checkpoint").discover();
    expect(replay.selected).toEqual(first.selected); expect(replayTransport.readOnlyGet).not.toHaveBeenCalled();
  });

  it("non arma una composizione incompleta ed esclude Beatrice Ciotta", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-mixed-short-")); const history = mkdtempSync(path.join(tmpdir(), "apr-mixed-history-"));
    const rows = [...Array.from({ length: 20 }, (_, index) => row(index + 1, "screening")), ...Array.from({ length: 19 }, (_, index) => row(index + 101, "infissi")), { ...row(999, "infissi"), cliente_nome: "Beatrice", cliente_cognome: "Ciotta" }];
    const result = await new PersistentAprCrmArchivedMixedDiscovery(root, transport(rows), history, "reliability-40-v2").discover();
    expect(result).toMatchObject({ status: "insufficient_candidates", counts: { screening: 20, infissi: 19, total: 39 } });
  });
});
