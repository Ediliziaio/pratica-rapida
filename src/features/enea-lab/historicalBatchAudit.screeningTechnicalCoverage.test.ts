import { describe, expect, it } from "vitest";
import { classifyHistoricalAudit } from "./historicalBatchAudit";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";

const VALID_CPID = "288717-2026E-TEST";
const BASELINE_MATCHES = [
  "intervento.tipo",
  "beneficiario.cf",
  "beneficiario.cointestazione",
  "beneficiario.nome",
  "beneficiario.cognome",
  "beneficiario.sesso",
  "beneficiario.data_nascita",
  "beneficiario.comune_nascita",
  "beneficiario.indirizzo_residenza",
  "beneficiario.civico_residenza",
  "beneficiario.cap_residenza",
  "beneficiario.comune_residenza",
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
  "schermature.spesa",
  "schermature.risparmio_energia",
] as const;

const SCREENING_BASE_FIELDS = [
  "schermature.0.tipo",
  "schermature.0.installazione",
  "schermature.0.superficie",
  "schermature.0.superficie_finestrata",
  "schermature.0.esposizione",
  "schermature.0.modalita_calcolo",
  "schermature.0.materiale",
  "schermature.0.regolazione",
] as const;

type AuditWithObservedValues = CompletedEneaAuditResult & {
  completedFieldValues?: Record<string, string>;
};

function auditWithScreening(
  performanceField: "schermature.0.gtot" | "schermature.0.rsupp",
  omittedField?: string,
  typeValue = performanceField.endsWith("rsupp") ? "Persiana avvolgibile" : "Tenda o veneziana",
): AuditWithObservedValues {
  const matchedFieldIds = [
    ...BASELINE_MATCHES,
    ...SCREENING_BASE_FIELDS,
    performanceField,
  ].filter((fieldId) => fieldId !== omittedField);

  return {
    path: "demo/conclusa.pdf",
    cpid: VALID_CPID,
    compared: matchedFieldIds.length,
    matches: matchedFieldIds.length,
    mismatches: 0,
    differences: [],
    matchedFieldIds,
    completedFieldValues: {
      "schermature.0.tipo": typeValue,
    },
  };
}

describe("copertura storica righe tecniche schermature ENEA", () => {
  it("mantiene match con una schermatura solare tecnicamente completa", () => {
    expect(classifyHistoricalAudit(auditWithScreening("schermature.0.gtot"), new Set()).outcome)
      .toBe("match");
  });

  it.each(SCREENING_BASE_FIELDS)("fallisce chiuso se il parser perde %s", (fieldId) => {
    expect(classifyHistoricalAudit(
      auditWithScreening("schermature.0.gtot", fieldId),
      new Set(),
    ).outcome).toBe("difference");
  });

  it("fallisce chiuso se una schermatura solare perde ogni prestazione tecnica", () => {
    expect(classifyHistoricalAudit(
      auditWithScreening("schermature.0.gtot", "schermature.0.gtot"),
      new Set(),
    ).outcome).toBe("difference");
  });

  it("fallisce chiuso se una chiusura oscurante perde ogni prestazione tecnica", () => {
    expect(classifyHistoricalAudit(
      auditWithScreening("schermature.0.rsupp", "schermature.0.rsupp"),
      new Set(),
    ).outcome).toBe("difference");
  });

  it("non certifica una schermatura solare se resta solo Rsupp ma manca gTot", () => {
    expect(classifyHistoricalAudit(
      auditWithScreening("schermature.0.rsupp", undefined, "Tenda o veneziana"),
      new Set(),
    ).outcome).toBe("difference");
  });

  it("non certifica una chiusura oscurante se resta solo gTot ma manca Rsupp", () => {
    expect(classifyHistoricalAudit(
      auditWithScreening("schermature.0.gtot", undefined, "Persiana avvolgibile"),
      new Set(),
    ).outcome).toBe("difference");
  });
});
