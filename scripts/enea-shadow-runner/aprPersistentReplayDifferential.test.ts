import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeAprInputCorpusFingerprint } from "./aprCorpusFingerprint";
import type { AprDifferentialCaseSnapshot, AprDifferentialSnapshot } from "./aprDifferentialReport";
import { persistAprReplayDifferential, PersistentAprReplayDifferentialStore } from "./aprPersistentReplayDifferential";

const sha = (character: string) => character.repeat(64);
const keys = Array.from({ length: 40 }, (_, index) => `fixture-${String(index + 1).padStart(2, "0")}`);
const fingerprint = computeAprInputCorpusFingerprint({ corpusVersion: "fixed-40-v1", cases: keys.map((customerKey) => ({ customerKey, dossierSha256: sha("a"), originalDocumentSetSha256: sha("b") })) });
const row = (customerKey: string): AprDifferentialCaseSnapshot => ({ customerKey, status: "READY", blockerCodes: [], payloadFingerprint: sha("c"), appliedRuleIds: ["system-fixture"] });
const snapshot = (runId: string): AprDifferentialSnapshot => ({ runId, inputCorpusFingerprint: fingerprint, cases: keys.map(row) });

describe("APR persistent replay differential", () => {
  it("persiste un report PASS completo di 40 righe, commit e runtime revision", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-replay-differential-"));
    const persisted = persistAprReplayDifferential({ targetRoot: root, baseline: snapshot("baseline"), candidate: snapshot("candidate"), gitCommit: "abcdef1", runtimeRevision: "runtime-test", now: new Date("2026-08-23T21:00:00.000Z") });
    expect(persisted.artifact.payload).toMatchObject({ baselineRunId: "baseline", candidateRunId: "candidate", gitCommit: "abcdef1", runtimeRevision: "runtime-test", report: { payload: { status: "PASS", summary: { unchanged: 40 } } } });
    expect(persisted.artifact.payload.report.payload.rows).toHaveLength(40);
    expect(persisted.created).toBe(true);
    expect(persistAprReplayDifferential({ targetRoot: root, baseline: snapshot("baseline"), candidate: snapshot("candidate"), gitCommit: "abcdef1", runtimeRevision: "runtime-test", now: new Date("2026-08-23T21:00:00.000Z") }).created).toBe(false);
    expect(new PersistentAprReplayDifferentialStore(root).load(persisted.artifact.artifactId)).toEqual(persisted.artifact);
  });

  it("persiste comunque un artefatto FAIL di 40 righe quando manca un caso candidato", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-replay-differential-missing-"));
    const candidate = snapshot("candidate-missing"); candidate.cases = candidate.cases.slice(0, 39);
    const persisted = persistAprReplayDifferential({ targetRoot: root, baseline: snapshot("baseline"), candidate, gitCommit: "abcdef1" });
    expect(persisted.artifact.payload.report.payload).toMatchObject({ status: "FAIL", hasCriticalRegression: true });
    expect(persisted.artifact.payload.report.payload.rows).toHaveLength(40);
    expect(persisted.artifact.payload.report.payload.rows[39]).toMatchObject({ classification: "REGRESSED", critical: true });
  });

  it("include commit e runtimeRevision nel payload canonico che determina artifactId", () => {
    const firstRoot = mkdtempSync(path.join(os.tmpdir(), "apr-replay-differential-identity-a-"));
    const secondRoot = mkdtempSync(path.join(os.tmpdir(), "apr-replay-differential-identity-b-"));
    const common = { baseline: snapshot("baseline"), candidate: snapshot("candidate"), now: new Date("2026-08-23T21:00:00.000Z") };
    const first = persistAprReplayDifferential({ targetRoot: firstRoot, ...common, gitCommit: "abcdef1", runtimeRevision: "runtime-a" });
    const second = persistAprReplayDifferential({ targetRoot: secondRoot, ...common, gitCommit: "abcdef2", runtimeRevision: "runtime-b" });
    expect(first.artifact.artifactId).not.toBe(second.artifact.artifactId);
    expect(first.artifact.payload).toMatchObject({ gitCommit: "abcdef1", runtimeRevision: "runtime-a" });
    expect(second.artifact.payload).toMatchObject({ gitCommit: "abcdef2", runtimeRevision: "runtime-b" });
  });
});
