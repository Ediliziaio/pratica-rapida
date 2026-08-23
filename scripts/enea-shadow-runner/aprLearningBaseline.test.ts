import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PersistentAprLearningBaseline } from "./aprLearningBaseline";
const write = (root: string, file: string, value: unknown) => { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(value)); };
describe("APR learning baseline", () => {
  it("uses the product-authoritative preflight and freezes outcome groups", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-learning-baseline-"));
    write(root, "cohort-seed/checkpoint.json", { candidateFingerprint: "seed", createdAt: "2026-08-23T00:00:00Z", candidates: [
      { customerKey: "screen", displayName: "Screen", productModule: "screening" }, { customerKey: "window", displayName: "Window", productModule: "infissi" }] });
    write(root, "crm-local-preflight/checkpoint.json", { items: [
      { customerKey: "screen", state: "ready_local_plan", report: { blockers: [] } },
      { customerKey: "window", state: "blocked_case", report: { blockers: [{ code: "screenings_missing" }] } }] });
    write(root, "infissi-batch-preflight/checkpoint.json", { items: [{ customerKey: "window", state: "blocked_case", report: { blockers: [{ code: "infissi_dimensions_and_cardinality_missing" }] } }] });
    write(root, "enea-draft-execution/checkpoint.json", { status: "completed", items: [{ customerKey: "screen", state: "saved", draftId: "1" }] });
    const baseline = new PersistentAprLearningBaseline(root).freeze();
    expect(baseline.outcomeCounts).toMatchObject({ SAVED: 1, OPERATOR_REQUIRED: 1, INCONSISTENT: 0 });
    expect(baseline.cases.find((item) => item.customerKey === "window")?.blockers[0]).toMatchObject({ code: "infissi_dimensions_and_cardinality_missing", category: "measurements_cardinality" });
    expect(new PersistentAprLearningBaseline(root).freeze().fingerprint).toBe(baseline.fingerprint);
  });
});
