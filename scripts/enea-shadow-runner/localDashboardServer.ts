import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { renderDashboardHtml, writeLocalDashboard } from "./dashboard";
import { JournalStore } from "./journalStore";
import { PersistentEneaRunner } from "./runner";
import { PersistentReadinessLease } from "./readinessLease";
import { PersistentReadOnlyAdapter } from "./readOnlyAdapter";
import { PersistentExecutionPlanStore } from "./executionPlan";
import { localDossierDashboardSnapshot } from "./localDossierPipeline";
import { PersistentLocalDossierBatch } from "./localDossierBatch";
import { PersistentRuleMatrixEvidence } from "./ruleMatrixEvidence";
import { aprCrmIntegrationContractSnapshot } from "../../src/features/enea-shadow-crm/aprCrmIntegrationContract";
import { PersistentAprCrmReadOnlyAdapter } from "./crmReadOnlyAdapter";
import { PersistentAprPilotSample } from "./pilotSample";
import { PersistentAprLocalNotifications, type AprLocalNotificationSink } from "./localNotifications";
import { constantTimeTokenMatch, PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmAuthenticatedReadOnly } from "./crmAuthenticatedReadOnly";
import { PersistentAprCrmOriginalDocuments } from "./crmOriginalDocuments";
import { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import { PersistentAprEneaDraftExecution } from "./eneaDraftExecution";
import { PersistentAprEneaWorkerService } from "./aprEneaBrowserWorkerService";
import { PersistentAprWatchdog } from "./aprWatchdog";
import { PersistentAprOperatorQuestions, type OperatorAnswerValue } from "./operatorQuestions";
import { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";
import { PersistentAprCrmIncomingReadOnly } from "./crmIncomingReadOnly";
import { PersistentAprCrmLiveProcessing } from "./crmLiveProcessing";
import { deriveAprCaseStatusTruth, deriveAprInfissiBatchCaseStatusTruth, deriveAprInfissiMappingCaseStatusTruth, reconcileAprCaseTruthWithDraftExecution, type AprCaseStatusTruth } from "./caseStatusTruth";
import { PersistentAprShadowComparison } from "./shadowComparisonStore";
import { PersistentAprShadowControl } from "./shadowControl";
import { PersistentAprInfissiLocalMappingPreflight } from "./infissiLocalMappingPreflight";
import { PersistentAprInfissiBatchPreflight } from "./infissiBatchPreflight";
import { PersistentAprDeepCaseReview } from "./deepCaseReview";
import { infissiExecutionGateReady } from "./infissiExecutionGate";
import { APR_CASE_TRUTH_COMPARISON_VERSION, APR_CASE_TRUTH_COMPARISON_SUMMARY_VERSION, compareAprParallelCaseTruth, PersistentAprCaseTruthComparisonStore } from "./aprCaseTruthComparisonStore";
import { collectAprCurrentCaseObservations, type AprCurrentCaseObservationSources } from "./aprCaseObservationCollector";
import { resolveAprCaseStatusTruth } from "./aprCaseStatusResolver";
import { resolveAprCaseTruthMode, type AprCaseTruthMode } from "./aprCaseTruthMode";
import { supervise } from "./supervisor";
import {
  SupervisorRuntimeStore,
  type SupervisorRuntimeState,
} from "./supervisorRuntime";

export interface LocalDashboardSupervisorOptions {
  host?: "127.0.0.1";
  port?: number;
  heartbeatIntervalMs?: number;
  instanceId?: string;
  now?: () => Date;
  notificationSink?: AprLocalNotificationSink;
  crmAuth?: PersistentAprCrmAuth;
  caseTruthMode?: string;
  caseTruthComparisonScheduler?: (task: () => void) => void;
  checkpointMode?: AprCheckpointMode;
}

export type AprCheckpointMode = "resume" | "migrate";

export function resolveAprCheckpointMode(value: string | undefined): AprCheckpointMode {
  const normalized = value?.trim().toLowerCase() || "resume";
  if (normalized !== "resume" && normalized !== "migrate") throw new Error("apr_checkpoint_mode_invalid");
  return normalized;
}

export function shouldRunCheckpointMigration(mode: AprCheckpointMode) {
  return mode === "migrate";
}

interface AprCaseTruthRequestSnapshot {
  observedAt: string;
  runId: string;
  sources: AprCurrentCaseObservationSources;
}

export function shouldPollCrmIncoming(rootDirectory: string) {
  return !existsSync(path.join(path.resolve(rootDirectory), "cohort-seed", "checkpoint.json"));
}

export function shouldRunShadowIntake(rootDirectory: string, intakeAllowed: boolean) {
  // Il vecchio seed proteggeva le coorti storiche quando il polling era automatico.
  // Il nuovo gate esplicito e persistente sostituisce quell'auto-avvio: senza via
  // nessuna root interroga il CRM; dopo il via anche il runtime installato puo'
  // ricevere le nuove pratiche senza ricreare servizi o perdere lo storico.
  void rootDirectory;
  return intakeAllowed;
}

// Existing execution items are immutable historical records. A later validation
// revision may make additional cases eligible: append only the newly green cases
// with a deterministic command id, without replacing or duplicating prior work.
export function prepareEneaDraftExecutionIfAbsent(
  execution: PersistentAprEneaDraftExecution,
  preflight: Parameters<PersistentAprEneaDraftExecution["prepare"]>[0],
  now = new Date(),
  infissiBatch?: PersistentAprInfissiBatchPreflight,
) {
  const current = execution.snapshot(now);
  const infissi = infissiBatch?.snapshot(now);
  const infissiKeys = new Set(infissi?.items.map((item) => item.customerKey) ?? []);
  const commonOnly = infissiKeys.size > 0 ? { ...preflight, items: preflight.items.filter((item) => !infissiKeys.has(item.customerKey)) } : preflight;
  // Un esito Infissi intermedio non e' eseguibile: ogni revisione richiesta
  // deve essere presente prima che un pacchetto possa entrare nella coda mista.
  const packages = infissiBatch && infissi && infissiExecutionGateReady(infissi) && infissi.sourceFingerprint
    ? infissi.items.filter((item) => item.state === "ready_local_plan" && item.report?.eneaDraftPayload && item.report.blockers.length === 0)
      .map((item) => infissiBatch.buildDraftExecutionPackage(item.customerKey))
    : [];
  if (!current.sourceFingerprint) {
    const commonPrepared = execution.prepare(commonOnly, now);
    if (commonPrepared.sourceFingerprint) return packages.length && infissi?.sourceFingerprint
      ? execution.appendEligiblePackages(packages, infissi.sourceFingerprint, now)
      : commonPrepared;
    if (!infissi?.sourceFingerprint) return commonPrepared;
    return execution.preparePackages(packages, infissi.sourceFingerprint, now);
  }
  if (packages.length && infissi?.sourceFingerprint) execution.appendEligiblePackages(packages, infissi.sourceFingerprint, now);
  const validationRevision = preflight.validationRevisionsApplied?.at(-1);
  return validationRevision ? execution.appendNewEligibleFromValidation(commonOnly, validationRevision, now) : execution.snapshot(now);
}

function securityHeaders(response: ServerResponse, contentType: string) {
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  securityHeaders(response, "application/json; charset=utf-8");
  response.statusCode = status;
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function escapeHtml(value: unknown) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

function renderCrmAuthPage(csrfToken: string, status: ReturnType<PersistentAprCrmAuth["snapshot"]>, message?: string) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>APR · accesso CRM dedicato</title><style>
  :root{color-scheme:light;--navy:#16213d;--cyan:#18b6a4;--muted:#657089;--line:#d8deea;--paper:#f4f7fb}*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#eef4f9,#f8f6f1);color:var(--navy);font:15px/1.5 Inter,system-ui,-apple-system,sans-serif}.wrap{width:min(620px,calc(100% - 32px));margin:40px auto}.card{background:#fff;border-radius:20px;padding:28px;box-shadow:0 18px 55px #26364d1c}h1{margin:0 0 8px;font-size:30px}.sub{color:var(--muted);margin:0 0 22px}.status{padding:14px;border-radius:12px;background:var(--paper);margin:18px 0}.message{padding:12px;border:1px solid #b6ded8;border-radius:10px;background:#eefaf8}label{display:block;font-weight:800;margin:16px 0 6px}input{width:100%;border:1px solid var(--line);border-radius:10px;padding:12px;font:inherit}button{width:100%;border:0;border-radius:10px;padding:13px;margin-top:20px;background:var(--navy);color:#fff;font-weight:850;cursor:pointer}.fine{font-size:12px;color:var(--muted);margin-top:16px}.back{display:inline-block;margin-top:18px;color:var(--navy);font-weight:800;text-decoration:none}
  </style></head><body><main class="wrap"><section class="card"><p>APR · modulo ENEA</p><h1>Accesso CRM dedicato</h1><p class="sub">Inserisci personalmente le credenziali CRM. APR le invia soltanto al server di autenticazione PraticaRapida: la password non viene salvata; il refresh della sessione resta nel Portachiavi macOS.</p>${message ? `<p class="message">${escapeHtml(message)}</p>` : ""}<div class="status"><strong>Stato: ${escapeHtml(status.status)}</strong><br>${escapeHtml(status.reason)}<br><small>Account ${escapeHtml(status.accountEmailMasked ?? "non configurato")}</small></div><form method="post" action="/auth/crm/session" autocomplete="on"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><label for="email">Email CRM</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="320"><label for="password">Password CRM</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="4096"><button type="submit">Autentica APR</button></form><p class="fine">Nessun cookie o token viene letto da Chrome. Questo accesso non abilita modifiche CRM, ENEA, pipeline, invii o comunicazioni.</p><a class="back" href="/">← Torna alla dashboard APR</a></section></main></body></html>`;
}

async function readFormBody(request: IncomingMessage, maximumBytes = 16_384) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.length;
    if (total > maximumBytes) throw new Error("request_body_too_large");
    chunks.push(value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

export function localAuthRequestAllowed(request: Pick<IncomingMessage, "headers">, dashboardUrl: string | null) {
  if (!dashboardUrl) return false;
  const expected = new URL(dashboardUrl);
  if (request.headers.host !== expected.host) return false;
  const origin = request.headers.origin;
  if (origin === expected.origin) return true;
  const fetchSite = request.headers["sec-fetch-site"];
  return (origin === undefined || origin === "null") && fetchSite === "same-origin";
}

export class LocalDashboardSupervisor {
  readonly host: "127.0.0.1";
  readonly requestedPort: number;
  readonly heartbeatIntervalMs: number;
  readonly instanceId: string;
  readonly now: () => Date;
  readonly journal: JournalStore;
  readonly runtimeStore: SupervisorRuntimeStore;
  readonly readinessStore: PersistentReadinessLease;
  readonly adapterStore: PersistentReadOnlyAdapter;
  readonly crmReadOnlyAdapterStore: PersistentAprCrmReadOnlyAdapter;
  readonly pilotSampleStore: PersistentAprPilotSample;
  readonly notifications: PersistentAprLocalNotifications;
  readonly crmAuth: PersistentAprCrmAuth;
  readonly crmAcquisition: PersistentAprCrmAuthenticatedReadOnly;
  readonly crmDocuments: PersistentAprCrmOriginalDocuments;
  readonly crmDocumentAnalysis: PersistentAprCrmDocumentAnalysis;
  readonly crmLocalPreflight: PersistentAprCrmLocalPreflight;
  readonly eneaDraftExecution: PersistentAprEneaDraftExecution;
  readonly eneaBrowserWorker: PersistentAprEneaWorkerService;
  readonly watchdog: PersistentAprWatchdog;
  readonly operatorQuestions: PersistentAprOperatorQuestions;
  readonly crmIntegrationWorkflow: PersistentAprCrmIntegrationWorkflow;
  readonly crmIncomingReadOnly: PersistentAprCrmIncomingReadOnly;
  readonly crmLiveProcessing: PersistentAprCrmLiveProcessing;
  readonly shadowComparison: PersistentAprShadowComparison;
  readonly shadowControl: PersistentAprShadowControl;
  readonly infissiLocalMapping: PersistentAprInfissiLocalMappingPreflight;
  readonly infissiBatchPreflight: PersistentAprInfissiBatchPreflight;
  readonly deepCaseReview: PersistentAprDeepCaseReview;
  readonly caseTruthMode: AprCaseTruthMode;
  readonly checkpointMode: AprCheckpointMode;
  readonly caseTruthComparisonScheduler: (task: () => void) => void;
  private server: Server | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private runtime: SupervisorRuntimeState | null = null;
  private currentUrl: string | null = null;
  private csrfToken = crypto.randomUUID();
  private crmAuthRequestInFlight = false;
  private crmAuthRefreshInFlight = false;
  private crmAcquisitionInFlight = false;
  private crmDocumentsInFlight = false;
  private crmDocumentAnalysisInFlight = false;
  private crmIncomingReadOnlyInFlight = false;
  private crmLiveProcessingInFlight = false;

  constructor(readonly rootDirectory: string, options: LocalDashboardSupervisorOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.requestedPort = options.port ?? 4317;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000;
    if (!Number.isInteger(this.requestedPort) || this.requestedPort < 0 || this.requestedPort > 65_535) throw new Error("Porta supervisore non valida.");
    if (!Number.isFinite(this.heartbeatIntervalMs) || this.heartbeatIntervalMs < 100) throw new Error("Heartbeat supervisore minimo: 100 ms.");
    this.instanceId = options.instanceId ?? `supervisor-${process.pid}-${crypto.randomUUID()}`;
    this.now = options.now ?? (() => new Date());
    this.caseTruthMode = resolveAprCaseTruthMode(options.caseTruthMode ?? process.env.APR_CASE_TRUTH_MODE);
    this.checkpointMode = resolveAprCheckpointMode(options.checkpointMode ?? process.env.APR_CHECKPOINT_MODE);
    this.caseTruthComparisonScheduler = options.caseTruthComparisonScheduler ?? ((task) => setImmediate(task));
    this.journal = new JournalStore(rootDirectory);
    this.runtimeStore = new SupervisorRuntimeStore(rootDirectory);
    this.readinessStore = new PersistentReadinessLease(rootDirectory);
    this.adapterStore = new PersistentReadOnlyAdapter(rootDirectory);
    this.crmReadOnlyAdapterStore = new PersistentAprCrmReadOnlyAdapter(rootDirectory);
    this.pilotSampleStore = new PersistentAprPilotSample(rootDirectory);
    const testSink: AprLocalNotificationSink = { notify: async () => undefined };
    this.notifications = new PersistentAprLocalNotifications(rootDirectory, options.notificationSink ?? (process.env.NODE_ENV === "test" ? testSink : undefined));
    this.crmAuth = options.crmAuth ?? new PersistentAprCrmAuth(rootDirectory);
    this.crmAcquisition = new PersistentAprCrmAuthenticatedReadOnly(rootDirectory, this.crmAuth);
    this.crmDocuments = new PersistentAprCrmOriginalDocuments(rootDirectory, this.crmAuth);
    this.crmDocumentAnalysis = new PersistentAprCrmDocumentAnalysis(rootDirectory);
    this.crmLocalPreflight = new PersistentAprCrmLocalPreflight(rootDirectory, this.crmDocumentAnalysis);
    this.eneaDraftExecution = new PersistentAprEneaDraftExecution(rootDirectory);
    this.eneaBrowserWorker = new PersistentAprEneaWorkerService(rootDirectory);
    this.watchdog = new PersistentAprWatchdog(rootDirectory, { instanceId: "dashboard-readonly-watchdog", processPid: process.pid, now: this.now });
    this.operatorQuestions = new PersistentAprOperatorQuestions(rootDirectory);
    this.crmIntegrationWorkflow = new PersistentAprCrmIntegrationWorkflow(rootDirectory);
    this.crmIncomingReadOnly = new PersistentAprCrmIncomingReadOnly(rootDirectory, this.crmAuth, this.crmIntegrationWorkflow);
    this.crmLiveProcessing = new PersistentAprCrmLiveProcessing(rootDirectory, this.crmIncomingReadOnly, this.crmAuth);
    this.shadowComparison = new PersistentAprShadowComparison(rootDirectory);
    this.shadowControl = new PersistentAprShadowControl(rootDirectory);
    this.infissiLocalMapping = new PersistentAprInfissiLocalMappingPreflight(rootDirectory);
    this.infissiBatchPreflight = new PersistentAprInfissiBatchPreflight(rootDirectory);
    this.deepCaseReview = new PersistentAprDeepCaseReview(rootDirectory);
  }

  private captureCaseTruthRequestSnapshot(): AprCaseTruthRequestSnapshot {
    const capturedAt = this.now();
    return {
      observedAt: capturedAt.toISOString(),
      runId: `dashboard-${crypto.randomUUID()}`,
      sources: {
        common: this.crmLocalPreflight.snapshot(capturedAt),
        infissiBatch: this.infissiBatchPreflight.snapshot(capturedAt),
        infissiMapping: this.infissiLocalMapping.load(capturedAt),
        deepReview: this.deepCaseReview.snapshot(capturedAt),
        execution: this.eneaDraftExecution.snapshot(capturedAt),
      },
    };
  }

  private legacyCaseTruth(customerKey: string, captured: AprCaseTruthRequestSnapshot): AprCaseStatusTruth | null {
    const item = captured.sources.common.items.find((candidate) => candidate.customerKey === customerKey);
    const infissiBatchItem = captured.sources.infissiBatch.items.find((candidate) => candidate.customerKey === customerKey);
    const infissiTruth = deriveAprInfissiMappingCaseStatusTruth(captured.sources.infissiMapping);
    if (!item && !infissiBatchItem && infissiTruth?.customerKey !== customerKey) return null;
    const preflightTruth = infissiBatchItem
      ? deriveAprInfissiBatchCaseStatusTruth(infissiBatchItem)
      : infissiTruth?.customerKey === customerKey
        ? infissiTruth
        : deriveAprCaseStatusTruth(item!);
    const executionItem = captured.sources.execution.items.find((candidate) => candidate.customerKey === customerKey);
    return reconcileAprCaseTruthWithDraftExecution(preflightTruth, executionItem);
  }

  private unifiedCaseTruth(customerKey: string, captured: AprCaseTruthRequestSnapshot) {
    const collected = collectAprCurrentCaseObservations({ customerKey, observedAt: captured.observedAt, runId: captured.runId, sources: captured.sources });
    return { truth: resolveAprCaseStatusTruth(collected.observations), collected };
  }

  private scheduleCaseTruthComparison(customerKey: string, legacyTruth: AprCaseStatusTruth, captured: AprCaseTruthRequestSnapshot, preparedUnified?: ReturnType<LocalDashboardSupervisor["unifiedCaseTruth"]>) {
    this.caseTruthComparisonScheduler(() => {
      const store = new PersistentAprCaseTruthComparisonStore(this.rootDirectory);
      try {
        const unified = preparedUnified ?? this.unifiedCaseTruth(customerKey, captured);
        store.persist(compareAprParallelCaseTruth({ oldTruth: legacyTruth, collected: unified.collected, now: this.now() }));
      } catch (error) {
        store.persistSecondaryFailure({ customerKey, activeMode: this.caseTruthMode, failedMode: this.caseTruthMode === "legacy" ? "unified" : "legacy", at: this.now().toISOString(), reason: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  get url() { return this.currentUrl; }
  get runtimeState() { return this.runtime; }

  private synchronizeCrmReadOnlyEvidence(now: Date) {
    const acquisition = this.crmAcquisition.snapshot(now);
    const auth = this.crmAuth.snapshot(now);
    if (acquisition.status !== "completed" || auth.status !== "authenticated" || acquisition.progress.acquired < 1 || !acquisition.candidateFingerprint) return;
    this.crmReadOnlyAdapterStore.recordAuthenticatedReadOnly({
      observedAt: acquisition.lastEvent.at,
      origin: "https://xmkjrhwmmuzaqjqlvzxm.supabase.co",
      candidateFingerprint: acquisition.candidateFingerprint,
      acquiredCount: acquisition.progress.acquired,
      blockedCount: acquisition.progress.blocked,
      dossierEvidence: acquisition.items.filter((item) => item.state === "acquired" && item.responseSha256).map((item) => ({ customerKey: item.customerKey, responseSha256: item.responseSha256! })),
    }, now);
  }

  private livePayload() {
    const state = this.journal.load();
    const snapshot = supervise(state, this.now());
    const readiness = this.readinessStore.snapshot(this.now());
    const adapter = this.adapterStore.snapshot(this.now());
    const executionPlan = new PersistentExecutionPlanStore(this.rootDirectory).load();
    const localDossier = localDossierDashboardSnapshot(this.rootDirectory);
    const batchReport = new PersistentLocalDossierBatch(this.rootDirectory).report();
    const ruleMatrix = new PersistentRuleMatrixEvidence(this.rootDirectory).snapshot();
    const crmReadOnlyAdapter = this.crmReadOnlyAdapterStore.snapshot(this.now());
    const pilotSample = this.pilotSampleStore.snapshot(this.now());
    const notifications = this.notifications.snapshot();
    const crmAuth = this.crmAuth.snapshot(this.now());
    const crmAcquisition = this.crmAcquisition.snapshot(this.now());
    const crmDocuments = this.crmDocuments.snapshot(this.now());
    const crmDocumentAnalysis = this.crmDocumentAnalysis.snapshot(this.now());
    const crmLocalPreflight = this.crmLocalPreflight.snapshot(this.now());
    const eneaDraftExecution = this.eneaDraftExecution.snapshot(this.now());
    const eneaBrowserWorker = this.eneaBrowserWorker.snapshot(this.now());
    const watchdog = this.watchdog.load(this.now());
    return {
      supervisor: this.runtime,
      runner: snapshot,
      readiness,
      adapter,
      executionPlan,
      localDossier,
      batchReport,
      ruleMatrix,
      crmIntegration: aprCrmIntegrationContractSnapshot(),
      crmReadOnlyAdapter,
      pilotSample,
      notifications,
      crmAuth,
      crmAcquisition,
      crmDocuments,
      crmDocumentAnalysis,
      crmLocalPreflight,
      eneaDraftExecution,
      eneaBrowserWorker,
      watchdog,
      operatorQuestions: this.operatorQuestions.snapshot(this.now()),
      crmIntegrationWorkflow: this.crmIntegrationWorkflow.snapshot(this.now()),
      crmIncomingReadOnly: this.crmIncomingReadOnly.snapshot(this.now()),
      crmLiveProcessing: this.crmLiveProcessing.snapshot(this.now()),
      shadowComparison: this.shadowComparison.snapshot(this.now()),
      shadowControl: this.shadowControl.snapshot(this.now()),
      infissiLocalMapping: this.infissiLocalMapping.snapshot(this.now()),
      infissiBatchPreflight: this.infissiBatchPreflight.snapshot(this.now()),
      deepCaseReview: this.deepCaseReview.snapshot(this.now()),
      crmLocalDraftPackages: this.crmLiveProcessing.draftPackages.snapshot(this.now()),
      crmLocalDraftHandoff: this.crmLiveProcessing.draftHandoff.snapshot(this.now()),
      crmLocalExecutorIntake: this.crmLiveProcessing.executorIntake.snapshot(this.now()),
      crmLocalCohortExecutionPlan: this.crmLiveProcessing.cohortExecutionPlan.snapshot(this.now()),
      aprGateOrchestrator: this.crmLiveProcessing.gateOrchestrator.snapshot(this.now()),
      aprEneaReadinessAdmission: this.crmLiveProcessing.eneaReadinessAdmission.snapshot(this.now()),
      aprEneaReadOnlyDiscovery: this.crmLiveProcessing.eneaReadOnlyDiscovery.snapshot(this.now()),
      aprEneaRealReadOnlyAttach: this.crmLiveProcessing.eneaRealReadOnlyAttach.snapshot(this.now()),
      queue: {
        total: state.queue.length,
        currentPracticeId: state.runner.currentPracticeId,
        states: state.queue.reduce<Record<string, number>>((result, job) => {
          result[job.executionState] = (result[job.executionState] ?? 0) + 1;
          return result;
        }, {}),
        workflows: state.queue.filter((job) => job.workflowTiming).map((job) => ({ practiceId: job.practice.id, displayName: job.practice.displayName, executionState: job.executionState, timing: job.workflowTiming })),
      },
    };
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse) {
    const requestUrl = new URL(request.url ?? "/", this.currentUrl ?? "http://127.0.0.1");
    if (request.method === "POST" && requestUrl.pathname === "/auth/crm/session") {
      if (!localAuthRequestAllowed(request, this.currentUrl)) { sendJson(response, 403, { error: "origin_rejected" }); return; }
      if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) { sendJson(response, 415, { error: "content_type_rejected" }); return; }
      if (this.crmAuthRequestInFlight) { sendJson(response, 429, { error: "authentication_in_progress" }); return; }
      this.crmAuthRequestInFlight = true;
      try {
        const form = await readFormBody(request);
        if (!constantTimeTokenMatch(form.get("csrf") ?? "", this.csrfToken)) { sendJson(response, 403, { error: "csrf_rejected" }); return; }
        await this.crmAuth.authenticate(form.get("email") ?? "", form.get("password") ?? "", this.now());
        this.csrfToken = crypto.randomUUID();
        securityHeaders(response, "text/html; charset=utf-8");
        response.statusCode = 200;
        response.end(renderCrmAuthPage(this.csrfToken, this.crmAuth.snapshot(this.now()), "Accesso verificato dal server. La sessione APR è ora custodita nel Portachiavi macOS."));
      } catch {
        this.csrfToken = crypto.randomUUID();
        securityHeaders(response, "text/html; charset=utf-8");
        response.statusCode = 401;
        response.end(renderCrmAuthPage(this.csrfToken, this.crmAuth.snapshot(this.now()), "Accesso non riuscito. Verifica email e password; nessun dato è stato salvato."));
      } finally { this.crmAuthRequestInFlight = false; }
      return;
    }
    if (request.method === "POST" && ["/shadow/control/start", "/shadow/control/pause"].includes(requestUrl.pathname)) {
      if (!localAuthRequestAllowed(request, this.currentUrl)) { sendJson(response, 403, { error: "origin_rejected" }); return; }
      if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) { sendJson(response, 415, { error: "content_type_rejected" }); return; }
      try {
        const form = await readFormBody(request);
        if (!constantTimeTokenMatch(form.get("csrf") ?? "", this.csrfToken)) { sendJson(response, 403, { error: "csrf_rejected" }); return; }
        const action = requestUrl.pathname.endsWith("start") ? "start" : "pause";
        const commandId = `dashboard:${action}:${crypto.randomUUID()}`;
        if (action === "start") this.shadowControl.arm(commandId, this.now());
        else this.shadowControl.pause(commandId, this.now());
        this.csrfToken = crypto.randomUUID();
        response.statusCode = 303; response.setHeader("Location", "/#apr-shadow-control-center"); response.end();
      } catch (error) { sendJson(response, 409, { error: "shadow_control_rejected", reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    const operatorAnswerMatch = requestUrl.pathname.match(/^\/operator\/questions\/([^/]+)\/answer$/);
    if (request.method === "POST" && operatorAnswerMatch) {
      if (!localAuthRequestAllowed(request, this.currentUrl)) { sendJson(response, 403, { error: "origin_rejected" }); return; }
      if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) { sendJson(response, 415, { error: "content_type_rejected" }); return; }
      try {
        const form = await readFormBody(request);
        if (!constantTimeTokenMatch(form.get("csrf") ?? "", this.csrfToken)) { sendJson(response, 403, { error: "csrf_rejected" }); return; }
        const questionId = decodeURIComponent(operatorAnswerMatch[1]);
        const value = form.get("answer") as OperatorAnswerValue;
        const commandId = `dashboard-answer:${questionId}:${crypto.randomUUID()}`;
        const now = this.now();
        let questions = this.operatorQuestions.answer(questionId, value, form.get("note") ?? "", "dashboard-local-operator", commandId, now);
        const question = questions.questions.find((item) => item.id === questionId)!;
        if (value !== "cannot_determine") {
          this.crmLocalPreflight.applyOperatorMeasurementResolution({ questionId, customerKey: question.customerKey, sourceId: question.sourceIds[0], description: question.payload.description, rawWidth: question.payload.rawWidth, rawHeight: question.payload.rawHeight, unit: value, note: question.answer?.note ?? "", operatorId: question.answer?.operatorId ?? "dashboard-local-operator", commandId, answeredAt: question.answer?.answeredAt ?? now.toISOString() }, now);
          questions = this.operatorQuestions.markApplied(questionId, now);
        }
        this.csrfToken = crypto.randomUUID();
        response.statusCode = 303; response.setHeader("Location", "/#operator-questions"); response.end();
      } catch (error) { sendJson(response, 409, { error: "operator_answer_rejected", reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    const crmWorkflowAnswerMatch = requestUrl.pathname.match(/^\/crm\/integration\/([^/]+)\/answer$/);
    if (request.method === "POST" && crmWorkflowAnswerMatch) {
      if (!localAuthRequestAllowed(request, this.currentUrl)) { sendJson(response, 403, { error: "origin_rejected" }); return; }
      if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) { sendJson(response, 415, { error: "content_type_rejected" }); return; }
      try {
        const form = await readFormBody(request);
        if (!constantTimeTokenMatch(form.get("csrf") ?? "", this.csrfToken)) { sendJson(response, 403, { error: "csrf_rejected" }); return; }
        const practiceId = decodeURIComponent(crmWorkflowAnswerMatch[1]);
        const snapshot = this.crmIntegrationWorkflow.snapshot(this.now());
        const item = snapshot.items.find((candidate) => candidate.event.practiceId === practiceId);
        if (!item?.operatorRequest) throw new Error("crm_workflow_operator_request_not_found");
        const answer = (form.get("answer") ?? "").trim();
        if (!answer || (item.operatorRequest.choices.length && !item.operatorRequest.choices.some((choice) => choice.value === answer))) throw new Error("crm_workflow_operator_answer_invalid");
        const now = this.now();
        this.crmIntegrationWorkflow.answerOperator(practiceId, {
          requestId: item.operatorRequest.requestId,
          commandId: `dashboard-crm-answer:${practiceId}:${crypto.randomUUID()}`,
          answer,
          note: (form.get("note") ?? "").trim().slice(0, 500),
          operatorId: "dashboard-local-operator",
          answeredAt: now.toISOString(),
        }, now);
        this.csrfToken = crypto.randomUUID();
        response.statusCode = 303; response.setHeader("Location", "/#crm-integration-workflow"); response.end();
      } catch (error) { sendJson(response, 409, { error: "crm_workflow_operator_answer_rejected", reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }
    try {
      if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
        const state = this.journal.load();
        securityHeaders(response, "text/html; charset=utf-8");
        response.statusCode = 200;
        response.end(request.method === "HEAD" ? undefined : renderDashboardHtml(state, this.now(), this.runtime, null, this.readinessStore.snapshot(this.now()), this.adapterStore.snapshot(this.now()), new PersistentExecutionPlanStore(this.rootDirectory).load(), localDossierDashboardSnapshot(this.rootDirectory), new PersistentLocalDossierBatch(this.rootDirectory).report(), new PersistentRuleMatrixEvidence(this.rootDirectory).snapshot(), this.crmReadOnlyAdapterStore.snapshot(this.now()), this.pilotSampleStore.snapshot(this.now()), this.notifications.snapshot(), this.crmAuth.snapshot(this.now()), this.crmAcquisition.snapshot(this.now()), this.crmDocuments.snapshot(this.now()), this.crmDocumentAnalysis.snapshot(this.now()), this.crmLocalPreflight.snapshot(this.now()), this.eneaDraftExecution.snapshot(this.now()), this.eneaBrowserWorker.snapshot(this.now()), this.watchdog.load(this.now()), this.operatorQuestions.snapshot(this.now()), this.csrfToken, this.crmIntegrationWorkflow.snapshot(this.now()), this.crmIncomingReadOnly.snapshot(this.now()), this.crmLiveProcessing.snapshot(this.now()), this.shadowComparison.snapshot(this.now()), this.shadowControl.snapshot(this.now()), this.infissiLocalMapping.snapshot(this.now()), this.infissiBatchPreflight.snapshot(this.now()), this.deepCaseReview.snapshot(this.now())));
      } else if (requestUrl.pathname === "/auth/crm") {
        securityHeaders(response, "text/html; charset=utf-8");
        response.statusCode = 200;
        response.end(request.method === "HEAD" ? undefined : renderCrmAuthPage(this.csrfToken, this.crmAuth.snapshot(this.now())));
      } else if (requestUrl.pathname === "/api/status") {
        sendJson(response, 200, this.livePayload());
      } else if (requestUrl.pathname === "/api/readiness") {
        sendJson(response, 200, this.readinessStore.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/adapter") {
        sendJson(response, 200, this.adapterStore.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/execution-plan") {
        sendJson(response, 200, new PersistentExecutionPlanStore(this.rootDirectory).load() ?? { status: "absent", bridgeRequired: false });
      } else if (requestUrl.pathname === "/api/local-dossier") {
        sendJson(response, 200, localDossierDashboardSnapshot(this.rootDirectory) ?? { status: "absent" });
      } else if (requestUrl.pathname === "/api/batch") {
        sendJson(response, 200, new PersistentLocalDossierBatch(this.rootDirectory).report() ?? { status: "absent" });
      } else if (requestUrl.pathname === "/api/rule-matrix") {
        sendJson(response, 200, new PersistentRuleMatrixEvidence(this.rootDirectory).snapshot());
      } else if (requestUrl.pathname === "/api/crm-integration-contract") {
        sendJson(response, 200, aprCrmIntegrationContractSnapshot());
      } else if (requestUrl.pathname === "/api/crm-readonly-adapter") {
        sendJson(response, 200, this.crmReadOnlyAdapterStore.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/pilot-sample") {
        sendJson(response, 200, this.pilotSampleStore.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/notifications") {
        sendJson(response, 200, this.notifications.snapshot());
      } else if (requestUrl.pathname === "/api/crm-auth") {
        sendJson(response, 200, this.crmAuth.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-acquisition") {
        sendJson(response, 200, this.crmAcquisition.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-original-documents") {
        sendJson(response, 200, this.crmDocuments.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-document-analysis") {
        sendJson(response, 200, this.crmDocumentAnalysis.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-local-preflight") {
        sendJson(response, 200, this.crmLocalPreflight.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/case-truth") {
        const customerKey = requestUrl.searchParams.get("customerKey")?.trim() ?? "";
        const captured = customerKey ? this.captureCaseTruthRequestSnapshot() : null;
        const legacyTruth = captured ? this.legacyCaseTruth(customerKey, captured) : null;
        if (!legacyTruth) sendJson(response, 404, { error: "case_not_found" });
        else if (this.caseTruthMode === "legacy") {
          sendJson(response, 200, legacyTruth);
          this.scheduleCaseTruthComparison(customerKey, legacyTruth, captured!);
        } else {
          const unified = this.unifiedCaseTruth(customerKey, captured!);
          sendJson(response, 200, unified.truth);
          this.scheduleCaseTruthComparison(customerKey, legacyTruth, captured!, unified);
        }
      } else if (requestUrl.pathname === "/api/case-truth-comparison") {
        const store = new PersistentAprCaseTruthComparisonStore(this.rootDirectory);
        const artifactId = requestUrl.searchParams.get("artifactId")?.trim() ?? "";
        const customerKey = requestUrl.searchParams.get("customerKey")?.trim() ?? "";
        if (artifactId) {
          if (!/^[a-f0-9]{64}$/.test(artifactId)) sendJson(response, 400, { error: "artifact_id_invalid" });
          else {
            const comparison = store.list().find((item) => item.artifactId === artifactId);
            if (!comparison) sendJson(response, 404, { error: "comparison_not_found" });
            else sendJson(response, 200, comparison);
          }
        } else sendJson(response, 200, { version: APR_CASE_TRUTH_COMPARISON_VERSION, items: store.list(customerKey || undefined) });
      } else if (requestUrl.pathname === "/api/case-truth-comparison-summary") {
        const store = new PersistentAprCaseTruthComparisonStore(this.rootDirectory);
        const customerKey = requestUrl.searchParams.get("customerKey")?.trim() ?? "";
        sendJson(response, 200, { ...store.summary(customerKey || undefined), version: APR_CASE_TRUTH_COMPARISON_SUMMARY_VERSION });
      } else if (requestUrl.pathname === "/api/infissi-local-mapping") {
        sendJson(response, 200, this.infissiLocalMapping.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/infissi-batch-preflight") {
        sendJson(response, 200, this.infissiBatchPreflight.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/deep-case-review") {
        sendJson(response, 200, this.deepCaseReview.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/enea-draft-execution") {
        sendJson(response, 200, this.eneaDraftExecution.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/enea-browser-worker") {
        sendJson(response, 200, this.eneaBrowserWorker.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/watchdog") {
        sendJson(response, 200, this.watchdog.load(this.now()));
      } else if (requestUrl.pathname === "/api/operator-questions") {
        sendJson(response, 200, this.operatorQuestions.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-integration-workflow") {
        sendJson(response, 200, this.crmIntegrationWorkflow.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-incoming-readonly") {
        sendJson(response, 200, this.crmIncomingReadOnly.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-live-processing") {
        sendJson(response, 200, this.crmLiveProcessing.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/shadow-comparison") {
        sendJson(response, 200, this.shadowComparison.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/shadow-control") {
        sendJson(response, 200, this.shadowControl.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-local-draft-packages") {
        sendJson(response, 200, this.crmLiveProcessing.draftPackages.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-local-draft-handoff") {
        sendJson(response, 200, this.crmLiveProcessing.draftHandoff.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-local-executor-intake") {
        sendJson(response, 200, this.crmLiveProcessing.executorIntake.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/crm-local-cohort-execution-plan") {
        sendJson(response, 200, this.crmLiveProcessing.cohortExecutionPlan.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/apr-gate-orchestrator") {
        sendJson(response, 200, this.crmLiveProcessing.gateOrchestrator.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/apr-enea-readiness-admission") {
        sendJson(response, 200, this.crmLiveProcessing.eneaReadinessAdmission.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/apr-enea-readonly-discovery") {
        sendJson(response, 200, this.crmLiveProcessing.eneaReadOnlyDiscovery.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/apr-enea-real-readonly-attach") {
        sendJson(response, 200, this.crmLiveProcessing.eneaRealReadOnlyAttach.snapshot(this.now()));
      } else if (requestUrl.pathname === "/api/audit") {
        const state = this.journal.load();
        const requestedLimit = Number(requestUrl.searchParams.get("limit") ?? "50");
        const limit = Number.isFinite(requestedLimit) ? Math.min(200, Math.max(1, Math.trunc(requestedLimit))) : 50;
        sendJson(response, 200, { revision: state.revision, events: state.audit.slice(-limit) });
      } else if (requestUrl.pathname === "/healthz") {
        sendJson(response, 200, { supervisor: "running", instanceId: this.instanceId, heartbeatAt: this.runtime?.heartbeatAt ?? null, readinessLease: this.readinessStore.snapshot(this.now()).leaseState, readOnlyAdapter: this.adapterStore.snapshot(this.now()).status, crmReadOnlyAdapter: this.crmReadOnlyAdapterStore.snapshot(this.now()).status, crmIntegrationWorkflow: this.crmIntegrationWorkflow.snapshot(this.now()).status, crmIncomingReadOnly: this.crmIncomingReadOnly.snapshot(this.now()).status, crmLiveProcessing: this.crmLiveProcessing.snapshot(this.now()).status, shadowComparison: this.shadowComparison.snapshot(this.now()).status, shadowPhase: this.shadowComparison.snapshot(this.now()).currentPhase, shadowControl: this.shadowControl.snapshot(this.now()).status, shadowIntakeAllowed: this.shadowControl.snapshot(this.now()).intakeAllowed, productionAuthorized: false, crmLocalDraftPackages: this.crmLiveProcessing.draftPackages.snapshot(this.now()).status, crmLocalDraftHandoff: this.crmLiveProcessing.draftHandoff.snapshot(this.now()).status, crmLocalExecutorIntake: this.crmLiveProcessing.executorIntake.snapshot(this.now()).status, crmLocalCohortExecutionPlan: this.crmLiveProcessing.cohortExecutionPlan.snapshot(this.now()).status, aprGateOrchestrator: this.crmLiveProcessing.gateOrchestrator.snapshot(this.now()).status, aprEneaReadinessAdmission: this.crmLiveProcessing.eneaReadinessAdmission.snapshot(this.now()).status, aprEneaReadOnlyDiscovery: this.crmLiveProcessing.eneaReadOnlyDiscovery.snapshot(this.now()).status, aprEneaRealReadOnlyAttach: this.crmLiveProcessing.eneaRealReadOnlyAttach.snapshot(this.now()).status, crmAuth: this.crmAuth.snapshot(this.now()).status, crmAcquisition: this.crmAcquisition.snapshot(this.now()).status, crmDocuments: this.crmDocuments.snapshot(this.now()).status, crmDocumentAnalysis: this.crmDocumentAnalysis.snapshot(this.now()).status, crmLocalPreflight: this.crmLocalPreflight.snapshot(this.now()).status, deepCaseReview: this.deepCaseReview.snapshot(this.now()).status, eneaDraftExecution: this.eneaDraftExecution.snapshot(this.now()).status, eneaBrowserWorker: this.eneaBrowserWorker.snapshot(this.now()).service.status, watchdog: this.watchdog.load(this.now()).status, operatorQuestions: this.operatorQuestions.snapshot(this.now()).openCount, pilotSample: this.pilotSampleStore.snapshot(this.now()).status, notifications: this.notifications.snapshot().deliveryMode, codexRequiredForNotification: false, externalActionAllowed: false, eneaDraftCapability: "create_fill_save_only" });
      } else if (requestUrl.pathname === "/favicon.ico") {
        response.statusCode = 204;
        response.end();
      } else sendJson(response, 404, { error: "not_found" });
    } catch (error) {
      sendJson(response, 503, { error: "checkpoint_unavailable", reason: error instanceof Error ? error.message : String(error) });
    }
  }

  private pulse() {
    const state = this.journal.load();
    const now = this.now();
    this.shadowComparison.runScheduledDailyReport(now);
    this.readinessStore.expireIfNeeded(now);
    const snapshot = supervise(state, now);
    this.runtime = this.runtimeStore.heartbeat(this.instanceId, state.revision, snapshot.health, now);
    const executionPlan = new PersistentExecutionPlanStore(this.rootDirectory).load();
    const pilotSample = this.pilotSampleStore.snapshot(now);
    if (pilotSample.status === "selected") {
      this.crmAcquisition.prepare(pilotSample.selected, pilotSample.candidateFingerprint!, now);
      this.crmAcquisition.applyTransportRepair("crm-select-remove-unexposed-data-fine-lavori-v2", "8b1f43142e2491d0f4a0020c3ae634ab664255590e935be68dc79f714f6ee94c", now);
    }
    this.crmAcquisition.applyRecordedOperatorResolutions(now);
    const acquired = this.crmAcquisition.snapshot(now);
    if (acquired.status === "completed" && acquired.progress.acquired > 0) {
      const dossierInputs = acquired.items.filter((item) => item.state === "acquired" && item.practiceId && item.dossierPath)
        .map((item) => ({ customerKey: item.customerKey, practiceId: item.practiceId!, dossierPath: item.dossierPath! }));
      const documentsBefore = this.crmDocuments.snapshot(now);
      if (!documentsBefore.sourceSetFingerprint) this.crmDocuments.prepare(dossierInputs, now);
      else if (documentsBefore.status === "completed") this.crmDocuments.extendAfterAcquisitionCorrection(dossierInputs, now);
    }
    const documents = this.crmDocuments.snapshot(now);
    if (documents.status === "completed" && documents.progress.downloaded > 0 && documents.sourceSetFingerprint) {
      const analysisInputs = documents.items.filter((item) => item.state === "downloaded" && item.localPath && item.responseSha256)
        .map((item) => ({ documentKey: item.documentKey, customerKey: item.customerKey, kind: item.kind, localPath: item.localPath!, responseSha256: item.responseSha256! }));
      const analysisBefore = this.crmDocumentAnalysis.snapshot(now);
      if (!analysisBefore.sourceFingerprint) this.crmDocumentAnalysis.prepare(analysisInputs, documents.sourceSetFingerprint, now);
      else if (analysisBefore.status === "completed") this.crmDocumentAnalysis.extendAfterDocumentCorrection(analysisInputs, documents.sourceSetFingerprint, now);
    }
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v3-ciotta-and-historical-exclusion", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v4-embedded-copy-deduplication", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v5-rinaldi-ghitti-identity", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v6-parolo-desando-formats", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v7-split-header-document-identity", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v8-rinaldi-galbiati-identity-totals", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v9-cohort39-vendor-measures", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v10-multipage-invoice-segmentation", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v11-invoice-reference-and-date", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v12-vans-grouped-products", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v13-vepa-recognition", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v14-multipage-vat-inclusive-total", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v15-narrative-product-groups", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v16-suman-vans-bank-transfer", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v17-lm-tende-motorized-zanzariera", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v25-vans-awning-missing-gtot", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v26-zanzasol-description-after-price", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v28-lm-tende-multi-product-balance", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v29-odhaus-avvolgibili-supporting-declaration", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v30-explicit-surface-and-lm-cardinality", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v31-rinaldi-sp-dot-and-vat-layout", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v32-infissi-vertical-totals-and-table-identity", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v33-header-identity-over-body-reference", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyAnalyzerRepair("pdf-analyzer-cohort-path-v1", now);
    if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyTechnicalPerformanceDiagramOcrRepair("infissi-performance-diagram-ocr-v2", now);
    const analyzed = this.crmDocumentAnalysis.snapshot(now);
    if (acquired.status === "completed" && acquired.progress.acquired > 0 && analyzed.status === "completed" && analyzed.sourceFingerprint) {
      const preflightFingerprint = createHash("sha256").update(JSON.stringify({ candidateFingerprint: acquired.candidateFingerprint, sourceFingerprint: analyzed.sourceFingerprint, parserRevisionsApplied: analyzed.parserRevisionsApplied })).digest("hex");
      const acquiredItems = acquired.items.filter((item) => item.state === "acquired");
      const preflightBefore = this.crmLocalPreflight.snapshot(now);
      if (!preflightBefore.sourceFingerprint) this.crmLocalPreflight.prepare(acquiredItems, preflightFingerprint, now);
      else if (preflightBefore.sourceFingerprint !== preflightFingerprint && this.eneaDraftExecution.snapshot(now).items.length === 0) this.crmLocalPreflight.applySourceRevision(acquiredItems, preflightFingerprint, `source-set-${preflightFingerprint.slice(0, 16)}`, now);
      this.crmLocalPreflight.tick(now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("form-group-product-inheritance-v1", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("full-enea-payload-audit-v1", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("authorized-gtot-payload-provenance-v2", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("test-draft-payload-gate-v3", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("italian-province-label-normalization-v4", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("test-draft-portal-workflow-gate-v5", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("analysis-results-after-local-repair-v6", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("financial-signed-rinaldi-rows-v7", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("financial-vendor-total-labels-v8", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("financial-rinaldi-galbiati-v9", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("missing-invoice-default-unit-bank-transfer-v10", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("invoice-reference-date-v11", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("financial-total-from-unique-invoices-v12", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("payment-rounding-third-evidence-v13", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("worker-validator-ownership-v14", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("invoice-type-over-form-group-v15", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("vepa-deferred-current-phase-v16", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("vat-inclusive-multipage-total-v17", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("distinct-invoice-numbers-same-customer-sum-v18", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("narrative-product-groups-v19", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("invoice-family-over-form-cardinality-v20", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("secondary-home-36-percent-allocation-v21", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("linea-sole-potito-paper-form-fallbacks-v22", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("multipage-bank-transfer-classification-v23", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("lm-tende-motorized-zanzariera-v24", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("vans-awning-missing-gtot-v25", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("zanzasol-description-after-price-v26", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("zanzasol-intervention-reconciliation-v27", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("lm-tende-multi-product-balance-v28", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("odhaus-avvolgibili-supporting-declaration-v29", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("explicit-surface-and-lm-cardinality-v30", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("invoice-primary-identity-and-single-unit-precedence-v31", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("rinaldi-sp-dot-and-vat-layout-v32", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("infissi-vertical-totals-and-table-identity-v33", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("bank-transfer-invoice-authority-v34", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("invoice-header-identity-over-body-reference-v35", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("enea-2026-june25-deadline-window-v36", now);
      if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("documented-product-module-over-label-v65", now);
      const completedPreflight = this.crmLocalPreflight.snapshot(now);
      if (completedPreflight.status === "completed" && completedPreflight.items.some((item) => item.customerKey === "beatrice-ciotta" && item.state !== "deferred_operator")) this.crmLocalPreflight.deferCiottaForPilot("user-2026-08-15-ciotta-leave-aside", "Accantonata dal pilot su istruzione utente; report e fonti conservati, nessuna azione CRM o ENEA.", now);
      this.operatorQuestions.discoverMeasurementUnitAmbiguities(this.crmLocalPreflight.snapshot(now), analyzed, now);
      if (this.checkpointMode === "migrate") this.infissiBatchPreflight.applyValidationRevision("infissi-vertical-totals-and-table-identity-v1", now);
      if (this.checkpointMode === "migrate") this.infissiBatchPreflight.applyValidationRevision("infissi-bank-transfer-invoice-authority-v12", now);
      if (this.checkpointMode === "migrate") this.infissiBatchPreflight.applyValidationRevision("infissi-enea-2026-june25-deadline-window-v13", now);
      this.infissiBatchPreflight.tick(now);
    }
    this.deepCaseReview.prepareFromCurrentCheckpoints(now);
    this.deepCaseReview.tick(now);
    prepareEneaDraftExecutionIfAbsent(this.eneaDraftExecution, this.crmLocalPreflight.snapshot(now), now, this.infissiBatchPreflight);
    this.synchronizeCrmReadOnlyEvidence(now);
    void this.notifications.observe(executionPlan, pilotSample, now);
    if (!this.crmAuthRefreshInFlight) {
      this.crmAuthRefreshInFlight = true;
      void this.crmAuth.maintainSession(now)
        .catch((error) => process.stderr.write(`CRM_AUTH_MAINTENANCE_ERROR: ${error instanceof Error ? error.message : String(error)}\n`))
        .finally(() => { this.crmAuthRefreshInFlight = false; });
    }
    if (!this.crmAcquisitionInFlight) {
      this.crmAcquisitionInFlight = true;
      void this.crmAcquisition.tick(now)
        .catch((error) => process.stderr.write(`CRM_ACQUISITION_ERROR: ${error instanceof Error ? error.message : String(error)}\n`))
        .finally(() => { this.crmAcquisitionInFlight = false; });
    }
    if (!this.crmDocumentsInFlight) {
      this.crmDocumentsInFlight = true;
      void this.crmDocuments.tick(now)
        .catch((error) => process.stderr.write(`CRM_DOCUMENTS_ERROR: ${error instanceof Error ? error.message : String(error)}\n`))
        .finally(() => { this.crmDocumentsInFlight = false; });
    }
    if (!this.crmDocumentAnalysisInFlight) {
      this.crmDocumentAnalysisInFlight = true;
      void this.crmDocumentAnalysis.tick(now)
        .catch((error) => process.stderr.write(`CRM_DOCUMENT_ANALYSIS_ERROR: ${error instanceof Error ? error.message : String(error)}\n`))
        .finally(() => { this.crmDocumentAnalysisInFlight = false; });
    }
    const shadowIntakeAllowed = shouldRunShadowIntake(this.rootDirectory, this.shadowControl.snapshot(now).intakeAllowed);
    if (shadowIntakeAllowed && !this.crmIncomingReadOnlyInFlight) {
      this.crmIncomingReadOnlyInFlight = true;
      void this.crmIncomingReadOnly.pollAndDispatch(now)
        .catch((error) => process.stderr.write(`CRM_INCOMING_READONLY_ERROR: ${error instanceof Error ? error.message : String(error)}\n`))
        .finally(() => { this.crmIncomingReadOnlyInFlight = false; });
    }
    if (shadowIntakeAllowed && !this.crmLiveProcessingInFlight) {
      this.crmLiveProcessingInFlight = true;
      void this.crmLiveProcessing.tick(now)
        .catch((error) => process.stderr.write(`CRM_LIVE_PROCESSING_ERROR: ${error instanceof Error ? error.message : String(error)}\n`))
        .finally(() => { this.crmLiveProcessingInFlight = false; });
    }
    writeLocalDashboard(this.rootDirectory, state, now, this.runtime, this.readinessStore.snapshot(now), this.adapterStore.snapshot(now),
      executionPlan, localDossierDashboardSnapshot(this.rootDirectory),
      new PersistentLocalDossierBatch(this.rootDirectory).report(), new PersistentRuleMatrixEvidence(this.rootDirectory).snapshot(),
      this.crmReadOnlyAdapterStore.snapshot(now), pilotSample, this.notifications.snapshot(), this.crmAuth.snapshot(now), this.crmAcquisition.snapshot(now), this.crmDocuments.snapshot(now), this.crmDocumentAnalysis.snapshot(now), this.crmLocalPreflight.snapshot(now), this.eneaDraftExecution.snapshot(now), this.eneaBrowserWorker.snapshot(now), this.watchdog.load(now), this.operatorQuestions.snapshot(now), this.csrfToken, this.crmIntegrationWorkflow.snapshot(now), this.crmIncomingReadOnly.snapshot(now), this.crmLiveProcessing.snapshot(now), this.shadowComparison.snapshot(now), this.shadowControl.snapshot(now), this.infissiLocalMapping.snapshot(now), this.infissiBatchPreflight.snapshot(now), this.deepCaseReview.snapshot(now));
  }

  async start() {
    if (this.server) return this.currentUrl!;
    const server = createServer((request, response) => { void this.handleRequest(request, response); });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
      const onListening = () => { server.off("error", onError); resolve(); };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.requestedPort, this.host);
    });
    const address = server.address() as AddressInfo;
    this.currentUrl = `http://${this.host}:${address.port}`;
    try {
      const state = this.journal.load();
      const now = this.now();
      this.readinessStore.initialize(now);
      this.readinessStore.repairSpuriousTimeoutLoginRequired("repair:spurious-timeout-login-required:v14", now);
      this.adapterStore.initialize(now);
      this.crmReadOnlyAdapterStore.initialize(now);
      this.pilotSampleStore.initialize(now);
      this.notifications.initialize();
      this.crmAuth.initialize(now);
      this.crmAcquisition.initialize(now);
      this.crmDocuments.initialize(now);
      this.crmDocumentAnalysis.initialize(now);
      this.crmLocalPreflight.initialize(now);
      this.infissiBatchPreflight.initialize(now);
      this.deepCaseReview.initialize(now);
      this.operatorQuestions.initialize(now);
      this.crmIntegrationWorkflow.initialize(now);
      this.crmIncomingReadOnly.initialize(now);
      this.crmLiveProcessing.initialize(now);
      this.eneaDraftExecution.initialize(now);
      this.shadowComparison.initialize(now);
      this.shadowControl.initialize(now);
      const snapshot = supervise(state, now);
      this.runtime = this.runtimeStore.start({
        instanceId: this.instanceId,
        pid: process.pid,
        url: this.currentUrl,
        runnerRevision: state.revision,
        health: snapshot.health,
        now,
      });
      this.server = server;
      const executionPlan = new PersistentExecutionPlanStore(this.rootDirectory).load();
      const pilotSample = this.pilotSampleStore.snapshot(now);
      if (pilotSample.status === "selected") {
        this.crmAcquisition.prepare(pilotSample.selected, pilotSample.candidateFingerprint!, now);
        this.crmAcquisition.applyTransportRepair("crm-select-remove-unexposed-data-fine-lavori-v2", "8b1f43142e2491d0f4a0020c3ae634ab664255590e935be68dc79f714f6ee94c", now);
      }
      this.crmAcquisition.applyRecordedOperatorResolutions(now);
      const acquired = this.crmAcquisition.snapshot(now);
      if (acquired.status === "completed" && acquired.progress.acquired > 0) {
        this.crmDocuments.prepare(acquired.items.filter((item) => item.state === "acquired" && item.practiceId && item.dossierPath)
          .map((item) => ({ customerKey: item.customerKey, practiceId: item.practiceId!, dossierPath: item.dossierPath! })), now);
      }
      const documents = this.crmDocuments.snapshot(now);
      if (documents.status === "completed" && documents.progress.downloaded > 0 && documents.sourceSetFingerprint) {
        this.crmDocumentAnalysis.prepare(documents.items.filter((item) => item.state === "downloaded" && item.localPath && item.responseSha256)
          .map((item) => ({ documentKey: item.documentKey, customerKey: item.customerKey, kind: item.kind, localPath: item.localPath!, responseSha256: item.responseSha256! })), documents.sourceSetFingerprint, now);
      }
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v3-ciotta-and-historical-exclusion", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v4-embedded-copy-deduplication", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v5-rinaldi-ghitti-identity", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v6-parolo-desando-formats", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v7-split-header-document-identity", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v8-rinaldi-galbiati-identity-totals", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v9-cohort39-vendor-measures", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v10-multipage-invoice-segmentation", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v11-invoice-reference-and-date", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v12-vans-grouped-products", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v13-vepa-recognition", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v14-multipage-vat-inclusive-total", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v15-narrative-product-groups", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v16-suman-vans-bank-transfer", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v17-lm-tende-motorized-zanzariera", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v25-vans-awning-missing-gtot", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v26-zanzasol-description-after-price", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v28-lm-tende-multi-product-balance", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v29-odhaus-avvolgibili-supporting-declaration", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v30-explicit-surface-and-lm-cardinality", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v31-rinaldi-sp-dot-and-vat-layout", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v32-infissi-vertical-totals-and-table-identity", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyParserRevision("invoice-parser-v33-header-identity-over-body-reference", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyAnalyzerRepair("pdf-analyzer-cohort-path-v1", now);
      if (this.checkpointMode === "migrate") this.crmDocumentAnalysis.applyTechnicalPerformanceDiagramOcrRepair("infissi-performance-diagram-ocr-v2", now);
      const analyzed = this.crmDocumentAnalysis.snapshot(now);
      if (acquired.status === "completed" && acquired.progress.acquired > 0 && analyzed.status === "completed" && analyzed.sourceFingerprint) {
        const preflightFingerprint = createHash("sha256").update(JSON.stringify({ candidateFingerprint: acquired.candidateFingerprint, sourceFingerprint: analyzed.sourceFingerprint, parserRevisionsApplied: analyzed.parserRevisionsApplied })).digest("hex");
        const acquiredItems = acquired.items.filter((item) => item.state === "acquired");
        const preflightBefore = this.crmLocalPreflight.snapshot(now);
        if (!preflightBefore.sourceFingerprint) this.crmLocalPreflight.prepare(acquiredItems, preflightFingerprint, now);
        else if (preflightBefore.sourceFingerprint !== preflightFingerprint && this.eneaDraftExecution.snapshot(now).items.length === 0) this.crmLocalPreflight.applySourceRevision(acquiredItems, preflightFingerprint, `source-set-${preflightFingerprint.slice(0, 16)}`, now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("analysis-results-after-local-repair-v6", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("financial-signed-rinaldi-rows-v7", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("financial-vendor-total-labels-v8", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("financial-rinaldi-galbiati-v9", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("missing-invoice-default-unit-bank-transfer-v10", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("invoice-reference-date-v11", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("financial-total-from-unique-invoices-v12", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("payment-rounding-third-evidence-v13", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("worker-validator-ownership-v14", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("invoice-type-over-form-group-v15", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("vepa-deferred-current-phase-v16", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("vat-inclusive-multipage-total-v17", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("distinct-invoice-numbers-same-customer-sum-v18", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("narrative-product-groups-v19", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("invoice-family-over-form-cardinality-v20", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("secondary-home-36-percent-allocation-v21", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("linea-sole-potito-paper-form-fallbacks-v22", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("multipage-bank-transfer-classification-v23", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("lm-tende-motorized-zanzariera-v24", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("vans-awning-missing-gtot-v25", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("zanzasol-description-after-price-v26", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("zanzasol-intervention-reconciliation-v27", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("lm-tende-multi-product-balance-v28", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("odhaus-avvolgibili-supporting-declaration-v29", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("explicit-surface-and-lm-cardinality-v30", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("invoice-primary-identity-and-single-unit-precedence-v31", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("rinaldi-sp-dot-and-vat-layout-v32", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("infissi-vertical-totals-and-table-identity-v33", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("bank-transfer-invoice-authority-v34", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("invoice-header-identity-over-body-reference-v35", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("enea-2026-june25-deadline-window-v36", now);
        if (this.checkpointMode === "migrate") this.crmLocalPreflight.applyValidationRevision("documented-product-module-over-label-v65", now);
        this.operatorQuestions.discoverMeasurementUnitAmbiguities(this.crmLocalPreflight.snapshot(now), analyzed, now);
        if (this.checkpointMode === "migrate") this.infissiBatchPreflight.applyValidationRevision("infissi-vertical-totals-and-table-identity-v1", now);
        if (this.checkpointMode === "migrate") this.infissiBatchPreflight.applyValidationRevision("infissi-bank-transfer-invoice-authority-v12", now);
        if (this.checkpointMode === "migrate") this.infissiBatchPreflight.applyValidationRevision("infissi-enea-2026-june25-deadline-window-v13", now);
        this.infissiBatchPreflight.tick(now);
      }
      prepareEneaDraftExecutionIfAbsent(this.eneaDraftExecution, this.crmLocalPreflight.snapshot(now), now, this.infissiBatchPreflight);
      this.synchronizeCrmReadOnlyEvidence(now);
      void this.notifications.observe(executionPlan, pilotSample, now);
      writeLocalDashboard(this.rootDirectory, state, now, this.runtime, this.readinessStore.snapshot(now), this.adapterStore.snapshot(now),
        executionPlan, localDossierDashboardSnapshot(this.rootDirectory),
        new PersistentLocalDossierBatch(this.rootDirectory).report(), new PersistentRuleMatrixEvidence(this.rootDirectory).snapshot(),
        this.crmReadOnlyAdapterStore.snapshot(now), pilotSample, this.notifications.snapshot(), this.crmAuth.snapshot(now), this.crmAcquisition.snapshot(now), this.crmDocuments.snapshot(now), this.crmDocumentAnalysis.snapshot(now), this.crmLocalPreflight.snapshot(now), this.eneaDraftExecution.snapshot(now), this.eneaBrowserWorker.snapshot(now), this.watchdog.load(now), this.operatorQuestions.snapshot(now), this.csrfToken, this.crmIntegrationWorkflow.snapshot(now), this.crmIncomingReadOnly.snapshot(now), this.crmLiveProcessing.snapshot(now), this.shadowComparison.snapshot(now), this.shadowControl.snapshot(now), this.infissiLocalMapping.snapshot(now), this.infissiBatchPreflight.snapshot(now));
      if (!this.crmAuthRefreshInFlight) {
        this.crmAuthRefreshInFlight = true;
        void this.crmAuth.maintainSession(now)
          .catch((error) => process.stderr.write(`CRM_AUTH_MAINTENANCE_ERROR: ${error instanceof Error ? error.message : String(error)}\n`))
          .finally(() => { this.crmAuthRefreshInFlight = false; });
      }
      this.heartbeatTimer = setInterval(() => {
        try { this.pulse(); }
        catch (error) { process.stderr.write(`SUPERVISOR_HEARTBEAT_ERROR: ${error instanceof Error ? error.message : String(error)}\n`); }
      }, this.heartbeatIntervalMs);
      return this.currentUrl;
    } catch (error) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      this.currentUrl = null;
      throw error;
    }
  }

  async stop(reason = "Stop supervisore richiesto.") {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.server) await new Promise<void>((resolve, reject) => this.server!.close((error) => error ? reject(error) : resolve()));
    this.server = null;
    if (this.runtime) this.runtime = this.runtimeStore.stop(this.instanceId, reason, this.now());
    this.currentUrl = null;
    return this.runtime;
  }

  // Harness intenzionale per verificare la ripresa dopo un arresto non pulito:
  // chiude socket/timer ma lascia il checkpoint "running" fino alla lease.
  async simulateCrashForTest() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
    this.currentUrl = null;
  }
}
