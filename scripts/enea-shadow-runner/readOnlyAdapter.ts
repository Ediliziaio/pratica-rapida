import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  checkBrowserSessionContract,
  browserSessionKeepaliveAllowed,
} from "../../src/features/enea-shadow-crm/browserSessionContract";
import {
  verifyPersistentLabBrowser,
  type PersistentBrowserObservation,
  type PersistentLabBrowserIdentity,
} from "../../src/features/enea-shadow-crm/persistentLabBrowser";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";

export const READ_ONLY_ADAPTER_VERSION = "enea-readonly-adapter-v1" as const;
const MAX_FIXTURE_BODY_BYTES = 1_048_576;

export type ReadOnlySurface = "crm_readonly" | "crm_attachment" | "enea_dashboard" | "enea_summary";
export type ReadOnlyAdapterStatus = "disconnected" | "fixture_verified" | "blocked";

export interface ReadOnlyAdapterRequest {
  id: string;
  method: "GET" | "HEAD" | string;
  url: string;
  surface: ReadOnlySurface;
  action: string;
  purpose: "evidence" | "keepalive";
  body?: string | null;
  headers?: Readonly<Record<string, string>>;
}

export interface LocalFixtureResponse {
  transport: "local_fixture";
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
  serverVerified: boolean;
  observedMutation: boolean;
}

export interface LocalReadOnlyFixture {
  id: string;
  registeredIdentity: PersistentLabBrowserIdentity;
  observation: PersistentBrowserObservation;
  childDocumentSurfaces: readonly { id: string; parentTabId: string }[];
  allowlistedOrigins: Readonly<{ crm: string; enea: string }>;
  exchanges: readonly { request: ReadOnlyAdapterRequest; response: LocalFixtureResponse }[];
}

export interface AdapterEvidence {
  id: string;
  acquiredAt: string;
  fixtureId: string;
  requestId: string;
  method: "GET" | "HEAD";
  surface: ReadOnlySurface;
  purpose: "evidence" | "keepalive";
  origin: string;
  pathname: string;
  status: number;
  contentType: string;
  byteLength: number;
  sha256: string;
  serverVerified: true;
  transport: "local_fixture";
  appliedRuleIds: string[];
}

export interface ReadOnlyAdapterAuditEvent {
  id: string;
  revision: number;
  at: string;
  type: "adapter_initialized" | "fixture_verified" | "browser_readonly_verified" | "adapter_blocked";
  idempotencyKey: string;
  appliedRuleIds: string[];
  reason: string;
  nextAction: string;
}

export interface BrowserReadOnlyAttachmentObservation {
  evidenceId: string;
  observedAt: string;
  method: "GET";
  profileName: string;
  browserIdentityFingerprint: string;
  crmOrigin: string;
  eneaOrigin: string;
  attachmentOrigin: string;
  attachmentBucket: string;
  attachmentContentType: string;
  attachmentObjectDepth: number;
  practiceScoped: true;
  originalAttachment: true;
  readSucceeded: true;
  appliedRuleIds: string[];
}

export interface ReadOnlyAdapterState {
  version: typeof READ_ONLY_ADAPTER_VERSION;
  revision: number;
  status: ReadOnlyAdapterStatus;
  mode: "disconnected" | "local_fixture" | "chrome_readonly";
  operationalGate: "blocked_no_real_adapter";
  queueMayRun: false;
  fixtureId: string | null;
  identityOutcome: "unverified" | "verified_fixture" | "verified_browser" | "blocked";
  identityFingerprint: string | null;
  allowlistedOrigins: string[];
  evidence: AdapterEvidence[];
  keepaliveCount: number;
  lastKeepaliveAt: string | null;
  browserObservation?: BrowserReadOnlyAttachmentObservation;
  reason: string;
  nextAction: string;
  processedIdempotencyKeys: string[];
  audit: ReadOnlyAdapterAuditEvent[];
}

export interface ReadOnlyAdapterSnapshot extends Omit<ReadOnlyAdapterState, "processedIdempotencyKeys" | "audit"> {
  evidenceCount: number;
  lastEvidence: AdapterEvidence | null;
  lastEvent: ReadOnlyAdapterAuditEvent;
  observedAt: string;
}

