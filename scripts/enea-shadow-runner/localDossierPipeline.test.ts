import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PersistentLocalDossierPipeline, normalizeLocalDossier, type LocalCrmDossier } from "./localDossierPipeline";

const fixturePath = path.resolve("scripts/enea-shadow-runner/fixtures/localCrmDossier.json");
const fixture = () => JSON.parse(readFileSync(fixturePath, "utf8")) as LocalCrmDossier;

describe("pipeline dossier CRM locale APR", () => {
  it("applica i fallback autorizzati inclusa la tenda generica senza gTot", () => {
    const { normalization, blockers } = normalizeLocalDossier(fixture());
    expect(blockers).toEqual([]);
    expect(normalization).toMatchObject({ completionDate: "2026-03-01", completionDateSourceId: "invoice-schermi-200",
      buildingQualification: "single_unit", daysFromCompletionToProcessing: 166, deductibleExpense: 11_000, invoiceGrossTotal: 15_000 });
    expect(normalization.products).toHaveLength(6);
    expect(normalization.products.filter((row) => row.productType === "pergola")).toHaveLength(2);
    expect(normalization.products.filter((row) => row.productType === "pergola").every((row) => row.gTot === 0.12 && row.gTotSource === "invoice_explicit")).toBe(true);
    expect(normalization.products.filter((row) => row.productType === "zanzariera")).toEqual(expect.arrayContaining([
      expect.objectContaining({ pieceNumber: 1, material: "Misto", movement: "Manuale", gTot: 0.33, gTotSource: "authorized_fallback", surfaceM2: 1.5 }),
      expect.objectContaining({ pieceNumber: 2, material: "Misto", movement: "Manuale", gTot: 0.33, gTotSource: "authorized_fallback", surfaceM2: 1.5 }),
    ]));
    expect(normalization.products.filter((row) => row.productType === "tenda")).toEqual(expect.arrayContaining([
      expect.objectContaining({ pieceNumber: 1, gTot: 0.13, gTotSource: "authorized_fallback" }),
      expect.objectContaining({ pieceNumber: 2, gTot: 0.13, gTotSource: "authorized_fallback" }),
    ]));
    expect(normalization.excludedProducts).toHaveLength(1);
    expect(normalization.excludedProducts).toEqual(expect.arrayContaining([
      expect.objectContaining({ pieceNumber: 1, reason: "VEPA separata, Bonus Casa non ancora lavorato" }),
    ]));
  });

  it("riprende dal checkpoint e non duplica transizioni né righe", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-pipeline-"));
    try {
      const first = new PersistentLocalDossierPipeline(directory).runFromFile(fixturePath, "run-1", new Date("2026-08-14T10:00:00Z"), "normalized");
      expect(first).toMatchObject({ stage: "normalized", revision: 1 });
      const resumed = new PersistentLocalDossierPipeline(directory).runFromFile(fixturePath, "run-1", new Date("2026-08-14T10:01:00Z"));
      expect(resumed).toMatchObject({ stage: "draft_plan_ready", revision: 3 });
      expect(resumed.review).toMatchObject({ outcome: "ready_local_plan", blockers: [], warnings: expect.arrayContaining([expect.objectContaining({ code: "completion_over_90_days_test_only", blocking: false })]), differences: [expect.objectContaining({ field: "spesa_detraibile", normalizedValue: 11_000 })] });
      expect(resumed.draftPlan).toMatchObject({ status: "ready_before_external_action", stopPoint: "before_external_action", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, globalGate: "blocked_adapters_unverified" });
      const replay = new PersistentLocalDossierPipeline(directory).runFromFile(fixturePath, "run-1", new Date("2026-08-14T10:02:00Z"));
      expect(replay.revision).toBe(3); expect(replay.audit).toHaveLength(4); expect(replay.normalization!.products).toHaveLength(6);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("blocca una classificazione ambigua senza inventare valori", () => {
    const dossier = fixture(); dossier.invoices[1].lines[0].classification = "ambiguous";
    const result = normalizeLocalDossier(dossier);
    expect(result.blockers).toContain("ambiguous-product:invoice-schermi-200:invoice-schermi-200:zanzariere");
    expect(result.normalization.products.some((row) => row.sourceLineId.endsWith("zanzariere"))).toBe(false);
    expect(result.normalization.excludedProducts.filter((row) => row.lineId.endsWith("zanzariere"))).toHaveLength(2);
  });
});
