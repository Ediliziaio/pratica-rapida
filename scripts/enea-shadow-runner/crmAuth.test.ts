import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APR_CRM_SUPABASE_ORIGIN,
  PersistentAprCrmAuth,
  type AprSecretStore,
} from "./crmAuth";

const temporaryDirectories: string[] = [];
const makeDirectory = () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "apr-crm-auth-"));
  temporaryDirectories.push(directory);
  return directory;
};

class MemorySecretStore implements AprSecretStore {
  value: string | null = null;
  async get() { return this.value; }
  async set(value: string) { this.value = value; }
  async delete() { this.value = null; }
}

const publishableKey = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ role: "anon", ref: "xmkjrhwmmuzaqjqlvzxm" })).toString("base64url"),
  "fixture-signature",
].join(".");

const tokenResponse = (email: string, accessToken: string, refreshToken: string, expiresAt: number) => new Response(JSON.stringify({
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_at: expiresAt,
  user: { id: "user-fixture", email },
}), { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("sessione CRM dedicata APR", () => {
  it("salva solo il refresh token nel secret store e non persiste credenziali o token nel checkpoint", async () => {
    const directory = makeDirectory();
    const secretStore = new MemorySecretStore();
    const fetcher = vi.fn(async () => tokenResponse("operatore@example.test", "access-secret-1", "refresh-secret-1", 1_787_000_000));
    const auth = new PersistentAprCrmAuth(directory, secretStore, fetcher, { refreshLockDirectory: path.join(makeDirectory(), "refresh.lock") });
    auth.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey, new Date("2026-08-15T08:00:00.000Z"));

    const state = await auth.authenticate("Operatore@Example.test", "password-segretissima", new Date("2026-08-15T08:01:00.000Z"));

    expect(state).toMatchObject({ status: "authenticated", accountEmailMasked: "o********@example.test", externalActionAllowed: false, readOnlyOnly: true });
    expect(secretStore.value).toContain("refresh-secret-1");
    expect(secretStore.value).toContain("operatore@example.test");
    const checkpoint = readFileSync(auth.checkpointPath, "utf8");
    expect(checkpoint).not.toContain("password-segretissima");
    expect(checkpoint).not.toContain("access-secret-1");
    expect(checkpoint).not.toContain("refresh-secret-1");
    expect(auth.snapshot().credentialsStoredInCheckpoint).toBe(false);
    expect(fetcher).toHaveBeenCalledWith(`${APR_CRM_SUPABASE_ORIGIN}/auth/v1/token?grant_type=password`, expect.objectContaining({ method: "POST", redirect: "error" }));
  });

  it("dopo riavvio riprende dal Portachiavi simulato e ruota il refresh token senza password", async () => {
    const directory = makeDirectory();
    const secretStore = new MemorySecretStore();
    const firstFetch = vi.fn(async () => tokenResponse("apr@example.test", "access-before", "refresh-before", 1_787_000_000));
    const lockDirectory = path.join(makeDirectory(), "refresh.lock");
    const first = new PersistentAprCrmAuth(directory, secretStore, firstFetch, { refreshLockDirectory: lockDirectory });
    first.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey, new Date("2026-08-15T08:00:00.000Z"));
    await first.authenticate("apr@example.test", "one-time-password", new Date("2026-08-15T08:01:00.000Z"));

    const restartedFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(String(init?.body)).toContain("refresh-before");
      expect(String(init?.body)).not.toContain("one-time-password");
      return tokenResponse("apr@example.test", "access-after", "refresh-after", 1_787_003_600);
    });
    const restarted = new PersistentAprCrmAuth(directory, secretStore, restartedFetch, { refreshLockDirectory: lockDirectory });
    const resumed = await restarted.maintainSession(new Date("2026-08-15T08:02:00.000Z"));

    expect(resumed.status).toBe("authenticated");
    expect(resumed.audit.at(-1)?.type).toBe("session_refreshed");
    expect(secretStore.value).toContain("refresh-after");
    expect(secretStore.value).not.toContain("refresh-before");
    expect(await restarted.acquireAccessToken(new Date("2026-08-15T08:02:01.000Z"))).toBe("access-after");
  });

  it("sopravvive a ore di inattività fra due pratiche senza richiedere un nuovo login", async () => {
    const directory = makeDirectory();
    const secretStore = new MemorySecretStore();
    const lockDirectory = path.join(makeDirectory(), "refresh.lock");
    const morning = new PersistentAprCrmAuth(directory, secretStore, async () => tokenResponse("apr@example.test", "access-morning", "refresh-morning", 1_787_000_000), { refreshLockDirectory: lockDirectory });
    morning.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey, new Date("2026-08-15T08:00:00.000Z"));
    await morning.authenticate("apr@example.test", "password", new Date("2026-08-15T08:01:00.000Z"));

    // Simula il processo della pratica successiva, nato a orario imprevedibile ore dopo
    // (nessun token in memoria: solo il refresh token custodito nel Portachiavi conta).
    const afternoonFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(String(init?.body)).toContain("refresh-morning");
      return tokenResponse("apr@example.test", "access-afternoon", "refresh-afternoon", 1_787_050_000);
    });
    const afternoon = new PersistentAprCrmAuth(directory, secretStore, afternoonFetch, { refreshLockDirectory: lockDirectory });
    const resumed = await afternoon.maintainSession(new Date("2026-08-15T13:00:00.000Z"));

    expect(resumed.status).toBe("authenticated");
    expect(resumed.audit.at(-1)?.type).toBe("session_refreshed");
    expect(await afternoon.acquireAccessToken(new Date("2026-08-15T13:00:01.000Z"))).toBe("access-afternoon");
    expect(afternoonFetch).toHaveBeenCalledTimes(1);
  });

  it("serializza due processi e fa usare al secondo il refresh token appena ruotato", async () => {
    const firstDirectory = makeDirectory();
    const secondDirectory = makeDirectory();
    const lockDirectory = path.join(makeDirectory(), "shared-refresh.lock");
    const secretStore = new MemorySecretStore();
    secretStore.value = JSON.stringify({ version: "apr-crm-keychain-session-v1", email: "apr@example.test", refreshToken: "refresh-zero" });
    const observedTokens: string[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const token = (JSON.parse(String(init?.body)) as { refresh_token: string }).refresh_token;
      observedTokens.push(token);
      if (observedTokens.length === 1) await new Promise((resolve) => setTimeout(resolve, 40));
      return tokenResponse("apr@example.test", `access-${observedTokens.length}`, token === "refresh-zero" ? "refresh-one" : "refresh-two", 1_787_003_600);
    });
    const options = { refreshLockDirectory: lockDirectory, refreshLockWaitMs: 2_000, refreshLockPollMs: 5 };
    const first = new PersistentAprCrmAuth(firstDirectory, secretStore, fetcher, options);
    const second = new PersistentAprCrmAuth(secondDirectory, secretStore, fetcher, options);
    first.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey);
    second.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey);

    const states = await Promise.all([
      first.maintainSession(new Date("2026-08-15T08:02:00.000Z")),
      second.maintainSession(new Date("2026-08-15T08:02:00.000Z")),
    ]);

    expect(states.map((state) => state.status)).toEqual(["authenticated", "authenticated"]);
    expect(observedTokens).toEqual(["refresh-zero", "refresh-one"]);
    expect(secretStore.value).toContain("refresh-two");
  });

  it("rilegge una rotazione concorrente e non cancella la sessione nuova", async () => {
    const directory = makeDirectory();
    const secretStore = new MemorySecretStore();
    secretStore.value = JSON.stringify({ version: "apr-crm-keychain-session-v1", email: "apr@example.test", refreshToken: "refresh-old" });
    let request = 0;
    const fetcher = vi.fn(async () => {
      request += 1;
      if (request === 1) {
        secretStore.value = JSON.stringify({ version: "apr-crm-keychain-session-v1", email: "apr@example.test", refreshToken: "refresh-current" });
        return new Response(JSON.stringify({ error: "invalid_grant", error_description: "Refresh Token Not Found" }), { status: 400 });
      }
      return tokenResponse("apr@example.test", "access-current", "refresh-next", 1_787_003_600);
    });
    const auth = new PersistentAprCrmAuth(directory, secretStore, fetcher, { refreshLockDirectory: path.join(makeDirectory(), "refresh.lock") });
    auth.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey);

    const state = await auth.maintainSession(new Date("2026-08-15T08:02:00.000Z"));

    expect(state.status).toBe("authenticated");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(secretStore.value).toContain("refresh-next");
  });

  it("conserva la sessione su errore temporaneo del fornitore", async () => {
    const directory = makeDirectory();
    const secretStore = new MemorySecretStore();
    const initial = new PersistentAprCrmAuth(directory, secretStore, async () => tokenResponse("apr@example.test", "access", "refresh-live", 1_787_000_000), { refreshLockDirectory: path.join(makeDirectory(), "login.lock") });
    initial.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey);
    await initial.authenticate("apr@example.test", "password", new Date("2026-08-15T08:00:00.000Z"));
    const restarted = new PersistentAprCrmAuth(directory, secretStore, async () => new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503 }), { refreshLockDirectory: path.join(makeDirectory(), "refresh.lock") });

    await expect(restarted.maintainSession(new Date("2026-08-15T09:00:00.000Z"))).rejects.toThrow("crm_auth_refresh_transient:http_503");

    expect(restarted.snapshot().status).toBe("authenticated");
    expect(secretStore.value).toContain("refresh-live");
  });

  it("limita temporalmente il trasporto e conserva la sessione se il server non risponde", async () => {
    const directory = makeDirectory();
    const secretStore = new MemorySecretStore();
    const initial = new PersistentAprCrmAuth(directory, secretStore, async () => tokenResponse("apr@example.test", "access", "refresh-live", 1_787_000_000), { refreshLockDirectory: path.join(makeDirectory(), "login.lock") });
    initial.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey);
    await initial.authenticate("apr@example.test", "password", new Date("2026-08-15T08:00:00.000Z"));
    const neverResponds = (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
    const restarted = new PersistentAprCrmAuth(directory, secretStore, neverResponds, {
      refreshLockDirectory: path.join(makeDirectory(), "refresh.lock"),
      tokenRequestTimeoutMs: 10,
    });

    await expect(restarted.maintainSession(new Date("2026-08-15T09:00:00.000Z"))).rejects.toThrow("crm_auth_transport_unavailable:timeout");

    expect(restarted.snapshot().status).toBe("authenticated");
    expect(secretStore.value).toContain("refresh-live");
  });

  it("chiude fail-closed soltanto sul rifiuto definitivo del token ancora corrente", async () => {
    const directory = makeDirectory();
    const secretStore = new MemorySecretStore();
    const initial = new PersistentAprCrmAuth(directory, secretStore, async () => tokenResponse("apr@example.test", "access", "refresh-current", 1_787_000_000), { refreshLockDirectory: path.join(makeDirectory(), "login.lock") });
    initial.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey);
    await initial.authenticate("apr@example.test", "password", new Date("2026-08-15T08:00:00.000Z"));
    const restarted = new PersistentAprCrmAuth(directory, secretStore, async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Refresh Token Not Found" }), { status: 400 }), { refreshLockDirectory: path.join(makeDirectory(), "refresh.lock") });

    const state = await restarted.maintainSession(new Date("2026-08-15T09:00:00.000Z"));

    expect(state.status).toBe("login_required");
    expect(secretStore.value).toBeNull();
  });

  it("resta fail-closed se il server rifiuta il login e non scrive segreti", async () => {
    const directory = makeDirectory();
    const secretStore = new MemorySecretStore();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }), { status: 400 }));
    const auth = new PersistentAprCrmAuth(directory, secretStore, fetcher, { refreshLockDirectory: path.join(makeDirectory(), "refresh.lock") });
    auth.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey);

    await expect(auth.authenticate("apr@example.test", "sbagliata")).rejects.toThrow("crm_auth_server_rejected");
    expect(auth.snapshot()).toMatchObject({ status: "login_required", externalActionAllowed: false });
    expect(secretStore.value).toBeNull();
  });

  it("non marca autenticato se il Portachiavi non accetta il refresh token", async () => {
    const directory = makeDirectory();
    const secretStore: AprSecretStore = {
      get: async () => null,
      set: async () => { throw new Error("keychain_write_failed"); },
      delete: async () => undefined,
    };
    const auth = new PersistentAprCrmAuth(directory, secretStore, async () => tokenResponse("apr@example.test", "access", "refresh", 1_787_000_000), { refreshLockDirectory: path.join(makeDirectory(), "refresh.lock") });
    auth.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey);

    await expect(auth.authenticate("apr@example.test", "password")).rejects.toThrow("keychain_write_failed");
    expect(auth.snapshot().status).toBe("login_required");
    await expect(auth.acquireAccessToken()).rejects.toThrow("crm_auth_access_token_unavailable");
  });

  it("consente solo GET autenticato nel bucket e percorsi PDF/PNG/JPEG allowlist", async () => {
    const directory = makeDirectory(); const secretStore = new MemorySecretStore();
    const practiceId = "00000000-0000-4000-8000-000000000001";
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => url.includes("/auth/v1/token")
      ? tokenResponse("apr@example.test", "access-storage", "refresh-storage", 1_787_000_000)
      : new Response("%PDF-1.4", { status: 200, headers: { "Content-Type": "application/pdf" } }));
    const auth = new PersistentAprCrmAuth(directory, secretStore, fetcher, { refreshLockDirectory: path.join(makeDirectory(), "refresh.lock") }); auth.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey);
    await auth.authenticate("apr@example.test", "password", new Date("2026-08-15T08:01:00Z"));
    const objectPath = `${practiceId}/fattura/fattura uno.pdf`;
    const response = await auth.readOnlyStorageGet("enea-documents", objectPath, new Date("2026-08-15T08:02:00Z"));
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenLastCalledWith(`${APR_CRM_SUPABASE_ORIGIN}/storage/v1/object/authenticated/enea-documents/${practiceId}/fattura/fattura%20uno.pdf`,
      expect.objectContaining({ method: "GET", redirect: "error", headers: expect.objectContaining({ Authorization: "Bearer access-storage" }) }));
    await auth.readOnlyStorageGet("enea-documents", `${practiceId}/fattura/fattura.png`, new Date("2026-08-15T08:02:01Z"));
    expect(fetcher).toHaveBeenLastCalledWith(`${APR_CRM_SUPABASE_ORIGIN}/storage/v1/object/authenticated/enea-documents/${practiceId}/fattura/fattura.png`,
      expect.objectContaining({ method: "GET", redirect: "error", headers: expect.objectContaining({ Accept: expect.stringContaining("image/png") }) }));
    await expect(auth.readOnlyStorageGet("enea-documents", "../storico-enea.pdf")).rejects.toThrow("crm_readonly_object_path_rejected");
    await expect(auth.readOnlyStorageGet("enea-documents", `${practiceId}/fattura/script.svg`)).rejects.toThrow("crm_readonly_object_path_rejected");
    await expect(auth.readOnlyStorageGet("altro" as "enea-documents", objectPath)).rejects.toThrow("crm_readonly_bucket_rejected");
  });
});
