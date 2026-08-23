#!/usr/bin/env node
import path from "node:path";
import { PersistentEneaRunner } from "./runner";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const command = process.argv[2] ?? "status";
const root = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const runner = new PersistentEneaRunner(root);
const owner = "enea-test-workflow";
const practiceId = option("--practice-id") ?? "";
const now = new Date(option("--at") ?? new Date().toISOString());

if (command === "register-policy-legacy") runner.registerTestStopPolicyAndLegacyUncertain(owner, practiceId, option("--command-id") ?? `${practiceId}:test-stop-policy:legacy:v1`, now);
else if (command === "start-readonly") runner.startAuthorizedReadOnlyPractice(owner, practiceId, option("--command-id") ?? `${practiceId}:workflow:start:v1`, now);
else if (command === "phase") runner.recordWorkflowPhase(owner, practiceId, {
  phase: option("--phase") as "customer_form" | "source_documents" | "preflight" | "draft_create" | "draft_fill_save",
  startedAt: option("--started-at") ?? "", endedAt: option("--ended-at") ?? "", status: option("--status") === "blocked" ? "blocked" : "completed", blockReason: option("--block-reason"),
}, option("--command-id") ?? `${practiceId}:workflow:phase:${option("--phase")}:v1`, now);
else if (command === "complete") runner.completeWorkflowTiming(owner, practiceId, option("--ended-at") ?? "", option("--command-id") ?? `${practiceId}:workflow:complete:v1`, now);
else if (command === "confirm-block") runner.confirmBlockedWorkflow(owner, practiceId, option("--command-id") ?? `${practiceId}:workflow:block-confirmed:v1`, now);
else if (command === "resume-test-deadline-alert") runner.resumeWorkflowAfterTestDeadlineAlert(owner, practiceId, Number(option("--elapsed-days") ?? "0"), option("--command-id") ?? `${practiceId}:workflow:test-deadline-alert:v1`, now);
else if (command !== "status") throw new Error("Comando workflow non valido.");
process.stdout.write(`${JSON.stringify(runner.load(), null, 2)}\n`);
