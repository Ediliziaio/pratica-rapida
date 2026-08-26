import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAprOperatorBlockDescriptor } from "../../src/features/enea-shadow-crm/aprOperatorUnlockContract";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";
import { PersistentAprEneaDraftExecution, type AprEneaDraftExecutionItem } from "./eneaDraftExecution";
import { operatorUnlockRecomputedItemFingerprint, PersistentAprOperatorUnlockGenerationTransaction } from "./operatorUnlockGenerationTransaction";
import { PersistentAprOperatorUnlockRegistry, type AprOperatorUnlockSubmission, type AprOperatorUnlockVerification } from "./operatorUnlockRegistry";

function draftPackage(customerKey: string): AprEneaDraftPackage {
  const step = { id: "beneficiary", pageName: "Beneficiario", markerIds: ["id-cf"], successMessage: "ok", fields: [{ portalId: "id-cf", control: "input" as const, value: "RSSMRA80A01H501U" }] };
  return {
    module: "screening", customerKey, displayName: customerKey, practiceId: `practice-${customerKey}`,
    packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`,
    workflow: { supportedPages: ["Beneficiario"], screeningItemCount: 0, steps: [step], screeningSteps: [] },
    safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
  };
}

function setupBlocked(root: string, customerKey: string, withDraft: boolean) {
  const execution = new PersistentAprEneaDraftExecution(root);
  execution.preparePackages([draftPackage(customerKey), draftPackage("other-case")], "operator-unlock-test-source", new Date("2026-08-26T12:00:00Z"));
  if (withDraft) {
    execution.recordSessionReady("session-proof", "session:ready", new Date("2026-08-26T12:00:01Z"));
    execution.recordCreateIntent(customerKey, `${customerKey}:create:intent`, new Date("2026-08-26T12:00:02Z"));
    execution.recordDraftCreated(customerKey, "DRAFT-700", "https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/DRAFT-700", "draft-proof", `${customerKey}:created`, new Date("2026-08-26T12:00:03Z"));
    execution.recordPagePrepared(customerKey, "DRAFT-700", "page:Beneficiario", "page-prepared-proof", `${customerKey}:page:prepared`, new Date("2026-08-26T12:00:04Z"));
  }
  execution.recordOperatorIntervention(customerKey, "Dato da confermare.", "Rispondere al quesito strutturato.", "operator-block-proof", `${customerKey}:blocked`, new Date("2026-08-26T12:00:05Z"));
  return execution;
}

function registerAnswered(root: string, item: AprEneaDraftExecutionItem, resumePolicy: "resume_existing_draft" | "recompute_before_draft") {
  const descriptor = createAprOperatorBlockDescriptor({
    blockId: `block:${item.customerKey}:1`, practiceId: item.practiceId, customerKey: item.customerKey, generationId: item.generationId,
    category: "business_precondition", code: "operator_confirmation_required", stage: item.draftId ? "draft_execution" : "preflight",
    fieldPath: "case.confirmation", draftId: item.draftId, reason: "Conferma necessaria.", question: "Confermi?", evidenceText: "Evidenza originaria conservata.",
    sourceIds: ["source:fixture"], ruleIds: ["system-atomic-checkpoint-resume"], resumePolicy,
    answerSchema: { kind: "controlled_choice", choices: [{ value: "confirmed", label: "Confermo" }], noteRequired: true }, createdAt: "2026-08-26T12:00:06Z",
  });
  const registry = new PersistentAprOperatorUnlockRegistry(root);
  registry.register(descriptor, new Date("2026-08-26T12:00:06Z"));
  const submission: AprOperatorUnlockSubmission = { blockId: descriptor.blockId, commandId: `answer:${item.customerKey}:1`, expectedScope: structuredClone(descriptor.scope), answer: "confirmed", note: "Conferma caso-specifica.", operatorId: "operator-test", answeredAt: "2026-08-26T12:00:07Z" };
  registry.submit(submission, new Date("2026-08-26T12:00:07Z"));
  return { descriptor, registry };
}

function verification(blockId: string, scope: AprOperatorUnlockVerification["scope"], resumePolicy: AprOperatorUnlockVerification["resumePolicy"], draftId: string | null, recomputedItemFingerprint: string | null): AprOperatorUnlockVerification {
  return { verificationId: `verification:${blockId}`, blockId, scope: structuredClone(scope), resumePolicy, outcome: "verified", verifiedAt: "2026-08-26T12:00:08Z", sourceEvidenceIds: ["server-or-preflight-proof"], draftId, recomputedItemFingerprint };
}

describe("transazione generazionale sblocco operatore", () => {
  it("resume_existing_draft conserva bozza, tentativi e checkpoint e consuma una sola volta", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-unlock-resume-"));
    const execution = setupBlocked(root, "resume-case", true);
    const before = execution.snapshot().items.find((item) => item.customerKey === "resume-case")!;
    const { descriptor, registry } = registerAnswered(root, before, "resume_existing_draft");
    const coordinator = new PersistentAprOperatorUnlockGenerationTransaction(root);
    const result = coordinator.activate({ blockId: descriptor.blockId, expectedScope: descriptor.scope, verification: verification(descriptor.blockId, descriptor.scope, "resume_existing_draft", "DRAFT-700", null), recomputedItem: null }, new Date("2026-08-26T12:00:09Z"));
    expect(result.status).toBe("committed");
    const active = execution.snapshot().items.find((item) => item.customerKey === "resume-case")!;
    expect(active).toMatchObject({ state: "filling", draftId: "DRAFT-700", createAttemptCount: 1, requiresFreshDraft: false, pageCheckpoints: [{ pageId: "page:Beneficiario", state: "prepared", saveAttemptCount: 0 }] });
    expect(execution.snapshot()).toMatchObject({ status: "running", currentCustomerKey: "resume-case", resume: { action: "resume_existing_draft", draftId: "DRAFT-700" } });
    expect(active.generationId).not.toBe(before.generationId);
    expect(execution.snapshot().supersededGenerations).toEqual(expect.arrayContaining([expect.objectContaining({ generationId: before.generationId, supersededByGenerationId: active.generationId, reason: "operator_unlock_activated" })]));
    expect(registry.snapshot().records[0]).toMatchObject({ descriptor: { status: "consumed" }, evidence: { verificationStatus: "verified", consumed: true, activationGenerationId: active.generationId } });
    expect(coordinator.execute(result.transactionId).status).toBe("committed");
    expect(execution.snapshot().supersededGenerations).toHaveLength(1);
  });

  it("recompute_before_draft attiva soltanto un preflight verificato e non duplica la prima creazione", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-unlock-recompute-"));
    const execution = setupBlocked(root, "recompute-case", false);
    const blocked = execution.snapshot().items.find((item) => item.customerKey === "recompute-case")!;
    const { descriptor } = registerAnswered(root, blocked, "recompute_before_draft");
    const recomputed = structuredClone(blocked);
    recomputed.state = "queued"; recomputed.reason = "Preflight verde verificato."; recomputed.nextAction = "Accodare."; recomputed.serverEvidenceIds = ["preflight-green-proof"];
    const proof = verification(descriptor.blockId, descriptor.scope, "recompute_before_draft", null, operatorUnlockRecomputedItemFingerprint(recomputed));
    const coordinator = new PersistentAprOperatorUnlockGenerationTransaction(root);
    coordinator.activate({ blockId: descriptor.blockId, expectedScope: descriptor.scope, verification: proof, recomputedItem: recomputed }, new Date("2026-08-26T12:00:09Z"));
    const active = execution.snapshot().items.find((item) => item.customerKey === "recompute-case")!;
    expect(active).toMatchObject({ state: "queued", draftId: null, createAttemptCount: 0, saveAttemptCount: 0, requiresFreshDraft: false });
    execution.recordSessionReady("new-session-proof", "new-session:ready");
    execution.recordCreateIntent("recompute-case", "recompute:create:once");
    expect(() => execution.recordCreateIntent("recompute-case", "recompute:create:twice")).toThrow();
    expect(execution.snapshot().items.find((item) => item.customerKey === "other-case")).toMatchObject({ generationId: expect.any(String), state: "queued", createAttemptCount: 0 });
  });

  it("riprende dopo crash fra activation e consume senza seconda generazione", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-unlock-crash-"));
    const execution = setupBlocked(root, "crash-case", true);
    const before = execution.snapshot().items.find((item) => item.customerKey === "crash-case")!;
    const { descriptor, registry } = registerAnswered(root, before, "resume_existing_draft");
    const request = { blockId: descriptor.blockId, expectedScope: descriptor.scope, verification: verification(descriptor.blockId, descriptor.scope, "resume_existing_draft", "DRAFT-700", null), recomputedItem: null };
    const crashing = new PersistentAprOperatorUnlockGenerationTransaction(root, (status) => { if (status === "execution_activated") throw new Error("simulated_crash_after_activation"); });
    const prepared = crashing.prepare(request);
    expect(() => crashing.execute(prepared.transactionId)).toThrow("simulated_crash_after_activation");
    expect(execution.snapshot().supersededGenerations).toHaveLength(1);
    expect(registry.snapshot().records[0]).toMatchObject({ descriptor: { status: "verified" }, evidence: { consumed: false } });
    const recoveredTransactions = new PersistentAprOperatorUnlockGenerationTransaction(root).recoverPending();
    expect(recoveredTransactions).toHaveLength(1);
    const recovered = recoveredTransactions[0];
    expect(recovered.status).toBe("committed");
    expect(execution.snapshot().supersededGenerations).toHaveLength(1);
    expect(registry.snapshot().records[0]).toMatchObject({ descriptor: { status: "consumed" }, evidence: { consumed: true } });
  });

  it("riprende dopo consume persistito ma prima del commit senza riconsumare o riattivare", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-unlock-consume-crash-"));
    const execution = setupBlocked(root, "consume-crash-case", true);
    const before = execution.snapshot().items.find((item) => item.customerKey === "consume-crash-case")!;
    const { descriptor, registry } = registerAnswered(root, before, "resume_existing_draft");
    const coordinator = new PersistentAprOperatorUnlockGenerationTransaction(root);
    const prepared = coordinator.prepare({ blockId: descriptor.blockId, expectedScope: descriptor.scope, verification: verification(descriptor.blockId, descriptor.scope, "resume_existing_draft", "DRAFT-700", null), recomputedItem: null });
    const originalConsume = coordinator.registry.consume.bind(coordinator.registry);
    vi.spyOn(coordinator.registry, "consume").mockImplementation((...args) => { const result = originalConsume(...args); throw new Error(`simulated_crash_after_consume:${result.revision}`); });
    expect(() => coordinator.execute(prepared.transactionId)).toThrow("simulated_crash_after_consume");
    expect(registry.snapshot().records[0]).toMatchObject({ descriptor: { status: "consumed" }, evidence: { consumed: true } });
    expect(execution.snapshot().supersededGenerations).toHaveLength(1);
    const recoveredTransactions = new PersistentAprOperatorUnlockGenerationTransaction(root).recoverPending();
    expect(recoveredTransactions).toHaveLength(1);
    const recovered = recoveredTransactions[0];
    expect(recovered.status).toBe("committed");
    expect(execution.snapshot().supersededGenerations).toHaveLength(1);
    expect(registry.snapshot().audit.filter((event) => event.type === "activation_consumed")).toHaveLength(1);
  });

  it("rifiuta scope, fingerprint ricalcolato e bozza differenti", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-unlock-negative-"));
    const execution = setupBlocked(root, "negative-case", false);
    const blocked = execution.snapshot().items.find((item) => item.customerKey === "negative-case")!;
    const { descriptor } = registerAnswered(root, blocked, "recompute_before_draft");
    const recomputed = structuredClone(blocked); recomputed.state = "queued";
    const coordinator = new PersistentAprOperatorUnlockGenerationTransaction(root);
    expect(() => coordinator.prepare({ blockId: descriptor.blockId, expectedScope: { ...descriptor.scope, practiceId: "other-practice" }, verification: verification(descriptor.blockId, descriptor.scope, "recompute_before_draft", null, "wrong"), recomputedItem: recomputed })).toThrow("operator_unlock_transaction_prepare_invalid");
    expect(() => coordinator.prepare({ blockId: descriptor.blockId, expectedScope: descriptor.scope, verification: verification(descriptor.blockId, descriptor.scope, "recompute_before_draft", null, "wrong"), recomputedItem: recomputed })).toThrow("operator_unlock_transaction_recompute_proof_invalid");
  });
});
