import crypto from "node:crypto";
import { ENEA_USER_AUTHORIZED_RULES, type OperationalRegistryRule } from "./operationalRegistry";

export const APR_BUSINESS_DECISION_LEDGER_VERSION = "apr-business-decision-ledger-v1" as const;

export type AprBusinessDecisionStatus = "case_only" | "candidate" | "certified_deployed" | "rejected" | "superseded";

export interface AprDeclaredBusinessDecision {
  decisionId: string;
  status: "candidate" | "superseded";
  statement: string;
  sourcePrecedence: readonly string[];
  deterministicAction: string;
  ruleIds: readonly string[];
  source: Readonly<{
    kind: "user_instruction_registered";
    receivedAt: string;
    reference: string;
  }>;
}

function declaredStatus(rule: OperationalRegistryRule): AprDeclaredBusinessDecision["status"] {
  return rule.lifecycle?.status === "superseded" ? "superseded" : "candidate";
}

/**
 * Registro statico e versionato delle decisioni utente già trasformate in
 * regole. Lo stato `candidate` qui significa "dichiarata nel sorgente": diventa
 * `certified_deployed` soltanto con matrice completa e bundle installato uguale
 * a quello testato.
 */
export const APR_DECLARED_BUSINESS_DECISIONS: readonly AprDeclaredBusinessDecision[] = Object.freeze(
  ENEA_USER_AUTHORIZED_RULES.map((rule) => Object.freeze({
    decisionId: `decision:${rule.id}`,
    status: declaredStatus(rule),
    statement: rule.condition,
    sourcePrecedence: [...rule.sourcePrecedence],
    deterministicAction: rule.deterministicAction,
    ruleIds: [rule.id],
    source: Object.freeze({
      kind: "user_instruction_registered" as const,
      receivedAt: rule.provenance?.receivedAt ?? "undocumented",
      reference: rule.provenance?.sourceRef ?? rule.id,
    }),
  })),
);

export const APR_BUSINESS_DECISION_LEDGER_FINGERPRINT = crypto.createHash("sha256").update(JSON.stringify({
  version: APR_BUSINESS_DECISION_LEDGER_VERSION,
  decisions: APR_DECLARED_BUSINESS_DECISIONS,
})).digest("hex");

export interface AprDecisionCertificationContext {
  matrixLinks: ReadonlyMap<string, readonly string[]>;
  provedMatrixKeys: ReadonlySet<string>;
  deploymentVerified: boolean;
}

export function resolveDeclaredBusinessDecisions(context: AprDecisionCertificationContext) {
  return APR_DECLARED_BUSINESS_DECISIONS.map((decision) => {
    if (decision.status === "superseded") return { ...decision, finalStatus: "superseded" as const, matrixKeys: [] as string[] };
    const matrixKeys = decision.ruleIds.flatMap((ruleId) => [...(context.matrixLinks.get(ruleId) ?? [])]);
    const fullyProved = matrixKeys.length > 0 && matrixKeys.every((key) => context.provedMatrixKeys.has(key));
    return {
      ...decision,
      matrixKeys,
      finalStatus: fullyProved && context.deploymentVerified ? "certified_deployed" as const : "candidate" as const,
    };
  });
}

export function assertCompleteBusinessDecisionCoverage(matrix: readonly { key: string; registryRuleIds: readonly string[] }[]) {
  const links = new Map<string, string[]>();
  for (const entry of matrix) for (const ruleId of entry.registryRuleIds) links.set(ruleId, [...(links.get(ruleId) ?? []), entry.key]);
  const missing = APR_DECLARED_BUSINESS_DECISIONS
    .filter((decision) => decision.status !== "superseded")
    .filter((decision) => decision.ruleIds.some((ruleId) => !(links.get(ruleId)?.length)))
    .map((decision) => decision.decisionId);
  if (missing.length) throw new Error(`apr_business_decision_matrix_coverage_missing:${missing.join(",")}`);
  return links;
}
