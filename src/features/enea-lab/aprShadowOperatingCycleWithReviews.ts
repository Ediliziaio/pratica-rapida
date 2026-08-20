import type { AprShadowOperatorVerdict } from "./aprShadowMetrics";
import {
  applyAprShadowOperatorVerdict,
  reconcileAprShadowReviewLedger,
  type AprShadowReviewLedgerState,
  type AprShadowReviewRecord,
} from "./aprShadowReviewLedger";
import {
  buildAprShadowOperatingCycle,
  type AprShadowOperatingCycleInput,
  type AprShadowOperatingCycleResult,
} from "./aprShadowOperatingCycle";

export interface AprShadowReviewWrite {
  practiceId: string;
  /**
   * Concurrency token della review: il verdetto vale soltanto per l'output APR
   * che l'operatore ha realmente visto. Se il fingerprint cambia, la review e
   * stale e l'intero batch viene rifiutato.
   */
  aprFingerprint: string;
  verdict: AprShadowOperatorVerdict;
}

export type AprShadowReviewWriteEvidenceCode =
  | "invalid-review-practice-id"
  | "invalid-review-fingerprint"
  | "duplicate-review-input"
  | "unknown-review-practice"
  | "stale-review-fingerprint"
  | "review-verdict-incompatible";

export interface AprShadowOperatingCycleWithReviewsInput extends AprShadowOperatingCycleInput {
  reviewWrites?: AprShadowReviewWrite[];
}

export interface AprShadowOperatingCycleWithReviewsResult {
  reviewWritesValid: boolean;
  reviewWriteBlockers: Array<{
    practiceId: string;
    code: AprShadowReviewWriteEvidenceCode;
  }>;
  /**
   * Null soltanto quando il batch di review e incoerente/stale. Se invece il
   * problema e nell'evidenza APR, il normale operating cycle restituisce il suo
   * esito fail-closed con i blocker originali.
   */
  cycle: AprShadowOperatingCycleResult | null;
}

function applyReviewWritesAtomically(
  state: AprShadowReviewLedgerState,
  writes: AprShadowReviewWrite[],
  now: Date,
): {
  valid: boolean;
  blockers: AprShadowOperatingCycleWithReviewsResult["reviewWriteBlockers"];
  state: AprShadowReviewLedgerState;
} {
  const blockers: AprShadowOperatingCycleWithReviewsResult["reviewWriteBlockers"] = [];
  const byPractice = new Map(state.records.map((record) => [record.practiceId, record]));
  const seen = new Set<string>();
  const updates = new Map<string, AprShadowReviewRecord>();

  for (const write of writes) {
    const canonicalPracticeId = write.practiceId.trim();
    if (!canonicalPracticeId || canonicalPracticeId !== write.practiceId) {
      blockers.push({ practiceId: write.practiceId, code: "invalid-review-practice-id" });
      continue;
    }
    if (seen.has(canonicalPracticeId)) {
      blockers.push({ practiceId: write.practiceId, code: "duplicate-review-input" });
      continue;
    }
    seen.add(canonicalPracticeId);

    if (!write.aprFingerprint.trim()) {
      blockers.push({ practiceId: write.practiceId, code: "invalid-review-fingerprint" });
      continue;
    }

    const record = byPractice.get(canonicalPracticeId);
    if (record == null) {
      blockers.push({ practiceId: write.practiceId, code: "unknown-review-practice" });
      continue;
    }
    if (record.aprFingerprint !== write.aprFingerprint) {
      blockers.push({ practiceId: write.practiceId, code: "stale-review-fingerprint" });
      continue;
    }

    const updated = applyAprShadowOperatorVerdict(record, write.verdict, now);
    if (updated == null) {
      blockers.push({ practiceId: write.practiceId, code: "review-verdict-incompatible" });
      continue;
    }
    updates.set(canonicalPracticeId, updated);
  }

  if (blockers.length > 0) {
    return { valid: false, blockers, state };
  }

  return {
    valid: true,
    blockers: [],
    state: {
      records: state.records.map((record) => updates.get(record.practiceId) ?? record),
    },
  };
}

/**
 * Entry point del ciclo APR shadow quando nello stesso giro arrivano anche le
 * review umane quotidiane.
 *
 * Working backwards dall'uso operativo: il verdetto deve essere applicato allo
 * stesso fingerprint APR visto dall'operatore e deve alimentare nello stesso
 * ciclo KPI, attribuzioni blocker e piano successivo. Il batch e atomico: una
 * review stale/duplicata/incompatibile non viene applicata parzialmente e non
 * autorizza attribuzioni blocker su uno stato diverso da quello revisionato.
 *
 * Nessuna scrittura CRM/ENEA avviene qui; il risultato resta puro stato locale.
 */
export function buildAprShadowOperatingCycleWithReviews(
  input: AprShadowOperatingCycleWithReviewsInput,
): AprShadowOperatingCycleWithReviewsResult {
  const { reviewWrites = [], ...baseInput } = input;
  if (reviewWrites.length === 0) {
    return {
      reviewWritesValid: true,
      reviewWriteBlockers: [],
      cycle: buildAprShadowOperatingCycle(baseInput),
    };
  }

  const now = input.now ?? new Date();
  const reconciled = reconcileAprShadowReviewLedger(
    input.previousState,
    input.currentSnapshots,
    now,
  );

  // Se e l'evidenza APR a essere incoerente, lasciamo che l'orchestratore base
  // restituisca i blocker originali: non attribuiamo falsamente il problema alle
  // review umane.
  if (!reconciled.evidenceValid) {
    return {
      reviewWritesValid: true,
      reviewWriteBlockers: [],
      cycle: buildAprShadowOperatingCycle(baseInput),
    };
  }

  const reviewed = applyReviewWritesAtomically(reconciled.state, reviewWrites, now);
  if (!reviewed.valid) {
    return {
      reviewWritesValid: false,
      reviewWriteBlockers: reviewed.blockers,
      cycle: null,
    };
  }

  return {
    reviewWritesValid: true,
    reviewWriteBlockers: [],
    cycle: buildAprShadowOperatingCycle({
      ...baseInput,
      previousState: reviewed.state,
      now,
    }),
  };
}
