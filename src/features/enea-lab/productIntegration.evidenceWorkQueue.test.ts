import { describe, expect, it } from "vitest";
import {
  buildAprProductEvidenceWorkQueue,
  type AprProductInventoryRow,
} from "./productIntegration";

function row(overrides: Partial<AprProductInventoryRow>): AprProductInventoryRow {
  return {
    id: "practice-base",
    productType: "infissi",
    productLabel: "Infissi",
    lifecycle: "historical",
    hasCompletedClientForm: true,
    invoiceCount: 0,
    additionalDocumentCount: 0,
    completedEneaPdfCount: 0,
    integrationPhase: "intake-only",
    shadowEvaluationAllowed: false,
    officialSubmissionAllowed: false,
    ...overrides,
  };
}

describe("APR evidence work queue", () => {
  it("seleziona candidate practice ID senza dati anagrafici e privilegia la ground truth conclusa", () => {
    const queue = buildAprProductEvidenceWorkQueue([
      row({
        id: "infissi-historical-strong",
        completedEneaPdfCount: 2,
        invoiceCount: 1,
        additionalDocumentCount: 1,
      }),
      row({
        id: "infissi-historical-second",
        completedEneaPdfCount: 1,
        invoiceCount: 3,
        additionalDocumentCount: 2,
      }),
      row({
        id: "infissi-ready",
        lifecycle: "ready",
        completedEneaPdfCount: 0,
        invoiceCount: 2,
      }),
      row({
        id: "impianto-historical",
        productType: "impianto_termico",
        productLabel: "Pompa di calore",
        completedEneaPdfCount: 1,
        invoiceCount: 1,
      }),
      row({
        id: "screening-historical",
        productType: "schermature",
        productLabel: "Schermature",
        integrationPhase: "screenings-validated",
        shadowEvaluationAllowed: true,
        completedEneaPdfCount: 5,
      }),
      row({
        id: "unknown-row",
        productType: "unknown",
        productLabel: "Altro",
        integrationPhase: "needs-classification",
      }),
    ], 2);

    const infissi = queue.find((entry) => entry.productType === "infissi");
    expect(infissi?.completedGroundTruthCandidates.map((candidate) => candidate.practiceId)).toEqual([
      "infissi-historical-strong",
      "infissi-historical-second",
    ]);
    expect(infissi?.shadowIntakeCandidates.map((candidate) => candidate.practiceId)).toEqual([
      "infissi-ready",
    ]);
    expect(infissi?.selectionScope).toBe("practice-id-and-document-counts-only");

    const impianto = queue.find((entry) => entry.productType === "impianto_termico");
    expect(impianto?.completedGroundTruthCandidates.map((candidate) => candidate.practiceId)).toEqual([
      "impianto-historical",
    ]);

    expect(queue.map((entry) => entry.productType)).toEqual([
      "infissi",
      "impianto_termico",
      "insufflaggio",
    ]);
  });

  it("limita ogni lista in modo deterministico senza promuovere capacità shadow o invio", () => {
    const queue = buildAprProductEvidenceWorkQueue([
      row({ id: "z-ready", lifecycle: "ready", invoiceCount: 1 }),
      row({ id: "a-ready", lifecycle: "ready", invoiceCount: 1 }),
      row({ id: "b-ready", lifecycle: "ready", invoiceCount: 1 }),
    ], 2);

    const infissi = queue.find((entry) => entry.productType === "infissi");
    expect(infissi?.shadowIntakeCandidates.map((candidate) => candidate.practiceId)).toEqual([
      "a-ready",
      "b-ready",
    ]);
    expect(infissi?.shadowTechnicalMappingAllowed).toBe(false);
    expect(infissi?.officialSubmissionAllowed).toBe(false);
  });
});
