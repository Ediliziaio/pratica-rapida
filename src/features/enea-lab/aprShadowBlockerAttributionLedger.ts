import {
  buildAprShadowBlockerAttribution,
  type AprShadowBlockerAttribution,
  type AprShadowBlockerAttributionEvidenceCode,
  type AprShadowBlockerAttributionVerdict,
} from "./aprShadowBlockerAttribution";
import {
  aprShadowLedgerToMetricCases,
  type AprShadowReviewLedgerState,
  type AprShadowReviewRecord,
} from "./aprShadowReviewLedger";

export interface AprShadowBlockerAttributionRecord extends AprShadowBlockerAttribution {
  aprFingerprint: string;
  attributedAt: string;
}

export interface AprShadowBlockerAttributionLedgerState {
  records: AprShadowBlockerAttributionRecord[];
}

export interface AprShadowBlockerAttributionWrite {
  practiceId: string;
  blockerCode: string;
  verdict: AprShadowBlockerAttributionVerdict;
}

export type AprShadowBlockerAttributionLedgerEvidenceCode =
  | AprShadowBlockerAttributionEvidenceCode
  | "duplicate-blocker-attribution-record"
  | "duplicate-blocker-attribution-input"
  | "invalid-attribution-fingerprint"
  | "invalid-attribution-timeline";

export interface AprShadowBlockerAttributionLedgerResult {
  evidenceValid: boolean;
  evidenceBlockers: Array<{
    practiceId: string;
    code: AprShadowBlockerAttributionLedgerEvidenceCode;
  }>;
  state: AprShadowBlockerAttributionLedgerState;
}

function attributionKey(practiceId: string, blockerCode: string): string {
  return `${practiceId}\u0000${blockerCode}`;
}

function isReviewedBlockedPractice(record: AprShadowReviewRecord): boolean {
  return record.evaluated
    && record.blockerCodes.length > 0
    && (record.operatorVerdict === "correct-block" || record.operatorVerdict === "false-block");
}

function isRecordStructurallyValid(
  record: AprShadowBlockerAttributionRecord,
  now: Date,
): AprShadowBlockerAttributionLedgerEvidenceCode[] {
  const blockers: AprShadowBlockerAttributionLedgerEvidenceCode[] = [];
  if (record.aprFingerprint.trim().length === 0) blockers.push("invalid-attribution-fingerprint");

  const attributedAtMs = Date.parse(record.attributedAt);
  if (!Number.isFinite(attributedAtMs) || attributedAtMs > now.getTime()) {
    blockers.push("invalid-attribution-timeline");
  }
  return blockers;
}

function recordStillApplies(
  record: AprShadowBlockerAttributionRecord,
  review: AprShadowReviewRecord | undefined,
): boolean {
  if (review == null) return false;
  if (review.aprFingerprint !== record.aprFingerprint) return false;
  if (!isReviewedBlockedPractice(review)) return false;
  if (!review.blockerCodes.includes(record.blockerCode)) return false;

  const attributedAtMs = Date.parse(record.attributedAt);
  const observedAtMs = Date.parse(review.observedAt);
  if (!Number.isFinite(attributedAtMs) || !Number.isFinite(observedAtMs) || attributedAtMs < observedAtMs) {
    return false;
  }

  if (review.operatorVerdict === "false-block" && record.verdict !== "false-block") return false;
  return true;
}

function sortedRecords(
  records: AprShadowBlockerAttributionRecord[],
): AprShadowBlockerAttributionRecord[] {
  return [...records].sort((left, right) => {
    const practice = left.practiceId.localeCompare(right.practiceId);
    if (practice !== 0) return practice;
    return left.blockerCode.localeCompare(right.blockerCode);
  });
}

/**
 * Ledger locale delle attribuzioni blocker-per-blocker del feedback APR shadow.
 *
 * Le attribuzioni sono legate al fingerprint APR della stessa pratica. Se dati,
 * documenti o logica cambiano ma il blocker mantiene lo stesso codice, la vecchia
 * diagnosi viene comunque eliminata: un false-block storico non puo quindi
 * continuare ad alimentare i candidati di correzione per un output nuovo.
 *
 * Il ledger si appoggia al review ledger gia validato e non contiene anagrafica
 * cliente. Nessuna scrittura CRM/ENEA avviene qui.
 */
