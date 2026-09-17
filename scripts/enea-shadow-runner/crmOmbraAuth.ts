import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const APR_CRM_OMBRA_ORIGIN = "https://boxvncaqpszeqpofazzr.supabase.co" as const;
export const APR_CRM_OMBRA_PROJECT_REF = "boxvncaqpszeqpofazzr" as const;
export const APR_CRM_OMBRA_EMAIL = "apr@praticarapida.it" as const;
export const APR_CRM_OMBRA_KEYCHAIN_SERVICE = "it.praticarapida.apr.crm-ombra.session" as const;
export const APR_CRM_OMBRA_KEYCHAIN_ACCOUNT = "apr-crm-ombra-refresh-session" as const;
export const APR_CRM_OMBRA_ALLOWED_WRITE_FIELDS = [
  "current_stage_id",
  "note_documenti_mancanti",
  "documenti_mancanti",
  "note_interne",
] as const;

export type AprCrmOmbraAllowedWriteField = typeof APR_CRM_OMBRA_ALLOWED_WRITE_FIELDS[number];
export type AprCrmOmbraPatch = Partial<Record<AprCrmOmbraAllowedWriteField, string | string[] | null>>;

interface AprCrmOmbraPublicConfig {
  version: "apr-crm-ombra-public-config-v1";
  supabaseOrigin: typeof APR_CRM_OMBRA_ORIGIN;
  publishableKey: string;
}

interface StoredShadowSession {
  version: "apr-crm-ombra-keychain-session-v1";
  email: typeof APR_CRM_OMBRA_EMAIL;
  refreshToken: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: { email?: string };
  error?: string;
  error_description?: string;
  msg?: string;
}

export interface AprCrmOmbraSecretStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  delete(): Promise<void>;
}

export type AprCrmOmbraFetch = (input: string, init?: RequestInit) => Promise<Response>;

const execFile = promisify(execFileCallback);
const LOGIN_KEYCHAIN_PATH = path.join(homedir(), "Library", "Keychains", "login.keychain-db");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function decodeJwtPart(value: string) {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { return null; }
}

function isShadowPublishableKey(value: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value)) return true;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const payload = decodeJwtPart(parts[1]);
  return payload?.role === "anon" && payload?.ref === APR_CRM_OMBRA_PROJECT_REF;
}

function safeObjectPath(objectPath: string) {
  if (objectPath.startsWith("/") || objectPath.includes("\\") || objectPath.includes("\0")) return false;
  const segments = objectPath.split("/");
  return /^[a-f0-9-]{36}$/i.test(segments[0] ?? "")
    && segments.every((segment) => Boolean(segment) && segment !== "." && segment !== "..")
    && /\.(?:pdf|png|jpe?g)$/i.test(segments.at(-1) ?? "");
}

function assertAllowedPatch(patch: AprCrmOmbraPatch) {
  const keys = Object.keys(patch);
  if (!keys.length || keys.some((key) => !APR_CRM_OMBRA_ALLOWED_WRITE_FIELDS.includes(key as AprCrmOmbraAllowedWriteField))) {
    throw new Error("crm_ombra_patch_fields_rejected");
  }
}

export class MacOsCrmOmbraKeychainStore implements AprCrmOmbraSecretStore {
  readonly helperPath: string;

  constructor(rootDirectory = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner")) {
    this.helperPath = path.join(rootDirectory, "state", "crm-ombra-auth", "keychain-write.exp");
  }

  async get() {
    if (process.platform !== "darwin") throw new Error("crm_ombra_keychain_platform_unsupported");
    try {
      const result = await execFile("/usr/bin/security", [
        "find-generic-password", "-a", APR_CRM_OMBRA_KEYCHAIN_ACCOUNT,
        "-s", APR_CRM_OMBRA_KEYCHAIN_SERVICE, "-w", LOGIN_KEYCHAIN_PATH,
      ], { encoding: "utf8" });
      return result.stdout.trim() || null;
    } catch (error) {
      if ((error as { code?: number }).code === 44) return null;
      throw new Error("crm_ombra_keychain_read_failed");
    }
  }

