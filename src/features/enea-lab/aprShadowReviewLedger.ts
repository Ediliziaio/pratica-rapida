import {
  calculateAprShadowMetrics,
  type AprShadowMetricCase,
  type AprShadowOperatorVerdict,
} from "./aprShadowMetrics";

export const APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY = "enea-lab:apr-shadow-review-ledger:v1";
export const APR_SHADOW_REVIEW_LEDGER_TTL_MS = 120 * 24 * 60 * 60 * 1000;

export interface AprShadowMachineSnapshot extends Omit<AprShadowMetricCase, "operatorVerdict"> {
  /**
   * Impronta del risultato APR corrente. Deve cambiare quando cambiano dati,
   * documenti o logica che possono modificare l'esito della pratica.
   */
  aprFingerprint: string;
}

export interface AprShadowReviewRecord extends AprShadowMetricCase {
  aprFingerprint: string;
  observedAt: string;
  reviewedAt: string | null;
}

export interface AprShadowReviewLedgerState {
  records: AprShadowReviewRecord[];
}

export interface AprShadowReviewLedgerLoadResult {
  storageValid: boolean;
  expired: boolean;
  state: AprShadowReviewLedgerState;
}

export interface AprShadowReviewLedgerReconcileResult {
  evidenceValid: boolean;
  evidenceBlockers: Array<{
    practiceId: string;
    code: "invalid-apr-fingerprint" | AprShadowMetricsEvidenceCode;
  }>;
  state: AprShadowReviewLedgerState;
}

type AprShadowMetricsEvidenceCode = ReturnType<typeof calculateAprShadowMetrics>["evidenceBlockers"][number]["code"];

type ReadableStorage = Pick<Storage, "getItem"> & Partial<Pick<Storage, "removeItem">>;

const EMPTY_STATE: AprShadowReviewLedgerState = { records: [] };

function normalizedBlockerCodes(codes: string[]): string[] {
  return [...new Set(codes)].sort((left, right) => left.localeCompare(right));
}

function sameMachineResult(
  previous: AprShadowReviewRecord,
  current: AprShadowMachineSnapshot,
): boolean {
  if (previous.productType !== current.productType) return false;
  if (previous.evaluated !== current.evaluated) return false;
  if (previous.mappedFieldCount !== current.mappedFieldCount) return false;
  if (previous.autoReadyFieldCount !== current.autoReadyFieldCount) return false;

  const previousCodes = normalizedBlockerCodes(previous.blockerCodes);
  const currentCodes = normalizedBlockerCodes(current.blockerCodes);
  return previousCodes.length === currentCodes.length
    && previousCodes.every((code, index) => code === currentCodes[index]);
}

function verdictAllowed(
  evaluated: boolean,
  blockerCodes: string[],
  verdict: AprShadowOperatorVerdict,
): boolean {
  if (verdict === "unreviewed") return true;
  if (!evaluated) return false;
  if (blockerCodes.length > 0) {
    return verdict === "correct-block" || verdict === "false-block";
  }
  return verdict === "correct-ready" || verdict === "escaped-error";
}

function parseRecord(value: unknown): AprShadowReviewRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const productType = candidate.productType;
  const operatorVerdict = candidate.operatorVerdict;
  const preparationMinutes = candidate.preparationMinutes;
  const reviewedAt = candidate.reviewedAt;

  if (typeof candidate.practiceId !== "string") return null;
  if (typeof candidate.aprFingerprint !== "string" || candidate.aprFingerprint.trim().length === 0) return null;
  if (
    productType !== "schermature"
    && productType !== "infissi"
    && productType !== "impianto_termico"
    && productType !== "insufflaggio"
    && productType !== "unknown"
  ) return null;
  if (typeof candidate.evaluated !== "boolean") return null;
  if (!Array.isArray(candidate.blockerCodes) || candidate.blockerCodes.some((code) => typeof code !== "string")) return null;
  if (typeof candidate.mappedFieldCount !== "number" || typeof candidate.autoReadyFieldCount !== "number") return null;
  if (
    operatorVerdict !== "unreviewed"
    && operatorVerdict !== "correct-block"
    && operatorVerdict !== "false-block"
    && operatorVerdict !== "correct-ready"
    && operatorVerdict !== "escaped-error"
  ) return null;
  if (preparationMinutes != null && typeof preparationMinutes !== "number") return null;
  if (typeof candidate.observedAt !== "string") return null;
  if (reviewedAt != null && typeof reviewedAt !== "string") return null;

  return {
    practiceId: candidate.practiceId,
    productType,
    evaluated: candidate.evaluated,
    blockerCodes: candidate.blockerCodes as string[],
    mappedFieldCount: candidate.mappedFieldCount,
    autoReadyFieldCount: candidate.autoReadyFieldCount,
    operatorVerdict,
    preparationMinutes: preparationMinutes as number | null | undefined,
    aprFingerprint: candidate.aprFingerprint,
    observedAt: candidate.observedAt,
    reviewedAt: reviewedAt as string | null,
  };
}

/**
 * Ledger locale del feedback loop APR shadow.
 *
 * Contiene solo ID pratica, esito tecnico, blocker e verdetto operatore: nessuna
 * anagrafica cliente. Il ledger serve a mantenere review e KPI tra sessioni senza
 * scrivere nel CRM di produzione.
 */
