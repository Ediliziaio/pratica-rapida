import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
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
import { guardAprInstallation, verifyAprStagingImmediatelyBeforePromotion, verifyPreDeployCertificate, type AprVerifiedPreDeployCertificate } from "./aprPreDeployVerification";
import { promoteAprBundles, recoverAprBundlePromotion } from "./aprBundlePromotion";
import { prepareVerifiedAprCohortLaunchAgents } from "./aprCohortLaunchAgents";
import { activatePreparedAprServices, recoverAprServiceActivation, type AprServiceController } from "./aprServiceActivation";

const sha = (character: string) => character.repeat(64);
const keys = Array.from({ length: 40 }, (_, index) => `verify-${String(index + 1).padStart(2, "0")}`);
const corpus = computeAprInputCorpusFingerprint({ corpusVersion: "verify-40-v1", cases: keys.map((customerKey) => ({ customerKey, dossierSha256: sha("a"), originalDocumentSetSha256: sha("b") })) });
const snapshot = (runId: string): AprDifferentialSnapshot => ({ runId, inputCorpusFingerprint: corpus, cases: keys.map((customerKey) => ({ customerKey, status: "READY", blockerCodes: [], payloadFingerprint: sha("c"), appliedRuleIds: ["rule-verify"] })) });
const git = (root: string, args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function repository(contents = "baseline\n") {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-verify-repo-")); git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "APR Fixture"]);
  writeFileSync(path.join(root, "tracked.txt"), contents);
  const testFile = path.join(root, "tests", "verify.test.ts"); mkdirSync(path.dirname(testFile), { recursive: true }); writeFileSync(testFile, "// test\n");
  git(root, ["add", "tracked.txt", "tests/verify.test.ts"]); git(root, ["commit", "-qm", "baseline"]);
  return root;
}

function fixture() {
  const repositoryRoot = repository(); const gitCommit = git(repositoryRoot, ["rev-parse", "HEAD"]); const treeHash = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-verify-evidence-"));
  const baseline: AprMonotonicBootstrapBaseline = envelopeImmutableArtifact({ schemaVersion: "apr-monotonic-bootstrap-baseline-v1", createdAt: "2026-08-23T22:30:00.000Z", sourceCommit: gitCommit, sourceTree: treeHash, runtimeRevision: "runtime-verify", inputCorpusFingerprint: corpus,
    caseOutputs: keys.map((customerKey) => ({ customerKey, publicStatus: "READY", payloadSha256: sha("c"), blockerSetSha256: sha("d"), appliedRuleSetSha256: sha("e") })),
    bundleHashes: (["supervisor", "worker", "watchdog"] as const).map((role) => ({ role, stagedRef: role, stagedSha256: sha("f") })), testEvidenceIds: ["verify"], status: "FROZEN" });
  const baselinePath = path.join(root, "baseline.json"); writeFileSync(baselinePath, `${canonicalJson(baseline)}\n`);
  const differential = persistAprReplayDifferential({ targetRoot: root, baseline: snapshot("baseline"), candidate: snapshot("candidate"), gitCommit, runtimeRevision: "runtime-verify", now: new Date("2026-08-23T22:30:01.000Z") });
  const testFile = path.join(repositoryRoot, "tests", "verify.test.ts");
  const rawReportPath = path.join(root, "vitest.json"); writeFileSync(rawReportPath, JSON.stringify({ success: true, testResults: [{ name: testFile, assertionResults: [{ fullName: "verify positive", status: "passed" }, { fullName: "verify negative", status: "passed" }] }] }));
  const testStore = new PersistentAprTestEvidenceStore(root); const run = testStore.persistRunReport(createAprPersistedTestRunReport({ commit: gitCommit, treeHash, runtimeRevision: "runtime-verify", command: "vitest --reporter=json", exitCode: 0, timestamp: "2026-08-23T22:30:02.000Z", rawReportPath }));
  testStore.persistManifest(createAprRuleTestEvidenceManifest({ repositoryRoot, createdAt: "2026-08-23T22:30:03.000Z", rules: [{ ruleId: "rule-verify", records: [
    { polarity: "POSITIVE", testFile, testId: "verify positive", result: "passed", testRunReportPath: run.path },
    { polarity: "NEGATIVE", testFile, testId: "verify negative", result: "passed", testRunReportPath: run.path },
  ] }] }));
  const stagingDirectory = path.join(root, "staging"); mkdirSync(stagingDirectory);
  for (const filename of ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"]) writeFileSync(path.join(stagingDirectory, filename), `// ${filename}\n`);
  const certificate = createAprMonotonicPreDeployCertificate({ repositoryRoot, baselinePath, differentialReportPath: differential.path, testEvidenceRoot: root, stagingDirectory, runtimeRevision: "runtime-verify", inputCorpusFingerprint: corpus, newRuleIds: ["rule-verify"], now: new Date("2026-08-23T22:30:04.000Z") });
  const persisted = persistAprMonotonicPreDeployCertificate(path.join(root, "certificates"), certificate);
  return { root, repositoryRoot, certificatePath: persisted.path, stagingDirectory, baselinePath };
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

  it("rifiuta baseline mancante, alterata o sostituita dopo la certificazione", () => {
    const missing = fixture(); unlinkSync(missing.baselinePath);
    expect(() => verifyPreDeployCertificate(missing.certificatePath)).toThrow();
    const altered = fixture(); const baseline = JSON.parse(readFileSync(altered.baselinePath, "utf8")); baseline.payload.bundleHashes[0].stagedSha256 = sha("0");
    writeFileSync(altered.baselinePath, `${canonicalJson(baseline)}\n`);
    expect(() => verifyPreDeployCertificate(altered.certificatePath)).toThrow(/baseline_envelope_invalid/);
    const replaced = fixture(); const replacement = envelopeImmutableArtifact({ ...JSON.parse(readFileSync(replaced.baselinePath, "utf8")).payload, createdAt: "2026-08-23T22:30:00.001Z" });
    writeFileSync(replaced.baselinePath, `${canonicalJson(replacement)}\n`);
    expect(() => verifyPreDeployCertificate(replaced.certificatePath)).toThrow(/baseline_replaced/);
  });

  it("rifiuta se il commit checked out è differente", () => {
    const value = fixture(); const otherRepository = repository("different\n");
    expect(() => verifyPreDeployCertificate(value.certificatePath, { repositoryRoot: otherRepository })).toThrow(/git_commit_mismatch/);
  });

  it("rifiuta un bundle staged modificato dopo la certificazione", () => {
    const value = fixture(); writeFileSync(path.join(value.stagingDirectory, "apr-watchdog.mjs"), "// altered\n");
    expect(() => verifyPreDeployCertificate(value.certificatePath)).toThrow(/bundle_hash_mismatch/);
  });

  it("rifiuta il report differenziale manomesso dopo la certificazione", () => {
    const value = fixture(); const certificate = JSON.parse(readFileSync(value.certificatePath, "utf8"));
    const differentialPath = certificate.localMetadata.differentialReportPath;
    const differential = JSON.parse(readFileSync(differentialPath, "utf8")); differential.payload.runtimeRevision = "altered";
    writeFileSync(differentialPath, `${canonicalJson(differential)}\n`);
    expect(() => verifyPreDeployCertificate(value.certificatePath)).toThrow(/differential_mismatch/);
  });

  it("la guardia rifiuta un oggetto costruito a mano con gli stessi campi", () => {
    const manual = { version: "apr-predeploy-verification-v1", certificatePath: "/tmp/fake", certificateArtifactId: sha("a"), gitCommit: sha("b").slice(0, 40), treeHash: sha("c").slice(0, 40), verifiedAt: "2026-08-23T22:31:00.000Z", status: "VERIFIED_PASS" } as AprVerifiedPreDeployCertificate;
    expect(() => guardAprInstallation(manual)).toThrow(/unverified_certificate/);
  });

  it("riverifica lo staging immediatamente prima della promozione", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
    expect(verifyAprStagingImmediatelyBeforePromotion(verified).observed).toHaveLength(3);
    writeFileSync(path.join(value.stagingDirectory, "apr-supervisor.mjs"), "// changed after verification\n");
    expect(() => verifyAprStagingImmediatelyBeforePromotion(verified)).toThrow(/staging_changed_after_verification/);
  });

  it("promuove i tre bundle in una versione atomica e conserva la versione precedente", () => {
    const first = fixture(); const verified = verifyPreDeployCertificate(first.certificatePath);
    const promoted = promoteAprBundles(verified);
    expect(promoted.installed).toHaveLength(3);
    expect(readFileSync(path.join(promoted.activePointer, "apr-enea-worker.mjs"), "utf8")).toContain("apr-enea-worker");
    expect(promoted.previousTarget).toBeNull();
    expect(promoted.receipt.payload.status).toBe("PASS");
  });

  it("prepara i plist soltanto con guardia emessa e receipt PASS dello stesso certificato", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
    const promoted = promoteAprBundles(verified, { attemptId: "guarded-plist" });
    const options = { cohortNumber: 61, stateDirectory: path.join(value.root, "state"), installDirectory: path.join(value.root, "plist-staging"), nodeExecutable: process.execPath, dashboardPort: 4493 };
    const prepared = prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), promoted.receipt, options);
    expect(prepared).toMatchObject({ ready: true, loadPerformed: false }); expect(prepared.entries).toHaveLength(3);
    for (const entry of prepared.entries) {
      expect(entry.path.startsWith(options.installDirectory)).toBe(true);
      expect(entry.bundlePath).toContain(path.join("versions", promoted.versionId));
      expect(readFileSync(entry.path, "utf8")).toContain(`<string>${entry.bundlePath}</string>`);
    }
    let activationCalls = 0;
    const controller: AprServiceController = { activate: (request) => { activationCalls += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 100 + index, bundlePath: role.bundlePath, heartbeatAt: new Date(Date.parse(request.startedAt) + 1_000).toISOString(), checkpointRevision: 2 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
    const activation = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" });
    expect(activation).toMatchObject({ activationId: "activation-ok", healthGate: { status: "PASS" }, receipt: { payload: { status: "PASS", promotionReceiptId: promoted.receipt.payload.receiptId } }, loadPerformed: true, simulated: true }); expect(activationCalls).toBe(1);
    const activationRoles = activation.roles; if (!activationRoles) throw new Error("expected_new_activation");
    expect(activationRoles.every((role) => readFileSync(role.plistPath, "utf8").includes(role.bundlePath))).toBe(true);
    expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller, activationId: "activation-ok" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "PASS" } } });
    expect(activationCalls).toBe(1);
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "invalid-id"), promotionVersionId: promoted.versionId, controller, activationId: "../escape" })).toThrow(/activation_id_invalid/);
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "wrong-version"), promotionVersionId: "wrong-version", controller, activationId: "wrong-version" })).toThrow(/promotion_binding_mismatch/);
    let rollbackCalled = false;
    const failingController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { rollbackCalled = true; return { restored: true }; } };
    const failed = activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "service-activation"), promotionVersionId: promoted.versionId, controller: failingController, activationId: "activation-fail" });
    expect(failed).toMatchObject({ healthGate: { status: "FAIL" }, rollback: { performed: true, verified: true, restoredPlistPointer: expect.stringContaining("activation-ok") }, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } }); expect(rollbackCalled).toBe(true);
    let recoveryActivations = 0;
    const recoveryController: AprServiceController = { activate: (request) => { recoveryActivations += 1; return { observations: request.roles.map((role, index) => ({ role: role.role, pid: 500 + index, bundlePath: role.bundlePath, heartbeatAt: new Date(Date.parse(request.startedAt) + 1_000).toISOString(), checkpointRevision: 5 })), dashboardResponding: true }; }, rollback: () => ({ restored: true }) };
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-activation"), promotionVersionId: promoted.versionId, controller: recoveryController, activationId: "crash-pointer", crashAt: "after_pointer" })).toThrow(/simulated_crash_after_pointer/);
    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-activation"), promotionReceipt: promoted.receipt, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ phase: "COMPLETE", idempotent: false });
    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-activation"), promotionReceipt: promoted.receipt, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ phase: "COMPLETE", idempotent: true });
    expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-activation"), promotionVersionId: promoted.versionId, controller: recoveryController, activationId: "crash-pointer" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "PASS" } } });
    expect(recoveryActivations).toBe(1);
    let recoveryRollbacks = 0;
    const rollbackRecoveryController: AprServiceController = { activate: (request) => ({ observations: request.roles.map((role) => ({ role: role.role, pid: null, bundlePath: role.bundlePath, heartbeatAt: null, checkpointRevision: null })), dashboardResponding: false }), rollback: () => { recoveryRollbacks += 1; return { restored: true }; } };
    expect(() => activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-rollback"), promotionVersionId: promoted.versionId, controller: rollbackRecoveryController, activationId: "crash-rollback", crashAt: "during_rollback" })).toThrow(/simulated_crash_during_rollback/);
    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-rollback"), promotionReceipt: promoted.receipt, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ rollbackVerified: true });
    expect(recoverAprServiceActivation({ activationRoot: path.join(value.root, "crash-rollback"), promotionReceipt: promoted.receipt, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ idempotent: true });
    expect(activatePreparedAprServices({ prepared, promotionReceipt: promoted.receipt, activationRoot: path.join(value.root, "crash-rollback"), promotionVersionId: promoted.versionId, controller: rollbackRecoveryController, activationId: "crash-rollback" })).toMatchObject({ idempotent: true, receipt: { payload: { status: "FAIL", rollback: { performed: true, verified: true } } } });
    expect(recoveryRollbacks).toBe(1);
    const forgedGuard = { allowed: true as const, certificateArtifactId: verified.certificateArtifactId, verifiedAt: verified.verifiedAt };
    expect(() => prepareVerifiedAprCohortLaunchAgents(forgedGuard, promoted.receipt, { ...options, installDirectory: path.join(value.root, "forged") })).toThrow(/guard_not_issued/);
    const failedReceipt = envelopeImmutableArtifact({ ...promoted.receipt.payload, receiptId: "failed-receipt", status: "FAIL" as const }, promoted.receipt.localMetadata);
    expect(() => prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), failedReceipt, { ...options, installDirectory: path.join(value.root, "failed") })).toThrow(/receipt_not_pass/);
    const mismatchedReceipt = envelopeImmutableArtifact({ ...promoted.receipt.payload, receiptId: "mismatched-receipt", preDeployCertificateId: sha("9") }, promoted.receipt.localMetadata);
    expect(() => prepareVerifiedAprCohortLaunchAgents(guardAprInstallation(verified), mismatchedReceipt, { ...options, installDirectory: path.join(value.root, "mismatched") })).toThrow(/certificate_mismatch/);
  });

  it("non sposta il puntatore attivo se un hash post-copy non coincide", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
    expect(() => promoteAprBundles(verified, { attemptId: "failed-copy", afterCopy: (role, target) => { if (role === "worker") writeFileSync(target, "corrupt\n"); }, now: new Date("2026-08-23T22:40:00.000Z") })).toThrow(/post_copy_hash_mismatch:worker/);
    expect(() => readFileSync(path.join(value.root, "installed", "current"))).toThrow();
    const receipts = path.join(value.root, "installed", "receipts", `promotion-${verified.certificateArtifactId}-failed-copy.json`);
    expect(JSON.parse(readFileSync(receipts, "utf8")).payload.status).toBe("FAIL");
  });

  it("consente un nuovo tentativo PASS dopo una receipt FAIL dello stesso certificato", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
    expect(() => promoteAprBundles(verified, { attemptId: "attempt-fail", afterCopy: (role, target) => { if (role === "worker") writeFileSync(target, "corrupt\n"); }, now: new Date("2026-08-23T22:40:00.000Z") })).toThrow(/post_copy_hash_mismatch:worker/);
    const promoted = promoteAprBundles(verified, { attemptId: "attempt-pass", now: new Date("2026-08-23T22:41:00.000Z") });
    expect(promoted.receipt.payload).toMatchObject({ attemptId: "attempt-pass", status: "PASS" });
    const receiptFiles = readdirSync(path.join(value.root, "installed", "receipts")).sort();
    expect(receiptFiles).toEqual([`promotion-${verified.certificateArtifactId}-attempt-fail.json`, `promotion-${verified.certificateArtifactId}-attempt-pass.json`]);
    const latest = JSON.parse(readFileSync(path.join(value.root, "installed", "latest-receipts", `${verified.certificateArtifactId}.json`), "utf8"));
    expect(latest).toMatchObject({ receiptId: `promotion-${verified.certificateArtifactId}-attempt-pass`, status: "PASS" });
  });

  it("riprende dopo crash tra pointer e receipt senza duplicare la promozione", () => {
    const value = fixture(); const verified = verifyPreDeployCertificate(value.certificatePath);
    expect(() => promoteAprBundles(verified, { now: new Date("2026-08-23T22:41:00.000Z"), crashAfterPointerSwitch: true })).toThrow(/simulated_crash/);
    const recovered = recoverAprBundlePromotion(verified);
    const repeated = promoteAprBundles(verified, { now: new Date("2026-08-23T23:00:00.000Z") });
    expect(recovered.receipt.artifactId).toBe(repeated.receipt.artifactId);
    expect(recovered.installed.map((item) => item.installedSha256)).toEqual(repeated.installed.map((item) => item.installedSha256));
    expect(repeated.receipt.payload.promotedAt).toBe("2026-08-23T22:41:00.000Z");
  });
});
