#!/usr/bin/env node
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runEconomicVerticalForManifestCase } from "./aprEconomicCorpusReplay";
import { mapBusinessDecisionArtifactToEnea } from "./aprEneaPureMapper";

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

const sourceManifest = path.resolve(required("--source-manifest"));
const customerKey = required("--customer-key");
const output = path.resolve(required("--output"));
const vertical = runEconomicVerticalForManifestCase(sourceManifest, customerKey);
if (vertical.outcome !== "RESOLVED" || !vertical.invoiceReconciliation.usable
  || vertical.decisionsArtifact.payload.decisions.some((decision) => decision.status !== "resolved")) {
  throw new Error(`apr_enea_bridge_prepare_economic_unresolved:${customerKey}`);
}
const mapping = mapBusinessDecisionArtifactToEnea(vertical.decisionsArtifact);
if (mapping.payload.status !== "mapped" || mapping.payload.blockers.length > 0) {
  throw new Error(`apr_enea_bridge_prepare_mapping_blocked:${mapping.payload.blockers.join(",")}`);
}
atomicWrite(output, `${JSON.stringify(mapping, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ customerKey, practiceId: mapping.payload.practiceId, economicTotal: vertical.invoiceReconciliation.total, decisionsArtifactId: vertical.decisionsArtifact.artifactId, mappingArtifactId: mapping.artifactId, output }, null, 2)}\n`);
