import { describe, expect, it } from "vitest";
import { resolveAprInfissiShadingClosureAllocation } from "./infissiShadingClosureAllocation";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

const invoice = (sourceId: string, body: string) => ({ sourceId, text: `FATTURA\n${body}` });

describe("allocazione chiusure oscuranti Infissi in ordine fattura", () => {
  it("assegna due chiusure ai primi due di tre infissi e deduplica acconto/saldo identici", () => {
    const body = "Tapparella N° 1 da 143 x 185 cm N° 1 da 283,5 x 185 cm Gtot 0,060";
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 3,
      invoiceSources: [invoice("acconto", body), invoice("saldo", body)],
      technicalRowSourceKind: "invoice",
      formAlsoInstalledClosures: true,
    });
    expect(result).toMatchObject({ mode: "invoice_order_partial", documentedClosureCount: 2, flags: [true, true, false] });
    expect(result.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiShadingClosureInvoiceOrderAllocation);
  });

  it("non applica la regola parziale quando le chiusure non sono meno degli infissi", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 2,
      invoiceSources: [invoice("fattura", "N. 2 tapparelle 1000 x 1800 mm")],
      technicalRowSourceKind: "invoice",
      formAlsoInstalledClosures: false,
    });
    expect(result.mode).toBe("form_none");
    expect(result.flags).toEqual([false, false]);
    expect(result.audit.appliedRuleIds).not.toContain(USER_AUTHORIZED_RULE_IDS.infissiShadingClosureInvoiceOrderAllocation);
  });

  it("non assegna posizioni se le righe tecniche seguono l'ordine del certificato", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 3,
      invoiceSources: [invoice("fattura", "Tapparella N° 1 da 143 x 185 cm N° 1 da 283,5 x 185 cm")],
      technicalRowSourceKind: "technical_document",
      formAlsoInstalledClosures: true,
    });
    expect(result).toMatchObject({
      mode: "unresolved",
      flags: [],
      blocker: "infissi_shading_closure_invoice_order_not_proven",
      audit: { technicalRowSourceKind: "technical_document" },
    });
  });
});
