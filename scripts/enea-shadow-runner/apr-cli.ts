import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PersistentLocalDossierPipeline, localDossierDashboardSnapshot } from "./localDossierPipeline";
import { PersistentLocalDossierBatch, type LocalDossierBatchInput } from "./localDossierBatch";
import { PersistentRuleMatrixEvidence } from "./ruleMatrixEvidence";
import { PersistentEneaRunner } from "./runner";
import { PersistentExecutionPlanStore } from "./executionPlan";
import { writeLocalDashboard } from "./dashboard";
import { PersistentAprCrmReadOnlyAdapter, type AprCrmBrowserBootstrapObservation } from "./crmReadOnlyAdapter";
import { VERIFIED_APR_CRM_READONLY_FIXTURE } from "./fixtures/aprCrmReadOnlyFixture";
import { PersistentReadinessLease } from "./readinessLease";
import { PersistentReadOnlyAdapter } from "./readOnlyAdapter";
import { inspectAprLocalRuntime } from "./aprRuntimeDoctor";
import { LocalDashboardSupervisor } from "./localDashboardServer";
import { PersistentAprPilotSample, type AprPilotCandidate, type AprPilotCandidateSource } from "./pilotSample";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";
import { PersistentAprOperatorUnlockRegistry } from "./operatorUnlockRegistry";

const args = process.argv.slice(2);
const command = args[0] ?? "status";
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const required = (name: string) => { const value = option(name); if (!value) throw new Error(`Opzione obbligatoria ${name}.`); return value; };
// I comandi interattivi storici usano --root; i LaunchAgent persistenti usano
// --state-dir. Sono alias dello stesso percorso e devono produrre lo stesso
// runtime, altrimenti un processo puo risultare vivo ma osservare lo stato errato.
const rootDirectory = path.resolve(option("--root") ?? option("--state-dir") ?? ".enea-shadow-runtime");
const refreshDashboard = () => {
  const runner = new PersistentEneaRunner(rootDirectory);
  try { return writeLocalDashboard(rootDirectory, runner.load(), new Date(), null, new PersistentReadinessLease(rootDirectory).snapshot(), new PersistentReadOnlyAdapter(rootDirectory).snapshot(),
    new PersistentExecutionPlanStore(rootDirectory).load(), localDossierDashboardSnapshot(rootDirectory),
    new PersistentLocalDossierBatch(rootDirectory).report(), new PersistentRuleMatrixEvidence(rootDirectory).snapshot(),
    new PersistentAprCrmReadOnlyAdapter(rootDirectory).snapshot(), new PersistentAprPilotSample(rootDirectory).snapshot(), undefined,
    new PersistentAprCrmAuth(rootDirectory).snapshot()); }
  catch { return null; }
};
const initializeAprLocal = () => {
  new PersistentEneaRunner(rootDirectory).initialize([]); new PersistentReadinessLease(rootDirectory).initialize(); new PersistentReadOnlyAdapter(rootDirectory).initialize();
  new PersistentAprPilotSample(rootDirectory).initialize();
  new PersistentAprCrmAuth(rootDirectory).initialize();
  new PersistentAprCrmIntegrationWorkflow(rootDirectory).initialize();
  new PersistentAprOperatorUnlockRegistry(rootDirectory).initialize();
  const crmAdapter = new PersistentAprCrmReadOnlyAdapter(rootDirectory);
  crmAdapter.configureFromFile(path.resolve(option("--crm-config") ?? "config/apr/crm-readonly-adapter.json"));
  const verified = crmAdapter.verifyFixture(VERIFIED_APR_CRM_READONLY_FIXTURE); refreshDashboard(); return verified;
};