export class ReadOnlyAdapterBusyError extends Error {
  constructor(message: string) { super(message); this.name = "ReadOnlyAdapterBusyError"; }
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function atomicWrite(target: string, contents: string) {
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directoryDescriptor = openSync(path.dirname(target), "r");
  try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
}

function validRuleIds(ruleIds: readonly string[]) {
  return ruleIds.length > 0 && ruleIds.every((ruleId) => registryRule(ruleId) !== null);
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function identityFingerprint(identity: PersistentLabBrowserIdentity) {
  return sha256(JSON.stringify({
    version: identity.version,
    browserInstanceId: identity.browserInstanceId,
    profileId: identity.profileId,
    profilePath: identity.profilePath,
    crmTabId: identity.crmTabId,
    eneaTabId: identity.eneaTabId,
  }));
}

function initialState(now: Date): ReadOnlyAdapterState {
  const at = now.toISOString();
  const event: ReadOnlyAdapterAuditEvent = {
    id: "adapter-event-00000000-initialized",
    revision: 0,
    at,
    type: "adapter_initialized",
    idempotencyKey: "adapter:init",
    appliedRuleIds: ["system-readonly-adapter-contract", "system-atomic-checkpoint-resume"],
    reason: "Adattatore read-only inizializzato senza collegamenti browser o sistemi esterni.",
    nextAction: "Verificare il contratto con fixture locale; mantenere la coda bloccata.",
  };
  return {
    version: READ_ONLY_ADAPTER_VERSION,
    revision: 0,
    status: "disconnected",
    mode: "disconnected",
    operationalGate: "blocked_no_real_adapter",
    queueMayRun: false,
    fixtureId: null,
    identityOutcome: "unverified",
    identityFingerprint: null,
    allowlistedOrigins: [],
    evidence: [],
    keepaliveCount: 0,
    lastKeepaliveAt: null,
    reason: event.reason,
    nextAction: event.nextAction,
    processedIdempotencyKeys: [event.idempotencyKey],
    audit: [event],
  };
}

function validState(state: ReadOnlyAdapterState): boolean {
  return state.version === READ_ONLY_ADAPTER_VERSION
    && Number.isInteger(state.revision)
    && ["disconnected", "fixture_verified", "blocked"].includes(state.status)
    && state.operationalGate === "blocked_no_real_adapter"
    && state.queueMayRun === false
    && Array.isArray(state.evidence)
    && state.evidence.every((entry) => validRuleIds(entry.appliedRuleIds))
    && Array.isArray(state.audit)
    && state.audit.every((event) => validRuleIds(event.appliedRuleIds))
    && (!state.browserObservation || validRuleIds(state.browserObservation.appliedRuleIds));
}

export interface BrowserReadOnlyVerifiedInput {
  idempotencyKey: string;
  profileName: string;
  browserIdentity: string;
  crmOrigin: string;
  eneaOrigin: string;
  attachmentOrigin: string;
  attachmentBucket: string;
  attachmentContentType: string;
  attachmentObjectDepth: number;
}

function validateFixture(fixture: LocalReadOnlyFixture, now: Date): { ok: true; origins: string[]; fingerprint: string; evidence: AdapterEvidence[] } | { ok: false; reason: string } {
  if (!/^[a-zA-Z0-9._:-]{3,160}$/.test(fixture.id)) return { ok: false, reason: "fixture_id_invalid" };
  const crmOrigin = normalizeOrigin(fixture.allowlistedOrigins.crm);
  const eneaOrigin = normalizeOrigin(fixture.allowlistedOrigins.enea);
  if (!crmOrigin || !eneaOrigin || crmOrigin === eneaOrigin) return { ok: false, reason: "allowlist_invalid" };
  const allowlist = [crmOrigin, eneaOrigin];

  const persistent = verifyPersistentLabBrowser(fixture.registeredIdentity, fixture.observation);
  if (persistent.outcome !== "ready") return { ok: false, reason: `persistent_identity_${persistent.reason}` };
  const browser = checkBrowserSessionContract({
    registeredBrowserInstanceId: fixture.registeredIdentity.browserInstanceId,
    observedBrowserInstanceId: fixture.observation.browserInstanceId,
    registeredProfileId: fixture.registeredIdentity.profileId,
    observedProfileId: fixture.observation.profileId,
    crmTabs: fixture.observation.crmTabIds.map((id) => ({ id, authenticated: fixture.observation.crmAuthenticated })),
    eneaTabs: fixture.observation.eneaTabIds.map((id) => ({ id, authenticated: fixture.observation.eneaAuthenticated })),
    registeredCrmTabId: fixture.registeredIdentity.crmTabId,
    registeredEneaTabId: fixture.registeredIdentity.eneaTabId,
    childDocumentSurfaces: fixture.childDocumentSurfaces,
  });
  if (browser.outcome !== "ready") return { ok: false, reason: `browser_contract_${browser.reason}` };
  if (!fixture.exchanges.length) return { ok: false, reason: "evidence_missing" };

  const requestIds = fixture.exchanges.map((exchange) => exchange.request.id);
  if (new Set(requestIds).size !== requestIds.length) return { ok: false, reason: "duplicate_request_id" };
  const evidence: AdapterEvidence[] = [];
  let keepaliveCount = 0;
  for (const exchange of fixture.exchanges) {
    const { request, response } = exchange;
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") return { ok: false, reason: `mutation_method_${request.id}` };
    if (request.body !== undefined && request.body !== null && request.body !== "") return { ok: false, reason: `request_body_forbidden_${request.id}` };
    if (Object.keys(request.headers ?? {}).some((header) => /^(x-http-method-override|content-length|content-type)$/i.test(header))) return { ok: false, reason: `mutation_header_${request.id}` };
    if (/(submit|salva|invia|modifica|update|delete|create|upload|write|patch|put|post)/i.test(request.action)) return { ok: false, reason: `mutation_intent_${request.id}` };
    const allowedActions: Record<ReadOnlySurface, readonly string[]> = {
      crm_readonly: ["read existing practice index"],
      crm_attachment: ["inspect existing attachment metadata", "read existing attachment"],
      enea_dashboard: ["read existing authenticated dashboard", "verify existing dashboard"],
      enea_summary: ["read existing summary", "verify existing summary"],
    };
    if (!allowedActions[request.surface]?.includes(request.action)) return { ok: false, reason: `action_not_allowlisted_${request.id}` };
    let requestUrl: URL;
    let finalUrl: URL;
    try { requestUrl = new URL(request.url); finalUrl = new URL(response.finalUrl); }
    catch { return { ok: false, reason: `url_invalid_${request.id}` }; }
    if (requestUrl.username || requestUrl.password || requestUrl.search || requestUrl.hash || !allowlist.includes(requestUrl.origin)) return { ok: false, reason: `origin_not_allowlisted_${request.id}` };
    const expectedOrigin = request.surface.startsWith("crm_") ? crmOrigin : eneaOrigin;
    if (requestUrl.origin !== expectedOrigin) return { ok: false, reason: `surface_origin_mismatch_${request.id}` };
    const pathAllowed = request.surface === "crm_readonly" ? requestUrl.pathname.startsWith("/pratiche/")
      : request.surface === "crm_attachment" ? requestUrl.pathname.startsWith("/allegati/")
        : request.surface === "enea_dashboard" ? requestUrl.pathname === "/dashboard"
          : requestUrl.pathname === "/summary";
    if (!pathAllowed) return { ok: false, reason: `path_not_allowlisted_${request.id}` };
    if (finalUrl.username || finalUrl.password || finalUrl.search || finalUrl.hash || finalUrl.origin !== requestUrl.origin || !allowlist.includes(finalUrl.origin)) return { ok: false, reason: `redirect_not_allowlisted_${request.id}` };
    if (finalUrl.pathname !== requestUrl.pathname) return { ok: false, reason: `redirect_path_changed_${request.id}` };
    if (response.transport !== "local_fixture") return { ok: false, reason: `external_transport_forbidden_${request.id}` };
    if (response.status < 200 || response.status >= 300 || !response.serverVerified || response.observedMutation) return { ok: false, reason: `response_not_verified_${request.id}` };
    if (method === "HEAD" && response.body.length > 0) return { ok: false, reason: `head_body_forbidden_${request.id}` };
    const body = Buffer.from(response.body, "utf8");
    if (body.byteLength > MAX_FIXTURE_BODY_BYTES) return { ok: false, reason: `response_too_large_${request.id}` };
    if (!/^(text\/html|application\/json|application\/pdf)(?:;|$)/i.test(response.contentType)) return { ok: false, reason: `content_type_forbidden_${request.id}` };
    if (request.purpose === "keepalive") {
      const surface = request.surface === "enea_dashboard" ? "dashboard" : request.surface === "enea_summary" ? "summary" : null;
      if (!surface || !browserSessionKeepaliveAllowed({ method, surface, action: request.action })) return { ok: false, reason: `keepalive_forbidden_${request.id}` };
      keepaliveCount += 1;
    }
    evidence.push({
      id: `adapter-evidence-${sha256(`${fixture.id}:${request.id}:${sha256(body)}`).slice(0, 24)}`,
      acquiredAt: now.toISOString(),
      fixtureId: fixture.id,
      requestId: request.id,
      method,
      surface: request.surface,
      purpose: request.purpose,
      origin: requestUrl.origin,
      pathname: requestUrl.pathname,
      status: response.status,
      contentType: response.contentType,
      byteLength: body.byteLength,
      sha256: sha256(body),
      serverVerified: true,
      transport: "local_fixture",
      appliedRuleIds: request.purpose === "keepalive"
        ? ["system-readonly-adapter-contract", "system-enea-lease-required", "system-atomic-checkpoint-resume"]
        : ["system-readonly-adapter-contract", "system-atomic-checkpoint-resume"],
    });
  }
  if (keepaliveCount !== 1) return { ok: false, reason: "single_keepalive_required" };
  return { ok: true, origins: allowlist, fingerprint: identityFingerprint(fixture.registeredIdentity), evidence };
}

export class PersistentReadOnlyAdapter {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly lockDirectory: string;

  constructor(rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "read-only-adapter");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.lockDirectory = path.join(this.directory, "transition.lock");
  }

  private ensureDirectories() {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    mkdirSync(path.join(this.directory, "stale-transition-locks"), { recursive: true, mode: 0o700 });
  }

  private loadOrNull(): ReadOnlyAdapterState | null {
    try {
      const state = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as ReadOnlyAdapterState;
      return validState(state) ? state : null;
    } catch { return null; }
  }

  load() {
    const state = this.loadOrNull();
    if (!state) throw new Error(`Checkpoint adattatore non valido in ${this.checkpointPath}.`);
    return state;
  }

  private write(state: ReadOnlyAdapterState) {
    if (!validState(state)) throw new Error("Checkpoint adattatore rifiutato.");
    this.ensureDirectories();
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
  }

  private withLock<T>(ownerId: string, now: Date, action: () => T): T {
    this.ensureDirectories();
    try { mkdirSync(this.lockDirectory, { mode: 0o700 }); }
    catch {
      let lock: { ownerId?: string; expiresAt?: string } = {};
      try { lock = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")); } catch { /* recuperabile */ }
      if (lock.expiresAt && Date.parse(lock.expiresAt) > now.getTime()) throw new ReadOnlyAdapterBusyError("Transizione adattatore già in corso.");
      renameSync(this.lockDirectory, path.join(this.directory, "stale-transition-locks", `lock-${now.getTime()}-${crypto.randomUUID()}`));
      mkdirSync(this.lockDirectory, { mode: 0o700 });
    }
    atomicWrite(path.join(this.lockDirectory, "owner.json"), `${JSON.stringify({ ownerId, expiresAt: new Date(now.getTime() + 10_000).toISOString() })}\n`);
    try { return action(); }
    finally {
      try {
        const lock = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")) as { ownerId?: string };
        if (lock.ownerId === ownerId) { unlinkSync(path.join(this.lockDirectory, "owner.json")); rmdirSync(this.lockDirectory); }
      } catch { /* crash diagnosticabile */ }
    }
  }

  initialize(now = new Date()) {
    this.ensureDirectories();
    const existing = this.loadOrNull();
    if (existing) return existing;
    return this.withLock("adapter-initializer", now, () => {
      const concurrent = this.loadOrNull();
      if (concurrent) return concurrent;
      const state = initialState(now);
      this.write(state);
      return state;
    });
  }

  runLocalFixture(fixture: LocalReadOnlyFixture, idempotencyKey: string, now = new Date()) {
    this.initialize(now);
    return this.withLock(`fixture-${fixture.id}`, now, () => {
      const current = this.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const validation = validateFixture(fixture, now);
      const revision = current.revision + 1;
      const ok = validation.ok;
      const derived = validation.ok
        ? {
          reason: `Fixture locale ${fixture.id} verificata: identità, allowlist e ${validation.evidence.length} prove read-only valide.`,
          identityFingerprint: validation.fingerprint as string | null,
          allowlistedOrigins: validation.origins,
          evidence: validation.evidence,
          keepaliveCount: validation.evidence.filter((entry) => entry.purpose === "keepalive").length,
          lastKeepaliveAt: validation.evidence.find((entry) => entry.purpose === "keepalive")?.acquiredAt ?? null,
        }
        : {
          // Il progetto compila con strict:false: il restringimento del ramo
          // "false" di un'unione discriminata a due membri non e' affidabile
          // in questa configurazione, da qui il cast esplicito verificato dal
          // controllo runtime validation.ok appena eseguito.
          reason: `Fixture locale bloccata: ${(validation as { ok: false; reason: string }).reason}.`,
          identityFingerprint: null as string | null,
          allowlistedOrigins: [] as string[],
          evidence: [] as AdapterEvidence[],
          keepaliveCount: 0,
          lastKeepaliveAt: null as string | null,
        };
      const nextAction = ok
        ? "Osservare prove e keepalive nella dashboard; il gate pratiche resta chiuso senza adattatore reale."
        : "Correggere la fixture o il contratto; non collegare sistemi esterni e non avviare pratiche.";
      const event: ReadOnlyAdapterAuditEvent = {
        id: `adapter-event-${String(revision).padStart(8, "0")}-${ok ? "verified" : "blocked"}`,
        revision,
        at: now.toISOString(),
        type: ok ? "fixture_verified" : "adapter_blocked",
        idempotencyKey,
        appliedRuleIds: ["system-readonly-adapter-contract", "system-atomic-checkpoint-resume"],
        reason: derived.reason,
        nextAction,
      };
      const next: ReadOnlyAdapterState = {
        ...current,
        revision,
        status: ok ? "fixture_verified" : "blocked",
        mode: "local_fixture",
        fixtureId: fixture.id,
        identityOutcome: ok ? "verified_fixture" : "blocked",
        identityFingerprint: derived.identityFingerprint,
        allowlistedOrigins: derived.allowlistedOrigins,
        evidence: derived.evidence,
        keepaliveCount: derived.keepaliveCount,
        lastKeepaliveAt: derived.lastKeepaliveAt,
        reason: derived.reason,
        nextAction,
        processedIdempotencyKeys: [...current.processedIdempotencyKeys, idempotencyKey].slice(-1_000),
        audit: [...current.audit, event].slice(-500),
      };
      this.write(next);
      return next;
    });
  }

  recordConnectionBlock(input: { idempotencyKey: string; reason: string; nextAction: string }, now = new Date()) {
    this.initialize(now);
    return this.withLock("adapter-connection-block", now, () => {
      const current = this.load();
      if (current.processedIdempotencyKeys.includes(input.idempotencyKey)) return current;
      if (!input.reason.trim() || !input.nextAction.trim()) throw new Error("Blocco adattatore privo di motivo o prossima azione.");
      const revision = current.revision + 1;
      const event: ReadOnlyAdapterAuditEvent = {
        id: `adapter-event-${String(revision).padStart(8, "0")}-blocked`,
        revision,
        at: now.toISOString(),
        type: "adapter_blocked",
        idempotencyKey: input.idempotencyKey,
        appliedRuleIds: ["system-readonly-adapter-contract", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
        reason: input.reason,
        nextAction: input.nextAction,
      };
      const next: ReadOnlyAdapterState = {
        ...current,
        revision,
        status: "blocked",
        mode: "disconnected",
        identityOutcome: "blocked",
        identityFingerprint: null,
        allowlistedOrigins: [],
        reason: input.reason,
        nextAction: input.nextAction,
        processedIdempotencyKeys: [...current.processedIdempotencyKeys, input.idempotencyKey].slice(-1_000),
        audit: [...current.audit, event].slice(-500),
      };
      this.write(next);
      return next;
    });
  }

  recordBrowserReadOnlyVerifiedBeforeQueue(input: BrowserReadOnlyVerifiedInput, now = new Date()) {
    this.initialize(now);
    return this.withLock("adapter-browser-readonly", now, () => {
      const current = this.load();
      if (current.processedIdempotencyKeys.includes(input.idempotencyKey)) return current;
      const crmOrigin = normalizeOrigin(input.crmOrigin);
      const eneaOrigin = normalizeOrigin(input.eneaOrigin);
      const attachmentOrigin = normalizeOrigin(input.attachmentOrigin);
      if (!crmOrigin || !eneaOrigin || !attachmentOrigin || new Set([crmOrigin, eneaOrigin, attachmentOrigin]).size !== 3) {
        throw new Error("Osservazione browser con allowlist non valida.");
      }
      if (!input.profileName.trim() || !input.browserIdentity.trim()) throw new Error("Identità browser reale incompleta.");
      if (!/^[a-z0-9-]{3,80}$/i.test(input.attachmentBucket)) throw new Error("Bucket allegato non valido.");
      if (!/^application\/pdf(?:;|$)/i.test(input.attachmentContentType)) throw new Error("Tipo allegato reale non consentito.");
      if (!Number.isInteger(input.attachmentObjectDepth) || input.attachmentObjectDepth < 2) throw new Error("Provenienza allegato non segregata per pratica.");

      const revision = current.revision + 1;
      const appliedRuleIds = ["system-readonly-adapter-contract", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume"];
      const observation: BrowserReadOnlyAttachmentObservation = {
        evidenceId: `browser-evidence-${sha256(`${input.idempotencyKey}:${attachmentOrigin}:${input.attachmentBucket}`).slice(0, 24)}`,
        observedAt: now.toISOString(),
        method: "GET",
        profileName: input.profileName.trim(),
        browserIdentityFingerprint: sha256(input.browserIdentity),
        crmOrigin,
        eneaOrigin,
        attachmentOrigin,
        attachmentBucket: input.attachmentBucket,
        attachmentContentType: input.attachmentContentType,
        attachmentObjectDepth: input.attachmentObjectDepth,
        practiceScoped: true,
        originalAttachment: true,
        readSucceeded: true,
        appliedRuleIds,
      };
      const reason = "Adattatore browser reale verificato in sola lettura: identità/profilo persistenti, origini allowlist e lettura di un solo allegato PDF originario con provenienza segregata per pratica sono confermati. Il gate operativo resta chiuso.";
      const nextAction = "Prima di qualsiasi futura coda, acquisire una lease ENEA read-only fresca e ottenere un'autorizzazione esplicita di avvio; non eseguire preflight o pratiche.";
      const event: ReadOnlyAdapterAuditEvent = {
        id: `adapter-event-${String(revision).padStart(8, "0")}-browser-readonly-verified`,
        revision,
        at: now.toISOString(),
        type: "browser_readonly_verified",
        idempotencyKey: input.idempotencyKey,
        appliedRuleIds,
        reason,
        nextAction,
      };
      const next: ReadOnlyAdapterState = {
        ...current,
        revision,
        status: "blocked",
        mode: "chrome_readonly",
        identityOutcome: "verified_browser",
        identityFingerprint: observation.browserIdentityFingerprint,
        allowlistedOrigins: [crmOrigin, eneaOrigin, attachmentOrigin],
        browserObservation: observation,
        reason,
        nextAction,
        processedIdempotencyKeys: [...current.processedIdempotencyKeys, input.idempotencyKey].slice(-1_000),
        audit: [...current.audit, event].slice(-500),
      };
      this.write(next);
      return next;
    });
  }

  snapshot(now = new Date()): ReadOnlyAdapterSnapshot {
    const state = this.initialize(now);
    const { processedIdempotencyKeys: _processed, audit, ...visible } = state;
    return {
      ...visible,
      evidenceCount: state.evidence.length,
      lastEvidence: state.evidence.at(-1) ?? null,
      lastEvent: audit.at(-1)!,
      observedAt: now.toISOString(),
    };
  }
}
