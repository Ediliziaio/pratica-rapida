#!/usr/bin/env vite-node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideAprFaultRecovery, planAprFaultRecovery, type AprFaultRecoveryInput } from "./aprFaultRecoveryPolicy";

/**
 * Dice quali pratiche ferme per un guasto di APR vanno rimesse in coda, quando,
 * e quali invece nascondono un difetto da chiudere nel codice. Sola lettura:
 * non rilancia niente, produce il piano.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const runId = process.argv[2];
if (!runId) { process.stderr.write("usage: apr-fault-recovery-cli.ts <runId>\n"); process.exit(2); }

if (runId === "--decide-json") {
  try {
    const input = JSON.parse(process.argv[3] ?? "") as AprFaultRecoveryInput;
    process.stdout.write(`${JSON.stringify(decideAprFaultRecovery(input))}\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`apr_fault_recovery_decision_invalid:${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

const stdout = execFileSync(process.execPath, [
  path.join(here, "..", "..", "node_modules", ".bin", "vite-node"),
  path.join(here, "apr-stop-disposition-cli.ts"),
  runId,
], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });

const disposizioni = (JSON.parse(stdout).disposizioni as Array<Record<string, unknown>>) ?? [];
const inputs: AprFaultRecoveryInput[] = disposizioni
  .filter((item) => item.kind === "guasto_apr")
  .map((item) => ({
    customerKey: String(item.customerKey),
    faultText: String(item.text ?? ""),
    // Il conteggio dei tentativi vive nel ledger del runner: qui, in sola
    // lettura, si valuta il primo tentativo.
    previousAttempts: 0,
  }));

process.stdout.write(`${JSON.stringify({ runId, ...planAprFaultRecovery(inputs) }, null, 2)}\n`);
