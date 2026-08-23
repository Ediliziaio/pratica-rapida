#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCohortSeed, type AprCohortSeedManifest } from "./aprCohortSeed";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprEneaWorkerService } from "./aprEneaBrowserWorkerService";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function required(name: string) { const value = option(name); if (!value) throw new Error(`apr_cohort_seed_option_missing:${name}`); return path.resolve(value); }

const rootDirectory = required("--state-dir");
const historyRoot = required("--history-root");
const sourceRoot = required("--source-root");
const manifestPath = required("--manifest");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AprCohortSeedManifest;

const sourcePublicConfig = JSON.parse(readFileSync(path.join(sourceRoot, "crm-auth", "public-auth-config.json"), "utf8")) as { supabaseOrigin: string; publishableKey: string };
new PersistentAprCrmAuth(rootDirectory).configure(sourcePublicConfig.supabaseOrigin, sourcePublicConfig.publishableKey);
const seed = new PersistentAprCohortSeed(rootDirectory).seed(manifest, historyRoot);
const sourceWorker = new PersistentAprEneaWorkerService(sourceRoot).loadConfig();
const worker = new PersistentAprEneaWorkerService(rootDirectory).configure({
  setupEnabled: true,
  operationalEnabled: false,
  chromeExecutable: sourceWorker.chromeExecutable,
  profileDirectory: sourceWorker.profileDirectory,
  remoteDebuggingPort: sourceWorker.remoteDebuggingPort,
});
process.stdout.write(`${JSON.stringify({ seed, worker: { setupEnabled: worker.setupEnabled, operationalEnabled: worker.operationalEnabled, profileDirectory: worker.profileDirectory, remoteDebuggingPort: worker.remoteDebuggingPort } }, null, 2)}\n`);