export function loadAprShadowReviewLedger(
  storage: ReadableStorage,
  now = new Date(),
): AprShadowReviewLedgerLoadResult {
  try {
    const raw = storage.getItem(APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY);
    if (!raw) return { storageValid: true, expired: false, state: EMPTY_STATE };

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const savedAt = typeof parsed.savedAt === "string" ? Date.parse(parsed.savedAt) : Number.NaN;
    if (!Number.isFinite(savedAt)) {
      return { storageValid: false, expired: false, state: EMPTY_STATE };
    }
    if (now.getTime() - savedAt > APR_SHADOW_REVIEW_LEDGER_TTL_MS) {
      storage.removeItem?.(APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY);
      return { storageValid: true, expired: true, state: EMPTY_STATE };
    }
    if (!Array.isArray(parsed.records)) {
      return { storageValid: false, expired: false, state: EMPTY_STATE };
    }

    const records = parsed.records.map(parseRecord);
    if (records.some((record) => record == null)) {
      return { storageValid: false, expired: false, state: EMPTY_STATE };
    }

    const typedRecords = records as AprShadowReviewRecord[];
    const metrics = calculateAprShadowMetrics(typedRecords.map(({ aprFingerprint: _fingerprint, observedAt: _observedAt, reviewedAt: _reviewedAt, ...row }) => row));
    if (!metrics.evidenceValid) {
      return { storageValid: false, expired: false, state: EMPTY_STATE };
    }

    return { storageValid: true, expired: false, state: { records: typedRecords } };
  } catch {
    return { storageValid: false, expired: false, state: EMPTY_STATE };
  }
}

export function saveAprShadowReviewLedger(
  storage: Pick<Storage, "setItem">,
  state: AprShadowReviewLedgerState,
  now = new Date(),
): void {
  try {
    storage.setItem(APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY, JSON.stringify({
      records: state.records,
      savedAt: now.toISOString(),
    }));
  } catch {
    // Storage disabilitato o pieno: nessun fallback verso il CRM di produzione.
  }
}

/**
 * Riconcilia gli output APR correnti con lo storico locale.
 *
 * Un verdetto umano viene conservato soltanto se fingerprint e risultato tecnico
 * sono invariati. Qualunque cambio di dati/documenti/regole resetta la pratica a
 * "unreviewed", impedendo che una review vecchia certifichi un output nuovo.
 */
export function reconcileAprShadowReviewLedger(
  previousState: AprShadowReviewLedgerState,
  currentSnapshots: AprShadowMachineSnapshot[],
  now = new Date(),
): AprShadowReviewLedgerReconcileResult {
  const snapshotRows: AprShadowMetricCase[] = currentSnapshots.map((snapshot) => ({
    practiceId: snapshot.practiceId,
    productType: snapshot.productType,
    evaluated: snapshot.evaluated,
    blockerCodes: snapshot.blockerCodes,
    mappedFieldCount: snapshot.mappedFieldCount,
    autoReadyFieldCount: snapshot.autoReadyFieldCount,
    operatorVerdict: "unreviewed",
    preparationMinutes: snapshot.preparationMinutes,
  }));
  const snapshotMetrics = calculateAprShadowMetrics(snapshotRows);
  const evidenceBlockers: AprShadowReviewLedgerReconcileResult["evidenceBlockers"] = [
    ...snapshotMetrics.evidenceBlockers,
  ];

  for (const snapshot of currentSnapshots) {
    if (snapshot.aprFingerprint.trim().length === 0) {
      evidenceBlockers.push({ practiceId: snapshot.practiceId, code: "invalid-apr-fingerprint" });
    }
  }

  if (evidenceBlockers.length > 0) {
    return {
      evidenceValid: false,
      evidenceBlockers,
      state: previousState,
    };
  }

  const previousByPractice = new Map(previousState.records.map((record) => [record.practiceId, record]));
  const currentIds = new Set(currentSnapshots.map((snapshot) => snapshot.practiceId));
  const observedAt = now.toISOString();
  const reconciledCurrent = currentSnapshots.map((snapshot): AprShadowReviewRecord => {
    const previous = previousByPractice.get(snapshot.practiceId);
    const preserveReview = previous != null
      && previous.aprFingerprint === snapshot.aprFingerprint
      && sameMachineResult(previous, snapshot)
      && verdictAllowed(snapshot.evaluated, snapshot.blockerCodes, previous.operatorVerdict);

    return {
      practiceId: snapshot.practiceId,
      productType: snapshot.productType,
      evaluated: snapshot.evaluated,
      blockerCodes: normalizedBlockerCodes(snapshot.blockerCodes),
      mappedFieldCount: snapshot.mappedFieldCount,
      autoReadyFieldCount: snapshot.autoReadyFieldCount,
      operatorVerdict: preserveReview ? previous.operatorVerdict : "unreviewed",
      preparationMinutes: snapshot.preparationMinutes,
      aprFingerprint: snapshot.aprFingerprint,
      observedAt,
      reviewedAt: preserveReview ? previous.reviewedAt : null,
    };
  });

  return {
    evidenceValid: true,
    evidenceBlockers: [],
    state: {
      records: [
        ...previousState.records.filter((record) => !currentIds.has(record.practiceId)),
        ...reconciledCurrent,
      ],
    },
  };
}

export function applyAprShadowOperatorVerdict(
  record: AprShadowReviewRecord,
  verdict: AprShadowOperatorVerdict,
  now = new Date(),
): AprShadowReviewRecord | null {
  if (!verdictAllowed(record.evaluated, record.blockerCodes, verdict)) return null;
  return {
    ...record,
    operatorVerdict: verdict,
    reviewedAt: verdict === "unreviewed" ? null : now.toISOString(),
  };
}

export function aprShadowLedgerToMetricCases(
  state: AprShadowReviewLedgerState,
): AprShadowMetricCase[] {
  return state.records.map(({ aprFingerprint: _fingerprint, observedAt: _observedAt, reviewedAt: _reviewedAt, ...row }) => ({
    ...row,
    blockerCodes: [...row.blockerCodes],
  }));
}
