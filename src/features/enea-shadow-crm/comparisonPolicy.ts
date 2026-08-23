export const CRM_MANUAL_COMPARISON_EXCLUSIONS = Object.freeze({
  always: ["dati impianto termico", "risparmio energetico stimato", "finestre protette"],
  testOnly: ["data fine lavori"],
} as const);

export function requiredCrmManualComparisonExclusions(testMode: boolean): readonly string[] {
  return testMode
    ? [...CRM_MANUAL_COMPARISON_EXCLUSIONS.always, ...CRM_MANUAL_COMPARISON_EXCLUSIONS.testOnly]
    : CRM_MANUAL_COMPARISON_EXCLUSIONS.always;
}

export function comparisonScope(testMode: boolean) {
  return {
    source: "pratica CRM manuale/chiusa e fonti originarie",
    forbiddenSource: "documenti ENEA storici",
    excludedFields: requiredCrmManualComparisonExclusions(testMode),
  } as const;
}
