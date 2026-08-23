export const APR_CRM_READONLY_CONTRACT_VERSION = "apr-crm-readonly-contract-v1" as const;
export const APR_CRM_READONLY_CONFIG_VERSION = "apr-crm-readonly-config-v1" as const;

export const APR_CRM_READONLY_CAPABILITIES = Object.freeze([
  "list_incoming_enea_practices",
  "read_customer",
  "read_enea_dossier",
  "read_document_metadata",
  "read_original_document",
] as const);
export type AprCrmReadOnlyCapability = typeof APR_CRM_READONLY_CAPABILITIES[number];

export interface AprCrmReadOnlyEndpoint {
  capability: AprCrmReadOnlyCapability;
  method: "GET" | "HEAD";
  pathTemplate: string;
  responseContentTypes: readonly string[];
}

export interface AprCrmReadOnlyConfig {
  version: typeof APR_CRM_READONLY_CONFIG_VERSION;
  contractVersion: typeof APR_CRM_READONLY_CONTRACT_VERSION;
  mode: "local_fixture_only";
  adapterId: string;
  workspaceIdentity: string;
  baseUrl: string;
  allowedHeaders: readonly ["accept", "if-none-match"];
  maxResponseBytes: number;
  endpoints: readonly AprCrmReadOnlyEndpoint[];
  externalActionAllowed: false;
  mutationAllowed: false;
  credentialsPersisted: false;
  cookiesAllowed: false;
  existingAutomations: "preserve_exactly";
  crmDashboardIntegration: "preserve_exactly";
}

export interface AprCrmFixtureExchange {
  request: { id: string; capability: AprCrmReadOnlyCapability; method: string; url: string; headers?: Record<string, string>; body?: string | null };
  response: { transport: "local_fixture"; status: number; finalUrl: string; contentType: string; body: string; serverVerified: true; observedMutation: false };
}
export interface AprCrmReadOnlyFixture {
  version: "apr-crm-readonly-fixture-v1";
  fixtureId: string;
  adapterId: string;
  workspaceIdentity: string;
  exchanges: readonly AprCrmFixtureExchange[];
}

const normalizeOrigin = (value: string) => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null; }
  catch { return null; }
};
const validPathTemplate = (value: string) => value.startsWith("/api/") && !/[?#]|\.\.|\/\//.test(value)
  && /^[/a-zA-Z0-9_{}-]+$/.test(value);

export function validateAprCrmReadOnlyConfig(config: AprCrmReadOnlyConfig): string[] {
  const errors: string[] = [];
  const allowedTopLevel = new Set(["version", "contractVersion", "mode", "adapterId", "workspaceIdentity", "baseUrl", "allowedHeaders", "maxResponseBytes", "endpoints", "externalActionAllowed", "mutationAllowed", "credentialsPersisted", "cookiesAllowed", "existingAutomations", "crmDashboardIntegration"]);
  if (Object.keys(config as object).some((key) => !allowedTopLevel.has(key))) errors.push("unknown_config_key");
  if (Object.keys(config as object).some((key) => /^(token|secret|password|authorization|cookie|apiKey|accessToken|refreshToken)$/i.test(key))) errors.push("credential_key_forbidden");
  if (config.version !== APR_CRM_READONLY_CONFIG_VERSION || config.contractVersion !== APR_CRM_READONLY_CONTRACT_VERSION) errors.push("version_mismatch");
  if (config.mode !== "local_fixture_only") errors.push("mode_not_local_fixture_only");
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(config.adapterId) || !/^[a-z0-9][a-z0-9._:-]{2,119}$/i.test(config.workspaceIdentity)) errors.push("identity_invalid");
  if (!normalizeOrigin(config.baseUrl)) errors.push("base_url_not_exact_https_origin");
  if (JSON.stringify(config.allowedHeaders) !== JSON.stringify(["accept", "if-none-match"])) errors.push("headers_allowlist_invalid");
  if (!Number.isInteger(config.maxResponseBytes) || config.maxResponseBytes < 1_024 || config.maxResponseBytes > 10_485_760) errors.push("max_response_bytes_invalid");
  if (config.externalActionAllowed !== false || config.mutationAllowed !== false || config.credentialsPersisted !== false || config.cookiesAllowed !== false) errors.push("fail_closed_flags_invalid");
  if (config.existingAutomations !== "preserve_exactly" || config.crmDashboardIntegration !== "preserve_exactly") errors.push("crm_invariants_invalid");
  const capabilities = new Set<AprCrmReadOnlyCapability>();
  const endpoints = Array.isArray(config.endpoints) ? config.endpoints : [];
  if (!Array.isArray(config.endpoints)) errors.push("endpoints_invalid");
  for (const endpoint of endpoints) {
    if (Object.keys(endpoint).some((key) => !["capability", "method", "pathTemplate", "responseContentTypes"].includes(key))) errors.push(`endpoint_unknown_key:${endpoint.capability}`);
    if (!APR_CRM_READONLY_CAPABILITIES.includes(endpoint.capability) || capabilities.has(endpoint.capability)) errors.push(`endpoint_capability_invalid:${endpoint.capability}`);
    capabilities.add(endpoint.capability);
    if (!["GET", "HEAD"].includes(endpoint.method) || !validPathTemplate(endpoint.pathTemplate)) errors.push(`endpoint_contract_invalid:${endpoint.capability}`);
    if (!Array.isArray(endpoint.responseContentTypes) || !endpoint.responseContentTypes.length || endpoint.responseContentTypes.some((value: string) => !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(value))) errors.push(`endpoint_content_type_invalid:${endpoint.capability}`);
  }
  for (const capability of APR_CRM_READONLY_CAPABILITIES) if (!capabilities.has(capability)) errors.push(`capability_missing:${capability}`);
  return [...new Set(errors)];
}