try {
if (command === "dossier") {
  new PersistentEneaRunner(rootDirectory).initialize([]);
  const checkpoint = new PersistentLocalDossierPipeline(rootDirectory).runFromFile(required("--input"), required("--run-id"));
  refreshDashboard();
  process.stdout.write(`${JSON.stringify(checkpoint, null, 2)}\n`);
} else if (command === "batch") {
  new PersistentEneaRunner(rootDirectory).initialize([]);
  const manifestPath = path.resolve(required("--manifest"));
  const inputs = JSON.parse(readFileSync(manifestPath, "utf8")) as LocalDossierBatchInput[];
  const batch = new PersistentLocalDossierBatch(rootDirectory);
  let plan = batch.prepare(inputs, required("--batch-id"));
  if (plan?.status === "draft") plan = batch.arm();
  const executorId = option("--executor-id") ?? "apr-enea-local-executor";
  const maximumTicks = inputs.length + 2;
  for (let tick = 0; tick < maximumTicks && plan && plan.status !== "completed"; tick += 1) plan = await new PersistentLocalDossierBatch(rootDirectory).tick(executorId);
  refreshDashboard();
  process.stdout.write(`${JSON.stringify(new PersistentLocalDossierBatch(rootDirectory).report(), null, 2)}\n`);
} else if (command === "verify-rules") {
  throw new Error("verify-rules globale rimosso: ogni regola richiede una prova end-to-end specifica.");
} else if (command === "verify-rule") {
  throw new Error("verify-rule richiede ora una prova strutturata prodotta dal replay reale; il vecchio comando non e piu ammesso.");
} else if (command === "pilot-init") {
  new PersistentEneaRunner(rootDirectory).initialize([]);
  const checkpoint = new PersistentAprPilotSample(rootDirectory).initialize();
  refreshDashboard();
  process.stdout.write(`${JSON.stringify(checkpoint, null, 2)}\n`);
} else if (command === "pilot-select") {
  new PersistentEneaRunner(rootDirectory).initialize([]);
  const candidates = JSON.parse(readFileSync(path.resolve(required("--candidates")), "utf8")) as AprPilotCandidate[];
  const source = (option("--source") ?? "crm_readonly_adapter") as AprPilotCandidateSource;
  if (!["crm_readonly_adapter", "user_supplied_candidate_list"].includes(source)) throw new Error("Fonte candidati pilot non ammessa.");
  const checkpoint = new PersistentAprPilotSample(rootDirectory).select(candidates, required("--source-evidence-id"), new Date(), undefined, source);
  refreshDashboard();
  process.stdout.write(`${JSON.stringify(checkpoint, null, 2)}\n`);
} else if (command === "crm-bootstrap-record") {
  new PersistentEneaRunner(rootDirectory).initialize([]);
  const observation = JSON.parse(readFileSync(path.resolve(required("--observation")), "utf8")) as AprCrmBrowserBootstrapObservation;
  const checkpoint = new PersistentAprCrmReadOnlyAdapter(rootDirectory).recordBrowserBootstrapBlocked(observation);
  refreshDashboard();
  process.stdout.write(`${JSON.stringify(checkpoint, null, 2)}\n`);
} else if (command === "crm-auth-configure") {
  new PersistentEneaRunner(rootDirectory).initialize([]);
  const checkpoint = new PersistentAprCrmAuth(rootDirectory).configureFromPublicBundle(path.resolve(required("--public-bundle")));
  refreshDashboard();
  process.stdout.write(`${JSON.stringify({ ...checkpoint, publishableKey: undefined }, null, 2)}\n`);
} else if (command === "init") {
  const verified = initializeAprLocal();
  process.stdout.write(`${JSON.stringify({ name: "APR — Automazione PraticaRapida", initialized: true, crmReadOnlyAdapter: verified }, null, 2)}\n`);
} else if (command === "doctor") {
  process.stdout.write(`${JSON.stringify(inspectAprLocalRuntime(rootDirectory), null, 2)}\n`);
} else if (command === "crm-workflow-status") {
  process.stdout.write(`${JSON.stringify(new PersistentAprCrmIntegrationWorkflow(rootDirectory).snapshot(), null, 2)}\n`);
} else if (command === "crm-workflow-recover") {
  process.stdout.write(`${JSON.stringify(new PersistentAprCrmIntegrationWorkflow(rootDirectory).applyPending(), null, 2)}\n`);
} else if (command === "serve") {
  // Il dashboard e il suo heartbeat devono restare disponibili anche quando il
  // runtime operativo usa un adapter CRM reale read-only invece della fixture
  // locale. In un runtime gia inizializzato non sostituire mai i suoi checkpoint
  // con quelli della fixture: verifica soltanto i prerequisiti di osservabilita.
  if (!existsSync(path.join(rootDirectory, "HEAD"))) initializeAprLocal();
  const doctor = inspectAprLocalRuntime(rootDirectory);
  if (!doctor.readyForDashboard) throw new Error(`APR dashboard non avviabile: ${doctor.checks.filter((check) => ["state_directory", "journal", "dashboard_static"].includes(check.id) && !check.ok).map((check) => check.id).join(", ")}`);
  const port = Number(option("--port") ?? "4317"); const supervisor = new LocalDashboardSupervisor(rootDirectory, { port, heartbeatIntervalMs: Number(option("--interval-ms") ?? "5000"), checkpointMode: option("--checkpoint-mode") as "resume" | "migrate" | undefined, observerOnly: true });
  const url = await supervisor.start(); process.stdout.write(`APR_DASHBOARD_URL=${url}\nAPR_STATUS_API=${url}/api/status\nAPR_DOCTOR=ready_local_only\nEXTERNAL_ACTION_ALLOWED=false\n`);
  const shutdown = async (signal: string) => { await supervisor.stop(`Stop APR locale: ${signal}.`); process.exitCode = 0; };
  process.once("SIGINT", () => { void shutdown("SIGINT"); }); process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
} else if (command === "status") {
  const crmIntegrationWorkflow = new PersistentAprCrmIntegrationWorkflow(rootDirectory).snapshot();
  const operatorUnlocks = new PersistentAprOperatorUnlockRegistry(rootDirectory); operatorUnlocks.syncFromCrmWorkflow(crmIntegrationWorkflow);
  process.stdout.write(`${JSON.stringify({ name: "APR — Automazione PraticaRapida", module: "ENEA", batch: new PersistentLocalDossierBatch(rootDirectory).report(), pilotSample: new PersistentAprPilotSample(rootDirectory).snapshot(), rules: new PersistentRuleMatrixEvidence(rootDirectory).snapshot(), crmReadOnlyAdapter: new PersistentAprCrmReadOnlyAdapter(rootDirectory).snapshot(), crmIntegrationWorkflow, operatorUnlocks: operatorUnlocks.snapshot(), crmAuth: new PersistentAprCrmAuth(rootDirectory).snapshot() }, null, 2)}\n`);
} else throw new Error("Comando APR non riconosciuto: usare init, doctor, serve, dossier, batch, pilot-init, pilot-select, crm-bootstrap-record, crm-auth-configure, crm-workflow-status, crm-workflow-recover, verify-rules o status.");
} catch (error) {
  process.stderr.write(`APR_ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
