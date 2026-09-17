import crypto from "node:crypto";
import type { FinalPrintedInvoiceTotalVerification } from "./financialReconciliation";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export const APR_AUTHORITATIVE_ECONOMIC_DECISION_VERSION = "apr-authoritative-economic-decision-v1" as const;

export interface AprAuthoritativeEconomicDecision {
  schemaVersion: typeof APR_AUTHORITATIVE_ECONOMIC_DECISION_VERSION;
  status: "resolved" | "blocked";
  invoiceTotal: number | null;
  eligibleExpense: number | null;
  sourceIds: string[];
  ignoredIncompleteEconomicSourceIds: string[];
  policyVersion: string;
  fingerprint: string;
  appliedRuleIds: string[];
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
};

const sha256 = (value: unknown) => crypto.createHash("sha256").update(canonical(value)).digest("hex");

/**
 * Unico punto che materializza la decisione economica consumata dal runtime.
 * Il riconciliatore legge i documenti una volta; Infissi e bridge possono
 * soltanto verificare e consumare questo artefatto persistito, mai ricalcolarlo.
 */
export function buildAprAuthoritativeEconomicDecision(input: {
  reconciliation: FinalPrintedInvoiceTotalVerification;
  eligibleExpense: number | null;
}): AprAuthoritativeEconomicDecision {
  const resolved = input.reconciliation.usable
    && typeof input.reconciliation.total === "number"
    && Number.isFinite(input.reconciliation.total)
    && input.reconciliation.total >= 0
    && typeof input.eligibleExpense === "number"
    && Number.isFinite(input.eligibleExpense)
    && input.eligibleExpense >= 0;
  const core = {
    schemaVersion: APR_AUTHORITATIVE_ECONOMIC_DECISION_VERSION,
    status: resolved ? "resolved" as const : "blocked" as const,
    invoiceTotal: resolved ? input.reconciliation.total : null,
    eligibleExpense: resolved ? input.eligibleExpense : null,
    sourceIds: [...input.reconciliation.candidateInvoiceSourceIds].sort(),
    ignoredIncompleteEconomicSourceIds: [...input.reconciliation.ignoredIncompleteEconomicSourceIds].sort(),
    policyVersion: input.reconciliation.policyVersion,
    appliedRuleIds: [...new Set([
      USER_AUTHORIZED_RULE_IDS.authoritativeEconomicDecisionSingleSource,
      ...input.reconciliation.appliedRuleIds,
    ])].sort(),
  };
  return { ...core, fingerprint: sha256(core) };
}

export function verifyAprAuthoritativeEconomicDecision(value: unknown): value is AprAuthoritativeEconomicDecision {
  if (!value || typeof value !== "object") return false;
  const decision = value as AprAuthoritativeEconomicDecision;
  const { fingerprint, ...core } = decision;
  if (decision.schemaVersion !== APR_AUTHORITATIVE_ECONOMIC_DECISION_VERSION
    || !/^[a-f0-9]{64}$/.test(fingerprint)
    || sha256(core) !== fingerprint
    || !decision.appliedRuleIds.includes(USER_AUTHORIZED_RULE_IDS.authoritativeEconomicDecisionSingleSource)) return false;
  if (decision.status === "resolved") {
    return typeof decision.invoiceTotal === "number" && Number.isFinite(decision.invoiceTotal) && decision.invoiceTotal >= 0
      && typeof decision.eligibleExpense === "number" && Number.isFinite(decision.eligibleExpense) && decision.eligibleExpense >= 0
      && decision.sourceIds.length > 0;
  }
  return decision.status === "blocked" && decision.invoiceTotal === null && decision.eligibleExpense === null;
}

