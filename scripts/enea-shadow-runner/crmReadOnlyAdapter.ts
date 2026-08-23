import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APR_CRM_READONLY_CAPABILITIES, APR_CRM_READONLY_CONFIG_VERSION, validateAprCrmReadOnlyConfig, validateAprCrmReadOnlyExchange,
  type AprCrmReadOnlyConfig, type AprCrmReadOnlyFixture } from "../../src/features/enea-shadow-crm/aprCrmReadOnlyContract";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";

export const APR_CRM_READONLY_ADAPTER_STATE_VERSION = "apr-crm-readonly-adapter-state-v1" as const;
const RULE_IDS = ["system-apr-crm-readonly-adapter-contract", "system-apr-crm-integration-boundary", "system-readonly-adapter-contract", "system-atomic-checkpoint-resume"];
export interface AprCrmReadOnlyEvidence { capability: string; requestId: string; method: "GET" | "HEAD"; pathname: string; status: number; contentType: string; byteLength: number; sha256: string; transport: "local_fixture" | "browser_visible_dom" | "public_rest_readonly" | "authenticated_rest_readonly"; }
export interface AprCrmBrowserBootstrapObservation {
  observedAt: string;
  crmOrigin: "https://app.praticarapida.it";
  pathname: "/kanban";
  title: string;
  authenticated: true;
  expectedCandidateCount: 5;
  matchedCandidateCount: 5;
  candidateFingerprint: string;
  browserEvidenceFingerprint: string;
  publicRestProbe: { origin: "https://xmkjrhwmmuzaqjqlvzxm.supabase.co"; status: 200; rowCount: number; bodySha256: string; publishableKeyFingerprint: string };
}
export interface AprCrmAuthenticatedReadOnlyObservation {
  observedAt: string;
  origin: "https://xmkjrhwmmuzaqjqlvzxm.supabase.co";
  candidateFingerprint: string;
  acquiredCount: number;
  blockedCount: number;
  dossierEvidence: Array<{ customerKey: string; responseSha256: string }>;
}
export interface AprCrmReadOnlyAdapterState {
  version: typeof APR_CRM_READONLY_ADAPTER_STATE_VERSION;
  revision: number;
  status: "unconfigured" | "configured_local_only" | "fixture_verified" | "authenticated_readonly_verified" | "blocked";
  integration: "contract_only_not_real" | "browser_bootstrap_only" | "authenticated_rest_readonly";
  operationalGate: "blocked_adapters_unverified";
  externalActionAllowed: false;
  queueMayRun: false;
  configPath: string | null;
  configFingerprint: string | null;
  adapterId: string | null;
  workspaceIdentity: string | null;
  fixtureId: string | null;
  fixtureFingerprint: string | null;
  evidence: AprCrmReadOnlyEvidence[];
  validationErrors: string[];
  reason: string;
  nextAction: string;
  audit: Array<{ revision: number; at: string; type: "initialized" | "configured" | "fixture_verified" | "browser_bootstrap_blocked" | "authenticated_readonly_verified" | "blocked"; reason: string; appliedRuleIds: string[] }>;
}
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600); try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target); const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}
const initialState = (now: Date): AprCrmReadOnlyAdapterState => ({ version: APR_CRM_READONLY_ADAPTER_STATE_VERSION, revision: 0, status: "unconfigured",
  integration: "contract_only_not_real", operationalGate: "blocked_adapters_unverified", externalActionAllowed: false, queueMayRun: false,
  configPath: null, configFingerprint: null, adapterId: null, workspaceIdentity: null, fixtureId: null, fixtureFingerprint: null, evidence: [], validationErrors: [],
  reason: "Adapter CRM APR non configurato; nessuna integrazione reale esiste.", nextAction: "Caricare e verificare soltanto configurazione e fixture locali.",
  audit: [{ revision: 0, at: now.toISOString(), type: "initialized", reason: "Stato adapter CRM read-only locale inizializzato fail-closed.", appliedRuleIds: RULE_IDS }] });
