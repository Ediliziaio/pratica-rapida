import { describe, expect, it } from "vitest";
import { ENEA_PREFLIGHT_STEPS, runEneaPreflight } from "./preflightContract";
import { ENEA_OPERATIONAL_REGISTRY_VERSION } from "./operationalRegistry";

const evidence = Object.fromEntries(ENEA_PREFLIGHT_STEPS.map((step) => [step, {
  source: step === "customer_form" ? "form cliente + inventario allegati" : "fonti originarie minimizzate",
  ruleVersion: ENEA_OPERATIONAL_REGISTRY_VERSION, reason: "verificato", nextAction: "prosegui",
}])) as Parameters<typeof runEneaPreflight>[0]["evidence"];
const complete = { sessionReady:true, customerFormAcquired:true, attachmentInventoryComplete:true, requiredAssetsAcquired:true, economicSourcesClassified:true,
  identityPropertyComplete:true, datesComplete:true, financialTripleReconciled:true, screeningsReconciled:true,
  plantComplete:true, eneaMappingComplete:true, evidence };

describe("enea-preflight-v1", () => {
  it("è ready solo dopo tutti gli step, nell'ordine invariabile", () => {
    const run=runEneaPreflight(complete, new Date("2026-01-01T00:00:00Z"));
    expect(run.outcome).toBe("ready"); expect(run.steps.map(s=>s.step)).toEqual(ENEA_PREFLIGHT_STEPS);
  });
  it("form completo e fatture valide non richiedono uno snapshot tecnico separato", () => {
    expect(runEneaPreflight(complete).outcome).toBe("ready");
  });
  it("economia verde da sola non è ready ma produce comunque la matrice completa", () => {
    const run=runEneaPreflight({...complete, customerFormAcquired:false});
    expect(run.outcome).toBe("requested_operator"); expect(run.steps).toHaveLength(ENEA_PREFLIGHT_STEPS.length);
  });
  it("asset non acquisibile è errore tecnico, non dato cliente mancante", () => {
    const run=runEneaPreflight({...complete, requiredAssetsAcquired:false, evidence:{...evidence,customer_form:{source:"ponte CDP",ruleVersion:ENEA_OPERATIONAL_REGISTRY_VERSION,reason:"source_not_exposed",nextAction:"ripristinare acquisizione read-only"}}});
    expect(run.steps[0]).toMatchObject({ok:false,reason:"source_not_exposed",nextAction:"ripristinare acquisizione read-only"});
  });
  it("storico o sole regole non sostituiscono una fonte originaria", () => {
    expect(runEneaPreflight({...complete, screeningsReconciled:false, evidence:{...evidence,screenings:{source:"PDF storico",ruleVersion:ENEA_OPERATIONAL_REGISTRY_VERSION,reason:"benchmark non ammesso come fonte",nextAction:"acquisire fonte originaria"}}}).outcome).toBe("requested_operator");
  });
  it("conserva un override test caso-specifico come evidenza non propagabile senza creare una regola", () => {
    const caseOverride = {
      id: "case-override:sara:date", practiceId: "audit-sara-agostinelli", field: "intervento.data_fine_lavori", value: "2026-08-14",
      scope: "single_practice_test" as const, propagation: "forbidden" as const, authorizedAt: "2026-08-14T14:00:00.000Z",
      authorizationSource: "explicit_user_authorization" as const, reason: "Solo test Sara.",
    };
    const run = runEneaPreflight({ ...complete, caseOverrides: [caseOverride] }, new Date("2026-08-14T14:00:00.000Z"));
    expect(run).toMatchObject({ outcome: "ready", caseOverrides: [caseOverride] });
    expect(runEneaPreflight(complete).caseOverrides).toBeUndefined();
  });
});
