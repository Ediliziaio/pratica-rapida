#!/usr/bin/env node
import path from "node:path";
import { existsSync } from "node:fs";
import { PersistentEneaRunner } from "./runner";
import { PersistentReadinessLease } from "./readinessLease";
import { PersistentReadOnlyAdapter } from "./readOnlyAdapter";
import {
  LAUNCH_AGENT_LABEL,
  prepareLaunchAgent,
  verifyPreparedLaunchAgent,
} from "./launchAgentService";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2] ?? "verify";
const workingDirectory = path.resolve(option("--working-dir") ?? process.cwd());
const stateDirectory = path.resolve(option("--state-dir") ?? path.join(workingDirectory, ".enea-shadow-runtime"));
const configuredPath = path.join(stateDirectory, "system-service", `${LAUNCH_AGENT_LABEL}.plist`);
const options = {
  workingDirectory,
  stateDirectory,
  port: Number(option("--port") ?? "4317"),
  standaloneEntryPath: option("--standalone-entry"),
};

try {
  let report;
  if (command === "prepare") {
    new PersistentEneaRunner(stateDirectory).initialize();
    new PersistentReadinessLease(stateDirectory).initialize();
    new PersistentReadOnlyAdapter(stateDirectory).initialize();
    report = prepareLaunchAgent(options);
  } else if (command === "verify") {
    if (!existsSync(configuredPath)) throw new Error("Configurazione non preparata. Eseguire prima il comando prepare.");
    report = verifyPreparedLaunchAgent(configuredPath, options);
  } else throw new Error("Comando non valido. Usare esclusivamente prepare oppure verify.");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ready) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`SERVICE_PREPARATION_ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
