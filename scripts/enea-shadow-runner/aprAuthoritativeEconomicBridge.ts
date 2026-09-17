import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { verifyAprAuthoritativeEconomicDecision } from "../../src/features/enea-shadow-crm/authoritativeEconomicDecision";
import { USER_AUTHORIZED_RULE_IDS, registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { createBusinessDecisionsArtifact, createCanonicalFactsArtifact } from "./aprLevelSeparationContracts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { resolveCurrentCohortManifestCase } from "./aprEconomicCorpusReplay";

type Json = Record<string, unknown>;
const object = (value: unknown): Json | null => value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function currentFile(stateDir: string, relative: string) {
  const root = realpathSync(path.resolve(stateDir));
  const candidate = realpathSync(path.join(root, relative));
  const rel = path.relative(root, candidate);
  if (!rel || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error("apr_authoritative_economic_checkpoint_outside_state");
  return candidate;
}

/**
 * Costruisce l'artefatto L3 esclusivamente dalla decisione economica
 * persistita dal preflight comune. Questa funzione non apre documenti, non
 * segmenta fatture, non legge bonifici e non somma importi.
 */
export function loadAuthoritativeEconomicDecisionForBridge(stateDir: string, customerKey: string) {
  const currentCase = resolveCurrentCohortManifestCase(stateDir, customerKey);
  const checkpointPath = currentFile(stateDir, "crm-local-preflight/checkpoint.json");
  const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as Json;
  if (checkpoint.status !== "completed") throw new Error(`apr_authoritative_economic_preflight_not_completed:${customerKey}`);
  const items = Array.isArray(checkpoint.items) ? checkpoint.items.map(object).filter((item): item is Json => Boolean(item)) : [];
  const matches = items.filter((item) => text(item.customerKey) === customerKey);
  if (matches.length !== 1) throw new Error(`apr_authoritative_economic_case_count:${customerKey}:${matches.length}`);
  const item = matches[0];
  const report = object(item.report);
  const financial = object(report?.financial);
  const decision = financial?.authoritativeDecision;
  if (item.state !== "ready_local_plan" || report?.outcome !== "ready_local_plan"
    || text(item.practiceId) !== currentCase.practiceId
    || !verifyAprAuthoritativeEconomicDecision(decision)
    || decision.status !== "resolved") {
    throw new Error(`apr_authoritative_economic_decision_unavailable:${customerKey}`);
  }
  const sourceFingerprint = canonicalSha256(currentCase.evidence.sourceSha256);
  const factsArtifact = createCanonicalFactsArtifact({
    customerKey,
    practiceId: currentCase.practiceId,
    sourceFingerprint,
    facts: [{
      field: "economic.authoritativeDecision",
      status: "observed",
      value: {
        eligibleExpense: decision.eligibleExpense,
        invoiceTotal: decision.invoiceTotal,
        decisionFingerprint: decision.fingerprint,
      },
      sourceIds: decision.sourceIds,
      sourceLocators: decision.sourceIds.map((sourceId) => ({ sourceId, pageNumber: null, contentSha256: sourceFingerprint, excerptSha256: decision.fingerprint })),
      extractionMethod: "legacy_projection",
      confidence: "high",
      extractionRuleId: USER_AUTHORIZED_RULE_IDS.authoritativeEconomicDecisionSingleSource,
    }],
  });
  const fact = factsArtifact.payload.facts[0];
  const appliedRuleIds = [...new Set([
    USER_AUTHORIZED_RULE_IDS.authoritativeEconomicDecisionSingleSource,
    USER_AUTHORIZED_RULE_IDS.currentCohortEconomicBridge,
    ...decision.appliedRuleIds,
  ])];
  const sourcePrecedence = appliedRuleIds.flatMap((ruleId) => {
    const rule = registryRule(ruleId);
    if (!rule) throw new Error(`apr_authoritative_economic_rule_missing:${ruleId}`);
    return rule.sourcePrecedence.map((source) => `${ruleId}:${source}`);
  });
  const decisionsArtifact = createBusinessDecisionsArtifact({
    factsArtifact,
    decisions: [{
      field: "economic.eligibleExpense",
      status: "resolved",
      resolvedValue: decision.eligibleExpense,
      blockerCode: null,
      inputFactIds: [fact.factId],
      appliedRuleIds,
      sourcePrecedence,
      reason: "Decisione economica canonica consumata immutabilmente dal checkpoint del preflight comune; nessun ricalcolo nel bridge.",
    }],
  });
  return { currentCase, checkpointPath, decision, factsArtifact, decisionsArtifact, sourceFingerprint };
}

