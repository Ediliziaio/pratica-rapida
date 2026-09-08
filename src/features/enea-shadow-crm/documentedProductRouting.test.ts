import { describe, expect, it } from "vitest";
import { resolveAprDocumentedProductRouting, resolveFormDeclaredProductModule } from "./documentedProductRouting";

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
  it("regola generale definitiva di Giuliano (2026-09-08): conserva entrambe le famiglie (mixed) anche quando infissi e chiusura oscurante provengono da fatture separate di fornitori diversi", () => {
    const result = resolveAprDocumentedProductRouting({
      declaredModule: null,
      sources: [
        { sourceId: "fattura-fornitore-infissi", text: "FORNITURA E POSA IN OPERA DI N. 3 SERRAMENTI IN PVC" },
        { sourceId: "fattura-fornitore-persiane", text: "FORNITURA E POSA DI N. 3 PERSIANE IN ALLUMINIO" },
      ],
    });
    expect(result.module).toBe("mixed");
    expect(result.screeningEvidence.some((item) => item.startsWith("fattura-fornitore-persiane:"))).toBe(true);
    expect(result.infissiEvidence.some((item) => item.startsWith("fattura-fornitore-infissi:"))).toBe(true);
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

  it("regressione Awal: la struttura Infissi del form risolve la pratica quando ne' la fattura ne' l'etichetta di coda offrono un segnale", () => {
    const result = resolveAprDocumentedProductRouting({
      declaredModule: null,
      formDeclaredModule: "infissi",
      sources: [{ sourceId: "invoice-awal", text: "Veka 76 MD - PVC - 5 camere - 3 guarnizioni - 1.1 Uw - Classe A MISURA 103,7 X 141" }],
    });
    expect(result).toMatchObject({ module: "infissi", source: "form_declared", formDeclaredModule: "infissi" });
    expect(result.appliedRuleIds).toContain("user-2026-09-07-form-declared-product-module-priority-v1");
  });

  it("l'etichetta di coda CRM gia' valorizzata resta prioritaria sul form quando le fatture non aggiungono nulla", () => {
    const result = resolveAprDocumentedProductRouting({
      declaredModule: "screening",
      formDeclaredModule: "infissi",
      sources: [],
    });
    expect(result).toMatchObject({ module: "screening", source: "declared_label" });
    expect(result.appliedRuleIds).not.toContain("user-2026-09-07-form-declared-product-module-priority-v1");
  });

  it("non applica la priorita del form quando formDeclaredModule e assente: il comportamento esistente resta invariato", () => {
    const result = resolveAprDocumentedProductRouting({ declaredModule: "infissi", sources: [{ sourceId: "invoice", text: "FORNITURA E POSA DI N. 8 PERSIANE IN ALLUMINIO" }] });
    expect(result).toMatchObject({ module: "screening", source: "original_documents", formDeclaredModule: null });
    expect(result.appliedRuleIds).not.toContain("user-2026-09-07-form-declared-product-module-priority-v1");
  });

  it("regola generale di Giuliano (Gemma Minore): il portoncino, blindato o d'ingresso, e' riconosciuto come infisso", () => {
    const result = resolveAprDocumentedProductRouting({
      sources: [{ sourceId: "fattura-gemma", text: "Fornitura e posa di:\nPortoncino a due ante asimmetriche\nprofilo Rehau" }],
    });
    expect(result).toMatchObject({ module: "infissi", source: "original_documents" });
  });
  it("regola generale di Giuliano: riconosce anche la dicitura 'porta blindata'/'porta d'ingresso' come infisso", () => {
    expect(resolveAprDocumentedProductRouting({ sources: [{ sourceId: "inv", text: "Fornitura e posa di n. 1 porta blindata classe 3" }] }).module).toBe("infissi");
    expect(resolveAprDocumentedProductRouting({ sources: [{ sourceId: "inv", text: "Fornitura e posa di porta d'ingresso in alluminio" }] }).module).toBe("infissi");
  });
  it("regressione: un'evidenza documentale reale continua a correggere anche una struttura Infissi del form (persiana etichettata Infissi)", () => {
    const result = resolveAprDocumentedProductRouting({
      formDeclaredModule: "infissi",
      sources: [{ sourceId: "invoice", text: "FATTURA: fornitura e posa di n. 1 persiana in alluminio 120 x 245 cm" }],
    });
    expect(result).toMatchObject({ module: "screening", source: "original_documents", formDeclaredModule: "infissi" });
    expect(result.appliedRuleIds).not.toContain("user-2026-09-07-form-declared-product-module-priority-v1");
  });
});

describe("resolveFormDeclaredProductModule", () => {
  it("riconosce la struttura Infissi (materiale/vetro vecchio e nuovo)", () => {
    expect(resolveFormDeclaredProductModule({ vetro_nuovi: "doppio", vetro_vecchi: "singolo", materiale_nuovi: "pvc", materiale_vecchi: "legno", zanzariere_tapparelle_persiane: false })).toBe("infissi");
  });
  it("riconosce la struttura Schermature (elenco prodotti)", () => {
    expect(resolveFormDeclaredProductModule({ tipo: "schermature", items: [{ tipo_prodotto: "tende_da_sole", direzione: "sud" }] })).toBe("screening");
    expect(resolveFormDeclaredProductModule({ schermature: [{ tipo_prodotto: "tende_da_sole" }] })).toBe("screening");
  });
  it("resta null se la struttura non e' inequivocabile", () => {
    expect(resolveFormDeclaredProductModule({})).toBeNull();
    expect(resolveFormDeclaredProductModule(null)).toBeNull();
    expect(resolveFormDeclaredProductModule({ items: [{ tipo_prodotto: "tende_da_sole" }], vetro_nuovi: "doppio" })).toBeNull();
  });
});
