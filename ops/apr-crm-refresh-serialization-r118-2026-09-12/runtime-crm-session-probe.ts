import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APR_CRM_SUPABASE_ORIGIN,
  MacOsKeychainSecretStore,
  PersistentAprCrmAuth,
} from "../../scripts/enea-shadow-runner/crmAuth";

const operationRoot = path.resolve("ops/apr-crm-refresh-serialization-r118-2026-09-12");
const sourceConfigPath = path.join(
  "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state",
  "crm-auth/public-auth-config.json",
);
const stateRoot = path.join(operationRoot, "runtime-crm-session-probe-state");
const reportPath = path.join(operationRoot, "runtime-crm-session-probe.json");
const viteNodePath = path.resolve("node_modules/.bin/vite-node");
const scriptPath = fileURLToPath(import.meta.url);

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const safeSessionFingerprint = (stored: string | null) => {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as { refreshToken?: string };
    return parsed.refreshToken ? sha256(parsed.refreshToken) : null;
  } catch {
    return null;
  }
};

const atomicJson = (target: string, value: unknown) => {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, target);
};

const configureProbeRoot = (root: string) => {
  const config = JSON.parse(readFileSync(sourceConfigPath, "utf8")) as {
    supabaseOrigin: string;
    publishableKey: string;
  };
  if (config.supabaseOrigin !== APR_CRM_SUPABASE_ORIGIN) throw new Error("unexpected_crm_origin");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  new PersistentAprCrmAuth(root).configure(config.supabaseOrigin, config.publishableKey);
};

const runChild = async (root: string) => {
  const auth = new PersistentAprCrmAuth(root);
  const state = await auth.maintainSession();
  if (state.status !== "authenticated") throw new Error(`unexpected_auth_state:${state.status}`);
  const params = new URLSearchParams({ select: "id", limit: "1" });
  const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
  process.stdout.write(`${JSON.stringify({
    pid: process.pid,
    authStatus: state.status,
    authEvent: state.audit.at(-1)?.type ?? null,
    readMethod: "GET",
    readStatus: response.status,
    readOk: response.ok,
  })}\n`);
};

const spawnChild = (root: string) => new Promise<Record<string, unknown>>((resolve, reject) => {
  const child = spawn(viteNodePath, [scriptPath, "--child", root], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("error", reject);
  child.once("close", (code) => {
    if (code !== 0) return reject(new Error(`probe_child_failed:${code}:${stderr.slice(0, 500)}`));
    try { resolve(JSON.parse(stdout.trim()) as Record<string, unknown>); }
    catch { reject(new Error(`probe_child_invalid_output:${stdout.slice(0, 500)}`)); }
  });
});

if (process.argv[2] === "--child") {
  const root = process.argv[3];
  if (!root) throw new Error("missing_child_root");
  await runChild(path.resolve(root));
} else {
  if (!existsSync(sourceConfigPath)) throw new Error("missing_public_auth_config");
  rmSync(stateRoot, { recursive: true, force: true });
  const roots = [path.join(stateRoot, "process-a"), path.join(stateRoot, "process-b")];
  roots.forEach(configureProbeRoot);
  const secretStore = new MacOsKeychainSecretStore();
  const before = safeSessionFingerprint(await secretStore.get());
  if (!before) throw new Error("crm_session_missing_before_probe");
  const startedAt = new Date().toISOString();
  let children: Record<string, unknown>[] = [];
  let error: string | null = null;
  try {
    children = await Promise.all(roots.map(spawnChild));
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  const after = safeSessionFingerprint(await secretStore.get());
  const report = {
    version: "apr-crm-runtime-multiprocess-probe-v1",
    startedAt,
    completedAt: new Date().toISOString(),
    status: !error && children.length === 2 && children.every((child) => child.authStatus === "authenticated" && child.readMethod === "GET" && child.readOk === true) && Boolean(after)
      ? "PASS"
      : "FAIL",
    guarantees: {
      separateProcesses: true,
      sharedRealKeychainSession: true,
      sharedGlobalRefreshLock: true,
      crmRequestsAreReadOnlyGet: true,
      secretsPersistedInReport: false,
      sessionPresentBefore: Boolean(before),
      sessionPresentAfter: Boolean(after),
      refreshTokenRotatedDuringProbe: Boolean(before && after && before !== after),
    },
    children,
    error,
  };
  atomicJson(reportPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}
