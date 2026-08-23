export const APR_SHADOW_OPERATING_MODEL_VERSION = "apr-shadow-operating-model-v1" as const;

export const APR_SHADOW_AUDIT_RULE_IDS = Object.freeze([
  "system-apr-crm-integration-boundary",
  "system-readonly-adapter-contract",
  "system-operator-block-fail-closed",
  "system-atomic-checkpoint-resume",
] as const);

export type AprProductModule = "schermature_solari" | "vepa" | "infissi" | "pompe_di_calore" | "insufflaggio";
export type AprShadowDifferenceCategory =
  | "match_completo"
  | "differenza_irrilevante_formale"
  | "differenza_sostanziale"
  | "differenza_critica"
  | "apr_bloccato"
  | "pratica_non_confrontabile"
  | "possibile_errore_umano_da_verificare";

export interface AprShadowFieldValue {
  field: string;
  value: string | number | boolean | null;
  sourceId: string;
}

export interface AprShadowTerminalResult {
  actor: "APR" | "MATTEO";
  state: "completed" | "blocked";
  completedAt: string;
  sealedAt: string;
  resultFingerprint: string;
  fields: readonly AprShadowFieldValue[];
  blockerCode?: string;
  blockerReason?: string;
  blockerCoveredByRule?: boolean;
}

export interface AprShadowCaseInput {
  caseId: string;
  displayName: string;
  product: AprProductModule;
  receivedAt: string;
  apr: AprShadowTerminalResult;
  human: AprShadowTerminalResult | null;
  originalSources: readonly AprShadowFieldValue[];
  /** Deve restare null fino a quando il risultato APR non e' stato sigillato. */
  aprHumanResultAccessedAt: null;
}

export interface AprShadowDifference {
  field: string;
  category: AprShadowDifferenceCategory;
  aprValue: AprShadowFieldValue["value"];
  humanValue: AprShadowFieldValue["value"];
  originalValue: AprShadowFieldValue["value"];
  sourceId: string | null;
  explanation: string;
  critical: boolean;
  interceptedByApr: boolean;
}

export interface AprShadowCaseComparison {
  caseId: string;
  displayName: string;
  product: AprProductModule;
  category: AprShadowDifferenceCategory;
  differences: readonly AprShadowDifference[];
  aprCompletedAt: string;
  humanCompletedAt: string | null;
  aprResultFingerprint: string;
  humanResultFingerprint: string | null;
  comparisonUnlockedAfterAprSeal: boolean;
  appliedRuleIds: readonly string[];
}

export interface AprShadowMetrics {
  totalPractices: number;
  aprCompleted: number;
  aprBlocked: number;
  notComparable: number;
  automationRate: number;
  blockerRate: number;
  matchRate: number;
  differenceCount: number;
  criticalDifferenceCount: number;
  undetectedCriticalDifferenceCount: number;
  possibleHumanErrorCount: number;
  independenceViolationCount: number;
  sourceAdjudicationRate: number;
  recurringBlockers: readonly { code: string; count: number }[];
  uncoveredBlockers: readonly { code: string; count: number }[];
  productCoverage: Readonly<Record<AprProductModule, number>>;
}

export interface AprShadowDailyReport {
  version: typeof APR_SHADOW_OPERATING_MODEL_VERSION;
  reportDate: string;
  generatedAt: string;
  cases: readonly AprShadowCaseComparison[];
  metrics: AprShadowMetrics;
  externalMutationAllowed: false;
  eneaSubmitAllowed: false;
  humanResultMayFeedApr: false;
  appliedRuleIds: readonly string[];
}

const CATEGORY_PRIORITY: Record<AprShadowDifferenceCategory, number> = {
  match_completo: 0,
  differenza_irrilevante_formale: 1,
  possibile_errore_umano_da_verificare: 2,
  differenza_sostanziale: 3,
  pratica_non_confrontabile: 4,
  apr_bloccato: 5,
  differenza_critica: 6,
};

const CRITICAL_FIELD = /(?:codice[_ .-]*fiscale|\bcf\b|beneficiario|cointestatario|spesa|totale|detrazione|quantit|numero|cardinalit|gtot|superficie|misur)/i;

function normalizedText(value: AprShadowFieldValue["value"]) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLocaleLowerCase("it");
}

