import { describe, expect, it } from "vitest";
import {
  buildInfissiArchivedCasePreflight,
  extractInfissiInvoiceDimensions,
  extractInfissiTechnicalDeclarations,
  extractInvoiceGrossTotal,
} from "./infissiOriginalDocumentParser";

const invoiceDimensions = `Misure finestre: 1245\nmm x 1435 mm (x2) 1345 mm x 2305 mm\n1240 mm x 1435 mm 1245 mm x 2340 mm\n(x2) 685 mm x 1435 mm 875 mm x 1435 mm`;
const dop = Array.from({ length: 8 }, (_, index) => {
  const id = String(index + 1).padStart(3, "0");
  const uw = [1.3, 1.3, 1.3, 1.3, 1.2, 1.3, 1.2, 1.3][index];
  return `WEB/24/1003317 - ${id}\nDichiarazione di prestazione\nTrasmittanza termica Uw [W/m K] ${uw}`;
}).join("\n");
const verifiedDimensions = [
  ["001", 1245, 1435], ["002", 1345, 2305], ["003", 1240, 1435], ["004", 1245, 2340],
  ["005", 685, 1435], ["006", 1245, 2340], ["007", 875, 1435], ["008", 1245, 1435],
].map(([pageId, widthMm, heightMm]) => ({ pageId: String(pageId), widthMm: Number(widthMm), heightMm: Number(heightMm), verificationMethod: "visual_pdf_page_verified" as const }));

describe("APR Infissi · parser fonti originarie e preflight archiviato", () => {
  it("estrae sei righe fattura ed espande una cardinalita fisica totale di otto", () => {
    const rows = extractInfissiInvoiceDimensions(invoiceDimensions, "fattura-97");
    expect(rows).toHaveLength(6);
    expect(rows.reduce((sum, row) => sum + row.quantity, 0)).toBe(8);
    expect(rows[0]).toMatchObject({ quantity: 2, widthMm: 1245, heightMm: 1435 });
    expect(rows[3]).toMatchObject({ quantity: 2, widthMm: 1245, heightMm: 2340 });
  });

  it("estrae le otto dichiarazioni DOP e la trasmittanza esplicita per pagina", () => {
    expect(extractInfissiTechnicalDeclarations(dop, "dop")).toEqual([
      expect.objectContaining({ pageId: "001", thermalTransmittanceWm2K: 1.3 }),
      expect.objectContaining({ pageId: "002", thermalTransmittanceWm2K: 1.3 }),
      expect.objectContaining({ pageId: "003", thermalTransmittanceWm2K: 1.3 }),
      expect.objectContaining({ pageId: "004", thermalTransmittanceWm2K: 1.3 }),
      expect.objectContaining({ pageId: "005", thermalTransmittanceWm2K: 1.2 }),
      expect.objectContaining({ pageId: "006", thermalTransmittanceWm2K: 1.3 }),
      expect.objectContaining({ pageId: "007", thermalTransmittanceWm2K: 1.2 }),
      expect.objectContaining({ pageId: "008", thermalTransmittanceWm2K: 1.3 }),
    ]);
  });

  it("somma i totali IVA inclusa di fatture distinte e produce un piano locale READY senza azioni esterne", () => {
    const result = buildInfissiArchivedCasePreflight({
      practiceId: "practice-cristina",
      customerKey: "cristina-fabbro",
      displayName: "Cristina Fabbro",
      invoiceDimensionSource: { sourceId: "fattura-97", text: invoiceDimensions },
      invoiceFinancialSources: [
        { sourceId: "fattura-514", text: "Fattura 514 TOTALE 3.800,01(EUR)" },
        { sourceId: "fattura-97", text: `${invoiceDimensions}\nTOTALE 3.250,01(EUR)` },
        { sourceId: "fattura-466", text: "Fattura 466 TOTALE 550,00(EUR)" },
      ],
      technicalDocumentSource: { sourceId: "dop", text: dop },
      verifiedTechnicalPageDimensions: verifiedDimensions,
      form: {
        explicitNewFrameMaterial: "PVC",
        explicitGlassType: "Triplo vetro basso emissivo",
        oldFrameMaterial: "legno",
        oldGlazingType: "doppio",
        alsoInstalledClosures: false,
        sourceId: "form-crm",
      },
    });

    expect(result.caseTruth).toBe("READY");
    expect(result.report).toMatchObject({ outcome: "ready_local_plan", blockers: [], physicalProductCount: 8, invoiceGrossTotal: 7600.02 });
    // Il piano conserva l'ordine della fattura; le DOP vengono associate per
    // dimensione, non per la loro posizione nel PDF multipagina.
    expect(result.report.rows.map((row) => row.thermalTransmittanceWm2K)).toEqual([1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.2, 1.2]);
    expect(result.report.productRules).toMatchObject({
      eneaShadingClosuresChecked: false,
      newFrameMaterial: "PVC",
      glassType: "Triplo vetro basso emissivo",
      oldWindowThermalTransmittanceWm2K: 3,
      audit: { oldWindowThermalTransmittance: { source: "form_matrix_combination", audit: { formSourceId: "form-crm" } } },
    });
    expect(result.report.eneaDraftPayload).toMatchObject({
      physicalWindowCount: 8,
      expenseGrossVatIncluded: 7600.02,
      portalManagedFields: { energySavings: "leave_unset_portal_computed" },
    });
    expect(result.report.eneaDraftPayload?.windows).toHaveLength(8);
    expect(result.report.eneaDraftPayload).not.toHaveProperty("energySavingsKwhYear");
    expect(JSON.stringify(result.report.eneaDraftPayload)).not.toMatch(/observedValueKwhYear/);
    expect(result.draftPlan).toMatchObject({ status: "ready_for_portal_mapping", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
  });

  it("fallisce chiuso se la verifica visuale perde una pagina o la cardinalita non coincide", () => {
    const result = buildInfissiArchivedCasePreflight({
      practiceId: "practice-conflict",
      customerKey: "conflict",
      displayName: "Caso conflitto",
      invoiceDimensionSource: { sourceId: "fattura", text: invoiceDimensions },
      invoiceFinancialSources: [{ sourceId: "fattura", text: `${invoiceDimensions}\nTOTALE 1.000,00(EUR)` }],
      technicalDocumentSource: { sourceId: "dop", text: dop },
      verifiedTechnicalPageDimensions: verifiedDimensions.slice(0, 7),
      form: { alsoInstalledClosures: false, sourceId: "form" },
    });
    expect(result.caseTruth).toBe("OPERATOR_REQUIRED");
    expect(result.report.outcome).toBe("blocked_case");
    expect(result.report.eneaDraftPayload).toBeNull();
    expect(result.report.blockers.map((row) => row.code)).toEqual(expect.arrayContaining([
      "infissi_visual_page_verification_mismatch",
      "infissi_invoice_technical_document_cardinality_or_dimensions_conflict",
    ]));
    expect(result.draftPlan.externalActionAllowed).toBe(false);
  });

  it("non inventa totali ambigui o senza riga TOTALE", () => {
    expect(extractInvoiceGrossTotal("Imponibile 1.000,00 EUR IVA 220,00 EUR")).toBeNull();
    expect(extractInvoiceGrossTotal("TOTALE 1.220,00 EUR")).toBe(1220);
  });
});
