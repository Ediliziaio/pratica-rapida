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
  "impianto.generatore",
  "impianto.numero_generatori",
  "impianto.rendimento",
  "impianto.potenza",
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
    compared: matchedFieldIds.length,
    matches: matchedFieldIds.length,
    mismatches: 0,
    differences: [],
    matchedFieldIds,
  };
}

describe("copertura critica della superficie utile nell'audit storico", () => {
  it("non certifica un match se il parser non osserva la superficie utile", () => {
    const audit = completedAudit(
      BASE_MATCHES.filter((fieldId) => fieldId !== "immobile.superficie"),
    );

    expect(classifyHistoricalAudit(audit, new Set()).outcome).toBe("difference");
  });

  it("continua a certificare il match quando la superficie utile e osservata", () => {
    expect(classifyHistoricalAudit(completedAudit(), new Set()).outcome).toBe("match");
  });

  it("considera coperta anche una superficie discordante gia bloccata", () => {
    const matchedFieldIds = BASE_MATCHES.filter((fieldId) => fieldId !== "immobile.superficie");
    const audit: CompletedEneaAuditResult = {
      ...completedAudit(matchedFieldIds),
      compared: BASE_MATCHES.length,
      matches: matchedFieldIds.length,
      mismatches: 1,
      differences: [{
        fieldId: "immobile.superficie",
        completedValue: "140",
        mappedValue: "120 m²",
      }],
    };

    expect(
      classifyHistoricalAudit(audit, new Set(["immobile.superficie"])).outcome,
    ).toBe("blocked");
  });
});
