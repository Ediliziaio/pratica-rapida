export const APR_CASE_TRUTH_MODE_ENV = "APR_CASE_TRUTH_MODE" as const;
export type AprCaseTruthMode = "legacy" | "unified";

export function resolveAprCaseTruthMode(configuredValue: string | undefined = process.env[APR_CASE_TRUTH_MODE_ENV]): AprCaseTruthMode {
  if (configuredValue === undefined) return "legacy";
  if (configuredValue === "legacy" || configuredValue === "unified") return configuredValue;
  throw new Error(`apr_case_truth_mode_invalid:${configuredValue}`);
}
