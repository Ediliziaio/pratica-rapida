#!/usr/bin/env node
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveCurrentCohortManifestCase, runEconomicVerticalForCurrentCohort } from "./aprEconomicCorpusReplay";
import { mapBusinessDecisionArtifactToEnea } from "./aprEneaPureMapper";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string) {
  const value = option(name)?.trim();
  if (!value) throw new Error(`apr_enea_bridge_prepare_option_missing:${name}`);
  return value;
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

const stateDir = path.resolve(required("--state-dir"));
const customerKey = required("--customer-key");
const output = path.resolve(required("--output"));
const currentCase = resolveCurrentCohortManifestCase(stateDir, customerKey);
const vertical = runEconomicVerticalForCurrentCohort(stateDir, customerKey);
if (vertical.outcome !== "RESOLVED" || !vertical.invoiceReconciliation.usable
  || vertical.decisionsArtifact.payload.decisions.some((decision) => decision.status !== "resolved")) {
  throw new Error(`apr_enea_bridge_prepare_economic_unresolved:${customerKey}`);
}
const mapping = mapBusinessDecisionArtifactToEnea(vertical.decisionsArtifact);
if (mapping.payload.status !== "mapped" || mapping.payload.blockers.length > 0) {
  throw new Error(`apr_enea_bridge_prepare_mapping_blocked:${mapping.payload.blockers.join(",")}`);
}
atomicWrite(output, `${JSON.stringify(mapping, null, 2)}\n`);
const sourceAudit = {
  schemaVersion: "apr-enea-current-cohort-bridge-audit-v1",
  ruleId: USER_AUTHORIZED_RULE_IDS.currentCohortEconomicBridge,
  stateDir,
  customerKey,
  practiceId: currentCase.practiceId,
  dossierPath: currentCase.evidence.dossierPath,
  analysisCheckpoint: currentCase.evidence.analysisCheckpoint,
  sourceFingerprint: canonicalSha256(currentCase.evidence.sourceSha256),
  decisionsArtifactId: vertical.decisionsArtifact.artifactId,
  mappingArtifactId: mapping.artifactId,
};
const sourceAuditPath = `${output}.source-audit.json`;
atomicWrite(sourceAuditPath, `${JSON.stringify(sourceAudit, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ customerKey, practiceId: mapping.payload.practiceId, economicTotal: vertical.invoiceReconciliation.total, decisionsArtifactId: vertical.decisionsArtifact.artifactId, mappingArtifactId: mapping.artifactId, output, sourceAuditPath, ruleId: sourceAudit.ruleId }, null, 2)}\n`);
