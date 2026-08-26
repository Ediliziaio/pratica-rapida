import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAprOperatorBlockDescriptor } from "../../src/features/enea-shadow-crm/aprOperatorUnlockContract";
import { runAprOperatorUnlockCli } from "./operatorUnlockCli";
import { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";
import { PersistentAprOperatorUnlockRegistry, type AprOperatorUnlockSubmission } from "./operatorUnlockRegistry";

const descriptor = () => createAprOperatorBlockDescriptor({
  blockId: "block:luca-maestri:deadline",
  practiceId: "practice-luca-maestri",
  customerKey: "luca-maestri",
  generationId: "generation-luca-maestri-1",
  category: "business_precondition",
  code: "completion_over_90_days_operator_required",
  stage: "preflight",
  fieldPath: "intervento.data_fine_lavori",
  reason: "Superamento dei 90 giorni: decisione operatore richiesta.",
  question: "Autorizzi questa sola pratica?",
  evidenceText: "Data originaria e conteggio conservati.",
  sourceIds: ["form-luca-maestri"],
  ruleIds: ["user-2026-08-16-operator-structured-question-resume", "system-atomic-checkpoint-resume"],
  resumePolicy: "recompute_before_draft",
  answerSchema: { kind: "controlled_choice", choices: [{ value: "authorized_single_case", label: "Autorizzata per questo caso" }, { value: "keep_blocked", label: "Mantieni bloccata" }], noteRequired: true },
  createdAt: "2026-08-26T10:00:00.000Z",
});

const submission = (overrides: Partial<AprOperatorUnlockSubmission> = {}): AprOperatorUnlockSubmission => ({
  blockId: descriptor().blockId,
  commandId: "operator-answer:luca-maestri:1",
  expectedScope: structuredClone(descriptor().scope),
  answer: "authorized_single_case",
  note: "Autorizzazione valida soltanto per questa pratica.",
  operatorId: "operator-local",
  answeredAt: "2026-08-26T10:05:00.000Z",
  ...overrides,
});

describe("registro durevole sblocco operatore", () => {
  it("persiste una risposta una sola volta e sopravvive al riavvio senza riaccodare la pratica", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-unlock-"));
    const registry = new PersistentAprOperatorUnlockRegistry(root);
    registry.register(descriptor(), new Date("2026-08-26T10:00:00Z"));
    const answered = registry.submit(submission(), new Date("2026-08-26T10:05:00Z"));
    expect(answered.records[0]).toMatchObject({ descriptor: { status: "answered", resumePolicy: "recompute_before_draft" }, evidence: { sourceKind: "operator_unlock_evidence", propagation: "forbidden", verificationStatus: "pending", consumed: false }, crmSimulation: { pipeline: "Richiesto intervento operatore", status: "answer_persisted_pending_verification", externalActionAllowed: false } });

    const restarted = new PersistentAprOperatorUnlockRegistry(root);
    const afterRestart = restarted.snapshot(new Date("2026-08-26T10:06:00Z"));
    expect(afterRestart.progress).toMatchObject({ total: 1, open: 0, answeredPendingVerification: 1, consumed: 0 });
    const revision = afterRestart.revision;
    restarted.submit(submission(), new Date("2026-08-26T10:07:00Z"));
    expect(restarted.snapshot().revision).toBe(revision);
    expect(restarted.snapshot().audit.filter((event) => event.type === "answer_persisted")).toHaveLength(1);
  });

  it("rifiuta scope differente, risposta non ammessa e un secondo comando concorrente", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-unlock-"));
    const registry = new PersistentAprOperatorUnlockRegistry(root);
    registry.register(descriptor());
    expect(() => registry.submit(submission({ expectedScope: { ...descriptor().scope, practiceId: "practice-altra" } }))).toThrow("operator_unlock_scope_mismatch");
    expect(() => registry.submit(submission({ answer: "invented" }))).toThrow("operator_unlock_answer_not_allowed");
    registry.submit(submission());
    expect(() => registry.submit(submission({ commandId: "operator-answer:luca-maestri:2" }))).toThrow("operator_unlock_already_answered");
  });

  it("rifiuta il riuso dello stesso blockId con una definizione differente", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-unlock-collision-"));
    const registry = new PersistentAprOperatorUnlockRegistry(root);
    registry.register(descriptor());
    expect(() => registry.register({ ...descriptor(), question: "Domanda differente" })).toThrow("operator_unlock_block_identity_collision");
  });

  it("acquisisce i blocchi dalla simulazione CRM senza modificare il suo stato", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-unlock-crm-"));
    const workflow = new PersistentAprCrmIntegrationWorkflow(root);
    workflow.ingest({ event: { eventId: "event:practice-1:1", practiceId: "practice-1", customerId: "customer-1", module: "ENEA", crmRevision: 1, currentPipeline: "Pronte da fare", currentStatus: "ENEA da lavorare", dossierLocator: "local://dossier/practice-1" }, displayName: "Cliente Uno" });
    workflow.stageOutcome("practice-1", { status: "blocked", reason: "Documento mancante.", operatorRequest: { field: "documents.invoice", question: "La fattura e' disponibile?", evidenceText: "Fattura assente.", sourceIds: ["dossier-1"], choices: [{ value: "uploaded", label: "Caricata" }] } });
    workflow.applyPending();
    const before = workflow.snapshot();
    const registry = new PersistentAprOperatorUnlockRegistry(root);
    registry.syncFromCrmWorkflow(before);
    expect(registry.snapshot()).toMatchObject({ progress: { total: 1, open: 1 }, records: [{ descriptor: { scope: { practiceId: "practice-1", customerKey: "customer-1", propagation: "forbidden" } } }] });
    expect(new PersistentAprCrmIntegrationWorkflow(root).snapshot()).toMatchObject({ revision: before.revision, progress: { operatorRequired: 1, resumeReady: 0 } });
  });

  it("non riapre nel registro canonico una richiesta legacy gia riaccodata", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-unlock-resolved-"));
    const workflow = new PersistentAprCrmIntegrationWorkflow(root);
    workflow.ingest({ event: { eventId: "event:resolved:1", practiceId: "practice-resolved", customerId: "customer-resolved", module: "ENEA", crmRevision: 1, currentPipeline: "Pronte da fare", currentStatus: "ENEA da lavorare", dossierLocator: "local://dossier/resolved" }, displayName: "Cliente Risolto" });
    workflow.stageOutcome("practice-resolved", { status: "blocked", reason: "Dato mancante.", operatorRequest: { field: "documents.invoice", question: "Documento caricato?", evidenceText: "Documento assente.", sourceIds: ["dossier-resolved"], choices: [{ value: "uploaded", label: "Caricato" }] } });
    workflow.applyPending();
    const requestId = workflow.snapshot().items[0].operatorRequest!.requestId;
    workflow.answerOperator("practice-resolved", { requestId, commandId: "legacy-answer:resolved:1", answer: "uploaded", note: "Caricato", operatorId: "operator", answeredAt: "2026-08-26T10:10:00.000Z" });
    const registry = new PersistentAprOperatorUnlockRegistry(root);
    registry.syncFromCrmWorkflow(workflow.snapshot());
    expect(registry.snapshot().progress.total).toBe(0);
  });

  it("espone show e submit tramite CLI usando lo stesso checkpoint durevole", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-unlock-cli-"));
    new PersistentAprOperatorUnlockRegistry(root).register(descriptor());
    const shown: string[] = [];
    runAprOperatorUnlockCli(["show", "--state-dir", root, "--customer-key", "luca-maestri"], (value) => shown.push(value));
    expect(JSON.parse(shown.join(""))).toMatchObject({ progress: { total: 1, open: 1 }, records: [{ descriptor: { blockId: "block:luca-maestri:deadline" } }] });

    const requestFile = path.join(root, "answer.json");
    writeFileSync(requestFile, JSON.stringify(submission()));
    const submitted: string[] = [];
    runAprOperatorUnlockCli(["submit", "--state-dir", root, "--request-file", requestFile], (value) => submitted.push(value));
    expect(JSON.parse(submitted.join(""))).toMatchObject({ records: [{ descriptor: { status: "answered" }, evidence: { verificationStatus: "pending", consumed: false } }] });
  });

  it("rifiuta un checkpoint corrotto senza azzerare silenziosamente le evidenze", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-unlock-corrupt-"));
    const registry = new PersistentAprOperatorUnlockRegistry(root);
    registry.initialize();
    writeFileSync(registry.checkpointPath, "{not-json");
    expect(() => registry.load()).toThrow("operator_unlock_registry_checkpoint_corrupt");
  });
});