function normalizedNumber(value: AprShadowFieldValue["value"]) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const compact = String(value ?? "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "");
  const match = compact.match(/^-?\d+(?:[.,]\d+)?(?:\s*(?:€|eur|m2|m²))?$/i);
  if (!match) return null;
  const parsed = Number(compact.replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedDate(value: AprShadowFieldValue["value"]) {
  const text = normalizedText(value);
  const italian = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return italian ? `${italian[3]}-${italian[2]}-${italian[1]}` : text;
}

function exactEquivalent(left: AprShadowFieldValue["value"], right: AprShadowFieldValue["value"]) {
  if (left === right) return true;
  const leftNumber = normalizedNumber(left);
  const rightNumber = normalizedNumber(right);
  if (leftNumber !== null && rightNumber !== null) return Math.abs(leftNumber - rightNumber) < 0.005;
  return String(left ?? "").trim() === String(right ?? "").trim();
}

function formalEquivalent(left: AprShadowFieldValue["value"], right: AprShadowFieldValue["value"]) {
  if (exactEquivalent(left, right)) return true;
  if (normalizedDate(left) === normalizedDate(right)) return true;
  const withoutProvince = (value: AprShadowFieldValue["value"]) => normalizedText(value).replace(/\s*\([a-z]{2}\)\s*$/i, "").trim();
  return withoutProvince(left) === withoutProvince(right);
}

function fieldMap(values: readonly AprShadowFieldValue[]) {
  const result = new Map<string, AprShadowFieldValue>();
  for (const value of values) {
    if (!value.field.trim() || !value.sourceId.trim() || result.has(value.field)) throw new Error(`shadow_field_invalid_or_duplicate:${value.field}`);
    result.set(value.field, value);
  }
  return result;
}

function validateTerminalResult(result: AprShadowTerminalResult, actor: AprShadowTerminalResult["actor"]) {
  if (result.actor !== actor || !result.resultFingerprint.trim() || !Number.isFinite(Date.parse(result.completedAt)) || !Number.isFinite(Date.parse(result.sealedAt))) {
    throw new Error(`shadow_result_invalid:${actor}`);
  }
  if (Date.parse(result.sealedAt) < Date.parse(result.completedAt)) throw new Error(`shadow_result_not_sealed_after_completion:${actor}`);
  if (result.state === "blocked" && (!result.blockerCode?.trim() || !result.blockerReason?.trim())) throw new Error("shadow_blocker_not_informative");
  fieldMap(result.fields);
}

export function compareAprShadowCase(input: AprShadowCaseInput): AprShadowCaseComparison {
  if (!input.caseId.trim() || !input.displayName.trim() || !Number.isFinite(Date.parse(input.receivedAt))) throw new Error("shadow_case_identity_invalid");
  if (input.aprHumanResultAccessedAt !== null) throw new Error("shadow_independence_violated_human_result_seen_by_apr");
  validateTerminalResult(input.apr, "APR");
  if (input.apr.state === "blocked") {
    return Object.freeze({
      caseId: input.caseId,
      displayName: input.displayName,
      product: input.product,
      category: "apr_bloccato",
      differences: Object.freeze([]),
      aprCompletedAt: input.apr.completedAt,
      humanCompletedAt: input.human?.completedAt ?? null,
      aprResultFingerprint: input.apr.resultFingerprint,
      humanResultFingerprint: input.human?.resultFingerprint ?? null,
      comparisonUnlockedAfterAprSeal: !input.human || Date.parse(input.human.sealedAt) >= Date.parse(input.apr.sealedAt),
      appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS,
    });
  }
  if (!input.human) {
    return Object.freeze({
      caseId: input.caseId,
      displayName: input.displayName,
      product: input.product,
      category: "pratica_non_confrontabile",
      differences: Object.freeze([]),
      aprCompletedAt: input.apr.completedAt,
      humanCompletedAt: null,
      aprResultFingerprint: input.apr.resultFingerprint,
      humanResultFingerprint: null,
      comparisonUnlockedAfterAprSeal: true,
      appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS,
    });
  }
  validateTerminalResult(input.human, "MATTEO");
  if (Date.parse(input.human.sealedAt) < Date.parse(input.apr.sealedAt)) throw new Error("shadow_independence_violated_human_result_available_before_apr_seal");
  const apr = fieldMap(input.apr.fields);
  const human = fieldMap(input.human.fields);
  const original = fieldMap(input.originalSources);
  const fields = [...new Set([...apr.keys(), ...human.keys()])].sort();
  const differences: AprShadowDifference[] = [];

  for (const field of fields) {
    const aprField = apr.get(field);
    const humanField = human.get(field);
    const sourceField = original.get(field);
    const aprValue = aprField?.value ?? null;
    const humanValue = humanField?.value ?? null;
    const sourceValue = sourceField?.value ?? null;
    if (!aprField || !humanField) {
      differences.push({ field, category: "pratica_non_confrontabile", aprValue, humanValue, originalValue: sourceValue, sourceId: sourceField?.sourceId ?? null, explanation: "Il campo manca in uno dei due risultati sigillati.", critical: CRITICAL_FIELD.test(field), interceptedByApr: false });
      continue;
    }
    if (exactEquivalent(aprValue, humanValue)) continue;
    if (formalEquivalent(aprValue, humanValue)) {
      differences.push({ field, category: "differenza_irrilevante_formale", aprValue, humanValue, originalValue: sourceValue, sourceId: sourceField?.sourceId ?? null, explanation: "I valori differiscono solo per rappresentazione formale normalizzata.", critical: false, interceptedByApr: true });
      continue;
    }
    const aprMatchesSource = Boolean(sourceField && exactEquivalent(aprValue, sourceValue));
    const humanMatchesSource = Boolean(sourceField && exactEquivalent(humanValue, sourceValue));
    const critical = CRITICAL_FIELD.test(field);
    if (aprMatchesSource && !humanMatchesSource) {
      differences.push({ field, category: "possibile_errore_umano_da_verificare", aprValue, humanValue, originalValue: sourceValue, sourceId: sourceField!.sourceId, explanation: "APR coincide con la fonte originaria mentre il risultato umano differisce; serve verifica indipendente.", critical, interceptedByApr: true });
    } else {
      differences.push({ field, category: critical ? "differenza_critica" : "differenza_sostanziale", aprValue, humanValue, originalValue: sourceValue, sourceId: sourceField?.sourceId ?? null, explanation: humanMatchesSource ? "Il risultato umano coincide con la fonte originaria e APR differisce." : sourceField ? "Nessuno dei due risultati e' risolto automaticamente dalla fonte originaria." : "Differenza sostanziale senza fonte originaria disponibile per l'arbitraggio.", critical, interceptedByApr: false });
    }
  }
  const category = differences.length === 0
    ? "match_completo"
    : differences.reduce<AprShadowDifferenceCategory>((highest, difference) => CATEGORY_PRIORITY[difference.category] > CATEGORY_PRIORITY[highest] ? difference.category : highest, "match_completo");
  return Object.freeze({
    caseId: input.caseId,
    displayName: input.displayName,
    product: input.product,
    category,
    differences: Object.freeze(differences.map((difference) => Object.freeze(difference))),
    aprCompletedAt: input.apr.completedAt,
    humanCompletedAt: input.human.completedAt,
    aprResultFingerprint: input.apr.resultFingerprint,
    humanResultFingerprint: input.human.resultFingerprint,
    comparisonUnlockedAfterAprSeal: true,
    appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS,
  });
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

export function buildAprShadowMetrics(inputs: readonly AprShadowCaseInput[], comparisons: readonly AprShadowCaseComparison[]): AprShadowMetrics {
  const totalPractices = inputs.length;
  const aprCompleted = inputs.filter((item) => item.apr.state === "completed").length;
  const aprBlocked = inputs.filter((item) => item.apr.state === "blocked").length;
  const notComparable = comparisons.filter((item) => item.category === "pratica_non_confrontabile").length;
  const comparable = comparisons.filter((item) => !["apr_bloccato", "pratica_non_confrontabile"].includes(item.category));
  const match = comparable.filter((item) => item.category === "match_completo").length;
  const differences = comparisons.flatMap((item) => item.differences);
  const blockerCounts = new Map<string, number>();
  const uncoveredCounts = new Map<string, number>();
  for (const item of inputs.filter((candidate) => candidate.apr.state === "blocked")) {
    const code = item.apr.blockerCode!;
    blockerCounts.set(code, (blockerCounts.get(code) ?? 0) + 1);
    if (!item.apr.blockerCoveredByRule) uncoveredCounts.set(code, (uncoveredCounts.get(code) ?? 0) + 1);
  }
  const productCoverage = { schermature_solari: 0, vepa: 0, infissi: 0, pompe_di_calore: 0, insufflaggio: 0 } satisfies Record<AprProductModule, number>;
  for (const input of inputs) productCoverage[input.product] += 1;
  const sourceAdjudicated = differences.filter((difference) => difference.sourceId !== null).length;
  return Object.freeze({
    totalPractices,
    aprCompleted,
    aprBlocked,
    notComparable,
    automationRate: ratio(aprCompleted, totalPractices),
    blockerRate: ratio(aprBlocked, totalPractices),
    matchRate: ratio(match, comparable.length),
    differenceCount: differences.length,
    criticalDifferenceCount: differences.filter((difference) => difference.critical).length,
    undetectedCriticalDifferenceCount: differences.filter((difference) => difference.critical && !difference.interceptedByApr).length,
    possibleHumanErrorCount: differences.filter((difference) => difference.category === "possibile_errore_umano_da_verificare").length,
    independenceViolationCount: 0,
    sourceAdjudicationRate: ratio(sourceAdjudicated, differences.length),
    recurringBlockers: Object.freeze([...blockerCounts].map(([code, count]) => ({ code, count })).sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))),
    uncoveredBlockers: Object.freeze([...uncoveredCounts].map(([code, count]) => ({ code, count })).sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))),
    productCoverage: Object.freeze(productCoverage),
  });
}

