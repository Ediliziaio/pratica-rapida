import { describe, expect, it } from "vitest";
import { probeAprInfissiTechnicalSources } from "./infissiTechnicalSourceProbe";

describe("APR infissi technical source probe", () => {
  it("segnala le righe con trasmittanza e geometria senza trasformarle in mapping", () => {
    const result = probeAprInfissiTechnicalSources([{
      path: "practice/scheda.pdf",
      kind: "additional",
      text: "Serramento PVC vetro triplo\nUw = 0,88 W/m²K\nDimensioni 1200 x 1500 mm",
    }]);

    expect(result.hasTransmittanceEvidence).toBe(true);
    expect(result.hasGeometryEvidence).toBe(true);
    expect(result.candidateLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ lineNumber: 2, signals: expect.arrayContaining(["transmittance"]) }),
      expect.objectContaining({ lineNumber: 3, signals: expect.arrayContaining(["dimensions"]) }),
    ]));
  });

  it("non dichiara evidenza tecnica se il documento contiene solo importi", () => {
    const result = probeAprInfissiTechnicalSources([{
      path: "practice/fattura.pdf",
      kind: "invoice",
      text: "Fattura n. 12\nTotale euro 9.996,66",
    }]);

    expect(result.hasTransmittanceEvidence).toBe(false);
    expect(result.hasGeometryEvidence).toBe(false);
  });
});
