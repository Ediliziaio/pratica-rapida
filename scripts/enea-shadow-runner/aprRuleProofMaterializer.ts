import crypto from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENEA_OPERATIONAL_REGISTRY } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { APR_RULE_TEST_MATRIX, type AprRuleTestEntry } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { APR_RULE_EVIDENCE_CATALOG, type AprRuleEvidenceCatalogEntry, type AprRuleEvidenceReference } from "./aprRuleEvidenceCatalog";
import { PersistentRuleMatrixEvidence } from "./ruleMatrixEvidence";

type VitestAssertion = { fullName: string; status: string };
type VitestFile = { name: string; assertionResults: VitestAssertion[] };
type VitestJsonReport = { success: boolean; testResults: VitestFile[] };

export interface AprResolvedRuleTest extends AprRuleEvidenceReference {
  polarity: "positive" | "negative";
}

const digest = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const portableRef = (value: string) => value.split(path.sep).join("/");

function assertSafeRepositoryRef(fileRef: string): void {
  if (!fileRef || path.isAbsolute(fileRef) || fileRef.split("/").includes("..") || portableRef(fileRef) !== fileRef) {
    throw new Error(`apr_rule_evidence_unsafe_file_ref:${fileRef}`);
  }
}

export function validateAprRuleEvidenceCatalog(
  matrix: readonly AprRuleTestEntry[] = APR_RULE_TEST_MATRIX,
  catalog: readonly AprRuleEvidenceCatalogEntry[] = APR_RULE_EVIDENCE_CATALOG,
): void {
  const expected = new Set(matrix.map((rule) => rule.key));
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const entry of catalog) {
    if (!expected.has(entry.key)) errors.push(`unknown_key:${entry.key}`);
    if (seen.has(entry.key)) errors.push(`duplicate_key:${entry.key}`);
    seen.add(entry.key);
    for (const ref of [entry.positive, entry.negative]) {
      try { assertSafeRepositoryRef(ref.fileRef); } catch (error) { errors.push(String((error as Error).message)); }
      if (!ref.testId.trim()) errors.push(`empty_test_id:${entry.key}`);
    }
    if (`${entry.positive.fileRef}#${entry.positive.testId}` === `${entry.negative.fileRef}#${entry.negative.testId}`) {
      errors.push(`independent_pair_missing:${entry.key}`);
    }
  }
  for (const key of expected) if (!seen.has(key)) errors.push(`missing_key:${key}`);
  if (catalog.length !== matrix.length) errors.push(`cardinality:${catalog.length}:${matrix.length}`);
  if (errors.length) throw new Error(`apr_rule_evidence_catalog_invalid:${errors.join("|")}`);
}

function resolveOne(repositoryRoot: string, report: VitestJsonReport, ref: AprRuleEvidenceReference, key: string): void {
  const expectedFile = path.resolve(repositoryRoot, ref.fileRef);
  const file = report.testResults.find((item) => path.resolve(item.name) === expectedFile);
  if (!file) throw new Error(`apr_rule_evidence_file_missing:${key}:${ref.fileRef}`);
  const assertion = file.assertionResults.find((item) => item.fullName === ref.testId);
  if (!assertion) throw new Error(`apr_rule_evidence_test_missing:${key}:${ref.fileRef}#${ref.testId}`);
  if (assertion.status !== "passed") throw new Error(`apr_rule_evidence_test_not_passed:${key}:${assertion.status}:${ref.fileRef}#${ref.testId}`);
}

export function resolveAprRuleTests(
  repositoryRoot: string,
  rawReportPath: string,
  matrix: readonly AprRuleTestEntry[] = APR_RULE_TEST_MATRIX,
  catalog: readonly AprRuleEvidenceCatalogEntry[] = APR_RULE_EVIDENCE_CATALOG,
): Map<string, AprResolvedRuleTest[]> {
  validateAprRuleEvidenceCatalog(matrix, catalog);
  const report = JSON.parse(readFileSync(rawReportPath, "utf8")) as VitestJsonReport;
  if (!report.success || !Array.isArray(report.testResults)) throw new Error("apr_rule_evidence_test_run_not_green");
  const resolved = new Map<string, AprResolvedRuleTest[]>();
  for (const entry of catalog) {
    resolveOne(repositoryRoot, report, entry.positive, entry.key);
    resolveOne(repositoryRoot, report, entry.negative, entry.key);
    resolved.set(entry.key, [
      { ...entry.positive, polarity: "positive" },
      { ...entry.negative, polarity: "negative" },
    ]);
  }
  return resolved;
}

function persistRawReport(rootDirectory: string, rawReportPath: string) {
  const contents = readFileSync(rawReportPath);
  const sha256 = digest(contents);
  const directory = path.join(path.resolve(rootDirectory), "rule-evidence-runs");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${sha256}.json`);
  if (existsSync(target)) {
    if (digest(readFileSync(target)) !== sha256) throw new Error("apr_rule_evidence_raw_report_collision");
  } else {
    const descriptor = openSync(target, "wx", 0o600);
    try { writeFileSync(descriptor, contents); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  }
  return { target, sha256 };
}

export function materializeAprRuleProofs(input: {
  repositoryRoot: string;
  rootDirectory: string;
  rawReportPath: string;
  testCommand: string;
  now?: Date;
  matrix?: readonly AprRuleTestEntry[];
  catalog?: readonly AprRuleEvidenceCatalogEntry[];
}) {
  const matrix = input.matrix ?? APR_RULE_TEST_MATRIX;
  const resolved = resolveAprRuleTests(input.repositoryRoot, input.rawReportPath, matrix, input.catalog ?? APR_RULE_EVIDENCE_CATALOG);
  const persisted = persistRawReport(input.rootDirectory, input.rawReportPath);
  const store = new PersistentRuleMatrixEvidence(input.rootDirectory);
  const registry = new Map(ENEA_OPERATIONAL_REGISTRY.map((rule) => [rule.id, rule]));
  for (const rule of matrix) {
    const [positive, negative] = resolved.get(rule.key)!;
    const linkedRules = rule.registryRuleIds.map((id) => registry.get(id)).filter((item) => Boolean(item));
    store.recordRuleProof({
      key: rule.key,
      fixtureId: `${positive.fileRef}#${positive.testId}`,
      independentAnalogFixtureId: `${negative.fileRef}#${negative.testId}`,
      sourceFingerprint: digest(JSON.stringify(positive)),
      replayFingerprint: digest(JSON.stringify(negative)),
      executionPath: [...new Set(linkedRules.map((item) => item!.step))],
      producedFields: [...rule.registryRuleIds],
      expectedOutcome: "PASS",
      actualOutcome: "PASS",
      positiveTest: `${positive.fileRef}#${positive.testId}`,
      negativeTest: `${negative.fileRef}#${negative.testId}`,
      testCommand: input.testCommand,
      rawReportRef: path.relative(path.resolve(input.rootDirectory), persisted.target).split(path.sep).join("/"),
      rawReportSha256: persisted.sha256,
    }, input.now);
  }
  return store.snapshot();
}

