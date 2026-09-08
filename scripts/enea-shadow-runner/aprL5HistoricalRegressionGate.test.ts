import { describe, expect, it } from "vitest";
import { evaluateAprL5HistoricalRegressionGate, type AprL5HistoricalBaselineCase, type AprL5HistoricalCandidateResult } from "./aprL5HistoricalRegressionGate";

const baseline: AprL5HistoricalBaselineCase[] = [
  ["fixture-guidotti", 8, true],
  ["fixture-parolo", 8, true],
  ["fixture-ranzoni", 10, true],
  ["fixture-callegari", 11, true],
  ["fixture-bruno", 8, true],
  ["fixture-cigognetti", 14, false],
  ["fixture-ricchi", 10, false],
].map(([fixtureKey, expectedPageCount, historicallyComplete]) => ({ fixtureKey: String(fixtureKey), expectedPageCount: Number(expectedPageCount), historicallyComplete: Boolean(historicallyComplete) }));

function completedCandidate(): AprL5HistoricalCandidateResult[] {
  return baseline.flatMap((item) => ([1, 2, 3] as const).map((round) => ({
    fixtureKey: item.fixtureKey,
    round,
    state: item.historicallyComplete ? "saved" as const : "operator_required" as const,
    completedPageCount: item.historicallyComplete ? item.expectedPageCount : 3,
    expectedPageCount: item.expectedPageCount,
    persistenceVerified: item.historicallyComplete,
    causeCode: item.historicallyComplete ? null : "fixture_deterministic_operator_required",
  })));
}

describe("gate L5 monotono sulle fixture storiche", () => {
  it("accetta tre giri completi per ogni fixture storicamente completa", () => {
    expect(evaluateAprL5HistoricalRegressionGate({ baseline, candidate: completedCandidate() })).toMatchObject({ status: "PASS", baselineCaseCount: 7, candidateObservationCount: 21, regressions: [] });
  });

  it("rifiuta anche una sola ricaduta di Guidotti, Parolo o Ranzoni e un corpus incompleto", () => {
    const candidate = completedCandidate().filter((item) => !(item.fixtureKey === "fixture-ricchi" && item.round === 3));
    const regressed = candidate.find((item) => item.fixtureKey === "fixture-parolo" && item.round === 2)!;
    regressed.state = "operator_required";
    regressed.completedPageCount = 3;
    regressed.persistenceVerified = false;
    regressed.causeCode = "fixture_nested_generator_not_persisted";
    const result = evaluateAprL5HistoricalRegressionGate({ baseline, candidate });
    expect(result.status).toBe("FAIL");
    expect(result.regressions).toEqual(expect.arrayContaining([
      { fixtureKey: "fixture-parolo", round: 2, code: "l5_historically_complete_case_regressed" },
      { fixtureKey: "fixture-ricchi", round: 0, code: "l5_regression_three_rounds_missing" },
    ]));
  });
});
