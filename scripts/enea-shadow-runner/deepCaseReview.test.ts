import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PersistentAprDeepCaseReview } from "./deepCaseReview";

function write(root: string, relative: string, value: unknown) { const target = path.join(root, relative); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); return target; }
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-deep-review-")); const dossier = write(root, "dossiers/case.json", { row: { id: "p1" } });
  write(root, "cohort-seed/checkpoint.json", { candidateFingerprint: "seed", candidates: [
    { customerKey: "technical", displayName: "Tecnico", practiceId: "p1", productModule: "screening" },
    { customerKey: "operator", displayName: "Operatore", practiceId: "p2", productModule: "screening" },
    { customerKey: "infissi", displayName: "Infissi", practiceId: "p3", productModule: "infissi" },
  ] });
  const commonReport = (code: string) => ({ outcome: "blocked_case", blockers: [{ code, field: "x", sourceIds: ["doc-1"], appliedRuleIds: ["core-gross-triple-reconciliation"] }], sourceIds: ["doc-1"], financial: { appliedRuleIds: ["core-gross-triple-reconciliation"] } });
  write(root, "crm-local-preflight/checkpoint.json", { status: "completed", revision: 2, sourceFingerprint: "common", items: [
    { customerKey: "technical", displayName: "Tecnico", practiceId: "p1", dossierPath: dossier, state: "blocked_case", report: commonReport("gross_triple_reconciliation_failed") },
    { customerKey: "operator", displayName: "Operatore", practiceId: "p2", dossierPath: dossier, state: "blocked_case", report: commonReport("original_invoice_missing_or_unavailable") },
    { customerKey: "infissi", displayName: "Infissi", practiceId: "p3", dossierPath: dossier, state: "blocked_case", report: commonReport("gross_triple_reconciliation_failed") },
  ] });
  write(root, "infissi-batch-preflight/checkpoint.json", { status: "completed", revision: 4, sourceFingerprint: "infissi", items: [{ customerKey: "infissi", displayName: "Infissi", practiceId: "p3", dossierPath: dossier, state: "blocked_case", report: { outcome: "blocked_case", blockers: [{ code: "infissi_dimensions_and_cardinality_missing", field: "technical", sourceIds: ["doc-1"] }], sourceIds: ["doc-1"], appliedRuleIds: ["user-2026-08-19-infissi-invoice-or-technical-source-resolution-v1"] } }] });
  write(root, "crm-document-analysis/checkpoint.json", { items: [{ customerKey: "technical", documentKey: "doc-1", state: "analyzed", extractionMode: "native_text", pageCount: 2 }, { customerKey: "infissi", documentKey: "doc-1", state: "analyzed", extractionMode: "macos_vision_ocr", pageCount: 7 }] });
  return root;
}

