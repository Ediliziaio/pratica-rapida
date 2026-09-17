import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";

export const APR_CRM_AUTH_STATE_VERSION = "apr-crm-auth-state-v1" as const;
export const APR_CRM_KEYCHAIN_SERVICE = "it.praticarapida.apr.crm.session";
export const APR_CRM_KEYCHAIN_ACCOUNT = "apr-crm-refresh-session";
export const APR_CRM_SUPABASE_ORIGIN = "https://xmkjrhwmmuzaqjqlvzxm.supabase.co";
export const APR_CRM_REFRESH_SERIALIZATION_RULE_ID = "system-apr-crm-refresh-serialization-v1" as const;

const RULE_IDS = [
  "system-apr-crm-dedicated-auth",
  "system-apr-crm-readonly-adapter-contract",
  APR_CRM_REFRESH_SERIALIZATION_RULE_ID,
  "system-atomic-checkpoint-resume",
] as const;
const execFile = promisify(execFileCallback);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const LOGIN_KEYCHAIN_PATH = path.join(homedir(), "Library", "Keychains", "login.keychain-db");
const GLOBAL_REFRESH_LOCK_DIRECTORY = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner", "state", "crm-auth", "refresh.lock");
const REFRESH_LOCK_LEASE_MS = 45_000;
const REFRESH_LOCK_WAIT_MS = 50_000;
const REFRESH_LOCK_POLL_MS = 20;
const TOKEN_REQUEST_TIMEOUT_MS = 15_000;
const KEYCHAIN_WRITE_EXPECT_SCRIPT = `
set timeout 15
log_user 0
if {[gets stdin secret] < 0} { exit 2 }
spawn /usr/bin/security add-generic-password -U -a ${APR_CRM_KEYCHAIN_ACCOUNT} -s ${APR_CRM_KEYCHAIN_SERVICE} -w
expect {
  "password data for new item:" { send -- "$secret\\r"; exp_continue }
  "retype password for new item:" { send -- "$secret\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 3 }
}
`;

export interface AprCrmAuthEvent {
  revision: number;
  at: string;
  type: "initialized" | "configured" | "authenticated" | "session_refreshed" | "login_required";
  reason: string;
  appliedRuleIds: string[];
}

export interface AprCrmAuthState {
  version: typeof APR_CRM_AUTH_STATE_VERSION;
  revision: number;
  status: "unconfigured" | "login_required" | "authenticated";
  transport: "dedicated_supabase_user_session";
  keychainService: typeof APR_CRM_KEYCHAIN_SERVICE;
  supabaseOrigin: typeof APR_CRM_SUPABASE_ORIGIN | null;
  publishableKeyFingerprint: string | null;
  accountEmailMasked: string | null;
  accountFingerprint: string | null;
  tokenExpiresAt: string | null;
  configuredAt: string | null;
  lastVerifiedAt: string | null;
  externalActionAllowed: false;
  readOnlyOnly: true;
  reason: string;
  nextAction: string;
  audit: AprCrmAuthEvent[];
}

interface AprCrmPublicAuthConfig {
  version: "apr-crm-public-auth-config-v1";
  supabaseOrigin: typeof APR_CRM_SUPABASE_ORIGIN;
  publishableKey: string;
}

interface StoredRefreshSession {
  version: "apr-crm-keychain-session-v1";
  email: string;
  refreshToken: string;
}

interface SupabaseTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: { id?: string; email?: string };
  error?: string;
  error_description?: string;
  msg?: string;
}

interface AprCrmAuthOptions {
  refreshLockDirectory?: string;
  refreshLockWaitMs?: number;
  refreshLockPollMs?: number;
  tokenRequestTimeoutMs?: number;
}

class AprCrmAuthServerRejectedError extends Error {
  constructor(readonly status: number, readonly serverReason: string) {
    super(`crm_auth_server_rejected:${status}:${serverReason}`);
  }
}

export interface AprSecretStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  delete(): Promise<void>;
}

export class MacOsKeychainSecretStore implements AprSecretStore {
  constructor(readonly helperPath = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner", "state", "crm-auth", "keychain-write.exp")) {}

  async get() {
    if (process.platform !== "darwin") throw new Error("keychain_platform_unsupported");
    try {
      const result = await execFile("/usr/bin/security", ["find-generic-password", "-a", APR_CRM_KEYCHAIN_ACCOUNT, "-s", APR_CRM_KEYCHAIN_SERVICE, "-w", LOGIN_KEYCHAIN_PATH], { encoding: "utf8" });
      return result.stdout.trim() || null;
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 44) return null;
      throw new Error("keychain_read_failed");
    }
  }

