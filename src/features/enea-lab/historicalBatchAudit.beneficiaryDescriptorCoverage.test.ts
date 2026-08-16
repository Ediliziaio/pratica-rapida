import { describe, expect, it } from "vitest";
import { classifyHistoricalAudit } from "./historicalBatchAudit";
import type { CompletedEneaAuditResult } from "./completedEneaAudit";

const VALID_CPID = "288717-2026E-TEST";
const BENEFICIARY_DESCRIPTOR_FIELDS = [
  "beneficiario.nome",
  "beneficiario.cognome",
  "beneficiario.sesso",
  "beneficiario.data_nascita",
  "beneficiario.comune_nascita",
  "beneficiario.indirizzo_residenza",
  "beneficiario.civico_residenza",
  "beneficiario.cap_residenza",
  "beneficiario.comune_residenza",
] as const;
const BASELINE_MATCHES = [
  "intervento.tipo",
  "beneficiario.cf",
  "beneficiario.cointestazione",
  ...BENEFICIARY_DESCRIPTOR_FIELDS,
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

function auditWithoutBeneficiaryDescriptors(): CompletedEneaAuditResult {
  const beneficiaryDescriptors = new Set<string>(BENEFICIARY_DESCRIPTOR_FIELDS);
  const matchedFieldIds = BASELINE_MATCHES.filter(
    (candidate) => !beneficiaryDescriptors.has(candidate),
  );
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

describe("copertura storica anagrafica beneficiario ENEA", () => {
  it("mantiene match quando tutti i dati anagrafici osservati sono coperti", () => {
    expect(classifyHistoricalAudit(auditWithout(), new Set()).outcome).toBe("match");
  });

  it.each(BENEFICIARY_DESCRIPTOR_FIELDS)(
    "fallisce chiuso se il parser perde %s",
    (fieldId) => {
      expect(classifyHistoricalAudit(auditWithout(fieldId), new Set()).outcome).toBe("difference");
    },
  );

  it("fallisce chiuso se il parser perde l'intero blocco anagrafico osservato", () => {
    expect(classifyHistoricalAudit(auditWithoutBeneficiaryDescriptors(), new Set()).outcome)
      .toBe("difference");
  });
});
