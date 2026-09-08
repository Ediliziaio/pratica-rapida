import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const sourceRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const outputRoot = path.join(sourceRoot, "ops/apr-current-workable-batch-2026-09-08");
const originalManifestPath = path.join(sourceRoot, "ops/apr-wide100-province-lineage-2026-09-02/manifest.json");
const replayPath = path.join(sourceRoot, "ops/apr-wide100-local-replay-r85-2026-09-07/report.json");
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
const originalBytes = readFileSync(originalManifestPath);
const original = JSON.parse(originalBytes.toString("utf8"));
const replay = JSON.parse(readFileSync(replayPath, "utf8"));
const replayByKey = new Map(replay.payload.results.map((item: any) => [item.customerKey, item]));
const confirmedNonWorkableCodes = new Set([
  "customer_form_missing",
  "original_invoice_missing_or_unavailable",
  "completion_over_90_days_operator_required",
  "permanent_supplier_automation_exclusion",
  "permanent_customer_automation_exclusion",
  "screening_primary_measurements_missing",
]);
// Roberta Di Cesare usa il modulo cartaceo Linea Sole: l'assenza del form
// digitale non e' una conferma di non lavorabilita' e resta nel collaudo.
const retainedPaperFormCases = new Set(["roberta-di-cesare"]);
const originalWorkable = original.cases.filter((item: any) => {
  if (retainedPaperFormCases.has(item.customerKey)) return true;
  const result: any = replayByKey.get(item.customerKey);
  return !result?.blockerCodes?.some((code: string) => confirmedNonWorkableCodes.has(code));
}).map((item: any) => ({ ...item, group: "original_workable", groupOrder: 1, historicalRetest: true }));
if (originalWorkable.length !== 67) throw new Error(`original_workable_count_invalid:${originalWorkable.length}`);

const auth = new PersistentAprCrmAuth(path.join(runtimeRoot, "state"));
await auth.maintainSession();
const params = new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,prodotto_installato,fornitore,updated_at,pipeline_stages!inner(stage_type),companies:reseller_id(ragione_sociale)",
  brand: "eq.enea",
  archived_at: "is.null",
  "pipeline_stages.stage_type": "in.(pronte_da_fare,gestionale,recensione)",
  order: "updated_at.asc",
  limit: "1000",
});
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
const raw = await response.text();
if (!response.ok) throw new Error(`crm_http_${response.status}`);
const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
let historyRaw = "";
try {
  historyRaw = execFileSync("rg", ["-o", "--no-filename", "\"practiceId\"\\s*:\\s*\"[0-9a-fA-F-]{36}\"", path.join(runtimeRoot, "cohorts"), path.join(runtimeRoot, "runs")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch (error: any) {
  if (error?.status !== 1) throw error;
}
const tested = new Set([...historyRaw.matchAll(/[0-9a-fA-F-]{36}/g)].map((match) => match[0].toLowerCase()));
const originalIds = new Set(original.cases.map((item: any) => String(item.practiceId).toLowerCase()));
const candidates = rows.map((row) => {
  const id = String(row.id ?? "").toLowerCase();
  const displayName = `${row.cliente_nome ?? ""} ${row.cliente_cognome ?? ""}`.trim();
  const vendors = [norm(row.fornitore), ...companyNames(row.companies)];
  return { row, id, displayName, customerKey: slug(displayName), stage: stageTypes(row.pipeline_stages)[0], module: classify(row.prodotto_installato), vendors };
}).filter((item) => /^[0-9a-f-]{36}$/.test(item.id)
  && ["pronte_da_fare", "gestionale", "recensione"].includes(item.stage)
  && item.module
  && !/(^| )(test|prova|claude|hhhhh)( |$)/.test(norm(item.displayName))
  && !item.vendors.some((value) => /(erre emme|rm legno|vans|overthemol)/.test(value))
  && norm(item.displayName) !== "beatrice ciotta"
  && !tested.has(item.id)
  && !originalIds.has(item.id));
const linea = candidates.filter((item) => item.vendors.some((value) => /linea sole potito/.test(value)));
const standard = candidates.filter((item) => !linea.includes(item));
const toCase = (item: typeof candidates[number], group: string, groupOrder: number) => ({
  practiceId: item.id,
  customerKey: item.customerKey,
  displayName: item.displayName,
  stage: item.stage,
  stageName: item.stage,
  module: item.module,
  productEvidence: String(item.row.prodotto_installato ?? ""),
  reseller: item.vendors.filter(Boolean).join(" | "),
  invoiceCount: null,
  complexity: "unobserved_new_case",
  historicalRetest: false,
  group,
  groupOrder,
});
const cases = [
  ...originalWorkable,
  ...standard.map((item) => toCase(item, "new_pipeline", 2)),
  ...linea.map((item) => toCase(item, "linea_sole_potito", 3)),
];
if (new Set(cases.map((item: any) => item.practiceId)).size !== cases.length) throw new Error("combined_manifest_duplicate_practice_id");
if (new Set(cases.map((item: any) => item.customerKey)).size !== cases.length) throw new Error("combined_manifest_duplicate_customer_key");
const manifest = {
  version: "apr-current-workable-batch-manifest-v1",
  authorizationId: "user-2026-09-08-current-workable-plus-new-draft-only",
  authorizedAt: new Date().toISOString(),
  mode: "real_enea_draft_only",
  source: {
    originalManifestPath,
    originalManifestSha256: sha256(originalBytes),
    localReplayPath: replayPath,
    localReplaySha256: sha256(readFileSync(replayPath)),
    crmResponseSha256: sha256(raw),
  },
  selection: {
    total: cases.length,
    groups: { original_workable: originalWorkable.length, new_pipeline: standard.length, linea_sole_potito: linea.length },
    allowedStages: ["archiviate", "recensione", "gestionale", "pronte_da_fare"],
    excludedCustomerKeys: [...(original.selection?.excludedCustomerKeys ?? []), "beatrice-ciotta", "samuele-beretta"],
    originalExclusionCodes: [...confirmedNonWorkableCodes],
    retainedPaperFormCases: [...retainedPaperFormCases],
    newCaseRule: "available_in_requested_pipelines_and_never_present_in_persisted_apr_history",
  },
  safety: { draftOnly: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, priorDraftPolicy: "fresh_generation_only" },
  cases,
};
mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
const temporary = `${outputPath}.tmp-${process.pid}`;
writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
renameSync(temporary, outputPath);
process.stdout.write(`${JSON.stringify({ outputPath, sha256: sha256(readFileSync(outputPath)), total: cases.length, groups: manifest.selection.groups }, null, 2)}\n`);
