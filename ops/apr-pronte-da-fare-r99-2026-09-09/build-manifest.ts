import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const sourceRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const outputRoot = path.join(sourceRoot, "ops/apr-pronte-da-fare-r104-2026-09-10");
const outputPath = path.join(outputRoot, "manifest.json");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const norm = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (value: string) => norm(value).replace(/ /g, "-");
const stageTypes = (value: unknown) => (Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [])
  .map((entry) => norm((entry as { stage_type?: unknown }).stage_type).replace(/ /g, "_"));
const companyNames = (value: unknown) => (Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [])
  .map((entry) => norm((entry as { ragione_sociale?: unknown }).ragione_sociale)).filter(Boolean);
const classify = (value: unknown) => {
  const normalized = norm(value);
  if (/(^| )(infiss|serrament|finestr)/.test(normalized)) return "infissi";
  if (/(^| )(schermatur|tend|pergol|zanzar|cristal|persian|avvolgibil)/.test(normalized)) return "screening";
  return null;
};

const auth = new PersistentAprCrmAuth(path.join(runtimeRoot, "state"));
await auth.maintainSession();
const params = new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,prodotto_installato,fornitore,updated_at,pipeline_stages!inner(stage_type),companies:reseller_id(ragione_sociale)",
  brand: "eq.enea",
  archived_at: "is.null",
  "pipeline_stages.stage_type": "in.(pronte_da_fare,recensione)",
  order: "updated_at.asc",
  limit: "1000",
});
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
const raw = await response.text();
if (!response.ok) throw new Error(`crm_http_${response.status}`);
const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
const exclusions = {
  syntheticName: /(^| )(test[0-9]*|prova|claude|hhhhh)( |$)/,
  supplier: /(erre emme|rm legno|vans|overthemol)/,
  customer: new Set(["beatrice ciotta", "samuele beretta"]),
};
const explicitlyAuthorizedMovedPracticeIds = new Set([
  "abe740b8-890f-4a2a-bc5d-12ef87b1f7ec",
  "4db26f2b-33ec-4b73-97dc-38bad15e401b",
  "d5edef9f-2b12-459f-a226-5d92fa069767",
  "8921b07b-b618-4fc8-ade0-11f06c5177fe",
]);
const observed = rows.map((row) => {
  const id = String(row.id ?? "").toLowerCase();
  const displayName = `${row.cliente_nome ?? ""} ${row.cliente_cognome ?? ""}`.trim();
  const vendors = [norm(row.fornitore), ...companyNames(row.companies)].filter(Boolean);
  return {
    row,
    id,
    displayName,
    customerKey: slug(displayName),
    stage: stageTypes(row.pipeline_stages)[0],
    module: classify(row.prodotto_installato),
    vendors,
  };
});
const candidates = observed.filter((item) => /^[0-9a-f-]{36}$/.test(item.id)
  && (item.stage === "pronte_da_fare" || (item.stage === "recensione" && explicitlyAuthorizedMovedPracticeIds.has(item.id)))
  && item.module
  && !exclusions.syntheticName.test(norm(item.displayName))
  && !exclusions.customer.has(norm(item.displayName)));
const excluded = observed.filter((item) => !candidates.includes(item)).map((item) => ({
  practiceId: item.id,
  displayName: item.displayName,
  stage: item.stage,
  productEvidence: String(item.row.prodotto_installato ?? ""),
  reseller: item.vendors.join(" | "),
  reasons: [
    !/^[0-9a-f-]{36}$/.test(item.id) ? "invalid_practice_id" : null,
    item.stage !== "pronte_da_fare" && !(item.stage === "recensione" && explicitlyAuthorizedMovedPracticeIds.has(item.id)) ? "wrong_stage" : null,
    !item.module ? "unsupported_or_unclassified_product" : null,
    exclusions.syntheticName.test(norm(item.displayName)) ? "synthetic_test_name" : null,
    exclusions.customer.has(norm(item.displayName)) ? "permanent_customer_exclusion" : null,
  ].filter(Boolean),
}));
const cases = candidates.map((item) => ({
  practiceId: item.id,
  customerKey: item.customerKey,
  displayName: item.displayName,
  stage: item.stage,
  stageName: item.stage,
  module: item.module,
  productEvidence: String(item.row.prodotto_installato ?? ""),
  reseller: item.vendors.join(" | "),
  invoiceCount: null,
  complexity: "current_pipeline_unobserved",
  historicalRetest: null,
  expectedRouting: item.vendors.some((value) => exclusions.supplier.test(value)) ? "operator_required_permanent_supplier_exclusion" : "standard",
  group: item.stage === "recensione" ? "moved_to_recensione" : "pronte_da_fare",
  groupOrder: item.stage === "recensione" ? 2 : 1,
}));
if (new Set(cases.map((item) => item.practiceId)).size !== cases.length) throw new Error("manifest_duplicate_practice_id");
if (new Set(cases.map((item) => item.customerKey)).size !== cases.length) throw new Error("manifest_duplicate_customer_key");
if (cases.length === 0) throw new Error("manifest_empty");
const manifest = {
  version: "apr-pronte-da-fare-r104-manifest-v1",
  authorizationId: "user-2026-09-10-pronte-da-fare-plus-four-moved-draft-only",
  authorizedAt: new Date().toISOString(),
  mode: "real_enea_draft_only",
  source: { crmResponseSha256: sha256(raw), queriedStages: ["pronte_da_fare", "recensione"], totalRows: rows.length },
  selection: {
    total: cases.length,
    groups: {
      pronte_da_fare: cases.filter((item) => item.stage === "pronte_da_fare").length,
      moved_to_recensione: cases.filter((item) => item.stage === "recensione").length,
    },
    allowedStages: ["pronte_da_fare", "recensione"],
    excludedCustomerKeys: excluded.filter((item) => item.reasons.includes("permanent_customer_exclusion")).map((item) => slug(item.displayName)),
    exclusionPolicy: ["unsupported_product", "synthetic_test_name", "permanent_customer_exclusion"],
    inBatchEarlyRoutingPolicy: ["permanent_supplier_exclusion"],
    excluded,
  },
  safety: { draftOnly: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, priorDraftPolicy: "fresh_generation_only" },
  cases,
};
mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
const temporary = `${outputPath}.tmp-${process.pid}`;
writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
renameSync(temporary, outputPath);
process.stdout.write(`${JSON.stringify({ outputPath, sha256: sha256(readFileSync(outputPath)), included: cases.length, excluded: excluded.length }, null, 2)}\n`);