  async set(value: string) {
    if (process.platform !== "darwin") throw new Error("crm_ombra_keychain_platform_unsupported");
    const script = `set timeout 15\nlog_user 0\nif {[gets stdin secret] < 0} { exit 2 }\nspawn /usr/bin/security add-generic-password -U -a ${APR_CRM_OMBRA_KEYCHAIN_ACCOUNT} -s ${APR_CRM_OMBRA_KEYCHAIN_SERVICE} -w\nexpect {\n  "password data for new item:" { send -- "$secret\\r"; exp_continue }\n  "retype password for new item:" { send -- "$secret\\r"; exp_continue }\n  eof { set result [wait]; exit [lindex $result 3] }\n  timeout { exit 3 }\n}\n`;
    if (!existsSync(this.helperPath) || readFileSync(this.helperPath, "utf8") !== script) atomicWrite(this.helperPath, script);
    await new Promise<void>((resolve, reject) => {
      const child = spawn("/usr/bin/expect", ["-f", this.helperPath], { stdio: ["pipe", "ignore", "ignore"] });
      child.once("error", () => reject(new Error("crm_ombra_keychain_write_failed")));
      child.once("close", (code) => code === 0 ? resolve() : reject(new Error("crm_ombra_keychain_write_failed")));
      child.stdin.end(`${value}\n`);
    });
  }

  async delete() {
    if (process.platform !== "darwin") throw new Error("crm_ombra_keychain_platform_unsupported");
    try {
      await execFile("/usr/bin/security", [
        "delete-generic-password", "-a", APR_CRM_OMBRA_KEYCHAIN_ACCOUNT,
        "-s", APR_CRM_OMBRA_KEYCHAIN_SERVICE, LOGIN_KEYCHAIN_PATH,
      ], { encoding: "utf8" });
    } catch (error) {
      if ((error as { code?: number }).code !== 44) throw new Error("crm_ombra_keychain_delete_failed");
    }
  }
}

export interface AprCrmOmbraAuthSnapshot {
  transport: "dedicated_shadow_supabase_user_session";
  supabaseOrigin: typeof APR_CRM_OMBRA_ORIGIN;
  email: typeof APR_CRM_OMBRA_EMAIL;
  keychainService: typeof APR_CRM_OMBRA_KEYCHAIN_SERVICE;
  configured: boolean;
  authenticated: boolean;
  publishableKeyFingerprint: string | null;
  tokenExpiresAt: string | null;
  productionWriteAllowed: false;
  externalCommunicationsAllowed: false;
  allowedWriteFields: readonly AprCrmOmbraAllowedWriteField[];
}

