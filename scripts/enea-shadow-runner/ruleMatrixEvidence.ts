import crypto from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APR_RULE_SOURCE_FINGERPRINT, APR_RULE_TEST_MATRIX, APR_RULE_TEST_MATRIX_VERSION, evaluateRuleMatrix, type AprRuleMatrixEvidence } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { ENEA_OPERATIONAL_REGISTRY_VERSION } from "../../src/features/enea-shadow-crm/operationalRegistry";

function writeAtomic(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

export class PersistentRuleMatrixEvidence {
  readonly file: string;
  readonly rootDirectory: string;
  constructor(rootDirectory: string) { this.rootDirectory = path.resolve(rootDirectory); this.file = path.join(this.rootDirectory, "rule-test-evidence.json"); }
  load(): AprRuleMatrixEvidence | null {
    if (!existsSync(this.file)) return null;
    try {
      const evidence = JSON.parse(readFileSync(this.file, "utf8")) as AprRuleMatrixEvidence;
      const proofsValid = evidence.ruleProofs && typeof evidence.ruleProofs === "object" && Object.values(evidence.ruleProofs).every((proof) => {
        if (proof.codeFingerprint !== APR_RULE_SOURCE_FINGERPRINT || proof.positiveTest === proof.negativeTest || !/^[a-f0-9]{64}$/.test(proof.rawReportSha256)) return false;
        const report = path.resolve(this.rootDirectory, proof.rawReportRef);
        const relative = path.relative(this.rootDirectory, report);
        return relative !== "" && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)
          && existsSync(report) && crypto.createHash("sha256").update(readFileSync(report)).digest("hex") === proof.rawReportSha256;
      });
      return evidence.matrixVersion === APR_RULE_TEST_MATRIX_VERSION && evidence.registryVersion === ENEA_OPERATIONAL_REGISTRY_VERSION
        && evidence.sourceFingerprint === APR_RULE_SOURCE_FINGERPRINT && evidence.testExitCode === 0
        && Array.isArray(evidence.passedKeys) && proofsValid ? evidence : null;
    } catch { return null; }
  }
  recordAllPassed(testCommand: string, now = new Date()) {
    void testCommand; void now;
    throw new Error("Certificazione globale vietata: registrare una prova end-to-end specifica per ogni regola.");
  }
  recordPassedKeys(keys: readonly string[], testCommand: string, now = new Date()) {
    void keys; void testCommand; void now;
    throw new Error("Certificazione per elenco vietata: usare recordRuleProof con fixture e replay reali.");
  }
  recordRuleProof(input: {
    key: string;
    fixtureId: string;
    independentAnalogFixtureId: string;
    sourceFingerprint: string;
    replayFingerprint: string;
    executionPath: string[];
    producedFields: string[];
    expectedOutcome: string;
    actualOutcome: string;
    positiveTest: string;
    negativeTest: string;
    testCommand: string;
    rawReportRef: string;
    rawReportSha256: string;
  }, now = new Date()) {
    if (!APR_RULE_TEST_MATRIX.some((entry) => entry.key === input.key)) throw new Error("Chiave regola non presente nella matrice.");
    if (!input.fixtureId.trim() || !input.independentAnalogFixtureId.trim() || input.fixtureId === input.independentAnalogFixtureId) throw new Error("Servono due fixture indipendenti.");
    if (![input.sourceFingerprint, input.replayFingerprint].every((value) => /^[a-f0-9]{64}$/.test(value))) throw new Error("Fingerprint sorgente/replay non valido.");
    if (!input.executionPath.length || !input.producedFields.length) throw new Error("Percorso eseguito e campi prodotti obbligatori.");
    if (!input.expectedOutcome.trim() || input.actualOutcome !== input.expectedOutcome) throw new Error("Replay non conforme all'esito atteso.");
    if (!input.positiveTest.trim() || !input.negativeTest.trim() || input.positiveTest === input.negativeTest || !input.testCommand.trim()) throw new Error("Test positivo e negativo distinti e comando obbligatori.");
    if (!input.rawReportRef.trim() || path.isAbsolute(input.rawReportRef) || !/^[a-f0-9]{64}$/.test(input.rawReportSha256)) throw new Error("Report grezzo persistente e relativo obbligatorio.");
    const existing = this.load();
    const proof = { ...input, codeFingerprint: APR_RULE_SOURCE_FINGERPRINT, verifiedAt: now.toISOString() };
    const { key, testCommand, ...storedProof } = proof;
    const evidence: AprRuleMatrixEvidence = {
      matrixVersion: APR_RULE_TEST_MATRIX_VERSION,
      registryVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
      verifiedAt: now.toISOString(),
      testCommand: testCommand.trim(),
      passedKeys: [...new Set([...(existing?.passedKeys ?? []), key])],
      ruleProofs: { ...(existing?.ruleProofs ?? {}), [key]: storedProof },
      sourceFingerprint: APR_RULE_SOURCE_FINGERPRINT,
      testExitCode: 0,
      deployment: undefined,
    };
    writeAtomic(this.file, `${JSON.stringify(evidence, null, 2)}\n`);
    return evidence;
  }
  recordDeployment(
    builtBundleSha256: Readonly<Record<string, string>>,
    installedBundleSha256: Readonly<Record<string, string>>,
    now = new Date(),
  ) {
    const existing = this.load();
    if (!existing || existing.passedKeys.length !== APR_RULE_TEST_MATRIX.length || Object.keys(existing.ruleProofs).length !== APR_RULE_TEST_MATRIX.length) {
      throw new Error("Deployment non certificabile: la matrice corrente non e' interamente testata.");
    }
    const names = Object.keys(builtBundleSha256).sort();
    if (!names.length || names.some((name) => !builtBundleSha256[name] || installedBundleSha256[name] !== builtBundleSha256[name])) {
      throw new Error("Deployment non certificabile: bundle costruiti e installati non coincidono.");
    }
    const evidence: AprRuleMatrixEvidence = {
      ...existing,
      deployment: { verifiedAt: now.toISOString(), builtBundleSha256: { ...builtBundleSha256 }, installedBundleSha256: { ...installedBundleSha256 } },
    };
    writeAtomic(this.file, `${JSON.stringify(evidence, null, 2)}\n`);
    return evidence;
  }
  snapshot() {
    const evidence = this.load();
    const rules = evaluateRuleMatrix(evidence);
    return { matrixVersion: APR_RULE_TEST_MATRIX_VERSION, registryVersion: ENEA_OPERATIONAL_REGISTRY_VERSION,
      sourceFingerprint: APR_RULE_SOURCE_FINGERPRINT, evidence, rules,
      testedCount: rules.filter((entry) => entry.status !== "pending_test").length,
      activeCount: rules.filter((entry) => entry.status === "active_tested_deployed").length,
      deploymentVerified: rules.length > 0 && rules.every((entry) => entry.status === "active_tested_deployed"),
      totalCount: APR_RULE_TEST_MATRIX.length };
  }
}
