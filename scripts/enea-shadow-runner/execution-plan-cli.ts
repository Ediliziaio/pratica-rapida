#!/usr/bin/env node
import path from "node:path";
import { PersistentExecutionPlanStore } from "./executionPlan";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const command = process.argv[2] ?? "status";
const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const store = new PersistentExecutionPlanStore(rootDirectory);
const now = new Date();

try {
  let result;
  if (command === "status") result = store.load() ?? { status: "absent", bridgeRequired: false };
  else if (command === "create") {
    const names = (option("--names") ?? "").split("/").map((value) => value.trim()).filter(Boolean);
    if (!names.length) throw new Error("Indicare almeno un nome con --names.");
    result = store.create(names, option("--plan-id") ?? `plan:${crypto.randomUUID()}`, now);
  } else if (command === "arm") result = store.arm(option("--command-id") ?? `arm:${crypto.randomUUID()}`, now);
  else if (command === "heartbeat") result = store.heartbeat(option("--executor") ?? `executor-${process.pid}`, now);
  else if (command === "claim") result = store.claimNext(option("--executor") ?? `executor-${process.pid}`, now);
  else if (command === "complete" || command === "block") {
    const executor = option("--executor") ?? `executor-${process.pid}`;
    const item = option("--item"); const note = option("--note");
    if (!item || !note) throw new Error("complete/block richiede --item e --note.");
    result = store.settleClaim(executor, item, command === "complete" ? "completed" : "blocked", note, now);
  } else throw new Error("Comando non valido: status, create, arm, heartbeat, claim, complete, block.");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) { process.stderr.write(`EXECUTION_PLAN_ERROR: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
