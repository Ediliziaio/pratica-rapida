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
    const auth = new PersistentAprCrmAuth(directory, secretStore, fetcher);
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
    const first = new PersistentAprCrmAuth(directory, secretStore, firstFetch);
    first.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey, new Date("2026-08-15T08:00:00.000Z"));
    await first.authenticate("apr@example.test", "one-time-password", new Date("2026-08-15T08:01:00.000Z"));

    const restartedFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(String(init?.body)).toContain("refresh-before");
      expect(String(init?.body)).not.toContain("one-time-password");
      return tokenResponse("apr@example.test", "access-after", "refresh-after", 1_787_003_600);
    });
    const restarted = new PersistentAprCrmAuth(directory, secretStore, restartedFetch);
    const resumed = await restarted.maintainSession(new Date("2026-08-15T08:02:00.000Z"));

    expect(resumed.status).toBe("authenticated");
    expect(resumed.audit.at(-1)?.type).toBe("session_refreshed");
    expect(secretStore.value).toContain("refresh-after");
    expect(secretStore.value).not.toContain("refresh-before");
    expect(await restarted.acquireAccessToken(new Date("2026-08-15T08:02:01.000Z"))).toBe("access-after");
  });

  it("resta fail-closed se il server rifiuta il login e non scrive segreti", async () => {
    const directory = makeDirectory();
    const secretStore = new MemorySecretStore();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }), { status: 400 }));
    const auth = new PersistentAprCrmAuth(directory, secretStore, fetcher);
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
    const auth = new PersistentAprCrmAuth(directory, secretStore, async () => tokenResponse("apr@example.test", "access", "refresh", 1_787_000_000));
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
    const auth = new PersistentAprCrmAuth(directory, secretStore, fetcher); auth.configure(APR_CRM_SUPABASE_ORIGIN, publishableKey);
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
