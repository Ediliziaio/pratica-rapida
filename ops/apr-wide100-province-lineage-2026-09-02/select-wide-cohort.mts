#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const seed = "apr-wide100-province-lineage-2026-09-02-v2";
const target = 100;
const operationDir = path.resolve("ops/apr-wide100-province-lineage-2026-09-02");
const authRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const normalized = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
const keyOf = (value: string) => normalized(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Module = "infissi" | "screening";
type Stage = "archiviate" | "gestionale" | "recensione";
type Complexity = "simple" | "medium" | "complex";
type Row = Record<string, any>;
type Candidate = {
  practiceId: string;
  customerKey: string;
  displayName: string;
  stage: Stage;
  stageName: string;
  module: Module;
  productEvidence: string;
  reseller: string;
  invoiceCount: number;
  complexity: Complexity;
};

function oneRelation(value: unknown): Row | null {
  if (Array.isArray(value)) return value.length === 1 && value[0] && typeof value[0] === "object" ? value[0] : null;
  return value && typeof value === "object" ? value as Row : null;
}
function classifyProduct(value: unknown): Module | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (/(?:infiss|serrament|finestre?\b)/i.test(value)) return "infissi";
  if (/(?:schermatur|tend|pergol|zanzar|cristal|persian|avvolgibil)/i.test(value)) return "screening";
  return null;
}
function classifyComplexity(invoiceCount: number): Complexity {
  return invoiceCount <= 1 ? "simple" : invoiceCount <= 3 ? "medium" : "complex";
}
function admittedStage(relation: Row | null): { stage: Stage; name: string } | null {
  if (!relation) return null;
  const type = normalized(relation.stage_type).replace(/\s+/g, "_") as Stage;
  const name = String(relation.name ?? "").trim();
  if (type === "archiviate") return { stage: type, name: name || "Archiviate" };
  if (type === "recensione") return { stage: type, name: name || "Recensione" };
  if (type === "gestionale" && normalized(name) === "da inserire su excel") return { stage: type, name };
  return null;
}

const auth = new PersistentAprCrmAuth(authRoot);
const config = JSON.parse(readFileSync(path.join(authRoot, "crm-auth", "public-auth-config.json"), "utf8"));
auth.configure(config.supabaseOrigin, config.publishableKey);
await auth.maintainSession();
const params = new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,prodotto_installato,fatture_urls,updated_at,pipeline_stages!inner(name,stage_type),companies:reseller_id(ragione_sociale)",
  brand: "eq.enea",
  "pipeline_stages.stage_type": "in.(archiviate,gestionale,recensione)",
  order: "updated_at.desc",
  limit: "1000",
});
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
const body = await response.text();
if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) {
  throw new Error(`wide_selection_crm_http_${response.status}:${sha256(body)}`);
}
const rows = JSON.parse(body) as Row[];
if (!Array.isArray(rows)) throw new Error("wide_selection_crm_response_invalid");

const excluded = { beatriceCiotta: 0, vans: 0, erremme: 0, overthemolSamueleBeretta: 0, daInserireSuExcel: 0, nicolettaGarbarino: 0, vittorioPaolinelli: 0 };
const samueleBerettaCandidates: Array<{ practiceId: string; stage: string; product: string; reseller: string }> = [];
const filteredByStage = { archiviate: 0, gestionale: 0, recensione: 0 };
const eligible: Candidate[] = [];
for (const row of rows) {
  const stage = admittedStage(oneRelation(row.pipeline_stages));
  if (!stage) continue;
  filteredByStage[stage.stage] += 1;
  const displayName = `${String(row.cliente_nome ?? "").trim()} ${String(row.cliente_cognome ?? "").trim()}`.trim().replace(/\s+/g, " ");
  const baseKey = keyOf(displayName);
  const reseller = String(oneRelation(row.companies)?.ragione_sociale ?? "").trim();
  const resellerNorm = normalized(reseller);
  if (baseKey === "samuele-beretta") samueleBerettaCandidates.push({ practiceId: String(row.id ?? ""), stage: stage.stage, product: String(row.prodotto_installato ?? ""), reseller });
  if (stage.stage === "gestionale") { excluded.daInserireSuExcel += 1; continue; }
  if (baseKey === "nicoletta-garbarino") { excluded.nicolettaGarbarino += 1; continue; }
  if (baseKey === "vittorio-paolinelli") { excluded.vittorioPaolinelli += 1; continue; }
  if (baseKey === "beatrice-ciotta") { excluded.beatriceCiotta += 1; continue; }
  if (resellerNorm.includes("vans")) { excluded.vans += 1; continue; }
  if (resellerNorm.includes("erremme")) { excluded.erremme += 1; continue; }
  // L'override richiesto identifica Overthemol come la pratica di Samuele
  // Beretta in Recensione; eventuali altre pratiche reali omonime restano
  // eleggibili, perché l'utente ha vietato esclusioni ulteriori.
  if (baseKey === "samuele-beretta" && stage.stage === "recensione" && resellerNorm.includes("overthemol")) { excluded.overthemolSamueleBeretta += 1; continue; }
  const module = classifyProduct(row.prodotto_installato);
  const practiceId = typeof row.id === "string" ? row.id.toLowerCase() : "";
  if (!module || !displayName || !baseKey || !/^[a-f0-9-]{36}$/.test(practiceId)) continue;
  const invoiceCount = Array.isArray(row.fatture_urls) ? row.fatture_urls.filter((item: unknown) => typeof item === "string" && item.trim()).length : 0;
  eligible.push({ practiceId, customerKey: baseKey, displayName, stage: stage.stage, stageName: stage.name, module, productEvidence: String(row.prodotto_installato).trim().replace(/\s+/g, " "), reseller, invoiceCount, complexity: classifyComplexity(invoiceCount) });
}

