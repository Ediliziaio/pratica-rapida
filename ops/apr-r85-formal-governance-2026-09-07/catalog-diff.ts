import { readFileSync } from "node:fs";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { APR_RULE_EVIDENCE_CATALOG } from "../../scripts/enea-shadow-runner/aprRuleEvidenceCatalog";

const reportPath = process.argv[2];
const report = reportPath ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
const current = new Set(APR_RULE_EVIDENCE_CATALOG.map((entry) => entry.key));
const expected = new Set(APR_RULE_TEST_MATRIX.map((entry) => entry.key));
const assertions = (report?.testResults ?? []).flatMap((file: { name: string; assertionResults: Array<{ fullName: string; status: string }> }) =>
  file.assertionResults.map((assertion) => ({ fileRef: file.name, ...assertion })),
);

const missing = APR_RULE_TEST_MATRIX.filter((entry) => !current.has(entry.key)).map((entry) => ({
  ...entry,
  matches: entry.automaticTests.map((testId) => {
    const suffix = testId.includes(": ") ? testId.slice(testId.indexOf(": ") + 2) : testId;
    return assertions.filter((assertion: { fullName: string }) => assertion.fullName.endsWith(suffix));
  }),
}));
const obsolete = APR_RULE_EVIDENCE_CATALOG.filter((entry) => !expected.has(entry.key));
const unresolved = APR_RULE_EVIDENCE_CATALOG.flatMap((entry) =>
  (["positive", "negative"] as const).flatMap((polarity) => {
    const ref = entry[polarity];
    const match = assertions.find((assertion: { fileRef: string; fullName: string }) =>
      assertion.fileRef.endsWith(`/${ref.fileRef}`) && assertion.fullName === ref.testId,
    );
    return match ? [] : [{ key: entry.key, polarity, ...ref }];
  }),
);
console.log(JSON.stringify({ missing, obsolete, unresolved }, null, 2));
