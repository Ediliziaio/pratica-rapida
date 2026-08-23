#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PersistentAprWatchdog, type AprWatchdogRecovery, type AprWatchdogTarget } from "./aprWatchdog";
import { buildAprWatchdogObservation } from "./aprWatchdogRuntime";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const mode = process.argv[2] ?? "status";
const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const intervalMs = Number(option("--interval-ms") ?? "15000");
const labels: Record<AprWatchdogTarget, string> = {
  supervisor: option("--supervisor-label") ?? "com.praticarapida.enea-shadow-supervisor",
  worker: option("--worker-label") ?? "com.praticarapida.apr-enea-worker",
};
for (const label of Object.values(labels)) if (!/^com\.praticarapida\.[a-z0-9.-]+$/.test(label)) throw new Error("apr_watchdog_launch_agent_label_invalid");
if (!Number.isInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 60_000) throw new Error("apr_watchdog_interval_invalid");
const watchdog = new PersistentAprWatchdog(rootDirectory, { instanceId: `apr-watchdog-service-${process.pid}-${crypto.randomUUID()}`, processPid: process.pid });

function processAlive(pid: number | null) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}
function recover(recovery: AprWatchdogRecovery) {
  const domain = `gui/${process.getuid?.() ?? 501}/${labels[recovery.target]}`;
  const result = spawnSync("/bin/launchctl", ["kickstart", "-k", domain], { encoding: "utf8", timeout: 30_000 });
  if (result.error || result.status !== 0) throw new Error(`apr_watchdog_kickstart_failed:${recovery.target}:${result.error?.message ?? result.stderr.trim()}`);
}
function snapshot() {
  const observation = buildAprWatchdogObservation(rootDirectory, processAlive);
  return { observation, watchdog: watchdog.load() };
}
async function serve() {
  let running = true;
  process.once("SIGINT", () => { running = false; }); process.once("SIGTERM", () => { running = false; });
  while (running) {
    try {
      const result = watchdog.tick(buildAprWatchdogObservation(rootDirectory, processAlive));
      if (result.recovery) recover(result.recovery);
    } catch (error) {
      process.stderr.write(`APR_WATCHDOG_ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
if (mode === "status") process.stdout.write(`${JSON.stringify(snapshot(), null, 2)}\n`);
else if (mode === "once") {
  const result = watchdog.tick(buildAprWatchdogObservation(rootDirectory, processAlive));
  if (result.recovery) recover(result.recovery);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (mode === "serve") await serve();
else throw new Error("Comando watchdog non valido: status, once, serve.");

