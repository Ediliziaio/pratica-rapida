import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import { PersistentAprCrmLocalDraftPackages } from "./crmLocalDraftPackages";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "apr-local-packages-"));
  const cases = [
    ["elena-pittau", "Elena Pittau", "Infissi / Serramenti", "blocked_case", "screenings_missing"],
    ["luciano-javier-martinez", "Luciano Javier Martinez", "Schermature Solari", "ready_local_plan", ""],
    ["nello-farinelli", "NELLO FARINELLI", "Schermature Solari", "blocked_case", "tax_code_missing_or_invalid"],
    ["gregorio-fusco", "gregorio fusco", "Infissi / Serramenti", "blocked_case", "screenings_missing"],
    ["mario-ruggeri", "Mario Ruggeri", "Infissi / Serramenti", "blocked_case", "screenings_missing"],
    ["patrizia-muzzi", "Patrizia Muzzi", "Schermature Solari", "blocked_case", "invoice_78e3f1f0"],
    ["francesco-de-vallier", "Francesco De Vallier", "Infissi / Serramenti", "blocked_case", "screenings_missing"],
    ["angelo-rivolta", "ANGELO RIVOLTA", "Pompe di Calore / Climatizzazione", "blocked_case", "screenings_missing"],
    ["filippa-finocchiaro", "FILIPPA CARMELA RITA FINOCCHIARO", "Pompe di Calore / Climatizzazione", "blocked_case", "screenings_missing"],
    ["elisa-moro", "Elisa Moro", "Schermature Solari", "ready_local_plan", ""],
  ] as const;
  const items = cases.map(([customerKey, displayName, productModule, state, blockerCode], index) => {
    const dossierPath = path.join(root, `${customerKey}.json`);
    writeFileSync(dossierPath, JSON.stringify({ row: { prodotto_installato: productModule } }));
    const blocker = blockerCode ? [{
      code: blockerCode,
      field: blockerCode === "tax_code_missing_or_invalid" ? "beneficiary.taxCode" : blockerCode === "invoice_78e3f1f0" ? "economic_sources" : "screenings",
      reason: blockerCode === "tax_code_missing_or_invalid" ? "CF valido non disponibile." : blockerCode === "invoice_78e3f1f0" ? "Nessuna fattura riconosciuta." : "Nessun prodotto schermatura riconosciuto.",
      sourceIds: [`source-${index}`],
      appliedRuleIds: ["system-apr-operator-intervention-routing"],
    }] : [];
    return {
      customerKey, displayName, practiceId: `practice-${index + 1}`, dossierPath, state, attemptCount: 1, startedAt: null, endedAt: null, reason: "fixture", disposition: null,
      report: {
        products: state === "ready_local_plan" ? [{ appliedRuleIds: ["system-atomic-checkpoint-resume"] }, { appliedRuleIds: ["system-atomic-checkpoint-resume"] }] : [],
        blockers: blocker,
        warnings: [],
        sourceIds: [`source-${index}`],
        financial: { eligibleExpense: state === "ready_local_plan" ? (customerKey === "elisa-moro" ? 1250 : 2257) : null },
        eneaPayloadAudit: state === "ready_local_plan" ? { draftReady: true, portalGate: { status: "ready", screeningItemCount: 2 } } : null,
      },
    };
  });
  const snapshot = {
    version: "fixture", revision: 49, status: "completed", sourceFingerprint: "a".repeat(64), items,
  };
  let buildCounter = 0;
  const buildDraftExecutionPackage = vi.fn((customerKey: string) => {
    buildCounter += 1;
    const item = items.find((candidate) => candidate.customerKey === customerKey)!;
    return {
      version: "apr-crm-enea-draft-package-v1", customerKey, displayName: item.displayName, practiceId: item.practiceId,
      sourceFingerprint: snapshot.sourceFingerprint, mappingFingerprint: `mapping-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`,
      packageFingerprint: hash(`package-${customerKey}`), payload: { generatedAt: `2026-08-17T14:00:${String(buildCounter).padStart(2, "0")}.000Z`, fields: {}, portalFields: {} },
      workflow: { preparedFieldIds: ["beneficiary.name", "calculation.expense"], steps: [{ id: "beneficiary" }, { id: "calculation" }] },
      safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
    };
  });
  const preflight = { snapshot: vi.fn(() => snapshot), buildDraftExecutionPackage } as unknown as Pick<PersistentAprCrmLocalPreflight, "snapshot" | "buildDraftExecutionPackage">;
  return { root, preflight, buildDraftExecutionPackage };
}

describe("PersistentAprCrmLocalDraftPackages", () => {
  it("crea pacchetti soltanto per Luciano ed Elisa e classifica esplicitamente gli altri otto casi", () => {
    const { root, preflight, buildDraftExecutionPackage } = fixture();
    const store = new PersistentAprCrmLocalDraftPackages(root, preflight);
    const snapshot = store.synchronize(new Date("2026-08-17T14:00:00.000Z"));

    expect(snapshot).toMatchObject({
      status: "completed",
      externalActionAllowed: false,
      crmMutationAllowed: false,
      eneaActionAllowed: false,
      previewAllowed: false,
      submitAllowed: false,
      communicationsAllowed: false,
    });
    expect(snapshot.packages.map((item) => item.displayName).sort()).toEqual(["Elisa Moro", "Luciano Javier Martinez"]);
    expect(snapshot.packages.every((item) => item.status === "verified_local_package" && item.executionNotArmed)).toBe(true);
    expect(snapshot.packages.every((item) => existsSync(item.packageArtifactPath) && hash(readFileSync(item.packageArtifactPath, "utf8")) === item.packageArtifactSha256)).toBe(true);
    expect(buildDraftExecutionPackage).toHaveBeenCalledTimes(2);
    expect(snapshot.residualCases).toHaveLength(8);
    expect(snapshot.residualCases.filter((item) => item.category === "infissi_serramenti")).toHaveLength(4);
    expect(snapshot.residualCases.filter((item) => item.category === "pompe_di_calore_climatizzazione")).toHaveLength(2);
    expect(snapshot.residualCases.find((item) => item.displayName === "NELLO FARINELLI")).toMatchObject({ classification: "operator_required", category: "beneficiary_identity" });
    expect(snapshot.residualCases.find((item) => item.displayName === "Patrizia Muzzi")).toMatchObject({ classification: "operator_required", category: "missing_fiscal_invoice" });
  });

  it("dopo riavvio conserva fingerprint, revisione e audit senza duplicare pacchetti", () => {
    const { root, preflight } = fixture();
    const firstStore = new PersistentAprCrmLocalDraftPackages(root, preflight);
    const first = firstStore.synchronize(new Date("2026-08-17T14:00:00.000Z"));
    const checkpointBefore = readFileSync(firstStore.checkpointPath, "utf8");

    const restarted = new PersistentAprCrmLocalDraftPackages(root, preflight);
    const second = restarted.synchronize(new Date("2026-08-17T14:05:00.000Z"));
    const checkpointAfter = readFileSync(restarted.checkpointPath, "utf8");

    expect(second.revision).toBe(first.revision);
    expect(second.sourceSignature).toBe(first.sourceSignature);
    expect(second.audit).toEqual(first.audit);
    expect(second.packages.map((item) => item.customerKey)).toEqual(first.packages.map((item) => item.customerKey));
    expect(new Set(second.packages.map((item) => item.customerKey)).size).toBe(2);
    expect(hash(checkpointAfter)).toBe(hash(checkpointBefore));
  });
});