export function reconcileAprShadowBlockerAttributionLedger(
  previousState: AprShadowBlockerAttributionLedgerState,
  reviewLedgerState: AprShadowReviewLedgerState,
  writes: AprShadowBlockerAttributionWrite[],
  now = new Date(),
): AprShadowBlockerAttributionLedgerResult {
  const evidenceBlockers: AprShadowBlockerAttributionLedgerResult["evidenceBlockers"] = [];
  const seenPrevious = new Set<string>();

  for (const record of previousState.records) {
    const key = attributionKey(record.practiceId, record.blockerCode);
    if (seenPrevious.has(key)) {
      evidenceBlockers.push({
        practiceId: record.practiceId,
        code: "duplicate-blocker-attribution-record",
      });
    }
    seenPrevious.add(key);
    for (const code of isRecordStructurallyValid(record, now)) {
      evidenceBlockers.push({ practiceId: record.practiceId, code });
    }
  }

  if (evidenceBlockers.length > 0) {
    return {
      evidenceValid: false,
      evidenceBlockers,
      state: previousState,
    };
  }

  const reviewByPractice = new Map(
    reviewLedgerState.records.map((record) => [record.practiceId, record]),
  );
  const currentByKey = new Map<string, AprShadowBlockerAttributionRecord>();

  for (const record of previousState.records) {
    const review = reviewByPractice.get(record.practiceId);
    if (!recordStillApplies(record, review)) continue;
    currentByKey.set(attributionKey(record.practiceId, record.blockerCode), record);
  }

  const seenWrites = new Set<string>();
  const writeBlockers: AprShadowBlockerAttributionLedgerResult["evidenceBlockers"] = [];
  const nextRecords = new Map(currentByKey);

  for (const write of writes) {
    const key = attributionKey(write.practiceId, write.blockerCode);
    if (seenWrites.has(key)) {
      writeBlockers.push({
        practiceId: write.practiceId,
        code: "duplicate-blocker-attribution-input",
      });
      continue;
    }
    seenWrites.add(key);

    const review = reviewByPractice.get(write.practiceId);
    if (review == null) {
      writeBlockers.push({ practiceId: write.practiceId, code: "unknown-attribution-practice" });
      continue;
    }
    if (!isReviewedBlockedPractice(review)) {
      writeBlockers.push({
        practiceId: write.practiceId,
        code: review.evaluated && review.blockerCodes.length > 0
          ? "attribution-without-practice-review"
          : "attribution-target-not-blocked",
      });
      continue;
    }
    if (!review.blockerCodes.includes(write.blockerCode)) {
      writeBlockers.push({ practiceId: write.practiceId, code: "attribution-code-not-present" });
      continue;
    }

    nextRecords.set(key, {
      ...write,
      aprFingerprint: review.aprFingerprint,
      attributedAt: now.toISOString(),
    });
  }

  if (writeBlockers.length > 0) {
    return {
      evidenceValid: false,
      evidenceBlockers: writeBlockers,
      state: { records: sortedRecords([...currentByKey.values()]) },
    };
  }

  const metricRows = aprShadowLedgerToMetricCases(reviewLedgerState);
  const attributionRows: AprShadowBlockerAttribution[] = [...nextRecords.values()].map((record) => ({
    practiceId: record.practiceId,
    blockerCode: record.blockerCode,
    verdict: record.verdict,
  }));
  const attributionResult = buildAprShadowBlockerAttribution(metricRows, attributionRows);

  if (!attributionResult.evidenceValid) {
    return {
      evidenceValid: false,
      evidenceBlockers: attributionResult.evidenceBlockers,
      state: { records: sortedRecords([...currentByKey.values()]) },
    };
  }

  return {
    evidenceValid: true,
    evidenceBlockers: [],
    state: { records: sortedRecords([...nextRecords.values()]) },
  };
}

export function aprShadowBlockerAttributionLedgerToAttributions(
  state: AprShadowBlockerAttributionLedgerState,
): AprShadowBlockerAttribution[] {
  return state.records.map((record) => ({
    practiceId: record.practiceId,
    blockerCode: record.blockerCode,
    verdict: record.verdict,
  }));
}
