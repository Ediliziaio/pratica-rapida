import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { EneaPortalWorkflowPreparation } from "../../src/features/enea-lab/portalWorkflow";
import type { AprInfissiEneaDraftPayload } from "../../src/features/enea-shadow-crm/infissiEneaDraftPayload";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { PersistentAprEneaDraftExecution } from "./eneaDraftExecution";
import type { AprUncertainPageSaveProbeMethod, AprUncertainPageSaveProbeOutcome } from "./eneaDraftExecution";

const VERSION = "apr-enea-browser-worker-v1" as const;
const SIMULATOR_VERSION = "apr-enea-portal-simulator-v1" as const;
const WORKER_LEASE_MS = 15_000;
const RULE_IDS = [
  USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,
  USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft,
  "system-atomic-checkpoint-resume",
  "system-single-active-practice",
] as const;

export type AprEneaProductModule = "screening" | "infissi";

export interface AprEneaDraftPackage {
  module: AprEneaProductModule;
  customerKey: string;
  displayName: string;
  practiceId: string;
  packageFingerprint: string;
  workflowFingerprint: string;
  workflow: Pick<EneaPortalWorkflowPreparation, "steps" | "screeningSteps" | "supportedPages" | "screeningItemCount">;
  infissiPayload?: AprInfissiEneaDraftPayload;
  safety: {
    createAllowedAfterPersistentIntent: true;
    saveAllowedAfterAllPageCheckpoints: true;
    previewAllowed: false;
    submitAllowed: false;
    communicationsAllowed: false;
  };
}

export interface AprEneaDriverEvidence {
  evidenceId: string;
  observedAt: string;
  url: string;
}

export interface AprEneaSessionEvidence extends AprEneaDriverEvidence {
  authenticated: boolean;
  serverLogoutProven: boolean;
}

export interface AprEneaDraftEvidence extends AprEneaDriverEvidence {
  draftId: string;
}

export interface AprEneaPageSaveProbeEvidence extends AprEneaDriverEvidence {
  method: AprUncertainPageSaveProbeMethod;
  outcome: AprUncertainPageSaveProbeOutcome;
  reason: string;
}

