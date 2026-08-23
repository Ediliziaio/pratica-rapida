import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AprCaseStatusTruth } from "./caseStatusTruth";
import type { AprCaseStatusObservation } from "./aprMonotonicArtifacts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import type { AprCollectedCaseObservations } from "./aprCaseObservationCollector";
import { compareAprParallelCaseTruth, PersistentAprCaseTruthComparisonStore } from "./aprCaseTruthComparisonStore";

const oldTruth = (status: AprCaseStatusTruth["status"] = "READY"): AprCaseStatusTruth => ({ version: "apr-case-status-truth-v1", ruleId: "system-apr-case-status-truth", customerKey: "fixture-a", displayName: "Fixture A", status, hasProblem: status === "READY" ? false : null, blockerCount: 0, blockerCodes: [], statement: `old ${status}`, sourceState: "ready_local_plan", reportOutcome: "ready_local_plan" });
const obs = (source: AprCaseStatusObservation["source"], status: AprCaseStatusObservation["status"], options: Partial<AprCaseStatusObservation> = {}): AprCaseStatusObservation => ({ source, stage: source === "preflight_common" ? "COMMON_PREFLIGHT" : source === "product_gate" ? "PRODUCT_GATE" : source === "deep_review" ? "DEEP_REVIEW" : source === "execution" ? "EXECUTION" : source === "report_blockers" ? "EVIDENCE" : "SERVER_VERIFICATION", customerKey: "fixture-a", runId: "run-a", status, blockerCodes: [], classification: "NONE", observedAt: "2026-08-23T20:00:00.000Z", sourceFingerprint: canonicalSha256({ source, status, ...options }), ...options });
const collected = (observations: AprCaseStatusObservation[], status: AprCollectedCaseObservations["status"] = "COLLECTED", errors: string[] = []): AprCollectedCaseObservations => ({ status, customerKey: "fixture-a", runId: "run-a", corpusFingerprint: "corpus", sourceAggregateFingerprint: canonicalSha256(observations), observations, errors });
const ready = () => collected([obs("preflight_common", "PASS"), obs("product_gate", "PASS"), obs("deep_review", "NOT_APPLICABLE"), obs("execution", "NOT_APPLICABLE"), obs("checkpoint", "NOT_APPLICABLE"), obs("report_blockers", "PASS")]);

describe("APR persistent parallel truth comparison", () => {
  it("classifica AGREE", () => {
    expect(compareAprParallelCaseTruth({ oldTruth: oldTruth(), collected: ready() }).payload.classification).toBe("AGREE");
  });

  it("classifica EXPECTED_STRICTER e conserva le fonti discordanti", () => {
    const duplicate = ready(); duplicate.observations = [...duplicate.observations, obs("product_gate", "PASS")];
    const result = compareAprParallelCaseTruth({ oldTruth: oldTruth(), collected: duplicate });
    expect(result.payload).toMatchObject({ classification: "EXPECTED_STRICTER", newTruth: { status: "INCONSISTENT" } });
    expect(result.payload.newTruth.disagreement).toHaveLength(2);
  });

  it("classifica DISAGREE per una differenza semantica non prevista", () => {
    const blocked = collected([
      obs("preflight_common", "PASS"), obs("product_gate", "BLOCKED", { blockerCodes: ["x"], classification: "UNCLASSIFIED" }),
      obs("deep_review", "BLOCKED", { blockerCodes: ["x"], classification: "OPERATOR" }), obs("report_blockers", "BLOCKED", { blockerCodes: ["x"] }),
    ]);
    expect(compareAprParallelCaseTruth({ oldTruth: oldTruth(), collected: blocked }).payload.classification).toBe("DISAGREE");
  });

  it("classifica MISSING_SOURCE", () => {
    expect(compareAprParallelCaseTruth({ oldTruth: oldTruth(), collected: collected([], "REJECTED", ["case_missing_from_common_preflight"]) }).payload.classification).toBe("MISSING_SOURCE");
  });

  it("persiste in modo idempotente, rilegge dopo riavvio e rifiuta envelope alterati", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-truth-comparison-"));
    const firstStore = new PersistentAprCaseTruthComparisonStore(root); const comparison = compareAprParallelCaseTruth({ oldTruth: oldTruth(), collected: ready(), now: new Date("2026-08-23T20:00:00.000Z") });
    expect(firstStore.persist(comparison).created).toBe(true);
    expect(firstStore.persist(comparison).created).toBe(false);
    expect(new PersistentAprCaseTruthComparisonStore(root).load(comparison.artifactId)).toEqual(comparison);
    const altered = { ...comparison, payload: { ...comparison.payload, reason: "altered" } };
    expect(() => firstStore.persist(altered)).toThrow(/envelope_invalid/);
    expect(firstStore.list("fixture-a")).toEqual([comparison]);
    expect(firstStore.list("fixture-assente")).toEqual([]);
    expect(() => firstStore.load("../checkpoint")).toThrow(/artifact_id_invalid/);
  });
});
