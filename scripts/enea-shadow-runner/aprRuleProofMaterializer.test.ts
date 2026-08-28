import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import type { AprRuleEvidenceCatalogEntry } from "./aprRuleEvidenceCatalog";
import { materializeAprRuleProofs, resolveAprRuleTests, validateAprRuleEvidenceCatalog } from "./aprRuleProofMaterializer";

function fixture() {
  const matrix = APR_RULE_TEST_MATRIX.slice(0, 2);
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-rule-proof-"));
  const catalog: AprRuleEvidenceCatalogEntry[] = matrix.map((rule, index) => ({
    key: rule.key,
    positive: { fileRef: `tests/rule-${index}.test.ts`, testId: `${rule.key} positive` },
    negative: { fileRef: `tests/rule-${index}.test.ts`, testId: `${rule.key} negative` },
  }));
  const tests = catalog.map((entry) => {
    const file = path.join(root, entry.positive.fileRef);
    const assertionResults = [
      { fullName: entry.positive.testId, status: "passed" },
      { fullName: entry.negative.testId, status: "passed" },
    ];
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "// fixture\n");
    return { name: file, assertionResults };
  });
  const report = path.join(root, "report.json"); writeFileSync(report, JSON.stringify({ success: true, testResults: tests }));
  return { root, report, matrix, catalog };
}

describe("APR rule proof materializer", () => {
  it("materializza due prove reali e distinte per tutte le regole", () => {
    const { root, report, matrix, catalog } = fixture();
    const resolved = resolveAprRuleTests(root, report, matrix, catalog);
    expect(resolved.size).toBe(matrix.length);
    expect([...resolved.values()].every((records) => records.length === 2 && records[0].testId !== records[1].testId)).toBe(true);
    const snapshot = materializeAprRuleProofs({ repositoryRoot: root, rootDirectory: path.join(root, "state"), rawReportPath: report, testCommand: "vitest run", matrix, catalog });
    expect(snapshot.testedCount).toBe(matrix.length);
    expect(snapshot.evidence?.ruleProofs).toHaveProperty(APR_RULE_TEST_MATRIX[0].key);
    const persisted = snapshot.evidence!.ruleProofs[APR_RULE_TEST_MATRIX[0].key];
    expect(readFileSync(path.join(root, "state", persisted.rawReportRef), "utf8")).toBe(readFileSync(report, "utf8"));
  });

  it("rifiuta fail-closed una regola senza prova negativa realmente passata", () => {
    const { root, report, matrix, catalog } = fixture();
    const raw = JSON.parse(readFileSync(report, "utf8"));
    raw.testResults[0].assertionResults[1].status = "failed";
    writeFileSync(report, JSON.stringify(raw));
    expect(() => resolveAprRuleTests(root, report, matrix, catalog)).toThrow(/apr_rule_evidence_test_not_passed/);
  });

  it("rifiuta cataloghi incompleti, duplicati o con la stessa prova sui due rami", () => {
    const { matrix, catalog } = fixture();
    expect(() => validateAprRuleEvidenceCatalog(matrix, catalog.slice(1))).toThrow(/missing_key|cardinality/);
    expect(() => validateAprRuleEvidenceCatalog(matrix, [...catalog, catalog[0]])).toThrow(/duplicate_key|cardinality/);
    expect(() => validateAprRuleEvidenceCatalog(matrix, [{ ...catalog[0], negative: catalog[0].positive }, catalog[1]])).toThrow(/independent_pair_missing/);
  });
});
