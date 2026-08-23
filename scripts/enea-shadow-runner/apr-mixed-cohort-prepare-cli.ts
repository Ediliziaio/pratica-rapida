#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AprArchivedMixedDiscoveryCheckpoint } from "./aprCrmArchivedMixedDiscovery";
import { PersistentAprCohortSeed } from "./aprCohortSeed";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprEneaWorkerService } from "./aprEneaBrowserWorkerService";
import { mixedDiscoveryToSeedManifest } from "./aprMixedCohortPrepare";

const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const required = (name: string) => { const value = option(name); if (!value) throw new Error(`apr_mixed_cohort_prepare_option_missing:${name}`); return path.resolve(value); };

const stateDirectory = required("--state-dir");
const historyRoot = required("--history-root");
const sourceRoot = required("--source-root");
const discovery = JSON.parse(readFileSync(path.join(stateDirectory, "archived-mixed-discovery", "checkpoint.json"), "utf8")) as AprArchivedMixedDiscoveryCheckpoint;
const manifest = mixedDiscoveryToSeedManifest(discovery);
const sourcePublicConfig = JSON.parse(readFileSync(path.join(sourceRoot, "crm-auth", "public-auth-config.json"), "utf8")) as { supabaseOrigin: string; publishableKey: string };
new PersistentAprCrmAuth(stateDirectory).configure(sourcePublicConfig.supabaseOrigin, sourcePublicConfig.publishableKey);
const seed = new PersistentAprCohortSeed(stateDirectory).seed(manifest, historyRoot);
const sourceWorker = new PersistentAprEneaWorkerService(sourceRoot).loadConfig();
const worker = new PersistentAprEneaWorkerService(stateDirectory).configure({
  setupEnabled: true,
  operationalEnabled: false,
  chromeExecutable: sourceWorker.chromeExecutable,
  profileDirectory: sourceWorker.profileDirectory,
  remoteDebuggingPort: sourceWorker.remoteDebuggingPort,
});
process.stdout.write(`${JSON.stringify({ seed, worker: { setupEnabled: worker.setupEnabled, operationalEnabled: worker.operationalEnabled, keepaliveIntervalMs: worker.keepaliveIntervalMs, profileDirectory: worker.profileDirectory, remoteDebuggingPort: worker.remoteDebuggingPort, previewAllowed: worker.previewAllowed, submitAllowed: worker.submitAllowed, communicationsAllowed: worker.communicationsAllowed } }, null, 2)}\n`);