  async set(value: string) {
    if (process.platform !== "darwin") throw new Error("keychain_platform_unsupported");
    await new Promise<void>((resolve, reject) => {
      // Expect crea il PTY richiesto da `security -w` e riceve il segreto solo
      // da stdin. Il refresh token non compare in argv, output o file.
      if (!existsSync(this.helperPath) || readFileSync(this.helperPath, "utf8") !== KEYCHAIN_WRITE_EXPECT_SCRIPT) atomicWrite(this.helperPath, KEYCHAIN_WRITE_EXPECT_SCRIPT);
      const child = spawn("/usr/bin/expect", ["-f", this.helperPath], { stdio: ["pipe", "ignore", "ignore"] });
      child.once("error", () => reject(new Error("keychain_write_failed")));
      child.once("close", (code) => code === 0 ? resolve() : reject(new Error("keychain_write_failed")));
      child.stdin.end(`${value}\n`);
    });
  }

  async delete() {
    if (process.platform !== "darwin") throw new Error("keychain_platform_unsupported");
    try {
      await execFile("/usr/bin/security", ["delete-generic-password", "-a", APR_CRM_KEYCHAIN_ACCOUNT, "-s", APR_CRM_KEYCHAIN_SERVICE, LOGIN_KEYCHAIN_PATH], { encoding: "utf8" });
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== 44) throw new Error("keychain_delete_failed");
    }
  }
}

export type AprCrmAuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directoryDescriptor = openSync(path.dirname(target), "r");
  try { fsyncSync(directoryDescriptor); }
  finally { closeSync(directoryDescriptor); }
}

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return "account non valido";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

function isAnonPublishableJwt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string; ref?: string };
    return payload.role === "anon" && payload.ref === "xmkjrhwmmuzaqjqlvzxm";
  } catch { return false; }
}

function validState(value: AprCrmAuthState) {
  return value.version === APR_CRM_AUTH_STATE_VERSION
    && value.transport === "dedicated_supabase_user_session"
    && value.externalActionAllowed === false
    && value.readOnlyOnly === true
    && value.keychainService === APR_CRM_KEYCHAIN_SERVICE
    && ["unconfigured", "login_required", "authenticated"].includes(value.status)
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((id) => registryRule(id)));
}

function initialState(now: Date): AprCrmAuthState {
  const reason = "Accesso CRM dedicato APR non configurato; nessuna sessione persistente disponibile.";
  return {
    version: APR_CRM_AUTH_STATE_VERSION,
    revision: 0,
    status: "unconfigured",
    transport: "dedicated_supabase_user_session",
    keychainService: APR_CRM_KEYCHAIN_SERVICE,
    supabaseOrigin: null,
    publishableKeyFingerprint: null,
    accountEmailMasked: null,
    accountFingerprint: null,
    tokenExpiresAt: null,
    configuredAt: null,
    lastVerifiedAt: null,
    externalActionAllowed: false,
    readOnlyOnly: true,
    reason,
    nextAction: "Configurare origine e chiave pubblicabile dal bundle CRM pubblico; nessuna credenziale viene letta da Chrome.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", reason, appliedRuleIds: [...RULE_IDS] }],
  };
}

export class PersistentAprCrmAuth {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly configPath: string;
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  readonly secretStore: AprSecretStore;
  readonly fetcher: AprCrmAuthFetch;
  readonly refreshLockDirectory: string;
  readonly refreshLockWaitMs: number;
  readonly refreshLockPollMs: number;
  readonly tokenRequestTimeoutMs: number;

  constructor(
    readonly rootDirectory: string,
    secretStore?: AprSecretStore,
    fetcher: AprCrmAuthFetch = fetch,
    options: AprCrmAuthOptions = {},
  ) {
    this.directory = path.join(path.resolve(rootDirectory), "crm-auth");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.configPath = path.join(this.directory, "public-auth-config.json");
    this.secretStore = secretStore ?? new MacOsKeychainSecretStore(path.join(this.directory, "keychain-write.exp"));
    this.fetcher = fetcher;
    this.refreshLockDirectory = path.resolve(options.refreshLockDirectory
      ?? (secretStore ? path.join(this.directory, "refresh.lock") : GLOBAL_REFRESH_LOCK_DIRECTORY));
    this.refreshLockWaitMs = Math.max(0, options.refreshLockWaitMs ?? REFRESH_LOCK_WAIT_MS);
    this.refreshLockPollMs = Math.max(1, options.refreshLockPollMs ?? REFRESH_LOCK_POLL_MS);
    this.tokenRequestTimeoutMs = Math.max(1, options.tokenRequestTimeoutMs ?? TOKEN_REQUEST_TIMEOUT_MS);
  }

