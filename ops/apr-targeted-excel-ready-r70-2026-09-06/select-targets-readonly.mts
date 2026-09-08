#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const sourceRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const operationDir = path.join(sourceRoot, "ops/apr-targeted-excel-ready-r70-2026-09-06");
const authRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state";
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const normalize = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
const keyOf = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const one = (value: any) => Array.isArray(value) ? value[0] ?? null : value && typeof value === "object" ? value : null;
const moduleOf = (value: unknown) => /(?:infiss|serrament|finestre?\b)/i.test(String(value ?? "")) ? "infissi" : /(?:schermatur|tend|pergol|zanzar|cristal|persian|avvolgibil)/i.test(String(value ?? "")) ? "screening" : null;

const auth = new PersistentAprCrmAuth(authRoot);
const config = JSON.parse(readFileSync(path.join(authRoot, "crm-auth/public-auth-config.json"), "utf8"));
auth.configure(config.supabaseOrigin, config.publishableKey);
await auth.maintainSession();
const params = new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,prodotto_installato,fatture_urls,created_at,updated_at,fornitore,pipeline_stages!inner(name,stage_type),companies:reseller_id(ragione_sociale)",
  brand: "eq.enea",
  order: "updated_at.desc",
  limit: "1000",
});
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
const body = await response.text();
if (!response.ok) throw new Error(`crm_http_${response.status}:${sha256(body)}`);
const rows = JSON.parse(body);
if (!Array.isArray(rows)) throw new Error("crm_response_invalid");

const prepared = rows.map((row: any) => {
  const relation = one(row.pipeline_stages);
  const displayName = `${String(row.cliente_nome ?? "").trim()} ${String(row.cliente_cognome ?? "").trim()}`.trim().replace(/\s+/g, " ");
  const stageName = String(relation?.name ?? "").trim();
  const stage = normalize(relation?.stage_type).replace(/\s+/g, "_");
  const reseller = String(one(row.companies)?.ragione_sociale ?? row.fornitore ?? "").trim();
  return {
    practiceId: row.id,
    customerKey: keyOf(displayName),
    displayName,
    stage,
    stageName,
    module: moduleOf(row.prodotto_installato),
    productEvidence: String(row.prodotto_installato ?? "").trim(),
    reseller,
    invoiceCount: Array.isArray(row.fatture_urls) ? row.fatture_urls.length : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
});

const excel = prepared.filter((item: any) => normalize(item.stageName) === "da inserire su excel");
const readyPool = prepared.filter((item: any) => normalize(item.stageName) === "pronte da fare");
const targets = [
  { label: "Dragotta", match: (name: string) => normalize(name).split(" ").includes("dragotta") },
  { label: "Marchisio", match: (name: string) => normalize(name).split(" ").includes("marchisio") },
  { label: "Massimo Grimaldi", match: (name: string) => normalize(name) === "massimo grimaldi" },
  { label: "Aldo Gebbia", match: (name: string) => normalize(name) === "aldo gebbia" },
];
const ready: any[] = [];
for (const target of targets) {
  const matches = readyPool.filter((item: any) => target.match(item.displayName));
  if (matches.length !== 1) throw new Error(`target_${keyOf(target.label)}_cardinality_${matches.length}`);
  ready.push(matches[0]);
}
const selected = [...excel, ...ready];
if (!excel.length) throw new Error("excel_pipeline_empty");
if (new Set(selected.map((item: any) => item.practiceId)).size !== selected.length) throw new Error("duplicate_practice_identity");
const allowedStages = [...new Set(selected.map((item: any) => item.stage))];
const cases = selected.map((item: any, index: number) => ({ ...item, cohort: 3401 + index, generationMode: "fresh_generation" }));
const observedAt = new Date().toISOString();
const evidence = {
  version: "apr-targeted-excel-ready-r70-selection-evidence-v1",
  observedAt,
  responseSha256: sha256(body),
  returnedRows: rows.length,
  method: "Authenticated CRM GET only; every practice whose current stage name is exactly Da inserire su Excel, plus the four explicitly named practices whose current stage name is exactly Pronte da fare.",
  counts: { excel: excel.length, readyNamed: ready.length, total: cases.length },
  excel,
  ready,
  mutationAllowed: false,
};
const manifest = {
  version: "apr-targeted-excel-ready-r70-manifest-v1",
  experimentId: "apr-targeted-excel-ready-r70-20260906",
  authorizationId: "user-2026-09-06-targeted-excel-ready-draft-only",
  authorizedAt: observedAt,
  mode: "real_enea_draft_only",
  selection: { total: cases.length, allowedStages, excludedCustomerKeys: [], sourcePipelines: ["Da inserire su Excel", "Pronte da fare"], readyNamedTargets: targets.map((item) => item.label) },
  cases,
  executionPolicy: { sequential: true, noMaterialProgressMs: 420000, absolutePerCaseMs: 1500000, isolateAndContinue: true, diagnoseDuringRun: false, repairDuringRun: false },
  safety: { draftOnly: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, priorDraftPolicy: "fresh_generation_only" },
};
mkdirSync(operationDir, { recursive: true });
const evidenceText = `${JSON.stringify(evidence, null, 2)}\n`;
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(path.join(operationDir, "selection-evidence.json"), evidenceText);
writeFileSync(path.join(operationDir, "manifest.json"), manifestText);
process.stdout.write(`${JSON.stringify({ observedAt, counts: evidence.counts, selected: cases.map(({ displayName, stageName, cohort }) => ({ displayName, stageName, cohort })), responseSha256: evidence.responseSha256, manifestSha256: sha256(manifestText) }, null, 2)}\n`);
