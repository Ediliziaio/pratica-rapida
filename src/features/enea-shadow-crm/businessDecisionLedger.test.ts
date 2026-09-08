import { describe, expect, it } from "vitest";
import { APR_DECLARED_BUSINESS_DECISIONS, assertCompleteBusinessDecisionCoverage, resolveDeclaredBusinessDecisions } from "./businessDecisionLedger";
import { APR_RULE_TEST_MATRIX } from "./ruleTestMatrix";

describe("registro permanente delle decisioni di business APR", () => {
  it("collega ogni decisione utente attiva ad almeno una prova della matrice", () => {
    const links = assertCompleteBusinessDecisionCoverage(APR_RULE_TEST_MATRIX);
    expect(links.size).toBeGreaterThan(0);
    expect(APR_DECLARED_BUSINESS_DECISIONS.every((item) => item.source.reference && item.statement && item.deterministicAction)).toBe(true);
  });

  it("non dichiara deployed una decisione se prove o deployment non sono completi", () => {
    const links = assertCompleteBusinessDecisionCoverage(APR_RULE_TEST_MATRIX);
    const unresolved = resolveDeclaredBusinessDecisions({ matrixLinks: links, provedMatrixKeys: new Set(), deploymentVerified: false });
    expect(unresolved.filter((item) => item.status !== "superseded").every((item) => item.finalStatus === "candidate")).toBe(true);
  });
});
