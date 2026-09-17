import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistentAprOperatorQuestionDelivery } from "./operatorQuestionDelivery";
import type { AprOperatorQuestion } from "./operatorQuestions";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
const question: AprOperatorQuestion = { id: "measure:case-a:invoice-a", customerKey: "case-a", displayName: "Caso A", field: "screenings.1.dimensions", prompt: "Inserisci larghezza e altezza.", evidenceText: "Misure assenti.", sourceIds: ["invoice-a"], choices: [], payload: { rawWidth: null, rawHeight: null, reportedUnit: null, description: "tenda" }, kind: "missing_measurement", status: "open", answer: null, requestedAt: "2026-09-09T10:00:00Z", appliedAt: null, appliedRuleIds: [], classification: "operator_required", exactCause: "Misure assenti", missingDocumentType: "scheda misure", onboardingGap: "Richiedere misure" };

describe("consegna separata delle domande operatore", () => {
  it("persiste prima il documento locale, invia una sola volta e non accede al CRM", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-question-delivery-")); roots.push(root); const deliver = vi.fn(async () => undefined);
    const service = new PersistentAprOperatorQuestionDelivery(root, { ntfyUrl: "https://ntfy.invalid/topic", sink: { deliver } });
    await service.deliverOpen({ questions: [question] }); await service.deliverOpen({ questions: [question] });
    expect(deliver).toHaveBeenCalledTimes(1); const state = service.load(); expect(state.records[0]).toMatchObject({ status: "delivered", attempts: 1 });
    expect(JSON.parse(readFileSync(state.records[0].localArtifactPath, "utf8"))).toMatchObject({ crmWriteAllowed: false, question: { id: question.id, prompt: question.prompt } });
  });
  it("resta pending e ritenta dopo un errore ntfy senza perdere l'artefatto locale", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-question-delivery-fail-")); roots.push(root); const deliver = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const service = new PersistentAprOperatorQuestionDelivery(root, { ntfyUrl: "https://ntfy.invalid/topic", sink: { deliver } });
    expect((await service.deliverOpen({ questions: [question] })).records[0]).toMatchObject({ status: "pending", attempts: 1, lastError: "offline" });
    expect((await service.deliverOpen({ questions: [question] })).records[0]).toMatchObject({ status: "delivered", attempts: 2 });
  });
});