  private async withRefreshLock<T>(action: () => Promise<T>): Promise<T> {
    const ownerId = `crm-refresh:${process.pid}:${crypto.randomUUID()}`;
    const parent = path.dirname(this.refreshLockDirectory);
    const staleDirectory = path.join(parent, "stale-refresh-locks");
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    mkdirSync(staleDirectory, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + this.refreshLockWaitMs;
    while (true) {
      try {
        mkdirSync(this.refreshLockDirectory, { mode: 0o700 });
        atomicWrite(path.join(this.refreshLockDirectory, "owner.json"), `${JSON.stringify({
          ownerId,
          pid: process.pid,
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + REFRESH_LOCK_LEASE_MS).toISOString(),
          appliedRuleIds: [APR_CRM_REFRESH_SERIALIZATION_RULE_ID],
        }, null, 2)}\n`);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "unknown";
        if (code !== "EEXIST") throw new Error(`crm_auth_refresh_lock_failed:${code}`);
        let expiresAt = 0;
        try {
          const owner = JSON.parse(readFileSync(path.join(this.refreshLockDirectory, "owner.json"), "utf8")) as { expiresAt?: string };
          expiresAt = Date.parse(owner.expiresAt ?? "");
        } catch {
          try { expiresAt = statSync(this.refreshLockDirectory).mtimeMs + REFRESH_LOCK_LEASE_MS; }
          catch { continue; }
        }
        if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
          try {
            renameSync(this.refreshLockDirectory, path.join(staleDirectory, `refresh-lock-${Date.now()}-${crypto.randomUUID()}`));
            continue;
          } catch { /* un altro processo ha gia acquisito o recuperato il lock */ }
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("crm_auth_refresh_lock_busy");
        await new Promise((resolve) => setTimeout(resolve, Math.min(this.refreshLockPollMs, remaining)));
      }
    }
    try { return await action(); }
    finally {
      try {
        const owner = JSON.parse(readFileSync(path.join(this.refreshLockDirectory, "owner.json"), "utf8")) as { ownerId?: string };
        if (owner.ownerId === ownerId) {
          unlinkSync(path.join(this.refreshLockDirectory, "owner.json"));
          rmdirSync(this.refreshLockDirectory);
        }
      } catch { /* un recupero stale non deve consentire al vecchio owner di cancellare il lock nuovo */ }
    }
  }

  load(now = new Date()): AprCrmAuthState {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmAuthState;
      return validState(value) ? value : initialState(now);
    } catch { return initialState(now); }
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.writeState(state);
    return state;
  }

