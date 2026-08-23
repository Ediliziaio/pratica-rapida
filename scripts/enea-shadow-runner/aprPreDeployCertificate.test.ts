import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeAprInputCorpusFingerprint } from "./aprCorpusFingerprint";
import type { AprDifferentialSnapshot } from "./aprDifferentialReport";
import type { AprMonotonicBootstrapBaseline } from "./aprMonotonicBootstrapBaseline";
import { canonicalJson, envelopeImmutableArtifact } from "./aprMonotonicArtifacts";
import { persistAprReplayDifferential } from "./aprPersistentReplayDifferential";
import { createAprPersistedTestRunReport, createAprRuleTestEvidenceManifest, PersistentAprTestEvidenceStore } from "./aprPersistedTestEvidence";
import { createAprMonotonicPreDeployCertificate, persistAprMonotonicPreDeployCertificate } from "./aprPreDeployCertificate";

const sha = (character: string) => character.repeat(64);
const keys = Array.from({ length: 40 }, (_, index) => `fixture-${String(index + 1).padStart(2, "0")}`);
const corpus = (changed = false) => computeAprInputCorpusFingerprint({ corpusVersion: "fixed-40-v1", cases: keys.map((customerKey, index) => ({ customerKey, dossierSha256: changed && index === 0 ? sha("d") : sha("a"), originalDocumentSetSha256: sha("b") })) });
const snapshot = (runId: string, blocked = false): AprDifferentialSnapshot => ({ runId, inputCorpusFingerprint: corpus(), cases: keys.map((customerKey, index) => ({ customerKey, status: blocked && index === 0 ? "OPERATOR_REQUIRED" : "READY", blockerCodes: blocked && index === 0 ? ["blocked"] : [], payloadFingerprint: sha("c"), appliedRuleIds: ["rule-fixture"] })) });
const git = (root: string, args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function fixture(options: { dirty?: boolean; changedCorpus?: boolean; regression?: boolean; missingBundle?: boolean } = {}) {
  const repositoryRoot = mkdtempSync(path.join(os.tmpdir(), "apr-cert-repo-"));
  git(repositoryRoot, ["init", "-q"]); git(repositoryRoot, ["config", "user.email", "fixture@example.invalid"]); git(repositoryRoot, ["config", "user.name", "APR Fixture"]);
  writeFileSync(path.join(repositoryRoot, "tracked.txt"), "baseline\n");
  const testFile = path.join(repositoryRoot, "tests", "fixture.test.ts"); mkdirSync(path.dirname(testFile), { recursive: true }); writeFileSync(testFile, "// fixture\n");
  git(repositoryRoot, ["add", "tracked.txt", "tests/fixture.test.ts"]); git(repositoryRoot, ["commit", "-qm", "baseline"]);
  const gitCommit = git(repositoryRoot, ["rev-parse", "HEAD"]); const treeHash = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const evidenceRoot = mkdtempSync(path.join(os.tmpdir(), "apr-cert-evidence-"));
  const baseline: AprMonotonicBootstrapBaseline = envelopeImmutableArtifact({
    schemaVersion: "apr-monotonic-bootstrap-baseline-v1", createdAt: "2026-08-23T22:00:00.000Z", sourceCommit: gitCommit, sourceTree: treeHash,
    runtimeRevision: "runtime-a", inputCorpusFingerprint: corpus(),
    caseOutputs: keys.map((customerKey) => ({ customerKey, publicStatus: "READY", payloadSha256: sha("c"), blockerSetSha256: sha("e"), appliedRuleSetSha256: sha("f") })),
    bundleHashes: (["supervisor", "worker", "watchdog"] as const).map((role) => ({ role, stagedRef: `${role}.mjs`, stagedSha256: sha("a") })),
    testEvidenceIds: ["fixture"], status: "FROZEN",
  });
  const baselinePath = path.join(evidenceRoot, "baseline.json"); writeFileSync(baselinePath, `${canonicalJson(baseline)}\n`);
  const differential = persistAprReplayDifferential({ targetRoot: evidenceRoot, baseline: snapshot("baseline"), candidate: snapshot("candidate", options.regression), gitCommit, runtimeRevision: "runtime-a", now: new Date("2026-08-23T22:00:01.000Z") });
  const rawReportPath = path.join(evidenceRoot, "vitest.json"); writeFileSync(rawReportPath, JSON.stringify({ success: true, testResults: [{ name: testFile, assertionResults: [{ fullName: "fixture positive", status: "passed" }, { fullName: "fixture negative", status: "passed" }] }] }));
  const testStore = new PersistentAprTestEvidenceStore(evidenceRoot);
  const run = testStore.persistRunReport(createAprPersistedTestRunReport({ commit: gitCommit, treeHash, runtimeRevision: "runtime-a", command: "vitest --reporter=json", exitCode: 0, timestamp: "2026-08-23T22:00:02.000Z", rawReportPath }));
  testStore.persistManifest(createAprRuleTestEvidenceManifest({ repositoryRoot, createdAt: "2026-08-23T22:00:03.000Z", rules: [{ ruleId: "rule-fixture", records: [
    { polarity: "POSITIVE", testFile, testId: "fixture positive", result: "passed", testRunReportPath: run.path },
    { polarity: "NEGATIVE", testFile, testId: "fixture negative", result: "passed", testRunReportPath: run.path },
  ] }] }));
  const stagingDirectory = path.join(evidenceRoot, "staging"); mkdirSync(stagingDirectory);
  for (const filename of ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"]) writeFileSync(path.join(stagingDirectory, filename), `// ${filename}\n`);
  if (options.missingBundle) unlinkSync(path.join(stagingDirectory, "apr-enea-worker.mjs"));
  if (options.dirty) writeFileSync(path.join(repositoryRoot, "untracked.txt"), "dirty\n");
  return {
    repositoryRoot, evidenceRoot, testEvidenceRoot: evidenceRoot, baselinePath, differentialReportPath: differential.path, stagingDirectory,
    runtimeRevision: "runtime-a", inputCorpusFingerprint: corpus(options.changedCorpus), newRuleIds: ["rule-fixture"] as string[], now: new Date("2026-08-23T22:00:04.000Z"),
  };
}

describe("APR monotonic pre-deploy certificate", () => {
  it("produce e persiste un certificato PASS con tutte le prove", () => {
    const input = fixture(); const certificate = createAprMonotonicPreDeployCertificate(input);
    expect(certificate.payload).toMatchObject({ status: "PASS", rejectionReasons: [], newRuleIds: ["rule-fixture"] });
    expect(certificate.payload.bundleHashEvidence).toHaveLength(3);
    const persisted = persistAprMonotonicPreDeployCertificate(path.join(input.evidenceRoot, "certificates"), certificate);
    expect(persisted.created).toBe(true);
    expect(persistAprMonotonicPreDeployCertificate(path.join(input.evidenceRoot, "certificates"), certificate).created).toBe(false);
  });

  it("produce FAIL con working tree sporco", () => {
    expect(createAprMonotonicPreDeployCertificate(fixture({ dirty: true })).payload).toMatchObject({ status: "FAIL", rejectionReasons: expect.arrayContaining(["working_tree_dirty"]) });
  });

  it("produce FAIL con corpus differente dalla baseline", () => {
    const certificate = createAprMonotonicPreDeployCertificate(fixture({ changedCorpus: true }));
    expect(certificate.payload.status).toBe("FAIL"); expect(certificate.payload.rejectionReasons.join(" ")).toMatch(/corpus_mismatch/);
  });

  it("produce FAIL con regressione critica nel report differenziale", () => {
    const certificate = createAprMonotonicPreDeployCertificate(fixture({ regression: true }));
    expect(certificate.payload.status).toBe("FAIL"); expect(certificate.payload.rejectionReasons).toEqual(expect.arrayContaining(["differential_report_critical_regression", "differential_report_failed"]));
  });

  it("accumula tutti i motivi indipendenti senza early exit", () => {
    const certificate = createAprMonotonicPreDeployCertificate(fixture({ dirty: true, changedCorpus: true, regression: true, missingBundle: true }));
    const reasons = certificate.payload.rejectionReasons.join(" ");
    expect(certificate.payload.status).toBe("FAIL");
    expect(reasons).toMatch(/working_tree_dirty/); expect(reasons).toMatch(/corpus_mismatch/); expect(reasons).toMatch(/critical_regression/); expect(reasons).toMatch(/bundle_staging_invalid/);
  });
});
