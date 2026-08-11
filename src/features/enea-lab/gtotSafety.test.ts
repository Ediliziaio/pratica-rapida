import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaScreeningPortalScript } from "./portalScreening";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

describe("sicurezza gTot ENEA", () => {
  it("blocca e non compila sul portale un gTot sostitutivo non documentato", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source);
    const issues = validatePreparedPractice(source, mapped);
    const preparation = buildEneaScreeningPortalScript(mapped, 0);
    const official = buildEneaPayload(mapped, issues, "official");

    expect(issues).toContainEqual(expect.objectContaining({
      code: "unverified-gtot-0",
      severity: "blocker",
      fieldId: "schermature.0.gtot",
    }));
    expect(preparation.readyFieldIds).not.toContain("schermature.0.gtot");
    expect(preparation.skippedFieldIds).toContain("schermature.0.gtot");
    expect(preparation.runtime.fields.some(({ portalId }) => portalId === "id-gtot")).toBe(false);
    expect(official.readyForOfficialSubmission).toBe(false);
  });

  it("accetta il gTot soltanto dopo un controllo umano valido quando il documento non lo contiene", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    if (source.form.prodotto.tipo !== "schermature") throw new Error("Mock non schermature");
    source.form.prodotto.items = [source.form.prodotto.items[0]];
    const analysis = {
      items: [{
        widthMm: 1200,
        heightMm: 1000,
        surfaceM2: 1.2,
        gTot: null,
        description: "Tenda da sole",
        sourcePath: "fattura.pdf",
      }],
      invoiceTotal: 1000,
      creditTotal: 0,
      eligibleExpense: 1000,
      firstInvoiceDate: "2026-07-01",
      lastInvoiceDate: "2026-07-01",
      documents: [],
      blockers: [],
      warnings: [],
    };
    const mapped = mapSchermaturaPractice(source, analysis, {
      overrides: { "schermature.0.gtot": "0,20" },
    });
    const issues = validatePreparedPractice(source, mapped, analysis);
    const preparation = buildEneaScreeningPortalScript(mapped, 0);

    expect(issues.some(({ code }) => code === "unverified-gtot-0")).toBe(false);
    expect(issues.some(({ code }) => code === "invalid-gtot-0")).toBe(false);
    expect(preparation.readyFieldIds).toContain("schermature.0.gtot");
    expect(preparation.runtime.fields).toContainEqual(expect.objectContaining({
      portalId: "id-gtot",
      value: "0,20",
    }));
  });
});
