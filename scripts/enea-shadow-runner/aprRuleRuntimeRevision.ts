import { APR_RULE_SOURCE_FINGERPRINT } from "../../src/features/enea-shadow-crm/ruleTestMatrix";

/**
 * Revisione unica derivata dalla sostanza del registro e della matrice.
 * Cambiare una regola, una precedenza o un'azione cambia automaticamente la
 * revisione e obbliga tutti i preflight persistenti a ricalcolare i risultati.
 */
export const APR_RULE_RUNTIME_REVISION = `apr-rule-runtime-${APR_RULE_SOURCE_FINGERPRINT.slice(0, 24)}` as const;

const FORBIDDEN_CASE_DISCRIMINATORS = new Set([
  "customerkey",
  "customername",
  "displayname",
  "practiceid",
  "cohortkey",
  "draftid",
]);

export function assertGeneralRuleSemanticInputs(inputFields: readonly string[]) {
  const forbidden = inputFields.filter((field) => FORBIDDEN_CASE_DISCRIMINATORS.has(field.replace(/[^a-z0-9]/gi, "").toLowerCase()));
  if (forbidden.length) throw new Error(`apr_general_rule_case_discriminator_forbidden:${forbidden.join(",")}`);
  if (!inputFields.length) throw new Error("apr_general_rule_semantic_inputs_missing");
  return true as const;
}

