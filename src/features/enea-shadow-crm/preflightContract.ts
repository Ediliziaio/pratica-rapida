import { ENEA_OPERATIONAL_REGISTRY_VERSION, rulesForStep, type OperationalProtocolStep } from "./operationalRegistry";

export const ENEA_PREFLIGHT_CONTRACT_VERSION = "enea-preflight-v1" as const;

export const ENEA_PREFLIGHT_STEPS = [
  "customer_form", "identity_property", "dates", "economic_sources", "gross_reconciliation",
  "screenings", "plant", "enea_mapping",
] as const;
export type EneaPreflightStep = typeof ENEA_PREFLIGHT_STEPS[number];
export type PreflightOutcome = "ready" | "requested_operator";

export interface PreflightEvidence {
  ok: boolean;
  source: string;
  ruleVersion: string;
  reason: string;
  nextAction: string;
}

export interface EneaPreflightInput {
  sessionReady: boolean;
  customerFormAcquired: boolean;
  attachmentInventoryComplete: boolean;
  requiredAssetsAcquired: boolean;
  economicSourcesClassified: boolean;
  identityPropertyComplete: boolean;
  datesComplete: boolean;
  financialTripleReconciled: boolean;
  screeningsReconciled: boolean;
  plantComplete: boolean;
  eneaMappingComplete: boolean;
  evidence: Record<EneaPreflightStep, Omit<PreflightEvidence, "ok">>;
  caseOverrides?: readonly CaseSpecificPreflightOverride[];
}

export interface CaseSpecificPreflightOverride {
  id: string;
  practiceId: string;
  field: string;
  value: string;
  scope: "single_practice_test";
  propagation: "forbidden";
  authorizedAt: string;
  authorizationSource: "explicit_user_authorization";
  reason: string;
}

/** A ledger may satisfy acquisition only with already verified, unchanged source evidence. */
export function sourceEvidenceSatisfiesStep(
  kinds: ReadonlyArray<{ kind: string; verification: string }>,
  requiredKinds: readonly string[],
): boolean {
  return requiredKinds.every((required) => kinds.some((item) => item.kind === required && item.verification === "verified"));
}

export interface EneaPreflightStepResult extends PreflightEvidence { step: EneaPreflightStep }
export interface EneaPreflightRun {
  id: string;
  version: typeof ENEA_PREFLIGHT_CONTRACT_VERSION;
  at: string;
  outcome: PreflightOutcome;
  steps: EneaPreflightStepResult[];
  caseOverrides?: CaseSpecificPreflightOverride[];
}

const STEP_CHECKS: Record<EneaPreflightStep, (input: EneaPreflightInput) => boolean> = {
  customer_form: (i) => i.sessionReady && i.customerFormAcquired && i.attachmentInventoryComplete && i.requiredAssetsAcquired,
  identity_property: (i) => i.identityPropertyComplete,
  dates: (i) => i.datesComplete,
  economic_sources: (i) => i.economicSourcesClassified,
  gross_reconciliation: (i) => i.financialTripleReconciled,
  screenings: (i) => i.screeningsReconciled,
  plant: (i) => i.plantComplete,
  enea_mapping: (i) => i.eneaMappingComplete,
};

/** Contratto unico, ordinato e fail-closed: valuta sempre la matrice completa, senza readiness parziali. */
export function runEneaPreflight(input: EneaPreflightInput, now = new Date()): EneaPreflightRun {
  const steps: EneaPreflightStepResult[] = [];
  for (const step of ENEA_PREFLIGHT_STEPS) {
    const registryStep = step as OperationalProtocolStep;
    const registryBacked = rulesForStep(registryStep).length > 0 && input.evidence[step].ruleVersion === ENEA_OPERATIONAL_REGISTRY_VERSION;
    const ok = STEP_CHECKS[step](input) && registryBacked;
    steps.push({ step, ok, ...input.evidence[step] });
  }
  return {
    id: `preflight-${now.getTime()}`,
    version: ENEA_PREFLIGHT_CONTRACT_VERSION,
    at: now.toISOString(),
    outcome: steps.length === ENEA_PREFLIGHT_STEPS.length && steps.every((step) => step.ok) ? "ready" : "requested_operator",
    steps,
    ...(input.caseOverrides?.length ? { caseOverrides: input.caseOverrides.map((override) => ({ ...override })) } : {}),
  };
}

export function isCompleteReadyPreflight(run: EneaPreflightRun | undefined): boolean {
  return Boolean(run && run.version === ENEA_PREFLIGHT_CONTRACT_VERSION && run.outcome === "ready"
    && run.steps.length === ENEA_PREFLIGHT_STEPS.length
    && run.steps.every((step, index) => step.step === ENEA_PREFLIGHT_STEPS[index] && step.ok));
}
