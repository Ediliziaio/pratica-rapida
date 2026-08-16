import { describe, expect, it } from "vitest";
import { classifyHistoricalAudit } from "./historicalBatchAudit";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";

const OBSERVED_MATCHES = [
  "intervento.tipo",
  "beneficiario.cf",
  "beneficiario.cointestazione",
  "immobile.foglio",
  "immobile.mappale",
  "immobile.superficie",
  "immobile.unita",
  "intervento.ambito",
  "intervento.unita_oggetto",
  "intervento.accorpamenti",
  "intervento.data_inizio",
  "intervento.data_fine",
  "schermature.numero",
  "impianto.tipo",
  "impianto.terminali",
  "impianto.generatore",
  "impianto.numero_generatori",
  "impianto.rendimento",
  "impianto.potenza",
  "impianto.combustibile",
  "impianto.condizionamento",
  "schermature.spesa",
  "schermature.risparmio_energia",
];

function completedAudit(matchedFieldIds = OBSERVED_MATCHES): CompletedEneaAuditResult {
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

describe("copertura critica dell'intervento nell'audit storico", () => {
  for (const fieldId of [
    "intervento.ambito",
    "intervento.unita_oggetto",
    "intervento.accorpamenti",
  ]) {
    it(`non certifica un match se il parser perde ${fieldId}`, () => {
      const audit = completedAudit(OBSERVED_MATCHES.filter((candidate) => candidate !== fieldId));

      expect(classifyHistoricalAudit(audit, new Set()).outcome).toBe("difference");
    });
  }

  it("continua a certificare il match quando l'intervento osservato e' interamente coperto", () => {
    expect(classifyHistoricalAudit(completedAudit(), new Set()).outcome).toBe("match");
  });
});
