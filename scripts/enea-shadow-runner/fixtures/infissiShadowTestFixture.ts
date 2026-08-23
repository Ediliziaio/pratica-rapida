import type { InfissiArchivedCasePreflightInput } from "../../../src/features/enea-shadow-crm/infissiOriginalDocumentParser";

const dimensions = "1245 mm x 1435 mm (x2) 1345 mm x 2305 mm 1240 mm x 1435 mm 1245 mm x 2340 mm (x2) 685 mm x 1435 mm 875 mm x 1435 mm";
const sizes = [[1245, 1435], [1345, 2305], [1240, 1435], [1245, 2340], [685, 1435], [1245, 2340], [875, 1435], [1245, 1435]] as const;
const dop = sizes.map((_, index) => `WEB/24/1003317 - ${String(index + 1).padStart(3, "0")}\nTrasmittanza termica Uw [W/m K] ${index === 4 || index === 6 ? "1.2" : "1.3"}`).join("\n");

export const APR_INFISSI_SHADOW_TEST_FIXTURE: InfissiArchivedCasePreflightInput = Object.freeze({
  practiceId: "89665fb7-aaad-4f33-8c15-8141920dc163",
  customerKey: "cristina-fabbro",
  displayName: "Cristina Fabbro",
  invoiceDimensionSource: { sourceId: "fattura-97", text: dimensions },
  invoiceFinancialSources: [
    { sourceId: "fattura-514", text: "TOTALE 3.800,01(EUR)" },
    { sourceId: "fattura-97", text: `${dimensions}\nTOTALE 3.250,01(EUR)` },
    { sourceId: "fattura-466", text: "TOTALE 550,00(EUR)" },
  ],
  technicalDocumentSource: { sourceId: "dop", text: dop },
  verifiedTechnicalPageDimensions: sizes.map(([widthMm, heightMm], index) => ({
    pageId: String(index + 1).padStart(3, "0"),
    widthMm,
    heightMm,
    verificationMethod: "visual_pdf_page_verified" as const,
  })),
  form: {
    explicitNewFrameMaterial: "PVC",
    explicitGlassType: "Triplo vetro basso emissivo",
    oldFrameMaterial: "legno",
    oldGlazingType: "doppio",
    alsoInstalledClosures: false,
    sourceId: "form-crm",
  },
});
