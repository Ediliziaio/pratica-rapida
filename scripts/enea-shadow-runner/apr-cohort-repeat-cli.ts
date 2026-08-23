#!/usr/bin/env node
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCohortSeed } from "./aprCohortSeed";
import { buildAprCohortRepeatPlan } from "./aprCohortRepeat";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprEneaWorkerService } from "./aprEneaBrowserWorkerService";
import { readFileSync } from "node:fs";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function required(name: string) { const value = option(name); if (!value) throw new Error(`apr_cohort_repeat_option_missing:${name}`); return value; }
function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

const stateDirectory = path.resolve(required("--state-dir"));
const historyRoot = path.resolve(required("--history-root"));
const sourceRoot = path.resolve(required("--source-root"));
const authorizationId = required("--authorization-id");
const sourceEvidenceId = required("--source-evidence-id");
const plan = buildAprCohortRepeatPlan({ sourceRoot, authorizationId, sourceEvidenceId });
const sourcePublicConfig = JSON.parse(readFileSync(path.join(sourceRoot, "crm-auth", "public-auth-config.json"), "utf8")) as { supabaseOrigin: string; publishableKey: string };
new PersistentAprCrmAuth(stateDirectory).configure(sourcePublicConfig.supabaseOrigin, sourcePublicConfig.publishableKey);
const seed = new PersistentAprCohortSeed(stateDirectory).seed(plan.manifest, historyRoot);
const sourceWorker = new PersistentAprEneaWorkerService(sourceRoot).loadConfig();
const worker = new PersistentAprEneaWorkerService(stateDirectory).configure({
  setupEnabled: true,
  operationalEnabled: false,
  chromeExecutable: sourceWorker.chromeExecutable,
  profileDirectory: sourceWorker.profileDirectory,
  remoteDebuggingPort: sourceWorker.remoteDebuggingPort,
});
atomicWrite(path.join(stateDirectory, "cohort-repeat-plan", "checkpoint.json"), `${JSON.stringify({ ...plan, manifest: undefined, createdAt: new Date().toISOString() }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ plan: { sourceFingerprint: plan.sourceFingerprint, sourceCandidateCount: plan.sourceCandidateCount, includedCandidateCount: plan.includedCandidateCount, exclusions: plan.exclusions }, seed, worker: { setupEnabled: worker.setupEnabled, operationalEnabled: worker.operationalEnabled, profileDirectory: worker.profileDirectory, remoteDebuggingPort: worker.remoteDebuggingPort } }, null, 2)}\n`);
