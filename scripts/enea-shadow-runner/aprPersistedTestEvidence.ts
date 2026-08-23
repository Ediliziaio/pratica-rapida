import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalJson, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope, type AprImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";

export const APR_PERSISTED_TEST_RUN_REPORT_VERSION = "apr-persisted-test-run-report-v1" as const;
export const APR_RULE_TEST_EVIDENCE_MANIFEST_VERSION = "apr-rule-test-evidence-manifest-v1" as const;
const SHA256 = /^[a-f0-9]{64}$/;

export interface AprPersistedTestRunReportPayload {
  schemaVersion: typeof APR_PERSISTED_TEST_RUN_REPORT_VERSION;
  commit: string;
  treeHash: string;
  runtimeRevision: string;
  command: string;
  exitCode: number;
  timestamp: string;
  rawReportPath: string;
  rawReportSha256: string;
}

export type AprPersistedTestRunReport = AprImmutableArtifactEnvelope<AprPersistedTestRunReportPayload>;
export type AprTestEvidencePolarity = "POSITIVE" | "NEGATIVE";

export interface AprRuleTestEvidenceRecord {
  polarity: AprTestEvidencePolarity;
  testFile: string;
  testId: string;
  result: "passed" | "failed";
  testRunReportPath: string;
}

export interface AprRuleTestEvidenceManifestPayload {
  schemaVersion: typeof APR_RULE_TEST_EVIDENCE_MANIFEST_VERSION;
  createdAt: string;
  rules: Array<{ ruleId: string; records: AprRuleTestEvidenceRecord[] }>;
}

export type AprRuleTestEvidenceManifest = AprImmutableArtifactEnvelope<AprRuleTestEvidenceManifestPayload>;

export interface AprVerifiedRuleTestEvidence {
  ruleId: string;
  expectedCommit: string;
  expectedRuntimeRevision: string;
  positive: AprRuleTestEvidenceRecord & { testRunReportArtifactId: string; rawReportSha256: string };
  negative: AprRuleTestEvidenceRecord & { testRunReportArtifactId: string; rawReportSha256: string };
}

type VitestJsonReport = {
  success: boolean;
  testResults: Array<{ name: string; assertionResults: Array<{ fullName: string; status: string }> }>;
};

const fileSha256 = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");

function persistExclusive<T>(target: string, artifact: AprImmutableArtifactEnvelope<T>) {
  if (!verifyImmutableArtifactEnvelope(artifact)) throw new Error("apr_test_evidence_envelope_invalid");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const contents = `${canonicalJson(artifact)}\n`;
  if (existsSync(target)) {
    if (readFileSync(target, "utf8") !== contents) throw new Error("apr_test_evidence_immutable_collision");
    return { path: target, artifact, created: false };
  }
  const descriptor = openSync(target, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
  return { path: target, artifact, created: true };
}

export function createAprPersistedTestRunReport(input: Omit<AprPersistedTestRunReportPayload, "schemaVersion" | "rawReportSha256">) {
  if (!existsSync(input.rawReportPath)) throw new Error("apr_test_run_raw_report_missing");
  const artifact = envelopeImmutableArtifact({ ...input, schemaVersion: APR_PERSISTED_TEST_RUN_REPORT_VERSION, rawReportSha256: fileSha256(input.rawReportPath) });
  return artifact;
}

export class PersistentAprTestEvidenceStore {
  readonly directory: string;
  readonly manifestPath: string;
  constructor(rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "monotonic-test-evidence");
    this.manifestPath = path.join(this.directory, "manifest.json");
  }

  persistRunReport(report: AprPersistedTestRunReport) {
    return persistExclusive(path.join(this.directory, "runs", `${report.artifactId}.json`), report);
  }

  persistManifest(manifest: AprRuleTestEvidenceManifest) {
    return persistExclusive(this.manifestPath, manifest);
  }

  loadManifest(): AprRuleTestEvidenceManifest {
    const manifest = JSON.parse(readFileSync(this.manifestPath, "utf8")) as AprRuleTestEvidenceManifest;
    if (!verifyImmutableArtifactEnvelope(manifest)) throw new Error("apr_test_evidence_manifest_invalid");
    return manifest;
  }

  verifyTestEvidence(ruleId: string, expectedCommit: string, expectedRuntimeRevision: string): AprVerifiedRuleTestEvidence {
    const rule = this.loadManifest().payload.rules.find((item) => item.ruleId === ruleId);
    if (!rule) throw new Error(`apr_test_evidence_rule_missing:${ruleId}`);
    const verifyRecord = (polarity: AprTestEvidencePolarity) => {
      const record = rule.records.find((item) => item.polarity === polarity);
      if (!record) throw new Error(`apr_test_evidence_${polarity.toLowerCase()}_missing:${ruleId}`);
      if (record.result !== "passed") throw new Error(`apr_test_evidence_declared_failed:${ruleId}:${polarity}`);
      const run = JSON.parse(readFileSync(record.testRunReportPath, "utf8")) as AprPersistedTestRunReport;
      if (!verifyImmutableArtifactEnvelope(run)) throw new Error(`apr_test_run_envelope_invalid:${ruleId}:${polarity}`);
      if (run.payload.commit !== expectedCommit) throw new Error(`apr_test_run_commit_mismatch:${ruleId}:${polarity}`);
      if (run.payload.runtimeRevision !== expectedRuntimeRevision) throw new Error(`apr_test_run_runtime_revision_mismatch:${ruleId}:${polarity}`);
      if (run.payload.exitCode !== 0) throw new Error(`apr_test_run_exit_code_nonzero:${ruleId}:${polarity}`);
      if (!SHA256.test(run.payload.treeHash) || !SHA256.test(run.payload.rawReportSha256)) throw new Error(`apr_test_run_hash_invalid:${ruleId}:${polarity}`);
      if (fileSha256(run.payload.rawReportPath) !== run.payload.rawReportSha256) throw new Error(`apr_test_run_raw_report_hash_mismatch:${ruleId}:${polarity}`);
      const raw = JSON.parse(readFileSync(run.payload.rawReportPath, "utf8")) as VitestJsonReport;
      const testFile = raw.testResults.find((item) => path.resolve(item.name) === path.resolve(record.testFile));
      const assertion = testFile?.assertionResults.find((item) => item.fullName === record.testId);
      if (!raw.success || !testFile || assertion?.status !== "passed") throw new Error(`apr_test_run_assertion_not_passed:${ruleId}:${polarity}`);
      return { ...record, testRunReportArtifactId: run.artifactId, rawReportSha256: run.payload.rawReportSha256 };
    };
    return { ruleId, expectedCommit, expectedRuntimeRevision, positive: verifyRecord("POSITIVE"), negative: verifyRecord("NEGATIVE") };
  }
}

export function createAprRuleTestEvidenceManifest(input: Omit<AprRuleTestEvidenceManifestPayload, "schemaVersion">) {
  return envelopeImmutableArtifact({ ...input, schemaVersion: APR_RULE_TEST_EVIDENCE_MANIFEST_VERSION });
}
