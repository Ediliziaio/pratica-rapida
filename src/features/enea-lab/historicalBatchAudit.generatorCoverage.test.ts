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
  "impianto.tipo",
  "impianto.terminali",
  "impianto.generatore",
  "impianto.numero_generatori",
  "impianto.rendimento",
  "impianto.potenza",
  "impianto.combustibile",
  "impianto.condizionamento",
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

describe("copertura critica del generatore nell'audit storico", () => {
  it("non certifica un match se il parser perde il tipo generatore osservato nel PDF conclusivo", () => {
    const audit = completedAudit(
      BASE_MATCHES.filter((fieldId) => fieldId !== "impianto.generatore"),
    );

    expect(classifyHistoricalAudit(audit, new Set()).outcome).toBe("difference");
  });

  for (const fieldId of [
    "impianto.numero_generatori",
    "impianto.rendimento",
    "impianto.potenza",
  ]) {
    it(`non certifica un match se il parser perde ${fieldId}`, () => {
      const audit = completedAudit(BASE_MATCHES.filter((candidate) => candidate !== fieldId));

      expect(classifyHistoricalAudit(audit, new Set()).outcome).toBe("difference");
    });
  }

  it("continua a certificare il match quando tutti i dati osservati del generatore sono coperti", () => {
    expect(classifyHistoricalAudit(completedAudit(), new Set()).outcome).toBe("match");
  });
});
