import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateAprCrmReadOnlyConfig, validateAprCrmReadOnlyExchange, type AprCrmReadOnlyConfig, type AprCrmFixtureExchange } from "./aprCrmReadOnlyContract";

const config = () => JSON.parse(readFileSync(path.resolve("config/apr/crm-readonly-adapter.json"), "utf8")) as AprCrmReadOnlyConfig;
const exchange = (): AprCrmFixtureExchange => ({ request: { id: "customer", capability: "read_customer", method: "GET", url: "https://crm.fixture.invalid/api/customers/1", headers: { accept: "application/json" } },
  response: { transport: "local_fixture", status: 200, finalUrl: "https://crm.fixture.invalid/api/customers/1", contentType: "application/json", body: "{}", serverVerified: true, observedMutation: false } });

describe("contratto adapter CRM APR read-only", () => {
  it("accetta solo la configurazione locale fail-closed completa", () => {
    expect(validateAprCrmReadOnlyConfig(config())).toEqual([]);
    expect(config()).toMatchObject({ mode: "local_fixture_only", externalActionAllowed: false, mutationAllowed: false, credentialsPersisted: false, cookiesAllowed: false });
  });
  it("rifiuta chiavi sconosciute/credenziali e capability mancanti", () => {
    const invalid = { ...config(), token: "vietato", endpoints: config().endpoints.slice(1) } as AprCrmReadOnlyConfig;
    expect(validateAprCrmReadOnlyConfig(invalid)).toEqual(expect.arrayContaining(["unknown_config_key", "credential_key_forbidden", "capability_missing:list_incoming_enea_practices"]));
  });
  it("accetta esclusivamente l'exchange GET allowlistato", () => expect(validateAprCrmReadOnlyExchange(config(), exchange())).toEqual([]));
  it("rifiuta metodo, corpo, header, redirect e query mutativi", () => {
    const invalid = exchange(); invalid.request.method = "POST"; invalid.request.body = "{}"; invalid.request.headers = { authorization: "secret" };
    invalid.request.url += "?updateStatus=true"; invalid.response.finalUrl = "https://evil.invalid/api/customers/1";
    expect(validateAprCrmReadOnlyExchange(config(), invalid)).toEqual(expect.arrayContaining([
      "method_not_allowed", "request_body_forbidden", "request_header_forbidden", "origin_or_redirect_forbidden", "mutating_query_forbidden",
    ]));
  });
});