function pathMatches(template: string, pathname: string) {
  const pattern = template.split("/").map((part) => /^\{[a-zA-Z0-9_]+\}$/.test(part) ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/");
  return new RegExp(`^${pattern}$`).test(pathname);
}

export function validateAprCrmReadOnlyExchange(config: AprCrmReadOnlyConfig, exchange: AprCrmFixtureExchange): string[] {
  const errors: string[] = [];
  const endpoint = config.endpoints.find((candidate) => candidate.capability === exchange.request.capability);
  if (!endpoint) return [`capability_not_configured:${exchange.request.capability}`];
  if (exchange.request.method !== endpoint.method || !["GET", "HEAD"].includes(exchange.request.method)) errors.push("method_not_allowed");
  if (exchange.request.body != null && exchange.request.body !== "") errors.push("request_body_forbidden");
  const headers = Object.keys(exchange.request.headers ?? {}).map((value) => value.toLowerCase());
  if (headers.some((header) => !config.allowedHeaders.includes(header as "accept" | "if-none-match"))) errors.push("request_header_forbidden");
  let requestUrl: URL | null = null; let finalUrl: URL | null = null;
  try { requestUrl = new URL(exchange.request.url); finalUrl = new URL(exchange.response.finalUrl); } catch { errors.push("url_invalid"); }
  const origin = normalizeOrigin(config.baseUrl);
  if (!requestUrl || !finalUrl || requestUrl.origin !== origin || finalUrl.origin !== origin || requestUrl.username || requestUrl.password || finalUrl.username || finalUrl.password) errors.push("origin_or_redirect_forbidden");
  if (requestUrl && (!pathMatches(endpoint.pathTemplate, requestUrl.pathname) || requestUrl.hash)) errors.push("path_not_allowlisted");
  if (finalUrl && (!pathMatches(endpoint.pathTemplate, finalUrl.pathname) || finalUrl.search || finalUrl.hash)) errors.push("final_path_not_allowlisted");
  if (requestUrl && [...requestUrl.searchParams.keys()].some((key) => /action|mutate|update|delete|pipeline|status/i.test(key))) errors.push("mutating_query_forbidden");
  if (exchange.response.transport !== "local_fixture" || exchange.response.serverVerified !== true || exchange.response.observedMutation !== false) errors.push("fixture_transport_or_mutation_invalid");
  if (exchange.response.status < 200 || exchange.response.status >= 400) errors.push("response_status_invalid");
  if (!endpoint.responseContentTypes.includes(exchange.response.contentType)) errors.push("response_content_type_forbidden");
  if (Buffer.byteLength(exchange.response.body, "utf8") > config.maxResponseBytes) errors.push("response_too_large");
  if (exchange.request.method === "HEAD" && exchange.response.body !== "") errors.push("head_response_body_forbidden");
  return [...new Set(errors)];
}

export function aprCrmReadOnlyContractSnapshot() {
  return { version: APR_CRM_READONLY_CONTRACT_VERSION, integration: "contract_only_not_real", methods: ["GET", "HEAD"],
    capabilities: APR_CRM_READONLY_CAPABILITIES, externalActionAllowed: false, mutationAllowed: false,
    operationalGate: "blocked_adapters_unverified", forbidden: ["credentials", "cookies", "pipeline mutations", "automation changes", "CRM→Cruscotto changes"] };
}
