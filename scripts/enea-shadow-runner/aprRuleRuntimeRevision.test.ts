import { describe, expect, it } from "vitest";
import { APR_RULE_RUNTIME_REVISION, assertGeneralRuleSemanticInputs } from "./aprRuleRuntimeRevision";

describe("APR rule runtime revision", () => {
  it("deriva una revisione persistente dalla sostanza delle regole", () => {
    expect(APR_RULE_RUNTIME_REVISION).toMatch(/^apr-rule-runtime-[a-f0-9]{24}$/);
  });

  it("accetta soltanto fatti semantici e non identita di pratica", () => {
    expect(assertGeneralRuleSemanticInputs(["invoice.productType", "invoice.grossTotal", "form.mainHome"])).toBe(true);
    for (const forbidden of ["customerKey", "practiceId", "displayName", "cohortKey", "draftId"]) {
      expect(() => assertGeneralRuleSemanticInputs(["invoice.total", forbidden])).toThrow(/case_discriminator_forbidden/);
    }
  });
});

