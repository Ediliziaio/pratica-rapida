import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
import { guardAprInstallation, verifyPreDeployCertificate, type AprVerifiedPreDeployCertificate } from "./aprPreDeployVerification";

const sha = (character: string) => character.repeat(64);
const keys = Array.from({ length: 40 }, (_, index) => `verify-${String(index + 1).padStart(2, "0")}`);
const corpus = computeAprInputCorpusFingerprint({ corpusVersion: "verify-40-v1", cases: keys.map((customerKey) => ({ customerKey, dossierSha256: sha("a"), originalDocumentSetSha256: sha("b") })) });
const snapshot = (runId: string): AprDifferentialSnapshot => ({ runId, inputCorpusFingerprint: corpus, cases: keys.map((customerKey) => ({ customerKey, status: "READY", blockerCodes: [], payloadFingerprint: sha("c"), appliedRuleIds: ["rule-verify"] })) });
const git = (root: string, args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function repository(contents = "baseline\n") {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-verify-repo-")); git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "APR Fixture"]);
  writeFileSync(path.join(root, "tracked.txt"), contents); git(root, ["add", "tracked.txt"]); git(root, ["commit", "-qm", "baseline"]);
  return root;
}

function fixture() {
  const repositoryRoot = repository(); const gitCommit = git(repositoryRoot, ["rev-parse", "HEAD"]); const treeHash = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-verify-evidence-"));
  const baseline: AprMonotonicBootstrapBaseline = envelopeImmutableArtifact({ schemaVersion: "apr-monotonic-bootstrap-baseline-v1", createdAt: "2026-08-23T22:30:00.000Z", sourceCommit: gitCommit, sourceTree: treeHash, runtimeRevision: "runtime-verify", inputCorpusFingerprint: corpus,
    caseOutputs: keys.map((customerKey) => ({ customerKey, publicStatus: "READY", payloadSha256: sha("c"), blockerSetSha256: sha("d"), appliedRuleSetSha256: sha("e") })),
    bundleHashes: (["supervisor", "worker", "watchdog"] as const).map((role) => ({ role, stagedPath: role, stagedSha256: sha("f") })), testEvidenceIds: ["verify"], status: "FROZEN" });
  const baselinePath = path.join(root, "baseline.json"); writeFileSync(baselinePath, `${canonicalJson(baseline)}\n`);
  const differential = persistAprReplayDifferential({ targetRoot: root, baseline: snapshot("baseline"), candidate: snapshot("candidate"), gitCommit, runtimeRevision: "runtime-verify", now: new Date("2026-08-23T22:30:01.000Z") });
  const testFile = path.join(root, "verify.test.ts"); writeFileSync(testFile, "// test\n");
  const rawReportPath = path.join(root, "vitest.json"); writeFileSync(rawReportPath, JSON.stringify({ success: true, testResults: [{ name: testFile, assertionResults: [{ fullName: "verify positive", status: "passed" }, { fullName: "verify negative", status: "passed" }] }] }));
  const testStore = new PersistentAprTestEvidenceStore(root); const run = testStore.persistRunReport(createAprPersistedTestRunReport({ commit: gitCommit, treeHash, runtimeRevision: "runtime-verify", command: "vitest --reporter=json", exitCode: 0, timestamp: "2026-08-23T22:30:02.000Z", rawReportPath }));
  testStore.persistManifest(createAprRuleTestEvidenceManifest({ createdAt: "2026-08-23T22:30:03.000Z", rules: [{ ruleId: "rule-verify", records: [
    { polarity: "POSITIVE", testFile, testId: "verify positive", result: "passed", testRunReportPath: run.path },
    { polarity: "NEGATIVE", testFile, testId: "verify negative", result: "passed", testRunReportPath: run.path },
  ] }] }));
  const stagingDirectory = path.join(root, "staging"); mkdirSync(stagingDirectory);
  for (const filename of ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"]) writeFileSync(path.join(stagingDirectory, filename), `// ${filename}\n`);
  const certificate = createAprMonotonicPreDeployCertificate({ repositoryRoot, baselinePath, differentialReportPath: differential.path, testEvidenceRoot: root, stagingDirectory, runtimeRevision: "runtime-verify", inputCorpusFingerprint: corpus, newRuleIds: ["rule-verify"], now: new Date("2026-08-23T22:30:04.000Z") });
  const persisted = persistAprMonotonicPreDeployCertificate(path.join(root, "certificates"), certificate);
  return { root, repositoryRoot, certificatePath: persisted.path, stagingDirectory };
}

describe("APR independent pre-deploy verification and installation guard", () => {
  it("rilegge e verifica da disco certificato, prove, Git, differenziale e bundle", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath, { now: new Date("2026-08-23T22:31:00.000Z") });
    expect(verified).toMatchObject({ status: "VERIFIED_PASS" });
    expect(guardAprInstallation(verified)).toMatchObject({ allowed: true, certificateArtifactId: verified.certificateArtifactId });
  });

  it("rifiuta un certificato con payload manomesso", () => {
    const value = fixture(); const certificate = JSON.parse(readFileSync(value.certificatePath, "utf8")); certificate.payload.runtimeRevision = "altered";
    writeFileSync(value.certificatePath, `${canonicalJson(certificate)}\n`);
    expect(() => verifyPreDeployCertificate(value.certificatePath)).toThrow(/certificate_hash_mismatch/);
  });

  it("rifiuta se il commit checked out è differente", () => {
    const value = fixture(); const otherRepository = repository("different\n");
    expect(() => verifyPreDeployCertificate(value.certificatePath, { repositoryRoot: otherRepository })).toThrow(/git_commit_mismatch/);
  });

  it("rifiuta un bundle staged modificato dopo la certificazione", () => {
    const value = fixture(); writeFileSync(path.join(value.stagingDirectory, "apr-watchdog.mjs"), "// altered\n");
    expect(() => verifyPreDeployCertificate(value.certificatePath)).toThrow(/bundle_hash_mismatch/);
  });

  it("la guardia rifiuta un oggetto costruito a mano con gli stessi campi", () => {
    const manual = { version: "apr-predeploy-verification-v1", certificatePath: "/tmp/fake", certificateArtifactId: sha("a"), gitCommit: sha("b").slice(0, 40), treeHash: sha("c").slice(0, 40), verifiedAt: "2026-08-23T22:31:00.000Z", status: "VERIFIED_PASS" } as AprVerifiedPreDeployCertificate;
    expect(() => guardAprInstallation(manual)).toThrow(/unverified_certificate/);
  });
});
