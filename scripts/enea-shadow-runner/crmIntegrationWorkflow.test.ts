import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APR_OPERATOR_PIPELINE, APR_READY_PIPELINE, type AprCrmInboundPracticeEvent } from "../../src/features/enea-shadow-crm/aprCrmIntegrationContract";
import { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";

function event(practiceId: string, customerId: string, revision = 3): AprCrmInboundPracticeEvent {
  return { eventId: `event:${practiceId}:${revision}`, practiceId, customerId, module: "ENEA", crmRevision: revision, currentPipeline: APR_READY_PIPELINE, currentStatus: "ENEA da lavorare", dossierLocator: `local://dossier/${practiceId}` };
}

describe("ciclo CRM APR persistente", () => {
  it("isola un blocco, supera un crash sull'intento e conclude la pratica successiva senza duplicazioni", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-crm-workflow-"));
    const first = new PersistentAprCrmIntegrationWorkflow(directory);
    first.ingest({ event: event("practice-1", "customer-1"), displayName: "Cliente Uno" }, new Date("2026-08-17T09:00:00Z"));
    first.ingest({ event: event("practice-2", "customer-2"), displayName: "Cliente Due" }, new Date("2026-08-17T09:00:01Z"));
    first.stageOutcome("practice-1", { status: "blocked", reason: "Unita di misura ambigua.", operatorRequest: { field: "screenings.1.dimensions.unit", question: "Le misure sono espresse in millimetri?", evidenceText: "Fonte: Cm 4500 × Cm 3000", sourceIds: ["invoice-1-page-2"], choices: [{ value: "millimeters", label: "Sì, millimetri" }] } }, new Date("2026-08-17T09:00:02Z"));

    const restarted = new PersistentAprCrmIntegrationWorkflow(directory);
    expect(restarted.snapshot().progress.pendingCommands).toBe(1);
    restarted.applyPending(new Date("2026-08-17T09:00:03Z"));
    restarted.stageOutcome("practice-2", { status: "draft_saved", reason: "Bozza completa verificata.", draftId: "412999" }, new Date("2026-08-17T09:00:04Z"));
    restarted.applyPending(new Date("2026-08-17T09:00:05Z"));

    const snapshot = new PersistentAprCrmIntegrationWorkflow(directory).snapshot(new Date("2026-08-17T09:00:06Z"));
    expect(snapshot.progress).toMatchObject({ total: 2, draftsSaved: 1, operatorRequired: 1, pendingCommands: 0, technicalBlocks: 0 });
    expect(snapshot.simulation.customers["customer-1"]).toMatchObject({ pipeline: APR_OPERATOR_PIPELINE, operatorRequest: { question: "Le misure sono espresse in millimetri?" } });
    expect(snapshot.simulation.customers["customer-2"].status).toContain("412999");
    expect(snapshot.commands).toHaveLength(2);
    expect(new Set(snapshot.simulation.processedIdempotencyKeys).size).toBe(2);
    expect(snapshot.externalActionAllowed).toBe(false);
  });

  it("persiste la risposta, riaccoda una sola volta e rileva la nuova revisione senza perdere il checkpoint", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-crm-resume-"));
    const store = new PersistentAprCrmIntegrationWorkflow(directory);
    store.ingest({ event: event("practice-1", "customer-1"), displayName: "Cliente Uno" }, new Date("2026-08-17T09:10:00Z"));
    store.stageOutcome("practice-1", { status: "blocked", reason: "Documento mancante.", operatorRequest: { field: "documents.invoice", question: "La fattura è stata caricata?", evidenceText: "Nessuna fattura originaria acquisita.", sourceIds: ["dossier-1"], choices: [{ value: "uploaded", label: "Sì, caricata" }] } }, new Date("2026-08-17T09:10:01Z"));
    store.applyPending(new Date("2026-08-17T09:10:02Z"));
    const requestId = store.snapshot().items[0].operatorRequest!.requestId;
    const resolution = { requestId, commandId: "answer:practice-1:invoice:1", answer: "uploaded", note: "Fattura caricata", operatorId: "operator-1", answeredAt: "2026-08-17T09:11:00.000Z" };
    store.answerOperator("practice-1", resolution, new Date("2026-08-17T09:11:00Z"));
    store.answerOperator("practice-1", resolution, new Date("2026-08-17T09:11:01Z"));

    const restarted = new PersistentAprCrmIntegrationWorkflow(directory);
    const requeued = restarted.snapshot();
    expect(requeued.progress.resumeReady).toBe(1);
    expect(requeued.simulation.customers["customer-1"]).toMatchObject({ pipeline: APR_READY_PIPELINE, status: "APR ENEA · risposta operatore acquisita" });
    expect(requeued.commands).toHaveLength(2);
    expect(requeued.simulation.processedIdempotencyKeys).toHaveLength(2);

    restarted.ingest({ event: event("practice-1", "customer-1", 6), displayName: "Cliente Uno" }, new Date("2026-08-17T09:12:00Z"));
    const resumed = restarted.snapshot();
    expect(resumed.items[0]).toMatchObject({ state: "queued", resumeCount: 1, operatorResolution: resolution });
    expect(resumed.progress.total).toBe(1);
  });

  it("rifiuta pipeline non autorizzate e Beatrice Ciotta senza creare stato operativo", () => {
    const store = new PersistentAprCrmIntegrationWorkflow(mkdtempSync(path.join(tmpdir(), "apr-crm-safety-")));
    expect(() => store.ingest({ event: { ...event("practice-1", "customer-1"), currentPipeline: "Archiviate" }, displayName: "Cliente Uno" })).toThrow("crm_workflow_pipeline_not_ready");
    expect(() => store.ingest({ event: event("practice-2", "customer-2"), displayName: "Beatrice Ciotta" })).toThrow("crm_workflow_beatrice_ciotta_excluded");
    expect(store.snapshot().progress.total).toBe(0);
  });
});
