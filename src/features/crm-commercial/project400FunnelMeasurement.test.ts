import { describe, expect, it } from "vitest";
import {
  measureProject400AcquisitionFunnel,
  type Project400FunnelMeasurementInput,
  type Project400LeadObservation,
  type Project400PracticeObservation,
} from "./project400FunnelMeasurement";

const AS_OF = "2026-08-20T12:00:00.000Z";
const MATURITY = {
  leadToFirstDays: 30,
  firstToSecondDays: 30,
  secondToFifthDays: 60,
} as const;

function matchedLead(
  id: string,
  companyId: string,
  createdAt = "2026-01-01T12:00:00.000Z",
): Project400LeadObservation {
  return {
    id,
    channelId: "warm-legacy-wave-1",
    audience: "warm_legacy",
    createdAt,
    identity: {
      status: "matched",
      companyId,
      matchedBy: ["email"],
      candidateCompanyIds: [companyId],
    },
  };
}

function practices(companyId: string): Project400PracticeObservation[] {
  return [
    ["p1", "2026-01-10T12:00:00.000Z"],
    ["p2", "2026-01-20T12:00:00.000Z"],
    ["p3", "2026-02-01T12:00:00.000Z"],
    ["p4", "2026-02-10T12:00:00.000Z"],
    ["p5", "2026-02-20T12:00:00.000Z"],
  ].map(([id, createdAt]) => ({ id: `${companyId}-${id}`, companyId, createdAt }));
}

function input(
  leads: Project400LeadObservation[],
  practiceRows: Project400PracticeObservation[],
): Project400FunnelMeasurementInput {
  return {
    asOf: AS_OF,
    leads,
    practices: practiceRows,
    maturity: MATURITY,
  };
}

describe("Project 400 funnel measurement", () => {
  it("misura lead -> prima -> seconda -> quinta soltanto su coorti mature", () => {
    const result = measureProject400AcquisitionFunnel(
      input([matchedLead("lead-1", "company-1")], practices("company-1")),
    );

    expect(result.evidenceValid).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.identity).toMatchObject({ total: 1, matched: 1, matchedShare: 1 });
    expect(result.leadToFirst).toMatchObject({
      eligible: 1,
      resolvedEligible: 1,
      unresolvedEligible: 0,
      converted: 1,
      observedRate: 1,
      certifiedRate: 1,
    });
    expect(result.firstToSecond).toMatchObject({ eligible: 1, converted: 1, certifiedRate: 1 });
    expect(result.secondToFifth).toMatchObject({ eligible: 1, converted: 1, certifiedRate: 1 });
    expect(result.officialActionsAllowed).toBe(false);
  });

  it("non penalizza il funnel con lead troppo recenti per essere maturi", () => {
    const result = measureProject400AcquisitionFunnel(
      input([
        matchedLead("lead-recent", "company-recent", "2026-08-10T12:00:00.000Z"),
      ], []),
    );

    expect(result.evidenceValid).toBe(true);
    expect(result.leadToFirst).toMatchObject({
      eligible: 0,
      resolvedEligible: 0,
      converted: 0,
      observedRate: null,
      certifiedRate: null,
    });
  });

  it("non certifica lead -> prima finche una identita matura resta ambigua", () => {
    const ambiguous: Project400LeadObservation = {
      id: "lead-ambiguous",
      channelId: "warm-legacy-wave-1",
      audience: "warm_legacy",
      createdAt: "2026-01-01T12:00:00.000Z",
      identity: {
        status: "ambiguous",
        companyId: null,
        matchedBy: [],
        candidateCompanyIds: ["company-2", "company-3"],
      },
    };

    const result = measureProject400AcquisitionFunnel(
      input(
        [matchedLead("lead-1", "company-1"), ambiguous],
        practices("company-1"),
      ),
    );

    expect(result.evidenceValid).toBe(true);
    expect(result.blockers).toContain("identity-resolution-incomplete");
    expect(result.identity).toMatchObject({ total: 2, matched: 1, ambiguous: 1, matchedShare: 0.5 });
    expect(result.leadToFirst).toMatchObject({
      eligible: 2,
      resolvedEligible: 1,
      unresolvedEligible: 1,
      converted: 1,
      observedRate: 1,
      certifiedRate: null,
    });
  });

  it("blocca due lead attribuiti alla stessa azienda invece di contare due conversioni", () => {
    const result = measureProject400AcquisitionFunnel(
      input(
        [
          matchedLead("lead-1", "company-1"),
          matchedLead("lead-2", "company-1", "2026-01-05T12:00:00.000Z"),
        ],
        practices("company-1"),
      ),
    );

    expect(result.evidenceValid).toBe(false);
    expect(result.blockers).toContain("duplicate-matched-company");
    expect(result.leadToFirst.certifiedRate).toBeNull();
  });

  it("non attribuisce all'acquisizione una azienda che aveva gia pratiche prima del lead", () => {
    const result = measureProject400AcquisitionFunnel(
      input(
        [matchedLead("lead-1", "company-1", "2026-03-01T12:00:00.000Z")],
        [
          { id: "old-practice", companyId: "company-1", createdAt: "2026-02-01T12:00:00.000Z" },
          { id: "new-practice", companyId: "company-1", createdAt: "2026-03-10T12:00:00.000Z" },
        ],
      ),
    );

    expect(result.evidenceValid).toBe(false);
    expect(result.blockers).toContain("preexisting-practice-before-lead");
  });

  it("mantiene la riattivazione clienti fuori dal funnel di acquisizione", () => {
    const lead = matchedLead("lead-1", "company-1");
    lead.audience = "existing_customer_reactivation";

    const result = measureProject400AcquisitionFunnel(input([lead], practices("company-1")));

    expect(result.evidenceValid).toBe(false);
    expect(result.blockers).toContain("unsupported-audience-for-acquisition-funnel");
  });

  it("rifiuta finestre di maturita non intere invece di inventare il confine", () => {
    const result = measureProject400AcquisitionFunnel({
      ...input([matchedLead("lead-1", "company-1")], practices("company-1")),
      maturity: {
        leadToFirstDays: 30.5,
        firstToSecondDays: 30,
        secondToFifthDays: 60,
      },
    });

    expect(result.evidenceValid).toBe(false);
    expect(result.blockers).toContain("invalid-maturity-window");
  });
});
