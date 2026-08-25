import { describe, expect, it } from "vitest";
import { applyAprInfissiOriginalSourcePolicy } from "./infissiOriginalSourcePolicy";
import { extractAprInfissiAutomaticTechnicalEvidence } from "./infissiAutomaticDocumentEvidence";

describe("fonti Infissi attendibili ed elaborazione ex novo", () => {
  it("ammette fattura e certificato terzo esplicito, escludendo il documento CRM interno", () => {
    const result = applyAprInfissiOriginalSourcePolicy([
      { sourceId: "fattura", kind: "invoice", text: "fattura" },
      { sourceId: "certificato", kind: "third_party_certificate", text: "DOP" },
      { sourceId: "interno", kind: "additional", text: "documento tecnico interno" },
    ]);
    expect(result.trusted.map((source) => source.sourceId)).toEqual(["fattura", "certificato"]);
    expect(result.excluded).toEqual([expect.objectContaining({ sourceId: "interno", reason: "crm_internal_technical_document_not_authoritative" })]);
  });

  it("non usa un documento interno anche se contiene dati tecnici completi", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{
      sourceId: "interno",
      kind: "crm_internal_technical_document",
      text: "Finestra 1000 x 1200 mm Pezzi 2 Trasmittanza termica Uw 1,1",
    }]);
    expect(result).toMatchObject({ status: "operator_required", evidence: null, blockers: ["infissi_dimensions_and_cardinality_missing"] });
    expect(result.audit.excludedSources).toEqual([expect.objectContaining({ sourceId: "interno" })]);
  });

  it("ignora stato operatore e storico ENEA: l'output tecnico resta identico", () => {
    const invoice = { sourceId: "fattura", kind: "invoice", text: "FATTURA Serramenti 1000 x 1200 mm Pezzi 1" };
    const first = extractAprInfissiAutomaticTechnicalEvidence([invoice]);
    const second = extractAprInfissiAutomaticTechnicalEvidence([
      invoice,
      { sourceId: "operatore", kind: "operator_history", text: "COMPLETED 99 infissi 9x9" },
      { sourceId: "enea-storico", kind: "crm_history", text: "CPID 123 8 infissi" },
    ]);
    expect(second.evidence).toEqual(first.evidence);
    expect(second.blockers).toEqual(first.blockers);
    expect(second.audit.excludedSources.map((source) => source.sourceId)).toEqual(["operatore", "enea-storico"]);
  });
});
