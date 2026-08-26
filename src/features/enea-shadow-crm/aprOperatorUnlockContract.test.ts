import { describe, expect, it } from "vitest";
import { createAprOperatorBlockDescriptor, migrateLegacyOperatorRequest, operatorEvidenceAppliesToCase } from "./aprOperatorUnlockContract";

const maestri = () => createAprOperatorBlockDescriptor({
  blockId: "block:luca-maestri:deadline",
  practiceId: "practice-luca-maestri",
  customerKey: "luca-maestri",
  generationId: "generation-luca-maestri-1",
  category: "business_precondition",
  code: "completion_over_90_days_operator_required",
  stage: "preflight",
  fieldPath: "intervento.data_fine_lavori",
  reason: "La pratica richiede una decisione operatore caso-specifica.",
  question: "Autorizzi la prosecuzione per questa sola pratica?",
  evidenceText: "Data originaria e conteggio giorni conservati.",
  sourceIds: ["form-luca-maestri"],
  ruleIds: ["user-2026-08-16-operator-structured-question-resume", "system-atomic-checkpoint-resume"],
  resumePolicy: "recompute_before_draft",
  answerSchema: { kind: "controlled_choice", choices: [{ value: "authorized_single_case", label: "Autorizzata per questo caso" }], noteRequired: true },
  createdAt: "2026-08-26T10:00:00.000Z",
});

describe("contratto canonico sblocco operatore APR", () => {
  it("vincola strutturalmente l'evidenza alla singola pratica e generazione", () => {
    const descriptor = maestri();
    expect(descriptor.scope).toEqual({ kind: "single_practice_generation", practiceId: "practice-luca-maestri", customerKey: "luca-maestri", generationId: "generation-luca-maestri-1", propagation: "forbidden" });
    expect(operatorEvidenceAppliesToCase(descriptor, { practiceId: "practice-luca-maestri", customerKey: "luca-maestri", generationId: "generation-luca-maestri-1" })).toBe(true);
  });

  it("impedisce la propagazione a pratica, cliente o generazione differenti", () => {
    const descriptor = maestri();
    expect(operatorEvidenceAppliesToCase(descriptor, { practiceId: "practice-altro", customerKey: "luca-maestri", generationId: "generation-luca-maestri-1" })).toBe(false);
    expect(operatorEvidenceAppliesToCase(descriptor, { practiceId: "practice-luca-maestri", customerKey: "altro-cliente", generationId: "generation-luca-maestri-1" })).toBe(false);
    expect(operatorEvidenceAppliesToCase(descriptor, { practiceId: "practice-luca-maestri", customerKey: "luca-maestri", generationId: "generation-luca-maestri-2" })).toBe(false);
  });

  it("migra una richiesta legacy senza inventarne categoria o fase", () => {
    const migrated = migrateLegacyOperatorRequest({ requestId: "operator:legacy:1", field: "documents.invoice", reason: "Documento mancante.", question: "La fattura e' stata caricata?", evidenceText: "Nessuna fattura acquisita.", sourceIds: ["dossier-1"], choices: [{ value: "uploaded", label: "Caricata" }] }, { practiceId: "practice-1", customerKey: "customer-1", generationId: "generation-1", createdAt: "2026-08-17T09:10:01.000Z", ruleIds: ["system-apr-operator-intervention-routing"] });
    expect(migrated).toMatchObject({ category: "legacy_unclassified", stage: "unknown", code: "legacy_operator_request", resumePolicy: "recompute_before_draft", scope: { practiceId: "practice-1", customerKey: "customer-1", generationId: "generation-1", propagation: "forbidden" } });
  });

  it("produce una chiave idempotente stabile per lo stesso blocco e la stessa generazione", () => {
    expect(maestri().idempotencyKey).toBe(maestri().idempotencyKey);
  });
});
