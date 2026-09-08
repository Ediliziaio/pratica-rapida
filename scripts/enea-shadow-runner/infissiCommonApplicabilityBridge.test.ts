import { describe, expect, it, vi } from "vitest";
import { AUTO_CURRENT_VALIDATION_REVISION } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { APR_REQUIRED_INFISSI_VALIDATION_REVISIONS } from "./infissiExecutionGate";
import { INFISSI_COMMON_APPLICABILITY_REVISION, reconcileInfissiCommonApplicability } from "./infissiCommonApplicabilityBridge";

const readySnapshot = {
  status: "completed",
  sourceFingerprint: "a".repeat(64),
  validationRevisionsApplied: [...APR_REQUIRED_INFISSI_VALIDATION_REVISIONS, AUTO_CURRENT_VALIDATION_REVISION],
  items: [{ customerKey: "fixture-infissi", state: "ready_local_plan", report: { blockers: [] } }],
};

describe("ponte applicabilita preflight comune/Infissi", () => {
  it("applica la riconciliazione autorevole prima che il sequencer attenda il pacchetto", () => {
    const reconcileAuthoritativeInfissiApplicability = vi.fn(() => ({ status: "completed" }));
    const now = new Date("2026-08-28T08:00:00.000Z");
    expect(reconcileInfissiCommonApplicability({ reconcileAuthoritativeInfissiApplicability } as never, readySnapshot, now)).toEqual({ status: "completed" });
    expect(reconcileAuthoritativeInfissiApplicability).toHaveBeenCalledWith(readySnapshot, INFISSI_COMMON_APPLICABILITY_REVISION, now);
  });

  it("non riconcilia un gate incompleto o privo delle revisioni obbligatorie", () => {
    const reconcileAuthoritativeInfissiApplicability = vi.fn();
    expect(() => reconcileInfissiCommonApplicability({ reconcileAuthoritativeInfissiApplicability } as never, {
      ...readySnapshot,
      validationRevisionsApplied: readySnapshot.validationRevisionsApplied.slice(1),
    })).toThrow("infissi_common_applicability_reconciliation_gate_not_ready");
    expect(reconcileAuthoritativeInfissiApplicability).not.toHaveBeenCalled();
  });
});
