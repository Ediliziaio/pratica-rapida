import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PersistentRuleMatrixEvidence } from "./ruleMatrixEvidence";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";

const hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
function proof(store: PersistentRuleMatrixEvidence, key: string, analog = `${key}-analog`) {
  const report = path.join(store.rootDirectory, "rule-evidence-runs", `${hash}.json`);
  mkdirSync(path.dirname(report), { recursive: true });
  if (!existsSync(report)) writeFileSync(report, "");
  return store.recordRuleProof({ key, fixtureId: `${key}-fixture`, independentAnalogFixtureId: analog,
    sourceFingerprint: hash, replayFingerprint: hash, executionPath: ["acquisition", "parser", "preflight"],
    producedFields: ["outcome"], expectedOutcome: "READY", actualOutcome: "READY",
    positiveTest: `${key}:positive`, negativeTest: `${key}:negative`, testCommand: `vitest run ${key}`,
    rawReportRef: `rule-evidence-runs/${hash}.json`, rawReportSha256: hash });
}

describe("matrice regole APR", () => {
  it("non dichiara regole attive finche test e bundle installato non sono entrambi verificati", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-rules-"));
    try {
      const store = new PersistentRuleMatrixEvidence(directory);
      expect(store.snapshot()).toMatchObject({ activeCount: 0, totalCount: APR_RULE_TEST_MATRIX.length });
      for (const entry of APR_RULE_TEST_MATRIX) proof(store, entry.key);
      let snapshot = new PersistentRuleMatrixEvidence(directory).snapshot();
      expect(snapshot).toMatchObject({ testedCount: APR_RULE_TEST_MATRIX.length, activeCount: 0, deploymentVerified: false });
      expect(snapshot.rules.every((entry) => entry.status === "tested_not_deployed")).toBe(true);
      store.recordDeployment({ "apr-supervisor.mjs": "sha-a", "apr-enea-worker.mjs": "sha-b" }, { "apr-supervisor.mjs": "sha-a", "apr-enea-worker.mjs": "sha-b" }, new Date("2026-08-14T12:01:00Z"));
      snapshot = new PersistentRuleMatrixEvidence(directory).snapshot();
      expect(snapshot.activeCount).toBe(APR_RULE_TEST_MATRIX.length);
      expect(snapshot.rules.every((entry) => entry.status === "active_tested_deployed")).toBe(true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("attiva una sola regola testata senza dichiarare verdi le altre", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-rules-single-"));
    try {
      const store = new PersistentRuleMatrixEvidence(directory);
      proof(store, "invoice-gross-total-vat-included");
      const snapshot = store.snapshot();
      expect(snapshot.activeCount).toBe(0);
      expect(snapshot.testedCount).toBe(1);
      expect(snapshot.rules.find((entry) => entry.key === "invoice-gross-total-vat-included")?.status).toBe("tested_not_deployed");
      expect(snapshot.rules.filter((entry) => entry.key !== "invoice-gross-total-vat-included").every((entry) => entry.status === "pending_test")).toBe(true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("rifiuta un deployment diverso dai bundle appena testati", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-rules-deployment-"));
    try {
      const store = new PersistentRuleMatrixEvidence(directory);
      for (const entry of APR_RULE_TEST_MATRIX) proof(store, entry.key);
      expect(() => store.recordDeployment({ "apr-supervisor.mjs": "nuovo" }, { "apr-supervisor.mjs": "vecchio" })).toThrow(/non coincidono/i);
      expect(store.snapshot()).toMatchObject({ activeCount: 0, deploymentVerified: false });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("vieta la certificazione globale o per semplice elenco", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-rules-no-shortcut-"));
    try {
      const store = new PersistentRuleMatrixEvidence(directory);
      expect(() => store.recordAllPassed("vitest run")).toThrow(/globale vietata/i);
      expect(() => store.recordPassedKeys(["invoice-gross-total-vat-included"], "vitest run")).toThrow(/elenco vietata/i);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("invalida tutte le prove se il report Vitest persistito viene alterato", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-rules-tamper-"));
    try {
      const store = new PersistentRuleMatrixEvidence(directory);
      proof(store, APR_RULE_TEST_MATRIX[0].key);
      expect(store.snapshot().testedCount).toBe(1);
      writeFileSync(path.join(directory, "rule-evidence-runs", `${hash}.json`), "altered");
      expect(new PersistentRuleMatrixEvidence(directory).snapshot()).toMatchObject({ testedCount: 0, activeCount: 0, evidence: null });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