const actualTarget = Math.min(target, eligible.length);
const strata = new Map<string, Candidate[]>();
for (const candidate of eligible) {
  const key = `${candidate.stage}|${candidate.module}|${candidate.complexity}`;
  const bucket = strata.get(key) ?? [];
  bucket.push(candidate);
  strata.set(key, bucket);
}
const allocation = [...strata].map(([key, items]) => {
  const exact = actualTarget * items.length / eligible.length;
  return { key, items, quota: Math.floor(exact), remainder: exact - Math.floor(exact) };
});
let unallocated = actualTarget - allocation.reduce((sum, item) => sum + item.quota, 0);
for (const item of [...allocation].sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key))) {
  if (unallocated <= 0) break;
  if (item.quota < item.items.length) { item.quota += 1; unallocated -= 1; }
}
const selected = allocation.flatMap(({ key, items, quota }) => [...items]
  .sort((a, b) => sha256(`${seed}:${key}:${a.practiceId}`).localeCompare(sha256(`${seed}:${key}:${b.practiceId}`)))
  .slice(0, quota));
selected.sort((a, b) => sha256(`${seed}:queue:${a.practiceId}`).localeCompare(sha256(`${seed}:queue:${b.practiceId}`)));

const keyCounts = new Map<string, number>();
const cases = selected.map((candidate, index) => {
  const duplicateIndex = keyCounts.get(candidate.customerKey) ?? 0;
  keyCounts.set(candidate.customerKey, duplicateIndex + 1);
  return {
    cohort: index + 1,
    ...candidate,
    customerKey: duplicateIndex === 0 ? candidate.customerKey : `${candidate.customerKey}-${candidate.practiceId.slice(0, 8)}`,
    historicalRetest: true,
  };
});
const countBy = (items: Candidate[], field: "stage" | "module" | "complexity") => Object.fromEntries([...new Set(items.map((item) => item[field]))].sort().map((value) => [value, items.filter((item) => item[field] === value).length]));
const observedAt = new Date().toISOString();
const evidence = {
  version: "apr-wide100-selection-evidence-v1",
  observedAt,
  source: { endpoint: "/rest/v1/enea_practices_public", method: "GET", responseSha256: sha256(body), returnedRows: rows.length },
  authorizationId: "user-2026-09-02-wide-infissi-screening-single-run-v2",
  sourceStages: ["Archiviate", "Da inserire su Excel", "Recensione"],
  allowedStages: ["Archiviate", "Recensione"],
  allowedModules: ["Infissi", "Schermature solari"],
  exclusionsAppliedExactly: ["Beatrice Ciotta", "rivenditore Vans", "rivenditore Erremme", "Overthemol / Samuele Beretta", "fase Da inserire su Excel per questo test", "Nicoletta Garbarino", "Vittorio Paolinelli"],
  excluded,
  samueleBerettaCandidates,
  filteredByStage,
  eligibleCount: eligible.length,
  targetCount: target,
  selectedCount: cases.length,
  selectionSeed: seed,
  selectionSeedSha256: sha256(seed),
  selectionMethod: "seeded SHA-256 proportional stratification by CRM stage, module and invoice-count complexity; largest-remainder allocation; no additional exclusions",
  eligibleDistribution: { stage: countBy(eligible, "stage"), module: countBy(eligible, "module"), complexity: countBy(eligible, "complexity") },
  selectedDistribution: { stage: countBy(selected, "stage"), module: countBy(selected, "module"), complexity: countBy(selected, "complexity") },
  selectedPracticeIdsSha256: sha256(JSON.stringify(cases.map((item) => item.practiceId).sort())),
  externalActionAllowed: false,
  mutationAllowed: false,
};
const manifest = {
  version: "apr-wide100-province-lineage-manifest-v2",
  authorizationId: evidence.authorizationId,
  authorizedAt: "2026-09-02T00:00:00.000Z",
  mode: "real_enea_draft_only",
  safety: { draftOnly: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, priorDraftPolicy: "preserve_and_ignore_for_new_test_draft" },
  selection: {
    ...evidence,
    total: cases.length,
    allowedStages: ["archiviate", "recensione"],
    excludedCustomerKeys: ["beatrice-ciotta", "nicoletta-garbarino", "vittorio-paolinelli", "samuele-beretta"],
    source: undefined,
    excluded: undefined,
    filteredByStage: undefined,
    externalActionAllowed: undefined,
    mutationAllowed: undefined,
  },
  cases,
};
mkdirSync(operationDir, { recursive: true });
writeFileSync(path.join(operationDir, "selection-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
writeFileSync(path.join(operationDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ eligible: eligible.length, selected: cases.length, excluded, samueleBerettaCandidates, distributions: evidence.selectedDistribution, responseSha256: evidence.source.responseSha256 }, null, 2)}\n`);
