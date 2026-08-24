#!/usr/bin/env node
import path from "node:path";
import { writeLocalDashboard } from "./dashboard";
import { JournalStore } from "./journalStore";
import { LocalDashboardSupervisor } from "./localDashboardServer";
import { supervise } from "./supervisor";
import { SupervisorBusyError, SupervisorRuntimeStore } from "./supervisorRuntime";
import { PersistentReadinessLease } from "./readinessLease";
import { PersistentReadOnlyAdapter } from "./readOnlyAdapter";
import { PersistentLocalDossierBatch } from "./localDossierBatch";
import { PersistentAprEneaDraftExecution } from "./eneaDraftExecution";
import { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const mode = process.argv[2] ?? "status";
const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const store = new JournalStore(rootDirectory);
const runtimeStore = new SupervisorRuntimeStore(rootDirectory);
const readinessStore = new PersistentReadinessLease(rootDirectory);
const adapterStore = new PersistentReadOnlyAdapter(rootDirectory);
const draftExecution = new PersistentAprEneaDraftExecution(rootDirectory);
const draftDocumentAnalysis = new PersistentAprCrmDocumentAnalysis(rootDirectory);
const draftPreflight = new PersistentAprCrmLocalPreflight(rootDirectory, draftDocumentAnalysis);

function requiredOption(name: string) {
  const value = option(name)?.trim();
  if (!value) throw new Error(`Opzione obbligatoria mancante: ${name}`);
  return value;
}

function printDraft(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function requiredUncertainSaveDecision() {
  const decision = requiredOption("--decision");
  if (!(["saved", "not_saved", "indeterminate"] as const).includes(decision as "saved" | "not_saved" | "indeterminate")) throw new Error("Decisione non valida: usare saved, not_saved oppure indeterminate.");
  return decision as "saved" | "not_saved" | "indeterminate";
}

function printOnce() {
  const state = store.load();
  const runtime = runtimeStore.load();
  const now = new Date();
  const readiness = readinessStore.snapshot(now);
  const adapter = adapterStore.snapshot(now);
  const snapshot = writeLocalDashboard(rootDirectory, state, now, runtime, readiness, adapter);
  process.stdout.write(`${JSON.stringify({ supervisor: runtime, runner: snapshot, readiness, adapter }, null, 2)}\n`);
}

try {
  if (mode === "once") printOnce();
  else if (mode === "draft-status") printDraft(draftExecution.snapshot());
  else if (mode === "preflight-apply-validation") printDraft(draftPreflight.applyValidationRevision(requiredOption("--validation-revision")));
  else if (mode === "documents-apply-parser-revision") printDraft(draftDocumentAnalysis.applyParserRevision(requiredOption("--parser-revision")));
  else if (mode === "draft-package-summary") {
    const draftPackage = draftPreflight.buildDraftExecutionPackage(requiredOption("--customer-key"));
    printDraft({
      version: draftPackage.version,
      customerKey: draftPackage.customerKey,
      displayName: draftPackage.displayName,
      practiceId: draftPackage.practiceId,
      sourceFingerprint: draftPackage.sourceFingerprint,
      mappingFingerprint: draftPackage.mappingFingerprint,
      workflowFingerprint: draftPackage.workflowFingerprint,
      packageFingerprint: draftPackage.packageFingerprint,
      mode: draftPackage.payload.mode,
      portalFieldCount: draftPackage.payload.portalFields.length,
      supportedPages: draftPackage.workflow.supportedPages,
      screeningItemCount: draftPackage.workflow.screeningItemCount,
      safety: draftPackage.safety,
    });
  }
  else if (mode === "draft-login-required") printDraft(draftExecution.recordLoginRequired(requiredOption("--reason"), requiredOption("--evidence-id"), requiredOption("--command-id")));
  else if (mode === "draft-session-ready") printDraft(draftExecution.recordSessionReady(requiredOption("--evidence-id"), requiredOption("--command-id")));
  else if (mode === "draft-create-intent") printDraft(draftExecution.recordCreateIntent(requiredOption("--customer-key"), requiredOption("--command-id")));
  else if (mode === "draft-created") printDraft(draftExecution.recordDraftCreated(requiredOption("--customer-key"), requiredOption("--draft-id"), requiredOption("--url"), requiredOption("--evidence-id"), requiredOption("--command-id")));
  else if (mode === "draft-page") printDraft(draftExecution.recordPagePrepared(requiredOption("--customer-key"), requiredOption("--draft-id"), requiredOption("--page-id"), requiredOption("--evidence-id"), requiredOption("--command-id")));
  else if (mode === "draft-page-discovered") printDraft(draftExecution.recordRequiredPageDiscovered(requiredOption("--customer-key"), requiredOption("--draft-id"), requiredOption("--page-id"), requiredOption("--evidence-id"), requiredOption("--command-id")));
  else if (mode === "draft-page-save-intent") printDraft(draftExecution.recordPageSaveIntent(requiredOption("--customer-key"), requiredOption("--draft-id"), requiredOption("--page-id"), requiredOption("--command-id")));
  else if (mode === "draft-page-saved") printDraft(draftExecution.recordPageSaved(requiredOption("--customer-key"), requiredOption("--draft-id"), requiredOption("--page-id"), requiredOption("--evidence-id"), requiredOption("--command-id")));
  else if (mode === "draft-save-intent") printDraft(draftExecution.recordSaveIntent(requiredOption("--customer-key"), requiredOption("--draft-id"), requiredOption("--command-id")));
  else if (mode === "draft-saved") printDraft(draftExecution.recordDraftSaved(requiredOption("--customer-key"), requiredOption("--draft-id"), requiredOption("--url"), requiredOption("--evidence-id"), requiredOption("--command-id")));
  else if (mode === "draft-operator-block") printDraft(draftExecution.recordOperatorIntervention(option("--customer-key")?.trim() || null, requiredOption("--reason"), requiredOption("--next-action"), requiredOption("--evidence-id"), requiredOption("--command-id")));
  else if (mode === "draft-uncertain-page-decision") printDraft(draftExecution.recordUncertainPageSaveOperatorDecision(requiredOption("--customer-key"), requiredUncertainSaveDecision(), requiredOption("--operator-id"), requiredOption("--evidence-id"), requiredOption("--note"), requiredOption("--command-id")));
  else if (mode === "status") {
    const state = store.load();
    process.stdout.write(`${JSON.stringify({ supervisor: runtimeStore.load(), runner: supervise(state), readiness: readinessStore.snapshot(), adapter: adapterStore.snapshot() }, null, 2)}\n`);
  } else if (mode === "serve" || mode === "watch") {
    const port = Number(option("--port") ?? "4317");
    const intervalMs = Number(option("--interval-ms") ?? "5000");
    const supervisor = new LocalDashboardSupervisor(rootDirectory, { port, heartbeatIntervalMs: intervalMs, checkpointMode: option("--checkpoint-mode") as "resume" | "migrate" | undefined });
    const url = await supervisor.start();
    const executionLoop = new PersistentLocalDossierBatch(rootDirectory).createAutonomousLoop(`launch-agent-${process.pid}`, intervalMs);
    executionLoop.start();
    process.stdout.write(`DASHBOARD_URL=${url}\n`);
    process.stdout.write(`STATUS_API=${url}/api/status\n`);
    const shutdown = async (signal: string) => {
      executionLoop.stop();
      await supervisor.stop(`Stop pulito ricevuto: ${signal}.`);
      process.exitCode = 0;
    };
    process.once("SIGINT", () => { void shutdown("SIGINT"); });
    process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  } else throw new Error("Comando supervisore non valido. Usare: serve, status, once oppure draft-*.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${error instanceof SupervisorBusyError ? "SUPERVISOR_BUSY" : "SUPERVISOR_ERROR"}: ${message}\n`);
  process.exitCode = 1;
}
