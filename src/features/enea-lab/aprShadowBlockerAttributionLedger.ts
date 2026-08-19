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

export const APR_SHADOW_BLOCKER_ATTRIBUTION_LEDGER_STORAGE_KEY =
  "enea-lab:apr-shadow-blocker-attribution-ledger:v1";

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

export interface AprShadowBlockerAttributionLedgerLoadResult {
  storageValid: boolean;
  state: AprShadowBlockerAttributionLedgerState;
}

type ReadableAttributionStorage = Pick<Storage, "getItem"> & Partial<Pick<Storage, "removeItem">>;

const EMPTY_STATE: AprShadowBlockerAttributionLedgerState = { records: [] };

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

function parseAttributionRecord(value: unknown): AprShadowBlockerAttributionRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.practiceId !== "string" || candidate.practiceId.trim().length === 0) return null;
  if (typeof candidate.blockerCode !== "string" || candidate.blockerCode.trim().length === 0) return null;
  if (candidate.verdict !== "correct-block" && candidate.verdict !== "false-block") return null;
  if (typeof candidate.aprFingerprint !== "string" || candidate.aprFingerprint.trim().length === 0) return null;
  if (typeof candidate.attributedAt !== "string" || !Number.isFinite(Date.parse(candidate.attributedAt))) return null;

  return {
    practiceId: candidate.practiceId,
    blockerCode: candidate.blockerCode,
    verdict: candidate.verdict,
    aprFingerprint: candidate.aprFingerprint,
    attributedAt: candidate.attributedAt,
  };
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

export function loadAprShadowBlockerAttributionLedger(
  storage: ReadableAttributionStorage,
  reviewLedgerState: AprShadowReviewLedgerState,
  now = new Date(),
): AprShadowBlockerAttributionLedgerLoadResult {
  try {
    const raw = storage.getItem(APR_SHADOW_BLOCKER_ATTRIBUTION_LEDGER_STORAGE_KEY);
    if (!raw) return { storageValid: true, state: EMPTY_STATE };

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const savedAt = typeof parsed.savedAt === "string" ? Date.parse(parsed.savedAt) : Number.NaN;
    if (!Number.isFinite(savedAt) || savedAt > now.getTime() || !Array.isArray(parsed.records)) {
      return { storageValid: false, state: EMPTY_STATE };
    }

    const records = parsed.records.map(parseAttributionRecord);
    if (records.some((record) => record == null)) {
      return { storageValid: false, state: EMPTY_STATE };
    }

    const reconciled = reconcileAprShadowBlockerAttributionLedger(
      { records: records as AprShadowBlockerAttributionRecord[] },
      reviewLedgerState,
      [],
      now,
    );
    if (!reconciled.evidenceValid) {
      return { storageValid: false, state: EMPTY_STATE };
    }

    if ((records as AprShadowBlockerAttributionRecord[]).length > 0 && reconciled.state.records.length === 0) {
      storage.removeItem?.(APR_SHADOW_BLOCKER_ATTRIBUTION_LEDGER_STORAGE_KEY);
    }
    return { storageValid: true, state: reconciled.state };
  } catch {
    return { storageValid: false, state: EMPTY_STATE };
  }
}

export function saveAprShadowBlockerAttributionLedger(
  storage: Pick<Storage, "setItem">,
  state: AprShadowBlockerAttributionLedgerState,
  reviewLedgerState: AprShadowReviewLedgerState,
  now = new Date(),
): boolean {
  const reconciled = reconcileAprShadowBlockerAttributionLedger(
    state,
    reviewLedgerState,
    [],
    now,
  );
  if (!reconciled.evidenceValid) return false;

  try {
    storage.setItem(APR_SHADOW_BLOCKER_ATTRIBUTION_LEDGER_STORAGE_KEY, JSON.stringify({
      records: reconciled.state.records,
      savedAt: now.toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
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
