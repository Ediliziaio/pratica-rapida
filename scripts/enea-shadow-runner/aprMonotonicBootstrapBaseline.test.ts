import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AprCaseOutputFingerprint, AprStagedBundleHash } from "./aprMonotonicArtifacts";
import { verifyImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
import { computeAprInputCorpusFingerprint } from "./aprCorpusFingerprint";
import { createAprMonotonicBootstrapBaseline, persistAprMonotonicBootstrapBaseline } from "./aprMonotonicBootstrapBaseline";

const runGit = (root: string, args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const sha = (character: string) => character.repeat(64);
const corpusCases = Array.from({ length: 40 }, (_, index) => ({ customerKey: `fixture-${index + 1}`, dossierSha256: sha("a"), originalDocumentSetSha256: sha("b") }));
const corpus = () => computeAprInputCorpusFingerprint({ corpusVersion: "fixed-40-v1", cases: corpusCases });
const outputs = (): AprCaseOutputFingerprint[] => corpusCases.map((item) => ({ customerKey: item.customerKey, publicStatus: "READY", payloadSha256: sha("c"), blockerSetSha256: sha("d"), appliedRuleSetSha256: sha("e") }));
const bundles = (): AprStagedBundleHash[] => (["supervisor", "worker", "watchdog"] as const).map((role) => ({ role, stagedPath: `/staging/${role}.mjs`, stagedSha256: sha("f") }));

function repository() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-baseline-git-"));
  runGit(root, ["init", "-q"]); runGit(root, ["config", "user.email", "fixture@example.invalid"]); runGit(root, ["config", "user.name", "Fixture"]);
  writeFileSync(path.join(root, "baseline.txt"), "stable\n"); runGit(root, ["add", "baseline.txt"]); runGit(root, ["commit", "-q", "-m", "stable"]);
  const baselineCommit = runGit(root, ["rev-parse", "HEAD"]);
  writeFileSync(path.join(root, "implementation.txt"), "new implementation\n"); runGit(root, ["add", "implementation.txt"]); runGit(root, ["commit", "-q", "-m", "implementation"]);
  return { root, baselineCommit };
}

describe("APR monotonic bootstrap baseline", () => {
  it("congela una baseline da un commit precedente senza spostare il checkout corrente", () => {
    const { root, baselineCommit } = repository(); const currentHead = runGit(root, ["rev-parse", "HEAD"]);
    const baseline = createAprMonotonicBootstrapBaseline({ repositoryRoot: root, baselineCommit, runtimeRevision: "runtime-v1", inputCorpusFingerprint: corpus(), caseOutputs: outputs(), bundleHashes: bundles(), testEvidenceIds: ["tests-v1"], now: new Date("2026-08-23T20:00:00.000Z") });
    expect(baseline.payload.sourceCommit).toBe(baselineCommit);
    expect(runGit(root, ["rev-parse", "HEAD"])).toBe(currentHead);
    expect(verifyImmutableArtifactEnvelope(baseline)).toBe(true);
    const target = path.join(root, "evidence", "baseline.json"); persistAprMonotonicBootstrapBaseline(target, baseline);
    expect(readFileSync(target, "utf8")).toContain(baseline.artifactId);
    expect(() => persistAprMonotonicBootstrapBaseline(target, baseline)).toThrow(/EEXIST/);
  });

  it("rifiuta un working tree sporco", () => {
    const { root, baselineCommit } = repository(); writeFileSync(path.join(root, "dirty.txt"), "dirty\n");
    expect(() => createAprMonotonicBootstrapBaseline({ repositoryRoot: root, baselineCommit, runtimeRevision: "runtime-v1", inputCorpusFingerprint: corpus(), caseOutputs: outputs(), bundleHashes: bundles(), testEvidenceIds: ["tests-v1"] })).toThrow(/worktree_dirty/);
  });

  it("rifiuta output incompleti rispetto alle 40 pratiche congelate", () => {
    const { root, baselineCommit } = repository();
    expect(() => createAprMonotonicBootstrapBaseline({ repositoryRoot: root, baselineCommit, runtimeRevision: "runtime-v1", inputCorpusFingerprint: corpus(), caseOutputs: outputs().slice(0, 39), bundleHashes: bundles(), testEvidenceIds: ["tests-v1"] })).toThrow(/outputs_do_not_match/);
  });
});
