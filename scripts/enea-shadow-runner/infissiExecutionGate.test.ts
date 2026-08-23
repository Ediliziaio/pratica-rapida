import { describe, expect, it } from "vitest";
import { APR_REQUIRED_INFISSI_VALIDATION_REVISIONS, dateGateReleaseReadyCustomerKeys, infissiExecutionGateReady } from "./infissiExecutionGate";

describe("gate di avvio esecuzione Infissi", () => {
  it("resta chiuso finche il batch non e completato anche se tutte le revisioni sono registrate", () => {
    expect(infissiExecutionGateReady({
      status: "working",
      sourceFingerprint: "source",
      validationRevisionsApplied: APR_REQUIRED_INFISSI_VALIDATION_REVISIONS,
    })).toBe(false);
  });

  it("resta chiuso se manca anche una sola revisione richiesta", () => {
    expect(infissiExecutionGateReady({
      status: "completed",
      sourceFingerprint: "source",
      validationRevisionsApplied: APR_REQUIRED_INFISSI_VALIDATION_REVISIONS.slice(0, -1),
    })).toBe(false);
  });

  it("si apre soltanto con batch completato, fingerprint e tutte le revisioni", () => {
    expect(infissiExecutionGateReady({
      status: "completed",
      sourceFingerprint: "source",
      validationRevisionsApplied: APR_REQUIRED_INFISSI_VALIDATION_REVISIONS,
    })).toBe(true);
  });

  it("non rimuove il gate data comune a un Infisso solo perche il modulo tecnico e verde", () => {
    const common = [
      { customerKey: "infisso-2025", state: "blocked_case", report: { blockers: [{ code: "completion_date_portal_year_mismatch" }] } },
      { customerKey: "infisso-2026", state: "blocked_case", report: { blockers: [{ code: "screenings_missing" }] } },
      { customerKey: "schermatura-2026", state: "ready_local_plan", report: { blockers: [] } },
    ];
    const infissi = [
      { customerKey: "infisso-2025", state: "ready_local_plan" },
      { customerKey: "infisso-2026", state: "ready_local_plan" },
    ];
    expect(dateGateReleaseReadyCustomerKeys(common, infissi)).toEqual(["schermatura-2026", "infisso-2026"]);
  });
});
