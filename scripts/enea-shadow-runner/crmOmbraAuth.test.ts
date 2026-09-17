import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  APR_CRM_OMBRA_EMAIL,
  APR_CRM_OMBRA_KEYCHAIN_SERVICE,
  APR_CRM_OMBRA_ORIGIN,
  PersistentAprCrmOmbraAuth,
  type AprCrmOmbraSecretStore,
} from "./crmOmbraAuth";

class MemorySecretStore implements AprCrmOmbraSecretStore {
  value: string | null = null;
  async get() { return this.value; }
  async set(value: string) { this.value = value; }
  async delete() { this.value = null; }
}

const roots: string[] = [];
const temporaryRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), "apr-crm-ombra-auth-"));
  roots.push(root);
  return root;
};

const jwt = (payload: Record<string, unknown>) => [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify(payload)).toString("base64url"),
  "signature",
].join(".");

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("PersistentAprCrmOmbraAuth", () => {
  it("usa origine, identita e Portachiavi separati dalla produzione", async () => {
    const requests: Array<{ url: string; method: string; body: string }> = [];
    const store = new MemorySecretStore();
    const fetcher = async (input: string, init: RequestInit = {}) => {
      requests.push({ url: input, method: init.method ?? "GET", body: String(init.body ?? "") });
      if (input.includes("/auth/v1/token")) return new Response(JSON.stringify({
        access_token: "shadow-access",
        refresh_token: "shadow-refresh",
        expires_in: 3600,
        user: { email: APR_CRM_OMBRA_EMAIL },
      }), { status: 200 });
      return new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111" }]), { status: 200 });
    };
    const auth = new PersistentAprCrmOmbraAuth(temporaryRoot(), store, fetcher);
    const publishableKey = jwt({ role: "anon", ref: "boxvncaqpszeqpofazzr" });
    auth.configure(APR_CRM_OMBRA_ORIGIN, publishableKey);
    const snapshot = await auth.authenticate("password-locale-non-persistita");
    expect(snapshot).toMatchObject({
      supabaseOrigin: APR_CRM_OMBRA_ORIGIN,
      email: APR_CRM_OMBRA_EMAIL,
      keychainService: APR_CRM_OMBRA_KEYCHAIN_SERVICE,
      authenticated: true,
      productionWriteAllowed: false,
      externalCommunicationsAllowed: false,
    });
    expect(store.value).toContain("shadow-refresh");
    expect(store.value).not.toContain("password-locale-non-persistita");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "POST" });
    expect(requests[0].url).toBe(`${APR_CRM_OMBRA_ORIGIN}/auth/v1/token?grant_type=password`);
  });

  it("rifiuta origine e chiave del CRM di produzione", () => {
    const auth = new PersistentAprCrmOmbraAuth(temporaryRoot(), new MemorySecretStore(), async () => new Response());
    const productionKey = jwt({ role: "anon", ref: "xmkjrhwmmuzaqjqlvzxm" });
    expect(() => auth.configure("https://xmkjrhwmmuzaqjqlvzxm.supabase.co", productionKey)).toThrow("crm_ombra_public_config_rejected");
  });

  it("accetta anche il formato Supabase sb_publishable solo sull'origine ombra fissata", () => {
    const auth = new PersistentAprCrmOmbraAuth(temporaryRoot(), new MemorySecretStore(), async () => new Response());
    expect(auth.configure(APR_CRM_OMBRA_ORIGIN, `sb_publishable_${"a".repeat(32)}`)).toMatchObject({ configured: true });
  });

  it("consente PATCH solo sulla tabella ombra e sui quattro campi autorizzati", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (input: string, init: RequestInit = {}) => {
      requests.push({ url: input, init });
      if (input.includes("/auth/v1/token")) return new Response(JSON.stringify({
        access_token: "access", refresh_token: "refresh", expires_in: 3600, user: { email: APR_CRM_OMBRA_EMAIL },
      }), { status: 200 });
      return new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111" }]), { status: 200 });
    };
    const auth = new PersistentAprCrmOmbraAuth(temporaryRoot(), new MemorySecretStore(), fetcher);
    auth.configure(APR_CRM_OMBRA_ORIGIN, jwt({ role: "anon", ref: "boxvncaqpszeqpofazzr" }));
    await auth.authenticate("x");
    await auth.patchPractice(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      { current_stage_id: "33333333-3333-4333-8333-333333333333", note_interne: "nota" },
    );
    const patchRequest = requests.at(-1)!;
    expect(patchRequest.url).toMatch(/^https:\/\/boxvncaqpszeqpofazzr\.supabase\.co\/rest\/v1\/enea_practices\?/);
    expect(patchRequest.init.method).toBe("PATCH");
    expect(JSON.parse(String(patchRequest.init.body))).toEqual({ current_stage_id: "33333333-3333-4333-8333-333333333333", note_interne: "nota" });
    await expect(auth.patchPractice(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      { cliente_nome: "vietato" } as never,
    )).rejects.toThrow("crm_ombra_patch_fields_rejected");
  });

  it("mantiene il trasporto di produzione privo dell'origine ombra", () => {
    const adapterSources = [
      readFileSync(path.resolve("scripts/enea-shadow-runner/crmOmbraAuth.ts"), "utf8"),
      readFileSync(path.resolve("scripts/enea-shadow-runner/crmOmbraAdapter.ts"), "utf8"),
    ].join("\n");
    const productionSource = readFileSync(path.resolve("scripts/enea-shadow-runner/crmAuth.ts"), "utf8");
    expect(adapterSources).toContain(APR_CRM_OMBRA_ORIGIN);
    expect(adapterSources).not.toContain("xmkjrhwmmuzaqjqlvzxm");
    expect(productionSource).toContain("https://xmkjrhwmmuzaqjqlvzxm.supabase.co");
    expect(productionSource).not.toContain(APR_CRM_OMBRA_ORIGIN);
  });

  it("legge vista e documenti soltanto dall'ombra con GET", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    const fetcher = async (input: string, init: RequestInit = {}) => {
      requests.push({ url: input, method: init.method ?? "GET" });
      if (input.includes("/auth/v1/token")) return new Response(JSON.stringify({
        access_token: "access", refresh_token: "refresh", expires_in: 3600, user: { email: APR_CRM_OMBRA_EMAIL },
      }), { status: 200 });
      return new Response("[]", { status: 200 });
    };
    const auth = new PersistentAprCrmOmbraAuth(temporaryRoot(), new MemorySecretStore(), fetcher);
    auth.configure(APR_CRM_OMBRA_ORIGIN, jwt({ role: "anon", ref: "boxvncaqpszeqpofazzr" }));
    await auth.authenticate("x");
    await auth.readOnlyGet("/rest/v1/enea_practices_public", new URLSearchParams({ id: "eq.11111111-1111-4111-8111-111111111111" }));
    await auth.readOnlyStorageGet("enea-documents", "11111111-1111-4111-8111-111111111111/fattura.pdf");
    expect(requests.slice(1)).toEqual([
      expect.objectContaining({ method: "GET", url: expect.stringMatching(/^https:\/\/boxvncaqpszeqpofazzr\.supabase\.co\/rest\/v1\/enea_practices_public/) }),
      expect.objectContaining({ method: "GET", url: "https://boxvncaqpszeqpofazzr.supabase.co/storage/v1/object/authenticated/enea-documents/11111111-1111-4111-8111-111111111111/fattura.pdf" }),
    ]);
    await expect(auth.readOnlyStorageGet("enea-documents", "../produzione.pdf")).rejects.toThrow("crm_ombra_storage_path_rejected");
  });
});
