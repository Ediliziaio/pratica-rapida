import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PersistentAprCrmArchivedScreeningDiscovery } from "./aprCrmArchivedScreeningDiscovery";

function row(index: number, product = "Tende da sole") {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, cliente_nome: `Nome${index}`, cliente_cognome: `Cognome${index}`, prodotto_installato: product, updated_at: "2026-08-16T00:00:00Z", pipeline_stages: { stage_type: "archiviate" } };
}

function transport(rows: unknown[]) {
  return {
    snapshot: () => ({ status: "authenticated" }),
    readOnlyGet: async (pathname: string, params: URLSearchParams) => {
      expect(pathname).toBe("/rest/v1/enea_practices_public");
      expect(params.get("pipeline_stages.stage_type")).toBe("eq.archiviate");
      return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
    },
  };
}

describe("discovery CRM read-only delle 10 schermature archiviate", () => {
  it("seleziona esattamente 10 identita uniche, esclude precedenti, Beatrice e non-schermature, e ripete dal checkpoint", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-discovery-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-discovery-history-"));
    const execution = path.join(history, "old", "enea-draft-execution");
    mkdirSync(execution, { recursive: true });
    writeFileSync(path.join(execution, "checkpoint.json"), JSON.stringify({ items: [{ customerKey: "nome1-cognome1", draftId: "412000" }] }));
    const rows = [row(1), { ...row(2), cliente_nome: "Beatrice", cliente_cognome: "Ciotta" }, row(3, "Caldaia"), ...Array.from({ length: 10 }, (_, index) => row(index + 10, index === 0 ? "Pergola" : index === 1 ? "Zanzariere" : "Schermature solari"))];
    const store = new PersistentAprCrmArchivedScreeningDiscovery(root, transport(rows), history);
    const first = await store.discover(new Date("2026-08-16T10:00:00Z"));
    const replay = await new PersistentAprCrmArchivedScreeningDiscovery(root, transport([]), history).discover(new Date("2026-08-16T11:00:00Z"));
    expect(first).toMatchObject({ status: "selected", requiredCount: 10, externalActionAllowed: false, mutationAllowed: false, excluded: { priorDraft: 1, beatriceCiotta: 1, notScreening: 1 } });
    expect(first.selected).toHaveLength(10);
    expect(new Set(first.selected.map((item) => item.customerKey)).size).toBe(10);
    expect(first.audit[0].appliedRuleIds).toContain("user-2026-08-16-ten-case-monday-restart");
    expect(replay).toEqual(first);
  });

  it("non arma implicitamente una selezione incompleta", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-discovery-short-"));
    const result = await new PersistentAprCrmArchivedScreeningDiscovery(root, transport(Array.from({ length: 9 }, (_, index) => row(index + 1))), mkdtempSync(path.join(tmpdir(), "apr-discovery-empty-history-"))).discover();
    expect(result).toMatchObject({ status: "insufficient_candidates", requiredCount: 10 });
    expect(result.selected).toHaveLength(9);
  });

  it("non seleziona i clienti esclusi dai test futuri e registra ogni esclusione", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-discovery-future-exclusion-"));
    const rows = [
      { ...row(90), cliente_nome: "Giovanni", cliente_cognome: "Dalle Donne" },
      { ...row(91), cliente_nome: "Vittorio", cliente_cognome: "Paolinelli" },
      { ...row(92), cliente_nome: "Sara", cliente_cognome: "Lionti" },
      { ...row(93), cliente_nome: "Gianluca", cliente_cognome: "Percaccioli" },
      ...Array.from({ length: 10 }, (_, index) => row(index + 100)),
    ];
    const result = await new PersistentAprCrmArchivedScreeningDiscovery(root, transport(rows), mkdtempSync(path.join(tmpdir(), "apr-discovery-future-exclusion-history-"))).discover();
    expect(result.selected.some((candidate) => candidate.customerKey === "giovanni-dalle-donne")).toBe(false);
    expect(result.selected.some((candidate) => ["vittorio-paolinelli", "sara-lionti"].includes(candidate.customerKey))).toBe(false);
    expect(result.excluded.futureTestPolicy).toBe(3);
    expect(result.audit[0].appliedRuleIds).toContain("user-2026-08-18-future-test-exclusions");
  });

  it("sorteggia dieci schermature includendo casi con bozze precedenti e conserva il seed auditabile", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-discovery-random-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-discovery-random-history-"));
    const execution = path.join(history, "old", "enea-draft-execution"); mkdirSync(execution, { recursive: true });
    writeFileSync(path.join(execution, "checkpoint.json"), JSON.stringify({ items: [{ customerKey: "nome1-cognome1", draftId: "412001" }] }));
    const rows = Array.from({ length: 10 }, (_, index) => row(index + 1));
    const first = await new PersistentAprCrmArchivedScreeningDiscovery(root, transport(rows), history, { includePriorDrafts: true, randomSeed: "seed-test-10" }).discover();
    expect(first).toMatchObject({ status: "selected", selectionMode: "random_include_prior_drafts", selectionSeedSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(first.selected).toHaveLength(10);
    expect(first.excluded.includedPriorDraft).toBe(1);
    expect(first.selected.find((candidate) => candidate.customerKey === "nome1-cognome1")?.priorDraftIds).toEqual(expect.any(Array));
  });

  it("sorteggia quindici schermature per il test intermedio, esclude Beatrice e riprende identico dal checkpoint", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-discovery-fifteen-"));
    const history = mkdtempSync(path.join(tmpdir(), "apr-discovery-fifteen-history-"));
    const rows = [
      ...Array.from({ length: 18 }, (_, index) => row(index + 1, index % 3 === 0 ? "Pergola" : "Schermature solari")),
      { ...row(90), cliente_nome: "Beatrice", cliente_cognome: "Ciotta" },
      row(91, "Pompa di calore"),
    ];
    const store = new PersistentAprCrmArchivedScreeningDiscovery(root, transport(rows), history, { includePriorDrafts: true, randomSeed: "intermezzo-15", requiredCount: 15 });
    const first = await store.discover(new Date("2026-08-17T18:00:00Z"));
    const replay = await new PersistentAprCrmArchivedScreeningDiscovery(root, transport([]), history, { includePriorDrafts: true, randomSeed: "ignored-after-checkpoint", requiredCount: 15 }).discover();
    expect(first).toMatchObject({ status: "selected", requiredCount: 15, externalActionAllowed: false, mutationAllowed: false });
    expect(first.selected).toHaveLength(15);
    expect(first.selected.some((candidate) => candidate.customerKey === "beatrice-ciotta")).toBe(false);
    expect(first.audit[0].appliedRuleIds).toContain("user-2026-08-17-fifteen-case-intermezzo-repeat");
    expect(replay).toEqual(first);
  });

  it("rifiuta cardinalita non autorizzate", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-discovery-invalid-count-"));
    await expect(new PersistentAprCrmArchivedScreeningDiscovery(root, transport([]), mkdtempSync(path.join(tmpdir(), "apr-discovery-invalid-count-history-")), { requiredCount: 14 }).discover())
      .rejects.toThrow("apr_archived_screening_discovery_count_invalid:14");
  });
});
