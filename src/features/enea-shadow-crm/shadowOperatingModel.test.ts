import { describe, expect, it } from "vitest";
import { registryRule } from "./operationalRegistry";
import {
  APR_SHADOW_AUDIT_RULE_IDS,
  aprShadowOperatingPlanSnapshot,
  buildAprShadowDailyReport,
  compareAprShadowCase,
  type AprShadowCaseInput,
  type AprShadowFieldValue,
} from "./shadowOperatingModel";

const at = "2026-08-18T18:00:00.000Z";
const sealed = "2026-08-18T18:01:00.000Z";
const humanAt = "2026-08-18T19:00:00.000Z";
const field = (name: string, value: AprShadowFieldValue["value"], sourceId = "source"): AprShadowFieldValue => ({ field: name, value, sourceId });

function shadowCase(overrides: Partial<AprShadowCaseInput> = {}): AprShadowCaseInput {
  return {
    caseId: "crm-1",
    displayName: "Cliente Uno",
    product: "schermature_solari",
    receivedAt: "2026-08-18T09:00:00.000Z",
    apr: { actor: "APR", state: "completed", completedAt: at, sealedAt: sealed, resultFingerprint: "apr-sha256", fields: [field("beneficiario.cf", "RSSMRA80A01H501U", "apr"), field("immobile.comune", "Milano", "apr"), field("spesa.totale", 1250, "apr")] },
    human: { actor: "MATTEO", state: "completed", completedAt: humanAt, sealedAt: humanAt, resultFingerprint: "human-sha256", fields: [field("beneficiario.cf", "RSSMRA80A01H501U", "human"), field("immobile.comune", "Milano (MI)", "human"), field("spesa.totale", 1250, "human")] },
    originalSources: [field("beneficiario.cf", "RSSMRA80A01H501U", "fattura-1"), field("immobile.comune", "Milano", "form-1"), field("spesa.totale", 1250, "fattura-1-p2")],
    aprHumanResultAccessedAt: null,
    ...overrides,
  };
}

describe("modello operativo APR shadow", () => {
  it("separa APR dal risultato umano e classifica una differenza soltanto formale", () => {
    const comparison = compareAprShadowCase(shadowCase());
    expect(comparison).toMatchObject({ category: "differenza_irrilevante_formale", comparisonUnlockedAfterAprSeal: true });
    expect(comparison.differences).toEqual([expect.objectContaining({ field: "immobile.comune", category: "differenza_irrilevante_formale", critical: false })]);
    expect(comparison.appliedRuleIds).toEqual(APR_SHADOW_AUDIT_RULE_IDS);
  });

  it("rifiuta il confronto se il risultato umano era disponibile prima del sigillo APR", () => {
    const input = shadowCase({ human: { ...shadowCase().human!, completedAt: at, sealedAt: at } });
    expect(() => compareAprShadowCase(input)).toThrow("human_result_available_before_apr_seal");
  });

  it("non assume che Matteo abbia ragione quando APR coincide con la fonte originaria", () => {
    const base = shadowCase();
    const input = shadowCase({
      human: { ...base.human!, fields: base.human!.fields.map((value) => value.field === "spesa.totale" ? { ...value, value: 1240 } : value) },
    });
    const comparison = compareAprShadowCase(input);
    expect(comparison.differences).toContainEqual(expect.objectContaining({
      field: "spesa.totale",
      category: "possibile_errore_umano_da_verificare",
      originalValue: 1250,
      sourceId: "fattura-1-p2",
      critical: true,
      interceptedByApr: true,
    }));
  });

  it("segnala come critica e non intercettata una spesa APR contraria alla fonte", () => {
    const base = shadowCase();
    const input = shadowCase({
      apr: { ...base.apr, fields: base.apr.fields.map((value) => value.field === "spesa.totale" ? { ...value, value: 1240 } : value) },
    });
    const report = buildAprShadowDailyReport([input], new Date("2026-08-18T20:00:00.000Z"));
    expect(report.cases[0].category).toBe("differenza_critica");
    expect(report.metrics).toMatchObject({ totalPractices: 1, aprCompleted: 1, automationRate: 1, criticalDifferenceCount: 1, undetectedCriticalDifferenceCount: 1 });
    expect(report).toMatchObject({ externalMutationAllowed: false, eneaSubmitAllowed: false, humanResultMayFeedApr: false });
  });

  it("conta blocker informativi e nuovi senza gonfiare l'automation rate", () => {
    const blocked = shadowCase({
      caseId: "crm-blocked",
      apr: { actor: "APR", state: "blocked", completedAt: at, sealedAt: sealed, resultFingerprint: "apr-blocked-sha", fields: [], blockerCode: "invoice_missing", blockerReason: "Fattura originaria assente.", blockerCoveredByRule: false },
      human: null,
    });
    const report = buildAprShadowDailyReport([shadowCase(), blocked], new Date("2026-08-18T20:00:00.000Z"));
    expect(report.metrics).toMatchObject({ totalPractices: 2, aprCompleted: 1, aprBlocked: 1, automationRate: 0.5, blockerRate: 0.5 });
    expect(report.metrics.recurringBlockers).toEqual([{ code: "invoice_missing", count: 1 }]);
    expect(report.metrics.uncoveredBlockers).toEqual([{ code: "invoice_missing", count: 1 }]);
  });

  it("espone il percorso SHADOW senza autorizzare produzione o submit", () => {
    const plan = aprShadowOperatingPlanSnapshot();
    expect(plan).toMatchObject({ currentPhase: "SHADOW", productionAuthorized: false, externalMutationAllowed: false, eneaSubmitAllowed: false, officialProductionOwner: "MATTEO", shadowOwner: "APR" });
    expect(plan.targetSample).toEqual({ minimum: 400, preferred: 500, indicativeMonths: "2-3" });
    expect(plan.products[0]).toMatchObject({ product: "schermature_solari", status: "baseline_da_chiudere_per_shadow" });
    expect(plan.products[1]).toMatchObject({ product: "vepa", status: "prossimo_modulo" });
    expect(APR_SHADOW_AUDIT_RULE_IDS.every((ruleId) => registryRule(ruleId))).toBe(true);
  });
});