export class PersistentAprCrmOmbraAuth {
  readonly configPath: string;
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    rootDirectory: string,
    private readonly secretStore: AprCrmOmbraSecretStore = new MacOsCrmOmbraKeychainStore(rootDirectory),
    private readonly fetcher: AprCrmOmbraFetch = fetch,
  ) {
    this.configPath = path.join(rootDirectory, "state", "crm-ombra-auth", "public-config.json");
  }

  configure(supabaseOrigin: string, publishableKey: string) {
    if (supabaseOrigin !== APR_CRM_OMBRA_ORIGIN || !isShadowPublishableKey(publishableKey)) {
      throw new Error("crm_ombra_public_config_rejected");
    }
    const config: AprCrmOmbraPublicConfig = {
      version: "apr-crm-ombra-public-config-v1",
      supabaseOrigin: APR_CRM_OMBRA_ORIGIN,
      publishableKey,
    };
    atomicWrite(this.configPath, `${JSON.stringify(config, null, 2)}\n`);
    return this.snapshot();
  }

  configureFromPublicBundle(bundlePath: string) {
    const bundle = readFileSync(path.resolve(bundlePath), "utf8");
    if (!bundle.includes(APR_CRM_OMBRA_ORIGIN)) throw new Error("crm_ombra_origin_not_found_in_bundle");
    const candidates = [...new Set(bundle.match(/(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_publishable_[A-Za-z0-9_-]{20,})/g) ?? [])]
      .filter(isShadowPublishableKey);
    if (candidates.length !== 1) throw new Error(`crm_ombra_publishable_key_count:${candidates.length}`);
    return this.configure(APR_CRM_OMBRA_ORIGIN, candidates[0]);
  }

  private loadConfig(): AprCrmOmbraPublicConfig {
    let config: AprCrmOmbraPublicConfig;
    try { config = JSON.parse(readFileSync(this.configPath, "utf8")) as AprCrmOmbraPublicConfig; }
    catch { throw new Error("crm_ombra_auth_not_configured"); }
    if (config.version !== "apr-crm-ombra-public-config-v1"
      || config.supabaseOrigin !== APR_CRM_OMBRA_ORIGIN
      || !isShadowPublishableKey(config.publishableKey)) throw new Error("crm_ombra_auth_config_invalid");
    return config;
  }

  private async tokenRequest(body: Record<string, string>) {
    const config = this.loadConfig();
    const grantType = body.password ? "password" : "refresh_token";
    const response = await this.fetcher(`${APR_CRM_OMBRA_ORIGIN}/auth/v1/token?grant_type=${grantType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.publishableKey },
      body: JSON.stringify(body),
      redirect: "error",
    });
    let payload: TokenResponse = {};
    try { payload = await response.json() as TokenResponse; } catch { /* corpo non JSON */ }
    if (!response.ok || !payload.access_token || !payload.refresh_token) {
      const reason = payload.error_description ?? payload.msg ?? payload.error ?? `http_${response.status}`;
      throw new Error(`crm_ombra_auth_rejected:${response.status}:${reason.replace(/[^a-zA-Z0-9 _.-]/g, "").slice(0, 100)}`);
    }
    const serverEmail = payload.user?.email?.trim().toLowerCase();
    if (serverEmail && serverEmail !== APR_CRM_OMBRA_EMAIL) throw new Error("crm_ombra_identity_mismatch");
    const expiresAt = payload.expires_at
      ? payload.expires_at * 1_000
      : Date.now() + Math.max(60, Number(payload.expires_in ?? 3600)) * 1_000;
    return { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt };
  }

  private async rememberSession(result: { accessToken: string; refreshToken: string; expiresAt: number }) {
    this.accessToken = result.accessToken;
    this.accessTokenExpiresAt = result.expiresAt;
    const stored: StoredShadowSession = {
      version: "apr-crm-ombra-keychain-session-v1",
      email: APR_CRM_OMBRA_EMAIL,
      refreshToken: result.refreshToken,
    };
    await this.secretStore.set(JSON.stringify(stored));
    return this.snapshot();
  }

  async authenticate(password: string) {
    if (!password || password.length > 4096) throw new Error("crm_ombra_password_invalid");
    return this.rememberSession(await this.tokenRequest({ email: APR_CRM_OMBRA_EMAIL, password }));
  }

  async clearSession() {
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    await this.secretStore.delete();
  }

  private async acquireAccessToken(now = new Date()) {
    if (this.accessToken && this.accessTokenExpiresAt > now.getTime() + 60_000) return this.accessToken;
    const raw = await this.secretStore.get();
    if (!raw) throw new Error("crm_ombra_login_required");
    let stored: StoredShadowSession;
    try { stored = JSON.parse(raw) as StoredShadowSession; } catch { throw new Error("crm_ombra_session_invalid"); }
    if (stored.version !== "apr-crm-ombra-keychain-session-v1"
      || stored.email !== APR_CRM_OMBRA_EMAIL
      || !stored.refreshToken) throw new Error("crm_ombra_session_invalid");
    return (await this.rememberSession(await this.tokenRequest({ refresh_token: stored.refreshToken }))).authenticated
      ? this.accessToken!
      : Promise.reject(new Error("crm_ombra_login_required"));
  }

  private async request(pathname: string, init: RequestInit, now = new Date()) {
    const config = this.loadConfig();
    const url = new URL(pathname, APR_CRM_OMBRA_ORIGIN);
    if (url.origin !== APR_CRM_OMBRA_ORIGIN) throw new Error("crm_ombra_origin_rejected");
    const token = await this.acquireAccessToken(now);
    return this.fetcher(url.toString(), {
      ...init,
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      redirect: "error",
    });
  }

  async readOnlyGet(pathname: "/rest/v1/enea_practices_public" | "/rest/v1/pipeline_stages", searchParams: URLSearchParams, now = new Date()) {
    const url = new URL(pathname, APR_CRM_OMBRA_ORIGIN);
    url.search = searchParams.toString();
    return this.request(`${url.pathname}${url.search}`, { method: "GET" }, now);
  }

  async readOnlyStorageGet(bucket: "enea-documents", objectPath: string, now = new Date()) {
    if (bucket !== "enea-documents" || !safeObjectPath(objectPath)) throw new Error("crm_ombra_storage_path_rejected");
    const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
    return this.request(`/storage/v1/object/authenticated/${bucket}/${encoded}`, {
      method: "GET",
      headers: { Accept: "application/pdf,image/png,image/jpeg,application/octet-stream" },
    }, now);
  }

  async patchPractice(practiceId: string, expectedStageId: string, patch: AprCrmOmbraPatch, now = new Date()) {
    if (!/^[a-f0-9-]{36}$/i.test(practiceId) || !/^[a-f0-9-]{36}$/i.test(expectedStageId)) {
      throw new Error("crm_ombra_patch_identity_rejected");
    }
    assertAllowedPatch(patch);
    const search = new URLSearchParams({ id: `eq.${practiceId}`, current_stage_id: `eq.${expectedStageId}`, select: "*" });
    const response = await this.request(`/rest/v1/enea_practices?${search.toString()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(patch),
    }, now);
    if (!response.ok) throw new Error(`crm_ombra_patch_failed:${response.status}`);
    const rows = await response.json() as unknown[];
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error("crm_ombra_patch_compare_and_swap_failed");
    return rows[0];
  }

  snapshot(now = new Date()): AprCrmOmbraAuthSnapshot {
    let publishableKeyFingerprint: string | null = null;
    try { publishableKeyFingerprint = sha256(this.loadConfig().publishableKey); } catch { /* non configurato */ }
    return {
      transport: "dedicated_shadow_supabase_user_session",
      supabaseOrigin: APR_CRM_OMBRA_ORIGIN,
      email: APR_CRM_OMBRA_EMAIL,
      keychainService: APR_CRM_OMBRA_KEYCHAIN_SERVICE,
      configured: publishableKeyFingerprint !== null,
      authenticated: Boolean(this.accessToken && this.accessTokenExpiresAt > now.getTime()),
      publishableKeyFingerprint,
      tokenExpiresAt: this.accessTokenExpiresAt ? new Date(this.accessTokenExpiresAt).toISOString() : null,
      productionWriteAllowed: false,
      externalCommunicationsAllowed: false,
      allowedWriteFields: APR_CRM_OMBRA_ALLOWED_WRITE_FIELDS,
    };
  }
}

export function assertAprCrmOmbraTransportSnapshot(snapshot: AprCrmOmbraAuthSnapshot) {
  if (snapshot.supabaseOrigin !== APR_CRM_OMBRA_ORIGIN
    || snapshot.email !== APR_CRM_OMBRA_EMAIL
    || snapshot.keychainService !== APR_CRM_OMBRA_KEYCHAIN_SERVICE
    || snapshot.productionWriteAllowed !== false
    || snapshot.externalCommunicationsAllowed !== false) {
    throw new Error("crm_ombra_transport_attestation_invalid");
  }
  return snapshot;
}
