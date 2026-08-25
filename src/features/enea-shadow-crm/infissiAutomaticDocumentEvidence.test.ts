import { describe, expect, it } from "vitest";
import { extractAprInfissiAutomaticTechnicalEvidence } from "./infissiAutomaticDocumentEvidence";

describe("APR Infissi · estrazione automatica documenti reali", () => {
  it("preserva tre infissi fisici identici nell'ordine della fattura", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "fattura-righe", kind: "invoice", text: `
      FATTURA
      Infissi PVC 1 da 1390 x 1600 - 2 ante 1 da 1390 x 1600 - 2 ante 1 da 1390 x 1600 - 2 ante
      METODO DI PAGAMENTO
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("invoice-physical-row-order");
    expect(result.evidence?.rows).toHaveLength(3);
    expect(result.evidence?.rows.map((item) => [item.widthM, item.heightM])).toEqual([[1.39, 1.6], [1.39, 1.6], [1.39, 1.6]]);
  });

  it("legge fatture con righe dimensioni, pezzi e Uw preservando la cardinalita", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "fattura", kind: "invoice", text: `
      Serramenti in PVC. Dimensioni L x H:
      1580 x 1505 mm finestra 2 A/R
      Uw = 1,2 W/mqk
      Pezzi 1
      1584 x 1505 mm finestra 2 A/R
      Uw = 1,2 W/mqk
      Pezzi 2
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 1.58, heightM: 1.505, thermalTransmittanceWm2K: 1.2 }),
      expect.objectContaining({ quantity: 2, widthM: 1.584, heightM: 1.505, thermalTransmittanceWm2K: 1.2 }),
    ]);
  });

  it("legge schede larghezza/altezza con Uw", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "calcolo", kind: "third_party_certificate", text: `
      Larghezza L 760 mm
      Altezza H= 980mm
      Calcolo trasmittanza termica
      Uw = formula
      Uw = 1,27 W/m2K
      Larghezza L 870 mm
      Altezza H= 1305mm
      Calcolo trasmittanza termica
      Uw = formula
      Uw = 1,24 W/m2K
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toHaveLength(2);
    expect(result.evidence?.rows[0]).toMatchObject({ widthM: 0.76, heightM: 0.98, thermalTransmittanceWm2K: 1.27 });
  });

  it("legge le pagine di prestazione con dimensioni OCR e Uw", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop", kind: "third_party_certificate", text: `
      WEB/26/0680166 - 001
      Quantità: 1
      643 x 1210
      Trasmittanza termica Uw [W/m2K] 0.88
      WEB/26/0680166 - 003
      Quantità: 1
      890 x 2100
      Trasmittanza termica Uw [W/m2K] 0.91
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toHaveLength(2);
  });

  it("non dichiara READY se il documento contiene piu pagine prodotto delle misure OCR estratte", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-incompleto", kind: "third_party_certificate", text: `
      WEB/26/0213119 - 001
      Quantità: 1
      APR_VISUAL_OCR: 785 x 1970
      Trasmittanza termica Uw [W/m2K] 1.3
      WEB/26/0213119 - 002
      Quantità: 1
      Trasmittanza termica Uw [W/m2K] 1.3
    ` }]);

    expect(result).toMatchObject({
      status: "operator_required",
      blockers: ["infissi_performance_page_cardinality_mismatch"],
      evidence: null,
    });
  });

  it("ricostruisce una riga per ciascuna pagina tecnica usando le misure esterne del diagramma", () => {
    const technicalPage = (id: string, width: number, innerWidth: number, height: number, innerHeight: number, thermalLabel = "Uw") => `
WEB/26/0211424 - ${id}
Quantità: 1
Trasmittanza termica ${thermalLabel} [W/m2K] 1.3
APR_VISUAL_OCR:
WEB/26/0211424 - ${id}
343 x 1324
APR_DIAGRAM_OCR:
WEB/26/0211424 - ${id}
Sistemi: Green Evolution 76
${width}
35
${innerWidth}
35
343 x 1324
APR_DIAGRAM_ROTATED_CLOCKWISE_OCR:
${innerHeight}
${height}
WEB/26/0211424 - ${id}
APR_DIAGRAM_ROTATED_COUNTERCLOCKWISE_OCR:
${height}
${innerHeight}
WEB/26/0211424 - ${id}`;
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-sette-pagine", kind: "third_party_certificate", text: [
      technicalPage("001", 1140, 1070, 2470, 2415, "Ud"),
      technicalPage("002", 1135, 1065, 1605, 1535),
      technicalPage("003", 1135, 1065, 2470, 2415, "Ud"),
      technicalPage("004", 1135, 1065, 1610, 1540),
      technicalPage("005", 830, 760, 1603, 1533),
      technicalPage("006", 1140, 1070, 2468, 2413, "Ud"),
      technicalPage("007", 1130, 1060, 2460, 2405, "Ud"),
    ].join("\f") }]);

    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("performance-diagram-page");
    expect(result.evidence?.rows).toHaveLength(7);
    expect(result.evidence?.rows.map((item) => [item.widthM, item.heightM, item.thermalTransmittanceWm2K])).toEqual([
      [1.14, 2.47, 1.3],
      [1.135, 1.605, 1.3],
      [1.135, 2.47, 1.3],
      [1.135, 1.61, 1.3],
      [0.83, 1.603, 1.3],
      [1.14, 2.468, 1.3],
      [1.13, 2.46, 1.3],
    ]);
  });

  it("riconosce anche gli identificativi prestazione ZM oltre a WEB", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-zm", kind: "third_party_certificate", text: `
ZM/25/0275492 - 001
Quantità: 1
Trasmittanza termica Ud [W/m2K] 1.3
APR_DIAGRAM_OCR:
1785
1715
APR_DIAGRAM_ROTATED_CLOCKWISE_OCR:
1934
ZM/25/0275492 - 001` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toEqual([expect.objectContaining({ widthM: 1.785, heightM: 1.934, thermalTransmittanceWm2K: 1.3 })]);
  });

  it("legge anche un infisso largo e basso dalla fascia OCR delle quote verticali", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-orizzontale", kind: "third_party_certificate", text: `
WEB/26/0444923 - 009
Quantità: 1
Trasmittanza termica Uw [W/m2K] 0.98
APR_DIAGRAM_OCR:
WEB/26/0444923 - 009
Sistemi: Salamander bluEvolution 82
1760
1880
APR_DIAGRAM_ROTATED_CLOCKWISE_OCR:
1880
1760
APR_VERTICAL_DIMENSION_CLOCKWISE_OCR:
600
APR_VERTICAL_DIMENSION_COUNTERCLOCKWISE_OCR:
720
600
    ` }]);

    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 1.88, heightM: 0.72, thermalTransmittanceWm2K: 0.98 }),
    ]);
  });

  it("preserva la pagina fisica usando la misura L x H documentata quando manca la quota verticale isolata", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-quota-verticale-ocr-mancante", kind: "third_party_certificate", text: `
WEB/26/0680166 - 001
Quantità: 1
Trasmittanza termica Uw [W/m2K] 0.88
APR_DIAGRAM_OCR:
WEB/26/0680166 - 001
1715
1595
584 x 1204
APR_DIAGRAM_ROTATED_CLOCKWISE_OCR:
1715
1595
584 x 1204
    ` }]);

    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("performance-diagram-page");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 1.715, heightM: 1.204, thermalTransmittanceWm2K: 0.88 }),
    ]);
  });

  it("legge la tabella Qt/LXH/Uw", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "tabella", kind: "third_party_certificate", text: `
      Serramenti - Riferimento Descrizione Qt LXH Uw
      PORTAFINESTRA
      1
      1845 X 2310
      1,13
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows[0]).toMatchObject({ quantity: 1, widthM: 1.845, heightM: 2.31, thermalTransmittanceWm2K: 1.13 });
  });

  it("conta solo i serramenti fisici e non cassonetti, pannelli o riempimenti", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "preventivo-produzione", kind: "third_party_certificate", text: `
Porta 001 Quantità: 1 1060
1060
1020
2605
Dimensione di riempimento nr[1]: 344x2413
Coefficiente termico Uw = 1,3 W/m²·K
Vista interna
Finestra 002 Quantità: 1 Sistema: Cassonetto Salamander
Dimensioni interno cassonetto: L x H: 1386 x 336
Finestra 003 Quantità: 1 Sistema: Glass / Panel
596x1507
Finestra 004 Quantità: 1 Sistema: Salamander GreenEvo 76
1565
720
1750
Dimensione di riempimento nr[1]: 596x1507
Coefficiente termico Peso Uw = 1,3 W/m²·K
Vista interna
    ` }]);

    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("product-assembly-page");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 1.06, heightM: 2.605, thermalTransmittanceWm2K: 1.3 }),
      expect.objectContaining({ quantity: 1, widthM: 1.565, heightM: 1.75, thermalTransmittanceWm2K: 1.3 }),
    ]);
  });

  it("si ferma su due fonti di pari cardinalita ma misure discordanti", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([
      { sourceId: "a", kind: "third_party_certificate", text: "Finestra dimensioni: 1000 x 1200, Pezzi: 1, Trasmittanza termica 1,2" },
      { sourceId: "b", kind: "third_party_certificate", text: "Finestra dimensioni: 1100 x 1200, Pezzi: 1, Trasmittanza termica 1,2" },
    ]);
    expect(result).toMatchObject({ status: "operator_required", blockers: ["infissi_automatic_source_conflict"], evidence: null });
  });
});
