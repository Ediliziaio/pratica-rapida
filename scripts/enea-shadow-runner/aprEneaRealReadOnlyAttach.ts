import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprEneaReadOnlyDiscovery } from "./aprEneaReadOnlyDiscovery";
import type { PersistentAprGateOrchestrator } from "./aprGateOrchestrator";

export const APR_ENEA_REAL_READONLY_ATTACH_VERSION = "apr-enea-real-readonly-attach-v1" as const;
const RULE_IDS = ["system-readonly-adapter-contract", "system-enea-lease-required", "system-atomic-checkpoint-resume", "system-apr-crm-integration-boundary", "system-operator-block-fail-closed"] as const;

type DiscoveryContract = Pick<PersistentAprEneaReadOnlyDiscovery, "snapshot">;
type OrchestratorContract = Pick<PersistentAprGateOrchestrator, "snapshot" | "recordReadOnlyAttachCompleted" | "recordReadOnlyAttachBlocked">;

export interface AprEneaAttachDiagnostics {
  observedAt: string;
  browserFamily: "chrome";
  selectedProfile: "Default";
  chromeRunning: boolean;
  extensionInstalled: boolean;
  extensionEnabled: boolean;
  nativeHostCorrect: boolean;
  controllerConnected: boolean;
  retryCount: 1;
  newWindowCreated: boolean;
  newTabCreated: false;
  navigationPerformed: false;
  networkRequestPerformed: false;
  crmTabFound: boolean | null;
  eneaTabFound: boolean | null;
  crmDomVerified: boolean | null;
  eneaDomVerified: boolean | null;
  errorCode: "chrome_extension_transport_unavailable" | "chrome_extension_transport_unstable_after_attach" | "required_tabs_not_visible" | null;
}

export interface AprEneaRealReadOnlyAttachState {
  version: typeof APR_ENEA_REAL_READONLY_ATTACH_VERSION;
  revision: number;
  status: "unprepared" | "completed_readonly_attach" | "technical_block";
  phase: "unprepared" | "transport_checked" | "completed";
  controllerIdentity: "apr_persistent_enea_real_readonly_attach";
  sourceSignature: string | null;
  evidenceFingerprint: string | null;
  diagnostics: AprEneaAttachDiagnostics | null;
  externalActionAllowed: false;
  browserMutationAllowed: false;
  createWindowAllowed: false;
  createTabsAllowed: false;
  navigationAllowed: false;
  networkRequestAllowed: false;
  crmMutationAllowed: false;
  eneaActionAllowed: false;
  previewAllowed: false;
  submitAllowed: false;
  receiptAllowed: false;
  communicationsAllowed: false;
  reason: string;
  nextAction: string;
  audit: Array<{ revision: number; at: string; type: "initialized" | "transport_checked" | "attach_completed" | "technical_block"; reason: string; evidenceFingerprint: string | null; appliedRuleIds: string[] }>;
}

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(now: Date): AprEneaRealReadOnlyAttachState {
  const reason = "Attach reale read-only non ancora osservato; gate globale chiuso.";
  return {
    version: APR_ENEA_REAL_READONLY_ATTACH_VERSION, revision: 0, status: "unprepared", phase: "unprepared",
    controllerIdentity: "apr_persistent_enea_real_readonly_attach", sourceSignature: null, evidenceFingerprint: null, diagnostics: null,
    externalActionAllowed: false, browserMutationAllowed: false, createWindowAllowed: false, createTabsAllowed: false, navigationAllowed: false, networkRequestAllowed: false,
    crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false,
    reason, nextAction: "Verificare il solo trasporto del controller verso la sessione Chrome esistente, senza aprire finestre o schede.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", reason, evidenceFingerprint: null, appliedRuleIds: [...RULE_IDS] }],
  };
}

function diagnosticsValid(value: AprEneaAttachDiagnostics) {
  return value.browserFamily === "chrome" && value.selectedProfile === "Default" && value.retryCount === 1
    && typeof value.newWindowCreated === "boolean" && value.newTabCreated === false && value.navigationPerformed === false && value.networkRequestPerformed === false;
}

