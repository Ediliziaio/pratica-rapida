import { describe, expect, it } from "vitest";
import { classifyHistoricalAudit } from "./historicalBatchAudit";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";

const BASE_MATCHES = [
  "intervento.tipo",
  "beneficiario.cf",
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
    compared: 13,
    matches: 13,
    mismatches: 0,
    differences: [],
    matchedFieldIds,
  };
}

describe("copertura critica delle unita immobiliari nell'audit storico", () => {
  it("non certifica un match se il parser non osserva il numero totale di unita immobiliari", () => {
    const audit = completedAudit(
      BASE_MATCHES.filter((fieldId) => fieldId !== "immobile.unita"),
    );

    expect(classifyHistoricalAudit(audit, new Set()).outcome).toBe("difference");
  });

  it("continua a certificare il match quando il numero totale di unita immobiliari e osservato", () => {
    expect(classifyHistoricalAudit(completedAudit(), new Set()).outcome).toBe("match");
  });

  it("considera coperto anche un numero di unita discordante gia bloccato", () => {
    const audit: CompletedEneaAuditResult = {
      ...completedAudit(BASE_MATCHES.filter((fieldId) => fieldId !== "immobile.unita")),
      matches: 12,
      mismatches: 1,
      differences: [{
        fieldId: "immobile.unita",
        completedValue: "2",
        mappedValue: "1",
      }],
    };

    expect(
      classifyHistoricalAudit(audit, new Set(["immobile.unita"])).outcome,
    ).toBe("blocked");
  });
});
