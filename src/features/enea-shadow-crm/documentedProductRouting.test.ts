import { describe, expect, it } from "vitest";
import { resolveAprDocumentedProductRouting } from "./documentedProductRouting";

describe("routing prodotto da fonti originarie", () => {
  it("instrada persiane al modulo schermature anche con etichetta Infissi", () => {
    const result = resolveAprDocumentedProductRouting({ declaredModule: "infissi", sources: [{ sourceId: "invoice", text: "FORNITURA E POSA DI N. 8 PERSIANE IN ALLUMINIO" }] });
    expect(result).toMatchObject({ module: "screening", source: "original_documents", declaredModule: "infissi" });
  });
  it("conserva entrambe le famiglie quando la fattura e realmente mista", () => {
    const result = resolveAprDocumentedProductRouting({ declaredModule: "infissi", sources: [{ sourceId: "invoice", text: "FORNITURA N. 3 SERRAMENTI IN PVC COMPLETI DI N. 3 PERSIANE IN ALLUMINIO" }] });
    expect(result.module).toBe("mixed");
    expect(result.screeningEvidence).not.toHaveLength(0); expect(result.infissiEvidence).not.toHaveLength(0);
  });
  it("non perde gli infissi quando la fattura scrive Infissi PVC senza preposizione", () => {
    const result = resolveAprDocumentedProductRouting({ declaredModule: "infissi", sources: [{ sourceId: "invoice", text: "Tapparella in alluminio N. 1 da 143 x 185 cm. Infissi PVC esterno bianco N. 3 da 1390 x 1600." }] });
    expect(result.module).toBe("mixed");
    expect(result.screeningEvidence).not.toHaveLength(0);
    expect(result.infissiEvidence).not.toHaveLength(0);
  });
  it("usa l'etichetta soltanto quando le fonti non qualificano il prodotto", () => {
    expect(resolveAprDocumentedProductRouting({ declaredModule: "infissi", sources: [{ sourceId: "promo", text: "PraticaRapida" }] })).toMatchObject({ module: "infissi", source: "declared_label" });
  });
});
