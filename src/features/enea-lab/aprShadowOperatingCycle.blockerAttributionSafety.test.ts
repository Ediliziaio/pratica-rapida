import { describe, expect, it } from "vitest";
import { buildAprShadowOperatingCycle } from "./aprShadowOperatingCycle";
import type { AprShadowReviewLedgerState } from "./aprShadowReviewLedger";

function reviewedState(fingerprint = "practice-1-v1"): AprShadowReviewLedgerState {
  return {
    records: [
      {
        practiceId: "practice-1",
        productType: "schermature",
        evaluated: true,
        blockerCodes: ["document-missing", "gtot-missing"],
        mappedFieldCount: 10,
        autoReadyFieldCount: 6,
        operatorVerdict: "correct-block",
        preparationMinutes: 5,
        aprFingerprint: fingerprint,
        observedAt: "2026-08-19T08:00:00.000Z",
        reviewedAt: "2026-08-19T09:00:00.000Z",
      },
    ],
  };
}

function snapshot(fingerprint = "practice-1-v1") {
  return {
    practiceId: "practice-1",
    productType: "schermature" as const,
    evaluated: true,
    blockerCodes: ["document-missing", "gtot-missing"],
    mappedFieldCount: 10,
    autoReadyFieldCount: 6,
    preparationMinutes: 5,
    aprFingerprint: fingerprint,
  };
}

describe("APR shadow operating cycle blocker attribution", () => {
  it("porta le attribuzioni blocker-per-blocker fino ai candidati di correzione", () => {
    const result = buildAprShadowOperatingCycle({
      previousState: reviewedState(),
      currentSnapshots: [snapshot()],
      previousBlockerAttributionState: { records: [] },
      blockerAttributionWrites: [
        {
          practiceId: "practice-1",
          blockerCode: "document-missing",
          verdict: "false-block",
        },
        {
          practiceId: "practice-1",
          blockerCode: "gtot-missing",
          verdict: "correct-block",
        },
      ],
      reviewPlanOptions: { blockedLimit: 10, readyAuditLimit: 10 },
      now: new Date("2026-08-19T10:00:00.000Z"),
    });

    expect(result.cycleValid).toBe(true);
    expect(result.blockerAttributionState.records).toHaveLength(2);
    expect(result.currentBlockerAttribution?.attributionQueue).toEqual([]);
    expect(result.longitudinalBlockerAttribution?.correctionCandidates).toEqual([
      {
        code: "document-missing",
        affectedCases: 1,
        falseBlockCases: 1,
        falseBlockRate: 1,
      },
    ]);
  });

  it("non riusa attribuzioni vecchie quando cambia il fingerprint APR", () => {
    const result = buildAprShadowOperatingCycle({
      previousState: reviewedState(),
      currentSnapshots: [snapshot("practice-1-v2")],
      previousBlockerAttributionState: {
        records: [
          {
            practiceId: "practice-1",
            blockerCode: "document-missing",
            verdict: "false-block",
            aprFingerprint: "practice-1-v1",
            attributedAt: "2026-08-19T09:05:00.000Z",
          },
        ],
      },
      blockerAttributionWrites: [],
      reviewPlanOptions: { blockedLimit: 10, readyAuditLimit: 10 },
      now: new Date("2026-08-19T10:00:00.000Z"),
    });

    expect(result.cycleValid).toBe(true);
    expect(result.blockerAttributionState.records).toEqual([]);
    expect(result.longitudinalBlockerAttribution?.correctionCandidates).toEqual([]);
  });
});
