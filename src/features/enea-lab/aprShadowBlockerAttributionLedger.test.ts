import { describe, expect, it } from "vitest";
import {
  reconcileAprShadowBlockerAttributionLedger,
  type AprShadowBlockerAttributionLedgerState,
} from "./aprShadowBlockerAttributionLedger";
import type { AprShadowReviewLedgerState } from "./aprShadowReviewLedger";

function reviewState(
  fingerprint = "practice-1-v1",
  operatorVerdict: "correct-block" | "false-block" | "unreviewed" = "correct-block",
): AprShadowReviewLedgerState {
  return {
    records: [
      {
        practiceId: "practice-1",
        productType: "schermature",
        evaluated: true,
        blockerCodes: ["document-missing", "gtot-missing"],
        mappedFieldCount: 10,
        autoReadyFieldCount: 6,
        operatorVerdict,
        preparationMinutes: 5,
        aprFingerprint: fingerprint,
        observedAt: "2026-08-19T08:00:00.000Z",
        reviewedAt: operatorVerdict === "unreviewed" ? null : "2026-08-19T09:00:00.000Z",
      },
    ],
  };
}

function attributionState(
  fingerprint = "practice-1-v1",
): AprShadowBlockerAttributionLedgerState {
  return {
    records: [
      {
        practiceId: "practice-1",
        blockerCode: "document-missing",
        verdict: "false-block",
        aprFingerprint: fingerprint,
        attributedAt: "2026-08-19T09:05:00.000Z",
      },
    ],
  };
}

describe("APR shadow blocker attribution ledger", () => {
  it("conserva l'attribuzione solo se il fingerprint APR e invariato", () => {
    const stable = reconcileAprShadowBlockerAttributionLedger(
      attributionState(),
      reviewState(),
      [],
      new Date("2026-08-19T10:00:00.000Z"),
    );
    expect(stable.evidenceValid).toBe(true);
    expect(stable.state.records).toHaveLength(1);

    const changed = reconcileAprShadowBlockerAttributionLedger(
      attributionState(),
      reviewState("practice-1-v2"),
      [],
      new Date("2026-08-19T10:00:00.000Z"),
    );
    expect(changed.evidenceValid).toBe(true);
    expect(changed.state.records).toEqual([]);
  });

  it("lega una nuova attribuzione al fingerprint corrente della pratica", () => {
    const result = reconcileAprShadowBlockerAttributionLedger(
      { records: [] },
      reviewState("practice-1-v3"),
      [
        {
          practiceId: "practice-1",
          blockerCode: "gtot-missing",
          verdict: "correct-block",
        },
      ],
      new Date("2026-08-19T10:00:00.000Z"),
    );

    expect(result.evidenceValid).toBe(true);
    expect(result.state.records).toEqual([
      {
        practiceId: "practice-1",
        blockerCode: "gtot-missing",
        verdict: "correct-block",
        aprFingerprint: "practice-1-v3",
        attributedAt: "2026-08-19T10:00:00.000Z",
      },
    ]);
  });

  it("rifiuta attribuzioni nuove se la pratica non e stata revisionata", () => {
    const result = reconcileAprShadowBlockerAttributionLedger(
      { records: [] },
      reviewState("practice-1-v1", "unreviewed"),
      [
        {
          practiceId: "practice-1",
          blockerCode: "document-missing",
          verdict: "false-block",
        },
      ],
      new Date("2026-08-19T10:00:00.000Z"),
    );

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "attribution-without-practice-review",
    });
    expect(result.state.records).toEqual([]);
  });

  it("si ferma fail-closed su record duplicati o timestamp futuri", () => {
    const duplicate = attributionState().records[0];
    const result = reconcileAprShadowBlockerAttributionLedger(
      {
        records: [
          duplicate,
          { ...duplicate, attributedAt: "2026-08-19T11:00:00.000Z" },
        ],
      },
      reviewState(),
      [],
      new Date("2026-08-19T10:00:00.000Z"),
    );

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "duplicate-blocker-attribution-record",
    });
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "invalid-attribution-timeline",
    });
  });
});
