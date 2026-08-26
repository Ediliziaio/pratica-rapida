import { describe, expect, it } from "vitest";
import { APR_OPERATOR_PIPELINE, APR_READY_PIPELINE, proposeAprCrmCommands, proposeAprCrmRequeueCommand, proposeFutureCustomerArtifact } from "./aprCrmIntegrationContract";
import { applyAprCommandLocally, compensateAprCommandLocally, type LocalCrmSimulationState } from "./aprCrmIntegrationSimulator";

const event = { eventId: "evt-1", practiceId: "enea-1", customerId: "customer-1", module: "ENEA" as const, crmRevision: 7,
  currentPipeline: "Nuove pratiche", currentStatus: "ENEA ricevuta", dossierLocator: "local://dossier-1" };
const state = (): LocalCrmSimulationState => ({ revision: 7, customers: { "customer-1": { pipeline: "Nuove pratiche", status: "ENEA ricevuta", artifacts: [] } },
  existingAutomations: ["auto-a", "auto-b"], crmDashboardIntegration: ["crm-to-dashboard-v1"], processedIdempotencyKeys: [], audit: [] });

describe("contratto integrazione APR ↔ CRM", () => {
  it("instrada localmente un dubbio alla pipeline operatore, è idempotente e reversibile", () => {
    const command = proposeAprCrmCommands(event, { status: "blocked", reason: "gTot ambiguo", operatorRequest: { field: "screenings.1.gTot", question: "Quale gTot riporta la fattura?", evidenceText: "Due valori non associabili.", sourceIds: ["invoice-1"], choices: [] } })[0];
    expect(command).toMatchObject({ desired: { pipeline: APR_OPERATOR_PIPELINE }, externalActionAllowed: false, execution: "local_simulation_only" });
    const applied = applyAprCommandLocally(state(), command);
    expect(applied.customers["customer-1"].pipeline).toBe(APR_OPERATOR_PIPELINE);
    expect(applied.customers["customer-1"].operatorRequest).toMatchObject({ field: "screenings.1.gTot", question: "Quale gTot riporta la fattura?" });
    expect(applied.customers["customer-1"].operatorRequest?.block).toMatchObject({
      category: "legacy_unclassified",
      resumePolicy: "recompute_before_draft",
      scope: { practiceId: "enea-1", customerKey: "customer-1", generationId: "crm-generation:enea-1:7", propagation: "forbidden" },
    });
    expect(applyAprCommandLocally(applied, command)).toEqual(applied);
    expect(applied.existingAutomations).toEqual(["auto-a", "auto-b"]);
    expect(applied.crmDashboardIntegration).toEqual(["crm-to-dashboard-v1"]);
    const compensated = compensateAprCommandLocally(applied, command);
    expect(compensated.customers["customer-1"]).toMatchObject({ pipeline: "Nuove pratiche", status: "ENEA ricevuta" });
  });

  it("propone avanzamento senza cambiare pipeline per un piano locale pronto", () => {
    expect(proposeAprCrmCommands(event, { status: "plan_ready", reason: "verde" })[0].desired).toEqual({ pipeline: "Nuove pratiche", status: "APR ENEA · piano locale pronto" });
  });

  it("registra la bozza e propone il ritorno idempotente in Pronte da fare dopo la risposta", () => {
    expect(proposeAprCrmCommands(event, { status: "draft_saved", reason: "bozza verificata", draftId: "412999" })[0].desired.status).toContain("412999");
    const requeue = proposeAprCrmRequeueCommand({ ...event, currentPipeline: APR_OPERATOR_PIPELINE, currentStatus: "APR ENEA · intervento richiesto", crmRevision: 8 }, {
      requestId: "operator:enea-1:7", commandId: "answer:enea-1:1", answer: "0,33", note: "Valore fattura", operatorId: "operatore-1", answeredAt: "2026-08-17T09:00:00.000Z",
    });
    expect(requeue.desired).toMatchObject({ pipeline: APR_READY_PIPELINE, clearOperatorRequest: true });
    expect(requeue.externalActionAllowed).toBe(false);
  });

  it("descrive artefatti futuri ma ne rifiuta l'esecuzione locale", () => {
    const future = proposeFutureCustomerArtifact(event, "enea_pdf", "pdf bytes");
    expect(future).toMatchObject({ customerId: "customer-1", execution: "future_adapter_only", externalActionAllowed: false, compensation: { unlinkArtifactFingerprint: expect.any(String) } });
    expect(() => applyAprCommandLocally(state(), future)).toThrow(/futuro vietato/);
  });
});