function validState(value: AprEneaRealReadOnlyAttachState) {
  return value.version === APR_ENEA_REAL_READONLY_ATTACH_VERSION && value.controllerIdentity === "apr_persistent_enea_real_readonly_attach"
    && value.externalActionAllowed === false && value.browserMutationAllowed === false && value.createWindowAllowed === false && value.createTabsAllowed === false
    && value.navigationAllowed === false && value.networkRequestAllowed === false && value.crmMutationAllowed === false && value.eneaActionAllowed === false
    && value.previewAllowed === false && value.submitAllowed === false && value.receiptAllowed === false && value.communicationsAllowed === false
    && (!value.diagnostics || diagnosticsValid(value.diagnostics))
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

export class PersistentAprEneaRealReadOnlyAttach {
  readonly directory: string;
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string, readonly orchestrator: OrchestratorContract, readonly discovery: DiscoveryContract) {
    this.directory = path.join(path.resolve(rootDirectory), "apr-enea-real-readonly-attach");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try { const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprEneaRealReadOnlyAttachState; return validState(value) ? value : initialState(now); }
    catch { return initialState(now); }
  }

  private write(state: AprEneaRealReadOnlyAttachState) {
    if (!validState(state)) throw new Error("enea_real_readonly_attach_checkpoint_invalid");
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  initialize(now = new Date()) { const state = this.load(now); if (!existsSync(this.checkpointPath)) this.write(state); return state; }

  private sourceSignature(now: Date) {
    const discovery = this.discovery.snapshot(now);
    const gate = this.orchestrator.snapshot(now).gates.find((item) => item.gateId === "real_enea_readonly_attach");
    if (discovery.status !== "completed_local_discovery" || discovery.phase !== "completed" || !discovery.planSha256 || !gate || gate.state !== "waiting_safety_gate") throw new Error("enea_real_readonly_attach_source_invalid");
    return sha256({ discoveryVersion: discovery.version, discoveryRevision: discovery.revision, discoveryPlan: discovery.planSha256 });
  }

  recordDiagnostics(diagnostics: AprEneaAttachDiagnostics, now = new Date()) {
    if (!diagnosticsValid(diagnostics)) throw new Error("enea_real_readonly_attach_diagnostics_invalid");
    const sourceSignature = this.sourceSignature(now);
    const evidenceFingerprint = sha256({ sourceSignature, diagnostics });
    const current = this.initialize(now);
    if (current.evidenceFingerprint === evidenceFingerprint) return current;
    if (current.status === "completed_readonly_attach") throw new Error("enea_real_readonly_attach_evidence_changed");
    const next = structuredClone(current);
    next.revision += 1; next.phase = "transport_checked"; next.sourceSignature = sourceSignature; next.evidenceFingerprint = evidenceFingerprint; next.diagnostics = structuredClone(diagnostics);
    if (!diagnostics.controllerConnected) {
      if (!(diagnostics.chromeRunning && diagnostics.extensionInstalled && diagnostics.extensionEnabled && diagnostics.nativeHostCorrect && ["chrome_extension_transport_unavailable", "chrome_extension_transport_unstable_after_attach"].includes(diagnostics.errorCode ?? ""))) throw new Error("enea_real_readonly_attach_block_evidence_incomplete");
      next.status = "technical_block";
      if (diagnostics.errorCode === "chrome_extension_transport_unstable_after_attach") {
        next.reason = "Il controller Chrome si era collegato, ma il canale dell'estensione è caduto dopo l'apertura manuale delle schede e non è tornato disponibile con l'unico retry consentito; Chrome, estensione e native host risultano ancora verdi.";
        next.nextAction = "Reinstallare il plugin Browser dalle impostazioni di ChatGPT e riavviare Chrome una volta; APR conserverà il checkpoint e riprenderà con sola lettura.";
      } else {
        next.reason = "Chrome Default è attivo e configurato, ma il controller non comunica con l'estensione dopo l'unico retry consentito; nessuna scheda è stata enumerata.";
        next.nextAction = "Serve un solo riaggancio controllato della finestra Chrome Default esistente; nessuna nuova scheda, navigazione o richiesta di rete.";
      }
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "technical_block", reason: next.reason, evidenceFingerprint, appliedRuleIds: [...RULE_IDS] });
      this.write(next);
      this.orchestrator.recordReadOnlyAttachBlocked(evidenceFingerprint, next.reason, next.nextAction, now);
      return next;
    }
    if (!(diagnostics.crmTabFound && diagnostics.eneaTabFound && diagnostics.crmDomVerified && diagnostics.eneaDomVerified)) {
      if (diagnostics.errorCode === null) throw new Error("enea_real_readonly_attach_observation_incomplete");
      if (diagnostics.errorCode !== "required_tabs_not_visible") throw new Error("enea_real_readonly_attach_missing_tabs_evidence_invalid");
      next.status = "technical_block";
      next.reason = "Controller collegato al profilo Chrome Default, ma enumera soltanto la finestra di aggancio about:blank; le schede CRM ed ENEA non sono presenti nell'istanza controllabile.";
      next.nextAction = "Nella nuova finestra Chrome Default aprire manualmente una scheda ENEA e una CRM, poi lasciare entrambe aperte; APR riprenderà con sola lettura.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "technical_block", reason: next.reason, evidenceFingerprint, appliedRuleIds: [...RULE_IDS] });
      this.write(next);
      this.orchestrator.recordReadOnlyAttachBlocked(evidenceFingerprint, next.reason, next.nextAction, now);
      return next;
    }
    if (!(diagnostics.chromeRunning && diagnostics.extensionInstalled && diagnostics.extensionEnabled && diagnostics.nativeHostCorrect && diagnostics.crmTabFound && diagnostics.eneaTabFound && diagnostics.crmDomVerified && diagnostics.eneaDomVerified && diagnostics.errorCode === null)) throw new Error("enea_real_readonly_attach_observation_incomplete");
    next.revision += 1; next.phase = "completed"; next.status = "completed_readonly_attach";
    next.reason = "Sessione Chrome Default e DOM già caricati CRM/ENEA verificati esclusivamente in lettura; nessuna navigazione o richiesta emessa.";
    next.nextAction = "Accodare separatamente il gate server read-only GET/HEAD; pratiche e mutazioni restano bloccate.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "attach_completed", reason: next.reason, evidenceFingerprint, appliedRuleIds: [...RULE_IDS] });
    this.write(next);
    this.orchestrator.recordReadOnlyAttachCompleted(evidenceFingerprint, now);
    return next;
  }

  snapshot(now = new Date()) {
    const state = this.load(now);
    return { ...state, transportChecksPassed: state.diagnostics ? [state.diagnostics.chromeRunning, state.diagnostics.extensionInstalled, state.diagnostics.extensionEnabled, state.diagnostics.nativeHostCorrect].filter(Boolean).length : 0,
      lastEvent: state.audit.at(-1)!, observedAt: now.toISOString() };
  }
}
