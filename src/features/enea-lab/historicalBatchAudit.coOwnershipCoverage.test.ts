import { describe, expect, it } from "vitest";
import { classifyHistoricalAudit } from "./historicalBatchAudit";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";

const BASE_MATCHES = [
  "intervento.tipo",
  "beneficiario.cf",
  "beneficiario.cointestazione",
  "immobile.foglio",
  "immobile.mappale",
  "immobile.superficie",
  "immobile.unita",
  "intervento.data_inizio",
  "intervento.data_fine",
  "schermature.numero",
  "schermature.spesa",
  "schermature.risparmio_energia",
];

function completedAudit(matchedFieldIds = BASE_MATCHES): CompletedEneaAuditResult {
  return {
    path: "demo/conclusa.pdf",
    cpid: "288717-2026E-TEST",
    compared: 14,
    matches: 14,
    mismatches: 0,
    differences: [],
    matchedFieldIds,
  };
}

describe("copertura critica della cointestazione nell'audit storico", () => {
  it("non certifica un match se il parser non osserva la presenza di altri beneficiari", () => {
    const audit = completedAudit(
      BASE_MATCHES.filter((fieldId) => fieldId !== "beneficiario.cointestazione"),
    );

    expect(classifyHistoricalAudit(audit, new Set()).outcome).toBe("difference");
  });

  it("continua a certificare il match quando la cointestazione e osservata", () => {
    expect(classifyHistoricalAudit(completedAudit(), new Set()).outcome).toBe("match");
  });
});
