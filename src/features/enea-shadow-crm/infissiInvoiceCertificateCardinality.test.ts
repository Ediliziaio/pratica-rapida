import { describe, expect, it } from "vitest";
import { verifyAprInfissiInvoiceCertificateCardinality } from "./infissiInvoiceCertificateCardinality";

describe("APR Infissi · cardinalità fattura contro certificato", () => {
  it("richiede operatore quando fattura e certificato discordano", () => {
    expect(verifyAprInfissiInvoiceCertificateCardinality([
      { sourceId: "fattura", kind: "invoice", text: "Fornitura e posa di n° 5 infissi e serramenti" },
      { sourceId: "certificato", kind: "third_party_certificate", text: "Pag. 1 su 4\nPag. 2 su 4\nPag. 3 su 4\nPag. 4 su 4" },
    ])).toMatchObject({
      status: "operator_required",
      invoiceCount: 5,
      certificateCount: 4,
      blocker: { code: "infissi_invoice_certificate_cardinality_mismatch", field: "technical_cardinality" },
    });
  });

  it("prosegue quando le cardinalità coincidono", () => {
    expect(verifyAprInfissiInvoiceCertificateCardinality([
      { sourceId: "fattura", kind: "invoice", text: "Fornitura di 4 serramenti" },
      { sourceId: "certificato", kind: "third_party_certificate", text: "Pag. 4 su 4" },
    ])).toMatchObject({ status: "matched", invoiceCount: 4, certificateCount: 4, blocker: null });
  });

  it("non inventa il controllo quando il certificato non è presente", () => {
    expect(verifyAprInfissiInvoiceCertificateCardinality([
      { sourceId: "fattura", kind: "invoice", text: "Fornitura di 4 serramenti" },
    ], 4)).toMatchObject({ status: "not_applicable", certificateCount: null, blocker: null });
  });

  it("non tratta un documento CRM interno come certificato anche se espone un conteggio pagine", () => {
    expect(verifyAprInfissiInvoiceCertificateCardinality([
      { sourceId: "fattura", kind: "invoice", text: "Fornitura di 4 serramenti" },
      { sourceId: "interno", kind: "additional", text: "Pag. 3 su 3" },
    ], 3)).toMatchObject({ status: "not_applicable", certificateCount: null, certificateSourceIds: [], blocker: null });
  });
});
