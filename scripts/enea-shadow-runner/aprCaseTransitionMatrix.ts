import type { AprNormalizedObservationStatus, AprPublicCaseStatus } from "./aprMonotonicArtifacts";

export const APR_CASE_TRANSITION_MATRIX_VERSION = "apr-case-transition-matrix-v1" as const;

export type AprTransitionToken = AprNormalizedObservationStatus
  | "BLOCKED:BUSINESS"
  | "BLOCKED:OPERATOR"
  | "BLOCKED:TECHNICAL"
  | "BLOCKED:UNCLASSIFIED";

export interface AprCaseTransitionPattern {
  id: string;
  commonPreflight: AprTransitionToken;
  productGate: AprTransitionToken;
  deepReview: AprTransitionToken;
  execution: AprTransitionToken;
  serverVerification: AprTransitionToken;
  publicStatus: Exclude<AprPublicCaseStatus, "INCONSISTENT">;
  reason: string;
}

export const APR_CASE_TRANSITION_MATRIX: readonly AprCaseTransitionPattern[] = Object.freeze([
  {
    id: "ready_before_execution",
    commonPreflight: "PASS",
    productGate: "PASS",
    deepReview: "NOT_APPLICABLE",
    execution: "NOT_APPLICABLE",
    serverVerification: "NOT_APPLICABLE",
    publicStatus: "READY",
    reason: "Preflight comune e gate prodotto superati; esecuzione non ancora iniziata.",
  },
  {
    id: "execution_in_progress",
    commonPreflight: "PASS",
    productGate: "PASS",
    deepReview: "NOT_APPLICABLE",
    execution: "IN_PROGRESS",
    serverVerification: "NOT_APPLICABLE",
    publicStatus: "IN_PROGRESS",
    reason: "Preflight superato ed esecuzione persistente in corso.",
  },
  {
    id: "execution_deferred",
    commonPreflight: "PASS",
    productGate: "PASS",
    deepReview: "NOT_APPLICABLE",
    execution: "DEFERRED",
    serverVerification: "NOT_APPLICABLE",
    publicStatus: "DEFERRED",
    reason: "Preflight superato ed esecuzione differita esplicitamente.",
  },
  {
    id: "draft_completed",
    commonPreflight: "PASS",
    productGate: "PASS",
    deepReview: "NOT_APPLICABLE",
    execution: "COMPLETED",
    serverVerification: "NOT_APPLICABLE",
    publicStatus: "COMPLETED",
    reason: "Preflight e gate prodotto superati; checkpoint execution completato.",
  },
  {
    id: "product_block_operator",
    commonPreflight: "PASS",
    productGate: "BLOCKED:UNCLASSIFIED",
    deepReview: "BLOCKED:OPERATOR",
    execution: "NOT_APPLICABLE",
    serverVerification: "NOT_APPLICABLE",
    publicStatus: "OPERATOR_REQUIRED",
    reason: "Il gate prodotto ha rilevato un blocker confermato dalla deep review come intervento operatore.",
  },
  {
    id: "product_block_technical",
    commonPreflight: "PASS",
    productGate: "BLOCKED:UNCLASSIFIED",
    deepReview: "BLOCKED:TECHNICAL",
    execution: "NOT_APPLICABLE",
    serverVerification: "NOT_APPLICABLE",
    publicStatus: "TECHNICAL_BLOCK",
    reason: "Il gate prodotto ha rilevato un blocker classificato dalla deep review come riparazione tecnica.",
  },
  {
    id: "common_block_operator",
    commonPreflight: "BLOCKED:UNCLASSIFIED",
    productGate: "NOT_APPLICABLE",
    deepReview: "BLOCKED:OPERATOR",
    execution: "NOT_APPLICABLE",
    serverVerification: "NOT_APPLICABLE",
    publicStatus: "OPERATOR_REQUIRED",
    reason: "Il preflight comune ha rilevato un blocker confermato dalla deep review come intervento operatore.",
  },
  {
    id: "common_block_technical",
    commonPreflight: "BLOCKED:UNCLASSIFIED",
    productGate: "NOT_APPLICABLE",
    deepReview: "BLOCKED:TECHNICAL",
    execution: "NOT_APPLICABLE",
    serverVerification: "NOT_APPLICABLE",
    publicStatus: "TECHNICAL_BLOCK",
    reason: "Il preflight comune ha rilevato un blocker classificato dalla deep review come riparazione tecnica.",
  },
] satisfies AprCaseTransitionPattern[]);

const key = (input: Omit<AprCaseTransitionPattern, "id" | "publicStatus" | "reason">) => [
  input.commonPreflight,
  input.productGate,
  input.deepReview,
  input.execution,
  input.serverVerification,
].join("|");

const MATRIX_BY_KEY = new Map(APR_CASE_TRANSITION_MATRIX.map((pattern) => [key(pattern), pattern]));

if (MATRIX_BY_KEY.size !== APR_CASE_TRANSITION_MATRIX.length) throw new Error("apr_case_transition_matrix_duplicate_pattern");

export function matchAprCaseTransition(input: Omit<AprCaseTransitionPattern, "id" | "publicStatus" | "reason">) {
  return MATRIX_BY_KEY.get(key(input)) ?? null;
}
