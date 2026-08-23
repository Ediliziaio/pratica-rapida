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
  store.persistManifest(createAprRuleTestEvidenceManifest({ createdAt: "2026-08-23T22:00:01.000Z", rules: [{ ruleId: "rule-fixture", records }] }));
  return { root, rawPath, store };
}

describe("APR persisted structured test evidence", () => {
  it("verifica prove positive e negative dal report JSON Vitest riletto da disco", () => {
    const { store } = fixture();
    expect(store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a")).toMatchObject({ ruleId: "rule-fixture", positive: { polarity: "POSITIVE" }, negative: { polarity: "NEGATIVE" } });
  });

  it("rifiuta un report grezzo alterato dopo la persistenza", () => {
    const { rawPath, store } = fixture(); writeFileSync(rawPath, "{}\n");
    expect(() => store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a")).toThrow(/raw_report_hash_mismatch/);
  });

  it("rifiuta commit differente", () => {
    const { store } = fixture();
    expect(() => store.verifyTestEvidence("rule-fixture", "abcdef2", "runtime-a")).toThrow(/commit_mismatch/);
  });

  it("rifiuta una regola senza prova positiva o negativa", () => {
    expect(() => fixture({ includePositive: false }).store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a")).toThrow(/positive_missing/);
    expect(() => fixture({ includeNegative: false }).store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a")).toThrow(/negative_missing/);
  });

  it("rifiuta exitCode diverso da zero anche con asserzioni dichiarate passate", () => {
    expect(() => fixture({ exitCode: 1 }).store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a")).toThrow(/exit_code_nonzero/);
  });

  it("rifiuta la manomissione dell'envelope del report persistito", () => {
    const { root, store } = fixture();
    const runs = path.join(root, "monotonic-test-evidence", "runs");
    const reportPath = store.loadManifest().localMetadata!.records[0].testRunReportPath;
    const value = JSON.parse(readFileSync(reportPath, "utf8")); value.payload.command = "altered";
    mkdirSync(runs, { recursive: true }); writeFileSync(reportPath, `${canonicalJson(value)}\n`);
    expect(() => store.verifyTestEvidence("rule-fixture", "abcdef1", "runtime-a")).toThrow(/envelope_invalid/);
  });
});
