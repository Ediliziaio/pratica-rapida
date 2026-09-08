import fs from "node:fs";
import path from "node:path";
import { APR_RULE_EVIDENCE_CATALOG } from "../../scripts/enea-shadow-runner/aprRuleEvidenceCatalog";

type Assertion = { fullName: string; title: string; status: string };
type TestFile = { name: string; assertionResults: Assertion[] };
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const reportPath = path.join(repositoryRoot, "ops/apr-targeted-excel-ready-r70-2026-09-06/rule-gate-r70-green/rule-activation/vitest-1788717779069-2e0d6ac4-bb8d-4029-850b-0941d7bc8683.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as { testResults: TestFile[] };
const files = new Map(report.testResults.map((entry) => [path.resolve(entry.name), entry.assertionResults]));
const missing: unknown[] = [];

for (const entry of APR_RULE_EVIDENCE_CATALOG) {
  for (const polarity of ["positive", "negative"] as const) {
    const reference = entry[polarity];
    const assertions = files.get(path.resolve(repositoryRoot, reference.fileRef)) ?? [];
    if (assertions.some((assertion) => assertion.fullName === reference.testId)) continue;
    const exactTitle = assertions.filter((assertion) => assertion.title === reference.testId || reference.testId.endsWith(assertion.title));
    const suffix = assertions.filter((assertion) => assertion.fullName.endsWith(reference.testId));
    missing.push({ key: entry.key, polarity, reference, candidates: [...new Map([...exactTitle, ...suffix].map((item) => [item.fullName, item])).values()] });
  }
}

process.stdout.write(`${JSON.stringify({ missingCount: missing.length, missing }, null, 2)}\n`);
if (missing.length) process.exitCode = 2;