describe("revisione profonda persistente APR", () => {
  it("separa riparazioni tecniche da prove operatore senza inventare regole business", () => {
    const review = new PersistentAprDeepCaseReview(fixture()); const final = review.runToCompletion(new Date("2026-08-23T08:00:00Z"));
    expect(final).toMatchObject({ status: "completed", progress: { total: 3, technicalRepair: 2, operatorRequired: 1, businessRuleRequired: 0 } });
    expect(final.items.find((item) => item.customerKey === "technical")).toMatchObject({ classification: "TECHNICAL_REPAIR", attemptCount: 1, evidencePasses: [{ id: "source_inventory", ok: true }, { id: "document_extraction", ok: true }, { id: "rule_replay", ok: true }] });
    expect(final.items.find((item) => item.customerKey === "operator")).toMatchObject({ classification: "OPERATOR_REQUIRED", nextAction: expect.stringContaining("fattura") });
  });
  it("riprende dal checkpoint reviewing e non duplica casi o tentativi", () => {
    const root = fixture(); const first = new PersistentAprDeepCaseReview(root); first.prepareFromCurrentCheckpoints(new Date("2026-08-23T08:00:00Z")); first.tick(new Date("2026-08-23T08:00:01Z"));
    const resumed = new PersistentAprDeepCaseReview(root).runToCompletion(new Date("2026-08-23T08:01:00Z")); const replay = new PersistentAprDeepCaseReview(root).runToCompletion(new Date("2026-08-23T08:02:00Z"));
    expect(resumed.items).toHaveLength(3); expect(new Set(resumed.items.map((item) => item.customerKey)).size).toBe(3); expect(resumed.items.every((item) => item.attemptCount === 1)).toBe(true); expect(replay.revision).toBe(resumed.revision);
    expect(JSON.parse(readFileSync(path.join(root, "deep-case-review/checkpoint.json"), "utf8")).status).toBe("completed");
  });
  it("classifica l'anno portale incompatibile come intervento operatore", () => {
    const root = fixture(); const dossier = path.join(root, "dossiers/case.json");
    const seedPath = path.join(root, "cohort-seed/checkpoint.json"); const seed = JSON.parse(readFileSync(seedPath, "utf8"));
    seed.candidates.push({ customerKey: "year-mismatch", displayName: "Anno Incompatibile", practiceId: "p-year", productModule: "screening" }); writeFileSync(seedPath, JSON.stringify(seed));
    const commonPath = path.join(root, "crm-local-preflight/checkpoint.json"); const common = JSON.parse(readFileSync(commonPath, "utf8"));
    common.items.push({ customerKey: "year-mismatch", displayName: "Anno Incompatibile", practiceId: "p-year", dossierPath: dossier, state: "blocked_case", report: { outcome: "blocked_case", sourceIds: ["fattura-2025"], financial: { appliedRuleIds: ["core-gross-triple-reconciliation"] }, blockers: [{ code: "completion_date_portal_year_mismatch", field: "completionDate", sourceIds: ["fattura-2025"], appliedRuleIds: ["user-2026-08-23-completion-portal-year-operator-gate"] }] } }); writeFileSync(commonPath, JSON.stringify(common));
    const final = new PersistentAprDeepCaseReview(root).runToCompletion(new Date("2026-08-23T08:03:00Z"));
    expect(final.items.find((item) => item.customerKey === "year-mismatch")).toMatchObject({ classification: "OPERATOR_REQUIRED", operatorCodes: ["completion_date_portal_year_mismatch"], businessRuleCodes: [] });
  });
  it("classifica come operatore le misure prodotto realmente assenti dalle fonti primarie", () => {
    const root = fixture(); const dossier = path.join(root, "dossiers/case.json");
    const seedPath = path.join(root, "cohort-seed/checkpoint.json"); const seed = JSON.parse(readFileSync(seedPath, "utf8"));
    seed.candidates.push({ customerKey: "missing-measures", displayName: "Misure mancanti", practiceId: "p-measures", productModule: "screening" }); writeFileSync(seedPath, JSON.stringify(seed));
    const commonPath = path.join(root, "crm-local-preflight/checkpoint.json"); const common = JSON.parse(readFileSync(commonPath, "utf8"));
    common.items.push({ customerKey: "missing-measures", displayName: "Misure mancanti", practiceId: "p-measures", dossierPath: dossier, state: "blocked_case", report: { outcome: "blocked_case", sourceIds: ["fattura"], financial: { appliedRuleIds: ["core-gross-triple-reconciliation"] }, blockers: [{ code: "screening_primary_measurements_missing", field: "screenings.dimensions", sourceIds: ["fattura"], appliedRuleIds: ["system-screening-primary-measurements-operator-routing"] }] } }); writeFileSync(commonPath, JSON.stringify(common));
    const final = new PersistentAprDeepCaseReview(root).runToCompletion(new Date("2026-08-23T08:04:00Z"));
    expect(final.items.find((item) => item.customerKey === "missing-measures")).toMatchObject({ classification: "OPERATOR_REQUIRED", operatorCodes: ["screening_primary_measurements_missing"], nextAction: expect.stringContaining("misure fisiche") });
  });
  it("riesamina una pratica mista secondo le fonti documentali e unisce i blocker dei due moduli", () => {
    const root = fixture(); const dossier = path.join(root, "dossiers/case.json");
    const seedPath = path.join(root, "cohort-seed/checkpoint.json"); const seed = JSON.parse(readFileSync(seedPath, "utf8"));
    seed.candidates.push({ customerKey: "mixed-labeled-infissi", displayName: "Mista", practiceId: "p-mixed", productModule: "infissi" }); writeFileSync(seedPath, JSON.stringify(seed));
    write(root, "learning-replay/checkpoint.json", { cases: [{ customerKey: "mixed-labeled-infissi", productModule: "mixed" }] });
    const commonPath = path.join(root, "crm-local-preflight/checkpoint.json"); const common = JSON.parse(readFileSync(commonPath, "utf8"));
    common.items.push({ customerKey: "mixed-labeled-infissi", displayName: "Mista", practiceId: "p-mixed", dossierPath: dossier, state: "blocked_case", report: { sourceIds: ["screening-doc"], blockers: [{ code: "draft_payload_mapping_incomplete", sourceIds: ["screening-doc"], appliedRuleIds: ["system-draft-payload-mapping-completeness"] }] } }); writeFileSync(commonPath, JSON.stringify(common));
    const infissiPath = path.join(root, "infissi-batch-preflight/checkpoint.json"); const infissi = JSON.parse(readFileSync(infissiPath, "utf8"));
    infissi.items.push({ customerKey: "mixed-labeled-infissi", displayName: "Mista", practiceId: "p-mixed", dossierPath: dossier, state: "blocked_case", report: { sourceIds: ["infissi-doc"], blockers: [{ code: "infissi_invoice_certificate_cardinality_mismatch", sourceIds: ["infissi-doc"], appliedRuleIds: ["user-2026-08-22-infissi-invoice-certificate-cardinality-match-v1"] }] } }); writeFileSync(infissiPath, JSON.stringify(infissi));
    const final = new PersistentAprDeepCaseReview(root).runToCompletion(new Date("2026-08-23T08:05:00Z"));
    expect(final.items.find((item) => item.customerKey === "mixed-labeled-infissi")).toMatchObject({ productModule: "mixed", classification: "OPERATOR_REQUIRED", technicalRepairCodes: ["draft_payload_mapping_incomplete"], operatorCodes: ["infissi_invoice_certificate_cardinality_mismatch"] });
  });
});