  private writeState(state: AprCrmAuthState) {
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  private loadConfig(): AprCrmPublicAuthConfig {
    let config: AprCrmPublicAuthConfig;
    try { config = JSON.parse(readFileSync(this.configPath, "utf8")) as AprCrmPublicAuthConfig; }
    catch { throw new Error("crm_auth_not_configured"); }
    if (config.version !== "apr-crm-public-auth-config-v1"
      || config.supabaseOrigin !== APR_CRM_SUPABASE_ORIGIN
      || !isAnonPublishableJwt(config.publishableKey)) throw new Error("crm_auth_config_invalid");
    return config;
  }

  configure(supabaseOrigin: string, publishableKey: string, now = new Date()) {
    if (supabaseOrigin !== APR_CRM_SUPABASE_ORIGIN || !isAnonPublishableJwt(publishableKey)) throw new Error("crm_auth_public_config_rejected");
    const config: AprCrmPublicAuthConfig = { version: "apr-crm-public-auth-config-v1", supabaseOrigin, publishableKey };
    atomicWrite(this.configPath, `${JSON.stringify(config, null, 2)}\n`);
    const current = this.initialize(now);
    const fingerprint = sha256(publishableKey);
    if (current.publishableKeyFingerprint === fingerprint && current.status !== "unconfigured") return current;
    const next = structuredClone(current);
    next.revision += 1;
    next.status = "login_required";
    next.supabaseOrigin = APR_CRM_SUPABASE_ORIGIN;
    next.publishableKeyFingerprint = fingerprint;
    next.configuredAt = now.toISOString();
    next.reason = "Trasporto autenticato APR configurato; sessione utente dedicata ancora assente.";
    next.nextAction = "Aprire la pagina locale /auth/crm e inserire personalmente email e password CRM.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "configured", reason: next.reason, appliedRuleIds: [...RULE_IDS] });
    return this.writeState(next);
  }

  configureFromPublicBundle(bundlePath: string, now = new Date()) {
    const bundle = readFileSync(path.resolve(bundlePath), "utf8");
    if (!bundle.includes(APR_CRM_SUPABASE_ORIGIN)) throw new Error("crm_auth_origin_not_found_in_bundle");
    const candidates = [...new Set(bundle.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [])].filter(isAnonPublishableJwt);
    if (candidates.length !== 1) throw new Error(`crm_auth_publishable_key_count:${candidates.length}`);
    return this.configure(APR_CRM_SUPABASE_ORIGIN, candidates[0], now);
  }

  private async tokenRequest(body: Record<string, string>) {
    const config = this.loadConfig();
    const grantType = body.password ? "password" : "refresh_token";
    let response: Response;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.tokenRequestTimeoutMs);
    try {
      response = await this.fetcher(`${config.supabaseOrigin}/auth/v1/token?grant_type=${grantType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.publishableKey },
        body: JSON.stringify(body),
        redirect: "error",
        signal: controller.signal,
      });
    } catch (error) {
      const reason = timedOut ? "timeout" : "network_error";
      throw new Error(`crm_auth_transport_unavailable:${reason}`);
    } finally {
      clearTimeout(timeout);
    }
    let payload: SupabaseTokenResponse = {};
    try { payload = await response.json() as SupabaseTokenResponse; }
    catch { /* errore server senza corpo JSON */ }
    if (!response.ok || !payload.access_token || !payload.refresh_token) {
      const serverReason = payload.error_description ?? payload.msg ?? payload.error ?? `http_${response.status}`;
      throw new AprCrmAuthServerRejectedError(response.status, serverReason.replace(/[^a-zA-Z0-9 _.-]/g, "").slice(0, 100));
    }
    const expiresAt = payload.expires_at
      ? payload.expires_at * 1_000
      : Date.now() + Math.max(60, Number(payload.expires_in ?? 3600)) * 1_000;
    return { payload, expiresAt };
  }

  private async recordAuthenticated(email: string, accessToken: string, refreshToken: string, expiresAt: number, type: "authenticated" | "session_refreshed", now: Date) {
    const current = this.load(now);
    const next = structuredClone(current);
    next.revision += 1;
    next.status = "authenticated";
    next.accountEmailMasked = maskEmail(email);
    next.accountFingerprint = sha256(email.trim().toLowerCase());
    next.tokenExpiresAt = new Date(expiresAt).toISOString();
    next.lastVerifiedAt = now.toISOString();
    next.reason = type === "authenticated"
      ? "Sessione utente APR autenticata dal server e refresh token custodito nel Portachiavi macOS."
      : "Sessione utente APR ripresa e rinnovata dal Portachiavi con prova server valida.";
    next.nextAction = "Mantenere l’adattatore CRM in sola lettura; il gate pratiche resta chiuso finché acquisizione e validazioni reali non sono verificate.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type, reason: next.reason, appliedRuleIds: [...RULE_IDS] });
    await this.secretStore.set(JSON.stringify({ version: "apr-crm-keychain-session-v1", email, refreshToken } satisfies StoredRefreshSession));
    this.accessToken = accessToken;
    this.accessTokenExpiresAt = expiresAt;
    return this.writeState(next);
  }

  async authenticate(email: string, password: string, now = new Date()) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail) || password.length < 1 || password.length > 4096) throw new Error("crm_auth_credentials_invalid");
    return this.withRefreshLock(async () => {
      const { payload, expiresAt } = await this.tokenRequest({ email: normalizedEmail, password });
      const serverEmail = payload.user?.email?.trim().toLowerCase();
      if (serverEmail && serverEmail !== normalizedEmail) throw new Error("crm_auth_identity_mismatch");
      return this.recordAuthenticated(normalizedEmail, payload.access_token!, payload.refresh_token!, expiresAt, "authenticated", now);
    });
  }

  private async readStoredSession() {
    const stored = await this.secretStore.get();
    if (!stored) return null;
    try {
      const session = JSON.parse(stored) as StoredRefreshSession;
      if (session.version !== "apr-crm-keychain-session-v1" || !session.email || !session.refreshToken) return null;
      return session;
    } catch { return null; }
  }

  private async recordLoginRequired(reason: string, now: Date, deleteSecret: boolean) {
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    if (deleteSecret) await this.secretStore.delete();
    const current = this.load(now);
    const next = structuredClone(current);
    next.revision += 1;
    next.status = "login_required";
    next.tokenExpiresAt = null;
    next.lastVerifiedAt = now.toISOString();
    next.reason = reason;
    next.nextAction = "Aprire /auth/crm e inserire nuovamente le credenziali; nessuna pratica viene acquisita nel frattempo.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "login_required", reason, appliedRuleIds: [...RULE_IDS] });
    return this.writeState(next);
  }

  async maintainSession(now = new Date()) {
    const current = this.load(now);
    if (current.status === "unconfigured") return current;
    if (this.accessToken && this.accessTokenExpiresAt - now.getTime() > 5 * 60_000) return current;
    return this.withRefreshLock(async () => {
      if (this.accessToken && this.accessTokenExpiresAt - now.getTime() > 5 * 60_000) return this.load(now);
      let stored = await this.readStoredSession();
      if (!stored) return current.status === "login_required"
        ? current
        : this.recordLoginRequired("Sessione APR non presente nel Portachiavi macOS.", now, false);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const { payload, expiresAt } = await this.tokenRequest({ refresh_token: stored.refreshToken });
          const serverEmail = payload.user?.email?.trim().toLowerCase();
          if (serverEmail && serverEmail !== stored.email.trim().toLowerCase()) throw new Error("crm_auth_identity_mismatch");
          return await this.recordAuthenticated(stored.email, payload.access_token!, payload.refresh_token!, expiresAt, "session_refreshed", now);
        } catch (error) {
          if (!(error instanceof AprCrmAuthServerRejectedError)) throw error;
          if (![400, 401].includes(error.status)) throw new Error(`crm_auth_refresh_transient:http_${error.status}`);
          const latest = await this.readStoredSession();
          if (attempt === 0 && latest && latest.refreshToken !== stored.refreshToken) {
            stored = latest;
            continue;
          }
          return this.recordLoginRequired("Il server CRM ha rifiutato definitivamente il refresh token APR corrente; nuovo login necessario.", now, true);
        }
      }
      throw new Error("crm_auth_refresh_retry_exhausted");
    });
  }

  async acquireAccessToken(now = new Date()) {
    await this.maintainSession(now);
    if (!this.accessToken || this.accessTokenExpiresAt <= now.getTime() + 60_000) throw new Error("crm_auth_access_token_unavailable");
    return this.accessToken;
  }

  async readOnlyGet(pathname: string, searchParams: URLSearchParams, now = new Date()) {
    if (pathname !== "/rest/v1/enea_practices_public") throw new Error("crm_readonly_path_rejected");
    const config = this.loadConfig();
    const accessToken = await this.acquireAccessToken(now);
    const url = new URL(pathname, config.supabaseOrigin);
    url.search = searchParams.toString();
    return this.fetcher(url.toString(), {
      method: "GET",
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error",
    });
  }

  async readOnlyStorageGet(bucket: "enea-documents", objectPath: string, now = new Date()) {
    if (bucket !== "enea-documents") throw new Error("crm_readonly_bucket_rejected");
    if (objectPath.startsWith("/") || objectPath.includes("\\") || objectPath.includes("\0") || objectPath.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error("crm_readonly_object_path_rejected");
    }
    const segments = objectPath.split("/");
    if (!/^[a-f0-9-]{36}$/i.test(segments[0]) || !/\.(?:pdf|png|jpe?g)$/i.test(segments.at(-1)!)) throw new Error("crm_readonly_object_path_rejected");
    const config = this.loadConfig();
    const accessToken = await this.acquireAccessToken(now);
    const encodedPath = segments.map(encodeURIComponent).join("/");
    const url = new URL(`/storage/v1/object/authenticated/${bucket}/${encodedPath}`, config.supabaseOrigin);
    return this.fetcher(url.toString(), {
      method: "GET",
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${accessToken}`, Accept: "application/pdf,image/png,image/jpeg,application/octet-stream" },
      redirect: "error",
    });
  }

  snapshot(now = new Date()) {
    const state = this.load(now);
    return { ...state, lastEvent: state.audit.at(-1)!, observedAt: now.toISOString(), credentialsStoredInCheckpoint: false, accessTokenExposed: false };
  }
}

export function constantTimeTokenMatch(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
