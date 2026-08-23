#!/usr/bin/env node
import path from "node:path";
import { prepareAprWatchdogLaunchAgent } from "./aprWatchdogLaunchAgent";
function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function required(name: string) { const value = option(name); if (!value) throw new Error(`Opzione obbligatoria mancante: ${name}`); return path.resolve(value); }
const mode = process.argv[2] ?? "prepare";
if (mode !== "prepare") throw new Error("Comando non valido: prepare.");
const result = prepareAprWatchdogLaunchAgent({
  label: option("--label"), nodeExecutable: required("--node"), bundlePath: required("--bundle"), stateDirectory: required("--state-dir"), serviceDirectory: required("--service-dir"),
  supervisorLabel: option("--supervisor-label") ?? "com.praticarapida.enea-shadow-supervisor", workerLabel: option("--worker-label") ?? "com.praticarapida.apr-enea-worker", intervalMs: Number(option("--interval-ms") ?? "15000"),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

