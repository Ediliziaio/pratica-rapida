import type {
  AprCaseObservationSource,
  AprCaseStatusObservation,
  AprPublicCaseStatus,
} from "./aprMonotonicArtifacts";
import type { AprTransitionToken } from "./aprCaseTransitionMatrix";
import { matchAprCaseTransition } from "./aprCaseTransitionMatrix";
import { resolveAprCaseSourcePolicy } from "./aprCaseSourcePolicy";

export const APR_CASE_STATUS_RESOLVER_VERSION = "apr-case-status-resolver-v3" as const;

export interface AprResolvedCaseStatus {
  status: AprPublicCaseStatus;
  reason: string;
  disagreement: readonly AprCaseStatusObservation[] | null;
  matchedTransitionId: string | null;
}

const MATRIX_SOURCES = ["preflight_common", "product_gate", "deep_review", "execution", "checkpoint"] as const;
type MatrixSource = typeof MATRIX_SOURCES[number];

const policyKey = (source: MatrixSource) => source === "checkpoint" ? "server_verification" : source;

function inconsistent(reason: string, observations: readonly AprCaseStatusObservation[]): AprResolvedCaseStatus {
  return { status: "INCONSISTENT", reason, disagreement: observations, matchedTransitionId: null };
}

function token(observation: AprCaseStatusObservation | undefined): AprTransitionToken {
  if (!observation) return "NOT_APPLICABLE";
  if (observation.status !== "BLOCKED") return observation.status;
  return `BLOCKED:${observation.classification}` as AprTransitionToken;
}

function sameValues(left: readonly string[], right: readonly string[]) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function dualBlockedOperatorDisagreement(input: {
  common: AprCaseStatusObservation;
  product: AprCaseStatusObservation;
  deep: AprCaseStatusObservation | undefined;
  ignoredCommonBlockerCodes: readonly string[];
}): string | null {
  if (!input.deep || input.deep.status !== "BLOCKED" || input.deep.classification !== "OPERATOR") {
    return "Common e gate prodotto sono BLOCKED, ma la deep review non concorda con classificazione OPERATOR.";
  }
  if (!input.product.productModule || !input.deep.productModule || input.product.productModule !== input.deep.productModule) {
    return "Common e gate prodotto sono BLOCKED, ma il modulo prodotto diverge dalla deep review.";
  }
  if (input.common.classification !== "UNCLASSIFIED" || input.product.classification !== "UNCLASSIFIED") {
    return "Common e gate prodotto sono BLOCKED, ma la classificazione dei gate non e quella strutturale attesa.";
  }
  if (!sameValues(input.product.blockerCodes, input.deep.blockerCodes)) {
    return "Common e gate prodotto sono BLOCKED, ma i blocker del gate prodotto divergono dalla deep review.";
  }
  const ignored = new Set(input.ignoredCommonBlockerCodes);
  const applicableCommon = input.common.blockerCodes.filter((code) => !ignored.has(code));
  if (applicableCommon.length === 0 || applicableCommon.some((code) => !input.product.blockerCodes.includes(code))) {
    return "Common e gate prodotto sono BLOCKED, ma i blocker comuni applicabili non concordano con il gate prodotto.";
  }
  return null;
}

export function resolveAprCaseStatusTruth(observations: readonly AprCaseStatusObservation[]): AprResolvedCaseStatus {
  if (observations.length === 0) return inconsistent("Nessuna osservazione disponibile per la pratica.", observations);
  const customerKeys = [...new Set(observations.map((item) => item.customerKey))];
  if (customerKeys.length !== 1 || !customerKeys[0]) return inconsistent("Le osservazioni appartengono a customerKey differenti o vuoti.", observations);
  const runIds = [...new Set(observations.map((item) => item.runId))];
  if (runIds.length !== 1 || !runIds[0]) return inconsistent("Le osservazioni appartengono a runId differenti o vuoti.", observations);

  const bySource = new Map<AprCaseObservationSource, AprCaseStatusObservation>();
  for (const item of observations) {
    if (bySource.has(item.source)) return inconsistent(`Fonte duplicata nello stesso run: ${item.source}.`, observations.filter((candidate) => candidate.source === item.source));
    bySource.set(item.source, item);
  }
  const common = bySource.get("preflight_common");
  if (!common) return inconsistent("Fonte obbligatoria mancante: preflight_common.", observations);
  const product = bySource.get("product_gate");
  const policyResolution = resolveAprCaseSourcePolicy({
    commonStatus: common.status,
    commonBlockerCodes: common.blockerCodes,
    commonBlockerApplicability: common.blockerApplicability,
    routedProductModule: product?.productModule,
    productStatus: product?.status,
    executionPresent: bySource.has("execution"),
    serverVerificationPresent: bySource.has("checkpoint"),
  });
  const policy = policyResolution.policy;

  for (const source of MATRIX_SOURCES) {
    const requirement = policy[policyKey(source)];
    const item = bySource.get(source);
    if (requirement === "required" && !item) return inconsistent(`Fonte obbligatoria mancante: ${source}.`, observations);
    if (requirement === "not_applicable_expected" && item && item.status !== "NOT_APPLICABLE") {
      return inconsistent(`Fonte non applicabile eseguita con risultato sostanziale: ${source}=${item.status}.`, [item]);
    }
  }

  const structuredBlockers = bySource.get("report_blockers");
  const declaredBlockers = [...new Set(observations
    .filter((item) => item.source !== "report_blockers")
    .flatMap((item) => item.blockerCodes))].sort();
  if (declaredBlockers.length > 0 && !structuredBlockers) {
    return inconsistent("Fonte strutturata report_blockers mancante per blocker dichiarati.", observations.filter((item) => item.blockerCodes.length > 0));
  }
  if (structuredBlockers) {
    const missing = declaredBlockers.filter((code) => !structuredBlockers.blockerCodes.includes(code));
    if (missing.length > 0) return inconsistent(`Blocker dichiarati ma non tracciati in report_blockers: ${missing.join(", ")}.`, observations.filter((item) => item.blockerCodes.some((code) => missing.includes(code))));
  }


  if (common.status === "BLOCKED" && product?.status === "BLOCKED") {
    const disagreement = dualBlockedOperatorDisagreement({
      common,
      product,
      deep: bySource.get("deep_review"),
      ignoredCommonBlockerCodes: policyResolution.ignoredCommonBlockerCodes,
    });
    if (disagreement) return inconsistent(disagreement, observations.filter((item) => MATRIX_SOURCES.includes(item.source as MatrixSource)));
  }

  const pattern = matchAprCaseTransition({
    commonPreflight: policyResolution.effectiveCommonStatus === common.status
      ? token(common)
      : policyResolution.effectiveCommonStatus,
    productGate: token(product),
    deepReview: token(bySource.get("deep_review")),
    execution: token(bySource.get("execution")),
    serverVerification: token(bySource.get("checkpoint")),
  });
  if (!pattern) return inconsistent("Combinazione di stati non prevista dalla matrice APR.", observations.filter((item) => MATRIX_SOURCES.includes(item.source as MatrixSource)));
  return { status: pattern.publicStatus, reason: pattern.reason, disagreement: null, matchedTransitionId: pattern.id };
}
