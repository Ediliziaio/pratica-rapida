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
    compared: 12,
    matches: 12,
    mismatches: 0,
    differences: [],
    matchedFieldIds,
  };
}

describe("copertura critica del risparmio energetico nell'audit storico", () => {
  it("non certifica un match se il parser non osserva il risparmio energetico", () => {
    const audit = completedAudit(
      BASE_MATCHES.filter((fieldId) => fieldId !== "schermature.risparmio_energia"),
    );

    expect(classifyHistoricalAudit(audit, new Set()).outcome).toBe("difference");
  });

  it("continua a certificare il match quando il risparmio energetico e osservato", () => {
    expect(classifyHistoricalAudit(completedAudit(), new Set()).outcome).toBe("match");
  });

  it("considera coperto anche un risparmio energetico discordante gia bloccato", () => {
    const audit: CompletedEneaAuditResult = {
      ...completedAudit(BASE_MATCHES.filter((fieldId) => fieldId !== "schermature.risparmio_energia")),
      matches: 11,
      mismatches: 1,
      differences: [{
        fieldId: "schermature.risparmio_energia",
        completedValue: "311",
        mappedValue: "0 kWh/anno",
      }],
    };

    expect(
      classifyHistoricalAudit(audit, new Set(["schermature.risparmio_energia"])).outcome,
    ).toBe("blocked");
  });
});
