import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";
import { prepareEneaTestDraftPortalCollaudo } from "./testDraftPortalGate";

function readyFixture() {
  const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
  source.queueStatus = "ready";
  source.form.richiedente.provincia_nascita = "RM";
  source.form.residenza.provincia = "Roma";
  source.form.richiedente.cf = "RSSMRA80A01H501U";
  const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
  const mapped = mapSchermaturaPractice(source, analysis, {
    includeTestConventions: true,
    acceptTestConventionsForDraft: true,
    financialReconciliationVerified: true,
    reconciledEligibleExpense: analysis.eligibleExpense ?? analysis.invoiceTotal,
    resolvedScreeningGTot: analysis.items.map((item) => ({ value: item.gTot ?? 0.33, source: item.gTot ? "invoice_explicit" as const : "authorized_fallback" as const, ruleId: "user-2026-08-14-tenda-screening-gtot-033-fallback" })),
  });
  const issues = validatePreparedPractice(source, mapped, analysis);
  const payload = buildEneaPayload(mapped, issues, "draft_test", new Date("2026-08-15T10:00:00Z"));
  return { mapped, issues, payload };
}

describe("gate portale per sola bozza TEST", () => {
  it("restituisce un workflow completo ma privo di save/preview/submit", () => {
    const { mapped, issues, payload } = readyFixture();
    expect(issues.filter(({ severity }) => severity === "blocker")).toEqual([]);
    const gate = prepareEneaTestDraftPortalCollaudo(mapped, issues, payload, true);
    expect(gate.status).toBe("ready");
    if (gate.status !== "ready") throw new Error("gate non pronto");
    expect(gate.workflow.mode).toBe("test");
    expect(gate.workflow.screeningItemCount).toBeGreaterThan(0);
    expect(payload.portalFields.every(({ id }) => gate.workflow.preparedFieldIds.includes(id))).toBe(true);
    expect(gate.workflow.steps.length).toBeGreaterThan(0);
    expect(gate.workflow.steps.map(({ id }) => id)).toContain("calculation");
    expect(payload.portalFields.map(({ id }) => id)).toContain("schermature.risparmio_energia");
    expect(gate.workflow.screeningSteps.length).toBe(gate.workflow.screeningItemCount);
    expect(gate.workflow.script).not.toMatch(/\.submit\s*\(|\bpreview\b|\banteprima\b|\binvia\b/i);
  });

  it("rifiuta payload alterati e payload ufficiali", () => {
    const { mapped, issues, payload } = readyFixture();
    expect(prepareEneaTestDraftPortalCollaudo(mapped, issues, { ...payload, practiceCode: "alterata" }, true)).toMatchObject({ status: "blocked", reason: "payload-inconsistent" });
    expect(prepareEneaTestDraftPortalCollaudo(mapped, issues, { ...payload, mode: "official" }, true)).toMatchObject({ status: "blocked", reason: "payload-not-test-draft" });
  });
});