export interface AprEneaBrowserDriver {
  readonly kind: "simulated" | "cdp_chrome";
  readonly identity: string;
  verifySession(): Promise<AprEneaSessionEvidence>;
  discoverExistingDraft(draftPackage: AprEneaDraftPackage): Promise<AprEneaDraftEvidence | null>;
  createDraft(draftPackage: AprEneaDraftPackage): Promise<AprEneaDraftEvidence>;
  preparePage(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence>;
  savePage(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence>;
  verifyPageSaved(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence | null>;
  verifyNestedPageSavedCanonicalReadOnly?(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence | null>;
  probePageSaveReadOnly?(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaPageSaveProbeEvidence[]>;
  verifyDraftSaved(draftPackage: AprEneaDraftPackage, draftId: string): Promise<AprEneaDriverEvidence | null>;
  pendingCreationBarrier?(): { customerKey: string; evidenceId: string } | null;
}

export type AprEneaDraftPackageProvider = (customerKey: string) => AprEneaDraftPackage | Promise<AprEneaDraftPackage>;

interface WorkerAuditEvent {
  revision: number;
  at: string;
  commandId: string;
  event: "initialized" | "worker_started" | "worker_stopped" | "heartbeat" | "action_started" | "action_completed" | "case_isolated" | "login_required" | "run_completed" | "technical_block";
  executorKind: "apr_browser_worker";
  instanceId: string;
  processPid: number;
  driverKind: AprEneaBrowserDriver["kind"];
  driverIdentity: string;
  customerKey: string | null;
  action: string;
  evidenceId: string | null;
  reason: string;
  appliedRuleIds: string[];
}

interface WorkerState {
  version: typeof VERSION;
  revision: number;
  status: "idle" | "running" | "login_required" | "technical_block" | "completed" | "stopped";
  instanceId: string;
  processPid: number;
  driverKind: AprEneaBrowserDriver["kind"];
  driverIdentity: string;
  leaseUntil: string;
  heartbeatAt: string;
  currentCustomerKey: string | null;
  currentAction: string;
  completedCustomerKeys: string[];
  blockedCustomerKeys: string[];
  forbiddenActionCount: 0;
  previewAttemptCount: 0;
  submitAttemptCount: 0;
  communicationAttemptCount: 0;
  reason: string;
  nextAction: string;
  processedCommandIds: string[];
  audit: WorkerAuditEvent[];
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

export function reconcileStoppedAprEneaBrowserWorkerCheckpoint(
  rootDirectory: string,
  input: { instanceId: string; reason: string; now?: Date },
) {
  const checkpointPath = path.join(path.resolve(rootDirectory), "enea-browser-worker", "checkpoint.json");
  if (!existsSync(checkpointPath)) return null;
  const current = JSON.parse(readFileSync(checkpointPath, "utf8")) as WorkerState;
  if (current.version !== VERSION || current.instanceId !== input.instanceId) return current;
  if (current.status === "stopped" && current.processPid === 0) return current;
  const now = input.now ?? new Date();
  const next = structuredClone(current);
  const commandId = `worker:system:stopped:${input.instanceId}`;
  next.revision += 1;
  next.status = "stopped";
  next.processPid = 0;
  next.heartbeatAt = now.toISOString();
  next.leaseUntil = now.toISOString();
  next.currentCustomerKey = null;
  next.currentAction = "stopped";
  next.reason = input.reason;
  next.nextAction = "Il LaunchAgent potrà riprendere dal checkpoint persistente; nessun lavoro è dichiarato in corso.";
  if (!next.processedCommandIds.includes(commandId)) next.processedCommandIds.push(commandId);
  next.audit.push({
    revision: next.revision,
    at: now.toISOString(),
    commandId,
    event: "worker_stopped",
    executorKind: "apr_browser_worker",
    instanceId: next.instanceId,
    processPid: 0,
    driverKind: next.driverKind,
    driverIdentity: next.driverIdentity,
    customerKey: null,
    action: "stopped",
    evidenceId: null,
    reason: input.reason,
    appliedRuleIds: [...RULE_IDS, "system-public-state-process-liveness"],
  });
  atomicWrite(checkpointPath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function nestedCheckpointBelongsToOuter(pageId: string, outerPageId: string) {
  if (pageId === "page:Allocazione costi e detrazioni") return outerPageId === "page:Calcolo costi e detrazioni";
  if (/Generatore/.test(pageId)) return outerPageId === "page:Impianto termico esistente";
  if (pageId.startsWith("screening:")) return /Schermature solari|Serramenti e infissi/.test(outerPageId);
  return false;
}

function commandPart(value: string) {
  return value.replace(/[^a-z0-9_.:-]/gi, "-").toLowerCase();
}

function pageStep(draftPackage: AprEneaDraftPackage, pageId: string) {
  if (pageId.startsWith("screening:")) return draftPackage.workflow.screeningSteps[Number(pageId.slice("screening:".length)) - 1] ?? null;
  if (pageId.startsWith("page:")) return draftPackage.workflow.steps.find((step) => step.pageName === pageId.slice("page:".length)) ?? null;
  return null;
}

export class AprSimulatedProcessCrash extends Error {
  constructor(readonly actionKey: string) { super(`apr_simulated_process_crash:${actionKey}`); }
}

interface SimulatedPortalDraft {
  draftId: string;
  customerKey: string;
  packageFingerprint: string;
  url: string;
  preparedPageIds: string[];
  savedPageIds: string[];
  createMutationCount: number;
  pageSaveMutationCounts: Record<string, number>;
}

interface SimulatedPortalState {
  version: typeof SIMULATOR_VERSION;
  nextDraftNumber: number;
  authenticated: boolean;
  drafts: SimulatedPortalDraft[];
  eventSequence: number;
  events: Array<{ sequence: number; at: string; driverIdentity: string; action: string; customerKey: string | null; draftId: string | null; pageId: string | null; evidenceId: string }>;
}

export class PersistentSimulatedEneaPortalDriver implements AprEneaBrowserDriver {
  readonly kind = "simulated" as const;
  readonly identity: string;
  readonly checkpointPath: string;
  private crashAfterMutation: string | null;

  constructor(rootDirectory: string, options: { identity?: string; crashAfterMutation?: string } = {}) {
    this.identity = options.identity ?? "apr-simulated-browser-profile";
    this.checkpointPath = path.join(path.resolve(rootDirectory), "enea-browser-worker", "simulated-portal.json");
    this.crashAfterMutation = options.crashAfterMutation ?? null;
    if (!existsSync(this.checkpointPath)) this.write({ version: SIMULATOR_VERSION, nextDraftNumber: 700001, authenticated: true, drafts: [], eventSequence: 0, events: [] });
  }

  private load(): SimulatedPortalState {
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as SimulatedPortalState;
    if (value.version !== SIMULATOR_VERSION) throw new Error("apr_simulated_portal_checkpoint_invalid");
    return value;
  }

  private write(state: SimulatedPortalState) { atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); }

  private event(state: SimulatedPortalState, action: string, customerKey: string | null, draftId: string | null, pageId: string | null) {
    state.eventSequence += 1;
    const evidenceId = `sim-server-${state.eventSequence}-${digest({ action, customerKey, draftId, pageId, state: state.drafts }).slice(0, 16)}`;
    state.events.push({ sequence: state.eventSequence, at: new Date().toISOString(), driverIdentity: this.identity, action, customerKey, draftId, pageId, evidenceId });
    return evidenceId;
  }

  private maybeCrash(actionKey: string) {
    if (this.crashAfterMutation === actionKey) {
      this.crashAfterMutation = null;
      throw new AprSimulatedProcessCrash(actionKey);
    }
  }

  async verifySession(): Promise<AprEneaSessionEvidence> {
    const state = this.load();
    const evidenceId = this.event(state, "verify_session_readonly", null, null, null);
    this.write(state);
    return { authenticated: state.authenticated, serverLogoutProven: !state.authenticated, evidenceId, observedAt: new Date().toISOString(), url: "https://bonusfiscali.enea.it/" };
  }

  async discoverExistingDraft(draftPackage: AprEneaDraftPackage): Promise<AprEneaDraftEvidence | null> {
    const state = this.load();
    const found = state.drafts.find((draft) => draft.packageFingerprint === draftPackage.packageFingerprint) ?? null;
    const evidenceId = this.event(state, "discover_draft_readonly", draftPackage.customerKey, found?.draftId ?? null, null);
    this.write(state);
    return found ? { draftId: found.draftId, url: found.url, evidenceId, observedAt: new Date().toISOString() } : null;
  }

  async createDraft(draftPackage: AprEneaDraftPackage): Promise<AprEneaDraftEvidence> {
    const state = this.load();
    let draft = state.drafts.find((item) => item.packageFingerprint === draftPackage.packageFingerprint);
    if (!draft) {
      const draftId = String(state.nextDraftNumber++);
      draft = { draftId, customerKey: draftPackage.customerKey, packageFingerprint: draftPackage.packageFingerprint, url: `https://bonusfiscali.enea.it/pratica/ecobonus/2026/beneficiario/${draftId}`, preparedPageIds: [], savedPageIds: [], createMutationCount: 1, pageSaveMutationCounts: {} };
      state.drafts.push(draft);
    }
    const evidenceId = this.event(state, "create_draft", draftPackage.customerKey, draft.draftId, null);
    this.write(state);
    this.maybeCrash(`create:${draftPackage.customerKey}`);
    return { draftId: draft.draftId, url: draft.url, evidenceId, observedAt: new Date().toISOString() };
  }

  async preparePage(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence> {
    if (!pageStep(draftPackage, pageId)) throw new Error(`apr_driver_page_not_in_package:${pageId}`);
    const state = this.load();
    const draft = state.drafts.find((item) => item.draftId === draftId && item.packageFingerprint === draftPackage.packageFingerprint);
    if (!draft) throw new Error("apr_driver_draft_not_found");
    if (!draft.preparedPageIds.includes(pageId)) draft.preparedPageIds.push(pageId);
    const evidenceId = this.event(state, "prepare_allowlisted_page", draftPackage.customerKey, draftId, pageId);
    this.write(state);
    return { evidenceId, observedAt: new Date().toISOString(), url: draft.url };
  }

  async savePage(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence> {
    const state = this.load();
    const draft = state.drafts.find((item) => item.draftId === draftId && item.packageFingerprint === draftPackage.packageFingerprint);
    if (!draft || !draft.preparedPageIds.includes(pageId)) throw new Error("apr_driver_page_not_prepared");
    if (!draft.savedPageIds.includes(pageId)) {
      draft.savedPageIds.push(pageId);
      draft.pageSaveMutationCounts[pageId] = (draft.pageSaveMutationCounts[pageId] ?? 0) + 1;
    }
    const evidenceId = this.event(state, "save_page", draftPackage.customerKey, draftId, pageId);
    this.write(state);
    this.maybeCrash(`save:${draftPackage.customerKey}:${pageId}`);
    return { evidenceId, observedAt: new Date().toISOString(), url: draft.url };
  }

  async verifyPageSaved(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence | null> {
    const state = this.load();
    const draft = state.drafts.find((item) => item.draftId === draftId && item.packageFingerprint === draftPackage.packageFingerprint);
    const saved = Boolean(draft?.savedPageIds.includes(pageId));
    const evidenceId = this.event(state, "verify_page_saved_readonly", draftPackage.customerKey, draftId, pageId);
    this.write(state);
    return saved && draft ? { evidenceId, observedAt: new Date().toISOString(), url: draft.url } : null;
  }

  async verifyNestedPageSavedCanonicalReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence | null> {
    return this.verifyPageSaved(draftPackage, draftId, pageId);
  }

  async probePageSaveReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaPageSaveProbeEvidence[]> {
    const state = this.load();
    const draft = state.drafts.find((item) => item.draftId === draftId && item.packageFingerprint === draftPackage.packageFingerprint);
    const saved = Boolean(draft?.savedPageIds.includes(pageId));
    const now = new Date().toISOString();
    const make = (method: AprUncertainPageSaveProbeMethod, outcome: AprUncertainPageSaveProbeOutcome, reason: string) => {
      const evidenceId = this.event(state, `probe_${method}_readonly`, draftPackage.customerKey, draftId, pageId);
      return { method, outcome, reason, evidenceId, observedAt: now, url: draft?.url ?? "https://bonusfiscali.enea.it/" };
    };
    const probes = [
      make("server_redirect", "inconclusive", "La fixture non simula un redirect di avanzamento."),
      make("persisted_fields_get", saved ? "saved" : "not_saved", saved ? "I valori della pagina risultano persistiti nella rilettura GET." : "I valori della pagina non risultano persistiti nella rilettura GET."),
      make("server_metadata_get", saved ? "saved" : "not_saved", saved ? "Il metadato server della pagina conferma la modifica." : "Il metadato server non mostra la modifica attesa."),
    ] satisfies AprEneaPageSaveProbeEvidence[];
    this.write(state);
    return probes;
  }

  async verifyDraftSaved(draftPackage: AprEneaDraftPackage, draftId: string): Promise<AprEneaDraftEvidence | null> {
    const state = this.load();
    const draft = state.drafts.find((item) => item.draftId === draftId && item.packageFingerprint === draftPackage.packageFingerprint);
    const expected = [...draftPackage.workflow.steps.map((step) => `page:${step.pageName}`), ...draftPackage.workflow.screeningSteps.map((_, index) => `screening:${index + 1}`)];
    const complete = Boolean(draft && expected.every((pageId) => draft.savedPageIds.includes(pageId)));
    const evidenceId = this.event(state, "verify_draft_saved_readonly", draftPackage.customerKey, draftId, null);
    this.write(state);
    return complete && draft ? { draftId, evidenceId, observedAt: new Date().toISOString(), url: draft.url } : null;
  }

  snapshot() { return this.load(); }
}

export class PersistentAprEneaBrowserWorker {
  readonly directory: string;
  readonly checkpointPath: string;

  constructor(
    rootDirectory: string,
    readonly execution: PersistentAprEneaDraftExecution,
    readonly packageProvider: AprEneaDraftPackageProvider,
    readonly driver: AprEneaBrowserDriver,
    readonly options: { instanceId?: string; now?: () => Date; processPid?: number; generatorPersistenceVerificationRetryDelayMs?: number; recoveredScreeningPersistenceVerificationRetryDelayMs?: number } = {},
  ) {
    this.directory = path.join(path.resolve(rootDirectory), "enea-browser-worker");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }

  private now() { return this.options.now?.() ?? new Date(); }
  private instanceId() { return this.options.instanceId ?? `apr-enea-worker-${process.pid}`; }
  private processPid() { return this.options.processPid ?? process.pid; }

  private initial(now: Date): WorkerState {
    const instanceId = this.instanceId();
    const processPid = this.processPid();
    const reason = "Worker browser APR inizializzato; nessuna azione esterna eseguita.";
    return {
      version: VERSION, revision: 0, status: "idle", instanceId, processPid, driverKind: this.driver.kind, driverIdentity: this.driver.identity,
      leaseUntil: now.toISOString(), heartbeatAt: now.toISOString(), currentCustomerKey: null, currentAction: "idle", completedCustomerKeys: [], blockedCustomerKeys: [],
      forbiddenActionCount: 0, previewAttemptCount: 0, submitAttemptCount: 0, communicationAttemptCount: 0,
      reason, nextAction: "Attendere una coda persistente con almeno due pratiche verdi.", processedCommandIds: ["worker:init"],
      audit: [{ revision: 0, at: now.toISOString(), commandId: "worker:init", event: "initialized", executorKind: "apr_browser_worker", instanceId, processPid, driverKind: this.driver.kind, driverIdentity: this.driver.identity, customerKey: null, action: "initialize", evidenceId: null, reason, appliedRuleIds: [...RULE_IDS] }],
    };
  }

  private valid(value: WorkerState) {
    return value.version === VERSION && value.forbiddenActionCount === 0 && value.previewAttemptCount === 0 && value.submitAttemptCount === 0 && value.communicationAttemptCount === 0
      && value.audit.every((event) => event.executorKind === "apr_browser_worker" && event.appliedRuleIds.length > 0);
  }

  initialize(now = this.now()) {
    if (existsSync(this.checkpointPath)) return this.load();
    const state = this.initial(now); this.write(state); return state;
  }

  load() {
    if (!existsSync(this.checkpointPath)) return this.initial(this.now());
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as WorkerState;
    if (!this.valid(value)) throw new Error("apr_enea_browser_worker_checkpoint_invalid");
    return value;
  }

  private write(state: WorkerState) {
    if (!this.valid(state)) throw new Error("apr_enea_browser_worker_checkpoint_invalid");
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  private record(input: Omit<WorkerAuditEvent, "revision" | "at" | "executorKind" | "instanceId" | "processPid" | "driverKind" | "driverIdentity" | "appliedRuleIds"> & { appliedRuleIds?: string[] }, status?: WorkerState["status"]) {
    const now = this.now();
    const current = this.initialize(now);
    const leaseActive = Date.parse(current.leaseUntil) > now.getTime();
    if (current.instanceId !== this.instanceId() && leaseActive) throw new Error("apr_enea_browser_worker_lease_held");
    if (current.processedCommandIds.includes(input.commandId)) return current;
    const next = structuredClone(current);
    next.revision += 1; next.instanceId = this.instanceId(); next.processPid = this.processPid(); next.driverKind = this.driver.kind; next.driverIdentity = this.driver.identity;
    next.heartbeatAt = now.toISOString(); next.leaseUntil = new Date(now.getTime() + WORKER_LEASE_MS).toISOString(); next.currentCustomerKey = input.customerKey; next.currentAction = input.action;
    next.reason = input.reason; if (status) next.status = status; next.processedCommandIds.push(input.commandId);
    next.audit.push({ revision: next.revision, at: now.toISOString(), executorKind: "apr_browser_worker", instanceId: next.instanceId, processPid: next.processPid, driverKind: this.driver.kind, driverIdentity: this.driver.identity, appliedRuleIds: input.appliedRuleIds ?? [...RULE_IDS], ...input });
    return this.write(next);
  }

  private actionId(customerKey: string | null, action: string, discriminator: string) {
    return `worker:${commandPart(customerKey ?? "global")}:${commandPart(action)}:${commandPart(discriminator)}`;
  }

  private async packageFor(customerKey: string) {
    const draftPackage = await this.packageProvider(customerKey);
    if (draftPackage.customerKey !== customerKey || draftPackage.safety.previewAllowed !== false || draftPackage.safety.submitAllowed !== false || draftPackage.safety.communicationsAllowed !== false) throw new Error("apr_enea_worker_package_safety_invalid");
    return draftPackage;
  }

  private async verifyNestedPageSavedAfterOuterSave(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string, recoveredScreening = false) {
    const verifyCanonical = this.driver.verifyNestedPageSavedCanonicalReadOnly?.bind(this.driver)
      ?? this.driver.verifyPageSaved.bind(this.driver);
    const firstEvidence = await verifyCanonical(draftPackage, draftId, pageId);
    if (recoveredScreening && pageId.startsWith("screening:")) {
      const retryDelayMs = this.options.recoveredScreeningPersistenceVerificationRetryDelayMs ?? 500;
      const retryDiscriminator = `${draftId}:${pageId}`;
      this.record({
        commandId: this.actionId(draftPackage.customerKey, "recovered-screening-persistence-second-canonical-read-started", retryDiscriminator),
        event: "action_started",
        customerKey: draftPackage.customerKey,
        action: "recovered_screening_persistence_second_canonical_read",
        evidenceId: firstEvidence?.evidenceId ?? null,
        reason: `Prima GET canonica post-riepilogo per ${pageId}: ${firstEvidence ? "riga presente" : "riga assente"}; APR attende ${retryDelayMs} ms e ripete una GET indipendente.`,
      }, "running");
      if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      const secondEvidence = await verifyCanonical(draftPackage, draftId, pageId);
      const concordant = Boolean(firstEvidence && secondEvidence);
      this.record({
        commandId: this.actionId(draftPackage.customerKey, concordant ? "recovered-screening-persistence-canonical-reads-agree" : "recovered-screening-persistence-canonical-reads-rejected", retryDiscriminator),
        event: "action_completed",
        customerKey: draftPackage.customerKey,
        action: concordant ? "recovered_screening_persistence_canonical_reads_agree" : "recovered_screening_persistence_canonical_reads_rejected",
        evidenceId: secondEvidence?.evidenceId ?? null,
        reason: concordant
          ? `Due GET canoniche indipendenti e concordanti confermano ${pageId} persistita; nessun ulteriore Salva.`
          : `Le due GET canoniche non confermano entrambe ${pageId}; esito fail-closed senza ripetere il Salva.`,
      }, "running");
      return concordant ? secondEvidence : null;
    }
    if (firstEvidence || !/Generatore/.test(pageId)) return firstEvidence;

    // ENEA can expose the saved Impianto page before the nested generator row
    // reaches its canonical summary.  A single immediate miss is therefore not
    // conclusive: only two negative reads, separated by the observed
    // consistency window, may produce the fail-closed outcome.
    const retryDelayMs = this.options.generatorPersistenceVerificationRetryDelayMs ?? 500;
    const retryDiscriminator = `${draftId}:${pageId}`;
    this.record({
      commandId: this.actionId(draftPackage.customerKey, "generator-persistence-verification-retry-started", retryDiscriminator),
      event: "action_started",
      customerKey: draftPackage.customerKey,
      action: "generator_persistence_verification_retry",
      evidenceId: null,
      reason: `Generatore assente alla prima lettura post-Impianto; APR attende ${retryDelayMs} ms prima della seconda lettura read-only.`,
    }, "running");
    if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    const secondEvidence = await this.driver.verifyPageSaved(draftPackage, draftId, pageId);
    this.record({
      commandId: this.actionId(draftPackage.customerKey, secondEvidence ? "generator-persistence-verification-retry-succeeded" : "generator-persistence-verification-retry-exhausted", retryDiscriminator),
      event: "action_completed",
      customerKey: draftPackage.customerKey,
      action: secondEvidence ? "generator_persistence_verification_retry_succeeded" : "generator_persistence_verification_retry_exhausted",
      evidenceId: secondEvidence?.evidenceId ?? null,
      reason: secondEvidence
        ? `La seconda lettura read-only dopo ${retryDelayMs} ms conferma il generatore persistito.`
        : `Due letture read-only separate da ${retryDelayMs} ms non mostrano il generatore; il fail-closed resta obbligatorio.`,
    }, "running");
    return secondEvidence;
  }

  private startAction(customerKey: string | null, action: string, discriminator: string) {
    return this.record({ commandId: this.actionId(customerKey, `start-${action}`, discriminator), event: "action_started", customerKey, action, evidenceId: null, reason: `APR worker avvia ${action}; intento persistente prima dell'azione.` }, "running");
  }

  private completeAction(customerKey: string | null, action: string, discriminator: string, evidenceId: string) {
    return this.record({ commandId: this.actionId(customerKey, `complete-${action}`, discriminator), event: "action_completed", customerKey, action, evidenceId, reason: `APR worker ha completato e verificato ${action}.` }, "running");
  }

  async tick() {
    const now = this.now();
    this.record({ commandId: `worker:start:${this.instanceId()}`, event: "worker_started", customerKey: null, action: "worker_start", evidenceId: null, reason: "Processo APR worker attivo con identità persistente; la lease ENEA è verificata separatamente dal keepalive read-only." }, "running");
    let execution = this.execution.snapshot(now);
    if (execution.status === "blocked_preflight") return this.record({ commandId: this.actionId(null, "heartbeat-waiting", `${execution.revision}:${this.instanceId()}`), event: "heartbeat", customerKey: null, action: "waiting_for_queue", evidenceId: null, reason: "IDLE — coda vuota; nessuna pratica in esecuzione. Il keepalive ENEA resta separato e attivo." }, "idle");
    if (execution.status === "completed") return this.markCompleted(execution);

    if (!execution.sessionEvidenceId || execution.status === "login_required") {
      this.startAction(null, "verify_session_readonly", String(execution.revision));
      const session = await this.driver.verifySession();
      this.completeAction(null, "verify_session_readonly", String(execution.revision), session.evidenceId);
      if (!session.authenticated) {
        if (!session.serverLogoutProven) throw new Error("apr_enea_session_unknown_not_login_required");
        this.execution.recordLoginRequired("Logout ENEA provato dal driver APR mediante evidenza server.", session.evidenceId, this.actionId(null, "execution-login-required", session.evidenceId), this.now());
        return this.record({ commandId: this.actionId(null, "login-required", session.evidenceId), event: "login_required", customerKey: null, action: "login_required", evidenceId: session.evidenceId, reason: "Sessione ENEA scaduta con prova server; coda globale sospesa senza ticket pratica." }, "login_required");
      }
      this.execution.recordSessionReady(session.evidenceId, this.actionId(null, "execution-session-ready", session.evidenceId), this.now());
      return this.load();
    }

    execution = this.execution.snapshot(this.now());
    if (!execution.currentCustomerKey) {
      const recovery = execution.items.find((item) => item.state === "recovery_queued");
      if (recovery) {
        const uncertain = Boolean(recovery.uncertainPageSave);
        const action = uncertain ? "claim_uncertain_page_save_recovery" : "claim_verified_payload_correction_recovery";
        this.startAction(recovery.customerKey, action, String(execution.revision));
        if (uncertain) this.execution.claimUncertainPageSaveRecovery(recovery.customerKey, this.actionId(recovery.customerKey, "execution-claim-uncertain-page-save-recovery", String(execution.revision)), this.now());
        else this.execution.claimVerifiedPayloadCorrectionRecovery(recovery.customerKey, this.actionId(recovery.customerKey, "execution-claim-verified-payload-correction-recovery", String(execution.revision)), this.now());
        this.completeAction(recovery.customerKey, action, String(execution.revision), `checkpoint-revision-${this.execution.snapshot().revision}`);
        return this.load();
      }
      const next = execution.items.find((item) => item.state === "queued");
      if (!next) return this.markCompleted(execution);
      const pendingCreation = this.driver.pendingCreationBarrier?.() ?? null;
      if (pendingCreation && pendingCreation.customerKey !== next.customerKey) {
        return this.record({
          commandId: this.actionId(next.customerKey, "pending-creation-barrier", `${pendingCreation.customerKey}:${pendingCreation.evidenceId}:revision-${execution.revision}`),
          event: "technical_block",
          customerKey: null,
          action: "pending_creation_barrier",
          evidenceId: pendingCreation.evidenceId,
          reason: `Coda sospesa prima di reclamare ${next.customerKey}: il sotto-checkpoint portale appartiene ancora a ${pendingCreation.customerKey}.`,
        }, "technical_block");
      }
      this.startAction(next.customerKey, "claim_next_case", String(execution.revision));
      // The execution revision is the durable recovery generation.  A case can be
      // requeued more than once while the portal contract is learned; reusing only
      // the package/count tuple would collide with the prior processed command and
      // leave the queue in a harmless but permanent claim loop.
      this.execution.recordCreateIntent(next.customerKey, this.actionId(next.customerKey, "execution-create-intent", `${next.mappingFingerprint ?? "unmapped"}:${next.createAttemptCount}:${next.recoverableCreateIntent}:revision-${execution.revision}`), this.now());
      this.completeAction(next.customerKey, "claim_next_case", String(execution.revision), `checkpoint-revision-${this.execution.snapshot().revision}`);
      return this.load();
    }

    const current = execution.items.find((item) => item.customerKey === execution.currentCustomerKey)!;
    try {
      const draftPackage = await this.packageFor(current.customerKey);
      if (current.state === "create_intent_recorded") {
        this.startAction(current.customerKey, "discover_or_create_draft", draftPackage.packageFingerprint);
        const discovered = await this.driver.discoverExistingDraft(draftPackage);
        const created = discovered ?? await this.driver.createDraft(draftPackage);
        this.execution.recordDraftCreated(current.customerKey, created.draftId, created.url, created.evidenceId, this.actionId(current.customerKey, "execution-draft-created", created.draftId), this.now());
        this.completeAction(current.customerKey, "discover_or_create_draft", draftPackage.packageFingerprint, created.evidenceId);
        return this.load();
      }

      if (!current.draftId) throw new Error("apr_enea_worker_active_draft_id_missing");
      // `staged` rows are complete only inside the current React table. They do
      // not block moving to the owning outer page, but they are not server-saved.
      const unresolvedPage = current.pageCheckpoints.find((page) => page.state !== "saved" && page.state !== "staged");
      if (unresolvedPage?.state === "pending") {
        const prepareGeneration = unresolvedPage.recoveryAuthorizedEvidenceId
          ? `${unresolvedPage.pageId}:recovery:${unresolvedPage.recoveryAuthorizedEvidenceId ?? "authorized"}:revision-${execution.revision}`
          : `${unresolvedPage.pageId}:revision-${execution.revision}`;
        this.startAction(current.customerKey, "prepare_allowlisted_page", prepareGeneration);
        const evidence = await this.driver.preparePage(draftPackage, current.draftId, unresolvedPage.pageId);
        this.execution.recordPagePrepared(current.customerKey, current.draftId, unresolvedPage.pageId, evidence.evidenceId, this.actionId(current.customerKey, "execution-page-prepared", prepareGeneration), this.now());
        this.completeAction(current.customerKey, "prepare_allowlisted_page", prepareGeneration, evidence.evidenceId);
        return this.load();
      }
      if (unresolvedPage?.state === "prepared") {
        const saveGeneration = `${unresolvedPage.pageId}:primary-${unresolvedPage.saveAttemptCount}:recovery-${unresolvedPage.recoverySaveAttemptCount}:authorization-${unresolvedPage.recoveryAuthorizedEvidenceId ?? "none"}:revision-${execution.revision}`;
        this.startAction(current.customerKey, "save_page_once", saveGeneration);
        this.execution.recordPageSaveIntent(current.customerKey, current.draftId, unresolvedPage.pageId, this.actionId(current.customerKey, "execution-page-save-intent", saveGeneration), this.now());
        const clickEvidence = await this.driver.savePage(draftPackage, current.draftId, unresolvedPage.pageId);
        if (unresolvedPage.pageId === "page:Allocazione costi e detrazioni") {
          // Il Salva del modale aggiorna soltanto lo stato React della pagina
          // Calcolo e non emette alcuna richiesta server. Navigare qui per una
          // GET cancellerebbe lo staged. La prova server arriva esclusivamente
          // dopo il successivo Salva esterno della pagina Calcolo.
          this.execution.recordNestedPageStaged(current.customerKey, current.draftId, unresolvedPage.pageId, clickEvidence.evidenceId, this.actionId(current.customerKey, "execution-nested-page-staged", saveGeneration), this.now());
          this.completeAction(current.customerKey, "save_page_once", saveGeneration, clickEvidence.evidenceId);
          return this.load();
        }
        // The click itself is not proof that ENEA accepted the page. Re-read the
        // canonical GET endpoint before advancing; the durable intent prevents a
        // blind second click if this read is uncertain or the process restarts.
        const verifiedEvidence = await this.driver.verifyPageSaved(draftPackage, current.draftId, unresolvedPage.pageId);
        if (!verifiedEvidence) {
          const afterIntent = this.execution.snapshot(this.now()).items.find((item) => item.customerKey === current.customerKey);
          const afterIntentPage = afterIntent?.pageCheckpoints.find((page) => page.pageId === unresolvedPage.pageId);
          // Le righe schermatura recuperate dopo una prova server vuota sono
          // verificate dal riepilogo durevole del controller. Lasciare intatto
          // il checkpoint permette al servizio di classificare quella prova,
          // senza trasformare il timeout DOM in un secondo tentativo.
          if (afterIntentPage?.recoverySaveAttemptCount === 1 && unresolvedPage.pageId.startsWith("screening:")) return this.load();
          if (afterIntentPage?.recoverySaveAttemptCount === 1 && afterIntent?.uncertainPageSave?.status === "recovery_authorized") {
            return this.handleUncertainPageSaveRecoveryFailed(current.customerKey, unresolvedPage.pageId, `Esito non dimostrabile dopo l'unico recupero ${clickEvidence.evidenceId}.`, `uncertain-page-recovery-null-${digest(`${execution.revision}:${unresolvedPage.pageId}:${clickEvidence.evidenceId}`).slice(0, 16)}`);
          }
          const uncertainGeneration = digest(`${unresolvedPage.pageId}:${unresolvedPage.preparedEvidenceId ?? "not-prepared"}:${unresolvedPage.recoveryAuthorizedEvidenceId ?? "primary"}`).slice(0, 16);
          return this.handleUncertainPageSave(current.customerKey, current.draftId, unresolvedPage.pageId, `Esito non dimostrabile dopo ${clickEvidence.evidenceId}.`, `uncertain-page-${uncertainGeneration}`);
        }
        const stagedNestedPages = current.pageCheckpoints.filter((page) => page.state === "staged" && nestedCheckpointBelongsToOuter(page.pageId, unresolvedPage.pageId));
        for (const stagedPage of stagedNestedPages) {
          const nestedEvidence = await this.verifyNestedPageSavedAfterOuterSave(
            draftPackage,
            current.draftId,
            stagedPage.pageId,
            stagedPage.pageId.startsWith("screening:") && stagedPage.recoverySaveAttemptCount === 1,
          );
          if (!nestedEvidence) throw new Error(`apr_enea_nested_page_not_persisted_after_outer_save:${stagedPage.pageId}`);
          this.execution.recordNestedPageServerVerifiedAfterOuterSave(current.customerKey, current.draftId, stagedPage.pageId, unresolvedPage.pageId, nestedEvidence.evidenceId, this.actionId(current.customerKey, "execution-nested-page-server-verified", `${saveGeneration}:${stagedPage.pageId}:${nestedEvidence.evidenceId}`), this.now());
        }
        if (/Generatore/.test(unresolvedPage.pageId) || unresolvedPage.pageId.startsWith("screening:")) this.execution.recordNestedPageStaged(current.customerKey, current.draftId, unresolvedPage.pageId, verifiedEvidence.evidenceId, this.actionId(current.customerKey, "execution-nested-page-staged", saveGeneration), this.now());
        else this.execution.recordPageSaved(current.customerKey, current.draftId, unresolvedPage.pageId, verifiedEvidence.evidenceId, this.actionId(current.customerKey, "execution-page-saved", unresolvedPage.pageId), this.now());
        this.completeAction(current.customerKey, "save_page_once", saveGeneration, verifiedEvidence.evidenceId);
        return this.load();
      }
      if (unresolvedPage?.state === "save_intent_recorded") {
        const verificationGeneration = `${unresolvedPage.pageId}:primary-${unresolvedPage.saveAttemptCount}:recovery-${unresolvedPage.recoverySaveAttemptCount}:authorization-${unresolvedPage.recoveryAuthorizedEvidenceId ?? "none"}`;
        this.startAction(current.customerKey, "verify_page_saved_readonly", verificationGeneration);
        const evidence = await this.driver.verifyPageSaved(draftPackage, current.draftId, unresolvedPage.pageId);
        if (!evidence) {
          if (unresolvedPage.recoverySaveAttemptCount === 1 && current.uncertainPageSave?.status === "recovery_authorized") {
            return this.handleUncertainPageSaveRecoveryFailed(current.customerKey, unresolvedPage.pageId, "Rilettura server senza prova dopo l'unico recupero autorizzato.", `uncertain-page-recovery-null-${digest(`${execution.revision}:${unresolvedPage.pageId}`).slice(0, 16)}`);
          }
          const uncertainGeneration = digest(`${unresolvedPage.pageId}:${unresolvedPage.preparedEvidenceId ?? "not-prepared"}:${unresolvedPage.recoveryAuthorizedEvidenceId ?? "primary"}`).slice(0, 16);
          return this.handleUncertainPageSave(current.customerKey, current.draftId, unresolvedPage.pageId, "Rilettura ordinaria senza prova di persistenza.", `uncertain-page-${uncertainGeneration}`);
        }
        if (/Generatore/.test(unresolvedPage.pageId) || unresolvedPage.pageId.startsWith("screening:")) this.execution.recordNestedPageStaged(current.customerKey, current.draftId, unresolvedPage.pageId, evidence.evidenceId, this.actionId(current.customerKey, "execution-nested-page-staged-after-restart", verificationGeneration), this.now());
        else this.execution.recordPageSaved(current.customerKey, current.draftId, unresolvedPage.pageId, evidence.evidenceId, this.actionId(current.customerKey, "execution-page-saved-after-restart", unresolvedPage.pageId), this.now());
        this.completeAction(current.customerKey, "verify_page_saved_readonly", verificationGeneration, evidence.evidenceId);
        return this.load();
      }

      if (current.state === "filling") {
        // A previously completed draft can be reopened for a verified payload
        // correction on the same ENEA id.  The mapping fingerprint identifies
        // that recovery generation; using only draftId would collide with the
        // already processed final-gate command and strand the case at N/N pages.
        const finalGateGeneration = `${current.draftId}:mapping-${current.mappingFingerprint}:attempt-${current.saveAttemptCount}`;
        this.startAction(current.customerKey, "record_final_saved_gate", finalGateGeneration);
        this.execution.recordSaveIntent(current.customerKey, current.draftId, this.actionId(current.customerKey, "execution-final-save-intent", finalGateGeneration), this.now());
        return this.load();
      }
      if (current.state === "save_intent_recorded") {
        const finalVerificationGeneration = `${current.draftId}:mapping-${current.mappingFingerprint}:attempt-${current.saveAttemptCount}`;
        this.startAction(current.customerKey, "verify_complete_draft_readonly", finalVerificationGeneration);
        const evidence = await this.driver.verifyDraftSaved(draftPackage, current.draftId);
        if (!evidence) return this.isolateCase(current.customerKey, "Bozza completa e salvata non dimostrabile lato server; nessun retry.", "uncertain-draft");
        this.execution.recordDraftSaved(current.customerKey, current.draftId, evidence.url, evidence.evidenceId, this.actionId(current.customerKey, "execution-draft-saved", finalVerificationGeneration), this.now());
        const state = this.completeAction(current.customerKey, "verify_complete_draft_readonly", finalVerificationGeneration, evidence.evidenceId);
        if (!state.completedCustomerKeys.includes(current.customerKey)) { state.completedCustomerKeys.push(current.customerKey); this.write(state); }
        return this.load();
      }
      throw new Error(`apr_enea_worker_unhandled_case_state:${current.state}`);
    } catch (error) {
      if (error instanceof AprSimulatedProcessCrash) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      const fresh = this.execution.snapshot(this.now()).items.find((item) => item.customerKey === current.customerKey);
      const uncertainPage = fresh?.pageCheckpoints.find((page) => page.state === "save_intent_recorded" && page.saveAttemptCount === 1);
      if (fresh?.draftId && uncertainPage && /(?:command_timeout:Runtime\.evaluate|connection_closed|save.*timeout)/i.test(reason)) {
        if (uncertainPage.recoverySaveAttemptCount === 1 && uncertainPage.pageId.startsWith("screening:")) return this.load();
        if (uncertainPage.recoverySaveAttemptCount === 1 && fresh.uncertainPageSave?.status === "recovery_authorized") {
          const evidenceId = `uncertain-page-recovery-error-${digest(`${execution.revision}:${reason}`).slice(0, 16)}`;
          return this.handleUncertainPageSaveRecoveryFailed(current.customerKey, uncertainPage.pageId, reason, evidenceId);
        }
        return this.handleUncertainPageSave(current.customerKey, fresh.draftId, uncertainPage.pageId, reason, `uncertain-page-error-${digest(`${execution.revision}:${reason}`).slice(0, 16)}`);
      }
      // Keep the evidence id stable for retries of the same durable state, but
      // distinct when that case is explicitly requeued into a later recovery
      // generation and happens to hit the same portal error again.
      return this.isolateCase(current.customerKey, `Errore circoscritto alla pratica: ${reason}`, `driver-error-${digest(`${execution.revision}:${reason}`).slice(0, 16)}`);
    }
  }

  private handleUncertainPageSaveRecoveryFailed(customerKey: string, pageId: string, reason: string, evidenceId: string) {
    this.execution.recordUncertainPageSaveRecoveryFailed(customerKey, pageId, reason, evidenceId, this.actionId(customerKey, "execution-uncertain-page-save-recovery-failed", evidenceId), this.now());
    const state = this.record({ commandId: this.actionId(customerKey, "uncertain-page-save-recovery-failed", evidenceId), event: "case_isolated", customerKey, action: "uncertain_page_save_recovery_failed", evidenceId, reason: `${pageId}: anche l'unico recupero autorizzato ha esito incerto; nessun ulteriore tentativo.` }, "running");
    if (!state.blockedCustomerKeys.includes(customerKey)) { state.blockedCustomerKeys.push(customerKey); this.write(state); }
    return this.load();
  }

  private async handleUncertainPageSave(customerKey: string, draftId: string, pageId: string, reason: string, evidenceId: string) {
    const commandId = this.actionId(customerKey, "execution-uncertain-page-save-detected", evidenceId);
    this.execution.recordUncertainPageSaveDetected(customerKey, pageId, reason, evidenceId, commandId, this.now());
    let probes: AprEneaPageSaveProbeEvidence[] = [];
    if (this.driver.probePageSaveReadOnly) {
      const draftPackage = await this.packageFor(customerKey);
      try {
        probes = await this.driver.probePageSaveReadOnly(draftPackage, draftId, pageId);
      } catch (error) {
        const probeReason = error instanceof Error ? error.message : String(error);
        probes = [{ method: "persisted_fields_get", outcome: "inconclusive", reason: `La sonda read-only non ha risposto: ${probeReason}`, evidenceId: `probe-error-${digest(probeReason).slice(0, 16)}`, observedAt: this.now().toISOString(), url: "https://bonusfiscali.enea.it/" }];
      }
    }
    for (const probe of probes) {
      const before = this.execution.snapshot(this.now()).items.find((item) => item.customerKey === customerKey)?.uncertainPageSave;
      if (!before || !["probing", "operator_required"].includes(before.status)) break;
      this.execution.recordUncertainPageSaveProbe(customerKey, probe, this.actionId(customerKey, "execution-uncertain-page-save-probe", `${pageId}:${probe.method}:${probe.evidenceId}`), this.now());
    }
    const resolution = this.execution.snapshot(this.now()).items.find((item) => item.customerKey === customerKey)?.uncertainPageSave;
    if (resolution?.status === "resolved_saved") {
      return this.record({ commandId: this.actionId(customerKey, "uncertain-page-save-auto-resolved", evidenceId), event: "action_completed", customerKey, action: "uncertain_page_save_auto_resolved", evidenceId: resolution.probes.find((probe) => probe.outcome === "saved")?.evidenceId ?? evidenceId, reason: `${pageId} verificata salvata con prove read-only; nessun secondo Salva.` }, "running");
    }
    const state = this.record({ commandId: this.actionId(customerKey, "uncertain-page-save-operator-required", evidenceId), event: "case_isolated", customerKey, action: "uncertain_page_save_operator_required", evidenceId, reason: `${pageId}: prove read-only non conclusive; richiesta decisione operatore, nessun retry.` }, "running");
    if (!state.blockedCustomerKeys.includes(customerKey)) { state.blockedCustomerKeys.push(customerKey); this.write(state); }
    return this.load();
  }

  private isolateCase(customerKey: string, reason: string, evidenceId: string) {
    this.execution.recordCaseBlockedAndContinue(customerKey, reason, evidenceId, this.actionId(customerKey, "execution-case-isolated", evidenceId), this.now());
    const state = this.record({ commandId: this.actionId(customerKey, "case-isolated", evidenceId), event: "case_isolated", customerKey, action: "isolate_case_and_continue", evidenceId, reason }, "running");
    if (!state.blockedCustomerKeys.includes(customerKey)) { state.blockedCustomerKeys.push(customerKey); this.write(state); }
    return this.load();
  }

  private markCompleted(execution: ReturnType<PersistentAprEneaDraftExecution["snapshot"]>) {
    const terminal = execution.items.filter((item) => item.state !== "deferred_operator");
    const state = this.record({ commandId: this.actionId(null, "run-completed", String(execution.revision)), event: "run_completed", customerKey: null, action: "run_completed", evidenceId: `execution-revision-${execution.revision}`, reason: `Coda conclusa: ${terminal.filter((item) => item.state === "saved").length} bozze salvate, ${terminal.filter((item) => item.state === "operator_intervention").length} casi isolati; nessuna anteprima o invio.` }, "completed");
    state.completedCustomerKeys = terminal.filter((item) => item.state === "saved").map((item) => item.customerKey);
    state.blockedCustomerKeys = terminal.filter((item) => item.state === "operator_intervention").map((item) => item.customerKey);
    state.status = "completed"; state.currentCustomerKey = null; state.currentAction = "completed"; state.nextAction = "Consultare il report; nessuna azione ENEA ulteriore consentita.";
    return this.write(state);
  }

  async runUntilTerminal(options: { maxTicks?: number } = {}) {
    const maxTicks = options.maxTicks ?? 10_000;
    for (let index = 0; index < maxTicks; index += 1) {
      const state = await this.tick();
      if (["completed", "login_required", "technical_block"].includes(state.status)) return state;
    }
    throw new Error("apr_enea_browser_worker_tick_limit_exceeded");
  }

  snapshot() {
    const state = this.initialize();
    return { ...state, executorProof: { executorKind: "apr_browser_worker" as const, processPid: state.processPid, instanceId: state.instanceId, driverKind: state.driverKind, driverIdentity: state.driverIdentity }, execution: this.execution.snapshot(), observedAt: this.now().toISOString() };
  }
}
