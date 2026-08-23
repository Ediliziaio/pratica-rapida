#!/usr/bin/env node
import path from "node:path";
import { PersistentEneaRunner } from "./runner";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const command = process.argv[2] ?? "status";
const root = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const runner = new PersistentEneaRunner(root);
const owner = "enea-test-finalization";
const practice = option("--practice-id") ?? "audit-sara-agostinelli";
const draftId = option("--draft-id") ?? "";
const now = new Date(option("--at") ?? new Date().toISOString());

if (command === "authorize") runner.beginAuthorizedTestFinalization(owner, practice, draftId, option("--mode") === "test", option("--command-id") ?? `${practice}:test-finalization:authorize:v1`, now);
else if (command === "draft-validated") runner.recordTestDraftValidated(owner, practice, draftId, option("--evidence-id") ?? "", Number(option("--energy-savings") ?? "0"), option("--command-id") ?? `${practice}:test-finalization:draft-validated:v1`, now);
else if (command === "preview-opened") runner.recordTestPreviewOpened(owner, practice, draftId, option("--command-id") ?? `${practice}:test-finalization:preview-opened:v1`, now);
else if (command === "preview-verified") runner.recordTestPreviewVerified(owner, practice, draftId, option("--command-id") ?? `${practice}:test-finalization:preview-verified:v1`, now);
else if (command === "submit-intent") runner.recordTestSubmitIntent(owner, practice, draftId, option("--command-id") ?? `${practice}:test-finalization:submit-intent:v1`, now);
else if (command === "outcome") runner.recordAuthorizedTestSubmissionOutcome(owner, practice, {
  draftId, evidenceId: option("--evidence-id") ?? "", dashboardStatus: option("--dashboard-status") === "Inviata" ? "Inviata" : "Incerto",
  cpid: option("--cpid") ?? "", observedAt: option("--observed-at") ?? now.toISOString(),
}, option("--command-id") ?? `${practice}:test-finalization:outcome:v1`, now);
else if (command !== "status") throw new Error("Comando finalizzazione non valido.");
process.stdout.write(`${JSON.stringify(runner.load(), null, 2)}\n`);
