import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./aprMonotonicArtifacts";
import { createAprPersistedTestRunReport, createAprRuleTestEvidenceManifest, PersistentAprTestEvidenceStore, type AprRuleTestEvidenceRecord } from "./aprPersistedTestEvidence";

const sha = (character: string) => character.repeat(64);

function fixture(options: { includePositive?: boolean; includeNegative?: boolean; exitCode?: number } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-test-evidence-"));
  const testFile = path.join(root, "fixture.test.ts"); writeFileSync(testFile, "// fixture\n");
  const rawPath = path.join(root, "vitest-report.json");
  writeFileSync(rawPath, JSON.stringify({ success: true, testResults: [{ name: testFile, assertionResults: [
    { fullName: "fixture positive", status: "passed" }, { fullName: "fixture negative", status: "passed" },
  ] }] }));
  const store = new PersistentAprTestEvidenceStore(root);
  const run = createAprPersistedTestRunReport({ commit: "abcdef1", treeHash: sha("a"), runtimeRevision: "runtime-a", command: "vitest --reporter=json", exitCode: options.exitCode ?? 0, timestamp: "2026-08-23T22:00:00.000Z", rawReportPath: rawPath });
  const persistedRun = store.persistRunReport(run);
  const records: AprRuleTestEvidenceRecord[] = [];
  if (options.includePositive !== false) records.push({ polarity: "POSITIVE", testFile, testId: "fixture positive", result: "passed", testRunReportPath: persistedRun.path });
  if (options.includeNegative !== false) records.push({ polarity: "NEGATIVE", testFile, testId: "fixture negative", result: "passed", testRunReportPath: persistedRun.path });
  store.persistManifest(createAprRuleTestEvidenceManifest({ repositoryRoot: root, createdAt: "2026-08-23T22:00:01.000Z", rules: [{ ruleId: "rule-fixture", records }] }));
  return { root, rawPath, store };
}

describe("APR persisted structured test evidence", () => {
  it("verifica prove positive e negative dal report JSON Vitest riletto da disco", () => {
    const { root, store } = fixture();
    expect(store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a", root)).toMatchObject({ ruleId: "rule-fixture", positive: { polarity: "POSITIVE" }, negative: { polarity: "NEGATIVE" } });
  });

  it("rifiuta un report grezzo alterato dopo la persistenza", () => {
    const { rawPath, store } = fixture(); writeFileSync(rawPath, "{}\n");
    expect(() => store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a", path.dirname(rawPath))).toThrow(/raw_report_hash_mismatch/);
  });

  it("rifiuta commit differente", () => {
    const { root, store } = fixture();
    expect(() => store.verifyTestEvidence("rule-fixture", "abcdef2", "runtime-a", root)).toThrow(/commit_mismatch/);
  });

  it("rifiuta una regola senza prova positiva o negativa", () => {
    const withoutPositive = fixture({ includePositive: false });
    const withoutNegative = fixture({ includeNegative: false });
    expect(() => withoutPositive.store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a", withoutPositive.root)).toThrow(/positive_missing/);
    expect(() => withoutNegative.store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a", withoutNegative.root)).toThrow(/negative_missing/);
  });

  it("rifiuta exitCode diverso da zero anche con asserzioni dichiarate passate", () => {
    const failed = fixture({ exitCode: 1 });
    expect(() => failed.store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a", failed.root)).toThrow(/exit_code_nonzero/);
  });

  it("rifiuta la manomissione dell'envelope del report persistito", () => {
    const { root, store } = fixture();
    const runs = path.join(root, "monotonic-test-evidence", "runs");
    const reportPath = store.loadManifest().localMetadata!.records[0].testRunReportPath;
    const value = JSON.parse(readFileSync(reportPath, "utf8")); value.payload.command = "altered";
    mkdirSync(runs, { recursive: true }); writeFileSync(reportPath, `${canonicalJson(value)}\n`);
    expect(() => store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a", root)).toThrow(/envelope_invalid/);
  });

  it("usa il percorso repository-relative per distinguere basename uguali", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-test-evidence-collision-"));
    const intended = path.join(root, "rules", "a", "fixture.test.ts");
    const collision = path.join(root, "rules", "b", "fixture.test.ts");
    mkdirSync(path.dirname(intended), { recursive: true }); mkdirSync(path.dirname(collision), { recursive: true });
    writeFileSync(intended, "// intended\n"); writeFileSync(collision, "// collision\n");
    const rawPath = path.join(root, "vitest-report.json");
    writeFileSync(rawPath, JSON.stringify({ success: true, testResults: [
      { name: collision, assertionResults: [{ fullName: "fixture positive", status: "failed" }, { fullName: "fixture negative", status: "failed" }] },
      { name: intended, assertionResults: [{ fullName: "fixture positive", status: "passed" }, { fullName: "fixture negative", status: "passed" }] },
    ] }));
    const store = new PersistentAprTestEvidenceStore(root);
    const run = store.persistRunReport(createAprPersistedTestRunReport({ commit: "abcdef1", treeHash: sha("a"), runtimeRevision: "runtime-a", command: "vitest --reporter=json", exitCode: 0, timestamp: "2026-08-23T22:00:00.000Z", rawReportPath: rawPath }));
    store.persistManifest(createAprRuleTestEvidenceManifest({ repositoryRoot: root, createdAt: "2026-08-23T22:00:01.000Z", rules: [{ ruleId: "rule-fixture", records: [
      { polarity: "POSITIVE", testFile: intended, testId: "fixture positive", result: "passed", testRunReportPath: run.path },
      { polarity: "NEGATIVE", testFile: intended, testId: "fixture negative", result: "passed", testRunReportPath: run.path },
    ] }] }));
    expect(store.loadManifest().payload.rules[0].records[0].testFileRef).toBe("rules/a/fixture.test.ts");
    expect(store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a", root)).toMatchObject({ positive: { testFileRef: "rules/a/fixture.test.ts" } });
  });
});