export function buildAprShadowDailyReport(inputs: readonly AprShadowCaseInput[], generatedAt = new Date()): AprShadowDailyReport {
  const reportDate = generatedAt.toISOString().slice(0, 10);
  const comparisons = inputs.filter((input) => input.receivedAt.slice(0, 10) === reportDate).map(compareAprShadowCase);
  const dailyInputs = inputs.filter((input) => input.receivedAt.slice(0, 10) === reportDate);
  return Object.freeze({
    version: APR_SHADOW_OPERATING_MODEL_VERSION,
    reportDate,
    generatedAt: generatedAt.toISOString(),
    cases: Object.freeze(comparisons),
    metrics: buildAprShadowMetrics(dailyInputs, comparisons),
    externalMutationAllowed: false,
    eneaSubmitAllowed: false,
    humanResultMayFeedApr: false,
    appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS,
  });
}

export function aprShadowOperatingPlanSnapshot() {
  return Object.freeze({
    version: APR_SHADOW_OPERATING_MODEL_VERSION,
    currentPhase: "SHADOW" as const,
    productionAuthorized: false as const,
    externalMutationAllowed: false as const,
    eneaSubmitAllowed: false as const,
    officialProductionOwner: "MATTEO" as const,
    shadowOwner: "APR" as const,
    dailyComparisonSchedule: "fine giornata Europe/Rome" as const,
    targetSample: { minimum: 400, preferred: 500, indicativeMonths: "2-3" },
    readinessTargets: { rollingWindows: [50, 100], blockerRateMaximum: 0.15, nextBlockerRateGoal: 0.10, undetectedCriticalDifferences: 0 },
    products: [
      { product: "schermature_solari" as const, status: "baseline_da_chiudere_per_shadow" as const, nextGate: "ultimo batch pulito, confronto reale e CI" },
      { product: "vepa" as const, status: "prossimo_modulo" as const, nextGate: "analisi → mapping → blocker → test → confronto reale → CI → shadow" },
      { product: "infissi" as const, status: "pianificato" as const, nextGate: "dopo il gate VEPA" },
      { product: "pompe_di_calore" as const, status: "pianificato" as const, nextGate: "dopo il gate infissi" },
      { product: "insufflaggio" as const, status: "pianificato" as const, nextGate: "dopo il gate pompe di calore" },
    ],
    challengeControls: [
      "risultato umano invisibile ad APR fino al sigillo del risultato shadow",
      "fonte originaria usata per arbitrare senza assumere che l'operatore abbia sempre ragione",
      "automation rate calcolato sull'intero ingresso, inclusi blocker e non confrontabili",
      "zero differenze critiche non intercettate",
      "blocker nuovi classificati e trasformabili in regola soltanto con regressione verde",
    ],
    appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS,
  });
}
