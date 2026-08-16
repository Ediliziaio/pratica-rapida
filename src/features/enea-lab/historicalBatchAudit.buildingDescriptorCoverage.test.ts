import { describe, expect, it } from "vitest";
import { classifyHistoricalAudit } from "./historicalBatchAudit";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";

const VALID_CPID = "288717-2026E-TEST";
const BASELINE_MATCHES = [
  "intervento.tipo",
  "beneficiario.cf",
  "beneficiario.cointestazione",
  "beneficiario.titolo",
  "immobile.foglio",
  "immobile.mappale",
  "immobile.anno",
  "immobile.destinazione_generale",
  "immobile.destinazione_particolare",
  "immobile.tipologia",
  "immobile.superficie",
  "immobile.unita",
  "intervento.ambito",
  "intervento.unita_oggetto",
  "intervento.accorpamenti",
  "impianto.tipo",
  "impianto.terminali",
  "impianto.generatore",
  "impianto.numero_generatori",
  "impianto.rendimento",
  "impianto.potenza",
  "impianto.combustibile",
  "impianto.condizionamento",
  "intervento.data_inizio",
  "intervento.data_fine",
  "schermature.numero",
  "schermature.0.tipo",
  "schermature.spesa",
  "schermature.risparmio_energia",
] as const;

function auditWithout(fieldId?: string): CompletedEneaAuditResult {
  const matchedFieldIds = BASELINE_MATCHES.filter((candidate) => candidate !== fieldId);
  return {
    path: "demo/conclusa.pdf",
    cpid: VALID_CPID,
    compared: matchedFieldIds.length,
    matches: matchedFieldIds.length,
    mismatches: 0,
    differences: [],
    matchedFieldIds,
  };
}

describe("copertura storica descrittori immobile ENEA", () => {
  it("mantiene match quando tutti i descrittori osservati sono coperti", () => {
    expect(classifyHistoricalAudit(auditWithout(), new Set()).outcome).toBe("match");
  });

  it.each([
    "beneficiario.titolo",
    "immobile.anno",
    "immobile.destinazione_generale",
    "immobile.destinazione_particolare",
    "immobile.tipologia",
  ])("fallisce chiuso se il parser perde %s", (fieldId) => {
    expect(classifyHistoricalAudit(auditWithout(fieldId), new Set()).outcome).toBe("difference");
  });
});