function validState(value: AprCrmReadOnlyAdapterState) { return value.version === APR_CRM_READONLY_ADAPTER_STATE_VERSION && value.externalActionAllowed === false
  && value.queueMayRun === false && value.operationalGate === "blocked_adapters_unverified" && ["contract_only_not_real", "browser_bootstrap_only", "authenticated_rest_readonly"].includes(value.integration)
  && value.audit.every((event) => event.appliedRuleIds.every((id) => registryRule(id))); }

export class PersistentAprCrmReadOnlyAdapter {
  readonly file: string;
  private cachedSignature: string | null = null;
  private cachedState: AprCrmReadOnlyAdapterState | null = null;
  constructor(readonly rootDirectory: string) { this.file = path.join(path.resolve(rootDirectory), "crm-readonly-adapter", "checkpoint.json"); }
  private signature() {
    const stat = statSync(this.file);
    return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  }
  load(now = new Date()): AprCrmReadOnlyAdapterState {
    if (!existsSync(this.file)) return initialState(now);
    try {
      const signature = this.signature();
      if (this.cachedState && this.cachedSignature === signature) return this.cachedState;
      const value = JSON.parse(readFileSync(this.file, "utf8")) as AprCrmReadOnlyAdapterState;
      const state = validState(value) ? value : initialState(now);
      this.cachedSignature = signature;
      this.cachedState = state;
      return state;
    } catch {
      this.cachedSignature = null;
      this.cachedState = null;
      return initialState(now);
    }
  }
  private write(state: AprCrmReadOnlyAdapterState) {
    atomicWrite(this.file, `${JSON.stringify(state, null, 2)}\n`);
    this.cachedSignature = this.signature();
    this.cachedState = state;
    return state;
  }
  initialize(now = new Date()) { const existing = this.load(now); if (existsSync(this.file)) return existing; return this.write(existing); }
  configureFromFile(configPath: string, now = new Date()) {
    this.initialize(now); const resolved = path.resolve(configPath); let config: AprCrmReadOnlyConfig;
    try { config = JSON.parse(readFileSync(resolved, "utf8")) as AprCrmReadOnlyConfig; } catch { return this.block(["config_unreadable"], now); }
    const errors = validateAprCrmReadOnlyConfig(config); if (errors.length) return this.block(errors, now);
    const current = this.load(now); const serialized = JSON.stringify(config); if (current.configFingerprint === sha256(serialized) && current.status !== "blocked") return current;
    const next = structuredClone(current); next.revision += 1; next.status = "configured_local_only"; next.configPath = resolved;
    next.configFingerprint = sha256(serialized); next.adapterId = config.adapterId; next.workspaceIdentity = config.workspaceIdentity;
    next.fixtureId = null; next.fixtureFingerprint = null; next.evidence = []; next.validationErrors = []; next.reason = "Configurazione CRM read-only locale valida; integrazione reale assente e gate chiuso.";
    next.nextAction = "Validare la fixture locale completa; non collegare CRM reale.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "configured", reason: next.reason, appliedRuleIds: RULE_IDS }); return this.write(next);
  }
  verifyFixture(fixture: AprCrmReadOnlyFixture, now = new Date()) {
    const current = this.load(now); if (!current.configPath) return this.block(["config_not_loaded"], now);
    const fixtureFingerprint = sha256(JSON.stringify(fixture));
    if (current.status === "fixture_verified" && current.fixtureId === fixture.fixtureId && current.fixtureFingerprint === fixtureFingerprint) return current;
    let config: AprCrmReadOnlyConfig; try { config = JSON.parse(readFileSync(current.configPath, "utf8")) as AprCrmReadOnlyConfig; } catch { return this.block(["config_unreadable"], now); }
    const errors = validateAprCrmReadOnlyConfig(config);
    if (fixture.version !== "apr-crm-readonly-fixture-v1" || fixture.adapterId !== config.adapterId || fixture.workspaceIdentity !== config.workspaceIdentity) errors.push("fixture_identity_mismatch");
    const capabilities = new Set<string>();
    for (const exchange of fixture.exchanges ?? []) { capabilities.add(exchange.request.capability); errors.push(...validateAprCrmReadOnlyExchange(config, exchange)); }
    for (const capability of APR_CRM_READONLY_CAPABILITIES) if (!capabilities.has(capability)) errors.push(`fixture_capability_missing:${capability}`);
    if (new Set(fixture.exchanges.map((exchange) => exchange.request.id)).size !== fixture.exchanges.length) errors.push("fixture_request_id_duplicate");
    if (errors.length) return this.block([...new Set(errors)], now);
    const next = structuredClone(current); next.revision += 1; next.status = "fixture_verified"; next.fixtureId = fixture.fixtureId; next.fixtureFingerprint = fixtureFingerprint; next.validationErrors = [];
    next.evidence = fixture.exchanges.map((exchange) => { const url = new URL(exchange.request.url); return { capability: exchange.request.capability,
      requestId: exchange.request.id, method: exchange.request.method as "GET" | "HEAD", pathname: url.pathname, status: exchange.response.status,
      contentType: exchange.response.contentType, byteLength: Buffer.byteLength(exchange.response.body, "utf8"), sha256: sha256(exchange.response.body), transport: "local_fixture" }; });
    next.reason = "Fixture CRM read-only completa e verificata; questo non costituisce integrazione CRM reale.";
    next.nextAction = "Mantenere il gate globale chiuso; un futuro adapter reale richiederà verifica e autorizzazione separate.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "fixture_verified", reason: next.reason, appliedRuleIds: RULE_IDS }); return this.write(next);
  }
  recordBrowserBootstrapBlocked(observation: AprCrmBrowserBootstrapObservation, now = new Date()) {
    const errors: string[] = [];
    if (!Number.isFinite(Date.parse(observation.observedAt))) errors.push("browser_observed_at_invalid");
    if (observation.crmOrigin !== "https://app.praticarapida.it" || observation.pathname !== "/kanban") errors.push("browser_origin_or_path_invalid");
    if (observation.authenticated !== true || !observation.title.includes("Pratica Rapida")) errors.push("browser_authentication_unverified");
    if (observation.expectedCandidateCount !== 5 || observation.matchedCandidateCount !== 5) errors.push("pilot_candidates_not_all_visible");
    if (![observation.candidateFingerprint, observation.browserEvidenceFingerprint, observation.publicRestProbe.bodySha256, observation.publicRestProbe.publishableKeyFingerprint].every((value) => /^[a-f0-9]{64}$/.test(value))) errors.push("evidence_fingerprint_invalid");
    if (observation.publicRestProbe.origin !== "https://xmkjrhwmmuzaqjqlvzxm.supabase.co" || observation.publicRestProbe.status !== 200) errors.push("public_rest_probe_invalid");
    if (errors.length) return this.block(errors, now);
    const current = this.initialize(now);
    const observationFingerprint = sha256(JSON.stringify(observation));
    if (current.integration === "browser_bootstrap_only" && current.fixtureFingerprint === observationFingerprint) return current;
    const next = structuredClone(current); next.revision += 1; next.status = "blocked"; next.integration = "browser_bootstrap_only";
    next.fixtureId = "real-crm-browser-bootstrap-v1"; next.fixtureFingerprint = observationFingerprint; next.validationErrors = ["persistent_authenticated_transport_unavailable"];
    next.evidence = [
      { capability: "list_incoming_enea_practices", requestId: "crm-browser-visible-pilot-five", method: "GET", pathname: observation.pathname, status: 200, contentType: "text/html", byteLength: 0, sha256: observation.browserEvidenceFingerprint, transport: "browser_visible_dom" },
      { capability: "list_incoming_enea_practices", requestId: "crm-public-rest-rls-probe", method: "GET", pathname: "/rest/v1/enea_practices_public", status: observation.publicRestProbe.status, contentType: "application/json", byteLength: 2, sha256: observation.publicRestProbe.bodySha256, transport: "public_rest_readonly" },
    ];
    next.reason = `Bootstrap CRM reale verificato in sola lettura: sessione autenticata e 5/5 candidati visibili. La prova REST con sola chiave pubblicabile ha restituito ${observation.publicRestProbe.rowCount} righe per effetto RLS; la sessione Chrome non può diventare un trasporto APR persistente senza credenziale dedicata.`;
    next.nextAction = "Configurare una sessione utente APR dedicata nel Portachiavi macOS; non estrarre cookie/token da Chrome e non lavorare pratiche con Codex.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "browser_bootstrap_blocked", reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }
  recordAuthenticatedReadOnly(observation: AprCrmAuthenticatedReadOnlyObservation, now = new Date()) {
    const errors: string[] = [];
    if (!Number.isFinite(Date.parse(observation.observedAt))) errors.push("authenticated_rest_observed_at_invalid");
    if (observation.origin !== "https://xmkjrhwmmuzaqjqlvzxm.supabase.co") errors.push("authenticated_rest_origin_invalid");
    if (!/^[a-f0-9]{64}$/.test(observation.candidateFingerprint)) errors.push("authenticated_rest_candidate_fingerprint_invalid");
    if (!Number.isInteger(observation.acquiredCount) || observation.acquiredCount < 1
      || !Number.isInteger(observation.blockedCount) || observation.blockedCount < 0) errors.push("authenticated_rest_result_count_invalid");
    if (observation.dossierEvidence.length !== observation.acquiredCount || observation.dossierEvidence.some((item) => !item.customerKey || !/^[a-f0-9]{64}$/.test(item.responseSha256))) errors.push("authenticated_rest_dossier_evidence_invalid");
    if (new Set(observation.dossierEvidence.map((item) => item.customerKey)).size !== observation.dossierEvidence.length) errors.push("authenticated_rest_customer_duplicate");
    if (errors.length) return this.block(errors, now);
    const current = this.initialize(now);
    const observationFingerprint = sha256(JSON.stringify({
      origin: observation.origin,
      candidateFingerprint: observation.candidateFingerprint,
      acquiredCount: observation.acquiredCount,
      blockedCount: observation.blockedCount,
      dossierEvidence: [...observation.dossierEvidence].sort((left, right) => left.customerKey.localeCompare(right.customerKey)),
    }));
    if (current.status === "authenticated_readonly_verified" && current.fixtureFingerprint === observationFingerprint) return current;
    const next = structuredClone(current); next.revision += 1; next.status = "authenticated_readonly_verified"; next.integration = "authenticated_rest_readonly";
    next.fixtureId = "real-crm-authenticated-get-v1"; next.fixtureFingerprint = observationFingerprint; next.validationErrors = [];
    next.evidence = observation.dossierEvidence.map((item) => ({ capability: "read_enea_practice_dossier", requestId: `crm-readonly-${item.customerKey}`,
      method: "GET", pathname: "/rest/v1/enea_practices_public", status: 200, contentType: "application/json", byteLength: 0,
      sha256: item.responseSha256, transport: "authenticated_rest_readonly" }));
    next.reason = `Trasporto CRM autenticato verificato realmente in sola lettura: ${observation.acquiredCount} dossier acquisiti e ${observation.blockedCount} ambiguita isolate senza mutazioni.`;
    next.nextAction = "Lavorare localmente i dossier acquisiti; risolvere le ambiguita per-pratica prima di ulteriori GET. Il gate ENEA resta chiuso.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "authenticated_readonly_verified", reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }
  block(errors: string[], now = new Date()) { const current = this.load(now); const validationErrors = [...new Set(errors)];
    if (current.status === "blocked" && JSON.stringify(current.validationErrors) === JSON.stringify(validationErrors)) return current;
    const next = structuredClone(current); next.revision += 1; next.status = "blocked";
    next.validationErrors = validationErrors; next.evidence = []; next.reason = `Adapter CRM locale bloccato: ${next.validationErrors.join(", ")}.`;
    next.nextAction = "Correggere configurazione/fixture locale; nessuna connessione CRM consentita.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "blocked", reason: next.reason, appliedRuleIds: RULE_IDS }); return this.write(next); }
  snapshot(now = new Date()) { const state = this.load(now); return { ...state, evidenceCount: state.evidence.length, lastEvent: state.audit.at(-1)!, observedAt: now.toISOString() }; }
}
